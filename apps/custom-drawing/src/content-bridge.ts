import type { AppContentAPI } from '../../../shared/charmiq';
import { recordWithId, RecordSync } from '/shared/line-records/record-sync';

import type { DrawingElement } from './element-model';

// bridges the drawing's elements <-> appContent. The elements live in the
// app-content named `elements`, one element per line, in drawing order (the last is
// drawn on top), kept in step with the canvas by element id (SEE: RecordSync). An
// element another writer changed while this client holds it is taken from the
// app-content, keeping any property this client is editing live (SEE: beginEdit); a
// save writes this client's version of the elements it changed
// ********************************************************************************
// == Constants ===================================================================
/** name + selector of the app-content that holds the elements */
const ELEMENTS_NAME = 'elements';
const ELEMENTS_SELECTOR = `[name='${ELEMENTS_NAME}']`;

// == Class =======================================================================
/** follows the elements app-content and saves the canvas onto it by element id */
export class ContentBridge {
  private readonly sync: RecordSync<DrawingElement>;

  /** elementId -> set of property names currently under live local
   *  modification. Another writer's change to a declared (id, property) pair
   *  is overlaid with the local value (local wins) */
  private readonly activeEdits: Map<string, Set<string>> = new Map();

  // == Lifecycle =================================================================
  public constructor(appContent: AppContentAPI) {
    this.sync = new RecordSync<DrawingElement>(appContent, ELEMENTS_SELECTOR, ELEMENTS_NAME, {
      idOf: element => element.id,
      fromLine: line => recordWithId<DrawingElement>(line),
      lineOf: element => JSON.stringify(element),
      merge: (mine, theirs) => this.keepActiveEdits(theirs, mine),
    }, {
      reload: 'This page cannot save the drawing safely. Reload it to keep drawing.',
      failed: 'The drawing could not be saved. Try again.',
      changing: 'The drawing kept changing while it was saved. Your last change was not saved; try again.',
      stale: 'The drawing did not update. Reload to see the latest.',
    });
  }

  // ------------------------------------------------------------------------------
  /** register callback for the canvas's elements after another writer's change */
  public onChange(cb: (elements: DrawingElement[]) => void): void { this.sync.onChange(cb); }
  /** register the callback for a read refused after the drawing was first shown */
  public onReadFailure(cb: (failure: unknown) => void): void { this.sync.onReadFailure(cb); }
  /** register the callback for a save the drawing makes again by itself that fails */
  public onSaveFailure(cb: (failure: unknown) => void): void { this.sync.onSaveFailure(cb); }
  /** register a getter the bridge calls to read the app's current in-memory
   *  elements: the canvas a save writes and another writer's change merges into */
  public setCurrentStateGetter(getter: () => ReadonlyArray<DrawingElement>): void { this.sync.setCurrentRecords(getter); }
  /** whether this page can read and write app-contents */
  public canEdit(): boolean { return this.sync.canEdit(); }

  /** follows the elements app-content: resolves once it is first shown, rejects
   *  when the read is refused */
  public follow(): Promise<void> { return this.sync.follow(); }
  /** writes what the canvas changed since the elements shown (SEE: RecordSync#save) */
  public save(): Promise<void> { return this.sync.save(); }

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

  // == Internal ==================================================================
  /** another writer's version of an element with the properties this client is
   *  editing live */
  private keepActiveEdits(theirs: DrawingElement, mine: DrawingElement): DrawingElement {
    const active = this.activeEdits.get(theirs.id);
    if(!active || (active.size < 1)) return theirs;
    const overlay: Record<string, unknown> = { ...theirs };
    for(const property of active) if(property in mine) overlay[property] = (mine as unknown as Record<string, unknown>)[property];
    return overlay as unknown as DrawingElement;
  }
}
