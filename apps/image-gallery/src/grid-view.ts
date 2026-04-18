import type { GalleryItem } from './content-bridge';

// renders the image grid, the lightbox, and the zoom slider. Items are
// draggable (the slot strip is the drop target). When a slot is "active"
// (selecting mode, set by main.ts via setSelectingSlot) the grid switches
// click semantics from open-lightbox to bind-selected-slot, and a visual
// affordance appears on hover
// ********************************************************************************
// == Types =======================================================================
/** fired when the User picks a grid item while a slot is active */
type BindSelectedCallback = (itemId: string) => void;

/** fired when the User hits the per-tile remove (X) button */
type RemoveCallback       = (itemId: string) => void;

/** fired when the User clicks the top-right Add button */
type AddCallback          = () => void;

// == Drag DataTransfer Keys ======================================================
/** MIME used when dragging a grid item. Slot tiles read this to resolve the
 *  itemId on drop. Using a custom MIME avoids colliding with text/uri-list
 *  which browsers sometimes add automatically */
export const DRAG_ITEM_MIME = 'application/x-charmiq-gallery-item';

// == Class =======================================================================
/** manages the grid + lightbox DOM. Stateless wrt items — main.ts owns the
 *  item list and calls render() on every change */
export class GridView {
  // == DOM ========================================================================
  private readonly appEl:        HTMLElement;
  private readonly gridEl:       HTMLElement;
  private readonly emptyStateEl: HTMLElement;
  private readonly emptyAddBtn:  HTMLButtonElement;
  private readonly addBtn:       HTMLButtonElement;
  private readonly zoomSlider:   HTMLInputElement;
  private readonly statusEl:     HTMLElement;

  private readonly lightboxEl:   HTMLElement;
  private readonly lbImageEl:    HTMLImageElement;
  private readonly lbCounterEl:  HTMLElement;
  private readonly lbCloseBtn:   HTMLButtonElement;
  private readonly lbPrevBtn:    HTMLButtonElement;
  private readonly lbNextBtn:    HTMLButtonElement;

  // == Callbacks ==================================================================
  private onAdd:              AddCallback          | null = null;
  private onRemove:           RemoveCallback       | null = null;
  private onBindSelected:     BindSelectedCallback | null = null;
  private onZoomCommit:       ((z: number) => void) | null = null;

  // == State ======================================================================
  private items:         ReadonlyArray<GalleryItem> = [];
  private selectingSlot: boolean = false;
  private lightboxIndex: number = 0;
  private lightboxOn:    boolean = false;

  // == Lifecycle =================================================================
  public constructor() {
    this.appEl        = document.getElementById('app')!;
    this.gridEl       = document.getElementById('grid')!;
    this.emptyStateEl = document.getElementById('emptyState')!;
    this.emptyAddBtn  = document.getElementById('emptyAddBtn') as HTMLButtonElement;
    this.addBtn       = document.getElementById('addBtn')      as HTMLButtonElement;
    this.zoomSlider   = document.getElementById('zoomSlider')  as HTMLInputElement;
    this.statusEl     = document.getElementById('status')!;

    this.lightboxEl   = document.getElementById('lightbox')!;
    this.lbImageEl    = document.getElementById('lbImage')  as HTMLImageElement;
    this.lbCounterEl  = document.getElementById('lbCounter')!;
    this.lbCloseBtn   = document.getElementById('lbClose') as HTMLButtonElement;
    this.lbPrevBtn    = document.getElementById('lbPrev')  as HTMLButtonElement;
    this.lbNextBtn    = document.getElementById('lbNext')  as HTMLButtonElement;
  }

  // ------------------------------------------------------------------------------
  /** wire DOM listeners that are independent of the item list */
  public init(): void {
    this.addBtn.addEventListener('click', () => this.onAdd?.());
    this.emptyAddBtn.addEventListener('click', () => this.onAdd?.());

    // zoom slider live-updates the CSS var; a commit (change event) persists
    this.zoomSlider.addEventListener('input', () => this.applyZoomFromSlider(false));
    this.zoomSlider.addEventListener('change', () => this.applyZoomFromSlider(true));

    // lightbox controls
    this.lbCloseBtn.addEventListener('click', () => this.closeLightbox());
    this.lbPrevBtn.addEventListener('click',  () => this.navLightbox(-1));
    this.lbNextBtn.addEventListener('click',  () => this.navLightbox(+1));
    this.lightboxEl.addEventListener('click', (e) => {
      if(e.target === this.lightboxEl) this.closeLightbox();
    });
    document.addEventListener('keydown', (e) => this.handleKey(e));
  }

  // == Callback registration =====================================================
  public setOnAdd(cb: AddCallback):                       void { this.onAdd          = cb; }
  public setOnRemove(cb: RemoveCallback):                 void { this.onRemove       = cb; }
  public setOnBindSelected(cb: BindSelectedCallback):     void { this.onBindSelected = cb; }
  public setOnZoomCommit(cb: (zoom: number) => void):     void { this.onZoomCommit   = cb; }

  // == Public ====================================================================
  /** render the full grid from the current items array */
  public render(items: ReadonlyArray<GalleryItem>): void {
    this.items = items;

    // empty state branch
    const empty = (items.length < 1);
    this.emptyStateEl.hidden = !empty;
    this.gridEl.hidden = empty;

    // build the grid tiles
    this.gridEl.innerHTML = '';
    for(const item of items) {
      this.gridEl.appendChild(this.buildTile(item));
    }

    // reveal the grid (faded in via .loaded)
    if(!empty) {
      // small timeout lets newly-inserted img nodes start decoding before we
      // fade them in — avoids a visible pop on first render
      setTimeout(() => this.gridEl.classList.add('loaded'), 20);
    } else {
      this.gridEl.classList.remove('loaded');
    } /* else -- empty state showing */

    this.updateStatus();
  }

