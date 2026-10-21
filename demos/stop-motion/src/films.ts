import { BehaviorSubject, type Observable } from 'rxjs';

import type { DocumentState } from '../../brick-shared/app-state';
import { DesignError, DesignStore, displayName, type Saved } from '../../brick-shared/designs';
import type { Design, Drive, Folder } from '../../brick-shared/drive';

import type { Director } from './director';
import { readFilmFile, writeFilmFile } from './film-file';
import type { SceneSource } from './scene-source';
import { messageOf, type Studios } from './studios';

// the film's files: a film saved as one design in the Drive (SEE: film-file.ts), and
// opened back. Stop Motion is between the two parts: it reads and writes the main
// studio's build (the set) and the code block's scene, and the family's design store
// reads and writes the Drive. The film knows the file it was last saved as or opened
// from (the document itself: a save without a name writes it wherever it is), and
// whether its scene or its set (as it reads, an equal text no change) has changed
// since. A new film or an opened one never discards changes unasked: each reads the
// film as it stands last before changing it, and changes nothing when the scene
// cannot be written. Saving, opening and starting a film run one at a time, each after
// the last settles, so none takes the film as another leaves it part-way. The file and a
// fingerprint of the film as kept live in the document's app state, so a reload, or
// another viewer of the document, knows the film's file and whether it changed since
// (the file is the document's, shared: a plain save in any viewer writes over it);
// each operation keeps them there before the next runs, the first reads them, and a
// state naming no film's file forgets it
// ********************************************************************************
// == Constants ===================================================================
/** how the films are named in the family's design store, and the command listing them */
const FILM_WORDS = { noun: 'film', listing: 'listFilms' } as const;
/** the app state's entry for the film: its file once saved or opened, and the
 *  fingerprint of the film as kept (SEE: fingerprintOf) */
const FILM_STATE = 'film';

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
  /** puts LDraw text in the main studio's build, only while it holds `expected` when
   *  given */
  setSet: (ldraw: string, expected?: string) => Promise<void>;
  /** empties the main studio's build, only while it holds `expected` when given */
  clearSet: (expected?: string) => Promise<void>;
  /** the scene's code as the code block holds it, or none */
  scene: () => string | null;
  /** refuses, saying why, when the scene cannot be written (no code editor) */
  checkScene: () => Promise<void>;
  /** puts code in the code block's scene tab, only while it holds `expected` when
   *  given (null: while the code block holds no scene) */
  setScene: (code: string, expected?: string | null) => Promise<void>;
}>;

/** the film's parts over the main studio and the code block's scene: the set written
 *  or cleared only while the studio holds `expected`, then staged anew */
export const filmPartsOf = (studios: Pick<Studios, 'readSet' | 'writeSet' | 'clearSet'>, director: Pick<Director, 'restage'>, source: Pick<SceneSource, 'code' | 'check' | 'write'>): FilmParts => ({
  set: () => studios.readSet(),
  setSet: async (ldraw, expected) => { await studios.writeSet(ldraw, expected); void director.restage(); },
  clearSet: async expected => { await studios.clearSet(expected); void director.restage(); },
  scene: () => source.code,
  checkScene: () => source.check(),
  setScene: (code, expected) => source.write(code, expected),
});

/** the film's file: its name once saved or opened, and whether the film changed since */
export type FileState = Readonly<{ name?: string; changed: boolean; }>;

/** what the film was when last saved or opened */
type Kept = Readonly<{ set: string; scene: string | null; }>;
/** the film as read last before it changes: its set (none when it cannot be read) and
 *  its scene, each replaced only while it still holds what was read */
