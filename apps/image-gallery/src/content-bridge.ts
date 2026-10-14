import type { AppContent, AppContentAPI } from '../../../shared/charmiq';
import { isConflict, parseRecord, recordLines, writeLines } from '/shared/line-records/line-records';

// the gallery's data lives in two kinds of named app-content, one record per line
// (JSON Lines)
//   items    -- the collection (one GalleryItem per line)
//   bindings -- (only when slots are configured) one BindingRecord per line.
//               Empty bindings (itemId=null) are kept so slot order stays stable
//
// The app-contents are the truth: the gallery shows what they hold, whoever changed
// them, its own writes included as they come back. Every write is made through the
// app-content shown and is refused whole when it has changed since. Each record has
// an id (an item's itemId, a binding's slotId), so a refused write is measured again
// by that id on the app-content as it is now: removing an item removes that item
// wherever it now stands, and never overwrites a line another writer changed.
// Adding an item appends its own line, which never depends on what the app-content
// holds. Two collaborators who each add the first image at once create two `items`
// app-contents: both are kept and shown (records are told apart by id), and a write
// goes to the app-content its record is in
// SEE: tutorials/03-writing-data for the line-record pattern, explained
// ********************************************************************************
// == Constants ===================================================================
const ITEMS_NAME = 'items';
const BINDINGS_NAME = 'bindings';

/** how many times a write is measured again after its app-content changed under it */
const EDIT_ATTEMPTS = 3;
/** how long a refused write waits for the app-content's newer revision: it reaches
 *  `contents$()` in one bridge round trip */
const NEWER_REVISION_WAIT_MS = 5_000/*ms*/;

/** the refusal on a page opened before `contents$()` */
const RELOAD = 'This page cannot make safe edits. Reload it to change the gallery.';

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
/** a write the gallery could not make: its message is shown to the User */
export class GalleryWriteError extends Error {}

// --------------------------------------------------------------------------------
type Kind = typeof ITEMS_NAME | typeof BINDINGS_NAME;
/** the full new lines of an app-content measured on its lines, or null to leave it */
type Measure = (lines: ReadonlyArray<string>) => ReadonlyArray<string> | null;

type ItemsChangedCallback    = (items: ReadonlyArray<GalleryItem>) => void;
type BindingsChangedCallback = (bindings: ReadonlyArray<BindingRecord>) => void;

// == Class =======================================================================
/** follows the gallery's app-contents and makes its writes through them */
export class ContentBridge {
  private readonly appContent: AppContentAPI;

  private readonly contents: Record<Kind, ReadonlyArray<AppContent>> = { items: [], bindings: [] };
  /** writes waiting for an app-content's newer revision */
  private readonly waiting = new Set<() => void>();

  private onItemsChanged:    ItemsChangedCallback    | null = null;
  private onBindingsChanged: BindingsChangedCallback | null = null;
  private onReadFailed:      ((failure: unknown) => void) | null = null;

  // == Lifecycle =================================================================
  public constructor(appContent: AppContentAPI) {
    this.appContent = appContent;
  }

  // ------------------------------------------------------------------------------
  /** register the callback for each change to the items shown */
  public onItemsChange(cb: ItemsChangedCallback): void { this.onItemsChanged = cb; }
  /** register the callback for each change to the bindings shown */
  public onBindingsChange(cb: BindingsChangedCallback): void { this.onBindingsChanged = cb; }
  /** register the callback for a read refused after the gallery was first shown */
  public onReadFailure(cb: (failure: unknown) => void): void { this.onReadFailed = cb; }

  /** whether this page can read and write app-contents (a page opened before
   *  `contents$()` cannot) */
  public canEdit(): boolean { return (typeof this.appContent.contents$ === 'function'); }

  // == Follow ====================================================================
  /** follows both kinds of app-content: resolves once each is first shown, rejects when
   *  a read is refused */
  public async follow(): Promise<void> {
    if(!this.canEdit()) throw new GalleryWriteError(RELOAD);
    await Promise.all([ this.followKind(ITEMS_NAME), this.followKind(BINDINGS_NAME) ]);
  }

  private followKind(kind: Kind): Promise<void> {
    return new Promise((resolve, reject) => {
      let shown = false;
      this.appContent.contents$(`[name='${kind}']`).subscribe({
        next: contents => {
          this.contents[kind] = contents;
          this.publish(kind);
          this.waiting.forEach(wake => wake());
          if(!shown) { shown = true; resolve(); }
        },
        error: failure => {
          if(!shown) { shown = true; reject(failure); }
          else this.onReadFailed?.(failure);
        },
      });
    });
  }

