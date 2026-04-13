import type { Observable } from 'rxjs';

// owns diagram configuration persisted via appState. All reads/writes go
// through here — nobody else touches appState directly
// ********************************************************************************
// == Types =======================================================================
/** Mermaid theme names supported by the library */
export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base';

// ................................................................................
/** diagram configuration options synced to appState */
export interface DiagramConfig {
  readonly theme: MermaidTheme;
  readonly flowchart?: Readonly<{ curve?: string }>;
}

// ................................................................................
/** callback when config changes (from a remote appState update) */
type ConfigChangedCallback = (config: Readonly<DiagramConfig>) => void;

// == Charmiq API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<Record<string, unknown> | null>;
  set(state: Record<string, unknown>): Promise<void>;
  get(): Promise<Record<string, unknown> | null>;
}

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<DiagramConfig> = {
  theme: 'default'
};

// == Class =======================================================================
/** manages diagram configuration via appState */
export class ConfigStore {
  private readonly appState: CharmiqAppState;
  private config: DiagramConfig = { ...DEFAULT_CONFIG };
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
  public getConfig(): Readonly<DiagramConfig> { return this.config; }

  // == Writers (fetch-merge-set) ==================================================
  /** merge partial config and persist to appState */
  public async setConfig(partial: Readonly<Partial<DiagramConfig>>): Promise<void> {
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

  // == Internal ==================================================================
  /** apply an incoming appState snapshot and notify callbacks if changed */
  private applyState(state: Record<string, unknown>): void {
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
