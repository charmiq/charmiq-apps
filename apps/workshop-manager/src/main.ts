import { BehaviorSubject } from 'rxjs';

import type { ApplicationUser, CharmIQAPI, Observable } from '../../../shared/charmiq';
import type { CharmIQCommandService, CharmIQUserProfileService, ProfileTuple, TypeaheadProfileFilter } from '../../../shared/charmiq-services';

// Workshop Manager: two configured Folders (Template, Classroom), a student roster,
// and a per-student sync of the Template tree (a student's first sync clones it, each
// later one keeps their copy in step). the app-state is the truth: what shows is what
// the document last told, and every write lands on the latest state. the
// template→copy mapping per student is the sync index. Watched files (an FAQ) surface
// a student's edits on the roster. the roster and the sync are also commands that a
// Charm calls for the person running the workshop. one layout narrows to a phone
// ********************************************************************************
// == Constants ===================================================================
const CHARMIQ_URI_SCHEME = 'charmiq://';
// URI scopes that copy through the richtext.copy Command; folders recurse; anything
// else (Files, Platform pages, Agent tasks) is reported as not copyable
const RICHTEXT_SCOPES: ReadonlySet<string> = new Set(['workspace', 'charm', 'chat', 'source']);
const SHARE_ROLES: ReadonlySet<string> = new Set(['owner', 'manager', 'editor', 'commenter', 'viewer']);
const DEFAULT_PATTERN = 'Workshop — {name}';
const FALLBACK_ORIGIN = 'https://team.charmiq.ai'/*the Platform's origin when the embedding page sends no referrer*/;
// one sync or rename runs at a time: a second is refused with this reason
const BUSY_REASON = 'a sync or rename is already running; try again when it finishes';

// .. Limits ......................................................................
const LIST_PAGE_LIMIT = 100;
const LIST_PAGE_CAP = 50/*a runaway guard: a Folder past 5,000 entries is refused*/;
const TYPEAHEAD_LIMIT = 5;
const TYPEAHEAD_DEBOUNCE_MS = 200;
const OBSERVABLE_TIMEOUT_MS = 8000;
// concurrent Platform calls per phase: sync latency is round trips, not work
const POOL_LIMIT = 8;
// passes over the removed template folders, deepest emptying first; a folder still
// holding something after the last pass is kept and reported
const FOLDER_REMOVAL_PASS_CAP = 10;
// the template files a workshop watches for students' edits
const WATCHED_FILE_CAP = 3;
const TOAST_MS = 6000;
// a window this narrow takes the phone layout (a list, sheets, a bottom bar)
const NARROW_QUERY = '(max-width: 640px)';

// .. Icons .......................................................................
// Material Icons paths
const ICONS = {
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  chevronLeft: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  chevronRight: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  doc: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  expandLess: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14l-6-6z',
  expandMore: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
  folder: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  folderOpen: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
  group: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  openInNew: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  personAdd: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
  visibility: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
} as const;
type IconName = keyof typeof ICONS;

// == Types =======================================================================
// .. Enums .......................................................................
/** the configuration rows that open an editor */
enum ConfigField {
  Template = 'template',
  Classroom = 'classroom',
  Pattern = 'pattern',
}
type FolderField = ConfigField.Template | ConfigField.Classroom;

/** a roster column the table sorts by */
enum SortKey {
  Name = 'name',
  User = 'user',
  Synced = 'synced',
  Status = 'status',
}

/** what a read of a copy found */
enum Liveness {
  Ok = 'ok',
  /** the copy exists where the instructors cannot reach (permission denied) */
  Unreachable = 'unreachable',
  /** the copy was deleted */
  Gone = 'gone',
  /** the read failed for another reason: never read as gone */
  Error = 'error',
}

/** a mapping entry's kind (stored) */
enum EntryKind {
  Folder = 'folder',
  Doc = 'doc',
}

/** what adding a User to the roster did */
enum AddOutcome {
  Added = 'added',
  /** a deleted student of the same User was restored */
  Restored = 'restored',
  /** the User was already an active student */
  Present = 'present',
}

enum ProblemSeverity {
  Warn = 'warn',
  Error = 'error',
}

/** an overlay: a bottom sheet on a phone, a dialog on a desktop */
enum SheetKind {
  /** a student and everything to do with them (the phone's row) */
  Student = 'student',
  Settings = 'settings',
  AddStudent = 'add-student',
  RenameStudent = 'rename-student',
  /** a folder's listing: a student's, or the Template's to pick a watched file */
  Browse = 'browse',
  /** what a student changed */
  Changes = 'changes',
}

// .. App-state ...................................................................
/** a Platform User picked for the roster or as an Owner */
type PickedUser = Readonly<{
  userId: string;
  /** their CharmIQ profile name */
  name: string;
  email: string;
}>;

/** a template file the workshop watches: a student's edit of their copy surfaces on
 *  the roster */
type WatchedFile = Readonly<{
  templateUri: string;
  /** its name when chosen, for display */
  name: string;
}>;

/** one template entry's copy for one student, by the template entry's URI. the
 *  versions are the edited-copy check: a copy is edited when the version last
 *  observed by a sync is past the version the app last wrote */
type MappingEntry = Readonly<{
  copyId: string;
  kind?: EntryKind/*absent: told by the URI's scope*/;
  /** the template parent the copy was placed under: an admin move is a change of it */
  parentUri?: string;
  /** the template version the copy's content came from (clone or last overwrite) */
  templateVersion?: number | null/*not readable when cloned*/;
  /** the copy's version right after the app last wrote it (absent: 0, a fresh copy) */
  copyVersion?: number;
  /** the copy's version as the last sync observed it */
  lastCopyVersion?: number;
  clonedAt?: string;
  // flags the edited-copy check does not read (it derives from the versions); a
  // sync that rewrites the entry drops them
  outOfSync?: unknown;
  acknowledgedTemplateVersion?: unknown;
}>;
// NOTE: mutable: a sync builds its working copy in place, entry by entry
type Mapping = Record<string/*template URI*/, MappingEntry>;

/** a student: a CharmIQ User and their folder of copies */
type Student = Readonly<{
  /** the roster id */
  id: string;
  /** the name shown and used for their folder */
  name: string;
  userId: string | null/*a row the roster could not tie to a User*/;
  email: string;
  /** their CharmIQ profile name when added */
  profileName: string;
  /** marked deleted: still listed and restorable; their folder is untouched */
  deleted: boolean;
  folderId: string | null/*never cloned*/;
  /** the folder name the app last set: a different live name is the student's */
  folderName: string | null/*never cloned*/;
  /** when the last sync finished */
  clonedAt: string | null/*never synced*/;
  mapping: Mapping;
  /** the version of each watched file's copy last marked seen ("I've seen everything");
   *  absent: the version the workshop last wrote */
  watchSeen: Readonly<Record<string/*template URI*/, number>>;
}>;

type WorkshopConfig = Readonly<{
  templateFolderId: string | null/*not set*/;
  templateFolderName: string | null/*not set*/;
  classroomFolderId: string | null/*not set*/;
  classroomFolderName: string | null/*not set*/;
  /** each student folder's name, `{name}` replaced with the student's */
  folderNamePattern: string;
  /** added as Owner on each student folder at its creation */
  owners: readonly PickedUser[];
  /** up to WATCHED_FILE_CAP template files */
  watchedFiles: readonly WatchedFile[];
}>;

/** the app-state, normalized for reading */
type WorkshopState = Readonly<{
  config: WorkshopConfig;
  students: readonly Student[];
}>;

// .. Platform Reads ..............................................................
/** an exported command's handler: one object of named arguments, as the manifest's
 *  `inputSchema` describes them (absent when the caller sends none) */
type CommandHandler = (args?: Readonly<Record<string, unknown>>) => unknown;

/** a vfs tool's result, read defensively */
type ToolRecord = Readonly<Record<string, unknown>>;

type DirEntry = Readonly<{ uri: string; name: string; updateTimestamp: number | null/*not told*/; }>;

type CopyState =
  | Readonly<{ state: Liveness.Ok; version: number; name: string | null/*unnamed*/; updateTimestamp: number | null/*not told*/; }>
  | Readonly<{ state: Liveness.Unreachable; }>
  | Readonly<{ state: Liveness.Gone; }>
  | Readonly<{ state: Liveness.Error; message: string; }>;

// .. Sync ........................................................................
type TemplateFolder = Readonly<{ uri: string; name: string; parentUri: string; depth: number; }>;
type TemplateDoc = Readonly<{ uri: string; name: string; parentUri: string; }>;
type TemplateWalk = Readonly<{
  rootUri: string;
  /** every level's folders, parents before their children */
  folders: readonly TemplateFolder[];
  docs: readonly TemplateDoc[];
  /** entries of scopes that are not copied */
  skipped: readonly DirEntry[];
}>;
/** the template as read once for a run: the same for every student */
type TemplateGather = Readonly<{
  walk: TemplateWalk;
  templateVersionNow: ReadonlyMap<string/*template URI*/, number | null/*not readable*/>;
}>;

// NOTE: mutable: a sync fills it in as it goes
/** what one student's sync did */
type SyncReport = {
  added: number;
  moved: number;
  updated: number;
  recreated: number;
  renamed: number;
  removed: number;
  /** edited copies the person chose to leave */
  leftAlone: string[];
  /** edited copies left for a person to decide (a command's run) */
  needsDecision: string[];
  /** removed template folders kept because they hold what the workshop does not manage */
  keptFolders: string[];
  outOfReach: string[];
  failed: string[];
  /** why the sync stopped part way */
  error?: string;
};
type StudentSyncReport = Readonly<{ student: string; email: string; }> & Readonly<SyncReport>;
/** a run over students, or why none ran */
type SyncRun =
  | Readonly<{ refused: string; }>
  | Readonly<{ notCopyable: readonly string[]; students: readonly StudentSyncReport[]; }>;

/** a configuration that cannot sync, and why */
type ConfigProblem = Readonly<{ message: string; severity: ProblemSeverity; }>;

// .. Views .......................................................................
/** a watched file's copy as last read (on open and on Refresh) */
type WatchRead =
  | Readonly<{ state: Liveness.Ok; version: number; updateTimestamp: number | null/*not told*/; }>
  | Readonly<{ state: Liveness.Unreachable | Liveness.Gone; }>
  | Readonly<{ state: Liveness.Error; message: string; }>;

/** a document or folder in a What changed? answer */
type ChangedItem = Readonly<{
  name: string;
  /** the Platform page that opens it */
  url: string;
  updateTimestamp: number | null/*not told*/;
}>;
/** what a student changed: copies edited since the workshop last wrote them, files
 *  they made themselves, and copies gone from their folder */
type ChangesResult = Readonly<{
  edited: readonly ChangedItem[];
  madeByStudent: readonly ChangedItem[];
  /** mapped copies no listing of the student's folder holds (deleted or moved out) */
  missing: readonly string[];
  /** the Platform reads the answer took */
  reads: number;
  checkedAt: number;
}>;

/** an entry of a folder's listing, for Browse */
type BrowseEntry = Readonly<{ uri: string; name: string; isFolder: boolean; }>;
type BrowseListing =
  | Readonly<{ loading: true; }>
  | Readonly<{ loading: false; entries: readonly BrowseEntry[]; }>
  | Readonly<{ loading: false; error: string; }>;

/** a folder Browse stands in, under the folder it began at */
type BrowseStep = Readonly<{ folderId: string; name: string; }>;
type Sheet =
  | Readonly<{ kind: SheetKind.Student; studentId: string; }>
  | Readonly<{ kind: SheetKind.Settings; }>
  | Readonly<{ kind: SheetKind.AddStudent; }>
  | Readonly<{ kind: SheetKind.RenameStudent; studentId: string; }>
  | Readonly<{ kind: SheetKind.Browse; path: readonly BrowseStep[]; studentId: string | null/*the Template, picking a watched file*/; }>
  | Readonly<{ kind: SheetKind.Changes; studentId: string; }>;

// == State =======================================================================
// .. App-state ...................................................................
const defaultState = (): WorkshopState => ({
  config: {
    templateFolderId: null/*not set*/, templateFolderName: null/*not set*/,
    classroomFolderId: null/*not set*/, classroomFolderName: null/*not set*/,
    folderNamePattern: DEFAULT_PATTERN,
    owners: [],
    watchedFiles: [],
  },
  students: [],
});

// SEE: normalizeState() for the authoritative shape
let state: WorkshopState = defaultState();
let stateKnown = false/*no state told yet: the page shows loading*/;
let shownJson: string | null = null/*nothing drawn*/;
let stateFailure: string | null = null/*the app-state reads*/;

// .. Session .....................................................................
const services: { command: CharmIQCommandService | null; userProfile: CharmIQUserProfileService | null; } = { command: null/*not found yet*/, userProfile: null/*not found yet*/ };
let signedInUser: ApplicationUser | null = null/*not told yet, or no one: the user search covers exact email addresses*/;
let editingField: ConfigField | null = null/*no configuration editor open*/;
let editError: string | null = null/*the open editor's value is acceptable*/;
let busyStudentId: string | null = null/*no sync or rename running (one at a time)*/;
const progressText = new Map<string/*student id*/, string>();
let addDraft: Readonly<{ name: string; user: PickedUser | null; }> = { name: '', user: null/*no User picked*/ };
let ownerPickerOpen = false;
let outOfSyncOpenFor: string | null = null/*no out-of-sync list open*/;
let menuFor: string | null = null/*no row menu open*/;
// the open overlays, the top one shown: closing it shows the one under it
let sheetStack: readonly Sheet[] = [];

// .. Reads .......................................................................
// what the Platform answered, for this session alone (never persisted): read when
// asked, never on a timer
const browseListings = new Map<string/*folder id*/, BrowseListing>();
const changes = new Map<string/*student id*/, ChangesResult | Readonly<{ loading: true; }> | Readonly<{ error: string; }>>();
const watchReads = new Map<string/*student id*/, ReadonlyMap<string/*template URI*/, WatchRead>>();
let watchReading = false;
let watchReadAt: number | null = null/*not read yet*/;
// live names of copies, for this session alone: names change and are never persisted
const materialNameCache = new Map<string/*copy URI*/, string>();
let sort: Readonly<{ key: SortKey; dir: 1 | -1; }> = { key: SortKey.Name, dir: 1/*ascending*/ };

// .. Normalization ...............................................................
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => !!value && (typeof value === 'object') && !Array.isArray(value);
const stringOr = <T>(value: unknown, fallback: T): string | T => ((typeof value === 'string') && (value.length > 0)) ? value : fallback;

const normalizeOwner = (raw: unknown): PickedUser | null => {
  if(!isRecord(raw) || (typeof raw.userId !== 'string')) return null/*not an Owner*/;
  return { userId: raw.userId, name: stringOr(raw.name, ''), email: stringOr(raw.email, '') };
};

// the mapping's entries that name their copy; anything else is not a copy the sync
// can manage
const normalizeMapping = (raw: unknown): Mapping => {
  if(!isRecord(raw)) return {};
  const mapping: Mapping = {};
  for(const [templateUri, entry] of Object.entries(raw)) if(isRecord(entry) && (typeof entry.copyId === 'string')) mapping[templateUri] = { ...entry, copyId: entry.copyId };
  return mapping;
};

const normalizeWatchedFile = (raw: unknown): WatchedFile | null => {
  if(!isRecord(raw) || (typeof raw.templateUri !== 'string')) return null/*not a watched file*/;
  return { templateUri: raw.templateUri, name: stringOr(raw.name, raw.templateUri) };
};

// the versions marked seen that are numbers; anything else reads as never seen
const normalizeWatchSeen = (raw: unknown): Readonly<Record<string, number>> => {
  if(!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => (typeof entry[1] === 'number')));
};

const normalizeStudent = (raw: unknown): Student | null => {
  if(!isRecord(raw) || (typeof raw.id !== 'string') || (raw.id.length < 1)) return null/*not a student*/;
  return {
    id: raw.id, name: stringOr(raw.name, ''), userId: stringOr(raw.userId, null/*not tied to a User*/), email: stringOr(raw.email, ''),
    profileName: stringOr(raw.profileName, ''),
    deleted: (raw.deleted === true),
    folderId: stringOr(raw.folderId, null/*never cloned*/), folderName: stringOr(raw.folderName, null/*never cloned*/),
    clonedAt: stringOr(raw.clonedAt, null/*never synced*/),
    mapping: normalizeMapping(raw.mapping),
    watchSeen: normalizeWatchSeen(raw.watchSeen),
  };
};

const normalizeState = (raw: unknown): WorkshopState => {
  const base = defaultState();
  if(!isRecord(raw)) return base;
  const config = isRecord(raw.config) ? raw.config : {};
  return {
    config: {
      templateFolderId: stringOr(config.templateFolderId, null/*not set*/), templateFolderName: stringOr(config.templateFolderName, null/*not set*/),
      classroomFolderId: stringOr(config.classroomFolderId, null/*not set*/), classroomFolderName: stringOr(config.classroomFolderName, null/*not set*/),
      folderNamePattern: stringOr(config.folderNamePattern, DEFAULT_PATTERN),
      owners: (Array.isArray(config.owners) ? config.owners : []).map(normalizeOwner).filter((owner): owner is PickedUser => (owner !== null)),
      watchedFiles: (Array.isArray(config.watchedFiles) ? config.watchedFiles : []).map(normalizeWatchedFile).filter((file): file is WatchedFile => (file !== null)).slice(0, WATCHED_FILE_CAP),
    },
    students: (Array.isArray(raw.students) ? raw.students : []).map(normalizeStudent).filter((student): student is Student => (student !== null)),
  };
};

