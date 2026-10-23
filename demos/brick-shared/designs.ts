import type { DocumentState } from './app-state';
import { DESIGN_EXTENSION, DESIGNS, DRIVE_PAGE, type Design, type Drive, type DriveFile, type FileKind, type Folder, type FolderListing } from './drive';

// the Brick family's saved designs in the Drive: what a design's name may be, which
// folder designs go to, and saving and reading a design's LDraw text there. What the
// text holds (a build, a film) is the app's: every message calls a design by the app's
// word for it and names the app's command listing them. The app state is the folder's
// source of truth: the folder is the one it names (the top of the Drive when it names
// none), followed as it changes from anywhere
// ********************************************************************************
// == Constants ===================================================================
/** where designs go until another folder is chosen */
export const TOP_OF_DRIVE: Folder = { id: undefined, name: 'My Drive' };

// --------------------------------------------------------------------------------
/** the app state key that keeps the chosen folder */
const FOLDER_STATE = 'designFolder';
const MAX_NAME = 120/*characters*/;
/** the most designs a listing names (a folder's designs are read a page at a time) */
const MAX_LISTED = 500;

// == Types =======================================================================
/** a refused save or load; its message is User- and model-facing */
export class DesignError extends Error {}

/** a save refused because the folder already holds a design of that name */
export class DesignExists extends DesignError {
  public constructor(public readonly name: string, public readonly folder: Folder, noun: string) {
    super(`A ${noun} named "${name}" is already in ${folder.name}.`);
  }
}

/** what a save did: the design written, and its folder when known (a design reached
 *  by its uri is in a folder no listing named) */
/** a design saved: `changed` false when the Drive already held its text (nothing written) */
export type Saved = Readonly<{ name: string; design: Design; folder?: Folder; replaced: boolean; changed: boolean; }>;
/** a save in the folder */
export type SavedInFolder = Saved & Readonly<{ folder: Folder; }>;

/** how the app names a design (`design`, `film`, `sound`), the command listing them,
 *  and the verb a chooser picks one with (`Open`, unless named: `Add`) */
export type DesignWords = Readonly<{ noun: string; listing: string; pick?: string; }>;

// == Class =======================================================================
export class DesignStore {
  private folder: Folder = TOP_OF_DRIVE;
  /** settles once the chosen folder is read: every save, list and load waits for it */
  protected ready: Promise<void> = Promise.resolve();
  private readonly folderListeners = new Set<() => void>();

  /** `kind` names the files its chooser lists: designs, unless a sound picker's */
  /** follows the folder the app state names, from the first */
  public constructor(protected readonly drive: Drive, private readonly documentState: DocumentState, public readonly words: DesignWords, private readonly kind: FileKind = DESIGNS) {
    this.documentState.entry$(FOLDER_STATE).subscribe(chosen => this.follow(chosen));
  }

  /** reads the app state. A state that cannot be read leaves the top of the Drive */
  public init(): Promise<void> {
    this.ready = this.documentState.init().catch(error => console.warn('the designs folder could not be read:', error));
    return this.ready;
  }

  /** register a callback for the folder changing */
  public onFolderChange(callback: () => void): void { this.folderListeners.add(callback); }

  // == Folder ====================================================================
  public getFolder(): Folder { return this.folder; }

  /** chooses the folder designs go to: writes it to the app state, followed at once */
  public async setFolder(folder: Folder): Promise<void> {
    await this.ready;
    await this.documentState.write(FOLDER_STATE, { ...(folder.id ? { id: folder.id } : {}), name: folder.name });
  }

  // == Browse ====================================================================
  // the folders and designs a chooser walks, as the Drive gives them

  /** a page of what a folder holds: its folders and its files of the store's kind */
  public browse(folder: Folder, offset: number): Promise<FolderListing> { return this.drive.list(folder.id, offset, this.kind); }
  /** a page of the folders anywhere whose name matches the search */
  public searchFolders(search: string, offset: number) { return this.drive.searchFolders(search, offset); }
  /** makes a folder inside a folder */
  public async createFolder(within: Folder, name: string): Promise<Folder> {
    const clean = name.trim();
    if(clean.length < 1) throw new DesignError('A folder needs a name.');
    return this.drive.createFolder(within.id, clean);
  }

  /** the designs in the folder (at most MAX_LISTED), each its document */
  public async list(): Promise<ReadonlyArray<Design>> {
    await this.ready;
    const designs: Design[] = [];
    for(let offset=0; designs.length<MAX_LISTED;) {
      const page = await this.drive.list(this.folder.id, offset);
      designs.push(...page.files);
      if(!page.hasMore) break;
      offset += page.read;
    }
    return designs.slice(0, MAX_LISTED);
  }

