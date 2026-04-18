import { BehaviorSubject, Observable } from 'rxjs';

import type { SlotDefinition } from './config-store';
import type { BindingRecord, GalleryItem } from './content-bridge';

// the gallery's observable data model — the source of truth for what's on
// screen. Lives between the ContentBridge (items + bindings from appContent)
// and the UI (GridView + SlotStrip). Publishes three reactive streams that
// both the internal UI and external subscribers consume
//   items$     the ordered item list
//   slots$     the slot definitions as declared in appState
//   bindings$  the current binding records (slotId -> itemId + opaque meta)
//
// A combined publicState$ is derived as well, shaped for external consumers
// (see ai.charm.shared.imageGallery capability in command-surface.ts)
// ********************************************************************************
// == Types =======================================================================
/** a slot with its binding resolved inline — the shape published to external
 *  consumers of `ai.charm.shared.imageGallery` */
export interface PublicSlot {
  readonly id:       string;
  readonly label:    string;
  readonly required: boolean;
  readonly itemId:   string | null;
  readonly meta?:    unknown;
}

// --------------------------------------------------------------------------------
/** combined public state: a single snapshot of items + slots (with bindings) */
export interface PublicState {
  readonly items: ReadonlyArray<GalleryItem>;
  readonly slots: ReadonlyArray<PublicSlot>;
}

// == Class =======================================================================
/** reactive model shared by the UI and the advertised capability */
export class GalleryModel {
  private readonly itemsSubject    = new BehaviorSubject<ReadonlyArray<GalleryItem>>([]);
  private readonly slotsSubject    = new BehaviorSubject<ReadonlyArray<SlotDefinition>>([]);
  private readonly bindingsSubject = new BehaviorSubject<ReadonlyArray<BindingRecord>>([]);
  private readonly publicSubject   = new BehaviorSubject<PublicState>({ items: [], slots: [] });

  // == Writers ===================================================================
  public setItems(items: ReadonlyArray<GalleryItem>): void {
    this.itemsSubject.next(items);
    this.recomputePublic();
  }

  public setSlots(slots: ReadonlyArray<SlotDefinition>): void {
    this.slotsSubject.next(slots);
    this.recomputePublic();
  }

  public setBindings(bindings: ReadonlyArray<BindingRecord>): void {
    this.bindingsSubject.next(bindings);
    this.recomputePublic();
  }

  // == Accessors =================================================================
  public getItems():    ReadonlyArray<GalleryItem>     { return this.itemsSubject.getValue(); }
  public getSlots():    ReadonlyArray<SlotDefinition>  { return this.slotsSubject.getValue(); }
  public getBindings(): ReadonlyArray<BindingRecord>   { return this.bindingsSubject.getValue(); }
  public getPublic():   Readonly<PublicState>          { return this.publicSubject.getValue(); }

  // == Streams ===================================================================
  public items$():    Observable<ReadonlyArray<GalleryItem>>    { return this.itemsSubject.asObservable(); }
  public slots$():    Observable<ReadonlyArray<SlotDefinition>> { return this.slotsSubject.asObservable(); }
  public bindings$(): Observable<ReadonlyArray<BindingRecord>>  { return this.bindingsSubject.asObservable(); }
  public state$():    Observable<Readonly<PublicState>>         { return this.publicSubject.asObservable(); }

  // == Internal ==================================================================
  /** rebuild the combined public state from the latest slots + bindings */
  private recomputePublic(): void {
    const items: ReadonlyArray<GalleryItem>    = this.itemsSubject.getValue();
    const slots: ReadonlyArray<SlotDefinition> = this.slotsSubject.getValue();
    const bindings: ReadonlyArray<BindingRecord> = this.bindingsSubject.getValue();
    const bindingById = new Map<string, BindingRecord>(bindings.map((b: BindingRecord) => [b.slotId, b]));

    const publicSlots: PublicSlot[] = slots.map((slot: SlotDefinition) => {
      const b: BindingRecord | undefined = bindingById.get(slot.id);
      return {
        id:       slot.id,
        label:    slot.label,
        required: !!slot.required,
        itemId:   b?.itemId ?? null,
        meta:     b?.meta
      };
    });

    this.publicSubject.next({ items, slots: publicSlots });
  }
}
