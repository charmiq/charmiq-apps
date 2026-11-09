import type { AppStateAPI } from '../../../shared/charmiq';
import { AppStateSettings, type AppStateFailure, type AppStateView } from '/shared/app-state-settings/app-state-settings';

// owns the small amount of configuration this demo persists via appState:
//   * autoCompile          -- recompile automatically after debounced edits
//   * autoCompileDebounceMs -- how long to wait after the last edit
//   * debug                -- `[shader-demo:*]` console logging toggle. Lives
//                             here because sandboxed App iframes have no
//                             localStorage, so the flag rides on appState
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
  readonly debug:                 boolean;
}

// --------------------------------------------------------------------------------
export type ConfigField = keyof ShaderDemoConfig;

// --------------------------------------------------------------------------------
type ConfigChangedCallback = (config: Readonly<ShaderDemoConfig>, changedFields: ReadonlySet<ConfigField>) => void;

// --------------------------------------------------------------------------------
interface AppState {
  readonly config?: Readonly<Partial<ShaderDemoConfig>>;
}

// == Defaults ====================================================================
const DEFAULT_CONFIG: Readonly<ShaderDemoConfig> = {
  autoCompile:           false/*Compile button by default*/,
  autoCompileDebounceMs: 800,
  debug:                 true/*on by default while the tool is new*/
};

/** clamp bounds for debounce -- too low spams the GPU, too high feels broken */
const DEBOUNCE_MIN_MS = 100;
const DEBOUNCE_MAX_MS = 5_000;

// == Class =======================================================================
export class ConfigStore {
  private readonly settings: AppStateSettings;

  private config: ShaderDemoConfig = { ...DEFAULT_CONFIG };
  private onConfigChanged: ConfigChangedCallback | null = null;

  // == Lifecycle =================================================================
  /** `onFailure` tells the person a setting was not saved or the app state can no
   *  longer be read */
  public constructor(appState: AppStateAPI, onFailure: (failure: AppStateFailure, error: unknown) => void) {
    this.settings = new AppStateSettings(appState, view => this.applyState(view), onFailure);
  }

  // ------------------------------------------------------------------------------
  public onConfigChange(cb: ConfigChangedCallback): void {
    this.onConfigChanged = cb;
  }

  // ------------------------------------------------------------------------------
  /** follows the app state (each setting written onto the latest state, SEE:
   *  shared/app-state-settings); resolves once it is known (or unreadable) */
  public init(): Promise<void> {
    return this.settings.start();
  }

  // == Getters ===================================================================
  public getConfig(): Readonly<ShaderDemoConfig> { return this.config; }

  // == Writers ===================================================================
  /** persist the autoCompile toggle: shown at once, written onto the latest state.
   *  Answers whether it was saved */
  public updateAutoCompile(enabled: boolean): Promise<boolean> {
    return this.settings.change(['config', 'autoCompile'], enabled);
  }

  // == Internal ==================================================================

  // ------------------------------------------------------------------------------
  /** apply the settings shown and notify the callback with the fields that changed.
   *  The settings shown are the whole state: each field is its value there, its
   *  default where the state holds none (a refused save, another viewer's removal) */
  private applyState(view: AppStateView): void {
    const incoming: Readonly<Partial<ShaderDemoConfig>> = (view as AppState).config ?? {};
    const next: ShaderDemoConfig = {
      autoCompile:           (typeof incoming.autoCompile === 'boolean') ? incoming.autoCompile : DEFAULT_CONFIG.autoCompile,
      autoCompileDebounceMs: (typeof incoming.autoCompileDebounceMs === 'number') ? Math.max(DEBOUNCE_MIN_MS, Math.min(DEBOUNCE_MAX_MS, Math.round(incoming.autoCompileDebounceMs))) : DEFAULT_CONFIG.autoCompileDebounceMs,
      debug:                 (typeof incoming.debug === 'boolean') ? incoming.debug : DEFAULT_CONFIG.debug,
    };
    const changedFields = new Set<ConfigField>((Object.keys(next) as ConfigField[]).filter(field => next[field] !== this.config[field]));

    this.config = next;
    if((changedFields.size > 0) && this.onConfigChanged) {
      this.onConfigChanged({ ...this.config }, changedFields);
    } /* else -- nothing actually changed */
  }
}
