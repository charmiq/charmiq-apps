import { BehaviorSubject, type Observable } from 'rxjs';

import type { AppStateAPI } from '../../../shared/charmiq';

import { DesignError, DesignStore, displayName, type Saved } from '../../brick-shared/designs';
import type { Design, Drive, Folder } from '../../brick-shared/drive';

import { readFilmFile, writeFilmFile } from './film-file';

// the film's files: a film saved as one design in the Drive (SEE: film-file.ts), and
// opened back. Stop Motion is between the two parts: it reads and writes the main
// studio's build (the set) and the code block's scene, and the family's design store
// reads and writes the Drive. The film knows the file it was last saved as or opened
// from (the document itself: a save without a name writes it wherever it is), and
// whether its scene or its set (as it reads, an equal text no change) has changed
// since. A new film or an opened one never discards changes unasked: each reads the
// film as it stands last before changing it, and changes nothing when the scene
// cannot be written. Saving, opening and starting a film run one at a time, each after
// the last settles, so none takes the film as another leaves it part-way
// ********************************************************************************
// == Constants ===================================================================
/** how the films are named in the family's design store, and the command listing them */
const FILM_WORDS = { noun: 'film', listing: 'listFilms' } as const;

/** the scene a new film starts with: it runs, and says where to go next */
export const STARTER_SCENE = [
  '// A new film. Cast actors (the build\'s components, or catalog parts), key them over',
  '// time, and cut the camera between shots: How It Works says how.',
  'scene({ title: \'Untitled film\', fps: 24, length: 5 })',
  '',
  'camera.at(0, { orbit: { angle: 30, distance: 40, height: 30 }, target: { x: 0, z: 0, height: 4 } })',
  '',
].join('\n');

// == Types =======================================================================
/** the film's two parts, as Stop Motion reaches them */
export type FilmParts = Readonly<{
  /** the main studio's build as LDraw text */
  set: () => Promise<string>;
  /** puts LDraw text in the main studio's build */
  setSet: (ldraw: string) => Promise<void>;
  /** empties the main studio's build */
  clearSet: () => Promise<void>;
  /** the scene's code as the code block holds it, or none */
  scene: () => string | null;
  /** refuses, saying why, when the scene cannot be written (no code editor) */
  checkScene: () => Promise<void>;
  /** puts code in the code block's scene tab */
  setScene: (code: string) => Promise<void>;
}>;

/** the film's file: its name once saved or opened, and whether the film changed since */
export type FileState = Readonly<{ name?: string; changed: boolean; }>;

/** what the film was when last saved or opened */
type Kept = Readonly<{ set: string; scene: string; }>;
/** the file the film was last saved as or opened from: its document, and its folder
 *  when known */
type Own = Readonly<{ design: Design; folder?: Folder; }>;

/** a new film or an opened one refused, the film having unsaved changes */
export class UnsavedChanges extends DesignError {}

// == Class =======================================================================
export class Films {
  /** the family's design store, with the films' words */
  public readonly store: DesignStore;
  private own: Own | undefined;
  private kept: Kept | undefined;
  private readonly file = new BehaviorSubject<FileState>({ changed: true }/*never saved*/);
  /** bumped by each look and each save, open or clear: an older look tells nothing */
  private looks = 0;
  /** the last file operation (save, open, clear), settled or not */
  private running: Promise<unknown> = Promise.resolve();

  public constructor(drive: Drive, appState: AppStateAPI, private readonly parts: FilmParts) {
    this.store = new DesignStore(drive, appState, FILM_WORDS);
  }

  public get state(): FileState { return this.file.value; }
  public get state$(): Observable<FileState> { return this.file.asObservable(); }

  // == Save & Open ===============================================================
  /** saves the film: under `name` in the folder, or over its own file wherever it is.
   *  A name of another film is refused (DesignExists) unless `replace` says to write
   *  over it. An edit made while the Drive writes is told unsaved */
  public save(name?: string, replace = false): Promise<Saved> { return this.exclusive(() => this.saveNow(name, replace)); }
  private async saveNow(name: string | undefined, replace: boolean): Promise<Saved> {
    const own = this.own;
    const write = (name !== undefined) ? (text: () => Promise<string>) => this.store.write(name, replace, text, own?.design)
      : own ? (text: () => Promise<string>) => this.store.rewrite(own.design, text, own.folder)
      : undefined;
    if(!write) throw new DesignError('Name the film to save it.');
    const scene = this.parts.scene();
    if(scene === null) throw new DesignError('The code block holds no scene to save: add a code editor with a scene.js tab.');
    let set = '';
    const saved = await write(async () => { set = await this.parts.set().catch(refused); return writeFilmFile(set, scene); });
    this.keep({ design: saved.design, ...(saved.folder ? { folder: saved.folder } : {}) }, { set, scene });
    await this.recheck()/*the film as it stands now*/;
    return saved;
  }

