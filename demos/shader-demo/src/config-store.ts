import type { Observable } from 'rxjs';

// owns the small amount of configuration this demo persists via appState:
//   * autoCompile          -- recompile automatically after debounced edits
//   * autoCompileDebounceMs -- how long to wait after the last edit
//
// Shader source itself is NOT stored here -- it lives in the sibling editor
// App's appContent. Channel bindings and sampler meta live on the sibling gallery
// App. This keeps the shader-demo's appState purely ephemeral UI preference, which
// matches the Platform's last-write-wins semantics
// ********************************************************************************
// == Types =======================================================================
/** persistent configuration for the shader demo */
export interface ShaderDemoConfig {
  readonly autoCompile:           boolean;
  readonly autoCompileDebounceMs: number;
}

// --------------------------------------------------------------------------------
export type ConfigField = keyof ShaderDemoConfig;

// --------------------------------------------------------------------------------
type ConfigChangedCallback = (config: Readonly<ShaderDemoConfig>, changedFields: ReadonlySet<ConfigField>) => void;

// --------------------------------------------------------------------------------
interface AppState {
  readonly config?: Readonly<Partial<ShaderDemoConfig>>;
}

// == Charmiq API (global) ========================================================
interface CharmiqAppState {
  onChange$(): Observable<AppState | null>;
  set(state: AppState): Promise<void>;
  get(): Promise<AppState | null>;
}

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<ShaderDemoConfig> = {
  autoCompile:           false/*Compile button by default*/,
  autoCompileDebounceMs: 800
};

/** clamp bounds for debounce -- too low spams the GPU, too high feels broken */
const DEBOUNCE_MIN_MS = 100;
const DEBOUNCE_MAX_MS = 5_000;

// == Class =======================================================================
export class ConfigStore {
  private readonly appState: CharmiqAppState;

  private config: ShaderDemoConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  public constructor(appState: CharmiqAppState) {
    this.appState = appState;
  }

  // ------------------------------------------------------------------------------
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  public async init(): Promise<void> {
    const state = await this.appState.get();
    if(state) this.applyState(state);

    this.appState.onChange$().subscribe((state: AppState | null) => {
      if(!state) return;
      this.applyState(state);
    });
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<ShaderDemoConfig> { return this.config; }

  // == Writers (fetch-merge-set) =================================================
  /** persist the autoCompile toggle */
  public async updateAutoCompile(enabled: boolean): Promise<void> {
    if(enabled === this.config.autoCompile) return;/*no change*/

    this.config = { ...this.config, autoCompile: enabled };
    await this.persist({ autoCompile: enabled });
  }

  // == Internal ==================================================================
  private async persist(patch: Partial<ShaderDemoConfig>): Promise<void> {
    try {
      const state = (await this.appState.get()) || {};
      const currentConfig = (state as AppState).config || {};
      await this.appState.set({
        ...state,
        config: { ...currentConfig, ...patch }
      });
    } catch(error) {
      console.error('shader-demo: failed to persist config:', error);
    }
  }

  // ------------------------------------------------------------------------------
  /** apply an incoming appState snapshot to local state and notify the callback.
   *  Each field is merged individually so unrelated updates don't clobber the rest
   *  of the configuration */
  private applyState(state: AppState): void {
    if(!state.config) return;

    const incoming = state.config;
    const current = this.config;
    const changedFields = new Set<ConfigField>();

    let autoCompile           = current.autoCompile;
    let autoCompileDebounceMs = current.autoCompileDebounceMs;

    if(typeof incoming.autoCompile === 'boolean') {
      if(incoming.autoCompile !== autoCompile) {
        autoCompile = incoming.autoCompile;
        changedFields.add('autoCompile');
      } /* else -- autoCompile unchanged */
    } /* else -- autoCompile not in this update */

    if(typeof incoming.autoCompileDebounceMs === 'number') {
      const clamped = Math.max(DEBOUNCE_MIN_MS, Math.min(DEBOUNCE_MAX_MS, Math.round(incoming.autoCompileDebounceMs)));
      if(clamped !== autoCompileDebounceMs) {
        autoCompileDebounceMs = clamped;
        changedFields.add('autoCompileDebounceMs');
      } /* else -- debounce unchanged */
    } /* else -- debounce not in this update */

    this.config = { autoCompile, autoCompileDebounceMs };
    if((changedFields.size > 0) && this.onConfigChanged) {
      this.onConfigChanged({ ...this.config }, changedFields);
    } /* else -- nothing actually changed */
  }
}