  /** the records of every app-content of the kind, the first of each id */
  private publish(kind: Kind): void {
    const lines = this.contents[kind].flatMap(content => recordLines(content));
    if(kind === ITEMS_NAME) this.onItemsChanged?.(firstOfEach(parseItems(lines), item => item.itemId));
    else this.onBindingsChanged?.(firstOfEach(parseBindings(lines), binding => binding.slotId));
  }

  // == Items =====================================================================
  /** appends each item as its own line, creating the app-content when there is none */
  public async addItems(items: ReadonlyArray<GalleryItem>): Promise<void> {
    if(items.length < 1) return/*nothing to add*/;
    if(!this.canEdit()) throw new GalleryWriteError(RELOAD);
    try {
      const content = this.contents.items[0] ?? await this.appContent.create(''/*no records*/, ITEMS_NAME);
      for(const item of items) await content.appendLine(JSON.stringify(item))/*measured again by itself*/;
    } catch(error) {
      throw new GalleryWriteError(`${(items.length === 1) ? 'The image was' : 'The images were'} not added. Try again.`, { cause: error });
    }
  }

  /** removes the item wherever it now stands: false when no app-content holds it */
  public removeItem(itemId: string): Promise<boolean> {
    return this.rewrite(ITEMS_NAME, `The image was not removed.`,
      lines => lines.some(line => itemIdOf(line) === itemId),
      lines => without(lines, line => itemIdOf(line) === itemId));
  }

  /** removes the oldest items until at most `count` remain */
  public async keepNewest(count: number): Promise<void> {
    for(let i=0; i<this.contents.items.length*2/*bounded: one pass per app-content, twice*/; i++) {
      const excess = this.itemCount() - count;
      if(excess < 1) return/*within the cap*/;
      await this.rewrite(ITEMS_NAME, 'The oldest images were not removed to stay within the gallery\'s limit.',
        lines => lines.some(line => itemIdOf(line) !== null),
        lines => withoutFirst(lines, line => itemIdOf(line) !== null, excess));
    }
  }

  private itemCount(): number {
    return new Set(this.contents.items.flatMap(content => recordLines(content)).map(itemIdOf).filter(id => id !== null)).size;
  }

  // == Bindings ==================================================================
  /** writes the slot's binding as `update` makes it from the one there (if any),
   *  creating the app-content when there is none */
  public async setBinding(slotId: string, update: (current: BindingRecord | undefined) => BindingRecord): Promise<void> {
    if(!this.canEdit()) throw new GalleryWriteError(RELOAD);
    if(this.contents.bindings.length < 1) {
      try {
        await this.appContent.create(''/*no records*/, BINDINGS_NAME);
        await this.newerThan(BINDINGS_NAME, undefined)/*the created app-content shown*/;
      } catch(error) {
        throw new GalleryWriteError('The slot was not changed. Try again.', { cause: error });
      }
    } /* else -- an app-content to write in */

    const holds = (lines: ReadonlyArray<string>) => lines.some(line => slotIdOf(line) === slotId);
    const held = this.contents.bindings.some(content => holds(recordLines(content)));
    await this.rewrite(BINDINGS_NAME, 'The slot was not changed.',
      held ? holds : () => true/*the first app-content*/,
      lines => {
        const index = lines.findIndex(line => slotIdOf(line) === slotId);
        if(index < 0) return [ ...lines, JSON.stringify(update(undefined)) ];
        const next = JSON.stringify(update(parseBindings([ lines[index] ])[0]));
        return (next === lines[index]) ? null/*unchanged*/ : lines.map((line, i) => (i === index) ? next : line);
      });
  }

  /** unbinds every slot bound to the item */
  public async unbindItem(itemId: string): Promise<void> {
    const bound = (line: string) => parseBindings([ line ])[0]?.itemId === itemId;
    for(const _ of this.contents.bindings) {
      const changed = await this.rewrite(BINDINGS_NAME, 'The removed image is still in a slot.',
        lines => lines.some(bound),
        lines => lines.map(line => bound(line) ? JSON.stringify({ ...parseBindings([ line ])[0], itemId: null }) : line));
      if(!changed) return/*none left*/;
    }
  }

