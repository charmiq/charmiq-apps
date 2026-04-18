import type { Observable } from 'rxjs';

// owns gallery configuration (slot definitions, orientation override, zoom,
// item cap, picker category) persisted via appState. Only this module touches
// appState directly. Configuration is distinct from content: slot *definitions*
// are config (here) while the *bindings* of items into slots are user data and
// live in appContent via ContentBridge
// ********************************************************************************
// == Types =======================================================================
/** a slot definition: label + id. A consuming app declares these so that its User
 *  has named positions to drop images into (e.g. iChannel0..3) */
export interface SlotDefinition {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
}

// --------------------------------------------------------------------------------
/** orientation override. `auto` adapts to the container aspect ratio */
export type OrientationMode = 'auto' | 'horizontal' | 'vertical';

// --------------------------------------------------------------------------------
/** category forwarded to the platform media picker */
export type AssetCategory = 'image';

// --------------------------------------------------------------------------------
/** gallery configuration synced to appState */
export interface GalleryConfig {
  /** optional slot definitions; absent => plain-gallery mode */
  slots: ReadonlyArray<SlotDefinition> | undefined;
  /** 0 = unlimited */
  maxItems: number;
  /** category forwarded to the media picker; only image is implemented in v1 */
  assetCategory: AssetCategory;
  /** show the lightbox on item click */
  showLightbox: boolean;
  /** layout override (default auto) */
  orientation: OrientationMode;
  /** persisted UI preference — grid tile minimum width in px */
  zoomSize: number;
}

// --------------------------------------------------------------------------------
/** shape of the full appState object */
interface AppState {
  readonly config?: Readonly<Partial<GalleryConfig>>;
}

// --------------------------------------------------------------------------------
/** callback when gallery config changes (from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<GalleryConfig>) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<AppState | null>;
  set(state: AppState): Promise<void>;
  get(): Promise<AppState | null>;
}

// == Defaults ====================================================================
/** the default gallery configuration */
const DEFAULT_CONFIG: Readonly<GalleryConfig> = {
  slots:          undefined/*plain-gallery mode*/,
  maxItems:       0/*unlimited*/,
  assetCategory:  'image',
  showLightbox:   true,
  orientation:    'auto',
  zoomSize:       200/*px*/
};

/** clamp bounds for zoomSize (matches the slider range in index.html) */
const ZOOM_MIN = 80/*px*/;
const ZOOM_MAX = 400/*px*/;

// == Class =======================================================================
/** manages gallery configuration via appState. Configuration only — item
 *  data and slot bindings live in appContent */
export class ConfigStore {
  private readonly appState: CharmiqAppState;

  private config: GalleryConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  public constructor(appState: CharmiqAppState) {
    this.appState = appState;
  }

  // ------------------------------------------------------------------------------
  /** register callback for config changes arriving from remote appState updates */
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** load initial state from appState and subscribe to ongoing changes */
  public async init(): Promise<void> {
    const state = await this.appState.get();
    if(state) this.applyState(state);

    this.appState.onChange$().subscribe((state: AppState | null) => {
      if(!state) return;/*no state to apply*/
      this.applyState(state);
    });
  }

  // == Getters ===================================================================
  /** the currently resolved configuration */
  public getConfig(): Readonly<GalleryConfig> { return this.config; }

  /** true when the gallery is configured with a slot layer */
  public hasSlots(): boolean {
    const slots = this.config.slots;
    return !!slots && (slots.length > 0);
  }

