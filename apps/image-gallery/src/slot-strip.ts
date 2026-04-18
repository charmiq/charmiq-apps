import type { SlotDefinition } from './config-store';
import type { BindingRecord, GalleryItem } from './content-bridge';
import { DRAG_ITEM_MIME } from './grid-view';

// renders the slot strip (visible only when the gallery is configured with
// slots). Each slot is a square tile that shows its bound item (if any) or
// a dashed placeholder with the slot label. Three interaction paths
//   click-then-click  click a slot to activate it, then click a grid item
//                     to bind. Esc / clicking the same slot again cancels
//   drag-and-drop     drag a grid item onto a slot to bind
//   slot-to-slot DnD  drag a bound slot onto another slot to move the
//                     binding. The source slot is left empty afterwards
//                     (a "move" not a "swap" since duplicates are allowed,
//                     so swap semantics would be surprising)
//   unbind            click the X overlay on a bound slot
// ********************************************************************************
// == Types =======================================================================
type BindCallback        = (slotId: string, itemId: string | null) => void;
type MoveBindingCallback = (fromSlotId: string, toSlotId: string) => void;
type SelectingCallback   = (slotId: string | null) => void;

// == Drag DataTransfer Keys ======================================================
/** MIME used when dragging from one slot tile to another */
const DRAG_SLOT_MIME = 'application/x-charmiq-gallery-slot';

// == Class =======================================================================
/** renders the slot tiles and handles all slot-side user interactions.
 *  stateless wrt bindings / slots — main.ts calls render() on every change */
export class SlotStrip {
  // == DOM ========================================================================
  private readonly stripEl: HTMLElement;
  private readonly tilesEl: HTMLElement;

  // == Callbacks ==================================================================
  private onBind:        BindCallback        | null = null;
  private onMoveBinding: MoveBindingCallback | null = null;
  private onSelecting:   SelectingCallback   | null = null;

  // == State ======================================================================
  private slots:       ReadonlyArray<SlotDefinition> = [];
  private bindingById: ReadonlyMap<string, BindingRecord> = new Map();
  private itemsById:   ReadonlyMap<string, GalleryItem>   = new Map();

  /** currently-active slot (click-to-bind mode); null when no slot is selected */
  private activeSlotId: string | null = null;

  // == Lifecycle =================================================================
  public constructor() {
    this.stripEl = document.getElementById('slotStrip')!;
    this.tilesEl = document.getElementById('slotTiles')!;
  }

  // == Callback registration =====================================================
  public setOnBind(cb: BindCallback):               void { this.onBind        = cb; }
  public setOnMoveBinding(cb: MoveBindingCallback): void { this.onMoveBinding = cb; }
  public setOnSelecting(cb: SelectingCallback):     void { this.onSelecting   = cb; }

  // == Public ====================================================================
  /** full re-render of the slot strip from slots + bindings + items */
  public render(
    slots:    ReadonlyArray<SlotDefinition>,
    bindings: ReadonlyArray<BindingRecord>,
    items:    ReadonlyArray<GalleryItem>
  ): void {
    this.slots = slots;
    this.bindingById = new Map(bindings.map(b => [b.slotId, b]));
    this.itemsById   = new Map(items.map(i => [i.itemId, i]));

    // hide the strip entirely when no slots are configured
    this.stripEl.hidden = (slots.length < 1);
    if(slots.length < 1) {
      this.tilesEl.innerHTML = '';
      this.clearActiveSlot();
      return;
    } /* else -- slot mode: render the tiles */

    this.tilesEl.innerHTML = '';
    for(const slot of slots) {
      this.tilesEl.appendChild(this.buildTile(slot));
    }

    // re-apply the active highlight after re-rendering
    if(this.activeSlotId) this.reflectActiveSlotInDom();
  }

  // ------------------------------------------------------------------------------
  /** called by main.ts on a global Esc: clear any selecting state */
  public clearActiveSlot(): void {
    if(!this.activeSlotId) return;/*already cleared*/
    this.activeSlotId = null;
    this.reflectActiveSlotInDom();
    this.onSelecting?.(null);
  }