type Read = Readonly<{ set?: string; scene: string | null; }>;
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
  /** the fingerprint of the film as last saved or opened (SEE: fingerprintOf) */
  private kept: string | undefined;
  private readonly file = new BehaviorSubject<FileState>({ changed: true }/*never saved*/);
  /** bumped by each look and each save, open or clear: an older look tells nothing */
  private looks = 0;
  /** the last file operation (reading the app state, save, open, clear), settled or not */
  private running: Promise<unknown> = Promise.resolve();

  /** follows the film's file the app state names, from the first: a save or an open in
   *  another viewer becomes this one's */
  public constructor(drive: Drive, private readonly documentState: DocumentState, private readonly parts: FilmParts) {
    this.store = new DesignStore(drive, documentState, FILM_WORDS);
    this.documentState.entry$(FILM_STATE).subscribe(entry => this.adopt(entry));
  }

  /** reads the film's file from the document's app state, before any file operation
   *  runs */
  public init(): Promise<void> {
    return this.exclusive(async () => {
      try { await this.documentState.init(); }
      catch(error) { throw new DesignError(`The film's file could not be read from the document: ${messageOf(error)}`); }
    });
  }

  public get state(): FileState { return this.file.value; }
  public get state$(): Observable<FileState> { return this.file.asObservable(); }

  // == Save & Open ===============================================================
  /** saves the film: under `name` in the folder, or over its own file wherever it is.
   *  A name of another film is refused (DesignExists) unless `replace` says to write
   *  over it. An edit made while the Drive writes is told unsaved */
  public save(name?: string, replace = false): Promise<Saved> { return this.exclusive(() => this.saveNow(name, replace)); }
  /** saves the film over its own file once the app state has told it; none when the
   *  film has no file of its own (its name is asked for then) */
  public saveOver(): Promise<Saved | undefined> { return this.exclusive(() => this.own ? this.saveNow(undefined, false) : Promise.resolve(undefined)); }
  private async saveNow(name: string | undefined, replace: boolean): Promise<Saved> {
    const own = this.own;
    const write = (name !== undefined) ? (text: () => Promise<string>) => this.store.write(name, replace, text, own?.design)
      : own ? (text: () => Promise<string>) => this.store.rewrite(own.design, text, own.folder)
      : undefined;
    const unread = this.documentState.readError;
    if(!write) throw new DesignError((unread !== undefined) ? `The film's file could not be read from the document (${unread}): name the film to save it.` : 'Name the film to save it.');
    const scene = this.parts.scene();
    if(scene === null) throw new DesignError('The code block holds no scene to save: add a code editor with a scene.js tab.');
    let set = '';
    const saved = await write(async () => { set = await this.parts.set().catch(refused); return writeFilmFile(set, scene); });
    const unkept = await this.keep({ design: saved.design, ...(saved.folder ? { folder: saved.folder } : {}) }, { set, scene });
    await this.recheck()/*the film as it stands now*/;
    if(unkept !== undefined) throw new DesignError(`"${saved.name}" is saved, but the document could not keep it as the film's file: ${unkept}`);
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
    const read = await this.refuseUnsaved(discard)/*last: the film changes next*/;
    const name = displayName(found);
    const scene = film.scene;
    const { failure, unkept } = await this.change(() => this.parts.setSet(film.set, read.set), (scene !== undefined) ? () => this.parts.setScene(scene, read.scene) : undefined,
      { design: found, ...(folder ? { folder } : {}) }, { set: film.set, scene: scene ?? this.parts.scene() ?? '' });
    if(failure) throw new DesignError(`The set of "${name}" is open, but its scene could not be written: ${failure.message}`);
    if(unkept !== undefined) throw new DesignError(`"${name}" is open, but the document could not keep it as the film's file: ${unkept}`);
    return { name, scene: film.scene !== undefined };
  }

  /** a new film: the set cleared and the starter scene, the film untitled. Refused
   *  as a film is opened (SEE: open) */
  public clear(discard = false): Promise<void> { return this.exclusive(() => this.clearNow(discard)); }
  private async clearNow(discard: boolean): Promise<void> {
    await this.parts.checkScene().catch(refused);
    const read = await this.refuseUnsaved(discard)/*last: the film changes next*/;
    const { failure, unkept } = await this.change(() => this.parts.clearSet(read.set), () => this.parts.setScene(STARTER_SCENE, read.scene), undefined, { set: '', scene: STARTER_SCENE });
    if(failure) throw new DesignError(`The set is cleared, but the new scene could not be written: ${failure.message}`);
    if(unkept !== undefined) throw new DesignError(`The new film is started, but the document could not forget the last film's file: ${unkept} Name the film when you save it.`);
  }

  // == Changes ===================================================================
  /** looks again whether the film changed (SEE: unsaved) */
  public async recheck(): Promise<void> { await this.unsaved(); }

  /** whether the film has changed since it was saved or opened, read as it stands
   *  (SEE: differs), and told unless a newer look or a save came first. A film never
   *  saved has, and so has one whose set cannot be read */
  private async unsaved(): Promise<boolean> { return (await this.look()).changed; }

  /** whether the film has changed (SEE: unsaved), told as unsaved tells it, and the
   *  film as it was read */
  private async look(): Promise<Readonly<{ changed: boolean; } & Read>> {
    const look = ++this.looks;
    const kept = this.kept;
    const seen = await this.differs(kept);
    if((look === this.looks) && (this.kept === kept) && (seen.changed !== this.file.value.changed)) this.file.next({ ...this.file.value, changed: seen.changed });
    return seen;
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
   *  of the scene's write, the film then changed, and why the document could not keep
   *  the film's file (SEE: keep) */
  private async change(setSet: () => Promise<void>, setScene: (() => Promise<void>) | undefined, own: Own | undefined, kept: Kept): Promise<Readonly<{ failure?: Error; unkept?: string; }>> {
    this.looks++/*the film is changing: a look meanwhile tells nothing*/;
    await setSet().catch(async (error: unknown) => { await this.recheck()/*the studio's set as it stands*/; refused(error); });
    const failure = await setScene?.().then(() => undefined, (error: unknown) => (error instanceof Error) ? error : new Error(String(error)));
    const unkept = await this.keep(own, { set: await this.parts.set().catch(() => kept.set), scene: kept.scene });
    if(failure) await this.recheck();
    return { ...(failure ? { failure } : {}), ...((unkept !== undefined) ? { unkept } : {}) };
  }

  /** the film as saved or opened, unchanged, kept in the document's app state beside
   *  its every other entry; why the document could not keep it */
  private async keep(own: Own | undefined, kept: Kept): Promise<string | undefined> {
    const fingerprint = await fingerprintOf(kept);
    this.looks++;
    this.own = own;
    this.kept = fingerprint;
    this.file.next({ ...(own ? { name: displayName(own.design) } : {}), changed: false });
    const film = { ...(own ? { design: { fileName: own.design.fileName, uri: own.design.uri }, ...(own.folder ? { folder: own.folder } : {}) } : {}), kept: fingerprint };
    try { await this.documentState.write(FILM_STATE, film); return undefined; }
    catch(error) { return messageOf(error); }
  }

  /** takes the film's file and fingerprint from the app state's entry when they are not
   *  this viewer's already (its own write comes back unchanged), then looks again; an
   *  entry naming none forgets them, the film then never saved */
  private adopt(entry: unknown): void {
    const film = entryOf(entry);
    if((film?.kept === this.kept) && (film?.own?.design.uri === this.own?.design.uri)) return;
    this.looks++;
    this.own = film?.own;
    this.kept = film?.kept;
    this.file.next({ ...(film?.own ? { name: displayName(film.own.design) } : {}), changed: film ? this.file.value.changed : true });
    void this.recheck();
  }

  /** whether the film differs from `kept` (a film never kept does), and the film as
   *  read: the set, then the scene, read with no wait after it (an editor's change
   *  arrives as a message, never between it and the change that follows) */
  private async differs(kept: string | undefined): Promise<Readonly<{ changed: boolean; } & Read>> {
    let set: string;
    try { set = await this.parts.set(); }
    catch { return { changed: true, scene: this.parts.scene() }/*the set cannot be read: nothing is lost unasked*/; }
    const scene = this.parts.scene();
    const fingerprint = await fingerprintOf({ set, scene });
    const now = this.parts.scene();
    if(now !== scene) return { changed: true, set, scene: now }/*edited while its fingerprint was taken*/;
    return { changed: !kept || (fingerprint !== kept), set, scene };
  }

  /** refuses to lose unsaved changes unless told to; answers the film as it was read,
   *  its set replaced only while the studio still holds it and its scene only while
   *  the code block does (an edit landing in between refuses the change there, kept) */
  private async refuseUnsaved(discard: boolean): Promise<Read> {
    if(discard) {
      const set = await this.parts.set().catch(() => undefined/*no set to read: its write refuses on its own*/);
      return { ...((set !== undefined) ? { set } : {}), scene: this.parts.scene()/*with the set, before any wait*/ };
    } /* else -- asked: nothing changed since the film was kept */
    const { changed, set, scene } = await this.look();
    if(!changed) return { ...((set !== undefined) ? { set } : {}), scene };
    const name = this.file.value.name;
    throw new UnsavedChanges(`${(name !== undefined) ? `"${name}"` : 'The film'} has unsaved changes: save it first, or discard them.`);
  }
}

// == Util ========================================================================
/** a film's fingerprint: the SHA-256 of its set and scene, in hex */
const fingerprintOf = async ({ set, scene }: Kept): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([set, scene])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/** the film's entry in the app state, when well-formed */
const entryOf = (entry: unknown): Readonly<{ own?: Own; kept: string; }> | undefined => {
  const film = entry as Record<string, unknown> | undefined;
  if(!film || (typeof film.kept !== 'string')) return undefined;
  const design = film.design as Record<string, unknown> | undefined;
  if(!design) return { kept: film.kept };
  if((typeof design.fileName !== 'string') || (typeof design.uri !== 'string')) return undefined;
  const folder = film.folder as Record<string, unknown> | undefined;
  const known = folder && (typeof folder.name === 'string') ? { folder: { id: (typeof folder.id === 'string') ? folder.id : undefined, name: folder.name } } : {};
  return { own: { design: { fileName: design.fileName, uri: design.uri }, ...known }, kept: film.kept };
};
/** a part's refusal (the studio's, the code editor's) as the film's own: its message
 *  as it is, never read as the Drive's */
const refused = (error: unknown): never => {
  throw (error instanceof DesignError) ? error : new DesignError((error instanceof Error) ? error.message : String(error));
};
