import type { AppContent, AppContentAPI } from '../../../shared/charmiq';
import { changeTo, isConflict, parseRecord, recordLines } from '/shared/line-records/line-records';

import type { DrawingElement } from './element-model';

// bridges the drawing's elements <-> appContent. The elements live in the
// app-content named `elements`, one element per line (JSON Lines), in drawing order
// (the last is drawn on top). Another tab, another User, a Charm or another
// Application can change the drawing at the same moment, so the canvas and the
// app-content are kept apart by element id:
//
// Shown: the records last shown, by id and in order. The canvas is the shown
// records plus this client's own changes not yet written (a drag in flight, a
// property picked). Another writer's change reaches the canvas as a change to the
// records it touched: an element they changed is taken from the app-content (keeping
// any property this client is editing live, SEE: beginEdit), one they added is
// added, one they removed is removed, and every other element keeps this client's
// version, unsaved changes included. This client's own writes coming back change
// nothing on the canvas.
//
// Saving: what this client changed since the records shown (elements changed,
// added, removed or moved) is written onto the app-content as it is now, by id, as
// one guarded edit through the app-content shown. A refused edit is measured again
// on the app-content as it is now, so another writer's change to other elements is
// never overwritten. An element another writer removed stays removed. Saves run
// one at a time, each with the canvas as it then is.
//
// Two collaborators who each draw the first element at once create two
// `elements` app-contents: both are kept and drawn (the first one's elements below
// the second's), and an element is written in the app-content it is in
// SEE: tutorials/03-writing-data for the line-record pattern, explained
// ********************************************************************************
// == Constants ===================================================================
/** name + selector of the app-content that holds the elements */
const ELEMENTS_NAME = 'elements';
const ELEMENTS_SELECTOR = `[name='${ELEMENTS_NAME}']`;

/** how many times a save is measured again after its app-content changed under it */
const EDIT_ATTEMPTS = 3;
/** how long a refused save waits for the app-content's newer revision: it reaches
 *  `contents$()` in one bridge round trip */
const NEWER_REVISION_WAIT_MS = 5_000/*ms*/;

/** the refusal on a page opened before `contents$()` */
const RELOAD = 'This page cannot save the drawing safely. Reload it to keep drawing.';

// == Types =======================================================================
/** a save the drawing could not make: its message is shown to the User */
export class DrawingSaveError extends Error {}

// --------------------------------------------------------------------------------
/** records by id (each element's line) and the ids in drawing order */
type Records = Readonly<{ lines: ReadonlyMap<string, string>; order: ReadonlyArray<string>; }>;
const NO_RECORDS: Records = { lines: new Map(), order: [] };

/** what this client changed since the records shown */
type Delta = Readonly<{
  /** the line of each element changed or added */
  lines: ReadonlyMap<string, string>;
  removed: ReadonlySet<string>;
  /** elements added or moved: each is placed after its predecessor on the canvas */
  placed: ReadonlySet<string>;
  /** each element's predecessor on the canvas (null: the first) */
  predecessor: ReadonlyMap<string, string | null>;
  /** the canvas's ids in drawing order */
  order: ReadonlyArray<string>;
  /** the ids shown when the save was measured */
  shown: ReadonlySet<string>;
}>;

type ElementsChangedCallback = (elements: DrawingElement[]) => void;
type CurrentStateGetter = () => ReadonlyArray<DrawingElement>;

// == Class =======================================================================
/** follows the elements app-content and saves the canvas onto it by element id */
export class ContentBridge {
  private readonly appContent: AppContentAPI;
  private onElementsChanged: ElementsChangedCallback | null = null;
  private onReadFailed: ((failure: unknown) => void) | null = null;
  private currentStateGetter: CurrentStateGetter | null = null;

  private contents: ReadonlyArray<AppContent> = [];
  /** the records last shown: what the canvas's own changes are measured from */
  private shown: Records = NO_RECORDS;
  /** each element's line as this client last wrote it, until it is shown */
  private readonly written = new Map<string, string>();
  /** saves waiting for an app-content's newer revision */
  private readonly waiting = new Set<() => void>();

