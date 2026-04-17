import { race, timer, Observable, Subject } from 'rxjs';
import { debounceTime, take } from 'rxjs/operators';

import type { DrawingElement } from './element-model';

// bridges the drawing elements <-> appContent layer. The elements array is
// serialized as JSONL (one element per line) into a single named content
// block. The bridge owns the discovery phase (wait for initial content to
// settle on start up) and routes remote updates back to the app
//
// OT concurrency
// --------------
// The appContent store is OT-backed: remote edits can arrive at any time,
// including during a live local edit (picker open, drag in flight, ...).
// Two pieces of state resolve concurrent writes:
//   shadow       the last-seen remote elements, keyed by id. Updated on
//                every inbound event and every local save; always mirrors
//                what the OT store currently holds
//   activeEdits  (elementId, propertyName) pairs the app has declared under
//                live local modification; pushed via beginEdit() / endEdit()
//
// Inbound: the parsed remote is diffed against the shadow per (id, prop).
// Diffs that hit an activeEdits entry are overlaid with the app's current
// local value (read via a getter the app registers) so in-flight edits are
// not clobbered. The merged result is emitted to the app. The shadow is
// replaced with the parsed remote (not the merged result), so later diffs
// stay honest about what the store actually holds
//
// Outbound: JSONL is written and the shadow is updated optimistically to
// match what was written. The inbound event that follows is not assumed
// to be a pure echo: under concurrent remote writes the OT store may
// return a merged state containing other users' work. Diffing that merged
// state against the shadow (= what this client wrote) surfaces exactly
// the remote contribution and lets it propagate; a true no-contention
// echo naturally diffs empty and is a no-op
//
// Element-level remote deletions (an element absent from the parsed
// content) propagate as a removal in the emitted array; the app is
// expected to drop it from selection and from activeEdits. A block-level
// `deleted=true` event is treated as non-authoritative and ignored: this
// app never calls appContent.remove(), so the flag only fires as platform
// book-keeping during first-save block creation
// ********************************************************************************
// == Constants ===================================================================
/** ms to debounce content emissions before declaring discovery complete */
const DISCOVERY_DEBOUNCE_MS = 200/*ms*/;
/** ms to wait for any content at all before declaring discovery complete */
const DISCOVERY_TIMEOUT_MS = 500/*ms*/;

/** selector + name for the single content block that holds the elements JSON */
const ELEMENTS_NAME = 'elements';
const ELEMENTS_SELECTOR = `[name='${ELEMENTS_NAME}']`;

// == Types =======================================================================
interface ContentChange {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly deleted: boolean;
}

// --------------------------------------------------------------------------------
type ElementsChangedCallback = (elements: DrawingElement[]) => void;
type CurrentStateGetter = () => ReadonlyArray<DrawingElement>;

// == CharmIQ API (global) ========================================================
interface CharmiqAppContent {
  onChange$(): Observable<ContentChange>;
  applyChanges(changes: ReadonlyArray<{ from: number; to: number; insert: string; }>, selector: string): Promise<void>;
  set(content: string | undefined, selector: string, name?: string): Promise<void>;
  remove(selector: string): Promise<void>;
}

// == Class =======================================================================
/** mediates elements JSON sync between the drawing app and the OT-backed
 *  appContent store. see the OT-concurrency block at the top of this file
 *  for the design */
export class ContentBridge {
  private readonly appContent: CharmiqAppContent;
  private onElementsChanged: ElementsChangedCallback | null = null;
  private currentStateGetter: CurrentStateGetter | null = null;
  private discoveryDone = false;

  /** last-seen remote elements keyed by id; updated on inbound events and
   *  on local saves. diffed against parsed remote on each inbound event to
   *  skip pure echoes */
  private shadow: Map<string, DrawingElement> = new Map();

  /** elementId -> set of property names currently under live local
   *  modification. inbound remote changes to a declared (id, property)
   *  pair are overlaid with the local value (local wins) */
  private readonly activeEdits: Map<string, Set<string>> = new Map();

  // == Lifecycle =================================================================
  public constructor(appContent: CharmiqAppContent) {
    this.appContent = appContent;
  }

