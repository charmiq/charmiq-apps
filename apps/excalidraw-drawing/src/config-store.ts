import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

// owns drawing configuration persisted via appState. All reads/writes go
// through here — nobody else touches appState directly. Each setting is written
// onto the latest state (SEE: shared/app-state-settings)
// ********************************************************************************
// == Types =======================================================================
/** drawing configuration options synced to appState */
export interface DrawingConfig {
  readonly showMainMenu: boolean;
  readonly viewModeEnabled?: boolean;
}

// ................................................................................
/** callback when config changes (here or from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<DrawingConfig>) => void;

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<DrawingConfig> = {
  showMainMenu: true
};

// == Class =======================================================================
/** manages drawing configuration via appState */
export class ConfigStore {
  private readonly settings: AppStateSettings;
  private config: DrawingConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  /** `onFailure` tells the person a setting was not saved or the app state can no
   *  longer be read */
  public constructor(appState: AppStateAPI, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.settings = new AppStateSettings(appState, view => this.applyState(view), onFailure);
  }

  /** register callback for config changes */
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  /** follows the app state; resolves once it is known (or unreadable) */
  public init(): Promise<void> {
    return this.settings.start();
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<DrawingConfig> { return this.config; }

  // == Writers ===================================================================
  /** changes the settings named: shown at once, each written onto the latest state.
   *  Answers whether every one was saved */
  public setConfig(partial: Readonly<Partial<DrawingConfig>>): Promise<boolean> {
    const saves = Object.entries(partial).map(([key, value]) => this.settings.change([key], value));
    return Promise.all(saves).then(saved => saved.every(Boolean));
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
  /** apply the settings shown and notify callbacks if changed */
  private applyState(state: AppStateView): void {
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