// == Utilities ===================================================================
const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const icon = (name: IconName) => `<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

// a failure's message: bridge errors arrive as Errors or as plain records
const errorMessage = (error: unknown): string => {
  if(error instanceof Error) return error.message;
  if(isRecord(error) && (typeof error.message === 'string')) return error.message;
  return String(error);
};

const generateId = () => 'st_' + (window.crypto?.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));

// the bridge: present inside a CharmIQ document, where everything past the loading
// shell runs
const platform = (): CharmIQAPI => {
  if(!window.charmiq) throw new Error('this Application runs only inside a CharmIQ document');
  return window.charmiq;
};

// .. DOM .........................................................................
const elementById = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if(!element) throw new Error(`the page has no #${id}`);
  return element;
};
const inputById = (id: string): HTMLInputElement | null => {
  const element = document.getElementById(id);
  return (element instanceof HTMLInputElement) ? element : null/*not drawn*/;
};

// .. URIs ........................................................................
// the embedding Platform page's origin serves folder links; the referrer is that page
const platformOrigin = () => {
  try { if(document.referrer) return new URL(document.referrer).origin; }
  catch { /*an unreadable referrer: the fallback origin*/ }
  return FALLBACK_ORIGIN;
};
const folderUri = (folderId: string) => `${CHARMIQ_URI_SCHEME}folder/${folderId}`;
const folderWebUrl = (folderId: string) => `${platformOrigin()}/folder/${folderId}`;
const uriScope = (uri: string) => { const rest = uri.slice(CHARMIQ_URI_SCHEME.length); return rest.slice(0, rest.indexOf('/')); };
const uriId = (uri: string) => { const rest = uri.slice(CHARMIQ_URI_SCHEME.length); return rest.slice(rest.indexOf('/') + 1).split(/[?#]/)[0]; };
// the web URL for any copied Material: the URI scope maps 1:1 onto the route segment
const materialWebUrl = (templateUri: string, copyId: string) => `${platformOrigin()}/${uriScope(templateUri)}/${copyId}`;
// a copy carries the source's type, so the copy's URI shares the template's scope
const copyUri = (templateUri: string, copyId: string) => `${CHARMIQ_URI_SCHEME}${uriScope(templateUri)}/${copyId}`;

// accepts a web URL (…/folder/<id>), a charmiq://folder/<id> URI, or a bare id
const parseFolderRef = (input: string): string | null => {
  const trimmed = input.trim();
  if(!trimmed) return null/*nothing entered*/;
  const webMatch = trimmed.match(/\/folder\/([A-Za-z0-9_-]+)/);
  if(webMatch) return webMatch[1];
  if(trimmed.startsWith(CHARMIQ_URI_SCHEME)) return (uriScope(trimmed) === 'folder') ? uriId(trimmed) : null/*another kind of Material*/;
  if(/^[A-Za-z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return null/*not a folder reference*/;
};

// .. Text ........................................................................
// a date: the month and day, with the year when it is not this one
const formatDate = (iso: string | null) => {
  if(!iso) return '';
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...((date.getFullYear() !== new Date().getFullYear()) ? { year: 'numeric' } : {}) });
  } catch { return iso; }
};

const displayName = (profile: ProfileTuple['obj']) => {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  return name || profile?.username || profile?.email || '(unnamed)';
};

// emails compare without case: the address a person types or pastes is the account's
const sameEmail = (a: unknown, b: unknown) => (typeof a === 'string') && (typeof b === 'string') && (a.trim().toLowerCase() === b.trim().toLowerCase());

const plural = (count: number, noun: string) => `${count} ${noun}${(count === 1) ? '' : 's'}`;

// .. Async .......................................................................
// the first emission of a bridge observable as a Promise
const firstEmission = <T>(observable: Observable<T>, timeoutMs = OBSERVABLE_TIMEOUT_MS) => new Promise<T>((resolve, reject) => {
  let settled = false;
  let subscription: { unsubscribe: () => void; } | null = null/*not subscribed yet*/;
  const finish = (settle: () => void) => {
    if(settled) return;
    settled = true;
    clearTimeout(timer);
    try { subscription?.unsubscribe(); } catch { /*already disposed*/ }
    settle();
  };
  const timer = setTimeout(() => finish(() => reject(new Error('Timed out waiting for the platform'))), timeoutMs);
  try {
    subscription = observable.subscribe({
      next: (value) => finish(() => resolve(value)),
      error: (error) => finish(() => reject(error)),
    });
    if(settled) { try { subscription.unsubscribe(); } catch { /*already disposed*/ } }
  } catch(error) { finish(() => reject(error)); }
});

// bounded parallel map: lanes pull the next item as they finish; a worker that
// throws rejects the whole pool (workers that must survive failure catch inside)
const mapPool = async <T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while(true) {
      const index = next++;
      if(index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
};

// == Platform calls ==============================================================
// MCP tool results may arrive structured, wrapped, or as text content
const normalizeToolResult = (result: unknown): ToolRecord => {
  if(!isRecord(result)) return {};
  if(isRecord(result.structuredContent)) return result.structuredContent;
  if(Array.isArray(result.content)) {
    const text = result.content.filter(isRecord).filter(part => (part.type === 'text')).map(part => String(part.text ?? '')).join('\n');
    try { const parsed: unknown = JSON.parse(text); return isRecord(parsed) ? parsed : { text }; }
    catch { return { text }; }
  } /* else -- a result with neither form is read as it came */
  return result;
};

const callVfs = async (tool: string, args: Readonly<Record<string, unknown>>) => normalizeToolResult(await platform().mcp.callTool('vfs', tool, args));

const execCommand = async (id: string, args: unknown) => {
  if(!services.command) throw new Error('The Command service is unavailable — reload the page');
  return await services.command.execute({ id, args });
};

const listDirAll = async (uri: string): Promise<DirEntry[]> => {
  const entries: DirEntry[] = [];
  let offset = 0;
  for(let page=0; page<LIST_PAGE_CAP; page++) {
    const result = await callVfs('list_dir', { uri, limit: LIST_PAGE_LIMIT, offset });
    const pageEntries = (Array.isArray(result.entries) ? result.entries : []).filter(isRecord);
    entries.push(...pageEntries.flatMap(entry => ((typeof entry.uri === 'string') && (typeof entry.name === 'string')) ? [{ uri: entry.uri, name: entry.name, updateTimestamp: (typeof entry.updateTimestamp === 'number') ? entry.updateTimestamp : null/*not told*/ }] : []));
    if(!result.hasMore || (pageEntries.length < 1)) return entries;
    offset += pageEntries.length;
  }
  throw new Error(`Folder listing exceeded ${LIST_PAGE_CAP * LIST_PAGE_LIMIT} entries`);
};

const describeUri = async (uri: string, verbose = false) => await callVfs('describe_file', verbose ? { uri, verbose: true } : { uri });

const resolveFolderName = async (folderId: string) => {
  const described = await describeUri(folderUri(folderId));
  if((typeof described.name === 'string') && described.name.trim()) return described.name.trim();
  if(typeof described.text === 'string') { const line = described.text.split('\n')[0]; if(line) return line; }
  return folderId;
};

// a Folder's existing guest shares (read defensively across result shapes), merged
// back on folder.permission.set since that Command replaces the complete map
const readFolderShares = async (folderId: string): Promise<Array<readonly [string, string]>> => {
  try {
    const described = await describeUri(folderUri(folderId), true/*verbose: includes shares*/);
    const shares = described.shares;
    let pairs: Array<readonly [unknown, unknown]> = [];
    if(Array.isArray(shares)) pairs = shares.filter(isRecord).map(share => [share.userId ?? share.user ?? share.id, share.role] as const);
    else if(isRecord(shares)) pairs = Object.entries(shares).map(([userId, value]) => [userId, (typeof value === 'string') ? value : (isRecord(value) ? value.role : undefined/*no role*/)] as const);
    return pairs.flatMap(([userId, role]) => ((typeof userId === 'string') && (typeof role === 'string') && SHARE_ROLES.has(role)) ? [[userId, role] as const] : []);
  } catch { return []/*no shares to keep: the permission pass sets the Owners and the student*/; }
};

// == Persistence =================================================================
// app-state is one value for the document and the last write wins. every write
// reads the latest state and applies a targeted change onto it, so a change another
// person saved meanwhile stands; writes from this page run one at a time (an
// add-student mid-sync lands cleanly). what shows comes from onChange$ alone, never
// from a write. a failed write is told to the person and answers false

// the normalized state written onto the raw state it was read from: a key or a
// student field this page does not know stays as saved
const writtenOnto = (raw: Readonly<Record<string, unknown>>, next: WorkshopState) => {
  const rawStudents = new Map((Array.isArray(raw.students) ? raw.students : []).filter(isRecord).map(student => [student.id, student] as const));
  return {
    ...raw,
    config: { ...(isRecord(raw.config) ? raw.config : {}), ...next.config },
    students: next.students.map(student => ({ ...(rawStudents.get(student.id) ?? {}), ...student })),
  };
};

let persistQueue: Promise<boolean> = Promise.resolve(true);
const persist = (change: (latest: WorkshopState) => WorkshopState): Promise<boolean> => {
  const saved = persistQueue.then(async () => {
    const read = await platform().appState.get();
    const raw = isRecord(read) ? read : {};
    await platform().appState.set(writtenOnto(raw, change(normalizeState(raw))));
    return true;
  }).catch((error: unknown) => {
    toast(`Your change wasn't saved: ${errorMessage(error)}. Try it again, or reload to see the saved workshop.`, { error: true });
    return false/*a failed write never wedges the queue*/;
  });
  persistQueue = saved;
  return saved;
};
// a write the work after it depends on: a refusal stops that work
const persistOrThrow = async (change: (latest: WorkshopState) => WorkshopState) => { if(!(await persist(change))) throw new Error('the workshop could not be saved'); };

// .. Changes .....................................................................
// sets the given fields of one student onto the latest roster; every other field,
// another person's change included, stays as the document holds it
const updateStudent = (students: readonly Student[], studentId: string, fields: Partial<Student>) => students.map(student => (student.id === studentId) ? { ...student, ...fields } : student);
const withStudents = (latest: WorkshopState, students: readonly Student[]): WorkshopState => ({ ...latest, students });
const withConfig = (latest: WorkshopState, config: Partial<WorkshopConfig>): WorkshopState => ({ ...latest, config: { ...latest.config, ...config } });

// == Advertise (workshop-data) ===================================================
// the app-to-app contract the Workshop Tracker consumes: a one-shot getter and a
// stream that emits the current snapshot on subscribe and again on every state
// change. the snapshot is the persisted state alone: names and the tree resolve
// live by id on the Tracker's side
const WORKSHOP_DATA_VERSION = 1;
type WorkshopSnapshot = Readonly<{
  version: number;
  config: Readonly<{ templateFolderId: string | null/*not set*/; classroomFolderId: string | null/*not set*/; }>;
  students: readonly Student[];
}>;
const workshopSnapshot = (): WorkshopSnapshot => ({
  version: WORKSHOP_DATA_VERSION,
  config: { templateFolderId: state.config.templateFolderId, classroomFolderId: state.config.classroomFolderId },
  students: state.students,
});
let workshopData$: BehaviorSubject<WorkshopSnapshot> | null = null/*not advertised yet*/;
const publishWorkshopData = () => { if(workshopData$ && stateKnown) workshopData$.next(workshopSnapshot()); };
const advertiseWorkshopData = () => {
  const data$ = new BehaviorSubject(workshopSnapshot());
  workshopData$ = data$;
  platform().advertise('workshop-data', {
    getWorkshopData: () => workshopSnapshot(),
    data$: () => data$.asObservable(),
  });
};

// == Workshop Status =============================================================
const anySynced = () => state.students.some(student => !student.deleted && (Object.keys(student.mapping).length > 0));

// a sync requires both configured Folders and they must differ (a template copied
// into itself compounds on every sync); the roster banner and the per-row Sync
// buttons key off the same predicate. either Folder may still be set freely: the
// problem reports at the sync surface, not at the pencil
const configProblem = (): ConfigProblem | null => {
  if(!state.config.templateFolderId || !state.config.classroomFolderId) return { message: 'Set the Template and Classroom Folders in Settings before syncing.', severity: ProblemSeverity.Warn };
  if(state.config.templateFolderId === state.config.classroomFolderId) return { message: 'The Template and Classroom Folders are the same — syncing would copy the template into itself. Set them to different Folders in Settings.', severity: ProblemSeverity.Error };
  return null/*ready to sync*/;
};

// .. Edited Copies ...............................................................
// a copy is out of sync when the student edited it since the app last wrote it (as
// of the last sync)
const isEntryOutOfSync = (entry: MappingEntry) => ((entry.lastCopyVersion ?? 0) > (entry.copyVersion ?? 0));
const outOfSyncEntriesOf = (student: Student) => Object.entries(student.mapping).filter(([, entry]) => isEntryOutOfSync(entry));
// the entry without the flags the edited-copy check does not read
const withoutUnreadFlags = ({ outOfSync: _outOfSync, acknowledgedTemplateVersion: _acknowledged, ...entry }: MappingEntry): MappingEntry => entry;

// .. Roster Order ................................................................
// the table's sort is visual alone: the persisted roster order is never touched.
// the clicked column is the primary key (its direction applies to it alone); the
// rest of the chain follows in fixed order, natural direction, so the order is
// always total: name A→Z, then email, then synced before never synced, then active
// before deleted
const SORT_CHAIN: readonly SortKey[] = [SortKey.Name, SortKey.User, SortKey.Synced, SortKey.Status];
const SORT_COMPARATORS: Readonly<Record<SortKey, (a: Student, b: Student) => number>> = {
  [SortKey.Name]: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  [SortKey.User]: (a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: 'base' })
                         || a.profileName.localeCompare(b.profileName, undefined, { sensitivity: 'base' }),
  [SortKey.Synced]: (a, b) => ((Object.keys(b.mapping).length > 0) ? 1 : 0) - ((Object.keys(a.mapping).length > 0) ? 1 : 0),
  [SortKey.Status]: (a, b) => (a.deleted ? 1 : 0) - (b.deleted ? 1 : 0),
};
const isSortKey = (value: unknown): value is SortKey => (Object.values(SortKey) as unknown[]).includes(value);

const sortedStudents = () => {
  const chain = [sort.key, ...SORT_CHAIN.filter(key => (key !== sort.key))];
  return [...state.students].sort((a, b) => {
    for(const key of chain) {
      const comparison = SORT_COMPARATORS[key](a, b);
      if(comparison !== 0) return (key === sort.key) ? (comparison * sort.dir) : comparison;
    }
    return a.id.localeCompare(b.id)/*total-order backstop*/;
  });
};
// the commands' order: by name, then email
const byName = (a: Student, b: Student) => SORT_COMPARATORS[SortKey.Name](a, b) || SORT_COMPARATORS[SortKey.User](a, b) || a.id.localeCompare(b.id);
const activeStudentIds = () => sortedStudents().filter(student => !student.deleted).map(student => student.id);

// == Toasts ======================================================================
const toast = (message: string, { error = false } = {}) => {
  const element = document.createElement('div');
  element.className = 'toast' + (error ? ' error' : '');
  element.innerHTML = `<div style="flex:1 1 auto; min-width:0;">${esc(message)}</div><button class="icon" title="Dismiss">${icon('close')}</button>`;
  element.querySelector('button')?.addEventListener('click', () => element.remove());
  elementById('toasts').appendChild(element);
  if(!error) setTimeout(() => element.remove(), TOAST_MS)/*an error stays until dismissed*/;
};

// == Confirm Modal ===============================================================
type ConfirmOptions = Readonly<{
  title: string;
  bodyHtml: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** the danger header and button */
  loud?: boolean;
  /** the word the person types before confirming */
  typeToConfirm?: string | null/*no word to type*/;
}>;
// answers whether the person confirmed; dismissing is not confirming
const confirmModal = ({ title, bodyHtml, confirmLabel = 'Confirm', cancelLabel = 'Cancel', loud = false, typeToConfirm = null/*no word to type*/ }: ConfirmOptions) => new Promise<boolean>((resolve) => {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal${loud ? ' loud' : ''}">
      <div class="modal-header">${esc(title)}</div>
      <div class="modal-body">
        ${bodyHtml}
        ${typeToConfirm ? `<div class="type-confirm"><input type="text" placeholder="Type &quot;${esc(typeToConfirm)}&quot; to confirm"></div>` : ''}
      </div>
      <div class="modal-footer">
        <button data-action="cancel">${esc(cancelLabel)}</button>
        <button data-action="confirm" class="${loud ? 'danger' : 'primary'}" ${typeToConfirm ? 'disabled' : ''}>${esc(confirmLabel)}</button>
      </div>
    </div>`;
  const confirmButton = overlay.querySelector<HTMLButtonElement>('[data-action="confirm"]');
  const cancelButton = overlay.querySelector<HTMLButtonElement>('[data-action="cancel"]');
  const input = overlay.querySelector<HTMLInputElement>('.type-confirm input');
  if(!confirmButton || !cancelButton) { resolve(false); return; }
  if(input && typeToConfirm) input.addEventListener('input', () => { confirmButton.disabled = (input.value.trim().toLowerCase() !== typeToConfirm.toLowerCase()); });
  const close = (confirmed: boolean) => { overlay.remove(); resolve(confirmed); };
  cancelButton.addEventListener('click', () => close(false));
  confirmButton.addEventListener('click', () => close(true));
  overlay.addEventListener('click', (event) => { if(event.target === overlay) close(false); });
  document.body.appendChild(overlay);
  (input ?? confirmButton).focus();
});

// == User Search =================================================================
// follows the signed-in User (`user.read`), whose active Company the user search
// covers. a Platform without the stream needs a reload; a refusal leaves the search
// to exact email addresses
const followSignedInUser = () => {
  const user$ = platform().user$;
  if(!user$) { toast('This page is running an older CharmIQ. Reload the page to search your Company.', { error: true }); return; }
  user$().subscribe({
    next: (user) => { signedInUser = user; },
    error: (error) => {
      signedInUser = null/*no Company to search*/;
      toast(`Could not read who is signed in: ${errorMessage(error)}. User search finds exact email addresses only; reload the page to try again.`, { error: true });
    },
  });
};

const searchProfiles = async (filter: TypeaheadProfileFilter): Promise<readonly ProfileTuple[]> => {
  if(!services.userProfile) return [];
  const tuples = await firstEmission(services.userProfile.typeaheadSearchProfiles$(filter));
  return Array.isArray(tuples) ? tuples : [];
};

type SearchSection = Readonly<{ label: string; tuples: readonly ProfileTuple[]; }>;
type SearchResult = Readonly<{ sections: readonly SearchSection[]; unavailable: boolean; }>;
// the active Company's Members, and an exact-email fall-through when that section
// comes up empty (or the active account is Personal). a search the bridge refused
// (the method is not exposed, or consent was refused) reports unavailable, never
// "no User found"
const searchUserSections = async (query: string): Promise<SearchResult> => {
  const sections: SearchSection[] = [];
  let attempts = 0, failures = 0;
  const trySection = async (label: string, filter: TypeaheadProfileFilter, pick = (tuples: readonly ProfileTuple[]) => tuples) => {
    attempts++;
    try {
      const tuples = pick(await searchProfiles(filter));
      if(tuples.length > 0) sections.push({ label, tuples });
    } catch { failures++; }
  };
  const active = signedInUser?.organizations.find(organization => (organization.id === signedInUser?.activeOrganizationId));
  if(active?.type === 'organization') await trySection(active.name || 'Company', { query, organizationId: active.id, limit: TYPEAHEAD_LIMIT });
  // an unscoped search filtered to the exact address
  if(sections.length < 1) await trySection('Exact email match', { query, limit: TYPEAHEAD_LIMIT * 2 }, tuples => tuples.filter(({ obj }) => sameEmail(obj?.email, query)));
  return { sections, unavailable: (attempts > 0) && (failures === attempts) };
};

// the Platform User with exactly this email, or `null` when there is none; a search
// that could not run throws (never read as "no such User")
const findUserByEmail = async (email: string): Promise<PickedUser | null> => {
  if(!services.userProfile) throw new Error('user search is unavailable to this Application');
  const tuples = await searchProfiles({ query: email.trim(), limit: TYPEAHEAD_LIMIT * 2 });
  const match = tuples.find(({ obj }) => sameEmail(obj?.email, email));
  return match ? { userId: match.id, name: displayName(match.obj), email: match.obj?.email ?? email } : null/*no User has this email*/;
};

// .. Typeahead ...................................................................
const pickedUserOf = (item: HTMLElement): PickedUser => ({ userId: item.dataset.userId ?? '', name: item.dataset.name ?? '', email: item.dataset.email ?? '' });

const attachUserTypeahead = (input: HTMLInputElement, menu: HTMLElement, onSelect: (user: PickedUser) => void) => {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined = undefined/*no search waiting*/;
  let requestSequence = 0;
  const closeMenu = () => { menu.style.display = 'none'; menu.innerHTML = ''; };
  const renderMenu = ({ sections, unavailable }: SearchResult, query: string) => {
    if(!query) { closeMenu(); return; }
    menu.style.display = 'block';
    // flip above the input when the space below cannot fit the menu's max height
    const anchor = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchor.bottom;
    menu.classList.toggle('above', (spaceBelow < 340/*max-height + margin*/) && (anchor.top > spaceBelow));
    if(unavailable) { menu.innerHTML = `<div class="typeahead-empty">User search is unavailable — the platform has not exposed user search to this application</div>`; return; }
    if(sections.length < 1) { menu.innerHTML = `<div class="typeahead-empty">No Platform User found${query.includes('@') ? '' : ' — try the exact email address'}</div>`; return; }
    menu.innerHTML = sections.map(section => `
      <div class="typeahead-section">${esc(section.label)}</div>
      ${section.tuples.map(({ id, obj }) => `
        <div class="typeahead-item" data-user-id="${esc(id)}" data-name="${esc(displayName(obj))}" data-email="${esc(obj?.email || '')}">
          ${obj?.profileImageUrl
            ? `<img src="${esc(obj.profileImageUrl)}" alt="">`
            : `<span class="avatar-fallback">${esc(displayName(obj).slice(0, 1).toUpperCase())}</span>`}
          <div class="who"><div class="n" title="${esc(displayName(obj))}">${esc(displayName(obj))}</div><div class="e" title="${esc(obj?.email || '')}">${esc(obj?.email || '')}</div></div>
        </div>`).join('')}
    `).join('');
    menu.querySelectorAll<HTMLElement>('.typeahead-item').forEach(item => {
      item.addEventListener('mousedown', (event) => {
        event.preventDefault()/*keep the input's focus*/;
        closeMenu();
        onSelect(pickedUserOf(item));
      });
    });
  };
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if(!query) { closeMenu(); return; }
    debounceTimer = setTimeout(async () => {
      const sequence = ++requestSequence;
      const result = await searchUserSections(query);
      if(sequence !== requestSequence) return/*a later search superseded it*/;
      renderMenu(result, query);
    }, TYPEAHEAD_DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event) => {
    if(event.key === 'Escape') closeMenu();
    if(event.key !== 'Enter') return/*other keys type into the search*/;
    event.preventDefault();
    const first = menu.querySelector<HTMLElement>('.typeahead-item');
    if(first) { closeMenu(); onSelect(pickedUserOf(first)); }
  });
  input.addEventListener('blur', () => setTimeout(closeMenu, 150)/*an item's mousedown lands first*/);
};

// == Template Walk ===============================================================
// breadth-first from the Template root, one level at a time with the level's
// listings in parallel: parents always precede children, and each folder carries
// its depth so applies can barrier per level. answers the folders and documents
// (with their template parents) and the entries of scopes that are not copied
const walkTemplate = async (templateFolderId: string): Promise<TemplateWalk> => {
  const rootUri = folderUri(templateFolderId);
  const folders: TemplateFolder[] = [];
  const docs: TemplateDoc[] = [];
  const skipped: DirEntry[] = [];
  let level = [rootUri];
  let depth = 0;
  while(level.length > 0) {
    const listings = await mapPool(level, POOL_LIMIT, async (parentUri) => ({ parentUri, entries: await listDirAll(parentUri) }));
    const nextLevel: string[] = [];
    for(const { parentUri, entries } of listings) {
      for(const entry of entries) {
        const scope = uriScope(entry.uri);
        if(scope === 'folder') { folders.push({ uri: entry.uri, name: entry.name.replace(/\/$/, ''), parentUri, depth }); nextLevel.push(entry.uri); }
        else if(RICHTEXT_SCOPES.has(scope)) docs.push({ uri: entry.uri, name: entry.name, parentUri });
        else skipped.push(entry);
      }
    }
    level = nextLevel;
    depth++;
  }
  return { rootUri, folders, docs, skipped };
};

// the walk and the template-side versions are the same for every student: one
// gather serves a single sync and the whole roster alike
const gatherTemplate = async (templateFolderId: string): Promise<TemplateGather> => {
  const walk = await walkTemplate(templateFolderId);
  const templateVersionNow = new Map<string, number | null>();
  await mapPool(walk.docs, POOL_LIMIT, async (doc) => {
    try { const described = await describeUri(doc.uri); templateVersionNow.set(doc.uri, (typeof described.version === 'number') ? described.version : null/*not readable*/); }
    catch { templateVersionNow.set(doc.uri, null/*not readable: compared on a later sync*/); }
  });
  return { walk, templateVersionNow };
};

// == Sync Engine =================================================================
const setProgress = (studentId: string, text: string | null/*the row's resting state*/) => {
  if(text === null) progressText.delete(studentId);
  else progressText.set(studentId, text);
  render();
};

// the copy Command answers the new Richtext's id (read defensively across shapes)
const copyIdentifier = (result: unknown): string | null => {
  if(typeof result === 'string') return result;
  if(isRecord(result)) return stringOr(result.richtextId, stringOr(result.id, null/*no id*/));
  return null/*no id*/;
};

const createdFolderId = (created: ToolRecord): string | null => stringOr(created.folderId, (typeof created.uri === 'string') ? uriId(created.uri) : null/*no id*/);

// bridge and tool errors carry the Platform error code in the message text
const isPermissionDeniedError = (error: unknown) => /permission[- ]denied/i.test(errorMessage(error));
const isGoneError = (error: unknown) => /not[- ]found|deleted/i.test(errorMessage(error));

// the copy's live state drives the recreate, move and edit decisions. gone is
// claimed only on a recognized not-found: an unknown failure must never recreate (a
// transient error would duplicate a live copy)
const describeCopyState = async (uri: string): Promise<CopyState> => {
  try {
    const described = await describeUri(uri);
    return { state: Liveness.Ok, version: (typeof described.version === 'number') ? described.version : 0, name: stringOr(described.name, null/*unnamed*/), updateTimestamp: (typeof described.updateTimestamp === 'number') ? described.updateTimestamp : null/*not told*/ };
  } catch(error) {
    if(isPermissionDeniedError(error)) return { state: Liveness.Unreachable };
    if(isGoneError(error)) return { state: Liveness.Gone };
    return { state: Liveness.Error, message: errorMessage(error) };
  }
};

const createStudentFolder = async (student: Student, classroomFolderId: string): Promise<Student> => {
  const name = state.config.folderNamePattern.replaceAll('{name}', student.name);
  const created = await callVfs('create_dir', { uri: folderUri(classroomFolderId), name });
  const folderId = createdFolderId(created);
  if(!folderId) throw new Error('Folder creation returned no id');

  // one permission pass at creation: the shares inherited from the Classroom folder
  // are merged back (folder.permission.set replaces the complete map), then the
  // configured Owners and the student; later manual share edits are never touched
  const permissions: Record<string/*User id*/, string/*role*/> = {};
  for(const [userId, role] of await readFolderShares(folderId)) permissions[userId] = role;
  for(const owner of state.config.owners) permissions[owner.userId] = 'owner';
  if(student.userId) permissions[student.userId] = 'editor';
  await execCommand('folder.permission.set', { folderId, permissions, sendNotificationEmail: false, sendInviteExternalEmail: false });

  return { ...student, folderId, folderName: name };
};

const ensureStudentFolder = async (student: Student, classroomFolderId: string, report: SyncReport) => {
  if(student.folderId) {
    const live = await describeCopyState(folderUri(student.folderId));
    if(live.state === Liveness.Ok) return student;
    if(live.state === Liveness.Unreachable) throw new Error('The student folder is not accessible (permission denied)');
    if(live.state === Liveness.Error) throw new Error(`The student folder is not accessible (${live.message})`);
    report.recreated++/*the student deleted their folder: a fresh one, its contents recreated per item*/;
  } /* else -- the first clone creates the folder */
  return await createStudentFolder(student, classroomFolderId);
};

// .. Student Sync ................................................................
// a full sync per student: additions, admin moves, admin edits, admin deletes, and
// recreates of copies the student deleted. the mapping resolves everything by id,
// so the student's placement never blocks an operation and never loses a copy.
// reads gather through the bounded pool, decisions (and their prompts) run with no
// I/O between them, and writes apply through the pool behind ordering barriers. a
// run with no person to ask (a command) leaves every edited copy as it is and
// reports it as needing a decision; the next sync from the app asks. runSync owns
// the busy lock. answers the run's report, or `null` for a student not synced
const syncStudent = async (studentId: string, gathered: TemplateGather, classroomFolderId: string, interactive: boolean): Promise<SyncReport | null> => {
  const original = state.students.find(student => (student.id === studentId));
  if(!original || original.deleted) return null/*removed or deleted since the run began*/;
  const { walk, templateVersionNow } = gathered;

  const mapping: Mapping = { ...original.mapping };
  let student: Student = { ...original, mapping };
  const report: SyncReport = { added: 0, moved: 0, updated: 0, recreated: 0, renamed: 0, removed: 0, leftAlone: [], needsDecision: [], keptFolders: [], outOfReach: [], failed: [] };
  // the fields a sync owns, written onto the latest roster: a rename, delete or
  // restore another person made during the run stands. the folder fields only when
  // this run created the folder (a rename meanwhile writes folderName)
  const syncFields = (): Partial<Student> => ({
    ...((student.folderId !== original.folderId) ? { folderId: student.folderId, folderName: student.folderName } : {}),
    mapping: { ...mapping },
  });
  try {
    setProgress(studentId, 'Checking…')/*claim the row before the first await*/;
    student = await ensureStudentFolder(student, classroomFolderId, report);
    // the created folder persists at once so a later failure cannot orphan it
    if(student.folderId !== original.folderId) await persistOrThrow(latest => withStudents(latest, updateStudent(latest.students, studentId, syncFields())));
    const studentFolderId = student.folderId;
    if(!studentFolderId) throw new Error('the student folder has no id');

    // the id of the student-side parent for a template-side parent URI
    const copyParentId = (templateParentUri: string) => (templateParentUri === walk.rootUri) ? studentFolderId : mapping[templateParentUri]?.copyId;
    const entryKind = (uri: string, entry: MappingEntry) => entry.kind ?? ((uriScope(uri) === 'folder') ? EntryKind.Folder : EntryKind.Doc);
    // a fresh copy starts at version zero: the baseline is implicitly 0 and an
    // overwrite re-baselines with the post-write version
    const studentEdited = (entry: MappingEntry, liveVersion: number) => (liveVersion > (entry.copyVersion ?? 0));

    const walkUris = new Set([...walk.folders.map(folder => folder.uri), ...walk.docs.map(doc => doc.uri)]);
    const removedUris = Object.keys(mapping).filter(uri => !walkUris.has(uri));
    const total = walk.folders.length + walk.docs.length + removedUris.length;
    let processed = 0;
    const step = () => setProgress(studentId, `Syncing… ${++processed}/${total}`);
    const itemFailed = (name: string, error: unknown) => {
      if(isPermissionDeniedError(error)) report.outOfReach.push(name);
      else report.failed.push(`${name}: ${errorMessage(error)}`);
    };

    const createFolderCopy = async (folder: TemplateFolder) => {
      const parentId = copyParentId(folder.parentUri);
      if(!parentId) throw new Error('no cloned parent folder');
      const copyId = createdFolderId(await callVfs('create_dir', { uri: folderUri(parentId), name: folder.name }));
      if(!copyId) throw new Error('folder creation returned no id');
      mapping[folder.uri] = { copyId, kind: EntryKind.Folder, parentUri: folder.parentUri, clonedAt: new Date().toISOString() };
    };
    const createDocCopy = async (doc: TemplateDoc) => {
      const parentId = copyParentId(doc.parentUri);
      if(!parentId) throw new Error('no cloned parent folder');
      const templateVersion = templateVersionNow.get(doc.uri) ?? null/*not readable when gathered*/;
      // a shallow copy: Comments and Reference Material are never cloned (their rows
      // would be the admin's, invisible to the student anyway)
      // NOTE: copyToParentFolder is an explicit false: the shallow path's default
      //       lands the copy in the source's parent (the template folder)
      const copyId = copyIdentifier(await execCommand('richtext.copy', { richtextId: uriId(doc.uri), parentFolderId: parentId, copyToParentFolder: false, preserveContextDependents: false }));
      if(!copyId) throw new Error('copy returned no id');
      mapping[doc.uri] = { copyId, kind: EntryKind.Doc, parentUri: doc.parentUri, templateVersion, clonedAt: new Date().toISOString() };
      // an explicitly named source copies as "Copy of <name>" (the Platform's copy
      // convention); Charms are always explicitly named, so their copies take the
      // template's name back. a miss heals on the next sync
      if(uriScope(doc.uri) === 'charm') {
        try { await execCommand('richtext.metadata.set', { richtextId: copyId, name: doc.name }); }
        catch { /*the next sync's name heal retries*/ }
      } /* else -- a content-named type copies without the prefix */
    };

    // -- Gather ------------------------------------------------------------------
    // every copy-side read fires through the pool
    const folderLive = new Map<string, CopyState>();
    const docLive = new Map<string, CopyState>();
    const removedLive = new Map<string, CopyState>();
    const liveOf = (lives: ReadonlyMap<string, CopyState>, uri: string): CopyState => lives.get(uri) ?? { state: Liveness.Error, message: 'not read' };
    const reads = [
      ...walk.folders.filter(folder => mapping[folder.uri]?.parentUri).map(folder => async () => {
        folderLive.set(folder.uri, await describeCopyState(folderUri(mapping[folder.uri].copyId)));
      }),
      ...walk.docs.filter(doc => mapping[doc.uri]?.parentUri).map(doc => async () => {
        docLive.set(doc.uri, await describeCopyState(copyUri(doc.uri, mapping[doc.uri].copyId)));
      }),
      ...removedUris.map(uri => async () => {
        const entry = mapping[uri];
        removedLive.set(uri, await describeCopyState((entryKind(uri, entry) === EntryKind.Folder) ? folderUri(entry.copyId) : copyUri(uri, entry.copyId)));
      }),
    ];
    let checked = 0;
    await mapPool(reads, POOL_LIMIT, async (read) => { await read(); setProgress(studentId, `Checking… ${++checked}/${reads.length}`); });

    // -- Template Folders --------------------------------------------------------
    // additions, recreates, admin-move mirroring; level barriers keep parents
    // settled before their children

    const maxDepth = walk.folders.reduce((max, folder) => Math.max(max, folder.depth), 0);
    for(let depth=0; depth<=maxDepth; depth++) {
      await mapPool(walk.folders.filter(folder => (folder.depth === depth)), POOL_LIMIT, async (folder) => {
        step();
        try {
          const entry = mapping[folder.uri];
          if(!entry) { await createFolderCopy(folder); report.added++; return; }
          // an entry cloned before its parentUri was recorded learns it here; a
          // template move from before that recording is amnestied
          if(!entry.parentUri) { mapping[folder.uri] = { ...entry, parentUri: folder.parentUri }; return; }

          const live = liveOf(folderLive, folder.uri);
          if(live.state === Liveness.Unreachable) { report.outOfReach.push(folder.name); return; }
          if(live.state === Liveness.Error) { report.failed.push(`${folder.name}: ${live.message}`); return; }
          if(live.state === Liveness.Gone) { await createFolderCopy(folder); report.recreated++; return; }
          if(entry.parentUri === folder.parentUri) return/*the copy already sits under its mapped parent*/;

          // the admin moved the folder in the template: the admin's placement wins
          const parentId = copyParentId(folder.parentUri);
          if(!parentId) throw new Error('no cloned parent folder');
          await callVfs('move', { uri: folderUri(entry.copyId), destination: folderUri(parentId) });
          mapping[folder.uri] = { ...entry, parentUri: folder.parentUri };
          report.moved++;
        } catch(error) { itemFailed(folder.name, error); }
      });
    }

    // -- Template Documents ------------------------------------------------------
    // decide first (prompts back-to-back with no I/O between them), then apply
    // through the pool

    type DocAction = Readonly<{ doc: TemplateDoc; create?: boolean; recreate?: boolean; move?: boolean; update?: boolean; leave?: boolean; healName?: string | null/*the name is the student's*/; versionNow?: number | null/*not readable*/; }>;
    const docActions: DocAction[] = [];
    for(const doc of walk.docs) {
      const entry = mapping[doc.uri];
      if(!entry) { docActions.push({ doc, create: true }); continue; }
      if(!entry.parentUri) { mapping[doc.uri] = { ...entry, parentUri: doc.parentUri }; step(); continue; }/*amnesty, as for folders*/

      const live = liveOf(docLive, doc.uri);
      if(live.state === Liveness.Unreachable) { report.outOfReach.push(doc.name); step(); continue; }
      if(live.state === Liveness.Error) { report.failed.push(`${doc.name}: ${live.message}`); step(); continue; }
      if(live.state === Liveness.Gone) { docActions.push({ doc, create: true, recreate: true }); continue; }

      // the observed copy version: the roster's out-of-sync badge means "edited since
      // the app last wrote it", as of the most recent sync
      const current: MappingEntry = { ...entry, lastCopyVersion: live.version };
      mapping[doc.uri] = current;
      const move = (current.parentUri !== doc.parentUri);
      const versionNow = templateVersionNow.get(doc.uri) ?? null/*not readable*/;
      let update = false, leave = false;
      // templateVersion is always the version the copy's content came from (clone or
      // last overwrite); a leave never touches it, so a standing divergence asks again
      // on every sync until it is resolved
      if((versionNow !== null) && ((current.templateVersion === null) || (current.templateVersion === undefined))) {
        mapping[doc.uri] = { ...current, templateVersion: versionNow }/*amnesty: an entry cloned before its version was readable*/;
      } else if((versionNow !== null) && (typeof current.templateVersion === 'number') && (versionNow > current.templateVersion)) {
        let overwrite = true;
        if(studentEdited(current, live.version) && !interactive) {
          overwrite = false/*left for a person to decide*/;
          report.needsDecision.push(doc.name);
        } else if(studentEdited(current, live.version)) {
          overwrite = await confirmModal({
            title: 'Template changed — copy was edited',
            bodyHtml: `<p><strong>${esc(doc.name)}</strong> changed in the template, but the copy for <strong>${esc(student.name)}</strong> has been edited since the workshop last wrote it. Overwriting <strong>destroys the student's edits</strong>. Overwrite the copy with the template version, or leave it as is?</p>
              <p class="hint">Template v${versionNow} vs copy content from v${current.templateVersion} · copy v${live.version} vs last app write v${current.copyVersion ?? 0}</p>`,
            confirmLabel: 'Overwrite', cancelLabel: 'Leave it',
            loud: true, typeToConfirm: 'overwrite',
          });
        } /* else -- an untouched copy updates silently */
        if(overwrite) update = true;
        else if(interactive) leave = true;
      } /* else -- the template is unchanged since the copy's content, or its version is not readable this round */
      // heal the Platform's "Copy of" copy naming: an exact match against the
      // template's current name proves the prefix is the convention's, not a
      // student's rename; anything else stays untouched
      const healName = (live.name === `Copy of ${doc.name}`) ? doc.name : null/*the name is the student's*/;
      if(move || update || leave || healName) docActions.push({ doc, move, update, leave, healName, versionNow });
      else step()/*nothing to do for this document*/;
    }

    await mapPool(docActions, POOL_LIMIT, async ({ doc, create, recreate, move, update, leave, healName, versionNow }) => {
      step();
      try {
        if(create) { await createDocCopy(doc); if(recreate) report.recreated++; else report.added++; return; }
        let current = mapping[doc.uri];
        if(healName) { await execCommand('richtext.metadata.set', { richtextId: current.copyId, name: healName }); report.renamed++; }
        if(move) {
          // the admin moved the document: the admin's placement wins
          const parentId = copyParentId(doc.parentUri);
          if(!parentId) throw new Error('no cloned parent folder');
          await callVfs('move', { uri: copyUri(doc.uri, current.copyId), destination: folderUri(parentId) });
          current = { ...current, parentUri: doc.parentUri };
          mapping[doc.uri] = current;
          report.moved++;
        } /* else -- the copy already sits under its mapped parent */
        if(update) {
          const templateContent = await callVfs('read_file', { uri: doc.uri });
          const written = await callVfs('write_file', { uri: copyUri(doc.uri, current.copyId), content: stringOr(templateContent.content, '') });
          let baseline = (typeof written.versionIndex === 'number') ? written.versionIndex : null/*not told*/;
          if(baseline === null) { const after = await describeCopyState(copyUri(doc.uri, current.copyId)); if(after.state === Liveness.Ok) baseline = after.version; }
          mapping[doc.uri] = {
            ...withoutUnreadFlags(current),
            templateVersion: (typeof templateContent.version === 'number') ? templateContent.version : (versionNow ?? null/*not readable*/),
            ...((baseline !== null) ? { copyVersion: baseline, lastCopyVersion: baseline } : {}),
          };
          report.updated++;
        } else if(leave) {
          mapping[doc.uri] = withoutUnreadFlags(current);
          report.leftAlone.push(doc.name);
        } /* else -- a move or a name heal alone */
      } catch(error) { itemFailed(doc.name, error); }
    });

    // -- Template Removals -------------------------------------------------------
    // moved out and deleted are one case; documents before folders so a removed
    // folder can empty out

    const removedDocs = removedUris.filter(uri => (entryKind(uri, mapping[uri]) === EntryKind.Doc));
    const removedFolders = removedUris.filter(uri => (entryKind(uri, mapping[uri]) === EntryKind.Folder));

    const removalActions: Array<Readonly<{ uri: string; name: string; doDelete: boolean; }>> = [];
    for(const uri of removedDocs) {
      const entry = mapping[uri];
      const live = liveOf(removedLive, uri);
      if(live.state === Liveness.Unreachable) { report.outOfReach.push(entry.copyId); step(); continue; }
      if(live.state === Liveness.Error) { report.failed.push(`${entry.copyId}: ${live.message}`); step(); continue; }
      if(live.state === Liveness.Gone) { delete mapping[uri]; step(); continue; }/*both sides are gone*/
      const name = live.name ?? entry.copyId;
      let doDelete = true;
      if(studentEdited(entry, live.version) && !interactive) {
        // stays managed, so the next sync from the app asks
        report.needsDecision.push(name);
        step();
        continue;
      } else if(studentEdited(entry, live.version)) {
        doDelete = await confirmModal({
          title: 'Removed from template — copy was edited',
          bodyHtml: `<p><strong>${esc(name)}</strong> was removed from the template, but the copy for <strong>${esc(student.name)}</strong> has been edited. Deleting <strong>destroys the student's edits</strong>. Delete the copy, or leave it (it stops being managed)?</p>
            <p class="hint">Copy v${live.version} vs last app write v${entry.copyVersion ?? 0}</p>`,
          confirmLabel: 'Delete copy', cancelLabel: 'Leave it',
          loud: true, typeToConfirm: 'delete',
        });
      } /* else -- an untouched copy deletes silently */
      removalActions.push({ uri, name, doDelete });
    }
    await mapPool(removalActions, POOL_LIMIT, async ({ uri, name, doDelete }) => {
      step();
      const entry = mapping[uri];
      try {
        if(doDelete) { await callVfs('delete_file', { uri: copyUri(uri, entry.copyId) }); report.removed++; }
        else report.leftAlone.push(name);
        delete mapping[uri];
      } catch(error) { itemFailed(name, error); }
    });

    // deepest first by passes: a removed folder deletes only when empty; what the
    // student created is never deleted: a folder holding any is kept and reported
    let pendingFolders = removedFolders;
    for(let pass=0; (pass<FOLDER_REMOVAL_PASS_CAP) && (pendingFolders.length > 0); pass++) {
      const deferred: Array<Readonly<{ uri: string; name: string; }>> = [];
      let progressed = false;
      for(const uri of pendingFolders) {
        if(pass === 0) step();
        const entry = mapping[uri];
        try {
          const live = await describeCopyState(folderUri(entry.copyId));
          if(live.state === Liveness.Unreachable) { report.outOfReach.push(entry.copyId); progressed = true; continue; }
          if(live.state === Liveness.Error) { report.failed.push(`${entry.copyId}: ${live.message}`); progressed = true; continue; }
          if(live.state === Liveness.Gone) { delete mapping[uri]; progressed = true; continue; }
          const contents = await listDirAll(folderUri(entry.copyId));
          if(contents.length > 0) { deferred.push({ uri, name: live.name ?? entry.copyId }); continue; }
          await execCommand('folder.delete', { folderId: entry.copyId });
          delete mapping[uri];
          report.removed++;
          progressed = true;
        } catch(error) { itemFailed(entry.copyId, error); progressed = true; }
      }
      pendingFolders = deferred.map(folder => folder.uri);
      // nothing emptied this pass, or the passes ran out: what remains is kept
      if(!progressed || (pass === (FOLDER_REMOVAL_PASS_CAP - 1))) {
        report.keptFolders.push(...deferred.map(folder => folder.name));
        pendingFolders.forEach(pendingUri => delete mapping[pendingUri]);
        break;
      } /* else -- another pass, now that the deeper folders emptied */
    }

    student = { ...student, mapping, clonedAt: new Date().toISOString() };
    await persistOrThrow(latest => withStudents(latest, updateStudent(latest.students, studentId, { ...syncFields(), clonedAt: student.clonedAt })));
    toastReport(student.name, report);
    return report;
  } catch(error) {
    // keep whatever completed: the mapping is the sync index (a failed write is told)
    await persist(latest => withStudents(latest, updateStudent(latest.students, studentId, syncFields())));
    toast(`${student.name}: sync failed — ${errorMessage(error)}`, { error: true });
    return { ...report, error: errorMessage(error) };
  } finally {
    setProgress(studentId, null/*the row's resting state*/);
  }
};

// tells the person what one student's sync did
const toastReport = (name: string, report: SyncReport) => {
  const parts = [
    ...((report.added > 0) ? [`${report.added} added`] : []),
    ...((report.moved > 0) ? [`${report.moved} moved`] : []),
    ...((report.updated > 0) ? [`${report.updated} updated`] : []),
    ...((report.recreated > 0) ? [`${report.recreated} recreated`] : []),
    ...((report.renamed > 0) ? [`${report.renamed} renamed`] : []),
    ...((report.removed > 0) ? [`${report.removed} removed`] : []),
    ...((report.leftAlone.length > 0) ? [`${report.leftAlone.length} left as-is`] : []),
    ...((report.needsDecision.length > 0) ? [`${report.needsDecision.length} waiting for your decision`] : []),
  ];
  toast(`${name}: ${(parts.length > 0) ? parts.join(', ') : 'up to date'}`);
  if(report.needsDecision.length > 0) toast(`${name}: edited by the student, left as is until you decide (Sync here to choose): ${report.needsDecision.join(', ')}`, { error: true });
  if(report.keptFolders.length > 0) toast(`${name}: ${(report.keptFolders.length === 1) ? 'folder' : 'folders'} not deleted — holding files the workshop does not manage: ${report.keptFolders.join(', ')}`, { error: true });
  if(report.outOfReach.length > 0) toast(`${name}: out of reach (permission denied): ${report.outOfReach.join(', ')}`, { error: true });
  if(report.failed.length > 0) toast(`${name}: failed: ${report.failed.join('; ')}`, { error: true });
};

// .. Runs ........................................................................
// one run owns the busy lock and gathers the template once: a single student's sync
// and Sync All are the same run over different rosters. an interactive run asks the
// person about edited copies; a command's run leaves them and reports them. answers
// what happened: a refusal names its reason, nothing having run
const runSync = async (studentIds: readonly string[], interactive: boolean): Promise<SyncRun> => {
  if(busyStudentId) return { refused: BUSY_REASON };
  if(studentIds.length < 1) { toast('No active students to sync'); return { refused: 'there are no active students to sync' }; }
  const problem = configProblem();
  const { templateFolderId, classroomFolderId } = state.config;
  if(problem || !templateFolderId || !classroomFolderId) { const message = problem?.message ?? 'the workshop is not configured'; toast(message, { error: true }); return { refused: message }; }
  busyStudentId = studentIds[0];
  try {
    setProgress(studentIds[0], 'Reading template…');
    let gathered: TemplateGather;
    try { gathered = await gatherTemplate(templateFolderId); }
    catch(error) {
      const message = `Template read failed — ${errorMessage(error)}`;
      toast(message, { error: true });
      return { refused: message };
    }
    // no progress clear here: the row hands off from 'Reading template…' straight
    // into the student's own phases, never flashing its resting state
    const notCopyable = gathered.walk.skipped.map(entry => entry.name);
    if(notCopyable.length > 0) toast(`${notCopyable.length} not copyable (ignored): ${notCopyable.join(', ')}`);
    const students: StudentSyncReport[] = [];
    for(const studentId of studentIds) {
      busyStudentId = studentId;
      const report = await syncStudent(studentId, gathered, classroomFolderId, interactive);
      const student = state.students.find(candidate => (candidate.id === studentId));
      if(report) students.push({ student: student?.name ?? studentId, email: student?.email ?? '', ...report });
    }
    return { notCopyable, students };
  } finally {
    // NOTE: the busy flag clears before the render that setProgress runs: the other
    //       order leaves every button drawn disabled with no render to follow
    busyStudentId = null/*the run is over*/;
    setProgress(studentIds[0], null/*the row's resting state*/);
  }
};

const syncStudentNow = (studentId: string) => runSync([studentId], true/*a person clicked*/);
const syncAll = () => runSync(activeStudentIds(), true/*a person clicked*/);

// == Config Actions ==============================================================
type FolderFieldSpec = Readonly<{
  idKey: 'templateFolderId' | 'classroomFolderId';
  nameKey: 'templateFolderName' | 'classroomFolderName';
  label: string;
  /** the configuration change that sets the folder (and its name) */
  withFolder: (folderId: string, name: string) => Partial<WorkshopConfig>;
  withName: (name: string) => Partial<WorkshopConfig>;
}>;
const FOLDER_FIELDS: Readonly<Record<FolderField, FolderFieldSpec>> = {
  [ConfigField.Template]: {
    idKey: 'templateFolderId', nameKey: 'templateFolderName', label: 'Template Folder',
    withFolder: (folderId, name) => ({ templateFolderId: folderId, templateFolderName: name }),
    withName: (name) => ({ templateFolderName: name }),
  },
  [ConfigField.Classroom]: {
    idKey: 'classroomFolderId', nameKey: 'classroomFolderName', label: 'Classroom Folder',
    withFolder: (folderId, name) => ({ classroomFolderId: folderId, classroomFolderName: name }),
    withName: (name) => ({ classroomFolderName: name }),
  },
};
const isConfigField = (value: unknown): value is ConfigField => (Object.values(ConfigField) as unknown[]).includes(value);

const changeFolderWarning = (field: FolderField) => (field === ConfigField.Template)
  ? `<p>Changing the <strong>Template Folder</strong> abandons the existing sync index: every already-synced item no longer matches, so the next sync copies the <strong>entire new template</strong> into every student folder alongside what is already there.</p>`
  : `<p>Changing the <strong>Classroom Folder</strong> only affects students synced for the <strong>first time</strong> from now on. Folders already created for students stay where they are.</p>`;

const saveFolderEdit = async (field: FolderField, rawValue: string) => {
  const spec = FOLDER_FIELDS[field];
  const folderId = parseFolderRef(rawValue);
  if(!folderId) { editError = 'Paste a folder URL, charmiq://folder/… URI, or folder id'; render(); return; }
  let name: string;
  try { name = await resolveFolderName(folderId); }
  catch(error) { editError = `Cannot read that folder: ${errorMessage(error)}`; render(); return; }

  // replacing a folder warns (loudly once a student is synced); a first set is not a
  // change and commits silently
  if(state.config[spec.idKey]) {
    const loud = anySynced();
    const confirmed = await confirmModal({
      title: `Change ${spec.label}?`,
      bodyHtml: `${changeFolderWarning(field)}<p>New ${spec.label}: <strong>${esc(name)}</strong></p>`,
      confirmLabel: 'Change folder',
      loud,
      typeToConfirm: loud ? 'change' : null/*no word to type*/,
    });
    if(!confirmed) return;
  } /* else -- the first folder set */

  editingField = null/*the editor closes*/; editError = null/*the value was accepted*/;
  await persist(latest => withConfig(latest, spec.withFolder(folderId, name)));
};

// re-reads a configured Folder's display name by id (a folder is renamed out from
// under the configuration; the id is its identity, the name a cache)
const refreshFolderName = async (field: FolderField) => {
  const spec = FOLDER_FIELDS[field];
  const folderId = state.config[spec.idKey];
  if(!folderId) return;
  try {
    const name = await resolveFolderName(folderId);
    if(name === state.config[spec.nameKey]) { toast(`${spec.label} name is current`); return; }
    if(await persist(latest => withConfig(latest, spec.withName(name)))) toast(`${spec.label} is now "${name}"`);
  } catch(error) { toast(`Cannot read the ${spec.label}: ${errorMessage(error)}`, { error: true }); }
};

const savePatternEdit = async (rawValue: string) => {
  const pattern = rawValue.trim();
  if(!pattern.includes('{name}')) { editError = 'The pattern must contain {name}'; render(); return; }
  // the warning protects folders already created from the pattern; before any sync
  // exists the change commits silently
  if(anySynced()) {
    const confirmed = await confirmModal({
      title: 'Change Student Folder Name?',
      bodyHtml: `<p>The name pattern names each student's folder at their first sync. Folders already created <strong>keep their current names</strong>; only students synced for the first time from now on use the new pattern.</p><p>New pattern: <strong>${esc(pattern)}</strong></p>`,
      confirmLabel: 'Change name',
      loud: true,
      typeToConfirm: 'change',
    });
    if(!confirmed) return;
  } /* else -- no folder carries the pattern yet */
  editingField = null/*the editor closes*/; editError = null/*the value was accepted*/;
  await persist(latest => withConfig(latest, { folderNamePattern: pattern }));
};

