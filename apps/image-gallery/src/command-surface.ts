import type { CharmIQAPI } from '../../../shared/charmiq';
import type { GalleryItem } from './content-bridge';
import type { GalleryModel, PublicState, PublicSlot } from './gallery-model';

// advertises the gallery's two external surfaces
//   charmiq.command               -- discrete, agent-callable actions
//                                    (addItems, removeItem, bindSlot, ...)
//   ai.charm.shared.imageGallery  -- reactive capability for other apps that
//                                    want to observe the collection + bindings
//                                    (e.g. a shader player watching slot bindings)
//
// All imperative mutations are delegated to the callbacks on GalleryActions —
// the gallery surface does not know how to persist or resolve assets; main.ts
// owns those orchestrations
// ********************************************************************************
// == Types =======================================================================
/** imperative actions the surface forwards to. main.ts implements these by
 *  composing ContentBridge + AssetResolver + GalleryModel */
export interface GalleryActions {
  addItems():                                      Promise<ReadonlyArray<string>>;
  removeItem(itemId: string):                      Promise<boolean>;
  bindSlot(slotId: string, itemId: string | null): Promise<boolean>;
  setSlotMeta(slotId: string, meta: unknown):      Promise<boolean>;
  clearAllSlots():                                 Promise<boolean>;
}

// == Class =======================================================================
/** wires the gallery's reactive model + action callbacks into the charmiq host */
export class CommandSurface {
  private readonly model:   GalleryModel;
  private readonly actions: GalleryActions;

  // == Lifecycle =================================================================
  public constructor(model: GalleryModel, actions: GalleryActions) {
    this.model   = model;
    this.actions = actions;
  }

  // ------------------------------------------------------------------------------
  /** advertise both surfaces. Called once from main.ts after discovery */
  public init(): void {
    const charmiq: CharmIQAPI = window.charmiq;
    this.advertiseCommands(charmiq);
    this.advertiseCapability(charmiq);
  }

  // == Internal ==================================================================
  /** register the discrete agent-callable commands listed in manifest.json */
  // NOTE: each method receives a single named-args object whose properties match
  //       the method's `inputSchema` in manifest.json
  private advertiseCommands(charmiq: CharmIQAPI): void {
    charmiq.exportCommands({
      addItems:      ()                                       => this.actions.addItems(),
      removeItem:    ({ itemId }: { itemId: string; })        => this.actions.removeItem(itemId),
      getItems:      ()                                       => this.model.getItems() as ReadonlyArray<GalleryItem>,
      getSlots:      ()                                       => this.model.getPublic().slots as ReadonlyArray<PublicSlot>,
      bindSlot:      ({ slotId, itemId }: { slotId: string; itemId: string | null; }) => this.actions.bindSlot(slotId, itemId ?? null),
      setSlotMeta:   ({ slotId, meta }:   { slotId: string; meta: unknown; })         => this.actions.setSlotMeta(slotId, meta),
      clearAllSlots: ()                                       => this.actions.clearAllSlots()
    });
  }

  // ------------------------------------------------------------------------------
  /** advertise the reactive capability for other apps in the same Document */
  private advertiseCapability(charmiq: CharmIQAPI): void {
    charmiq.advertise('ai.charm.shared.imageGallery', {
      // streams
      items$:    () => this.model.items$(),
      slots$:    () => this.model.slots$(),
      bindings$: () => this.model.bindings$(),
      state$:    () => this.model.state$(),

      // snapshot accessor — convenience for late subscribers who want the current
      // PublicState without waiting for the next emission
      getState: (): Readonly<PublicState> => this.model.getPublic(),

      // action pass-through — subscribers can drive the gallery in response
      // to their own UI (e.g. a shader app's "reset channels" button)
      bindSlot:      (slotId: string, itemId: string | null) => this.actions.bindSlot(slotId, itemId),
      setSlotMeta:   (slotId: string, meta: unknown)         => this.actions.setSlotMeta(slotId, meta),
      clearAllSlots: ()                                      => this.actions.clearAllSlots()
    });
  }
}