  /** the design a listing gave by its uri, wherever it is: no name is searched, so
   *  it is that document whatever its name shares */
  public at(uri: string): Promise<Design> { return this.drive.design(uri); }

  // == Write & Read ==============================================================
  /** saves LDraw text as a design in the folder. A design of that name already there
   *  is refused (DesignExists) unless `replace` says to write over it, or it is `own`
   *  (the design being saved again) */
  public async write(name: string, replace: boolean, text: () => string | Promise<string>/*read once the name is clear*/, own?: Design): Promise<SavedInFolder> {
    const clean = this.designName(name);
    await this.ready;
    const ldraw = await text();
    const folder = this.folder;
    const { found: existing, unseen } = await this.find(folder, clean);
    if(!existing && unseen) throw new DesignError(`Too many ${this.words.noun}s in ${folder.name} have names like "${clean}" to tell whether one is named "${clean}". Save under a more distinctive name.`)/*a save never risks a duplicate*/;
    if(existing && !replace && (existing.uri !== own?.uri)) throw new DesignExists(displayName(existing), folder, this.words.noun);

    const changed = existing ? await this.drive.overwrite(existing, ldraw) : true/*created*/;
    const design = existing ?? await this.drive.create(folder.id, clean + DESIGN_EXTENSION, ldraw);
    return { name: displayName(design), design, folder, replaced: !!existing, changed };
  }

  /** saves LDraw text over a design wherever it is, `folder` the one it is known in */
  public async rewrite(design: Design, text: () => string | Promise<string>, folder?: Folder): Promise<Saved> {
    const changed = await this.drive.overwrite(design, await text());
    return { name: displayName(design), design, ...(folder ? { folder } : {}), replaced: true, changed };
  }

  /** a saved design's text: one found in the Drive, or the one of that name in the
   *  folder (then named) */
  public async read(design: Design | string): Promise<Readonly<{ design: Design; text: string; folder?: Folder; }>> {
    const { design: found, folder } = (typeof design === 'string') ? await this.named(design) : { design, folder: undefined };
    return { design: found, text: await this.drive.read(found), ...(folder ? { folder } : {}) };
  }

  /** a design's name as typed, made a name: trimmed, without its file extension */
  public designName(typed: string): string {
    const name = typed.trim().replace(new RegExp(`\\${DESIGN_EXTENSION}$`, 'i'), '').trim();
    if(name.length < 1) throw new DesignError(`A ${this.words.noun} needs a name.`);
    if(name.length > MAX_NAME) throw new DesignError(`A ${this.words.noun}'s name has at most ${MAX_NAME} characters.`);
    if(name.includes('/')) throw new DesignError(`A ${this.words.noun}'s name cannot contain a slash.`);
    return name;
  }

  // == Internal ==================================================================
  /** takes the folder the app state names, telling listeners when it changed */
  private follow(chosen: unknown): void {
    const next = isFolder(chosen) ? chosen : TOP_OF_DRIVE;
    if((next.id === this.folder.id) && (next.name === this.folder.name)) return/*unchanged*/;
    this.folder = next;
    for(const listener of this.folderListeners) listener();
  }

  /** the design of that name in the folder, and the folder */
  private async named(typed: string): Promise<Readonly<{ design: Design; folder: Folder; }>> {
    const name = this.designName(typed);
    await this.ready;
    const folder = this.folder;
    const { found, unseen } = await this.find(folder, name);
    if(found) return { design: found, folder };
    throw new DesignError(unseen
      ? `No ${this.words.noun} named "${name}" among the first ${DRIVE_PAGE} whose names hold it in ${folder.name}. Use the uri ${this.words.listing} gives for it.`
      : `No ${this.words.noun} named "${name}" is in ${folder.name}.`);
  }

  /** the design in the folder with this name, whatever its case (two designs whose
   *  names differ only in case would read as one), among the first page of designs
   *  whose names hold it; `unseen` when none there has it and more follow, so one
   *  past the page may */
  private async find(folder: Folder, name: string): Promise<Readonly<{ found?: Design; unseen: boolean; }>> {
    const wanted = (name + DESIGN_EXTENSION).toLocaleLowerCase();
    const { designs, hasMore } = await this.drive.search(folder.id, name);
    const found = designs.find(design => design.fileName.toLocaleLowerCase() === wanted);
    return found ? { found, unseen: false } : { unseen: hasMore };
  }
}

// == Util ========================================================================
/** a file's name without its extension: a design's as the person named it */
export const displayName = (file: DriveFile): string => file.fileName.replace(/\.[^./]+$/, '');

const isFolder = (value: unknown): value is Folder =>
  (typeof value === 'object') && (value !== null) && (typeof (value as Folder).name === 'string') &&
  (((value as Folder).id === undefined) || (typeof (value as Folder).id === 'string'));