  private saving: Promise<void> | null = null/*none in flight*/;
  private saveAgain = false;

  /** elementId -> set of property names currently under live local
   *  modification. Another writer's change to a declared (id, property) pair
   *  is overlaid with the local value (local wins) */
  private readonly activeEdits: Map<string, Set<string>> = new Map();

  // == Lifecycle =================================================================
  public constructor(appContent: AppContentAPI) {
    this.appContent = appContent;
  }

  // ------------------------------------------------------------------------------
  /** register callback for the canvas's elements after another writer's change */
  public onChange(cb: ElementsChangedCallback): void {
    this.onElementsChanged = cb;
  }

  /** register the callback for a read refused after the drawing was first shown */
  public onReadFailure(cb: (failure: unknown) => void): void {
    this.onReadFailed = cb;
  }

  // ------------------------------------------------------------------------------
  /** register a getter the bridge calls to read the app's current in-memory
   *  elements: the canvas a save writes and another writer's change merges into */
  public setCurrentStateGetter(getter: CurrentStateGetter): void {
    this.currentStateGetter = getter;
  }

  /** whether this page can read and write app-contents (a page opened before
   *  `contents$()` cannot) */
  public canEdit(): boolean { return (typeof this.appContent.contents$ === 'function'); }

  // == Active-Edit Tracking ======================================================
  /** declare that `property` is under live local modification on every id
   *  in `ids`. while declared, another writer's change to that specific
   *  (id, property) pair is suppressed -- local wins */
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

  // == Follow ====================================================================
  /** follows the elements app-content: resolves once it is first shown, rejects
   *  when the read is refused */
  public follow(): Promise<void> {
    if(!this.canEdit()) return Promise.reject(new DrawingSaveError(RELOAD));
    return new Promise((resolve, reject) => {
      let shown = false;
      this.appContent.contents$(ELEMENTS_SELECTOR).subscribe({
        next: contents => {
          this.receive(contents);
          if(!shown) { shown = true; resolve(); }
        },
        error: failure => {
          if(!shown) { shown = true; reject(failure); }
          else this.onReadFailed?.(failure);
        },
      });
    });
  }

  /** merges the app-contents' change into the canvas, by element id */
  private receive(contents: ReadonlyArray<AppContent>): void {
    const previous = this.shown,
          next = recordsOf(contents);
    this.contents = contents;
    this.shown = next;
    this.waiting.forEach(wake => wake());

    const canvas = this.currentStateGetter?.() ?? [];
    const merged = this.merge(canvas, previous, next);
    for(const [id, line] of this.written) if(next.lines.get(id) === line) this.written.delete(id)/*shown*/;
    if(!sameElements(merged, canvas)) this.onElementsChanged?.(merged);
  }

  /** the canvas with another writer's change from `previous` to `next` */
  private merge(canvas: ReadonlyArray<DrawingElement>, previous: Records, next: Records): DrawingElement[] {
    const local = new Map(canvas.map(element => [element.id, element]));
    const merged: DrawingElement[] = [];
    for(const id of next.order) {
      const line = next.lines.get(id)!,
            before = previous.lines.get(id),
            element = local.get(id);
      const theirs = (line !== before) && (line !== this.written.get(id))/*not this client's write coming back*/;
      if(!element) {
        if(before !== undefined) continue/*removed here, not yet saved*/;
        const added = parseElement(line);
        if(added) merged.push(added);
      } else if(theirs) {
        const changed = parseElement(line);
        if(changed) merged.push(this.keepActiveEdits(changed, element));
      } else merged.push(element)/*this client's version, unsaved changes included*/;
    }

    // elements added here and not yet saved, each after its predecessor
    canvas.forEach((element, index) => {
      if(previous.lines.has(element.id) || next.lines.has(element.id)) return/*shown, or removed by another writer*/;
      const predecessor = (index > 0) ? canvas[index - 1].id : null;
      const at = (predecessor === null) ? 0 : (merged.findIndex(candidate => candidate.id === predecessor) + 1);
      merged.splice((at > 0) || (predecessor === null) ? at : merged.length, 0, element);
    });
    return merged;
  }

