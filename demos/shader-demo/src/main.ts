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
//   EditorBridge (discover 'charmiq.command')
//       -> getShader() on Compile or (debounced) auto -> Renderer.setShader
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
const charmiqGlobal = (window as any).charmiq;

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
    const fromEditor = await editorBridge.getShader();
    const source = fromEditor ?? FALLBACK_SHADER;
    const usingFallback = (fromEditor === null);
    lastCompiledSource = source;

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
/** poll the editor for text changes and schedule an auto-compile after a quiet
 *  window. The poll runs at a fixed cadence regardless of the User's typing speed;
 *  whenever the text changes, the debounce timer is reset, so the compile fires only
 *  once the User has stopped editing. No-op when autoCompile is off or no ConfigStore
 *  is available */
let lastObservedSource: string | null = null;
const pollAndScheduleAutoCompile = async (): Promise<void> => {
  if(!configStore) return;/*no appState -- auto-compile disabled*/
  if(!configStore.getConfig().autoCompile) return;

  const source = await editorBridge.getShader();
  if(source === null) return;/*editor unreachable; try again next tick*/

  if(source !== lastObservedSource) {
    const debounceMs = configStore.getConfig().autoCompileDebounceMs;
    dbg('compile', `autoCompile: source changed (${source.length} chars); (re)scheduling debounce ${debounceMs}ms`);
    lastObservedSource = source;
    if(autoCompileTimer) clearTimeout(autoCompileTimer);
    autoCompileTimer = setTimeout(() => {
      autoCompileTimer = null;
      if(lastObservedSource === lastCompiledSource) {
        dbg('compile', 'autoCompile: debounce fired but source matches last compile; skipping');
        return;
      } /* else -- something new to compile */
      dbg('compile', 'autoCompile: debounce fired -> compile()');
      void compile();
    }, debounceMs);
  } /* else -- no change since last poll; leave any pending timer alone */
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
const advertiseCommands = (): void => {
  if(!charmiqGlobal?.advertise) return/*standalone -- no CharmIQ bridge*/;

  charmiqGlobal.advertise('charmiq.command', {
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
  // if just turned on, start polling immediately so the User sees fast feedback
  // rather than waiting for the next scheduled tick
  if(enabled) void pollAndScheduleAutoCompile();
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

  // discover sibling Apps in parallel so the first compile doesn't wait on the
  // gallery round-trip and vice versa
  await Promise.all([
    editorBridge.init(charmiqGlobal),
    channelBinder.init(charmiqGlobal)
  ]);

  // advertise the player's own command surface once peers are known
  advertiseCommands();

  // first compile -- falls back to a starter shader if the editor isn't available
  // so the canvas has something to render
  await compile();

  // start the RAF loop once there's a program to render (renderer handles the
  // no-program case but starting earlier just wastes frames)
  playback.start();

  // Platform-side auto-compile: poll the editor at a slow cadence when the flag is
  // on. Not a subscription because the editor doesn't advertise a text stream; 500ms
  // is infrequent enough to be imperceptible yet responsive relative to the debounce
  // window
  setInterval(() => { void pollAndScheduleAutoCompile(); }, 500);
};

start().catch(error => console.error('shader-demo initialization failed:', error));