  /** empties every binding (a full reset) */
  public async clearBindings(): Promise<void> {
    for(const _ of this.contents.bindings) {
      const changed = await this.rewrite(BINDINGS_NAME, 'The slots were not cleared.',
        lines => lines.some(line => line.trim().length > 0),
        () => []);
      if(!changed) return/*all empty*/;
    }
  }

  // == Write =====================================================================
  /** makes the lines `measure` gives on the first app-content of the kind `holds`
   *  picks, through that app-content and guarded by it; on a conflict measured again
   *  on the app-content as it is now. False when none needs a change */
  private async rewrite(kind: Kind, refusal: string, holds: (lines: ReadonlyArray<string>) => boolean, measure: Measure): Promise<boolean> {
    if(!this.canEdit()) throw new GalleryWriteError(RELOAD);
    for(let attempt=1; ; attempt++) {
      const content = this.contents[kind].find(candidate => holds(recordLines(candidate)));
      if(!content) return false/*nothing holds it*/;
      const next = measure(recordLines(content));
      if(!next || ((next.length === content.lines.length) && next.every((line, index) => line === content.lines[index]))) return false/*nothing to change*/;

      try {
        await writeLines(content, next)/*whole lines: SEE: writeLines*/;
        await this.newerThan(kind, content)/*shown once the write is in*/;
        return true;
      } catch(error) {
        if(!isConflict(error)) throw new GalleryWriteError(`${refusal} Try again.`, { cause: error });
        if(attempt >= EDIT_ATTEMPTS) throw new GalleryWriteError(`${refusal} The gallery kept changing; try again.`, { cause: error });
        await this.newerThan(kind, content);
      }
    }
  }

  /** resolves once the kind's app-contents no longer show `content` as it was (with
   *  none, once any app-content of the kind is shown) */
  private newerThan(kind: Kind, content: AppContent | undefined): Promise<void> {
    const moved = () => content ? !this.contents[kind].some(candidate => (candidate.id === content.id) && (candidate.revision === content.revision))
                                : (this.contents[kind].length > 0);
    if(moved()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const wake = () => { if(!moved()) return; done(); resolve(); };
      const timeout = setTimeout(() => { done(); reject(new GalleryWriteError('The gallery did not update. Reload to see the latest.')); }, NEWER_REVISION_WAIT_MS);
      const done = () => { clearTimeout(timeout); this.waiting.delete(wake); };
      this.waiting.add(wake);
    });
  }
}

// == Records =====================================================================
/** the lines without those `matches`, or null when none does */
const without = (lines: ReadonlyArray<string>, matches: (line: string) => boolean): ReadonlyArray<string> | null =>
  lines.some(matches) ? lines.filter(line => !matches(line)) : null;
/** the lines without the first `count` that `matches`, or null when none does */
const withoutFirst = (lines: ReadonlyArray<string>, matches: (line: string) => boolean, count: number): ReadonlyArray<string> | null => {
  let left = count;
  const next = lines.filter(line => !(matches(line) && (left-- > 0)));
  return (next.length === lines.length) ? null : next;
};

/** the first record of each id, in order */
const firstOfEach = <T>(records: ReadonlyArray<T>, idOf: (record: T) => string): ReadonlyArray<T> => {
  const seen = new Set<string>();
  return records.filter(record => !seen.has(idOf(record)) && !!seen.add(idOf(record)));
};

const itemIdOf = (line: string): string | null => parseItems([ line ])[0]?.itemId ?? null;
const slotIdOf = (line: string): string | null => parseBindings([ line ])[0]?.slotId ?? null;

// --------------------------------------------------------------------------------
/** the valid items of the lines. Malformed lines are skipped */
const parseItems = (lines: ReadonlyArray<string>): ReadonlyArray<GalleryItem> => {
  const out: GalleryItem[] = [];
  for(const line of lines) {
    const v = parseRecord(line) as Partial<GalleryItem> | null;
    if(!v) continue;
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
/** the valid binding records of the lines. Malformed lines are skipped */
const parseBindings = (lines: ReadonlyArray<string>): ReadonlyArray<BindingRecord> => {
  const out: BindingRecord[] = [];
  for(const line of lines) {
    const v = parseRecord(line) as Partial<BindingRecord> | null;
    if(!v) continue;
    if((typeof v.slotId !== 'string') || (v.slotId.length < 1)) continue;
    const itemId = (typeof v.itemId === 'string') ? v.itemId : null;
    out.push({ slotId: v.slotId, itemId, meta: v.meta });
  }
  return out;
};
