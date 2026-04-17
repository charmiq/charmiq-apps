import type { Observable } from 'rxjs';

// owns drawing configuration persisted via appState. Configuration includes grid
// visibility / color, canvas background, read-only flag, and UI chrome toggles
// (toolbar / properties panel / info bar). All reads / writes to appState for
// config go through here
// ********************************************************************************
// == Types =======================================================================
/** user-tunable palettes that back the properties-panel dropdowns. Each list
 *  keeps the "Excalidraw-lite" defaults on first run but can be curated via the
 *  settings panel. The final "Custom..." row in every dropdown is always
 *  present and never stored here -- it opens the ad-hoc picker instead */
export interface DrawingPresets {
  /** shape outline colors (hex / rgb / rgba) */
  strokeColors: ReadonlyArray<string>;
  /** shape fill / background colors (typically rgba with alpha) */
  backgroundColors: ReadonlyArray<string>;
  /** text fill colors */
  textColors: ReadonlyArray<string>;
  /** stroke widths in pixels */
  strokeWidths: ReadonlyArray<number>;
  /** font sizes in points */
  fontSizes: ReadonlyArray<number>;
  /** font family presets -- short label + CSS family stack. The first entry is
   *  the drawing default (used when an element has no fontFamily set) */
  fontFamilies: ReadonlyArray<{ label: string; family: string; googleFont?: string }>;
}

/** session-spanning "recently used" lists. These are populated by custom
 *  picker interactions and trimmed to a short cap so the panel stays compact.
 *  Entries can be promoted into presets via the pin action */
export interface DrawingRecents {
  strokeColors: ReadonlyArray<string>;
  backgroundColors: ReadonlyArray<string>;
  textColors: ReadonlyArray<string>;
  strokeWidths: ReadonlyArray<number>;
  fontSizes: ReadonlyArray<number>;
  fontFamilies: ReadonlyArray<{ label: string; family: string; googleFont?: string }>;
}

export interface DrawingConfig {
  /** whether the background grid is drawn */
  showGrid: boolean;
  /** color of the grid lines */
  gridColor: string;
  /** canvas background color */
  backgroundColor: string;
  /** if true, drawing / editing is disabled (pan, zoom, select still work) */
  readOnly: boolean;
  /** show the main toolbar (shape tools, generate, export) */
  showToolbar: boolean;
  /** initial canvas pan offset in screen pixels. The default `{100, 100}`
   *  leaves room for the top-left toolbar; set both to 0 for a flush viewport */
  initialPanX: number;
  initialPanY: number;
  /** initial canvas zoom level (1 = 100%) */
  initialZoom: number;
  /** show the properties panel when elements are selected */
  showPropertiesPanel: boolean;
  /** show the info / hint bar under the toolbar */
  showInfoBar: boolean;
  /** user-curated palettes for every properties-panel dropdown */
  presets: DrawingPresets;
  /** most-recent custom picks (per-list, trimmed to RECENTS_MAX) */
  recents: DrawingRecents;
}

// --------------------------------------------------------------------------------
/** shape of the full appState object — we share it with the elements we retain
 *  from the previous model so that legacy state is still readable, but writes
 *  only touch the config sub-object */
interface AppState {
  readonly config?: Readonly<Partial<DrawingConfig>>;
}

// --------------------------------------------------------------------------------
type ConfigChangedCallback = (config: Readonly<DrawingConfig>) => void;

// == CharmIQ API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<AppState | null>;
  set(state: AppState): Promise<void>;
  get(): Promise<AppState | null>;
}

// == Defaults ====================================================================
/** maximum number of session recents retained per property */
export const RECENTS_MAX = 6;

/** Excalidraw-lite default palettes -- used on first run and as the "Reset
 *  Defaults" target. Kept intentionally short so the panel stays calm */
