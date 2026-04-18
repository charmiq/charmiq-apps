import { race, timer, Observable, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

import { parseName, type TabId, type TabSlug } from './tab-types';

// bridges the CodeMirror editor ↔ appContent OT layer. Owns the discovery phase
// (wait for initial content to settle) and the forward/apply logic for incremental
// edits. Parses raw `name` into `{ slug, displayName }` so nothing downstream
// has to know about the tuple form.
// ********************************************************************************

// NOTE: `deleted=true` events are NON-AUTHORITATIVE — the Platform fires them as
//       bookkeeping (e.g. during first-save block creation, or whenever pending
//       postMessage events drain after an unrelated `appState.set`). Honoring them
//       literally will blow up the local tab set. The bridge filters them out
//       entirely; TabManager drives local removals proactively before calling
//       `remove()` so we never need the flag anyway. See the referenced memory
//       note and apps/custom-drawing/src/content-bridge.ts for the same pattern

// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

// == Types =======================================================================
/** shape of an appContent change event with the raw name pre-parsed into its
 *  identity tuple. `slug` is null only for legacy slug-less content awaiting
 *  migration — see TabManager for that flow. There is no `deleted` field:
 *  the bridge filters bookkeeping deletions before they reach a listener */
export interface ContentChange {
  readonly id: TabId;
  readonly slug: TabSlug | null;
  readonly displayName: string;
  readonly content: string;
}

// ................................................................................
/** callback for remote changes arriving from appContent */
type RemoteChangeCallback = (change: ContentChange) => void;

// == Charmiq API (global) ========================================================
/** the raw shape emitted by the platform stream; ContentBridge translates it
 *  into the parsed `ContentChange` above before forwarding */
interface RawContentChange {
  readonly id: TabId;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

interface CharmiqAppContent {
  onChange$(): Observable<RawContentChange>;
  applyChanges(changes: ReadonlyArray<{ from: number; to: number; insert: string; }>, selector: string): Promise<void>;
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

      // subscribe to all app-content changes (discovery + ongoing updates). The
      // platform stream carries the raw name; parse into the identity tuple before
      // anyone downstream sees it
      this.appContent.onChange$().subscribe((raw: RawContentChange) => {
        contentReceived$.next();/*signal that content arrived (incl. bookkeeping)*/

        // filter out platform bookkeeping deletions — see module header. Local
        // removals are driven proactively by TabManager, so we genuinely have
        // no use for these events
        if(raw.deleted) return;

        if(this.onRemoteChange) {
          const { slug, displayName } = parseName(raw.name);
          this.onRemoteChange({
            id: raw.id,
            slug,
            displayName,
            content: raw.content
          });
        } /* else -- no listener registered */
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
  public forwardChange(tabId: TabId, from: number, to: number, insertedText: string): void {
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