const saveConfigEdit = (value: string) => {
  if(editingField === ConfigField.Pattern) savePatternEdit(value);
  else if(editingField) saveFolderEdit(editingField, value);
};

const addOwner = async (user: PickedUser) => {
  if(state.config.owners.some(owner => (owner.userId === user.userId))) { toast(`${user.name} is already an Owner`); return; }
  ownerPickerOpen = false;
  await persist(latest => withConfig(latest, { owners: [...latest.config.owners.filter(owner => (owner.userId !== user.userId)), user] }));
};

const removeOwner = async (userId: string) => {
  const owner = state.config.owners.find(candidate => (candidate.userId === userId));
  if(!owner) return;
  const confirmed = await confirmModal({
    title: 'Remove Owner?',
    bodyHtml: `<p><strong>${esc(owner.name)}</strong> will not be added to student folders created from now on. Folders already shared with them are <strong>not</strong> changed.</p>`,
    confirmLabel: 'Remove',
  });
  if(!confirmed) return;
  await persist(latest => withConfig(latest, { owners: latest.config.owners.filter(candidate => (candidate.userId !== userId)) }));
};

// == Roster Actions ==============================================================
const newStudent = (name: string, user: PickedUser): Student => ({
  id: generateId(), name, userId: user.userId, email: user.email, profileName: user.name,
  deleted: false, folderId: null/*never synced*/, folderName: null/*never synced*/, clonedAt: null/*never synced*/, mapping: {}, watchSeen: {},
});

