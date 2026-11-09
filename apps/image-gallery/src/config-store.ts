import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

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
/** fields that may report changes — lets consumers apply only what moved */
export type ConfigField = keyof GalleryConfig;

/** callback when gallery config changes. `changedFields` is the set of fields
 *  whose value actually differs from the previous snapshot — consumers use
 *  it to avoid re-running side effects for every unrelated update */
type ConfigChangedCallback = (config: Readonly<GalleryConfig>, changedFields: ReadonlySet<ConfigField>) => void;

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
  private readonly settings: AppStateSettings;

  private config: GalleryConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  /** `onFailure` tells the person a setting was not saved or the app state can no
   *  longer be read */
  public constructor(appState: AppStateAPI, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.settings = new AppStateSettings(appState, view => this.applyState(view), onFailure);
  }

  // ------------------------------------------------------------------------------
  /** register callback for config changes */
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** follows the app state (each setting written onto the latest state, SEE:
   *  shared/app-state-settings); resolves once it is known (or unreadable) */
  public init(): Promise<void> {
    return this.settings.start();
  }

  // == Getters ===================================================================
  /** the currently resolved configuration */
  public getConfig(): Readonly<GalleryConfig> { return this.config; }

  /** true when the gallery is configured with a slot layer */
  public hasSlots(): boolean {
    const slots = this.config.slots;
    return !!slots && (slots.length > 0);
  }

  // == Writers ===================================================================
  /** persist the zoom preference (slider position) */
  public updateZoomSize(zoomSize: number): void {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(zoomSize)));
    void this.settings.change(['config', 'zoomSize'], clamped)/*a failed save is told through onFailure*/;
  }

  // == Internal ==================================================================
  /** apply the settings shown and notify the callback. The settings shown are the
   *  whole state: each field is its value there, its default where the state holds
   *  none (a refused save, another viewer's removal). The callback receives the set
   *  of fields whose value actually changed (empty => no callback) */
  private applyState(view: AppStateView): void {
    const incoming: Readonly<Partial<GalleryConfig>> = (view as AppState).config ?? {};
    const next: GalleryConfig = {
      // presence check (not type check): an explicit undefined disables slot mode
      slots:         ('slots' in incoming) ? this.normalizeSlots(incoming.slots) : DEFAULT_CONFIG.slots,
      maxItems:      (typeof incoming.maxItems === 'number') ? Math.max(0, Math.floor(incoming.maxItems)) : DEFAULT_CONFIG.maxItems/*0 = unlimited*/,
      // only 'image' is implemented, but accept the shape
      assetCategory: (typeof incoming.assetCategory === 'string') ? incoming.assetCategory as AssetCategory : DEFAULT_CONFIG.assetCategory,
      showLightbox:  (typeof incoming.showLightbox === 'boolean') ? incoming.showLightbox : DEFAULT_CONFIG.showLightbox,
      orientation:   (typeof incoming.orientation === 'string') ? normalizeOrientation(incoming.orientation) : DEFAULT_CONFIG.orientation,
      zoomSize:      (typeof incoming.zoomSize === 'number') ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(incoming.zoomSize))) : DEFAULT_CONFIG.zoomSize,
    };
    const changedFields = new Set<ConfigField>((Object.keys(next) as ConfigField[]).filter(field =>
      (field === 'slots') ? !slotsEqual(next.slots, this.config.slots) : (next[field] !== this.config[field])));

    this.config = next;
    if((changedFields.size > 0) && this.onConfigChanged) {
      this.onConfigChanged({ ...this.config }, changedFields);
    } /* else -- no-op: nothing actually changed */
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
