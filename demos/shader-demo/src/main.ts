import type { CharmIQAPI } from '../../../shared/charmiq';
import { ChannelBinder, CHANNEL_SLOT_IDS, type SamplerMeta } from './channel-binder';
import { ConfigStore } from './config-store';
import { dbg, setDbgEnabled } from './debug';
import { EditorBridge } from './editor-bridge';
import { Playback, type PlaybackTelemetry } from './playback';
import { Renderer } from './renderer';
import { Toolbar, type SamplerRow } from './toolbar';

// entry point -- constructs every module, wires the data flow, advertises the
// player's command surface, and kicks off discovery of the sibling Apps
//
// Data flow
//   EditorBridge (discover 'ai.charm.shared.codemirror-editor')
//       -> shaderSource$ -> debounced auto-compile (when autoCompile is on)
//       -> getShader() on Compile clicks -> Renderer.setShader
//
//   ChannelBinder (discover 'ai.charm.shared.imageGallery')
//       -> state$ -> GL textures + per-channel SamplerMeta
//
//   Playback (RAF loop) -> Renderer.render + Toolbar telemetry
//   ConfigStore (appState) -> autoCompile toggle
// ********************************************************************************
// == Constants ===================================================================
/** default shader seeded into the editor in README.md; also used as a fallback
 *  when the editor hasn't been seeded yet (e.g. someone linked the player directly
 *  without the README's composition around it) */
const FALLBACK_SHADER = `// A small greeting -- edit the code below and press Compile.
//
//   iResolution -- viewport size in px (vec3)
//   iTime       -- playback time in seconds
//   iMouse      -- xy: cursor, zw: last click (negated when up)
//   iChannel0   -- a texture if a slot is bound in the gallery

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(col, 1.0);
}
`;

// == Globals =====================================================================
const charmiqGlobal: CharmIQAPI | undefined = window.charmiq;

// == Create Instances ============================================================
const canvas       = document.getElementById('canvas') as HTMLCanvasElement;
const stageEl      = document.getElementById('stage')!;
const errorStripEl = document.getElementById('errorStrip')!;
const errorLogEl   = document.getElementById('errorLog')!;
const statusEl     = document.getElementById('statusOverlay')!;
const statusTextEl = document.getElementById('statusText')!;
const renderer     = new Renderer(canvas);
const channelBinder = new ChannelBinder(renderer.getContext());
const editorBridge  = new EditorBridge();
const configStore   = charmiqGlobal?.appState ? new ConfigStore(charmiqGlobal.appState) : null;
const toolbar       = new Toolbar();

// == Compile pipeline ============================================================
/** the most recently compiled shader source -- used to deduplicate auto recompiles
 *  when the text hasn't actually changed */
let lastCompiledSource: string | null = null;
/** whether the most recent compile fell back to FALLBACK_SHADER (editor hadn't
 *  emitted yet). Used to force a catch-up compile on the first real emission,
 *  even when autoCompile is off -- covers the iframe-reload case where the initial
 *  compile beats the editor's first `changes$` push */
let lastCompileUsedFallback = true;
let autoCompileTimer: ReturnType<typeof setTimeout> | null = null;
let compileInFlight = false;

// ................................................................................
/** pull the shader from the editor + compile it. Shows the infoLog in the error
 *  strip on failure; hides the strip on success */
const compile = async (): Promise<{ ok: boolean; infoLog: string; }> => {
  if(compileInFlight) {
    dbg('compile', 'skipped — already in flight');
    return { ok: false, infoLog: 'compile already in flight' };
  } /* else -- not already running */
  compileInFlight = true;
  toolbar.setCompiling(true);

  const started = performance.now();
  try {
    const fromEditor = editorBridge.getShader();
    const source = fromEditor ?? FALLBACK_SHADER;
    const usingFallback = (fromEditor === null);
    lastCompiledSource = source;
    lastCompileUsedFallback = usingFallback;

    const result = renderer.setShader(source);
    dbg('compile', result.ok ? 'ok' : 'FAILED', {
      sourceChars:   source.length,
      usingFallback,
      ms:            Math.round(performance.now() - started),
      infoLogChars:  result.infoLog.length
    });
    if(!result.ok) dbg('compile', 'infoLog:\n' + result.infoLog);

    if(result.ok) {
      hideError();
      hideStatus();
      return { ok: true, infoLog: result.infoLog };
    } /* else -- compile failed */

    showError(result.infoLog);
    return { ok: false, infoLog: result.infoLog };
  } finally {
    compileInFlight = false;
    toolbar.setCompiling(false);
  }
};