// adds the Platform User to the roster; a deleted row of the same User is restored
// instead (its folder and copies are already theirs), and an active one stays.
// throws when it was not saved
const addOrRestoreStudent = async (user: PickedUser, name: string): Promise<AddOutcome> => {
  let outcome = AddOutcome.Added;
  await persistOrThrow(latest => {
    const existing = latest.students.find(student => (student.userId === user.userId));
    if(existing && !existing.deleted) { outcome = AddOutcome.Present; return latest; }
    if(existing) { outcome = AddOutcome.Restored; return withStudents(latest, updateStudent(latest.students, existing.id, { deleted: false })); }
    outcome = AddOutcome.Added;
    return withStudents(latest, [...latest.students, newStudent(name, user)]);
  });
  return outcome;
};

// adds the Add student sheet's account under its name; the sheet closes once it is saved
const addDraftStudent = async () => {
  const name = addDraft.name.trim();
  const user = addDraft.user;
  if(!name || !user) return;
  try {
    const outcome = await addOrRestoreStudent(user, name);
    addDraft = { name: '', user: null/*the form clears*/ };
    closeSheet();
    if(outcome === AddOutcome.Present) toast(`${user.name} (${user.email}) is already a student`);
    else if(outcome === AddOutcome.Restored) toast(`${user.name} (${user.email}) was a deleted student — restored`);
    else toast(`${name} added — Sync to make their folder`);
  } catch { /*the failed write is told; the sheet keeps the draft*/ }
};

