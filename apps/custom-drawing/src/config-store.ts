import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

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
  private readonly settings: AppStateSettings;
  private config: DrawingConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  /** `onFailure` tells the person a setting was not saved or the app state can no
   *  longer be read */
  public constructor(appState: AppStateAPI, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.settings = new AppStateSettings(appState, view => this.applyState(view), onFailure);
  }

  // ------------------------------------------------------------------------------
  public onChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** follows the app state; resolves once it is known (or unreadable) */
  public init(): Promise<void> {
    return this.settings.start();
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<DrawingConfig> { return this.config; }

  // == Writers ===================================================================
  // each setting is written onto the latest state, a palette list by list, so that
  // another person's change to another setting or list stands (SEE:
  // shared/app-state-settings). A failed save is told through onFailure
  /** update a single config field */
  public update<K extends keyof DrawingConfig>(key: K, value: DrawingConfig[K]): void {
    void this.settings.change(['config', key], value);
  }

  // ------------------------------------------------------------------------------
  /** writes the settings panel's config: only what differs from the config shown */
  public replace(config: DrawingConfig): void {
    for(const key of Object.keys(config) as Array<keyof DrawingConfig>) {
      if((key === 'presets') || (key === 'recents')) {
        const lists = config[key];
        for(const list of Object.keys(lists) as Array<keyof DrawingPresets>) this.changeList(key, list, lists[list]);
        continue;
      } /* else -- a field */
      if(JSON.stringify(config[key]) !== JSON.stringify(this.config[key])) this.update(key, config[key]);
    }
  }

  // ------------------------------------------------------------------------------
  /** append a value to the front of a recents list, de-dupe, and trim to
   *  RECENTS_MAX */
  public pushRecent<K extends keyof DrawingRecents>(list: K, value: DrawingRecents[K][number]): void {
    const prior = this.config.recents[list] as ReadonlyArray<unknown>;
    this.changeList('recents', list, [value, ...prior.filter(v => !sameEntry(v, value))].slice(0, RECENTS_MAX));
  }

  // ------------------------------------------------------------------------------
  /** promote a recents entry into the preset list (and remove it from recents).
   *  used by the pin action on a recents swatch */
  public pinToPreset<K extends keyof DrawingPresets>(list: K, value: DrawingPresets[K][number]): void {
    const priorPresets = this.config.presets[list] as ReadonlyArray<unknown>;
    const priorRecents = this.config.recents[list as keyof DrawingRecents] as ReadonlyArray<unknown>;
    if(priorPresets.some(v => sameEntry(v, value))) return;/*already a preset*/

    this.changeList('presets', list, [...priorPresets, value]);
    this.changeList('recents', list, priorRecents.filter(v => !sameEntry(v, value)));
  }

  // ------------------------------------------------------------------------------
  /** remove a value from a preset list */
  public removePreset<K extends keyof DrawingPresets>(list: K, value: DrawingPresets[K][number]): void {
    const priorPresets = this.config.presets[list] as ReadonlyArray<unknown>;
    this.changeList('presets', list, priorPresets.filter(v => !sameEntry(v, value)));
  }

  // == Internal ==================================================================
  /** changes one palette list, whole */
  private changeList(palette: 'presets' | 'recents', list: keyof DrawingPresets, entries: ReadonlyArray<unknown>): void {
    if(JSON.stringify(entries) === JSON.stringify(this.config[palette][list])) return/*unchanged*/;
    void this.settings.change(['config', palette, list], entries);
  }

  // ------------------------------------------------------------------------------
  /** apply the settings shown. They are the whole state: each setting and palette
   *  list is its value there, its default where the state holds none (a refused
   *  save, another viewer's removal) */
  private applyState(view: AppStateView): void {
    const config: Readonly<Partial<DrawingConfig>> = (view as AppState).config ?? {};
    const next: DrawingConfig = { ...DEFAULT_CONFIG };

    const boolKeys: (keyof DrawingConfig)[] = ['showGrid', 'readOnly', 'showToolbar', 'showPropertiesPanel', 'showInfoBar'];
    for(const key of boolKeys) {
      const v = (config as any)[key];
      if((typeof v === 'boolean') && (v !== (next as any)[key])) {
        (next as any)[key] = v;
      } /* else -- not present or unchanged */
    }

    const strKeys: (keyof DrawingConfig)[] = ['gridColor', 'backgroundColor'];
    for(const key of strKeys) {
      const v = (config as any)[key];
      if((typeof v === 'string') && (v !== (next as any)[key])) {
        (next as any)[key] = v;
      } /* else -- not present or unchanged */
    }

    const numKeys: (keyof DrawingConfig)[] = ['initialPanX', 'initialPanY', 'initialZoom'];
    for(const key of numKeys) {
      const v = (config as any)[key];
      if((typeof v === 'number') && Number.isFinite(v) && (v !== (next as any)[key])) {
        (next as any)[key] = v;
      } /* else -- not present or unchanged */
    }

    // presets -- merge per-list; any list not provided keeps the default. This
    // way a persisted config written before presets existed (or that only
    // customized a subset) still lights up the remaining lists with sensible
    // defaults rather than showing an empty dropdown
    const rawPresets = (config as any).presets;
    if(rawPresets && (typeof rawPresets === 'object')) {
      const mergedPresets: DrawingPresets = { ...DEFAULT_PRESETS };
      if(Array.isArray(rawPresets.strokeColors))     mergedPresets.strokeColors     = rawPresets.strokeColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.backgroundColors)) mergedPresets.backgroundColors = rawPresets.backgroundColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.textColors))       mergedPresets.textColors       = rawPresets.textColors.filter((v: unknown) => typeof v === 'string');
      if(Array.isArray(rawPresets.strokeWidths))     mergedPresets.strokeWidths     = rawPresets.strokeWidths.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v));
      if(Array.isArray(rawPresets.fontSizes))        mergedPresets.fontSizes        = rawPresets.fontSizes.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v));
      if(Array.isArray(rawPresets.fontFamilies))     mergedPresets.fontFamilies     = rawPresets.fontFamilies.filter((v: any) => v && (typeof v.label === 'string') && (typeof v.family === 'string'));
      next.presets = mergedPresets;
    } /* else -- no presets persisted; defaults remain */

    const rawRecents = (config as any).recents;
    if(rawRecents && (typeof rawRecents === 'object')) {
      const mergedRecents: DrawingRecents = { ...DEFAULT_RECENTS };
      if(Array.isArray(rawRecents.strokeColors))     mergedRecents.strokeColors     = rawRecents.strokeColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.backgroundColors)) mergedRecents.backgroundColors = rawRecents.backgroundColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.textColors))       mergedRecents.textColors       = rawRecents.textColors.filter((v: unknown) => typeof v === 'string').slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.strokeWidths))     mergedRecents.strokeWidths     = rawRecents.strokeWidths.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v)).slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.fontSizes))        mergedRecents.fontSizes        = rawRecents.fontSizes.filter((v: unknown) => (typeof v === 'number') && Number.isFinite(v)).slice(0, RECENTS_MAX);
      if(Array.isArray(rawRecents.fontFamilies))     mergedRecents.fontFamilies     = rawRecents.fontFamilies.filter((v: any) => v && (typeof v.label === 'string') && (typeof v.family === 'string')).slice(0, RECENTS_MAX);
      next.recents = mergedRecents;
    } /* else -- no recents persisted; defaults remain */

    if(JSON.stringify(next) !== JSON.stringify(this.config)) {
      this.config = next;
      if(this.onConfigChanged) this.onConfigChanged(this.config);
    } /* else -- nothing actually changed */
  }
}

// == Helpers =====================================================================
/** one palette entry: font-family entries match by `family`, the rest by value */
const sameEntry = (a: unknown, b: unknown): boolean => {
  if((typeof a === 'object') && (typeof b === 'object') && a && b) return (a as { family?: unknown; }).family === (b as { family?: unknown; }).family;
  return a === b;
};
