import type { CharmIQAPI } from '../../../shared/charmiq';
import { Histogram, type MeanOverlay } from './histogram';
import { RunVector } from './run-vector';
import { MultiTrialSimulator, type Snapshot, DEFAULT_FLIPS_PER_TRIAL, MAX_RUN_LENGTH, MAX_TRIAL_COUNT } from './simulator';
import { theoreticalLongestRunDistribution } from './theory';

// entry point -- constructs the simulator and visuals, wires the auto-trial
// loop, persists `{ seed, trialCount, flipsPerTrial, leadingRun, delayMs }` to
// appState so a reload re-runs the same experiment, and advertises a small
// command surface (play / pause / runTrial / reset / setSeed / setDelay /
// setFlipsPerTrial / setLeadingRun) for sibling Apps and host agents
// ********************************************************************************
// == Globals =====================================================================
const charmiqGlobal: CharmIQAPI | undefined = window.charmiq;

// == Persisted state =============================================================
type PersistedState = Readonly<{
  seed:          number;
  trialCount:    number;
  flipsPerTrial: number;
  leadingRun:    boolean;
  delayMs:       number;
}>;

const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS     = 1;

// == DOM lookups =================================================================
const trialBtn        = document.getElementById('trialBtn')         as HTMLButtonElement;
const playBtn         = document.getElementById('playBtn')          as HTMLButtonElement;
const resetBtn        = document.getElementById('resetBtn')         as HTMLButtonElement;
const flipsInput      = document.getElementById('flipsInput')       as HTMLInputElement;
const leadingRunInput = document.getElementById('leadingRunInput')  as HTMLInputElement;
const delayInput      = document.getElementById('delayInput')       as HTMLInputElement;
const seedDisplay     = document.getElementById('seedDisplay')      as HTMLSpanElement;
const longestDisplay  = document.getElementById('longestDisplay')   as HTMLSpanElement;
const trialCountEl    = document.getElementById('trialCountDisplay') as HTMLSpanElement;
const arithDisplay    = document.getElementById('arithDisplay')     as HTMLSpanElement;
const geomDisplay     = document.getElementById('geomDisplay')      as HTMLSpanElement;
const harmDisplay     = document.getElementById('harmDisplay')      as HTMLSpanElement;
const sketchEl        = document.getElementById('sketch')           as HTMLElement;

const currentRunEl    = document.getElementById('currentRunVector')    as HTMLElement;
const histogramEl     = document.getElementById('longestRunHistogram') as HTMLElement;

// == Visuals =====================================================================
const currentRunVis = new RunVector(currentRunEl, 'current-run-vector');

const HIST_W = 420, HIST_H = 240;

const longestHistogram = new Histogram(histogramEl, {
  width: HIST_W, height: HIST_H,
  title:      'Distribution of Longest Run Across Trials',
  xAxisLabel: 'longest-run length',
  actualClassName:      'series-actual longest-series',
  theoreticalClassName: 'series-theoretical longest-series',
});

// == Simulator + state ===========================================================
let delayMs = DEFAULT_DELAY_MS;
let running = false;
/** setInterval handle for the auto-trial loop. Null when paused */
let timer: ReturnType<typeof setInterval> | null = null;

const sim = new MultiTrialSimulator()/*seeded with Date.now() until appState rehydrates*/;

// == Render ======================================================================
const formatMean = (v: number): string => (v > 0) ? v.toFixed(2) : '—';

const render = (): void => {
  const snap: Snapshot = sim.snapshot();

  trialCountEl.textContent     = snap.trialCount.toLocaleString();
  longestDisplay.textContent   = (snap.trialCount > 0) ? snap.longestInCurrentTrial.toString() : '—';
  seedDisplay.textContent      = sim.getSeed().toString();
  flipsInput.value             = String(snap.flipsPerTrial);
  leadingRunInput.checked      = snap.leadingRun;
  delayInput.value             = String(delayMs);

  arithDisplay.textContent = formatMean(snap.means.arithmetic);
  geomDisplay.textContent  = formatMean(snap.means.geometric);
  harmDisplay.textContent  = formatMean(snap.means.harmonic);

  currentRunVis.update(snap.longestInCurrentTrial);

  const theory = theoreticalLongestRunDistribution(
    snap.flipsPerTrial,
    Math.max(1, snap.trialCount)/*avoid a flat-zero overlay before the first trial*/,
    snap.leadingRun,
    MAX_RUN_LENGTH,
  );

  const means: MeanOverlay[] = (snap.means.sampleCount > 0) ? [
    { value: snap.means.arithmetic, className: 'mean-arithmetic' },
    { value: snap.means.geometric,  className: 'mean-geometric' },
    { value: snap.means.harmonic,   className: 'mean-harmonic' },
  ] : [];

  longestHistogram.redraw(snap.longestRunDistribution, theory, means);
};

// == Loop ========================================================================
const stepOnce = (): Snapshot => {
  sim.runTrial();
  render();
  schedulePersist();
  return sim.snapshot();
};

const startLoop = (): void => {
  if(running) return;
  running = true;
  playBtn.textContent = 'Pause';
  sketchEl.dataset.running = 'true';

  timer = setInterval(() => {
    if(sim.getTrialCount() >= MAX_TRIAL_COUNT) { stopLoop(); return; }
    stepOnce();
  }, delayMs);
};