const setStudentDeleted = (studentId: string, deleted: boolean) => persistOrThrow(latest => withStudents(latest, updateStudent(latest.students, studentId, { deleted })));

const markStudentDeleted = async (studentId: string, deleted: boolean) => {
  const student = state.students.find(candidate => (candidate.id === studentId));
  if(!student) return;
  if(deleted) {
    const confirmed = await confirmModal({
      title: 'Mark student deleted?',
      bodyHtml: `<p><strong>${esc(student.name)}</strong> stays in the list (grayed out) and their folder is untouched. This can be undone with Restore.</p>`,
      confirmLabel: 'Mark deleted',
    });
    if(!confirmed) return;
  } /* else -- a restore needs no confirmation */
  try { await setStudentDeleted(studentId, deleted); }
  catch { /*the failed write is told*/ }
};

// renaming a student updates the roster and renames their folder only when its live
// name still matches what the app last set (folderName): a student's own rename
// wins, exactly like their moves. the email and User never change. answers what
// happened to the folder, or throws when the rename failed
const renameStudentTo = async (studentId: string, newName: string) => {
  const student = state.students.find(candidate => (candidate.id === studentId));
  if(!student) throw new Error('that student is no longer in the roster');
  if(busyStudentId) throw new Error(BUSY_REASON);
  busyStudentId = studentId;
  setProgress(studentId, 'Renaming…');
  try {
    let folderName = student.folderName;
    let folderNote = 'no folder yet';
    if(student.folderId) {
      const live = await describeCopyState(folderUri(student.folderId));
      if((live.state === Liveness.Ok) && (live.name === student.folderName)) {
        const newFolderName = state.config.folderNamePattern.replaceAll('{name}', newName);
        await execCommand('folder.name.set', { folderId: student.folderId, name: newFolderName });
        folderName = newFolderName;
        folderNote = 'folder renamed';
      } else if(live.state === Liveness.Ok) folderNote = 'folder name left as-is (changed by the student)';
      else folderNote = 'folder not reachable; the next sync handles it';
    } /* else -- the folder takes the name when it is created */
    await persistOrThrow(latest => withStudents(latest, updateStudent(latest.students, studentId, { name: newName, folderName })));
    toast(`${student.name} renamed to ${newName} — ${folderNote}`);
    return folderNote;
  } finally {
    busyStudentId = null/*the rename is over*/;
    setProgress(studentId, null/*the row's resting state*/);
  }
};

const saveStudentRename = async (studentId: string, rawValue: string) => {
  const newName = rawValue.trim();
  if(!newName) { editError = 'Name must not be empty'; render(); return; }
  const student = state.students.find(candidate => (candidate.id === studentId));
  if(!student) return;
  editError = null/*the value was accepted*/;
  closeSheet();
  if(newName === student.name) return;
  try { await renameStudentTo(studentId, newName); }
  catch(error) { toast(`${student.name}: rename failed — ${errorMessage(error)}`, { error: true }); }
};

// == Watched Files ===============================================================
// each watched file's copy, read for every active student when the workshop opens and
// on Refresh, never on a timer: one read per student per watched file. a copy is new
// when its version is past the version last marked seen, or, never marked, past the
// version the workshop last wrote

// the version a student's copy of a watched file was last seen at
const seenVersionOf = (student: Student, templateUri: string) => student.watchSeen[templateUri] ?? student.mapping[templateUri]?.copyVersion ?? 0;
const watchReadOf = (studentId: string, templateUri: string): WatchRead | null => watchReads.get(studentId)?.get(templateUri) ?? null/*not read*/;
const isWatchNew = (student: Student, templateUri: string) => {
  const read = watchReadOf(student.id, templateUri);
  return (read?.state === Liveness.Ok) && (read.version > seenVersionOf(student, templateUri));
};
const newWatchedFilesOf = (student: Student) => state.config.watchedFiles.filter(file => isWatchNew(student, file.templateUri));

const readWatchedCopy = async (student: Student, templateUri: string): Promise<WatchRead> => {
  const live = await describeCopyState(copyUri(templateUri, student.mapping[templateUri].copyId));
  return (live.state === Liveness.Ok) ? { state: Liveness.Ok, version: live.version, updateTimestamp: live.updateTimestamp } : live;
};
const storeWatchRead = (studentId: string, templateUri: string, read: WatchRead) => watchReads.set(studentId, new Map([...(watchReads.get(studentId) ?? []), [templateUri, read]]));

// reads every active synced student's copy of each watched file (the configured
// files unless a change names the list it saved)
const refreshWatched = async (files: readonly WatchedFile[] = state.config.watchedFiles) => {
  if(watchReading) return;
  watchReading = true;
  render();
  try {
    const pairs = state.students.filter(student => !student.deleted).flatMap(student => files.filter(file => student.mapping[file.templateUri]).map(file => ({ student, file })));
    const reads = await mapPool(pairs, POOL_LIMIT, async ({ student, file }) => ({ studentId: student.id, templateUri: file.templateUri, read: await readWatchedCopy(student, file.templateUri) }));
    watchReads.clear();
    for(const { studentId, templateUri, read } of reads) storeWatchRead(studentId, templateUri, read);
    watchReadAt = Date.now()/*shown as when it was checked*/;
  } finally {
    watchReading = false;
    render();
  }
};

// "I've seen everything": each watched file of the student marked seen at the version
// read (read first when it was not)
const markSeen = async (studentId: string) => {
  const student = state.students.find(candidate => (candidate.id === studentId));
  if(!student) return;
  const versions: Record<string/*template URI*/, number> = {};
  for(const file of state.config.watchedFiles.filter(watched => student.mapping[watched.templateUri])) {
    const read = watchReadOf(studentId, file.templateUri) ?? await readWatchedCopy(student, file.templateUri);
    storeWatchRead(studentId, file.templateUri, read);
    if(read.state === Liveness.Ok) versions[file.templateUri] = read.version;
  }
  if(Object.keys(versions).length < 1) { toast(`${student.name} has no watched file to mark seen`); return; }
  if(await persist(latest => withStudents(latest, latest.students.map(candidate => (candidate.id === studentId) ? { ...candidate, watchSeen: { ...candidate.watchSeen, ...versions } } : candidate)))) toast(`${student.name}: everything seen`);
};

const watchFile = async (templateUri: string, name: string) => {
  if(state.config.watchedFiles.some(file => (file.templateUri === templateUri))) return;
  if(state.config.watchedFiles.length >= WATCHED_FILE_CAP) { toast(`A workshop watches up to ${WATCHED_FILE_CAP} files. Stop watching one first.`, { error: true }); return; }
  const watched = [...state.config.watchedFiles, { templateUri, name }];
  if(await persist(latest => withConfig(latest, { watchedFiles: [...latest.config.watchedFiles.filter(file => (file.templateUri !== templateUri)), { templateUri, name }].slice(0, WATCHED_FILE_CAP) }))) {
    closeSheet();
    await refreshWatched(watched);
  } /* else -- the failed write is told */
};

const unwatchFile = (templateUri: string) => persist(latest => withConfig(latest, { watchedFiles: latest.config.watchedFiles.filter(file => (file.templateUri !== templateUri)) }));

// == Folder Browse ===============================================================
// a folder's listing, one level at a time: read when Browse opens it and kept for the
// session (Try again reads it once more). folders first, then names A to Z
const browseOrder = (a: BrowseEntry, b: BrowseEntry) => ((a.isFolder === b.isFolder) ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : (a.isFolder ? -1 : 1));

const loadListing = async (folderId: string, again = false) => {
  if(!again && browseListings.has(folderId)) return;
  browseListings.set(folderId, { loading: true });
  render();
  try {
    const entries = await listDirAll(folderUri(folderId));
    browseListings.set(folderId, { loading: false, entries: entries.map(entry => ({ uri: entry.uri, name: entry.name.replace(/\/$/, ''), isFolder: (uriScope(entry.uri) === 'folder') })).sort(browseOrder) });
  } catch(error) { browseListings.set(folderId, { loading: false, error: errorMessage(error) }); }
  render();
};

// the Platform page that opens a Material, by its URI
const uriWebUrl = (uri: string) => materialWebUrl(uri, uriId(uri));

// == What Changed ================================================================
// what a student changed, read when asked: one listing per folder of their tree finds
// what they made (a folder they made is listed, not walked) and the copies gone from
// it; one read per synced document finds the copies edited since the workshop last
// wrote them
const newestFirst = (a: ChangedItem, b: ChangedItem) => ((b.updateTimestamp ?? 0) - (a.updateTimestamp ?? 0)) || a.name.localeCompare(b.name);

const readChanges = async (student: Student): Promise<ChangesResult> => {
  if(!student.folderId) throw new Error(`${student.name} has never been synced`);
  let reads = 0;
  const byCopyId = new Map(Object.entries(student.mapping).map(([templateUri, entry]) => [entry.copyId, { templateUri, entry }] as const));
  const found = new Set<string/*copy id*/>();
  const madeByStudent: ChangedItem[] = [];
  const syncedDocs: DirEntry[] = [];
  let level = [folderUri(student.folderId)];
  while(level.length > 0) {
    const listings = await mapPool(level, POOL_LIMIT, async (uri) => { reads++; return await listDirAll(uri); });
    const nextLevel: string[] = [];
    for(const entry of listings.flat()) {
      const mapped = byCopyId.get(uriId(entry.uri));
      const isFolder = (uriScope(entry.uri) === 'folder');
      if(!mapped) { madeByStudent.push({ name: entry.name.replace(/\/$/, ''), url: uriWebUrl(entry.uri), updateTimestamp: entry.updateTimestamp }); continue; }
      found.add(mapped.entry.copyId);
      if(isFolder) nextLevel.push(entry.uri);
      else syncedDocs.push(entry);
    }
    level = nextLevel;
  }
  const edited = (await mapPool(syncedDocs, POOL_LIMIT, async (doc): Promise<ChangedItem | null> => {
    reads++;
    const mapped = byCopyId.get(uriId(doc.uri));
    const live = await describeCopyState(doc.uri);
    if(!mapped || (live.state !== Liveness.Ok) || (live.version <= (mapped.entry.copyVersion ?? 0))) return null/*not edited, or not readable*/;
    return { name: live.name ?? doc.name, url: uriWebUrl(doc.uri), updateTimestamp: live.updateTimestamp };
  })).filter((item): item is ChangedItem => (item !== null));
  // a copy gone from the folder is named by its template entry (the copy may be gone)
  const missing = await mapPool([...byCopyId.values()].filter(({ entry }) => !found.has(entry.copyId)), POOL_LIMIT, async ({ templateUri }) => {
    reads++;
    const template = await describeCopyState(templateUri);
    return ((template.state === Liveness.Ok) && template.name) ? template.name : uriId(templateUri);
  });
  return { edited: edited.sort(newestFirst), madeByStudent: madeByStudent.sort(newestFirst), missing: missing.sort((a, b) => a.localeCompare(b)), reads, checkedAt: Date.now()/*shown as when it was checked*/ };
};

const runChanges = async (student: Student) => {
  changes.set(student.id, { loading: true });
  render();
  try { changes.set(student.id, await readChanges(student)); }
  catch(error) { changes.set(student.id, { error: errorMessage(error) }); }
  render();
};

// == Commands ====================================================================
// the workshop as commands a Charm calls for the person running it (declared under
// manifest.json's advertise). each answers what happened and throws its reason when
// it did nothing. a student is named however the caller saw them: their email,
// their name, their CharmIQ User id or their roster id
const EMAIL_PATTERN = /[^\s<>()[\]"',;:]+@[^\s<>()[\]"',;:]+\.[^\s<>()[\]"',;:]+/g;

// .. Students ....................................................................
const resolveStudent = (reference: unknown): Student => {
  const wanted = String(reference ?? '').trim();
  if(!wanted) throw new Error('name the student: their email address or their name');
  const exact = state.students.find(student => (student.id === wanted) || (student.userId === wanted));
  if(exact) return exact;
  const byEmail = state.students.filter(student => sameEmail(student.email, wanted));
  const named = (byEmail.length > 0) ? byEmail : state.students.filter(student => (student.name.trim().toLowerCase() === wanted.toLowerCase()));
  const active = named.filter(student => !student.deleted);
  const matches = (active.length > 0) ? active : named/*a deleted student is still nameable*/;
  if(matches.length === 1) return matches[0];
  if(matches.length > 1) throw new Error(`more than one student matches "${wanted}": ${matches.map(student => `${student.name} <${student.email}>`).join(', ')}; name one by email`);
  throw new Error(`no student matches "${wanted}"; getRoster lists the students`);
};

