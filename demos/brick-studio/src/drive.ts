import type { CharmIQMcpAPI } from '../../../shared/charmiq';

// the Drive as Brick Studio reaches it through the VFS server: its folders, and the
// designs saved in them as Source documents of LDraw text, each named for its file
// (`Beach house.ldr`). The top of the Drive is named (`root`), never implied: an
// omitted folder is the User's default folder, which is not always the top
// SEE: charmiq-docs "CharmIQ | Docs | VFS MCP Server"
// ********************************************************************************
// == Constants ===================================================================
const VFS = 'vfs';
const ROOT = 'root';
const FOLDER_URI = 'charmiq://folder/';
const SOURCE_URI = 'charmiq://source/';

/** the file extension a design's name carries in the Drive */
export const DESIGN_EXTENSION = '.ldr';
/** how many entries a listing reads at a time: the Platform's largest page */
export const DRIVE_PAGE = 50;

// == Types =======================================================================
/** a folder in the Drive; the top of the Drive has no id */
export type Folder = Readonly<{ id: string | undefined; name: string; }>;
/** a saved design: its file name (with its extension) and its document */
export type Design = Readonly<{ fileName: string; uri: string; }>;
/** a page of what a folder holds: its folders and designs, and how many entries the
 *  page read (other documents included), which the next page starts after */
export type FolderListing = Readonly<{ folders: ReadonlyArray<Folder>; designs: ReadonlyArray<Design>; read: number; hasMore: boolean; }>;

type Entry = Readonly<{ name: string; uri: string; }>;
type Listing = Readonly<{ entries: ReadonlyArray<Entry>; hasMore: boolean; }>;
type Read = Readonly<{ content: string; nextRead?: Readonly<Record<string, unknown>>; }>;
type Created = Readonly<{ uri: string; }>;

// == Class =======================================================================
export class Drive {
  public constructor(private readonly mcp: CharmIQMcpAPI) {}

  // == Read ======================================================================
  /** a page of the folders and designs a folder holds */
  public async list(folder: string | undefined/*the top of the Drive*/, offset: number): Promise<FolderListing> {
    const listing = await this.call<Listing>('list_dir', { uri: folderUri(folder), limit: DRIVE_PAGE, offset });
    return { folders: listing.entries.flatMap(asFolder), designs: listing.entries.flatMap(asDesign), read: listing.entries.length, hasMore: listing.hasMore };
  }

  /** a page of the folders anywhere in the Drive whose name matches the search */
  public async searchFolders(search: string, offset: number): Promise<Readonly<{ folders: ReadonlyArray<Folder>; hasMore: boolean; }>> {
    const listing = await this.call<Listing>('list_dir', { type: 'folder', nameSearch: search, limit: DRIVE_PAGE, offset });
    return { folders: listing.entries.flatMap(asFolder), hasMore: listing.hasMore };
  }

  /** the designs in the folder whose name contains the text: the candidates for a
   *  name, which the caller matches. The search takes no type filter (with one and no
   *  folder it would search the whole Drive) */
  public async search(folder: string | undefined/*the top of the Drive*/, text: string): Promise<ReadonlyArray<Design>> {
    const listing = await this.call<Listing>('list_dir', { uri: folderUri(folder), nameSearch: text, limit: DRIVE_PAGE });
    return listing.entries.flatMap(asDesign);
  }

  /** a design's LDraw text, exactly as saved, every page of it */
  public async read(design: Design): Promise<string> {
    let page = await this.call<Read>('read_file', { uri: design.uri });
    let text = page.content;
    while(page.nextRead) {
      page = await this.call<Read>('read_file', page.nextRead);
      text += page.content;
    }
    return text;
  }

  // == Write =====================================================================
  /** makes a folder inside a folder */
  public async createFolder(within: string | undefined/*the top of the Drive*/, name: string): Promise<Folder> {
    const { folderId } = await this.call<Readonly<{ folderId: string; }>>('create_dir', { uri: folderUri(within), name });
    return { id: folderId, name };
  }

  /** saves a new design in the folder: a Source document, its text kept as given */
  public async create(folder: string | undefined/*the top of the Drive*/, fileName: string, ldraw: string): Promise<Design> {
    const { uri } = await this.call<Created>('create_file', { uri: folderUri(folder), type: 'source', name: fileName, content: ldraw });
    return { fileName, uri };
  }

  /** replaces a saved design's text */
  public async overwrite(design: Design, ldraw: string): Promise<void> {
    await this.call('write_file', { uri: design.uri, content: ldraw, overwrite: true });
  }

  // == Internal ==================================================================
  /** calls a VFS tool and returns its structured result; a refused call throws its text */
  private async call<T>(tool: string, args: Readonly<Record<string, unknown>>): Promise<T> {
    const result = await this.mcp.callTool(VFS, tool, { ...args });
    const text = result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
    if(result.isError) throw new Error(text || `The Drive refused ${tool}.`);
    if((result.structuredContent === undefined) || (result.structuredContent === null)) throw new Error(`The Drive answered ${tool} without its result.`);
    return result.structuredContent as T/*the tool's declared output*/;
  }
}

// == Util ========================================================================
const folderUri = (folder: string | undefined): string => folder ? `${FOLDER_URI}${folder}` : ROOT;

/** a listed entry as a folder, when it is one (a folder's name ends in a slash) */
const asFolder = ({ name, uri }: Entry): Folder[] =>
  uri.startsWith(FOLDER_URI) ? [{ id: uri.slice(FOLDER_URI.length), name: name.replace(/\/$/, '') }] : [];

/** a listed entry as a design, when it is one: a Source document named `.ldr` */
const asDesign = ({ name, uri }: Entry): Design[] =>
  (uri.startsWith(SOURCE_URI) && name.endsWith(DESIGN_EXTENSION)) ? [{ fileName: name, uri }] : [];
