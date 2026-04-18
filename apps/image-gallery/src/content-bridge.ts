import { race, timer, Observable, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

// bridges gallery data (items + slot bindings) to the OT-backed appContent
// layer. Two named blocks are maintained
//   items    -- the collection (one GalleryItem per JSONL line)
//   bindings -- (only when slot mode is active) one BindingRecord per JSONL
//               line. Empty bindings (itemId=null) are persisted so slot
//               ordering stays stable even for unbound slots
//
// The bridge owns the discovery phase (waits for initial content to settle
// on startup) and routes remote updates back to the app via typed callbacks.
// Writes are full-replace (not incremental) per block — gallery operations
// are discrete (add item, bind slot) so per-keystroke OT is not needed here
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

/** selector + name for the items content block (the collection) */
const ITEMS_NAME = 'items';
const ITEMS_SELECTOR = `[name='${ITEMS_NAME}']`;

/** selector + name for the slot bindings content block */
const BINDINGS_NAME = 'bindings';
const BINDINGS_SELECTOR = `[name='${BINDINGS_NAME}']`;

// == Types =======================================================================
/** a single image in the gallery collection */
export interface GalleryItem {
  readonly itemId: string;
  readonly assetId: string;
  readonly downloadUrl: string;
  readonly name: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

// --------------------------------------------------------------------------------
/** a slot-to-item binding record (persisted even when unbound so slot order
 *  stays stable) */
export interface BindingRecord {
  readonly slotId: string;
  readonly itemId: string | null;
  readonly meta?: unknown;
}

// --------------------------------------------------------------------------------
/** shape of an inbound appContent change event */
interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// --------------------------------------------------------------------------------
type ItemsChangedCallback    = (items: ReadonlyArray<GalleryItem>) => void;
type BindingsChangedCallback = (bindings: ReadonlyArray<BindingRecord>) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
  remove(selector: string): Promise<void>;
}

// == Class =======================================================================
/** mediates items and bindings sync between the gallery and the OT-backed
 *  appContent store */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;

  private onItemsChanged:    ItemsChangedCallback    | null = null;
  private onBindingsChanged: BindingsChangedCallback | null = null;

  /** last-seen items snapshot, used to skip pure echo emissions */
  private itemsShadow:    string | null = null;
  /** last-seen bindings snapshot, used to skip pure echo emissions */
  private bindingsShadow: string | null = null;

  private discoveryDone = false;

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent) {
    this.appContent = appContent;
  }

  // ------------------------------------------------------------------------------
  /** register callback for remote items changes */
  public onItemsChange(cb: ItemsChangedCallback): void {
    this.onItemsChanged = cb;
  }

  /** register callback for remote bindings changes */
  public onBindingsChange(cb: BindingsChangedCallback): void {
    this.onBindingsChanged = cb;
  }

  // == Discover ==================================================================
  /** subscribe to appContent changes and wait for the discovery phase to
   *  settle. resolves when content has stopped arriving (200ms debounce) or
   *  after a 500ms no-content timeout */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      const contentReceived$ = new Subject<void>();

      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();
        this.handleInbound(change);
      });

      race(
        contentReceived$.pipe(debounceTime(DISCOVERY_DEBOUNCE_MS), take(1)),
        timer(DISCOVERY_TIMEOUT_MS).pipe(take(1))
      ).subscribe(() => {
        this.discoveryDone = true;
        resolve();
      });
    });
  }

  // == Outbound ==================================================================
  /** full-replace the items block with the given collection */
  public async saveItems(items: ReadonlyArray<GalleryItem>): Promise<void> {
    const jsonl = serialize(items);
    this.itemsShadow = jsonl;/*optimistic shadow — inbound echo is a no-op*/
    try {
      await this.appContent.set(jsonl, ITEMS_SELECTOR, ITEMS_NAME);
    } catch(error) {
      console.error('failed to save items to app-content:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** full-replace the bindings block with the given records */
  public async saveBindings(bindings: ReadonlyArray<BindingRecord>): Promise<void> {
    const jsonl = serialize(bindings);
    this.bindingsShadow = jsonl;
    try {
      await this.appContent.set(jsonl, BINDINGS_SELECTOR, BINDINGS_NAME);
    } catch(error) {
      console.error('failed to save bindings to app-content:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** clear the bindings block entirely. Used when the consumer reconfigures
   *  slots such that all previous bindings become meaningless */
  public async clearBindings(): Promise<void> {
    this.bindingsShadow = '';
    try {
      await this.appContent.remove(BINDINGS_SELECTOR);
    } catch(error) {
      console.error('failed to remove bindings block:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** true once initial discovery has completed (consumers should suppress
   *  writes until this flips) */
  public get isDiscoveryDone(): boolean { return this.discoveryDone; }

  // == Internal ==================================================================
  /** route an inbound content change to the right callback, skipping echoes */
  private handleInbound(change: ContentChange): void {
    if(change.name === ITEMS_NAME) {
      this.handleItemsInbound(change);
      return;
    }
    if(change.name === BINDINGS_NAME) {
      this.handleBindingsInbound(change);
      return;
    } /* else -- unrelated block */
  }

  // ------------------------------------------------------------------------------
  // block-level `deleted=true` events are treated as non-authoritative and
  // skipped. The platform fires them as bookkeeping during first-save block
  // creation (and potentially whenever the client has pending messages flushed
  // across the postMessage bridge), which would otherwise look like a spurious
  // "clear". For clears that are actually legit (clearBindings), the local model
  // and shadow are updated proactively, so this doesn't need the Platform flag to
  // drive state
  private handleItemsInbound(change: ContentChange): void {
    if(change.deleted) return/*bookkeeping — this never never calls remove() on items*/;
    const raw = change.content;
    if(raw === this.itemsShadow) return/*pure echo*/;

    this.itemsShadow = raw;
    const items = parseItems(raw);
    if(this.onItemsChanged) this.onItemsChanged(items);
  }

  // ------------------------------------------------------------------------------
  private handleBindingsInbound(change: ContentChange): void {
    if(change.deleted) return;/*bookkeeping — real clears are driven locally*/
    const raw = change.content;
    if(raw === this.bindingsShadow) return;/*pure echo*/

    this.bindingsShadow = raw;
    const bindings = parseBindings(raw);
    if(this.onBindingsChanged) this.onBindingsChanged(bindings);
  }
}

// == Serialization ===============================================================
/** JSON Lines — one record per line. Incremental edits produce localized
 *  diffs in the OT layer versus a single enclosing array */
const serialize = (records: ReadonlyArray<unknown>): string => {
  if(records.length < 1) return '';
  return records.map(r => JSON.stringify(r)).join('\n');
};

// --------------------------------------------------------------------------------
/** parse JSONL (with a backward-compatible branch for a single JSON array)
 *  into items. Malformed lines are skipped with a warning */
const parseItems = (content: string): ReadonlyArray<GalleryItem> => {
  const records = parseJsonl(content);
  const out: GalleryItem[] = [];
  for(const r of records) {
    if(!r || (typeof r !== 'object')) continue;/*skip malformed*/
    const v = r as Partial<GalleryItem>;
    if((typeof v.itemId !== 'string') || (v.itemId.length < 1)) continue;
    if((typeof v.assetId !== 'string') || (v.assetId.length < 1)) continue;
    if((typeof v.downloadUrl !== 'string') || (v.downloadUrl.length < 1)) continue;
    out.push({
      itemId:      v.itemId,
      assetId:     v.assetId,
      downloadUrl: v.downloadUrl,
      name:        (typeof v.name === 'string') ? v.name : '',
      mimeType:    (typeof v.mimeType === 'string') ? v.mimeType : 'image/*',
      width:       (typeof v.width === 'number') ? v.width : undefined,
      height:      (typeof v.height === 'number') ? v.height : undefined
    });
  }
  return out;
};

// --------------------------------------------------------------------------------
/** parse bindings JSONL into validated BindingRecord entries */
const parseBindings = (content: string): ReadonlyArray<BindingRecord> => {
  const records = parseJsonl(content);
  const out: BindingRecord[] = [];
  for(const r of records) {
    if(!r || (typeof r !== 'object')) continue/*skip malformed*/;
    const v = r as Partial<BindingRecord>;
    if((typeof v.slotId !== 'string') || (v.slotId.length < 1)) continue;
    const itemId = (typeof v.itemId === 'string') ? v.itemId : null;
    out.push({ slotId: v.slotId, itemId, meta: v.meta });
  }
  return out;
};

// --------------------------------------------------------------------------------
/** parse JSONL or a legacy single-line JSON array into a record list */
const parseJsonl = (content: string): unknown[] => {
  if(!content) return [];
  const trimmed = content.trim();
  if(trimmed.length < 1) return [];

  // legacy: whole thing is a JSON array
  if(trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch(error) {
      console.error('failed to parse JSON array from app-content:', error);
      return [];
    }
  } /* else -- treat as JSON Lines */

  const out: unknown[] = [];
  const lines = trimmed.split('\n');
  for(const line of lines) {
    const s = line.trim();
    if(s.length < 1) continue;/*skip blank lines*/
    try {
      out.push(JSON.parse(s));
    } catch(error) {
      console.error('failed to parse JSONL line:', s, error);
    }
  }
  return out;
};
