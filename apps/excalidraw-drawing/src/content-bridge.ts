import type { AppContentAPI } from '../../../shared/charmiq';
import { parseRecord } from '/shared/line-records/line-records';
import { RecordSync } from '/shared/line-records/record-sync';

// bridges the Excalidraw scene <-> appContent. The scene is the Application's
// app-content named `scene`, one record per line: the scene's settings, each image file, each
// library item, then each element. An element's place in the drawing is its own
// fractional `index` (equal indices: by id), so a reorder is a change to the element
// like any other, and every client draws one order; the element lines follow it.
// Adding an element appends its line, so a file's line (an image, often megabytes)
// is never rewritten by it. The records are kept in step with the canvas by id (SEE:
// RecordSync).
// The document is the authority: an element another writer changed is shown as the
// document holds it, Platform Undo included. Only where this client still holds its
// own change to that element does Excalidraw's rule decide which stands -- the higher
// `version` (an equal version: the lower `versionNonce`) -- and an element this
// client is editing right now stays as it is here.
// A deleted element stays as a line marked `isDeleted` (so a stale copy of it never
// returns), and is dropped once deleted for longer than a day.
// An app-content of another name (an older drawing's single scene object) is
// neither read nor written.
// The drawing opens through Excalidraw's own load (`loadScene` as its initialData,
// restored as any scene it loads), and nothing is saved until the canvas holds it:
// a canvas still opening is never taken for one the User emptied
// ********************************************************************************
// == Constants ===================================================================
/** the name a new drawing's app-content is created with */
const SCENE_NAME = 'scene';
/** how long a deleted element's line is kept: as long as Excalidraw's own
 *  collaboration keeps it, for a stale copy to meet */
const DELETED_ELEMENT_KEPT_MS = 24 * 60 * 60 * 1000/*one day*/;
/** the quiet period after the scene's last change before it is saved: Excalidraw
 *  reports a change on every pointer move */
const SAVE_DEBOUNCE_MS = 500/*ms*/;

// == Types =======================================================================
/** the parts of an Excalidraw element this bridge reads */
export type SceneElement = Readonly<{ id: string; version: number; versionNonce: number; index?: string | null; isDeleted?: boolean; updated?: number; }> & Readonly<Record<string, unknown>>;
/** an image file the scene's elements show */
export type SceneFile = Readonly<{ id: string; mimeType: string; dataURL: string; created?: number; }> & Readonly<Record<string, unknown>>;
/** a library item the drawing keeps */
export type LibraryItem = Readonly<{ id: string; }> & Readonly<Record<string, unknown>>;
/** the scene's settings the drawing keeps */
export type SceneSettings = Readonly<{ viewBackgroundColor?: string; }>;

/** one line of the scene */
export type SceneRecord =
  | Readonly<{ scene: SceneSettings; }>
  | Readonly<{ file: SceneFile; }>
  | Readonly<{ library: LibraryItem; }>
  | Readonly<{ element: SceneElement; }>;

/** a scene as Excalidraw serializes one: what `getText` gives and `setText` takes */
export type SceneJson = Readonly<{
  elements?: ReadonlyArray<SceneElement>;
  appState?: SceneSettings & Readonly<Record<string, unknown>>;
  files?: Readonly<Record<string, SceneFile>>;
  libraryItems?: ReadonlyArray<LibraryItem>;
}>;

// ................................................................................
/** Excalidraw API surface used by this module */
export interface ExcalidrawAPI {
  updateScene(scene: Readonly<{ elements?: ReadonlyArray<unknown>; appState?: Record<string, unknown>; captureUpdate?: 'IMMEDIATELY' | 'NEVER' | 'EVENTUALLY'; }>): void;
  updateLibrary(opts: Readonly<{ libraryItems: unknown; merge: boolean; }>): void | Promise<unknown>;
  addFiles(files: ReadonlyArray<unknown>): void;
  getSceneElements(): ReadonlyArray<unknown>;
  getSceneElementsIncludingDeleted(): ReadonlyArray<unknown>;
  getAppState(): Record<string, unknown>;
  getFiles(): Record<string, unknown>;
}

