import type { Observable } from 'rxjs';

import type { TabSlug } from './tab-types';

// owns editor configuration and tab metadata persisted via appState. All
// reads/writes go through here — nobody else touches appState directly. Tab
// metadata (`tabModes`, `tabOrder`) is keyed by `TabSlug`, never by the
// platform-minted `TabId`, so authored documents can seed it declaratively
// ********************************************************************************
// == Constants ===================================================================
/** the fallback language mode when none is specified */
export const DEFAULT_MODE = 'markdown';

// == Types =======================================================================
/** editor configuration options synced to appState */
export interface EditorConfig {
  lineNumbers: boolean;
  lineWrapping: boolean;
  smartIndent: boolean;
  indentWithTabs: boolean;
  maxTabs: number/*0 = unlimited*/;
}

// --------------------------------------------------------------------------------
/** shape of the full appState object. Tab maps are slug-keyed — see the
 *  module header for the rationale */
interface AppState {
  readonly config?: Readonly<Partial<EditorConfig>>;
  readonly tabModes?: Readonly<Record<TabSlug, string>>;
  readonly tabOrder?: ReadonlyArray<TabSlug>;
}

// --------------------------------------------------------------------------------
/** callback when editor config changes (from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<EditorConfig>) => void;

/** callback when tab modes change (from a remote appState update) */
type TabModesChangedCallback = (tabModes: Readonly<Record<TabSlug, string>>) => void;

/** callback when tab order changes (from a remote appState update) */
type TabOrderChangedCallback = (tabOrder: ReadonlyArray<TabSlug>) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<AppState | null>;
  set(state: AppState): Promise<void>;
  get(): Promise<AppState | null>;
}

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<EditorConfig> = {
  lineNumbers: true,
  lineWrapping: false,
  smartIndent: true,
  indentWithTabs: false,
  maxTabs: 0/*0 = unlimited*/
};

// == Class =======================================================================
/** manages editor configuration and tab metadata via appState */
export class ConfigStore {
  private readonly appState: CharmiqAppState;

  private config: EditorConfig = { ...DEFAULT_CONFIG };
  private tabModes: Record<TabSlug, string> = {};
  private tabOrder: TabSlug[] = [];

  private onConfigChanged: ConfigChangedCallback | null = null;
  private onTabModesChanged: TabModesChangedCallback | null = null;
  private onTabOrderChanged: TabOrderChangedCallback | null = null;

  // == Lifecycle =================================================================
  public constructor(appState: CharmiqAppState) {
    this.appState = appState;
  }

  // ------------------------------------------------------------------------------
  /** register callback for editor config changes from remote updates */
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  /** register callback for tab mode changes from remote updates */
  public onTabModesChange(cb: TabModesChangedCallback): void {
    this.onTabModesChanged = cb;
  }

