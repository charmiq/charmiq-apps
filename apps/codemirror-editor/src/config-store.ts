import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

import type { TabSlug } from './tab-types';
import { textSizeOf, DEFAULT_TEXT_SIZE } from './text-size';

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
  /** the text's size, pixels (SEE: text-size.ts) */
  textSize: number;
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

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<EditorConfig> = {
  lineNumbers: true,
  lineWrapping: false,
  smartIndent: true,
  indentWithTabs: false,
  textSize: DEFAULT_TEXT_SIZE,
  maxTabs: 0/*0 = unlimited*/
};

// == Class =======================================================================
/** manages editor configuration and tab metadata via appState */
export class ConfigStore {
  private readonly settings: AppStateSettings;

  private config: EditorConfig = { ...DEFAULT_CONFIG };
  private tabModes: Record<TabSlug, string> = {};
  private tabOrder: TabSlug[] = [];

  private onConfigChanged: ConfigChangedCallback | null = null;
  private onTabModesChanged: TabModesChangedCallback | null = null;
  private onTabOrderChanged: TabOrderChangedCallback | null = null;

  // == Lifecycle =================================================================
  /** `onFailure` tells the person a setting was not saved or the app state can no
   *  longer be read */
  public constructor(appState: AppStateAPI, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.settings = new AppStateSettings(appState, view => this.applyState(view), onFailure);
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
  /** follows the app state; resolves once it is known (or unreadable) */
  public init(): Promise<void> {
    return this.settings.start();
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<EditorConfig> { return this.config; }
  public getMaxTabs(): number { return this.config.maxTabs; }
  public getTabMode(slug: TabSlug): string { return this.tabModes[slug] || DEFAULT_MODE; }
  public getTabOrder(): ReadonlyArray<TabSlug> { return this.tabOrder; }

  // == Writers ===================================================================
  // each setting is written onto the latest state, a tab's mode by its slug, so
  // that another person's change to another setting or tab stands (SEE:
  // shared/app-state-settings). A failed save is told through onFailure
  /** update a single editor config option */
  public updateEditorConfig<K extends keyof EditorConfig>(key: K, value: EditorConfig[K]): void {
    void this.settings.change(['config', key], value);
  }

  // ------------------------------------------------------------------------------
  /** update a tab's language mode */
  public updateTabMode(slug: TabSlug, mode: string): void {
    void this.settings.change(['tabModes', slug], mode);
  }

  /** update the tab display order */
  public updateTabOrder(newOrder: ReadonlyArray<TabSlug>): void {
    void this.settings.change(['tabOrder'], newOrder);
  }

  /** remove a tab's mode and order entry (cleanup on delete) */
  public removeTab(slug: TabSlug): void {
    void this.settings.change(['tabModes', slug], undefined/*removed*/);
    this.updateTabOrder(this.tabOrder.filter(s => s !== slug));
  }

  // == Internal ==================================================================
  /** apply the settings shown to local state and notify callbacks */
  private applyState(view: AppStateView): void {
    const state = view as AppState;
    // config (including maxTabs): the settings shown are the whole state, so each
    // option is its value there, its default where the state holds none (a refused
    // save, another viewer's removal)
    const incoming: Readonly<Partial<EditorConfig>> = state.config ?? {};
    const optionOf = (key: 'lineNumbers' | 'lineWrapping' | 'smartIndent' | 'indentWithTabs') => (typeof incoming[key] === 'boolean') ? incoming[key] : DEFAULT_CONFIG[key];
    const config: EditorConfig = {
      lineNumbers:    optionOf('lineNumbers'),
      lineWrapping:   optionOf('lineWrapping'),
      smartIndent:    optionOf('smartIndent'),
      indentWithTabs: optionOf('indentWithTabs'),
      // the text's size, a whole number of pixels within reach
      textSize:       textSizeOf(incoming.textSize) ?? DEFAULT_CONFIG.textSize,
      maxTabs:        (typeof incoming.maxTabs === 'number') ? Math.max(0, Math.floor(incoming.maxTabs)) : DEFAULT_CONFIG.maxTabs/*0 = unlimited*/,
    };
    if(JSON.stringify(config) !== JSON.stringify(this.config)) {
      this.config = config;
      if(this.onConfigChanged) this.onConfigChanged({ ...this.config });
    } /* else -- config unchanged */

    // tab modes (none: every tab takes the default mode)
    const tabModes = (state.tabModes && (typeof state.tabModes === 'object')) ? { ...state.tabModes } as Record<TabSlug, string> : {};
    if(JSON.stringify(tabModes) !== JSON.stringify(this.tabModes)) {
      this.tabModes = tabModes;
      if(this.onTabModesChanged) this.onTabModesChanged(this.tabModes);
    } /* else -- tab modes unchanged */

    // tab order (none: the app-contents' order)
    const tabOrder = Array.isArray(state.tabOrder) ? [...state.tabOrder] as TabSlug[] : [];
    if(JSON.stringify(tabOrder) !== JSON.stringify(this.tabOrder)) {
      this.tabOrder = tabOrder;
      if(this.onTabOrderChanged) this.onTabOrderChanged(this.tabOrder);
    } /* else -- tab order matches, no update needed */
  }
}