// == Class =======================================================================
/** follows the drawing's app-content and saves the scene onto it by record id */
export class ContentBridge {
  private readonly sync: RecordSync<SceneRecord>;
  private api: ExcalidrawAPI | null = null;
  private libraryItems: ReadonlyArray<LibraryItem> = [];
  private onSaveFailed: ((failure: unknown) => void) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** the drawing as first read (SEE: follow) */
  private followed: Promise<void> | null = null;
  /** the records last shown, kept while the canvas cannot show them yet */
  private latest: ReadonlyArray<SceneRecord> = [];
  /** the canvas has been handed the drawing to open with */
  private loaded = false;
  /** the canvas holds the drawing: changes are shown on it and it is saved */
  private live = false;
  /** a change arrived after the drawing was handed over and before it was shown */
  private stale = false;
  /** the drawing could not be read: it is never saved */
  private unreadable = false;

  // == Lifecycle =================================================================
  public constructor(appContent: AppContentAPI) {
    this.sync = new RecordSync<SceneRecord>(appContent, `[name='${SCENE_NAME}']`, SCENE_NAME, {
      idOf: recordId,
      fromLine: recordOf,
      lineOf: record => JSON.stringify(record),
      merge: (mine, theirs) => (('element' in mine) && ('element' in theirs) && (this.editing().has(mine.element.id) || newer(mine.element, theirs.element))) ? mine : theirs,
      wins: (mine, theirs) => !(('element' in mine) && ('element' in theirs)) || newer(mine.element, theirs.element),
      // an element changes only with its version, as Excalidraw versions every change:
      // Excalidraw's own normalization as it loads one (an empty `boundElements`) is
      // not a change to write
      unchanged: (record, other) => ('element' in record) && ('element' in other) && (record.element.version === other.element.version) && (record.element.versionNonce === other.element.versionNonce),
    }, {
      reload: 'This page cannot save the drawing safely. Reload it to keep drawing.',
      failed: 'The drawing could not be saved. Try again.',
      changing: 'The drawing kept changing while it was saved. Your last change was not saved; it is saved with your next one.',
      stale: 'The drawing did not update. Reload to see the latest.',
    });
    this.sync.setCurrentRecords(() => this.records());
    this.sync.onChange(records => this.show(records));
  }

  /** provide the Excalidraw API once it is ready */
  public setAPI(api: ExcalidrawAPI): void { this.api = api; }
  /** register the callback for a save or a read that failed */
  public onFailure(callback: (failure: unknown) => void): void {
    this.onSaveFailed = callback;
    this.sync.onReadFailure(callback);
    this.sync.onSaveFailure(callback);
  }

  /** follows the drawing: resolves once it is first read, rejects when the read is
   *  refused */
  public follow(): Promise<void> {
    this.followed ??= this.sync.follow().catch(failure => { this.unreadable = true; throw failure; });
    return this.followed;
  }

  /** the drawing to open with (Excalidraw's initialData): every element, deleted
   *  ones included, in drawing order. A drawing that cannot be read opens empty and
   *  is never saved */
  public async loadScene(): Promise<Readonly<{ elements: SceneElement[]; appState: SceneSettings; files: Record<string, SceneFile>; libraryItems: LibraryItem[]; }>> {
    const read = await this.follow().then(() => true, () => false/*shown by onFailure*/);
    const records = read ? this.latest : [];
    this.libraryItems = records.flatMap(record => ('library' in record) ? [record.library] : []);
    this.loaded = read;
    return {
      elements: inDrawingOrder(records.flatMap(record => ('element' in record) ? [record.element] : [])),
      appState: records.find((record): record is Readonly<{ scene: SceneSettings; }> => 'scene' in record)?.scene ?? {},
      files: Object.fromEntries(records.flatMap(record => ('file' in record) ? [[record.file.id, record.file]] : [])),
      libraryItems: [ ...this.libraryItems ],
    };
  }

  /** the library items installed in the drawing (Excalidraw's `onLibraryChange`) */
  public setLibraryItems(items: ReadonlyArray<LibraryItem>): void {
    if(!this.live) return/*Excalidraw loading the drawing's own library*/;
    this.libraryItems = items;
    void this.save();
  }

