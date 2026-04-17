import type { Observable } from 'rxjs';

// owns drawing configuration persisted via appState. Configuration includes grid
// visibility / color, canvas background, read-only flag, and UI chrome toggles
// (toolbar / properties panel / info bar). All reads / writes to appState for
// config go through here
// ********************************************************************************
// == Types =======================================================================
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
  /** show the properties panel when elements are selected */
  showPropertiesPanel: boolean;
  /** show the info / hint bar under the toolbar */
  showInfoBar: boolean;
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
export const DEFAULT_CONFIG: Readonly<DrawingConfig> = {
  showGrid: true,
  gridColor: '#e0e0e0',
  backgroundColor: '#fafafa',
  readOnly: false,
  showToolbar: true,
  showPropertiesPanel: true,
  showInfoBar: true,
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

    if(changed) {
      this.config = next;
      if(this.onConfigChanged) this.onConfigChanged(this.config);
    } /* else -- nothing actually changed */
  }
}