  /** register callback for tab order changes from remote updates */
  public onTabOrderChange(cb: TabOrderChangedCallback): void {
    this.onTabOrderChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** load initial state from appState and subscribe to ongoing changes */
  public async init(): Promise<void> {
    const state = await this.appState.get();
    if(state) this.applyState(state);

    this.appState.onChange$().subscribe((state: AppState | null) => {
      if(!state) {
        this.tabModes = {};
        this.tabOrder = [];
        if(this.onConfigChanged) this.onConfigChanged({ ...this.config });
        return;
      } /* else -- state exists, apply it */

      this.applyState(state);
    });
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<EditorConfig> { return this.config; }
  public getMaxTabs(): number { return this.config.maxTabs; }
  public getTabMode(slug: TabSlug): string { return this.tabModes[slug] || DEFAULT_MODE; }
  public getTabOrder(): ReadonlyArray<TabSlug> { return this.tabOrder; }

  // == Writers (fetch-merge-set) ==================================================
  /** update a single editor config option in appState */
  public async updateEditorConfig<K extends keyof EditorConfig>(key: K, value: EditorConfig[K]): Promise<void> {
    this.config[key] = value;

    try {
      const state = await this.appState.get() || {};
      const currentConfig = (state as AppState).config || {};
      if((currentConfig as any)[key] === value) return;/*already matches*/

      await this.appState.set({
        ...state,
        config: { ...currentConfig, [key]: value }
      });
    } catch(error) {
      console.error('failed to update editor config:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** update a tab's language mode in appState */
  public async updateTabMode(slug: TabSlug, mode: string): Promise<void> {
    this.tabModes[slug] = mode;

    try {
      const state = await this.appState.get() || {};
      const currentModes = (state as AppState).tabModes || {};
      if((currentModes as any)[slug] === mode) return;/*already matches*/

      await this.appState.set({
        ...state,
        tabModes: { ...currentModes, [slug]: mode }
      });
    } catch(error) {
      console.error('failed to update tab mode:', error);
    }
  }

  /** update the tab display order in appState */
  public async updateTabOrder(newOrder: TabSlug[]): Promise<void> {
    this.tabOrder = newOrder;

    try {
      const state = await this.appState.get() || {};
      if(JSON.stringify((state as AppState).tabOrder) === JSON.stringify(newOrder)) return/*already matches*/;

      await this.appState.set({
        ...state,
        tabOrder: newOrder
      });
    } catch(error) {
      console.error('failed to update tab order:', error);
    }
  }

  /** remove a tab's mode and order entry from appState (cleanup on delete) */
  public async removeTab(slug: TabSlug): Promise<void> {
    delete this.tabModes[slug];
    this.tabOrder = this.tabOrder.filter(s => s !== slug);

    try {
      const state = await this.appState.get() || {};
      const newModes = { ...(state as AppState).tabModes || {} };
      delete (newModes as any)[slug];

      const newOrder = ((state as AppState).tabOrder || []).filter(s => s !== slug);

      await this.appState.set({
        ...state,
        tabModes: newModes,
        tabOrder: newOrder
      });
    } catch(error) {
      console.error('failed to clean up tab state:', error);
    }
  }

  // == Internal ==================================================================
  /** apply an incoming appState snapshot to local state and notify callbacks */
  private applyState(state: AppState): void {
    // config (including maxTabs)
    if(state.config) {
      let configChanged = false;
      const boolKeys: (keyof EditorConfig)[] = ['lineNumbers', 'lineWrapping', 'smartIndent', 'indentWithTabs'];
      for(const key of boolKeys) {
        if((typeof state.config[key] === 'boolean') && (state.config[key] !== this.config[key])) {
          (this.config as any)[key] = state.config[key]!;
          configChanged = true;
        } /* else -- missing or invalid key/value */
      }

      // maxTabs (0 or undefined = unlimited)
      if(typeof state.config.maxTabs === 'number') {
        const incoming = Math.max(0, Math.floor(state.config.maxTabs));
        if(incoming !== this.config.maxTabs) {
          this.config.maxTabs = incoming;
          configChanged = true;
        } /* else -- maxTabs unchanged */
      } /* else -- maxTabs not in this update */

      if(configChanged && this.onConfigChanged) this.onConfigChanged({ ...this.config });
    } /* else -- no config */

    // tab modes
    if(state.tabModes) {
      this.tabModes = { ...state.tabModes } as Record<TabSlug, string>;
      if(this.onTabModesChanged) this.onTabModesChanged(this.tabModes);
    } /* else -- no tab modes */

    // tab order
    if(state.tabOrder && Array.isArray(state.tabOrder)) {
      if(JSON.stringify(this.tabOrder) !== JSON.stringify(state.tabOrder)) {
        this.tabOrder = [...state.tabOrder] as TabSlug[];
        if(this.onTabOrderChanged) this.onTabOrderChanged(this.tabOrder);
      } /* else -- tab order matches, no update needed */
    } /* else -- no tab order */
  }
}
