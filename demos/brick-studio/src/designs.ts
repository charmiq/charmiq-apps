import type { AppStateAPI } from '../../../shared/charmiq';
import type { Build } from './build';
import { DESIGN_EXTENSION, type Design, type Drive, type Folder, type FolderListing } from './drive';

// saving the build as a design in the Drive and loading one back: what a design's
// name may be, which folder designs go to (the top of the Drive until another is
// chosen, then that one, kept in the app state) and what a save or a load does
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

  public constructor(private readonly drive: Drive, private readonly build: Build, private readonly appState: AppStateAPI) {}

  /** reads the folder chosen earlier, if any. A folder that cannot be read leaves
   *  the top of the Drive */
  public init(): Promise<void> {
    this.ready = (async () => {
      try {
        const chosen = ((await this.appState.get()) as Record<string, unknown> | null)?.[FOLDER_STATE];
        if(isFolder(chosen)) this.folder = chosen;
      } catch(error) {
        console.warn('brick-studio: the chosen designs folder could not be read:', error);
      }
    })();
    return this.ready;
  }

  // == Folder ====================================================================
  public getFolder(): Folder { return this.folder; }

  /** chooses the folder designs go to; kept beside whatever else the app state holds */
  public async setFolder(folder: Folder): Promise<void> {
    await this.ready;
    this.folder = folder;
    const state = ((await this.appState.get()) as Record<string, unknown> | null) ?? {};
    await this.appState.set({ ...state, [FOLDER_STATE]: { ...(folder.id ? { id: folder.id } : {}), name: folder.name } });
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
    const existing = await this.find(folder, clean);
    if(existing && !replace) throw new DesignExists(displayName(existing), folder);

    if(existing) await this.drive.overwrite(existing, ldraw);
    else await this.drive.create(folder.id, clean + DESIGN_EXTENSION, ldraw);
    return { name: existing ? displayName(existing) : clean, folder, replaced: !!existing };
  }

  /** the names of the designs in the folder */
  public async list(): Promise<ReadonlyArray<string>> {
    await this.ready;
    const names: string[] = [];
    for(let offset=0; names.length<MAX_LISTED;) {
      const page = await this.drive.list(this.folder.id, offset);
      names.push(...page.designs.map(design => displayName(design)));
      if(!page.hasMore) break;
      offset += page.read;
    }
    return names.slice(0, MAX_LISTED);
  }

  /** replaces the build with a saved design: one found in the Drive, or the one of
   *  that name in the folder */
  public async load(design: Design | string): Promise<string/*the design's name*/> {
    const found = (typeof design === 'string') ? await this.named(design) : design;
    await this.build.replace(await this.drive.read(found));
    return displayName(found);
  }

  // == Internal ==================================================================
  /** the design of that name in the folder */
  private async named(typed: string): Promise<Design> {
    const name = designName(typed);
    await this.ready;
    const found = await this.find(this.folder, name);
    if(!found) throw new DesignError(`No design named "${name}" is in ${this.folder.name}.`);
    return found;
  }

  /** the design in the folder with this name, whatever its case: two designs whose
   *  names differ only in case would read as one */
  private async find(folder: Folder, name: string): Promise<Design | undefined> {
    const wanted = (name + DESIGN_EXTENSION).toLocaleLowerCase();
    return (await this.drive.search(folder.id, name)).find(design => design.fileName.toLocaleLowerCase() === wanted);
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

/** a design's name, without its file extension */
export const displayName = (design: Design): string => design.fileName.slice(0, -DESIGN_EXTENSION.length);

const isFolder = (value: unknown): value is Folder =>
  (typeof value === 'object') && (value !== null) && (typeof (value as Folder).name === 'string') &&
  (((value as Folder).id === undefined) || (typeof (value as Folder).id === 'string'));
