import { race, timer, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { DiffConverter } from './diff-converter';
import type { OtChange } from './diff-converter';

// bridges the Excalidraw scene ↔ appContent OT layer. Owns inbound apply,
// outbound diff+send and the discovery/default-creation phase
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 1000/*ms*/;
/** ms to debounce outbound scene changes */
const OUTBOUND_DEBOUNCE_MS = 500/*ms*/;

/** maximum individual OT changes before consolidating into a single range */
const MAX_CHANGES_LIMIT = 10;

// == Types =======================================================================
/** shape of an appContent change event */
export interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// ................................................................................
/** Excalidraw API surface used by this module */
export interface ExcalidrawAPI {
  updateScene(scene: Readonly<{ elements?: any[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }>): void;
  updateLibrary(opts: Readonly<{ libraryItems: any; merge: boolean }>): void;
  getSceneElements(): any[];
  getAppState(): Record<string, unknown>;
  getFiles(): Record<string, unknown>;
}

// == Charmiq API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  applyChanges(changes: ReadonlyArray<OtChange>, selector: string): Promise<void>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
  remove(selector: string): Promise<void>;
}

// == Class =======================================================================
/** manages the OT content sync between Excalidraw and appContent */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;
  private readonly diffConverter: DiffConverter;

  private excalidrawAPI: ExcalidrawAPI | null = null;

  private currentContentId: string | null = null;
  private currentContent: string | null = null;
  private lastJSON: string = '';
  private currentLibraryItems: any[] = [];

  // synchronous re-entry guard — prevents handleSceneChange from firing while
  // updateScene() executes (Excalidraw fires onChange synchronously)
  private updating = false;

  private discoveryDone = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent) {
    this.appContent = appContent;
    this.diffConverter = new DiffConverter(MAX_CHANGES_LIMIT);
  }

  /** provide the Excalidraw API ref once it's ready */
  public setAPI(api: ExcalidrawAPI): void {
    this.excalidrawAPI = api;
  }

  /** provide library items from outside (onLibraryChange callback) */
  public setLibraryItems(items: any[]): void {
    this.currentLibraryItems = items;
  }

  /** subscribe to appContent changes and wait for the discovery phase to settle.
   *  Creates a default drawing if no content arrives */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      const contentReceived$ = new Subject<void>();

      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();/*signal that content arrived*/
        this.handleRemoteChange(change);
      });

      // discovery is complete when either:
      // 1. content arrives and settles (debounce) or
      // 2. no content at all after timeout
      race(
        contentReceived$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => {
        this.discoveryDone = true;

        // if no content arrived during discovery, create a default drawing
        if(!this.currentContentId) this.createDefaultDrawing();
        resolve();
      });
    });
  }

  // == Inbound (appContent → Excalidraw) =========================================
  /** handle an incoming remote change from appContent */
  private handleRemoteChange(change: ContentChange): void {
    if(change.deleted) {
      if(change.id === this.currentContentId) {
        this.currentContentId = null;
      } /* else -- deleted content isn't ours */
      return;
    } /* else -- not a deletion */

    // pick the first content id if none set yet
    if(!this.currentContentId) this.currentContentId = change.id;

    // only process updates for our current content
    if(change.id !== this.currentContentId) return;

    this.applyRemoteContent(change.content);
  }

  // ..............................................................................
  /** parse JSON from the server and push it into Excalidraw's scene */
  private applyRemoteContent(jsonString: string | null): void {
    if(this.updating) return/*re-entry guard — updateScene fires onChange synchronously*/;
    if(jsonString === this.lastJSON) return/*state comparison — content hasn't changed*/;

    // always update lastJSON to the server's value, even if this fails to parse. This ensures
    // outbound diffs are computed against the real server state, not a stale snapshot
    this.lastJSON = jsonString || '';
    this.currentContent = jsonString;

    if(!jsonString || !this.excalidrawAPI) return;

    try {
      const data = JSON.parse(jsonString);
      if(!data) return;

      this.updating = true;

      // update library if present and changed
      if(data.libraryItems) {
        if(JSON.stringify(data.libraryItems) !== JSON.stringify(this.currentLibraryItems)) {
          this.excalidrawAPI.updateLibrary({
            libraryItems: data.libraryItems,
            merge: false/*replace to match server state*/
          });
          this.currentLibraryItems = data.libraryItems;
        } /* else -- library unchanged */
      } /* else -- no library in payload */

      this.excalidrawAPI.updateScene({
        elements: data.elements || [],
        appState: data.appState,
        files: data.files
      });
      this.updating = false;
    } catch(error) {
      console.error('failed to parse remote content:', error);
      // don't reset `updating` — it was only set inside the try
    }
  }

  // == Outbound (Excalidraw → appContent) ========================================
  /** debounced handler for Excalidraw scene changes — diffs and sends OT changes */
  public handleSceneChange(elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>): void {
    if(this.updating || !this.currentContentId) return;

    // debounce outbound changes
    if(this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.sendSceneChange(elements, appState, files);
    }, OUTBOUND_DEBOUNCE_MS);
  }

  // ..............................................................................
  /** compute diff and send OT changes to appContent */
  private sendSceneChange(elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>): void {
    if(!this.currentContentId) return;

    const data = {
      elements,
      appState: {
        viewBackgroundColor: (appState as any).viewBackgroundColor
      },
      files,
      libraryItems: this.currentLibraryItems
    };

    // pretty-print to reduce OT conflicts (line-based diffs are safer for JSON)
    const newJSON = JSON.stringify(data, null, 2);
    if(newJSON === this.lastJSON) return;/*state comparison — no change*/

    const changes = this.diffConverter.convert(this.lastJSON || '', newJSON);
    if(changes.length < 1) return;

    // update lastJSON immediately to prevent race conditions
    this.lastJSON = newJSON;
    this.currentContent = newJSON;

    this.appContent.applyChanges(changes, `[id='${this.currentContentId}']`).catch((error: any) => {
      console.error('failed to apply changes:', error);
    });
  }

  // == Content CRUD ==============================================================
  /** directly set content (used by command surface setText) */
  public async setText(text: string): Promise<void> {
    if(!this.currentContentId) return;
    this.applyRemoteContent(text);
    await this.appContent.set(text, `[id='${this.currentContentId}']`);
  }

  // == Getters ===================================================================
  public getCurrentContent(): string | null { return this.currentContent; }
  public getCurrentContentId(): string | null { return this.currentContentId; }

  // == Internal ==================================================================
  /** create a default empty drawing if none exists */
  private async createDefaultDrawing(): Promise<void> {
    const uniqueName = `drawing-${Date.now()}`;
    const initialData = JSON.stringify({
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
      libraryItems: []
    }, null, 2);

    try {
      await this.appContent.set(initialData, `[name='${uniqueName}']`, 'Untitled Drawing');
    } catch(error) {
      console.error('failed to create initial content:', error);
    }
  }
}