  // ------------------------------------------------------------------------------
  /** toggle slot-selecting mode (on = clicks bind; off = clicks open lightbox) */
  public setSelectingSlot(selecting: boolean): void {
    this.selectingSlot = selecting;
    this.appEl.classList.toggle('slot-selecting', selecting);
  }

  // ------------------------------------------------------------------------------
  /** apply the given zoom size directly (used when config store publishes a
   *  change from a remote update) */
  public applyZoom(zoomSize: number): void {
    this.zoomSlider.value = String(zoomSize);
    document.documentElement.style.setProperty('--grid-min', `${zoomSize}px`);
  }

  // ------------------------------------------------------------------------------
  /** set the status label shown in the header (e.g. "4 items", "Loading…") */
  public setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  // == Internal ==================================================================
  /** build a single grid tile */
  private buildTile(item: GalleryItem): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'grid-item';
    tile.dataset.itemId = item.itemId;
    tile.draggable = true;
    tile.title = item.name || item.assetId;

    const img = document.createElement('img');
    img.src = item.downloadUrl;
    img.alt = item.name || '';
    img.loading = 'lazy';
    img.crossOrigin = 'anonymous'/*so other apps can sample the texture*/;
    tile.appendChild(img);

    // remove button (appears on hover)
    const remove = document.createElement('button');
    remove.className = 'grid-item-remove';
    remove.title = 'Remove';
    remove.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`;
    remove.addEventListener('click', (e) => {
      e.stopPropagation()/*don't open the lightbox or bind*/;
      this.onRemove?.(item.itemId);
    });
    tile.appendChild(remove);

    // click: bind (selecting mode) or open lightbox
    tile.addEventListener('click', () => {
      if(this.selectingSlot) {
        this.onBindSelected?.(item.itemId);
      } else {
        this.openLightbox(this.items.findIndex(i => i.itemId === item.itemId));
      }
    });

    // drag: ship the itemId so the slot strip can accept it on drop
    tile.addEventListener('dragstart', (e) => {
      if(!e.dataTransfer) return;
      e.dataTransfer.setData(DRAG_ITEM_MIME, item.itemId);
      e.dataTransfer.effectAllowed = 'copy';
      tile.classList.add('dragging');
    });
    tile.addEventListener('dragend', () => tile.classList.remove('dragging'));

    return tile;
  }

  // ------------------------------------------------------------------------------
  /** update the header status label to reflect the current item count */
  private updateStatus(): void {
    const n = this.items.length;
    this.statusEl.textContent = (n < 1)
      ? 'Empty'
      : `${n} item${n === 1 ? '' : 's'}`;
  }

  // ------------------------------------------------------------------------------
  /** read the current slider value and either apply it live or commit it */
  private applyZoomFromSlider(commit: boolean): void {
    const z = parseInt(this.zoomSlider.value, 10);
    document.documentElement.style.setProperty('--grid-min', `${z}px`);
    if(commit) this.onZoomCommit?.(z);
  }

  // == Lightbox ==================================================================
  private openLightbox(idx: number): void {
    if((idx < 0) || (idx >= this.items.length)) return;
    this.lightboxIndex = idx;
    this.lightboxOn = true;
    this.lightboxEl.hidden = false;
    this.lightboxEl.classList.add('active');
    this.updateLightbox();
  }

  // ------------------------------------------------------------------------------
  private closeLightbox(): void {
    this.lightboxOn = false;
    this.lightboxEl.classList.remove('active');
    // delay hidden attribute until fade completes
    setTimeout(() => {
      if(!this.lightboxOn) this.lightboxEl.hidden = true;
    }, 220);
  }

  // ------------------------------------------------------------------------------
  private navLightbox(delta: number): void {
    if(this.items.length < 1) { this.closeLightbox(); return; }
    this.lightboxIndex = (this.lightboxIndex + delta + this.items.length) % this.items.length;
    this.updateLightbox();
  }

  // ------------------------------------------------------------------------------
  private updateLightbox(): void {
    const item = this.items[this.lightboxIndex];
    if(!item) { this.closeLightbox(); return; }
    this.lbImageEl.src = item.downloadUrl;
    this.lbImageEl.alt = item.name || '';

    const cur = (this.lightboxIndex + 1).toString().padStart(2, '0');
    const tot = this.items.length.toString().padStart(2, '0');
    this.lbCounterEl.textContent = `${cur} / ${tot}`;
  }

  // ------------------------------------------------------------------------------
  /** global keyboard handler: esc closes both lightbox and selecting mode;
   *  arrows navigate the lightbox when it's open */
  private handleKey(e: KeyboardEvent): void {
    if(e.key === 'Escape') {
      if(this.lightboxOn) { this.closeLightbox(); return; }
      if(this.selectingSlot) {
        // let main.ts clear the selection — it owns the slot strip state.
        // dispatch a custom event that main.ts listens for
        this.appEl.dispatchEvent(new CustomEvent('gallery:escape'));
      } /* else -- nothing to cancel */
      return;
    } /* else -- not Escape */

    if(!this.lightboxOn) return;/*arrow keys only apply to an open lightbox*/
    if(e.key === 'ArrowLeft')  this.navLightbox(-1);
    if(e.key === 'ArrowRight') this.navLightbox(+1);
  }
}
