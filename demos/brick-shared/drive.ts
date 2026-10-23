import type { CharmIQMcpAPI } from '../../shared/charmiq';

// the Drive as the Brick family reaches it through the VFS server: its folders, the
// designs saved in them as Source documents of LDraw text, each named for its file
// (`Beach house.ldr`), and the sounds a film plays, audio files (`engine.mp3`) read as
// their bytes. The top of the Drive is named (`root`), never implied: an omitted folder
// is the User's default folder, which is not always the top
// SEE: charmiq-docs "CharmIQ | Docs | VFS MCP Server"
// ********************************************************************************
// == Constants ===================================================================
const VFS = 'vfs';
const ROOT = 'root';
const FOLDER_URI = 'charmiq://folder/';
const SOURCE_URI = 'charmiq://source/';
const FILE_URI = 'charmiq://file/';
/** a Platform file as one word, as a build or a scene names it (a sky's picture, a picture's image) */
const PLATFORM_FILE = /^charmiq:\/\/file\/\S+$/;

/** the file extension a design's name carries in the Drive */
export const DESIGN_EXTENSION = '.ldr';
/** how many entries a listing reads at a time: the Platform's largest page */
export const DRIVE_PAGE = 50;
/** how long a VFS call may take: each is one small read or write, and the bridge
 *  itself never gives up on a call */
const CALL_DEADLINE_MS = 30_000/*ms*/;

// == Types =======================================================================
/** a folder in the Drive; the top of the Drive has no id */
export type Folder = Readonly<{ id: string | undefined; name: string; }>;
/** a file in the Drive a listing counts: its file name (with its extension) and its
 *  uri */
export type DriveFile = Readonly<{ fileName: string; uri: string; }>;
/** a saved design: a Source document named `.ldr` */
export type Design = DriveFile;
/** which entries a listing counts as its files: those whose uri starts so (a Source
 *  document, a file) and whose name ends in one of the extensions */
export type FileKind = Readonly<{ uriPrefix: string; extensions: ReadonlyArray<string>; }>;
/** a page of what a folder holds: its folders and its files of a kind, and how many
 *  entries the page read (every other entry included), which the next page starts
 *  after */
export type FolderListing = Readonly<{ folders: ReadonlyArray<Folder>; files: ReadonlyArray<DriveFile>; read: number; hasMore: boolean; }>;

// == Kinds =======================================================================
/** designs: Source documents named `.ldr` */
export const DESIGNS: FileKind = { uriPrefix: SOURCE_URI, extensions: [DESIGN_EXTENSION] };
/** sounds: audio files, by the extensions a browser decodes */
export const SOUND_FILES: FileKind = { uriPrefix: FILE_URI, extensions: ['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm'] };
/** pictures: image files, by the extensions a browser decodes */
export const PICTURE_FILES: FileKind = { uriPrefix: FILE_URI, extensions: ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'] };

/** whether a value names a Platform file (`charmiq://file/...`) */
export const isPlatformFile = (uri: unknown): uri is string => (typeof uri === 'string') && PLATFORM_FILE.test(uri);

type Entry = Readonly<{ name: string; uri: string; }>;
type Listing = Readonly<{ entries: ReadonlyArray<Entry>; hasMore: boolean; }>;
type Read = Readonly<{ content: string; nextRead?: Readonly<Record<string, unknown>>; }>;
/** a binary file's read: its bytes as base64 */
type BinaryRead = Readonly<{ content: string; contentType: string; }>;
type Created = Readonly<{ uri: string; }>;
/** a write's answer: `changed` false for the text already saved (a Platform answering
 *  before it said so carries none: it wrote) */
type Written = Readonly<{ changed?: boolean; }>;

// == Class =======================================================================
export class Drive {
  public constructor(private readonly mcp: CharmIQMcpAPI) {}

  // == Read ======================================================================
  /** a page of the folders and the files of a kind (designs, unless named) a folder
   *  holds */
  public async list(folder: string | undefined/*the top of the Drive*/, offset: number, kind: FileKind = DESIGNS): Promise<FolderListing> {
    const listing = await this.call<Listing>('list_dir', { uri: folderUri(folder), limit: DRIVE_PAGE, offset });
    return { folders: listing.entries.flatMap(asFolder), files: listing.entries.flatMap(asFile(kind)), read: listing.entries.length, hasMore: listing.hasMore };
  }

  /** a page of the folders anywhere in the Drive whose name matches the search */
  public async searchFolders(search: string, offset: number): Promise<Readonly<{ folders: ReadonlyArray<Folder>; hasMore: boolean; }>> {
    const listing = await this.call<Listing>('list_dir', { type: 'folder', nameSearch: search, limit: DRIVE_PAGE, offset });
    return { folders: listing.entries.flatMap(asFolder), hasMore: listing.hasMore };
  }

  /** the first page of designs in the folder whose name contains the text, and
   *  whether more follow: the candidates for a name, which the caller matches. A
   *  search is bounded to its first page; past it, the caller asks for a more
   *  distinctive name. The search takes no type filter (with one and no folder it
   *  would search the whole Drive) */
  public async search(folder: string | undefined/*the top of the Drive*/, text: string): Promise<Readonly<{ designs: ReadonlyArray<Design>; hasMore: boolean; }>> {
    const listing = await this.call<Listing>('list_dir', { uri: folderUri(folder), nameSearch: text, limit: DRIVE_PAGE });
    return { designs: listing.entries.flatMap(asFile(DESIGNS)), hasMore: listing.hasMore };
  }

  /** the design a document is, by its uri (from a listing): refused when the
   *  document is not a design (a Source document named `.ldr`) */
  public async design(uri: string): Promise<Design> {
    const { name } = await this.call<Readonly<{ name: string; }>>('describe_file', { uri });
    const [design] = asFile(DESIGNS)({ name, uri });
    if(!design) throw new Error(`${uri} is not a saved design.`);
    return design;
  }

  /** a file's name, by its uri */
  public async fileName(uri: string): Promise<string> {
    return (await this.call<Readonly<{ name: string; }>>('describe_file', { uri })).name;
  }

  /** a file's bytes exactly as stored, by its uri (a sound, say) */
  public async bytes(uri: string): Promise<ArrayBuffer> {
    const { content } = await this.call<BinaryRead>('read_file', { uri });
    return Uint8Array.from(atob(content), character => character.charCodeAt(0)).buffer;
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

  /** replaces a saved design's text: whether the text changed (the Drive writes
   *  nothing for the text already saved) */
  public async overwrite(design: Design, ldraw: string): Promise<boolean> {
    const { changed } = await this.call<Written>('write_file', { uri: design.uri, content: ldraw, overwrite: true });
    return changed !== false;
  }

  // == Internal ==================================================================
  /** calls a VFS tool and returns its structured result; a refused call throws its
   *  text, and one unanswered by CALL_DEADLINE_MS throws that it did not answer (a
   *  write past its deadline may still land: nothing takes it as done) */
  private async call<T>(tool: string, args: Readonly<Record<string, unknown>>): Promise<T> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error(`it did not answer within ${CALL_DEADLINE_MS / 1000} seconds. Try again.`)), CALL_DEADLINE_MS); });
    const result = await Promise.race([this.mcp.callTool(VFS, tool, { ...args }), late]).finally(() => clearTimeout(deadline));
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

/** a listed entry as a file of the kind, when it is one */
const asFile = (kind: FileKind) => ({ name, uri }: Entry): DriveFile[] =>
  (uri.startsWith(kind.uriPrefix) && kind.extensions.some(extension => name.toLowerCase().endsWith(extension))) ? [{ fileName: name, uri }] : [];