// ................................................................................
/** schedule an auto-compile from a fresh shader source emission. Subscribed to
 *  `editorBridge.shaderSource$()` (see init); the editor pushes on every keystroke
 *  so we debounce here to fire only once the User has stopped editing. No-op when
 *  autoCompile is off or no ConfigStore is available */
const scheduleAutoCompile = (source: string): void => {
  if(!configStore) return;/*no appState -- auto-compile disabled*/
  if(!configStore.getConfig().autoCompile) return;

  const debounceMs = configStore.getConfig().autoCompileDebounceMs;
  dbg('compile', `autoCompile: source changed (${source.length} chars); (re)scheduling debounce ${debounceMs}ms`);
  if(autoCompileTimer) clearTimeout(autoCompileTimer);
  autoCompileTimer = setTimeout(() => {
    autoCompileTimer = null;
    if(editorBridge.getShader() === lastCompiledSource) {
      dbg('compile', 'autoCompile: debounce fired but source matches last compile; skipping');
      return;
    } /* else -- something new to compile */
    dbg('compile', 'autoCompile: debounce fired -> compile()');
    void compile();
  }, debounceMs);
};

// == Status + Error UI ===========================================================
const showError = (infoLog: string): void => {
  errorLogEl.textContent = infoLog;
  errorStripEl.hidden = false;
};

const hideError = (): void => {
  errorStripEl.hidden = true;
  errorLogEl.textContent = '';
};

const showStatus = (message: string): void => {
  statusTextEl.textContent = message;
  statusEl.hidden = false;
};

const hideStatus = (): void => {
  statusEl.hidden = true;
};

// == Samplers popover data source ================================================
/** build the rows the toolbar's Samplers popover displays. Called each time the
 *  popover is opened or channel state changes -- cheap either way */
const buildSamplerRows = (): ReadonlyArray<SamplerRow> => {
  const channels = channelBinder.getChannels();
  const out: SamplerRow[] = [];
  for(let i=0; i<CHANNEL_SLOT_IDS.length; i++) {
    const state = channels[i];
    out.push({
      index: i,
      label: CHANNEL_SLOT_IDS[i],
      bound: (state?.texture ?? null) !== null,
      meta:  channelBinder.getSamplerMeta(i)
    });
  }
  return out;
};

// == Fullscreen ==================================================================
const toggleFullscreen = (): void => {
  if(document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  } /* else -- not currently fullscreen */
  void stageEl.requestFullscreen().catch(error => console.error('shader-demo: fullscreen failed:', error));
};

// == Command surface =============================================================
// NOTE: each method receives a single named-args object whose properties match
//       the method's `inputSchema` in manifest.json
const advertiseCommands = (): void => {
  if(!charmiqGlobal?.exportCommands) return/*standalone -- no CharmIQ bridge*/;

  charmiqGlobal.exportCommands({
    play: () => {
      playback.play();
      return true;
    },
    pause: () => {
      playback.pause();
      return true;
    },
    reset: () => {
      playback.reset();
      return true;
    },
    compile:        () => compile(),
    setAutoCompile: async ({ enabled }: { enabled: boolean; }) => {
      if(!configStore) return false;
      await configStore.updateAutoCompile(enabled);
      toolbar.setAutoCompile(enabled);
      return true;
    }
  });
};

// == Playback ====================================================================
const playback = new Playback(canvas, (inputs) => {
  const channels = channelBinder.getChannels();
  renderer.render(inputs, channels);
});

playback.setResizeCallback((width, height, dpr) => {
  renderer.resize(width, height, dpr);
});

