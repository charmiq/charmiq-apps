import type { AppStateAPI } from '../../../shared/charmiq';
import { isReservedName, type Build } from './build';
import { DESIGN_EXTENSION, DRIVE_PAGE, type Design, type Drive, type Folder, type FolderListing } from './drive';

// saving the build as a design in the Drive and loading one back, whole or as a
// component of the build: what a design's name may be, which folder designs go to
// and what a save, a load or an add does. The app
// state is the folder's source of truth: the folder is the one it names (the top of
// the Drive when it names none), followed as it changes from anywhere
// ********************************************************************************
// == Constants ===================================================================
/** where designs go until another folder is chosen */
export const TOP_OF_DRIVE: Folder = { id: undefined, name: 'My Drive' };

// --------------------------------------------------------------------------------
/** the app state key that keeps the chosen folder */
const FOLDER_STATE = 'designFolder';
const MAX_NAME = 120/*characters*/;
/** the longest a component's name is (SEE: Build#defineComponent) */
const MAX_COMPONENT_NAME = 40/*characters*/;
/** what a design's component name takes when the build reserves its words */
const RESERVED_SUFFIX = '-design';
/** the most designs a listing names (a folder's designs are read a page at a time) */
const MAX_LISTED = 500;

// == Types =======================================================================
/** a refused save or load; its message is User- and model-facing */
export class DesignError extends Error {}

/** a save refused because the folder already holds a design of that name */
export class DesignExists extends DesignError {
  public constructor(public readonly name: string, public readonly folder: Folder) {
    super(`A design named "${name}" is already in ${folder.name}.`);
  }
}

/** what a save did */
export type Saved = Readonly<{ name: string; folder: Folder; replaced: boolean; }>;

// == Class =======================================================================
export class Designs {
  private folder: Folder = TOP_OF_DRIVE;
  /** settles once the chosen folder is read: every save, list and load waits for it */
  private ready: Promise<void> = Promise.resolve();
  private readonly folderListeners = new Set<() => void>();

  public constructor(private readonly drive: Drive, private readonly build: Build, private readonly appState: AppStateAPI) {}

  /** follows the folder the app state names. A state that cannot be read leaves the
   *  top of the Drive */
  public init(): Promise<void> {
    this.ready = (async () => {
      try {
        this.appState.onChange$().subscribe({ next: state => this.follow(state), error: error => console.warn('brick-studio: the designs folder stopped following the app state:', error) });
        this.follow(await this.appState.get());
      } catch(error) {
        console.warn('brick-studio: the designs folder could not be read:', error);
      }
    })();
    return this.ready;
  }

  /** register a callback for the folder changing */
  public onFolderChange(callback: () => void): void { this.folderListeners.add(callback); }

  // == Folder ====================================================================
  public getFolder(): Folder { return this.folder; }

  /** chooses the folder designs go to: writes it to the app state, beside whatever
   *  else the state holds, and follows what was written */
  public async setFolder(folder: Folder): Promise<void> {
    await this.ready;
    const state = ((await this.appState.get()) as Record<string, unknown> | null) ?? {};
    const next = { ...state, [FOLDER_STATE]: { ...(folder.id ? { id: folder.id } : {}), name: folder.name } };
    await this.appState.set(next);
    this.follow(next);
  }

  // == Browse ====================================================================
  // the folders and designs a chooser walks, as the Drive gives them

  /** a page of what a folder holds */
  public browse(folder: Folder, offset: number): Promise<FolderListing> { return this.drive.list(folder.id, offset); }
  /** a page of the folders anywhere whose name matches the search */
  public searchFolders(search: string, offset: number) { return this.drive.searchFolders(search, offset); }
  /** makes a folder inside a folder */
  public async createFolder(within: Folder, name: string): Promise<Folder> {
    const clean = name.trim();
    if(clean.length < 1) throw new DesignError('A folder needs a name.');
    return this.drive.createFolder(within.id, clean);
  }

  // == Save & Load ===============================================================
  /** saves the build as a design in the folder. A design of that name already there
   *  is refused (DesignExists) unless `replace` says to write over it */
  public async save(name: string, replace: boolean): Promise<Saved> {
    const clean = designName(name);
    await Promise.all([this.ready, this.build.whenReady()]);
    const ldraw = this.build.getText()/*refused for a build read only in part*/;
    const folder = this.folder;
    const { found: existing, unseen } = await this.find(folder, clean);
    if(!existing && unseen) throw new DesignError(`Too many designs in ${folder.name} have names like "${clean}" to tell whether one is named "${clean}". Save under a more distinctive name.`)/*a save never risks a duplicate*/;
    if(existing && !replace) throw new DesignExists(displayName(existing), folder);

    if(existing) await this.drive.overwrite(existing, ldraw);
    else await this.drive.create(folder.id, clean + DESIGN_EXTENSION, ldraw);
    return { name: existing ? displayName(existing) : clean, folder, replaced: !!existing };
  }