  /** another writer's version of an element with the properties this client is
   *  editing live */
  private keepActiveEdits(theirs: DrawingElement, mine: DrawingElement): DrawingElement {
    const active = this.activeEdits.get(theirs.id);
    if(!active || (active.size < 1)) return theirs;
    const overlay: Record<string, unknown> = { ...theirs };
    for(const property of active) if(property in mine) overlay[property] = (mine as unknown as Record<string, unknown>)[property];
    return overlay as unknown as DrawingElement;
  }

  // == Save ======================================================================
  /** writes what the canvas changed since the records shown onto the app-content
   *  as it is now. Saves run one at a time; a save asked for while one runs runs once
   *  more after it, with the canvas as it then is */
  public save(): Promise<void> {
    this.saveAgain = true;
    if(!this.saving) this.saving = this.drain().finally(() => { this.saving = null; });
    return this.saving;
  }

  private async drain(): Promise<void> {
    while(this.saveAgain) {
      this.saveAgain = false;
      await this.saveOnce();
    }
  }

  private async saveOnce(): Promise<void> {
    if(!this.canEdit()) throw new DrawingSaveError(RELOAD);
    const delta = deltaOf(this.currentStateGetter?.() ?? [], this.shown);
    if((delta.lines.size < 1) && (delta.removed.size < 1) && (delta.placed.size < 1)) return/*nothing changed*/;

    for(let attempt=1; ; attempt++) {
      if(this.contents.length < 1) {
        if(delta.lines.size < 1) return/*no app-content, and nothing to write*/;
        try {
          await this.appContent.create(''/*no elements*/, ELEMENTS_NAME);
        } catch(error) {
          throw new DrawingSaveError('The drawing could not be saved. Try again.', { cause: error });
        }
        await this.newerThan(undefined)/*the created app-content shown*/;
      } /* else -- an app-content to write in */

      // the edit each app-content needs, measured on it as it is now
      const elsewhere = (content: AppContent) => new Set(this.contents.filter(other => other !== content).flatMap(other => recordLines(other).map(idOf)).filter(isId));
      const edits = this.contents.map((content, index) => ({ content, change: changeTo(content.text, applyDelta(recordLines(content), delta, index === 0, elsewhere(content))) }))
                               .filter(edit => edit.change !== null);
      if(edits.length < 1) return/*the app-contents already hold it*/;

      for(const [id, line] of delta.lines) this.written.set(id, line);
      let refused: AppContent | undefined;
      for(const { content, change } of edits) {
        try {
          await content.edit([ change! ]);
        } catch(error) {
          if(!isConflict(error)) throw new DrawingSaveError('The drawing could not be saved. Try again.', { cause: error });
          refused = content;
          break;
        }
      }
      if(!refused) { await this.newerThan(edits[edits.length - 1].content); return/*shown*/; }
      if(attempt >= EDIT_ATTEMPTS) throw new DrawingSaveError('The drawing kept changing while it was saved. Your last change was not saved; try again.');
      await this.newerThan(refused);
    }
  }

  /** resolves once the app-contents no longer show `content` as it was (with none,
   *  once any app-content is shown) */
  private newerThan(content: AppContent | undefined): Promise<void> {
    const moved = () => content ? !this.contents.some(candidate => (candidate.id === content.id) && (candidate.revision === content.revision))
                                : (this.contents.length > 0);
    if(moved()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const wake = () => { if(!moved()) return; done(); resolve(); };
      const timeout = setTimeout(() => { done(); reject(new DrawingSaveError('The drawing did not update. Reload to see the latest.')); }, NEWER_REVISION_WAIT_MS);
      const done = () => { clearTimeout(timeout); this.waiting.delete(wake); };
      this.waiting.add(wake);
    });
  }
}

// == Records =====================================================================
const idOf = (line: string): string | null => {
  const id = parseRecord(line)?.id;
  return ((typeof id === 'string') && (id.length > 0)) ? id : null;
};
const isId = (id: string | null): id is string => (id !== null);