const rosterEntry = (student: Student) => ({
  name: student.name,
  email: student.email,
  charmiqUser: student.profileName,
  deleted: student.deleted,
  items: Object.keys(student.mapping).length,
  editedByStudent: outOfSyncEntriesOf(student).length,
  lastSynced: student.clonedAt,
  folderUrl: student.folderId ? folderWebUrl(student.folderId) : null/*never cloned*/,
});

type RosterListEntry = Readonly<{ email: string; name: string; }>;
// NOTE: mutable: the roster change fills it in as it goes
/** what syncRoster did, by student name or by email */
type RosterSyncResult = {
  added: string[];
  restored: string[];
  /** marked deleted */
  removed: string[];
  unchanged: string[];
  /** listed emails no CharmIQ User has: not added */
  noCharmiqUser: string[];
  /** listed emails the user search failed for: their students are kept */
  couldNotCheck: string[];
  /** listed lines naming no email address */
  notAnAddress: readonly string[];
};
// the people a list names, one entry per email: a line of text ("Jane Doe
// <jane@example.com>", "jane@example.com", "Doe, Jane, jane@example.com") or an
// object ({ email, name }). a line naming several addresses gives each without a
// name. a line naming no address is reported, never guessed at
const parseRosterList = (list: unknown) => {
  const entries = new Map<string/*lowercased email*/, RosterListEntry>();
  const invalid: string[] = [];
  const add = (email: string, name: string) => { const key = email.toLowerCase(); if(!entries.has(key)) entries.set(key, { email, name }); };
  const lines: readonly unknown[] = Array.isArray(list) ? list : String(list ?? '').split(/\r?\n/);
  for(const line of lines) {
    if(isRecord(line)) {
      const emails = String(line.email ?? '').match(EMAIL_PATTERN) ?? [];
      if(emails.length === 1) add(emails[0], String(line.name ?? '').trim());
      else invalid.push(JSON.stringify(line));
      continue;
    } /* else -- a line of text */
    const text = String(line ?? '').trim();
    if(!text) continue;
    const emails = text.match(EMAIL_PATTERN) ?? [];
    if(emails.length < 1) { invalid.push(text); continue; }
    const name = (emails.length === 1)
      ? text.replace(emails[0], '').replace(/[<>()[\]"']/g, ' ').replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, '').replace(/\s+/g, ' ')
      : ''/*several addresses: none is named*/;
    for(const email of emails) add(email, name);
  }
  return { entries: [...entries.values()], invalid };
};

/** a listed person and what the user search found for their email */
type LookedUpEntry = RosterListEntry & Readonly<{
  user: PickedUser | null/*no User has the email, or the search failed*/;
  error: string | null/*searched*/;
}>;
// the roster that matches the looked-up list, and what changed: each listed User
// who is not an active student is added (or restored), and each active student the
// list does not name is marked deleted. a listed address that could not be checked
// keeps its student
const rosterMatching = (students: readonly Student[], looked: readonly LookedUpEntry[], invalid: readonly string[]) => {
  const result: RosterSyncResult = { added: [], restored: [], removed: [], unchanged: [], noCharmiqUser: [], couldNotCheck: [], notAnAddress: invalid };
  const listedEmails = new Set(looked.map(entry => entry.email.toLowerCase()));
  const listedUserIds = new Set(looked.flatMap(entry => entry.user ? [entry.user.userId] : []));
  let matched = students;
  for(const entry of looked) {
    const user = entry.user;
    if(entry.error !== null) { result.couldNotCheck.push(entry.email); continue; }
    if(!user) { result.noCharmiqUser.push(entry.email); continue; }
    const existing = matched.find(student => (student.userId === user.userId));
    if(existing && !existing.deleted) { result.unchanged.push(existing.name); continue; }
    if(existing) { matched = updateStudent(matched, existing.id, { deleted: false }); result.restored.push(existing.name); continue; }
    const name = entry.name || user.name;
    matched = [...matched, newStudent(name, user)];
    result.added.push(name);
  }
  for(const student of matched) {
    if(student.deleted || (student.userId && listedUserIds.has(student.userId)) || listedEmails.has(student.email.toLowerCase())) continue;
    matched = updateStudent(matched, student.id, { deleted: true });
    result.removed.push(student.name);
  }
  return { students: matched, result };
};

// .. Handlers ....................................................................
const getRosterCommand: CommandHandler = () => {
  const students = [...state.students].sort(byName).map(rosterEntry);
  return { active: students.filter(student => !student.deleted).length, students };
};

const getConfigCommand: CommandHandler = () => {
  const folder = (field: FolderField) => {
    const spec = FOLDER_FIELDS[field];
    const folderId = state.config[spec.idKey];
    return folderId ? { name: state.config[spec.nameKey] || folderId, url: folderWebUrl(folderId) } : null/*not set*/;
  };
  const problem = configProblem();
  return {
    templateFolder: folder(ConfigField.Template),
    classroomFolder: folder(ConfigField.Classroom),
    studentFolderName: state.config.folderNamePattern,
    owners: state.config.owners.map(owner => ({ name: owner.name, email: owner.email })),
    readyToSync: !problem,
    problem: problem ? problem.message : null/*ready to sync*/,
  };
};

// makes the roster match a list of people (SEE: rosterMatching). a list naming no
// address, or a user search that could not run for anyone, changes nothing
const syncRosterCommand: CommandHandler = async (args) => {
  if(busyStudentId) throw new Error(BUSY_REASON);
  const { entries, invalid } = parseRosterList(args?.list);
  if(entries.length < 1) throw new Error('the list names no email addresses; nothing was changed (a list naming no one would remove every student)');
  const looked = await mapPool(entries, POOL_LIMIT, async (entry): Promise<LookedUpEntry> => {
    try { return { ...entry, user: await findUserByEmail(entry.email), error: null/*searched*/ }; }
    catch(error) { return { ...entry, user: null/*not searched*/, error: errorMessage(error) }; }
  });
  if(looked.every(entry => (entry.error !== null))) throw new Error(`user search could not run (${looked[0].error}); nothing was changed`);

  // the change runs on the latest roster: its result is what it did there
  const applied: { result?: RosterSyncResult; } = {};
  await persistOrThrow(latest => {
    const matched = rosterMatching(latest.students, looked, invalid);
    applied.result = matched.result;
    return withStudents(latest, matched.students);
  });
  const result = applied.result;
  if(!result) throw new Error('the roster was not changed');
  toast(`Roster: ${result.added.length} added, ${result.restored.length} restored, ${result.removed.length} marked deleted${(result.noCharmiqUser.length > 0) ? `; no CharmIQ User for ${result.noCharmiqUser.join(', ')}` : ''}`);
  return result;
};

const addStudentCommand: CommandHandler = async (args) => {
  const address = (String(args?.email ?? '').match(EMAIL_PATTERN) ?? [])[0];
  if(!address) throw new Error('give the student\'s email address');
  const user = await findUserByEmail(address);
  if(!user) throw new Error(`no CharmIQ User has the email ${address}; they need an account first`);
  const name = String(args?.name ?? '').trim() || user.name;
  const outcome = await addOrRestoreStudent(user, name);
  return { outcome, name, email: user.email };
};

const removeStudentCommand: CommandHandler = async (args) => {
  if(busyStudentId) throw new Error(BUSY_REASON);
  const student = resolveStudent(args?.student);
  if(student.deleted) return { outcome: 'already deleted', name: student.name, email: student.email };
  await setStudentDeleted(student.id, true);
  return { outcome: 'marked deleted (restorable; their folder is untouched)', name: student.name, email: student.email };
};

const renameStudentCommand: CommandHandler = async (args) => {
  const student = resolveStudent(args?.student);
  const name = String(args?.name ?? '').trim();
  if(!name) throw new Error('give the student\'s new name');
  if(name === student.name) return { outcome: 'unchanged', name };
  const folder = await renameStudentTo(student.id, name);
  return { outcome: 'renamed', from: student.name, name, folder };
};

const syncStudentCommand: CommandHandler = async (args) => {
  const student = resolveStudent(args?.student);
  if(student.deleted) throw new Error(`${student.name} is deleted; addStudent with their email restores them`);
  const run = await runSync([student.id], false/*no person to ask*/);
  if('refused' in run) throw new Error(run.refused);
  return { notCopyable: run.notCopyable, ...run.students[0] };
};

const isoOf = (timestamp: number | null) => (timestamp === null) ? null/*not told*/ : new Date(timestamp).toISOString();
const changedItemOut = (item: ChangedItem) => ({ name: item.name, url: item.url, updated: isoOf(item.updateTimestamp) });

const whatChangedCommand: CommandHandler = async (args) => {
  const student = resolveStudent(args?.student);
  const result = await readChanges(student);
  changes.set(student.id, result);
  render();
  return {
    student: student.name, email: student.email,
    edited: result.edited.map(changedItemOut),
    madeByStudent: result.madeByStudent.map(changedItemOut),
    missing: result.missing,
    reads: result.reads,
  };
};

// reads every watched file's copy (a Refresh) and answers each active student's
const checkWatchedFilesCommand: CommandHandler = async () => {
  const files = state.config.watchedFiles;
  if(files.length < 1) return { watchedFiles: [], students: [], note: 'the workshop watches no files; the teacher chooses them in Settings' };
  await refreshWatched();
  const fileState = (student: Student, file: WatchedFile) => {
    if(!student.mapping[file.templateUri]) return { file: file.name, state: 'not synced' };
    const read = watchReadOf(student.id, file.templateUri);
    if(!read) return { file: file.name, state: 'not read' };
    if(read.state === Liveness.Ok) return { file: file.name, state: isWatchNew(student, file.templateUri) ? 'new' : 'seen', updated: isoOf(read.updateTimestamp), url: materialWebUrl(file.templateUri, student.mapping[file.templateUri].copyId) };
    return { file: file.name, state: (read.state === Liveness.Gone) ? 'deleted' : 'unreadable' };
  };
  return {
    watchedFiles: files.map(file => file.name),
    students: [...state.students].filter(student => !student.deleted).sort(byName).map(student => ({ name: student.name, email: student.email, files: files.map(file => fileState(student, file)) })),
  };
};

const syncAllCommand: CommandHandler = async () => {
  const run = await runSync(activeStudentIds(), false/*no person to ask*/);
  if('refused' in run) throw new Error(run.refused);
  return run;
};

const exportWorkshopCommands = () => platform().exportCommands({
  getRoster: getRosterCommand,
  getConfig: getConfigCommand,
  syncRoster: syncRosterCommand,
  addStudent: addStudentCommand,
  removeStudent: removeStudentCommand,
  renameStudent: renameStudentCommand,
  syncStudent: syncStudentCommand,
  syncAll: syncAllCommand,
  whatChanged: whatChangedCommand,
  checkWatchedFiles: checkWatchedFilesCommand,
});

// == Render ======================================================================
// one layout for every width: a window under NARROW_QUERY shows the roster as a list
// with a bottom bar, a student's actions in their sheet, and every overlay as a sheet
// from the bottom (CSS swaps .wide-only and .narrow-only parts)
const isNarrow = () => window.matchMedia(NARROW_QUERY).matches;

// -- Overlays --------------------------------------------------------------------
const topSheet = (): Sheet | null => sheetStack[sheetStack.length - 1] ?? null/*none open*/;
const pushSheet = (sheet: Sheet) => { menuFor = null/*a menu closes under a sheet*/; editingField = null/*a fresh sheet*/; editError = null/*nothing to report*/; sheetStack = [...sheetStack, sheet]; render(); };
// shows the overlay under the top one (or none)
const closeSheet = () => { sheetStack = sheetStack.slice(0, -1); editingField = null/*the editor closes with its sheet*/; editError = null/*nothing to report*/; ownerPickerOpen = false; render(); };
const replaceTopSheet = (sheet: Sheet) => { sheetStack = [...sheetStack.slice(0, -1), sheet]; render(); };

// -- Parts -----------------------------------------------------------------------
const studentData = (student: Student) => `data-student-id="${esc(student.id)}"`;
const iconButton = (action: string, name: IconName, title: string, data = '') => `<button class="icon" data-action="${action}" ${data} title="${esc(title)}" aria-label="${esc(title)}">${icon(name)}</button>`;
const openLink = (url: string, title: string, label = '') => `<a class="${label ? 'button' : 'icon'}" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}" aria-label="${esc(title)}">${icon('openInNew')}${esc(label)}</a>`;

// a time the Platform told: the time today, the date before today
const formatWhen = (timestamp: number | null) => {
  if(timestamp === null) return '';
  const when = new Date(timestamp);
  return (when.toDateString() === new Date().toDateString()) ? when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// the account a student uses: its profile name and email, or the email alone when the
// profile name is the student's. an account several active students share carries the
// group glyph, its title naming them
const accountHtml = (student: Student) => {
  const label = (student.profileName && (student.profileName !== student.name)) ? `${student.profileName} · ${student.email}` : student.email;
  const sharing = student.userId ? state.students.filter(other => (other.userId === student.userId) && !other.deleted) : [];
  const title = (sharing.length > 1) ? `${student.profileName || student.email}'s account: ${sharing.map(other => other.name).sort((a, b) => a.localeCompare(b)).join(', ')}` : label;
  return `<div class="acct" title="${esc(title)}">${(sharing.length > 1) ? icon('group') : ''}<span class="trunc">${esc(label)}</span></div>`;
};
const whoHtml = (student: Student) => `<div class="who"><div class="name trunc" title="${esc(student.name)}">${esc(student.name)}</div>${accountHtml(student)}</div>`;

// -- Status ----------------------------------------------------------------------
const syncedLineHtml = (student: Student) => {
  const progress = progressText.get(student.id);
  if(progress) return `<span class="prog">${esc(progress)}</span>`;
  if(student.deleted) return `<span class="sub">Deleted · folder kept</span>`;
  const count = Object.keys(student.mapping).length;
  if(count < 1) return `<span class="sub">Never synced</span>`;
  return `<span class="ok">${plural(count, 'item')}</span>${student.clonedAt ? `<span class="sub after">· synced ${esc(formatDate(student.clonedAt))}</span>` : ''}`;
};

const outOfSyncHtml = (student: Student) => {
  const count = outOfSyncEntriesOf(student).length;
  if(count < 1) return '';
  const text = `${count} out of sync`;
  return `<button class="flag warn" data-action="toggle-outofsync" ${studentData(student)} title="${esc(`${text}: copies the student edited since the workshop last wrote them, as of the last sync`)}">${icon('warning')}<span>${esc(text)}</span></button>`;
};

// each watched file's copy as last read: new links to the copy, seen is quiet
const watchChipsHtml = (student: Student) => state.config.watchedFiles.map(file => {
  const entry = student.mapping[file.templateUri];
  const read = watchReadOf(student.id, file.templateUri);
  if(!entry || !read) return ''/*not synced, or not read yet*/;
  const url = materialWebUrl(file.templateUri, entry.copyId);
  if(read.state === Liveness.Ok) {
    const fresh = isWatchNew(student, file.templateUri);
    const title = `${file.name}: ${fresh ? 'edited since you last looked' : 'nothing new'}${read.updateTimestamp ? ` · ${formatWhen(read.updateTimestamp)}` : ''} — open it`;
    return `<a class="chip${fresh ? ' watch' : ''}" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}">${icon('visibility')}<span class="trunc">${esc(file.name)}</span>${fresh ? ' · new' : ' · seen'}</a>`;
  } /* else -- the copy could not be read */
  if(read.state === Liveness.Gone) return `<span class="chip gone" title="${esc(`${file.name} was deleted from the student's folder; the next sync recreates it`)}"><span class="trunc">${esc(file.name)}</span> · deleted</span>`;
  return `<span class="chip" title="${esc((read.state === Liveness.Error) ? read.message : 'permission denied')}"><span class="trunc">${esc(file.name)}</span> · unreadable</span>`;
}).join('');

// the names of a student's edited copies, read once per session
const resolveOutOfSyncNames = async (student: Student) => {
  const entries = outOfSyncEntriesOf(student).filter(([templateUri, entry]) => !materialNameCache.has(copyUri(templateUri, entry.copyId)));
  await mapPool(entries, POOL_LIMIT, async ([templateUri, entry]) => {
    const uri = copyUri(templateUri, entry.copyId);
    try { const described = await describeUri(uri); materialNameCache.set(uri, ((typeof described.name === 'string') && described.name.trim()) ? described.name.trim() : entry.copyId); }
    catch { materialNameCache.set(uri, `${entry.copyId} (unreadable)`); }
  });
};

const outOfSyncPopoverHtml = (student: Student) => {
  const entries = outOfSyncEntriesOf(student);
  if(entries.length < 1) return `<div class="outofsync-popover"><div class="empty">Nothing out of sync</div></div>`;
  return `<div class="outofsync-popover">${entries.map(([templateUri, entry]) => {
    const uri = copyUri(templateUri, entry.copyId);
    const name = materialNameCache.get(uri) ?? 'Loading…';
    return `<a class="item" href="${esc(materialWebUrl(templateUri, entry.copyId))}" target="_blank" rel="noopener" title="${esc(name)}"><span class="n trunc">${esc(name)}</span>${icon('openInNew')}</a>`;
  }).join('')}</div>`;
};

const statusHtml = (student: Student) => {
  const flags = [outOfSyncHtml(student), watchChipsHtml(student)].filter(Boolean).join('');
  return `<div class="status-main">${syncedLineHtml(student)}</div><div class="flags">${flags}</div>${(outOfSyncOpenFor === student.id) ? outOfSyncPopoverHtml(student) : ''}`;
};

// -- Roster ----------------------------------------------------------------------
const rowMenuHtml = (student: Student) => `
  <div class="menu" role="menu">
    <button class="item" data-action="what-changed" ${studentData(student)} ${student.folderId ? '' : 'disabled'}>${icon('history')}What changed?</button>
    ${(state.config.watchedFiles.length > 0) ? `<button class="item" data-action="mark-seen" ${studentData(student)} ${student.folderId ? '' : 'disabled'}>${icon('visibility')}I've seen everything</button>` : ''}
    <button class="item" data-action="rename-student" ${studentData(student)}>${icon('edit')}Rename student</button>
    <hr>
    <button class="item danger-item" data-action="delete-student" ${studentData(student)}>${icon('delete')}Mark deleted</button>
  </div>`;

const rowHtml = (student: Student) => {
  const busy = (busyStudentId !== null);
  const problem = configProblem();
  const data = studentData(student);
  const folderActions = (student.folderId && !student.deleted)
    ? `${iconButton('copy-link', 'copy', "Copy the folder's link", data)}${iconButton('browse', 'folderOpen', 'Browse the folder', data)}${openLink(folderWebUrl(student.folderId), 'Open the folder in CharmIQ')}`
    : '';
  const wideActions = student.deleted
    ? `<button class="small" data-action="restore-student" ${data}>Restore</button>`
    : `${folderActions}<button class="small primary" data-action="sync-student" ${data} ${(busy || problem) ? 'disabled' : ''} ${problem ? `title="${esc(problem.message)}"` : ''}>Sync</button>${iconButton('row-menu', 'more', 'More', data)}`;
  const narrowActions = `${(student.folderId && !student.deleted) ? iconButton('copy-link', 'copy', "Copy the folder's link", data) : ''}<span class="chevron">${icon('chevronRight')}</span>`;
  return `
    <div class="row${student.deleted ? ' deleted' : ''}" data-action="open-student" ${data}>
      <div class="cell cell-who">${whoHtml(student)}</div>
      <div class="cell cell-status">${statusHtml(student)}</div>
      <div class="cell cell-acts"><div class="acts wide-only">${wideActions}</div><div class="acts narrow-only">${narrowActions}</div></div>
      ${(menuFor === student.id) ? rowMenuHtml(student) : ''}
    </div>`;
};

const headCellHtml = (key: SortKey, label: string) =>
  `<button class="head-cell" data-action="sort" data-sort-key="${key}">${label}${(sort.key === key) ? icon((sort.dir === 1) ? 'expandLess' : 'expandMore') : ''}</button>`;

// the watched files' strip: who wrote in them since they were last marked seen
const watchStripHtml = () => {
  const files = state.config.watchedFiles;
  if(files.length < 1) return '';
  const names = files.map(file => file.name).join(', ');
  const fresh = state.students.filter(student => !student.deleted && (newWatchedFilesOf(student).length > 0)).sort(byName);
  const text = watchReading ? `Checking ${esc(names)}…`
    : (watchReadAt === null) ? `<b>${esc(names)}</b> — not checked yet`
    : (fresh.length > 0) ? `<b>${esc(names)}</b> — ${plural(fresh.length, 'student')} wrote since you last looked: ${esc(fresh.map(student => student.name).join(', '))}`
    : `<b>${esc(names)}</b> — nothing new since you last looked`;
  const title = (watchReadAt === null) ? names : `${names}: checked ${formatWhen(watchReadAt)}`;
  return `<div class="strip${(fresh.length > 0) ? ' fresh' : ''}">${icon('visibility')}<span class="strip-text trunc" title="${esc(title)}">${text}</span><button class="small" data-action="refresh-watched" ${watchReading ? 'disabled' : ''} title="Read the watched files again">${icon('refresh')}<span class="wide-only">Refresh</span></button></div>`;
};

// the phone's summary under the title
const summaryHtml = (active: number) => {
  const outOfSync = state.students.filter(student => !student.deleted && (outOfSyncEntriesOf(student).length > 0)).length;
  const fresh = state.students.filter(student => !student.deleted && (newWatchedFilesOf(student).length > 0)).length;
  return [
    `<span>${active} active</span>`,
    ...((outOfSync > 0) ? [`<span class="warn">${icon('warning')}${outOfSync} out of sync</span>`] : []),
    ...((fresh > 0) ? [`<span class="chip watch">${icon('visibility')}${fresh} new in ${esc(state.config.watchedFiles.map(file => file.name).join(', '))}</span>`] : []),
  ].join('<span class="dot">·</span>');
};

// -- Sheets ----------------------------------------------------------------------
const sheetTitleHtml = (headingHtml: string) => `
  <div class="s-title">
    ${(sheetStack.length > 1) ? iconButton('close-sheet', 'chevronLeft', 'Back') : ''}
    <div class="s-heading">${headingHtml}</div>
    ${iconButton('close-all-sheets', 'close', 'Close')}
  </div>`;
const headingHtml = (title: string, sub = '') => `<div class="who"><div class="name trunc" title="${esc(title)}">${esc(title)}</div>${sub ? `<div class="acct"><span class="trunc">${esc(sub)}</span></div>` : ''}</div>`;

// .. Student .....................................................................
const watchLinesHtml = (student: Student) => state.config.watchedFiles.map(file => {
  const entry = student.mapping[file.templateUri];
  if(!entry) return '';
  const read = watchReadOf(student.id, file.templateUri);
  const fresh = isWatchNew(student, file.templateUri);
  const when = (read?.state === Liveness.Ok) ? formatWhen(read.updateTimestamp) : '';
  const mark = !read ? '' : (read.state === Liveness.Ok) ? `<span class="chip${fresh ? ' watch' : ''}">${fresh ? 'new' : 'seen'}${when ? ` · ${esc(when)}` : ''}</span>` : `<span class="chip${(read.state === Liveness.Gone) ? ' gone' : ''}">${(read.state === Liveness.Gone) ? 'deleted' : 'unreadable'}</span>`;
  return `<div class="line">${icon('visibility')}<a class="link t trunc" href="${esc(materialWebUrl(file.templateUri, entry.copyId))}" target="_blank" rel="noopener">${esc(file.name)}</a>${mark}</div>`;
}).join('');

const studentSheetHtml = (student: Student) => {
  const busy = (busyStudentId !== null);
  const problem = configProblem();
  const data = studentData(student);
  const outOfSync = outOfSyncEntriesOf(student).length;
  const folder = (student.folderId && !student.deleted) ? `
    <h3>Folder</h3>
    <div class="line">${icon('folder')}<span class="t trunc">${esc(student.folderName ?? 'Folder')}</span></div>
    ${watchLinesHtml(student)}
    <div class="btn-row"><button data-action="copy-link" ${data}>${icon('copy')}Copy link</button><button data-action="browse" ${data}>${icon('folderOpen')}Browse</button>${openLink(folderWebUrl(student.folderId), 'Open the folder in CharmIQ', 'Open')}</div>` : '';
  const actions = student.deleted
    ? `<div class="btn-row"><button class="primary" data-action="restore-student" ${data}>Restore</button></div>`
    : `${((state.config.watchedFiles.length > 0) && student.folderId) ? `<button class="wide-button" data-action="mark-seen" ${data}>${icon('visibility')}I've seen everything</button>` : ''}
       <div class="btn-row">${student.folderId ? `<button data-action="what-changed" ${data}>${icon('history')}What changed?</button>` : ''}<button class="primary" data-action="sync-student" ${data} ${(busy || problem) ? 'disabled' : ''}>${icon('sync')}Sync</button></div>
       <div class="btn-row"><button data-action="rename-student" ${data}>${icon('edit')}Rename student</button><button class="danger-text" data-action="delete-student" ${data}>${icon('delete')}Mark deleted</button></div>`;
  return `
    ${sheetTitleHtml(whoHtml(student))}
    <div class="s-body">
      ${folder}
      <h3>Status</h3>
      <div class="line">${syncedLineHtml(student)}</div>
      ${(outOfSync > 0) ? `<div class="line"><span class="warn">${icon('warning')}${outOfSync} out of sync</span><span class="sub">edited since the workshop last wrote them</span></div>` : ''}
      ${actions}
    </div>`;
};

// .. Settings ....................................................................
const editRowHtml = (value: string, placeholder: string, hint = '') => `
  <div class="cfg-edit">
    <div class="cfg-edit-line"><input type="text" id="edit-input" placeholder="${esc(placeholder)}" value="${esc(value)}"><button class="primary small" data-action="save-edit">Save</button><button class="small" data-action="cancel-edit">Cancel</button></div>
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
    ${editError ? `<div class="inline-error">${esc(editError)}</div>` : ''}
  </div>`;

const folderSettingHtml = (field: FolderField) => {
  const spec = FOLDER_FIELDS[field];
  const folderId = state.config[spec.idKey];
  const name = state.config[spec.nameKey] || folderId || '';
  const value = (editingField === field) ? editRowHtml('', 'Paste the folder URL (…/folder/…) or id')
    : folderId ? `<a class="link v trunc" href="${esc(folderWebUrl(folderId))}" target="_blank" rel="noopener" title="${esc(name)}">${esc(name)}</a>${iconButton('copy-config-folder', 'copy', `Copy the ${spec.label}'s link`, `data-field="${field}"`)}${iconButton('refresh-folder', 'refresh', "Re-read the folder's name", `data-field="${field}"`)}`
    : `<span class="v unset">Not set</span>`;
  const pencil = (editingField === field) ? '' : iconButton('edit', 'edit', `Change the ${spec.label}`, `data-field="${field}"`);
  return `<div class="cfg-row"><span class="k">${esc(spec.label.replace(' Folder', ''))}</span>${value}${pencil}</div>`;
};

const settingsSheetHtml = () => {
  const watched = state.config.watchedFiles;
  return `
    ${sheetTitleHtml(headingHtml('Settings'))}
    <div class="s-body">
      ${folderSettingHtml(ConfigField.Template)}
      ${folderSettingHtml(ConfigField.Classroom)}
      <div class="cfg-row top"><span class="k">Watched</span>
        <div class="v stack">
          ${watched.map(file => `<div class="line">${icon('visibility')}<span class="t trunc" title="${esc(file.name)}">${esc(file.name)}</span>${iconButton('unwatch-file', 'close', `Stop watching ${file.name}`, `data-uri="${esc(file.templateUri)}"`)}</div>`).join('')}
          <button class="small" data-action="watch-a-file" ${((watched.length >= WATCHED_FILE_CAP) || !state.config.templateFolderId) ? 'disabled' : ''} title="${esc(!state.config.templateFolderId ? 'Set the Template Folder first' : (watched.length >= WATCHED_FILE_CAP) ? `A workshop watches up to ${WATCHED_FILE_CAP} files` : 'Choose a file from the Template')}">${icon('add')}Watch a file</button>
          <div class="hint">A student's edit of their copy shows on the roster</div>
        </div>
      </div>
      <div class="cfg-row"><span class="k">Folder name</span>${(editingField === ConfigField.Pattern) ? editRowHtml(state.config.folderNamePattern, '', "{name} is replaced with the student's name") : `<span class="v trunc" title="${esc(state.config.folderNamePattern)}">${esc(state.config.folderNamePattern)}</span>${iconButton('edit', 'edit', 'Change the student folder name', `data-field="${ConfigField.Pattern}"`)}`}</div>
      <div class="cfg-row top"><span class="k">Owners</span>
        <div class="v stack">
          ${state.config.owners.map(owner => `<div class="line"><span class="avatar">${esc(owner.name.slice(0, 1).toUpperCase())}</span><div class="who t"><div class="trunc" title="${esc(owner.name)}">${esc(owner.name)}</div><div class="acct"><span class="trunc">${esc(owner.email)}</span></div></div>${iconButton('remove-owner', 'close', `Remove ${owner.name}`, `data-user-id="${esc(owner.userId)}"`)}</div>`).join('')}
          ${ownerPickerOpen
            ? `<div class="typeahead-field"><input type="text" id="owner-picker-input" placeholder="Search by name or exact email…"><div class="typeahead-menu" id="owner-picker-menu" style="display:none;"></div></div><button class="small" data-action="close-owner-picker">Cancel</button>`
            : `<button class="small" data-action="open-owner-picker" ${services.userProfile ? '' : 'disabled title="User search is unavailable to this application"'}>${icon('personAdd')}Add Owner</button>`}
          <div class="hint">Owner on each student folder when it is created</div>
        </div>
      </div>
    </div>`;
};

// .. Add student .................................................................
const addStudentSheetHtml = () => {
  const user = addDraft.user;
  const already = user ? state.students.filter(student => (student.userId === user.userId) && !student.deleted).length : 0;
  const account = user
    ? `<div class="picked"><span class="avatar">${esc(user.name.slice(0, 1).toUpperCase())}</span><div class="who t"><div class="name trunc" title="${esc(user.name)}">${esc(user.name)}</div><div class="acct"><span class="trunc">${esc(user.email)}${(already > 0) ? ` · ${plural(already, 'student')} already` : ''}</span></div></div>${iconButton('clear-add-user', 'close', 'Choose another account')}</div>`
    : `<div class="typeahead-field"><input type="text" id="add-user-input" placeholder="Search by name or exact email…" ${services.userProfile ? '' : 'disabled'}><div class="typeahead-menu" id="add-user-menu" style="display:none;"></div></div>
       ${services.userProfile ? '' : `<div class="hint">Adding students needs user search, which this application has not been granted.</div>`}`;
  const name = addDraft.name.trim();
  return `
    ${sheetTitleHtml(headingHtml('Add a student'))}
    <div class="s-body">
      <div class="field"><label>CharmIQ account</label>${account}</div>
      <div class="field"><label for="add-name">Student name (as the workshop shows it)</label><input type="text" id="add-name" placeholder="Student name" value="${esc(addDraft.name)}"></div>
      <button class="primary wide-button" data-action="add-draft-student" ${(user && name) ? '' : 'disabled'}><span class="trunc">Add ${esc(name || 'student')}</span></button>
    </div>`;
};

// .. Rename ......................................................................
const renameSheetHtml = (student: Student) => `
  ${sheetTitleHtml(headingHtml('Rename student', student.name))}
  <div class="s-body">
    <div class="field"><label for="rename-input">Student name</label><input type="text" id="rename-input" value="${esc(student.name)}"></div>
    <div class="hint">Renames their folder too, unless the student renamed it themselves; the account never changes</div>
    ${editError ? `<div class="inline-error">${esc(editError)}</div>` : ''}
    <button class="primary wide-button" data-action="save-rename" ${studentData(student)}>Save</button>
  </div>`;

// .. Browse ......................................................................
const browseSheetHtml = (sheet: Extract<Sheet, { kind: SheetKind.Browse; }>) => {
  const step = sheet.path[sheet.path.length - 1];
  const listing = browseListings.get(step.folderId);
  const student = sheet.studentId ? (state.students.find(candidate => (candidate.id === sheet.studentId)) ?? null) : null/*the Template*/;
  const byCopyId = new Map(student ? Object.values(student.mapping).map(entry => [entry.copyId, entry] as const) : []);
  const sub = student ? `${student.name}'s folder` : `The Template · choose a file to watch (up to ${WATCHED_FILE_CAP})`;
  const up = (sheet.path.length > 1) ? `<button class="line line-button" data-action="browse-up">${icon('chevronLeft')}<span class="t trunc">${esc(sheet.path[sheet.path.length - 2].name)}</span></button>` : '';
  const entryHtml = (entry: BrowseEntry) => {
    if(entry.isFolder) return `<button class="line line-button" data-action="browse-into" data-folder-id="${esc(uriId(entry.uri))}" data-name="${esc(entry.name)}">${icon('folder')}<span class="t trunc">${esc(entry.name)}</span>${icon('chevronRight')}</button>`;
    let mark = '';
    if(student) {
      const mapped = byCopyId.get(uriId(entry.uri));
      mark = !mapped ? `<span class="chip new" title="Not from the template: the student made it">new</span>` : isEntryOutOfSync(mapped) ? `<span class="chip watch" title="Edited since the workshop last wrote it, as of the last sync">edited</span>` : '';
    } else {
      // only a document the sync copies has a student copy to watch
      const watched = state.config.watchedFiles.some(file => (file.templateUri === entry.uri));
      mark = !RICHTEXT_SCOPES.has(uriScope(entry.uri)) ? `<span class="chip" title="Not copied to students, so there is no copy to watch">not synced</span>`
        : watched ? `<span class="chip">watched</span>` : `<button class="small primary" data-action="watch-file" data-uri="${esc(entry.uri)}" data-name="${esc(entry.name)}" ${(state.config.watchedFiles.length >= WATCHED_FILE_CAP) ? 'disabled' : ''}>Watch</button>`;
    }
    return `<div class="line">${icon('doc')}<span class="t trunc" title="${esc(entry.name)}">${esc(entry.name)}</span>${mark}${openLink(uriWebUrl(entry.uri), `Open ${entry.name} in CharmIQ`)}</div>`;
  };
  const body = (!listing || listing.loading) ? `<div class="line sub">Reading…</div>`
    : ('error' in listing) ? `<div class="banner error">Could not read the folder: ${esc(listing.error)}</div><button class="small" data-action="browse-retry">Try again</button>`
    : (listing.entries.length < 1) ? `<div class="line sub">This folder is empty</div>`
    : listing.entries.map(entryHtml).join('');
  return `
    ${sheetTitleHtml(headingHtml(step.name, sub))}
    <div class="s-body">
      <div class="tree">${up}${body}</div>
      ${student ? `<div class="btn-row"><button data-action="copy-browse-folder">${icon('copy')}Copy folder link</button>${openLink(folderWebUrl(step.folderId), 'Open the folder in CharmIQ', 'Open folder')}</div>` : ''}
    </div>`;
};

// .. What changed ................................................................
const changedLinesHtml = (items: readonly ChangedItem[]) => items.map(item => `<div class="line">${icon('doc')}<a class="link t trunc" href="${esc(item.url)}" target="_blank" rel="noopener" title="${esc(item.name)}">${esc(item.name)}</a><span class="when">${esc(formatWhen(item.updateTimestamp))}</span></div>`).join('');

const changesSheetHtml = (student: Student) => {
  const result = changes.get(student.id);
  const data = studentData(student);
  let sub = 'reading…';
  let body = `<div class="line sub">Reading ${esc(student.name)}'s folder…</div>`;
  if(result && ('error' in result)) {
    sub = 'could not be read';
    body = `<div class="banner error">Could not read ${esc(student.name)}'s folder: ${esc(result.error)}</div>`;
  } else if(result && !('loading' in result)) {
    sub = `checked ${formatWhen(result.checkedAt)}`;
    const nothing = (result.edited.length < 1) && (result.madeByStudent.length < 1) && (result.missing.length < 1);
    body = nothing ? `<div class="line">${icon('check')}<span class="t">Nothing changed since the workshop last wrote it</span></div>` : `
      ${(result.edited.length > 0) ? `<h3>Edited · ${result.edited.length}</h3>${changedLinesHtml(result.edited)}` : ''}
      ${(result.madeByStudent.length > 0) ? `<h3>Made by ${esc(student.name)} · ${result.madeByStudent.length}</h3>${changedLinesHtml(result.madeByStudent)}` : ''}
      ${(result.missing.length > 0) ? `<h3>Gone from the folder · ${result.missing.length}</h3>${result.missing.map(name => `<div class="line">${icon('doc')}<span class="t trunc sub" title="${esc(name)}">${esc(name)}</span><span class="chip gone">gone</span></div>`).join('')}<div class="hint">Deleted or moved out; the next sync recreates them</div>` : ''}`;
  } /* else -- reading */
  const reads = (result && !('loading' in result) && !('error' in result)) ? `<span class="sub">${plural(result.reads, 'read')}</span>` : '<span></span>';
  return `
    ${sheetTitleHtml(headingHtml(`What changed — ${student.name}`, sub))}
    <div class="s-body">
      ${body}
      <div class="s-foot">${reads}<button class="small" data-action="check-again" ${data} ${(result && ('loading' in result)) ? 'disabled' : ''}>${icon('history')}Check again</button></div>
    </div>`;
};

const sheetBodyHtml = (sheet: Sheet) => {
  const student = ('studentId' in sheet) && sheet.studentId ? (state.students.find(candidate => (candidate.id === sheet.studentId)) ?? null) : null/*not about a student*/;
  if(sheet.kind === SheetKind.Settings) return settingsSheetHtml();
  if(sheet.kind === SheetKind.AddStudent) return addStudentSheetHtml();
  if(sheet.kind === SheetKind.Browse) return browseSheetHtml(sheet);
  if(!student) return `${sheetTitleHtml(headingHtml('Student'))}<div class="s-body"><div class="line sub">That student is no longer in the roster</div></div>`;
  if(sheet.kind === SheetKind.Student) return studentSheetHtml(student);
  if(sheet.kind === SheetKind.RenameStudent) return renameSheetHtml(student);
  return changesSheetHtml(student);
};

const sheetHtml = () => {
  const sheet = topSheet();
  if(!sheet) return '';
  return `<div class="scrim" data-action="close-all-sheets"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab narrow-only"></div>${sheetBodyHtml(sheet)}</div>`;
};

// -- Page ------------------------------------------------------------------------
const render = () => {
  const app = elementById('app');
  if(!window.charmiq) { app.innerHTML = `<div class="banner error">This application must run embedded in a CharmIQ document.</div>`; return; }
  if(!stateKnown && stateFailure) { app.innerHTML = `<div class="banner error">The workshop could not be read: ${esc(stateFailure)}. Reload the page to try again.</div>`; return; }
  if(!stateKnown) { app.innerHTML = `<div class="banner">Loading…</div>`; return; }

  // the innerHTML replacement destroys the scrollers: their positions carry across
  const rosterTop = app.querySelector('.roster-scroll')?.scrollTop ?? 0;
  const sheetTop = document.querySelector('.s-body')?.scrollTop ?? 0;

  const problem = configProblem();
  const active = state.students.filter(student => !student.deleted).length;
  const deleted = state.students.length - active;
  const busy = (busyStudentId !== null);
  app.innerHTML = `
    ${services.command ? '' : `<div class="banner error">The Command service is unavailable — syncing is disabled. Check the application's granted permissions and reload.</div>`}
    <div class="card roster-card">
      <div class="card-header">
        <h2>Students</h2>
        <span class="sub wide-only">${active} active${(deleted > 0) ? ` · ${deleted} deleted` : ''}</span>
        <button class="small wide-only" data-action="sync-all" ${(busy || problem) ? 'disabled' : ''} title="${esc(problem?.message ?? 'Sync every active student, one at a time')}">${icon('sync')}Sync All</button>
        <button class="small settings-button" data-action="open-settings" title="Settings">${icon('settings')}<span class="wide-only">Settings</span></button>
      </div>
      <div class="summary narrow-only">${summaryHtml(active)}</div>
      <div class="card-body">
        ${problem ? `<div class="banner${(problem.severity === ProblemSeverity.Error) ? ' error' : ''}">${esc(problem.message)}</div>` : ''}
        ${watchStripHtml()}
        <div class="roster-scroll">
          <div class="roster-head wide-only">${headCellHtml(SortKey.Name, 'Student')}${headCellHtml(SortKey.Synced, 'Status')}<span class="head-cell end">Folder</span></div>
          ${(state.students.length > 0) ? sortedStudents().map(rowHtml).join('') : `<div class="empty-roster sub">No students yet — add the first one.</div>`}
        </div>
        <div class="add-row wide-only"><button class="primary" data-action="open-add-student">${icon('personAdd')}Add student</button></div>
      </div>
    </div>
    <div class="bottom-bar narrow-only">
      <button data-action="open-add-student">${icon('personAdd')}Add student</button>
      <button class="primary" data-action="sync-all" ${(busy || problem) ? 'disabled' : ''}>${icon('sync')}${busy ? 'Syncing…' : 'Sync All'}</button>
    </div>`;
  elementById('sheet').innerHTML = sheetHtml();

  const roster = app.querySelector('.roster-scroll');
  if(roster) roster.scrollTop = rosterTop;
  const sheetBody = document.querySelector('.s-body');
  if(sheetBody) sheetBody.scrollTop = sheetTop;

  bindInputs();
};

// -- Event Wiring ----------------------------------------------------------------
const copyLink = async (url: string, label: string) => {
  try { await navigator.clipboard.writeText(url); toast(`${label} link copied`); }
  catch { toast(`Could not copy the link — here it is: ${url}`, { error: true }); }
};

const toggleOutOfSync = (studentId: string) => {
  outOfSyncOpenFor = (outOfSyncOpenFor === studentId) ? null/*closes*/ : studentId;
  render();
  const student = state.students.find(candidate => (candidate.id === studentId));
  if(!outOfSyncOpenFor || !student) return;
  resolveOutOfSyncNames(student).then(() => { if(outOfSyncOpenFor === studentId) render(); });
};

const openBrowse = (student: Student) => {
  if(!student.folderId) return;
  pushSheet({ kind: SheetKind.Browse, path: [{ folderId: student.folderId, name: student.folderName ?? student.name }], studentId: student.id });
  loadListing(student.folderId);
};

const openWhatChanged = (student: Student) => {
  pushSheet({ kind: SheetKind.Changes, studentId: student.id });
  runChanges(student)/*opening it is asking*/;
};

// one click handler for the page and its sheets: the innermost element naming an
// action takes the click, so a button inside a row is never the row's tap. a link
// without an action opens where it points
const onClick = (event: MouseEvent) => {
  if(!(event.target instanceof Element)) return;
  const element = event.target.closest<HTMLElement>('[data-action], a');
  if(!element || !element.dataset.action) return/*nothing to do, or a link opening*/;
  if((element instanceof HTMLButtonElement) && element.disabled) return;
  const action = element.dataset.action;
  const student = state.students.find(candidate => (candidate.id === element.dataset.studentId)) ?? null/*not about a student*/;
  const field = element.dataset.field;
  const sheet = topSheet();

  if(action === 'open-student') { if(student && isNarrow()) pushSheet({ kind: SheetKind.Student, studentId: student.id }); }
  else if(action === 'row-menu') { menuFor = (student && (menuFor !== student.id)) ? student.id : null/*closes*/; render(); }
  else if(action === 'copy-link') { if(student?.folderId) copyLink(folderWebUrl(student.folderId), `${student.name}'s folder`); }
  else if(action === 'browse') { if(student) openBrowse(student); }
  else if(action === 'sync-student') { menuFor = null/*closes*/; if(student) syncStudentNow(student.id); }
  else if(action === 'what-changed') { if(student) openWhatChanged(student); }
  else if(action === 'check-again') { if(student) runChanges(student); }
  else if(action === 'mark-seen') { menuFor = null/*closes*/; render(); if(student) markSeen(student.id); }
  else if(action === 'rename-student') { if(student) pushSheet({ kind: SheetKind.RenameStudent, studentId: student.id }); }
  else if(action === 'save-rename') { if(student) saveStudentRename(student.id, inputById('rename-input')?.value ?? ''); }
  else if(action === 'delete-student') { menuFor = null/*closes*/; render(); if(student) markStudentDeleted(student.id, true); }
  else if(action === 'restore-student') { if(student) markStudentDeleted(student.id, false); }
  else if(action === 'toggle-outofsync') { if(student) toggleOutOfSync(student.id); }
  else if(action === 'sync-all') syncAll();
  else if(action === 'sort') { const key = element.dataset.sortKey; if(isSortKey(key)) { sort = (sort.key === key) ? { key, dir: (sort.dir === 1) ? -1 : 1 } : { key, dir: 1 }; render(); } }
  else if(action === 'refresh-watched') refreshWatched();
  else if(action === 'open-settings') pushSheet({ kind: SheetKind.Settings });
  else if(action === 'open-add-student') { pushSheet({ kind: SheetKind.AddStudent }); inputById('add-user-input')?.focus(); }
  else if(action === 'add-draft-student') addDraftStudent();
  else if(action === 'clear-add-user') { addDraft = { ...addDraft, user: null/*choose again*/ }; render(); inputById('add-user-input')?.focus(); }
  else if(action === 'close-sheet') closeSheet();
  else if(action === 'close-all-sheets') { sheetStack = []; editingField = null/*closes*/; editError = null/*nothing to report*/; ownerPickerOpen = false; render(); }
  else if(action === 'edit') { editingField = isConfigField(field) ? field : null/*not a configuration row*/; editError = null/*a fresh editor*/; render(); inputById('edit-input')?.focus(); }
  else if(action === 'cancel-edit') { editingField = null/*closes*/; editError = null/*nothing to report*/; render(); }
  else if(action === 'save-edit') saveConfigEdit(inputById('edit-input')?.value ?? '');
  else if(action === 'refresh-folder') { if((field === ConfigField.Template) || (field === ConfigField.Classroom)) refreshFolderName(field); }
  else if(action === 'copy-config-folder') { if((field === ConfigField.Template) || (field === ConfigField.Classroom)) { const folderId = state.config[FOLDER_FIELDS[field].idKey]; if(folderId) copyLink(folderWebUrl(folderId), `The ${FOLDER_FIELDS[field].label}'s`); } }
  else if(action === 'open-owner-picker') { ownerPickerOpen = true; render(); inputById('owner-picker-input')?.focus(); }
  else if(action === 'close-owner-picker') { ownerPickerOpen = false; render(); }
  else if(action === 'remove-owner') removeOwner(element.dataset.userId ?? '');
  else if(action === 'watch-a-file') { if(state.config.templateFolderId) { pushSheet({ kind: SheetKind.Browse, path: [{ folderId: state.config.templateFolderId, name: state.config.templateFolderName ?? 'Template' }], studentId: null/*the Template*/ }); loadListing(state.config.templateFolderId); } }
  else if(action === 'unwatch-file') unwatchFile(element.dataset.uri ?? '');
  else if(action === 'watch-file') watchFile(element.dataset.uri ?? '', element.dataset.name ?? '');
  else if((action === 'browse-into') && (sheet?.kind === SheetKind.Browse)) { const folderId = element.dataset.folderId ?? ''; replaceTopSheet({ ...sheet, path: [...sheet.path, { folderId, name: element.dataset.name ?? '' }] }); loadListing(folderId); }
  else if((action === 'browse-up') && (sheet?.kind === SheetKind.Browse)) replaceTopSheet({ ...sheet, path: sheet.path.slice(0, -1) });
  else if((action === 'browse-retry') && (sheet?.kind === SheetKind.Browse)) loadListing(sheet.path[sheet.path.length - 1].folderId, true/*read again*/);
  else if((action === 'copy-browse-folder') && (sheet?.kind === SheetKind.Browse)) { const step = sheet.path[sheet.path.length - 1]; copyLink(folderWebUrl(step.folderId), step.name); }
};

// a press outside an open menu, popover or editor closes it
const onPointerDown = (event: Event) => {
  if(!(event.target instanceof Element)) return;
  const target = event.target;
  let changed = false;
  if(menuFor && !target.closest('.menu, [data-action="row-menu"]')) { menuFor = null/*closes*/; changed = true; }
  if(outOfSyncOpenFor && !target.closest('.outofsync-popover, [data-action="toggle-outofsync"]')) { outOfSyncOpenFor = null/*closes*/; changed = true; }
  if(editingField && !target.closest('.cfg-edit, [data-action="edit"], .modal-overlay')) { editingField = null/*closes*/; editError = null/*nothing to report*/; changed = true; }
  if(changed) render();
};

// Escape closes what is on top: a menu or popover, then the top sheet
const onKeyDown = (event: KeyboardEvent) => {
  if((event.key !== 'Escape') || document.querySelector('.modal-overlay')) return/*a confirmation handles its own*/;
  if(menuFor || outOfSyncOpenFor) { menuFor = null/*closes*/; outOfSyncOpenFor = null/*closes*/; render(); return; }
  if(editingField) { editingField = null/*closes*/; editError = null/*nothing to report*/; render(); return; }
  if(topSheet()) closeSheet();
};

// the inputs a render drew: Enter saves, and the searches attach
const bindInputs = () => {
  const editInput = inputById('edit-input');
  editInput?.addEventListener('keydown', (event) => { if(event.key === 'Enter') saveConfigEdit(editInput.value); });

  const renameInput = inputById('rename-input');
  const renaming = topSheet();
  renameInput?.addEventListener('keydown', (event) => { if((event.key === 'Enter') && (renaming?.kind === SheetKind.RenameStudent)) saveStudentRename(renaming.studentId, renameInput.value); });

  const addName = inputById('add-name');
  addName?.addEventListener('input', () => {
    addDraft = { ...addDraft, name: addName.value };
    // the button follows the name without a render (the input keeps its focus)
    const addButton = document.querySelector<HTMLButtonElement>('[data-action="add-draft-student"]');
    if(!addButton) return;
    addButton.disabled = !(addDraft.user && addDraft.name.trim());
    addButton.innerHTML = `<span class="trunc">Add ${esc(addDraft.name.trim() || 'student')}</span>`;
  });
  addName?.addEventListener('keydown', (event) => { if(event.key === 'Enter') addDraftStudent(); });

  const addUserInput = inputById('add-user-input');
  const addUserMenu = document.getElementById('add-user-menu');
  if(addUserInput && addUserMenu) attachUserTypeahead(addUserInput, addUserMenu, (user) => {
    addDraft = { user, name: addDraft.name.trim() ? addDraft.name : user.name/*the profile's, until changed*/ };
    render();
    inputById('add-name')?.focus();
  });

  const ownerInput = inputById('owner-picker-input');
  const ownerMenu = document.getElementById('owner-picker-menu');
  if(ownerInput && ownerMenu) attachUserTypeahead(ownerInput, ownerMenu, addOwner);
};

// == Boot ========================================================================
const boot = async () => {
  render()/*the loading shell*/;
  if(!window.charmiq) return;

  try { services.command = await platform().discover<CharmIQCommandService>('charmiq.service.command'); }
  catch { services.command = null/*syncing is disabled: the banner says so*/; }
  try { services.userProfile = await platform().discover<CharmIQUserProfileService>('charmiq.service.user-profile'); }
  catch { services.userProfile = null/*adding people is disabled: the hint says so*/; }
  followSignedInUser();

  document.addEventListener('click', onClick);
  document.addEventListener('mousedown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  // the layout swaps at the narrow width: what a tap does changes with it
  window.matchMedia(NARROW_QUERY).addEventListener('change', () => { menuFor = null/*closes*/; render(); });

  // the app-state is the truth: its first state opens the workshop (and its first
  // read of the watched files), and every later one (another person's change, or this
  // page's own write coming back) replaces what shows. an unreadable state is never
  // read as an empty workshop
  platform().appState.onChange$().subscribe({
    next: (incoming) => {
      const opening = !stateKnown;
      state = normalizeState(incoming);
      stateKnown = true;
      publishWorkshopData();
      if(opening) { advertiseWorkshopData(); exportWorkshopCommands(); refreshWatched(); }
      const json = JSON.stringify(state);
      if(json === shownJson) return/*an equal state: nothing to redraw*/;
      shownJson = json;
      render();
    },
    error: (error) => {
      stateFailure = errorMessage(error);
      if(!stateKnown) render()/*the workshop never opened: the page says why*/;
      else toast(`The workshop stopped updating: ${stateFailure}. Reload to see the latest.`, { error: true });
    },
  });
};

boot();
