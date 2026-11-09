import type { MermaidConfig } from 'mermaid';

import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

// owns diagram configuration persisted via appState. All reads/writes go
// through here — nobody else touches appState directly. Each setting is written
// onto the latest state (SEE: shared/app-state-settings)
// ********************************************************************************
// == Types =======================================================================
/** Mermaid theme names supported by the library */
export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base';

// ................................................................................
/** diagram configuration options synced to appState */
export interface DiagramConfig {
  readonly theme: MermaidTheme;
  readonly flowchart?: Readonly<{ curve?: NonNullable<MermaidConfig['flowchart']>['curve'] }>;
}

// ................................................................................
/** callback when config changes (here or from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<DiagramConfig>) => void;

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<DiagramConfig> = {
  theme: 'default'
};

// == Class =======================================================================
/** manages diagram configuration via appState */
export class ConfigStore {
  private readonly settings: AppStateSettings;
  private config: DiagramConfig = { ...DEFAULT_CONFIG };
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
  public getConfig(): Readonly<DiagramConfig> { return this.config; }

  // == Writers ===================================================================
  /** changes the settings named: shown at once, each written onto the latest state.
   *  Answers whether every one was saved */
  public setConfig(partial: Readonly<Partial<DiagramConfig>>): Promise<boolean> {
    const saves = Object.entries(partial).map(([key, value]) => this.settings.change([key], value));
    return Promise.all(saves).then(saved => saved.every(Boolean));
  }

  // == Internal ==================================================================
  /** apply the settings shown and notify callbacks if changed */
  private applyState(state: AppStateView): void {
    const newConfig: DiagramConfig = {
      theme: (typeof state.theme === 'string' ? state.theme : DEFAULT_CONFIG.theme) as MermaidTheme,
      ...(state.flowchart !== undefined
        ? { flowchart: state.flowchart as DiagramConfig['flowchart'] }
        : {})
    };

    if(JSON.stringify(newConfig) === JSON.stringify(this.config)) return;/*unchanged*/
    this.config = newConfig;
    if(this.onConfigChanged) this.onConfigChanged({ ...this.config });
  }
}