  // == Internal ==================================================================
  /** build a single slot tile */
  private buildTile(slot: SlotDefinition): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'slot-tile';
    tile.dataset.slotId = slot.id;

    const binding = this.bindingById.get(slot.id);
    const boundItem = (binding && binding.itemId) ? this.itemsById.get(binding.itemId) : undefined;

    if(boundItem) {
      tile.classList.add('bound');
      tile.draggable = true/*allow dragging to another slot to move the binding*/;

      const img = document.createElement('img');
      img.className = 'slot-tile-image';
      img.src = boundItem.downloadUrl;
      img.alt = boundItem.name || '';
      img.crossOrigin = 'anonymous';
      tile.appendChild(img);

      // unbind (X) overlay
      const unbind = document.createElement('button');
      unbind.className = 'slot-tile-unbind';
      unbind.title = 'Clear slot';
      unbind.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`;
      unbind.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onBind?.(slot.id, null);
      });
      tile.appendChild(unbind);
    } else {
      const ph = document.createElement('div');
      ph.className = 'slot-tile-placeholder';
      ph.textContent = 'Empty';
      tile.appendChild(ph);
    }

    // always render the label on top of the tile
    const label = document.createElement('div');
    label.className = 'slot-tile-label';
    label.textContent = slot.label;
    tile.appendChild(label);

    // click: toggle this slot as the selecting target
    tile.addEventListener('click', () => this.toggleActiveSlot(slot.id));

    // drag source: only bound tiles can be dragged to other slots
    if(boundItem) {
      tile.addEventListener('dragstart', (e) => {
        if(!e.dataTransfer) return;
        e.dataTransfer.setData(DRAG_SLOT_MIME, slot.id);
        e.dataTransfer.effectAllowed = 'move';
      });
    } /* else -- empty slot: not a drag source */

    // drop target: accept grid items (DRAG_ITEM_MIME) or another slot
    tile.addEventListener('dragenter', (e) => {
      if(!isAcceptedDrag(e)) return;
      e.preventDefault();
      tile.classList.add('drag-over');
    });
    tile.addEventListener('dragover', (e) => {
      if(!isAcceptedDrag(e)) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_SLOT_MIME) ? 'move' : 'copy';
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
    tile.addEventListener('drop', (e) => {
      tile.classList.remove('drag-over');
      if(!e.dataTransfer) return;
      e.preventDefault();

      // prefer slot-to-slot move if that MIME is present
      const fromSlotId = e.dataTransfer.getData(DRAG_SLOT_MIME);
      if(fromSlotId && (fromSlotId !== slot.id)) {
        this.onMoveBinding?.(fromSlotId, slot.id);
        return;
      } /* else -- either same-slot drop or grid-item drop */

      const itemId = e.dataTransfer.getData(DRAG_ITEM_MIME);
      if(itemId) this.onBind?.(slot.id, itemId);
    });

    return tile;
  }

  // ------------------------------------------------------------------------------
  /** toggle the given slot as the current selecting target */
  private toggleActiveSlot(slotId: string): void {
    if(this.activeSlotId === slotId) {
      this.clearActiveSlot();
      return;
    } /* else -- activate this slot */

    this.activeSlotId = slotId;
    this.reflectActiveSlotInDom();
    this.onSelecting?.(slotId);
  }

  // ------------------------------------------------------------------------------
  /** apply the `.active` class to the tile whose id matches activeSlotId */
  private reflectActiveSlotInDom(): void {
    const tiles = this.tilesEl.querySelectorAll<HTMLElement>('.slot-tile');
    tiles.forEach((t) => {
      t.classList.toggle('active', t.dataset.slotId === this.activeSlotId);
    });
  }

  // ------------------------------------------------------------------------------
  /** public getter for the currently active slotId (null when none) */
  public getActiveSlotId(): string | null { return this.activeSlotId; }
}

// == Helpers =====================================================================
/** true if the DragEvent carries a MIME we accept (item or slot) */
const isAcceptedDrag = (e: DragEvent): boolean => {
  const types = e.dataTransfer?.types;
  if(!types) return false;
  return types.includes(DRAG_ITEM_MIME) || types.includes(DRAG_SLOT_MIME);
};