/** an element's line: what a save writes and a merge compares */
const lineOf = (element: DrawingElement): string => JSON.stringify(element);

/** an element from its line, or null for a line that is not one */
const parseElement = (line: string): DrawingElement | null => (idOf(line) !== null) ? parseRecord(line) as unknown as DrawingElement : null;

/** every app-content's elements by id (the first of each id) in drawing order */
const recordsOf = (contents: ReadonlyArray<AppContent>): Records => {
  const lines = new Map<string, string>(), order: string[] = [];
  for(const line of contents.flatMap(content => recordLines(content))) {
    const id = idOf(line);
    if(!id || lines.has(id)) continue/*not an element, or a later copy*/;
    lines.set(id, line);
    order.push(id);
  }
  return { lines, order };
};

const sameElements = (a: ReadonlyArray<DrawingElement>, b: ReadonlyArray<DrawingElement>): boolean =>
  (a.length === b.length) && a.every((element, index) => (element === b[index]) || (lineOf(element) === lineOf(b[index])));

// == Delta =======================================================================
/** what the canvas changed since the records shown */
const deltaOf = (canvas: ReadonlyArray<DrawingElement>, shown: Records): Delta => {
  const order = canvas.map(element => element.id);
  const lines = new Map<string, string>(), placed = new Set<string>(), predecessor = new Map<string, string | null>();
  canvas.forEach((element, index) => {
    const line = lineOf(element);
    if(shown.lines.get(element.id) !== line) lines.set(element.id, line);
    if(!shown.lines.has(element.id)) placed.add(element.id)/*added*/;
    predecessor.set(element.id, (index > 0) ? canvas[index - 1].id : null);
  });
  const removed = new Set(shown.order.filter(id => !predecessor.has(id)));

  // moved: an element whose predecessor among the elements both hold changed
  const both = (ids: ReadonlyArray<string>, other: ReadonlySet<string> | ReadonlyMap<string, unknown>) => ids.filter(id => other.has(id));
  const before = predecessorsOf(both(shown.order, predecessor)),
        after = predecessorsOf(both(order, shown.lines));
  for(const [id, previous] of after) if(before.get(id) !== previous) placed.add(id);

  return { lines, removed, placed, predecessor, order, shown: new Set(shown.order) };
};

const predecessorsOf = (ids: ReadonlyArray<string>): ReadonlyMap<string, string | null> =>
  new Map(ids.map((id, index) => [id, (index > 0) ? ids[index - 1] : null]));

/** an app-content's lines with the delta made on them. Repeating it changes nothing
 *  more. An element changed, moved or removed here that another writer removed
 *  stays removed; an added element goes in the first app-content unless another
 *  holds it */
const applyDelta = (lines: ReadonlyArray<string>, delta: Delta, first: boolean, elsewhere: ReadonlySet<string>): ReadonlyArray<string> => {
  const held = new Map(lines.map(line => [idOf(line), line]).filter((entry): entry is [string, string] => entry[0] !== null));
  const out = lines.filter(line => { const id = idOf(line); return !id || !(delta.removed.has(id) || delta.placed.has(id)); })
                   .map(line => { const id = idOf(line); return (id && delta.lines.has(id)) ? delta.lines.get(id)! : line; });

  for(const id of delta.order) {
    if(!delta.placed.has(id)) continue;
    const added = !delta.shown.has(id);
    const here = held.has(id) || (added && first && !elsewhere.has(id));
    if(!here) continue/*another app-content's, or removed by another writer*/;

    const line = delta.lines.get(id) ?? held.get(id)!;
    const predecessor = delta.predecessor.get(id) ?? null;
    const after = (predecessor === null) ? -1 : out.findIndex(candidate => idOf(candidate) === predecessor);
    if(predecessor === null) out.splice(0, 0, line);
    else if(after >= 0) out.splice(after + 1, 0, line);
    else out.push(line)/*its predecessor is not in this app-content*/;
  }
  return out;
};