export const DEFAULT_PRESETS: Readonly<DrawingPresets> = {
  strokeColors:     ['#000000', '#d51a25', '#299035', '#165ab5', '#e97909', '#666666'],
  backgroundColors: ['transparent', 'rgba(255,255,255,0.5)', 'rgba(245,179,183,0.5)', 'rgba(179,230,186,0.5)', 'rgba(179,209,240,0.5)', 'rgba(245,217,179,0.5)'],
  textColors:       ['#000000', '#d51a25', '#299035', '#165ab5', '#e97909', '#666666'],
  strokeWidths:     [1, 2, 4],
  fontSizes:        [12, 16, 20, 24],
  fontFamilies: [
    { label: 'Hand-drawn', family: 'Excalifont, "Comic Sans MS", cursive, system-ui, sans-serif' },
    { label: 'Sans',       family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { label: 'Serif',      family: 'Georgia, "Times New Roman", Times, serif' },
    { label: 'Mono',       family: '"JetBrains Mono", Menlo, Consolas, monospace' },
  ],
};

export const DEFAULT_RECENTS: Readonly<DrawingRecents> = {
  strokeColors:     [],
  backgroundColors: [],
  textColors:       [],
  strokeWidths:     [],
  fontSizes:        [],
  fontFamilies:     [],
};

export const DEFAULT_CONFIG: Readonly<DrawingConfig> = {
  showGrid: true,
  gridColor: '#e0e0e0',
  backgroundColor: '#fafafa',
  readOnly: false,
  showToolbar: true,
  initialPanX: 100,
  initialPanY: 100,
  initialZoom: 1,
  showPropertiesPanel: true,
  showInfoBar: true,
  presets: DEFAULT_PRESETS,
  recents: DEFAULT_RECENTS,
};

// == Class =======================================================================
export class ConfigStore {
  private readonly appState: CharmiqAppState;
  private config: DrawingConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  public constructor(appState: CharmiqAppState) {
    this.appState = appState;
  }

  // ------------------------------------------------------------------------------
  public onChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** load initial state from appState and subscribe to ongoing changes */
  public async init(): Promise<void> {
    const state = await this.appState.get();
    if(state) this.applyState(state);

    this.appState.onChange$().subscribe((state: AppState | null) => {
      if(state) this.applyState(state);
      /* else -- no state yet; defaults already in place */
    });
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<DrawingConfig> { return this.config; }

  // == Writers ===================================================================
  /** update a single config field in appState (fetch-merge-set) */
  public async update<K extends keyof DrawingConfig>(key: K, value: DrawingConfig[K]): Promise<void> {
    if(this.config[key] === value) return;/*no-op*/
    this.config = { ...this.config, [key]: value };

    try {
      const state = (await this.appState.get()) || {};
      const currentConfig = (state as AppState).config || {};
      await this.appState.set({
        ...state,
        config: { ...currentConfig, [key]: value },
      });
    } catch(error) {
      console.error('failed to update drawing config:', error);
    }

    if(this.onConfigChanged) this.onConfigChanged(this.config);
  }

  // ------------------------------------------------------------------------------
  /** bulk replace of the full config object (used by the settings panel) */
  public async replace(config: DrawingConfig): Promise<void> {
    this.config = { ...config };

    try {
      const state = (await this.appState.get()) || {};
      await this.appState.set({ ...state, config: { ...config } });
    } catch(error) {
      console.error('failed to replace drawing config:', error);
    }

    if(this.onConfigChanged) this.onConfigChanged(this.config);
  }

  // ------------------------------------------------------------------------------
  /** append a value to the front of a recents list, de-dupe, and trim to
   *  RECENTS_MAX. Equality is reference for primitives and deep for font-family
   *  entries (matched by `family`) */
  public async pushRecent<K extends keyof DrawingRecents>(list: K, value: DrawingRecents[K][number]): Promise<void> {
    const prior = this.config.recents[list] as ReadonlyArray<unknown>;
    const matches = (a: unknown, b: unknown): boolean => {
      if((typeof a === 'object') && (typeof b === 'object') && a && b) return (a as any).family === (b as any).family;
      return a === b;
    };
    const deduped = [value, ...prior.filter(v => !matches(v, value))].slice(0, RECENTS_MAX);
    const nextRecents: DrawingRecents = { ...this.config.recents, [list]: deduped };
    await this.update('recents', nextRecents);
  }

  // ------------------------------------------------------------------------------
  /** promote a recents entry into the preset list (and remove it from recents).
   *  used by the pin action on a recents swatch */
  public async pinToPreset<K extends keyof DrawingPresets>(list: K, value: DrawingPresets[K][number]): Promise<void> {
    const priorPresets = this.config.presets[list] as ReadonlyArray<unknown>;
    const priorRecents = this.config.recents[list as keyof DrawingRecents] as ReadonlyArray<unknown>;
    const matches = (a: unknown, b: unknown): boolean => {
      if((typeof a === 'object') && (typeof b === 'object') && a && b) return (a as any).family === (b as any).family;
      return a === b;
    };
    if(priorPresets.some(v => matches(v, value))) return;/*already a preset*/

    const nextPresets: DrawingPresets = { ...this.config.presets, [list]: [...priorPresets, value] };
    const nextRecents: DrawingRecents = { ...this.config.recents, [list]: priorRecents.filter(v => !matches(v, value)) };

    this.config = { ...this.config, presets: nextPresets, recents: nextRecents };
    try {
      const state = (await this.appState.get()) || {};
      const currentConfig = (state as AppState).config || {};
      await this.appState.set({
        ...state,
        config: { ...currentConfig, presets: nextPresets, recents: nextRecents },
      });
    } catch(error) {
      console.error('failed to pin preset:', error);
    }
    if(this.onConfigChanged) this.onConfigChanged(this.config);
  }

  // ------------------------------------------------------------------------------
  /** remove a value from a preset list */
  public async removePreset<K extends keyof DrawingPresets>(list: K, value: DrawingPresets[K][number]): Promise<void> {
    const priorPresets = this.config.presets[list] as ReadonlyArray<unknown>;
    const matches = (a: unknown, b: unknown): boolean => {
      if((typeof a === 'object') && (typeof b === 'object') && a && b) return (a as any).family === (b as any).family;
      return a === b;
    };
    const nextPresets: DrawingPresets = { ...this.config.presets, [list]: priorPresets.filter(v => !matches(v, value)) };
    await this.update('presets', nextPresets);
  }

  // == Internal ==================================================================
  private applyState(state: AppState): void {
    if(!state.config) return;/*nothing to apply*/

    const next: DrawingConfig = { ...this.config };
    let changed = false;

    const boolKeys: (keyof DrawingConfig)[] = ['showGrid', 'readOnly', 'showToolbar', 'showPropertiesPanel', 'showInfoBar'];
    for(const key of boolKeys) {
      const v = (state.config as any)[key];
      if((typeof v === 'boolean') && (v !== (next as any)[key])) {
        (next as any)[key] = v;
        changed = true;
      } /* else -- not present or unchanged */
    }

    const strKeys: (keyof DrawingConfig)[] = ['gridColor', 'backgroundColor'];
    for(const key of strKeys) {
      const v = (state.config as any)[key];
      if((typeof v === 'string') && (v !== (next as any)[key])) {
        (next as any)[key] = v;
        changed = true;
      } /* else -- not present or unchanged */
    }

    const numKeys: (keyof DrawingConfig)[] = ['initialPanX', 'initialPanY', 'initialZoom'];
    for(const key of numKeys) {
      const v = (state.config as any)[key];
      if((typeof v === 'number') && Number.isFinite(v) && (v !== (next as any)[key])) {
        (next as any)[key] = v;
        changed = true;
      } /* else -- not present or unchanged */
    }

    // presets -- merge per-list; any list not provided keeps the default. This
    // way a persisted config written before presets existed (or that only
    // customized a subset) still lights up the remaining lists with sensible
    // defaults rather than showing an empty dropdown
    const rawPresets = (state.config as any).presets;
    if(rawPresets && (typeof rawPresets === 'object')) {
      const mergedPresets: DrawingPresets = { ...DEFAULT_PRESETS, ...next.presets };
      if(Array.isArray(rawPresets.strokeColors))     mergedPresets.strokeColors     = rawPresets.strokeColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.backgroundColors)) mergedPresets.backgroundColors = rawPresets.backgroundColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.textColors))       mergedPresets.textColors       = rawPresets.textColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.strokeWidths))     mergedPresets.strokeWidths     = rawPresets.strokeWidths.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v));
      if(Array.isArray(rawPresets.fontSizes))        mergedPresets.fontSizes        = rawPresets.fontSizes.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v));
      if(Array.isArray(rawPresets.fontFamilies))     mergedPresets.fontFamilies     = rawPresets.fontFamilies.filter((v: any) => v && (typeof v.label === 'string') && (typeof v.family === 'string'));
      next.presets = mergedPresets;
      changed = true;
    } /* else -- no presets persisted; defaults remain */

    const rawRecents = (state.config as any).recents;
    if(rawRecents && (typeof rawRecents === 'object')) {
      const mergedRecents: DrawingRecents = { ...DEFAULT_RECENTS, ...next.recents };
      if(Array.isArray(rawRecents.strokeColors))     mergedRecents.strokeColors     = rawRecents.strokeColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.backgroundColors)) mergedRecents.backgroundColors = rawRecents.backgroundColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.textColors))       mergedRecents.textColors       = rawRecents.textColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.strokeWidths))     mergedRecents.strokeWidths     = rawRecents.strokeWidths.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v)).slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.fontSizes))        mergedRecents.fontSizes        = rawRecents.fontSizes.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v)).slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.fontFamilies))     mergedRecents.fontFamilies     = rawRecents.fontFamilies.filter((v: any) => v && (typeof v.label === 'string') && (typeof v.family === 'string')).slice(0, RECENTS_MAX);
      next.recents = mergedRecents;
      changed = true;
    } /* else -- no recents persisted; defaults remain */

    if(changed) {
      this.config = next;
      if(this.onConfigChanged) this.onConfigChanged(this.config);
    } /* else -- nothing actually changed */
  }
}