  // ------------------------------------------------------------------------------
  /** register callback for remote element changes */
  public onChange(cb: ElementsChangedCallback): void {
    this.onElementsChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** register a getter the bridge calls to read the app's current
   *  in-memory elements. used to overlay active-edit property values onto
   *  inbound remote changes so in-flight user edits survive */
  public setCurrentStateGetter(getter: CurrentStateGetter): void {
    this.currentStateGetter = getter;
  }

  // == Active-Edit Tracking ======================================================
  /** declare that `property` is under live local modification on every id
   *  in `ids`. while declared, inbound remote changes to that specific
   *  (id, property) pair are suppressed -- local wins */
  public beginEdit(ids: ReadonlyArray<string>, property: string): void {
    for(const id of ids) {
      let set = this.activeEdits.get(id);
      if(!set) { set = new Set(); this.activeEdits.set(id, set); }
      set.add(property);
    }
  }

  // ------------------------------------------------------------------------------
  /** mirror of beginEdit(); called on picker commit / cancel to release
   *  the local-wins lock on (id, property) pairs */
  public endEdit(ids: ReadonlyArray<string>, property: string): void {
    for(const id of ids) {
      const set = this.activeEdits.get(id);
      if(!set) continue;
      set.delete(property);
      if(set.size < 1) this.activeEdits.delete(id);
    }
  }

  // ------------------------------------------------------------------------------
  /** clears all pending live-edit declarations. intended for reset-transient
   *  events (blur, page hide, visibility change) where the app has already
   *  cancelled its in-flight gestures */
  public endAllEdits(): void {
    this.activeEdits.clear();
  }

  // == Discover ==================================================================
  /** subscribe to appContent changes and wait for the discovery phase to
   *  settle. resolves when discovery is complete (content has stopped
   *  arriving, or timeout) */
  public discover(): Promise<void> {
    return new Promise((resolve) => {
      const contentReceived$ = new Subject<void>();

      this.appContent.onChange$().subscribe((change: ContentChange) => {
        contentReceived$.next();
        if(!this.isElementsBlock(change)) return;
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

  // == Outbound (app → appContent) ===============================================
  /** write the current elements as JSONL (one element per line) to
   *  appContent. JSONL is used instead of a single JSON array so that
   *  incremental edits on a single element produce a localized diff rather
   *  than rewriting the entire document */
  public async save(elements: DrawingElement[]): Promise<void> {
    const jsonl = this.serialize(elements);
    // update shadow to the parsed form of what was written. using parse(jsonl)
    // instead of the caller's array guarantees fresh allocations that are
    // insulated from later in-place mutation on the app's elements array
    this.shadow = new Map(this.parse(jsonl).map(e => [e.id, e]));
    try {
      await this.appContent.set(jsonl, ELEMENTS_SELECTOR, ELEMENTS_NAME);
    } catch(error) {
      console.error('failed to save elements to app-content:', error);
    }
  }

  // == Internal ==================================================================
  /** inbound event handler: resolve the parsed remote against shadow +
   *  activeEdits and emit the merged result to the app. see the
   *  OT-concurrency block at the top of this file */
  private handleInbound(change: ContentChange): void {
    // block-level deleted events are ignored (see top-of-file doc)
    if(change.deleted) return;

    const parsed = this.parse(change.content);
    const parsedMap = new Map(parsed.map(e => [e.id, e]));

    // skip pure echoes: parsed is structurally identical to shadow means
    // the OT store holds exactly what this client last saw / wrote
    if(this.matchesShadow(parsedMap)) return;

    // overlay active-edit properties from the app's current in-memory state
    // so live edits survive concurrent remote changes on the same element
    const current = this.currentStateGetter?.() ?? [];
    const currentById = new Map(current.map(e => [e.id, e]));

    const merged: DrawingElement[] = parsed.map(remoteEl => {
      const activeProps = this.activeEdits.get(remoteEl.id);
      if(!activeProps || activeProps.size < 1) return remoteEl;
      const localEl = currentById.get(remoteEl.id);
      if(!localEl) return remoteEl;/*remote added an element this client is not editing*/
      const overlay: any = { ...remoteEl };
      for(const prop of activeProps) {
        if(prop in localEl) overlay[prop] = (localEl as any)[prop];
      }
      return overlay as DrawingElement;
    });

    // shadow always tracks the raw parsed remote (not the merged result)
    // so subsequent diffs stay honest about what the OT store actually
    // holds
    this.shadow = parsedMap;
    this.emit(merged);
  }

  // ------------------------------------------------------------------------------
  /** structural equality between a parsed-remote map and the shadow. used
   *  to skip pure-echo re-emits */
  private matchesShadow(parsedMap: ReadonlyMap<string, DrawingElement>): boolean {
    if(parsedMap.size !== this.shadow.size) return false;
    for(const [id, remoteEl] of parsedMap) {
      const shadowEl = this.shadow.get(id);
      if(!shadowEl) return false;
      if(JSON.stringify(shadowEl) !== JSON.stringify(remoteEl)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------------------
  /** test whether a content change relates to our elements block */
  private isElementsBlock(change: ContentChange): boolean {
    return change.name === ELEMENTS_NAME;
  }

  // ------------------------------------------------------------------------------
  /** serialize elements as JSON Lines (one element per line) */
  private serialize(elements: DrawingElement[]): string {
    return elements.map(el => JSON.stringify(el)).join('\n');
  }

  // ------------------------------------------------------------------------------
  /** parse elements from app-content. Accepts JSON Lines (one element per
   *  line, current format) and, for backward compatibility, a single JSON
   *  array on one line (legacy format) */
  private parse(content: string): DrawingElement[] {
    if(!content) return [];

    const trimmed = content.trim();
    if(!trimmed) return [];

    // legacy: a single JSON array
    if(trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch(error) {
        console.error('failed to parse elements JSON array from app-content:', error);
        return [];
      }
    } /* else -- treat as JSON Lines */

    const out: DrawingElement[] = [];
    const lines = trimmed.split('\n');
    for(const line of lines) {
      const s = line.trim();
      if(!s) continue;/*skip blank lines*/
      try {
        out.push(JSON.parse(s));
      } catch(error) {
        console.error('failed to parse element line from app-content:', s, error);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------------
  private emit(elements: DrawingElement[]): void {
    if(this.onElementsChanged) this.onElementsChanged(elements);
  }

  // ------------------------------------------------------------------------------
  /** whether initial discovery has completed (used to suppress early writes) */
  public get isDiscoveryDone(): boolean { return this.discoveryDone; }
}
