import { race, timer, Observable, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

// bridges the CodeMirror editor ↔ appContent OT layer. Owns the discovery phase
// (wait for initial content to settle) and the forward/apply logic for incremental
// edits
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

// == Types =======================================================================
/** shape of an appContent change event */
export interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// ................................................................................
/** callback for remote changes arriving from appContent */
type RemoteChangeCallback = (change: ContentChange) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  applyChanges(changes: ReadonlyArray<{ from: number; to: number; insert: string }>, selector: string): Promise<void>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
  remove(selector: string): Promise<void>;
}

// == Class =======================================================================
/** manages the OT content sync between the editor and appContent */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;
  private onRemoteChange: RemoteChangeCallback | null = null;
  private discoveryDone = false;

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent) {
    this.appContent = appContent;
  }

  /** register the callback for remote content changes */
  public onContentChange(cb: RemoteChangeCallback): void {
    this.onRemoteChange = cb;
  }

  /** subscribe to appContent changes and wait for the discovery phase to settle.
   *  resolves when discovery is complete (content has stopped arriving, or timeout) */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      // track whether any content arrived during discovery
      const contentReceived$ = new Subject<void>();

      // subscribe to all app-content changes (discovery + ongoing updates)
      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();/*signal that content arrived*/

        if(this.onRemoteChange) this.onRemoteChange(change);
      });

      // discovery is complete when either:
      // 1. content arrives and settles (200ms debounce), or
      // 2. no content at all after 500ms
      race(
        contentReceived$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => {
        this.discoveryDone = true;
        resolve();
      });
    });
  }

  // == Outbound (editor → appContent) ============================================
  /** forward a user edit to appContent as an OT change */
  public forwardChange(tabId: string, from: number, to: number, insertedText: string): void {
    if(!this.discoveryDone) return;/*ignore edits during discovery*/

    this.appContent.applyChanges(
      [{ from, to, insert: insertedText }],
      `[id='${tabId}']`
    ).catch((error: any) => {
      console.error('failed to apply changes to app-content:', error);
    });
  }

  // == Content CRUD (delegated to appContent) ====================================
  /** create or overwrite content for a tab */
  public async set(content: string | undefined, selector: string, name?: string): Promise<void> {
    await this.appContent.set(content, selector, name);
  }

  /** remove a content block */
  public async remove(selector: string): Promise<void> {
    await this.appContent.remove(selector);
  }
}