playback.telemetry$().subscribe((telemetry: PlaybackTelemetry) => {
  toolbar.applyTelemetry(telemetry);
});

// when channel state changes, refresh the popover so meta / bound state stays live
channelBinder.channels$().subscribe(() => {
  toolbar.refreshSamplers();
});

// == Wire toolbar ================================================================
toolbar.setOnPlayPause(() => playback.togglePlay());
toolbar.setOnReset(()     => playback.reset());
toolbar.setOnCompile(()   => { void compile(); });
toolbar.setOnFullscreen(toggleFullscreen);
toolbar.setOnAutoCompile(async (enabled: boolean) => {
  if(!configStore) return;
  dbg('compile', `autoCompile: user toggled -> ${enabled}`);
  await configStore.updateAutoCompile(enabled);
  // if just turned on, schedule a compile from the current source so the User
  // doesn't have to type a character to see the first auto-compile
  if(enabled) {
    const source = editorBridge.getShader();
    if(source !== null) scheduleAutoCompile(source);
  } /* else -- toggled off; pending timer can stay (it self-skips on next tick) */
});
toolbar.setOnSamplerChange((index: number, meta: Readonly<SamplerMeta>) => {
  void channelBinder.setSamplerMeta(index, meta);
});
toolbar.setSamplersDataSource(buildSamplerRows);

// == Keyboard shortcuts ==========================================================
// Ctrl/Cmd + Enter triggers a compile
document.addEventListener('keydown', (event) => {
  const cmdOrCtrl = event.metaKey || event.ctrlKey;
  if(cmdOrCtrl && (event.key === 'Enter')) {
    event.preventDefault();
    void compile();
  } /* else -- not a shortcut */
});

// == Resize ======================================================================
const resizeObserver = new ResizeObserver(() => {
  playback.setSize(stageEl.clientWidth, stageEl.clientHeight);
});
resizeObserver.observe(stageEl);
// initial size push so first frame renders at the right resolution
playback.setSize(stageEl.clientWidth, stageEl.clientHeight);
renderer.resize(stageEl.clientWidth, stageEl.clientHeight, window.devicePixelRatio);

// == Init ========================================================================
const start = async (): Promise<void> => {
  showStatus('Waiting for shader…');

  // config first so the toolbar reflects the persisted autoCompile state
  if(configStore) {
    await configStore.init();
    const initial = configStore.getConfig();
    setDbgEnabled(initial.debug);
    toolbar.setAutoCompile(initial.autoCompile);
    configStore.onConfigChange((cfg, changed) => {
      if(changed.has('autoCompile')) toolbar.setAutoCompile(cfg.autoCompile);
      if(changed.has('debug'))       setDbgEnabled(cfg.debug);
    });
  } /* else -- no appState; the Auto checkbox is a local-only toggle */

  // wire up sibling-App discovery — the editor bridge subscribes synchronously
  // (returns immediately), the channel binder is async because it touches GL
  editorBridge.init(charmiqGlobal);
  await channelBinder.init(charmiqGlobal);

  // advertise the player's own command surface once peers are known
  advertiseCommands();

  // first compile -- falls back to a starter shader if the editor isn't available
  // so the canvas has something to render
  await compile();

  // start the RAF loop once there's a program to render (renderer handles the
  // no-program case but starting earlier just wastes frames)
  playback.start();

  // auto-compile is push-driven: the editor's capability streams every keystroke
  // through shaderSource$, and scheduleAutoCompile debounces them into compiles.
  // No polling — when autoCompile is off, scheduleAutoCompile short-circuits.
  // Exception: if the last compile used FALLBACK_SHADER (iframe reload beat the
  // editor's first `changes$` push), force a catch-up compile so the User sees
  // their real shader without having to click Compile
  editorBridge.shaderSource$().subscribe((source: string) => {
    if(lastCompileUsedFallback) {
      dbg('compile', 'editor source arrived after fallback compile; forcing catch-up compile');
      void compile();
      return;
    } /* else -- already on real source; respect autoCompile gate */
    scheduleAutoCompile(source);
  });
};

start().catch(error => console.error('shader-demo initialization failed:', error));
