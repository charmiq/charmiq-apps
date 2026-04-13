import type { Observable } from 'rxjs';

// owns drawing configuration persisted via appState. All reads/writes go
// through here — nobody else touches appState directly
// ********************************************************************************
// == Types =======================================================================
/** drawing configuration options synced to appState */
export interface DrawingConfig {
  readonly showMainMenu: boolean;
  readonly viewModeEnabled?: boolean;
}

// ................................................................................
/** callback when config changes (from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<DrawingConfig>) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<Record<string, unknown> | null>;
  set(state: Record<string, unknown>): Promise<void>;
  get(): Promise<Record<string, unknown> | null>;
}

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<DrawingConfig> = {
  showMainMenu: true
};

// == Class =======================================================================
/** manages drawing configuration via appState */
export class ConfigStore {
  private readonly appState: CharmiqAppState;
  private config: DrawingConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  public constructor(appState: CharmiqAppState) {
    this.appState = appState;
  }

  /** register callback for config changes from remote updates */
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  /** load initial state from appState and subscribe to ongoing changes */
  public async init(): Promise<void> {
    const state = await this.appState.get();
    if(state) this.applyState(state);

    this.appState.onChange$().subscribe((state: Record<string, unknown> | null) => {
      if(!state) return;/*no state yet*/
      this.applyState(state);
    });
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<DrawingConfig> { return this.config; }

  // == Writers (fetch-merge-set) ==================================================
  /** merge partial config and persist to appState */
  public async setConfig(partial: Readonly<Partial<DrawingConfig>>): Promise<void> {
    const newConfig = { ...this.config, ...partial };

    // optimistic local update
    if(JSON.stringify(newConfig) === JSON.stringify(this.config)) return;/*no change*/
    this.config = newConfig;
    if(this.onConfigChanged) this.onConfigChanged({ ...this.config });

    // persist — the onChange$ subscription reconciles if someone else writes
    try {
      await this.appState.set(newConfig as unknown as Record<string, unknown>);
    } catch(error) {
      console.error('failed to persist config:', error);
    }
  }

  // == CSS =======================================================================
  /** dynamically inject/remove CSS to hide the main-menu trigger button */
  public updateMenuVisibilityCSS(showMainMenu: boolean): void {
    let styleElement = document.getElementById('excalidraw-menu-style');
    if(!showMainMenu) {
      if(!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'excalidraw-menu-style';
        styleElement.textContent = `
  .excalidraw .main-menu-trigger { display: none !important; }
  .excalidraw .App-toolbar-content { display: none !important; }
`;
        document.head.appendChild(styleElement);
      } /* else -- style already injected */
    } else {
      if(styleElement) styleElement.remove();
    }
  }

  // == Internal ==================================================================
  /** apply an incoming appState snapshot and notify callbacks if changed */
  private applyState(state: Record<string, unknown>): void {
    const newConfig: DrawingConfig = {
      showMainMenu: state.showMainMenu !== false,/*default: true*/
      ...(state.viewModeEnabled !== undefined
        ? { viewModeEnabled: state.viewModeEnabled as boolean }
        : {})
    };

    if(JSON.stringify(newConfig) === JSON.stringify(this.config)) return/*unchanged*/;
    this.config = newConfig;
    this.updateMenuVisibilityCSS(newConfig.showMainMenu);
    if(this.onConfigChanged) this.onConfigChanged({ ...this.config });
  }
}