const stopLoop = (): void => {
  if(timer !== null) { clearInterval(timer); timer = null; }
  running = false;
  playBtn.textContent = 'Play';
  delete sketchEl.dataset.running;
};

const setDelay = (ms: number): number => {
  delayMs = Math.max(MIN_DELAY_MS, Math.floor(ms));
  delayInput.value = String(delayMs);
  if(running) { stopLoop(); startLoop(); }/*re-arm with the new period*/
  schedulePersist();
  return delayMs;
};

const setFlipsPerTrial = (n: number): number => {
  stopLoop();
  sim.reset({ flipsPerTrial: Math.max(1, Math.floor(n)) });
  render();
  schedulePersist();
  return sim.getFlipsPerTrial();
};

const setLeadingRun = (enabled: boolean): boolean => {
  stopLoop();
  sim.reset({ leadingRun: enabled });
  render();
  schedulePersist();
  return sim.getLeadingRun();
};

// == Persistence =================================================================
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** debounce appState writes -- the auto-trial loop can fire many trials per
 *  second at low delays; appState shouldn't be hammered that hard */
const schedulePersist = (): void => {
  if(!charmiqGlobal?.appState) return;
  if(persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const state: PersistedState = {
      seed:          sim.getSeed(),
      trialCount:    sim.getTrialCount(),
      flipsPerTrial: sim.getFlipsPerTrial(),
      leadingRun:    sim.getLeadingRun(),
      delayMs,
    };
    void charmiqGlobal.appState.set(state);
  }, 200);
};

const rehydrate = (state: unknown): void => {
  if(state === null || typeof state !== 'object') return;
  const s = state as Partial<PersistedState>;

  // .. parameters first; the replay below depends on them ........................
  const opts: { seed?: number; flipsPerTrial?: number; leadingRun?: boolean; } = {};
  if(typeof s.seed          === 'number')  opts.seed          = s.seed;
  if(typeof s.flipsPerTrial === 'number')  opts.flipsPerTrial = s.flipsPerTrial;
  if(typeof s.leadingRun    === 'boolean') opts.leadingRun    = s.leadingRun;
  sim.reset(opts);

  if(typeof s.trialCount === 'number' && (s.trialCount > 0)) sim.replay(s.trialCount);

  if(typeof s.delayMs === 'number') {
    delayMs = Math.max(MIN_DELAY_MS, Math.floor(s.delayMs));
    delayInput.value = String(delayMs);
  } /* else -- keep the current delay */

  // always rehydrate paused -- matches doc-reading expectations
  render();
};

// == UI wiring ===================================================================
trialBtn.addEventListener('click', () => {
  if(sim.getTrialCount() >= MAX_TRIAL_COUNT) return;
  stepOnce();
});

playBtn.addEventListener('click', () => {
  if(running) stopLoop();
  else        startLoop();
});

resetBtn.addEventListener('click', () => {
  stopLoop();
  sim.reset()/*keep current seed + parameters -- deterministic re-run*/;
  render();
  schedulePersist();
});

flipsInput.addEventListener('change', () => {
  const v = parseInt(flipsInput.value, 10);
  if(!Number.isFinite(v) || (v < 1)) {
    flipsInput.value = String(sim.getFlipsPerTrial());
    return;
  } /* else -- valid; apply */
  setFlipsPerTrial(v);
});

leadingRunInput.addEventListener('change', () => {
  setLeadingRun(leadingRunInput.checked);
});

delayInput.addEventListener('change', () => {
  const v = parseInt(delayInput.value, 10);
  if(!Number.isFinite(v)) return;
  setDelay(v);
});

// == Command surface =============================================================
charmiqGlobal?.exportCommands?.({
  play:  () => { startLoop(); return running; },
  pause: () => { stopLoop();  return running; },

  runTrial: () => {
    const snap = stepOnce();
    return {
      longestRun:    snap.longestInCurrentTrial,
      trialCount:    snap.trialCount,
      flipsPerTrial: snap.flipsPerTrial,
      leadingRun:    snap.leadingRun,
    };
  },

  reset: ({ seed }: { seed?: number; } = {}) => {
    stopLoop();
    sim.reset((seed !== undefined) ? { seed } : {});
    render();
    schedulePersist();
    return true;
  },

  setSeed: ({ seed }: { seed: number; }) => {
    stopLoop();
    sim.reset({ seed });
    render();
    schedulePersist();
    return sim.getSeed();
  },

  setDelay:         ({ ms }:      { ms: number; })           => setDelay(ms),
  setFlipsPerTrial: ({ n }:       { n: number; })            => setFlipsPerTrial(n),
  setLeadingRun:    ({ enabled }: { enabled: boolean; })     => setLeadingRun(enabled),
});

// == Bootstrap ===================================================================
const bootstrap = async (): Promise<void> => {
  if(charmiqGlobal?.appState) {
    try {
      const initial = await charmiqGlobal.appState.get();
      if(initial) rehydrate(initial);
      else        render()/*no persisted state -- fresh seed is fine*/;
    } catch(error) {
      render()/*appState read failed; fall back to fresh state*/;
    }
    charmiqGlobal.appState.onChange$().subscribe(rehydrate);
  } else {
    sim.reset({ flipsPerTrial: DEFAULT_FLIPS_PER_TRIAL })/*standalone defaults*/;
    render();
  }
};

void bootstrap();