  /** opens a film: its set into the studio, its scene into the code block; a plain
   *  design's set alone, the scene kept. Refused while the film has unsaved changes
   *  unless `discard` says to lose them, and before the set changes when the scene
   *  cannot be written. A scene write refused once the set is open leaves the film
   *  changed, and says so */
  public open(design: Design | string, discard = false): Promise<Readonly<{ name: string; scene: boolean; }>> { return this.exclusive(() => this.openNow(design, discard)); }
  private async openNow(design: Design | string, discard: boolean): Promise<Readonly<{ name: string; scene: boolean; }>> {
    const { design: found, text, folder } = await this.store.read(design);
    const film = readFilmFile(text);
    if(film.scene !== undefined) await this.parts.checkScene().catch(refused);
    await this.refuseUnsaved(discard)/*last: the film changes next*/;
    const name = displayName(found);
    const scene = film.scene;
    const failure = await this.change(() => this.parts.setSet(film.set), (scene !== undefined) ? () => this.parts.setScene(scene) : undefined,
      { design: found, ...(folder ? { folder } : {}) }, { set: film.set, scene: scene ?? this.parts.scene() ?? '' });
    if(failure) throw new DesignError(`The set of "${name}" is open, but its scene could not be written: ${failure.message}`);
    return { name, scene: film.scene !== undefined };
  }

  /** a new film: the set cleared and the starter scene, the film untitled. Refused
   *  as a film is opened (SEE: open) */
  public clear(discard = false): Promise<void> { return this.exclusive(() => this.clearNow(discard)); }
  private async clearNow(discard: boolean): Promise<void> {
    await this.parts.checkScene().catch(refused);
    await this.refuseUnsaved(discard)/*last: the film changes next*/;
    const failure = await this.change(() => this.parts.clearSet(), () => this.parts.setScene(STARTER_SCENE), undefined, { set: '', scene: STARTER_SCENE });
    if(failure) throw new DesignError(`The set is cleared, but the new scene could not be written: ${failure.message}`);
  }

  // == Changes ===================================================================
  /** looks again whether the film changed (SEE: unsaved) */
  public async recheck(): Promise<void> { await this.unsaved(); }

  /** whether the film has changed since it was saved or opened, read as it stands
   *  (SEE: differs), and told unless a newer look or a save came first. A film never
   *  saved has, and so has one whose set cannot be read */
  private async unsaved(): Promise<boolean> {
    const look = ++this.looks;
    const kept = this.kept;
    const changed = await this.differs(kept);
    if((look === this.looks) && (this.kept === kept) && (changed !== this.file.value.changed)) this.file.next({ ...this.file.value, changed });
    return changed;
  }

  // == Internal ==================================================================
  /** runs a file operation once the last one has settled */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.running.then(work);
    this.running = next.catch(() => undefined/*settled*/);
    return next;
  }

  /** changes the film's set (a refusal changes nothing), then its scene, the film
   *  then kept as `own` and `kept` (its set as the studio reads it back); the failure
   *  of the scene's write, the film then changed */
  private async change(setSet: () => Promise<void>, setScene: (() => Promise<void>) | undefined, own: Own | undefined, kept: Kept): Promise<Error | undefined> {
    this.looks++/*the film is changing: a look meanwhile tells nothing*/;
    await setSet().catch(refused);
    const failure = await setScene?.().then(() => undefined, (error: unknown) => (error instanceof Error) ? error : new Error(String(error)));
    this.keep(own, { set: await this.parts.set().catch(() => kept.set), scene: kept.scene });
    if(failure) await this.recheck();
    return failure;
  }

  /** the film as saved or opened, unchanged */
  private keep(own: Own | undefined, kept: Kept): void {
    this.looks++;
    this.own = own;
    this.kept = kept;
    this.file.next({ ...(own ? { name: displayName(own.design) } : {}), changed: false });
  }

  /** whether the film differs from `kept`: its set, then its scene, read with no wait
   *  after it (an editor's change arrives as a message, never between it and the
   *  change that follows) */
  private async differs(kept: Kept | undefined): Promise<boolean> {
    if(!kept) return true;
    let set: string;
    try { set = await this.parts.set(); }
    catch { return true/*the set cannot be read: nothing is lost unasked*/; }
    return (set !== kept.set) || (this.parts.scene() !== kept.scene);
  }

  /** refuses to lose unsaved changes unless told to */
  private async refuseUnsaved(discard: boolean): Promise<void> {
    if(discard || !(await this.unsaved())) return;
    const name = this.file.value.name;
    throw new UnsavedChanges(`${(name !== undefined) ? `"${name}"` : 'The film'} has unsaved changes: save it first, or discard them.`);
  }
}

// == Util ========================================================================
/** a part's refusal (the studio's, the code editor's) as the film's own: its message
 *  as it is, never read as the Drive's */
const refused = (error: unknown): never => {
  throw (error instanceof DesignError) ? error : new DesignError((error instanceof Error) ? error.message : String(error));
};