  /** the designs in the folder (at most MAX_LISTED), each its document */
  public async list(): Promise<ReadonlyArray<Design>> {
    await this.ready;
    const designs: Design[] = [];
    for(let offset=0; designs.length<MAX_LISTED;) {
      const page = await this.drive.list(this.folder.id, offset);
      designs.push(...page.designs);
      if(!page.hasMore) break;
      offset += page.read;
    }
    return designs.slice(0, MAX_LISTED);
  }

  /** the design a listing gave by its uri, wherever it is: no name is searched, so
   *  it is that document whatever its name shares */
  public at(uri: string): Promise<Design> { return this.drive.design(uri); }

  /** replaces the build with a saved design: one found in the Drive, or the one of
   *  that name in the folder */
  public async load(design: Design | string): Promise<string/*the design's name*/> {
    const found = (typeof design === 'string') ? await this.named(design) : design;
    await this.build.replace(await this.drive.read(found));
    return displayName(found);
  }

  /** defines a component from a saved design (one found in the Drive, or the one of
   *  that name in the folder), named `name` or after the design (SEE:
   *  componentName); a component of that name already in the build is redefined,
   *  every copy with it */
  public async asComponent(design: Design | string, name?: string) {
    const found = (typeof design === 'string') ? await this.named(design) : design;
    return this.build.defineComponentFromText(name ?? componentName(displayName(found)), await this.drive.read(found));
  }

  /** brings a design into the build in one edit: defined as a component named after
   *  it (SEE: componentName), one copy placed on the ground beside the build. A
   *  component of that name placed already is updated, every copy with it, only when
   *  `replace` says it may be (ComponentPlaced otherwise) */
  public async addToBuild(design: Design, replace = false) {
    return this.build.addDesign(componentName(displayName(design)), await this.drive.read(design), replace);
  }

  // == Internal ==================================================================
  /** takes the folder the app state names, telling listeners when it changed */
  private follow(state: unknown): void {
    const chosen = (state as Record<string, unknown> | null)?.[FOLDER_STATE];
    const next = isFolder(chosen) ? chosen : TOP_OF_DRIVE;
    if((next.id === this.folder.id) && (next.name === this.folder.name)) return/*unchanged*/;
    this.folder = next;
    for(const listener of this.folderListeners) listener();
  }

  /** the design of that name in the folder */
  private async named(typed: string): Promise<Design> {
    const name = designName(typed);
    await this.ready;
    const { found, unseen } = await this.find(this.folder, name);
    if(found) return found;
    throw new DesignError(unseen
      ? `No design named "${name}" among the first ${DRIVE_PAGE} whose names hold it in ${this.folder.name}. Use the uri listDesigns gives for it.`
      : `No design named "${name}" is in ${this.folder.name}.`);
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
/** a design's name as typed, made a name: trimmed, without its file extension */
export const designName = (typed: string): string => {
  const name = typed.trim().replace(new RegExp(`\\${DESIGN_EXTENSION}$`, 'i'), '').trim();
  if(name.length < 1) throw new DesignError('A design needs a name.');
  if(name.length > MAX_NAME) throw new DesignError(`A design's name has at most ${MAX_NAME} characters.`);
  if(name.includes('/')) throw new DesignError('A design\'s name cannot contain a slash.');
  return name;
};

/** the component a design's name makes: lower case words joined by dashes, starting
 *  with a letter (`Beach house` is `beach-house`), at most 40 characters, and never a
 *  name the build reserves (`Model` is `model-design`) */
export const componentName = (designName: string): string => {
  const words = designName.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, ''/*an accent apart from its letter*/).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const name = clip(/^[a-z]/.test(words) ? words : `design-${words}`, MAX_COMPONENT_NAME);
  return isReservedName(name) ? `${clip(name, MAX_COMPONENT_NAME - RESERVED_SUFFIX.length)}${RESERVED_SUFFIX}` : name;
};

/** a dashed name cut to at most `length` characters, never ending in a dash */
const clip = (name: string, length: number): string => name.slice(0, length).replace(/-+$/, '');

/** a design's name, without its file extension */
export const displayName = (design: Design): string => design.fileName.slice(0, -DESIGN_EXTENSION.length);

const isFolder = (value: unknown): value is Folder =>
  (typeof value === 'object') && (value !== null) && (typeof (value as Folder).name === 'string') &&
  (((value as Folder).id === undefined) || (typeof (value as Folder).id === 'string'));