  /** the scene changed here (Excalidraw's `onChange`): saved once it settles. The
   *  first change after the drawing was handed over is Excalidraw showing it */
  public sceneChanged(): void {
    if(!this.loaded) return/*the canvas is still opening*/;
    if(!this.live) {
      this.live = true;
      if(this.stale) { this.stale = false; this.show(this.latest)/*what arrived while it opened*/; }
      return;
    } /* else -- the User's change */
    if(this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.save(); }, SAVE_DEBOUNCE_MS);
  }

  /** saves the scene as it is now; a failure also reaches `onFailure`. Nothing is
   *  saved until the canvas holds the drawing */
  public save(): Promise<void> {
    if(!this.live) return Promise.resolve()/*the canvas is still opening*/;
    const saving = this.sync.save();
    saving.catch(failure => this.onSaveFailed?.(failure));
    return saving;
  }

  // == Scene JSON ================================================================
  /** the scene as Excalidraw serializes one: its elements (deleted ones left out),
   *  settings, files and library */
  public getSceneJson(): string {
    const records = this.records();
    return JSON.stringify(sceneJsonOf(records), null, 2);
  }

  /** replaces the scene with the one given: each element it holds stands (its
   *  version above any other), and every element it does not hold is deleted.
   *  Refused, changing nothing, until the canvas holds the drawing */
  public async setSceneJson(text: string): Promise<void> {
    if(this.unreadable) throw new Error('The drawing could not be read, so nothing was changed.');
    if(!this.live || !this.api) throw new Error('The drawing is still opening, so nothing was changed. Try again once it shows.');
    const scene = JSON.parse(text) as SceneJson;
    const current = new Map((this.api.getSceneElementsIncludingDeleted() as ReadonlyArray<SceneElement>).map(element => [element.id, element]));
    const given = (scene.elements ?? []).map(element => bumped(element, current.get(element.id)));
    const kept = new Set(given.map(element => element.id));
    const removed = [...current.values()].filter(element => !kept.has(element.id) && !element.isDeleted).map(element => ({ ...bumped(element, element), isDeleted: true }));
    if(scene.files) this.api.addFiles(Object.values(scene.files));
    if(scene.libraryItems) { this.libraryItems = scene.libraryItems; await this.api.updateLibrary({ libraryItems: scene.libraryItems, merge: false }); }
    this.api.updateScene({ elements: [ ...removed, ...given ], ...(scene.appState?.viewBackgroundColor ? { appState: { viewBackgroundColor: scene.appState.viewBackgroundColor } } : {}) });
    await this.save();
  }

  // == Internal ==================================================================
  /** the scene's records as the canvas holds them, deleted elements older than a
   *  day left out */
  private records(): SceneRecord[] {
    if(!this.live || !this.api) return [ ...this.latest ]/*still opening: the canvas is what was read*/;
    const now = Date.now();
    const background = this.api.getAppState().viewBackgroundColor;
    const elements = inDrawingOrder((this.api.getSceneElementsIncludingDeleted() as ReadonlyArray<SceneElement>)
      .filter(element => !element.isDeleted || ((element.updated ?? now) > (now - DELETED_ELEMENT_KEPT_MS))));
    const files = Object.values(this.api.getFiles() as Record<string, SceneFile>).map(storedFile);
    return [
      ...((typeof background === 'string') ? [{ scene: { viewBackgroundColor: background } }] : []),
      ...files.map(file => ({ file })),
      ...this.libraryItems.map(library => ({ library })),
      ...elements.map(element => ({ element })),
    ];
  }

  /** shows the records another writer's change left */
  private show(records: ReadonlyArray<SceneRecord>): void {
    this.latest = records;
    const api = this.api;
    if(!this.live || !api) { if(this.loaded) this.stale = true; return/*kept for the canvas once it opens*/; }

    const known = new Set(Object.keys(api.getFiles()));
    const files = records.flatMap(record => ('file' in record) && !known.has(record.file.id) ? [record.file] : []);
    if(files.length > 0) api.addFiles(files);

    const library = records.flatMap(record => ('library' in record) ? [record.library] : []);
    if(JSON.stringify(library) !== JSON.stringify(this.libraryItems)) {
      this.libraryItems = library;
      void api.updateLibrary({ libraryItems: library, merge: false });
    } /* else -- the library is unchanged */

    const settings = records.find((record): record is Readonly<{ scene: SceneSettings; }> => 'scene' in record)?.scene;
    api.updateScene({
      elements: inDrawingOrder(records.flatMap(record => ('element' in record) ? [record.element] : [])),
      ...(settings?.viewBackgroundColor ? { appState: { viewBackgroundColor: settings.viewBackgroundColor } } : {}),
      captureUpdate: 'NEVER'/*another writer's change: not this client's to undo*/,
    });
  }

  /** the ids of the elements this client is editing right now: being drawn,
   *  resized, its text or points edited, or dragged with the selection */
  private editing(): ReadonlySet<string> {
    const state = this.api?.getAppState() ?? {};
    const idOf = (element: unknown) => (element as { id?: unknown; } | null | undefined)?.id;
    const ids = [ idOf(state.newElement), idOf(state.resizingElement), idOf(state.editingTextElement), (state.editingLinearElement as { elementId?: unknown; } | null)?.elementId ];
    if(state.selectedElementsAreBeingDragged) ids.push(...Object.keys((state.selectedElementIds as Record<string, unknown> | undefined) ?? {}));
    return new Set(ids.filter((id): id is string => typeof id === 'string'));
  }
}