  // == Writers (fetch-merge-set) =================================================
  /** persist the zoom preference (slider position) */
  public async updateZoomSize(zoomSize: number): Promise<void> {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoomSize)));
    if(clamped === this.config.zoomSize) return;/*no change*/

    this.config = { ...this.config, zoomSize: clamped };
    try {
      const state = await this.appState.get() || {};
      const currentConfig = (state as AppState).config || {};
      await this.appState.set({
        ...state,
        config: { ...currentConfig, zoomSize: clamped }
      });
    } catch(error) {
      console.error('failed to update zoomSize:', error);
    }
  }

  // == Internal ==================================================================
  /** apply an incoming appState snapshot to local state and notify callback */
  private applyState(state: AppState): void {
    if(!state.config) return;/*nothing to merge*/

    const incoming = state.config;
    const next: GalleryConfig = { ...this.config };
    let changed = false;

    // slots (readonly array of definitions; undefined disables slot mode)
    if('slots' in incoming) {
      const nextSlots = this.normalizeSlots(incoming.slots);
      if(!slotsEqual(nextSlots, next.slots)) {
        next.slots = nextSlots;
        changed = true;
      } /* else -- slots unchanged */
    } /* else -- slots not in this update */

    // maxItems (0 = unlimited)
    if(typeof incoming.maxItems === 'number') {
      const clamped = Math.max(0, Math.floor(incoming.maxItems));
      if(clamped !== next.maxItems) {
        next.maxItems = clamped;
        changed = true;
      } /* else -- maxItems unchanged */
    } /* else -- maxItems not in this update */

    // assetCategory (only 'image' is implemented, but accept the shape)
    if(typeof incoming.assetCategory === 'string') {
      const cat = incoming.assetCategory as AssetCategory;
      if(cat !== next.assetCategory) {
        next.assetCategory = cat;
        changed = true;
      } /* else -- assetCategory unchanged */
    } /* else -- assetCategory not in this update */

    // showLightbox
    if(typeof incoming.showLightbox === 'boolean') {
      if(incoming.showLightbox !== next.showLightbox) {
        next.showLightbox = incoming.showLightbox;
        changed = true;
      } /* else -- showLightbox unchanged */
    } /* else -- showLightbox not in this update */

    // orientation (auto | horizontal | vertical)
    if(typeof incoming.orientation === 'string') {
      const orient = normalizeOrientation(incoming.orientation);
      if(orient !== next.orientation) {
        next.orientation = orient;
        changed = true;
      } /* else -- orientation unchanged */
    } /* else -- orientation not in this update */

    // zoomSize
    if(typeof incoming.zoomSize === 'number') {
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(incoming.zoomSize)));
      if(z !== next.zoomSize) {
        next.zoomSize = z;
        changed = true;
      } /* else -- zoomSize unchanged */
    } /* else -- zoomSize not in this update */

    this.config = next;
    if(changed && this.onConfigChanged) this.onConfigChanged({ ...this.config });
  }

  // ------------------------------------------------------------------------------
  /** coerce an unknown slots value into a validated SlotDefinition array or
   *  undefined if the input is missing / malformed */
  private normalizeSlots(raw: unknown): ReadonlyArray<SlotDefinition> | undefined {
    if(!Array.isArray(raw)) return undefined;
    const out: SlotDefinition[] = [];
    for(const entry of raw) {
      if(!entry || (typeof entry !== 'object')) continue;/*skip malformed*/
      const e = entry as Partial<SlotDefinition>;
      if((typeof e.id !== 'string') || (e.id.length < 1)) continue;
      const label = (typeof e.label === 'string') && (e.label.length > 0) ? e.label : e.id;
      const required = (typeof e.required === 'boolean') ? e.required : false;
      out.push({ id: e.id, label, required });
    }
    if(out.length < 1) return undefined;
    return out;
  }
}

// == Helpers =====================================================================
/** coerce an arbitrary orientation string onto the enum */
const normalizeOrientation = (raw: string): OrientationMode => {
  if(raw === 'horizontal') return 'horizontal';
  if(raw === 'vertical')   return 'vertical';
  return 'auto';
};

// --------------------------------------------------------------------------------
/** structural equality for slot definition arrays */
const slotsEqual = (a: ReadonlyArray<SlotDefinition> | undefined, b: ReadonlyArray<SlotDefinition> | undefined): boolean => {
  if(a === b) return true;
  if(!a || !b) return false;
  if(a.length !== b.length) return false;
  for(let i=0; i<a.length; i++) {
    if(a[i].id !== b[i].id) return false;
    if(a[i].label !== b[i].label) return false;
    if(!!a[i].required !== !!b[i].required) return false;
  }
  return true;
};