// == Records =====================================================================
/** whether `a` stands over `b`, two versions of one element: the higher version,
 *  or at an equal version the lower nonce (Excalidraw's own collaboration rule) */
const newer = (a: SceneElement, b: SceneElement): boolean =>
  (a.version > b.version) || ((a.version === b.version) && (a.versionNonce <= b.versionNonce));

/** elements in drawing order: by fractional index, equal indices by id. Elements
 *  from before indices (an older drawing) keep the order they are in */
const inDrawingOrder = (elements: ReadonlyArray<SceneElement>): SceneElement[] => {
  if(!elements.every(element => typeof element.index === 'string')) return [ ...elements ];
  return [ ...elements ].sort((a, b) => (a.index! < b.index!) ? -1 : (a.index! > b.index!) ? 1 : (a.id < b.id) ? -1 : (a.id > b.id) ? 1 : 0);
};

/** an element given by a scene, versioned above the element of its id */
const bumped = (element: SceneElement, current: SceneElement | undefined): SceneElement => ({
  ...element,
  version: Math.max(element.version ?? 0, current?.version ?? 0) + 1,
  versionNonce: Math.floor(Math.random() * 2 ** 31),
  updated: Date.now(),
});

/** a file as the drawing keeps it: without when it was last read here */
const storedFile = (file: SceneFile): SceneFile => {
  const { lastRetrieved: _lastRetrieved, ...stored } = file;
  return stored as SceneFile;
};

const recordId = (record: SceneRecord): string =>
    ('scene' in record) ? 'scene'
  : ('file' in record) ? `file:${record.file.id}`
  : ('library' in record) ? `library:${record.library.id}`
  : `element:${record.element.id}`;

const hasId = (value: unknown): boolean => (typeof (value as { id?: unknown; } | null)?.id === 'string');

/** the record a line holds, or null for a line that is not one */
const recordOf = (line: string): SceneRecord | null => {
  const record = parseRecord(line);
  if(!record) return null;
  if(('scene' in record) && record.scene && (typeof record.scene === 'object')) return record as SceneRecord;
  if(('file' in record) && hasId(record.file)) return record as SceneRecord;
  if(('library' in record) && hasId(record.library)) return record as SceneRecord;
  if(('element' in record) && hasId(record.element)) return record as SceneRecord;
  return null;
};

/** the scene as Excalidraw serializes one, from its records */
const sceneJsonOf = (records: ReadonlyArray<SceneRecord>): SceneJson => ({
  elements: records.flatMap(record => ('element' in record) && !record.element.isDeleted ? [record.element] : []),
  appState: records.find((record): record is Readonly<{ scene: SceneSettings; }> => 'scene' in record)?.scene ?? {},
  files: Object.fromEntries(records.flatMap(record => ('file' in record) ? [[record.file.id, record.file]] : [])),
  libraryItems: records.flatMap(record => ('library' in record) ? [record.library] : []),
});
