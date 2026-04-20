import type { CharmIQAPI } from '../../../shared/charmiq';
import { Histogram } from './histogram';
import { RunVector } from './run-vector';
import { CoinFlipSimulator, type Snapshot, MAX_FLIP_COUNT, MAX_RUN_LENGTH } from './simulator';
import { theoreticalLongestRunDistribution, theoreticalRunDistribution } from './theory';

// Entry point -- constructs the simulator and visuals, wires the auto-flip loop,
// persists `{ seed, steps, delayMs }` to appState so reloads land on the same
// experiment, and advertises the play / pause / step / reset / setSeed /
// setDelay command surface for sibling Apps and host agents
// ********************************************************************************
// == Globals =====================================================================
const charmiqGlobal: CharmIQAPI | undefined = window.charmiq;

// == Persisted state =============================================================
type PersistedState = Readonly<{
  seed:    number;
  steps:   number;
  delayMs: number;
}>;

const DEFAULT_DELAY_MS = 100;
const MIN_DELAY_MS     = 1;

// == DOM lookups =================================================================
const flipBtn       = document.getElementById('flipBtn')          as HTMLButtonElement;
const playBtn       = document.getElementById('playBtn')          as HTMLButtonElement;
const resetBtn      = document.getElementById('resetBtn')         as HTMLButtonElement;
const delayInput    = document.getElementById('delayInput')       as HTMLInputElement;
const coinDisplay   = document.getElementById('coinDisplay')      as HTMLSpanElement;
const flipCountEl   = document.getElementById('flipCountDisplay') as HTMLSpanElement;
const seedDisplay   = document.getElementById('seedDisplay')      as HTMLSpanElement;
const sketchEl      = document.getElementById('sketch')           as HTMLElement;

const currentRunEl  = document.getElementById('currentRunVector')   as HTMLElement;
const longestRunEl  = document.getElementById('longestRunVector')   as HTMLElement;
const runHistEl     = document.getElementById('runHistogram')       as HTMLElement;
const longestHistEl = document.getElementById('longestRunHistogram') as HTMLElement;

// == Visuals =====================================================================
const currentRunVis = new RunVector(currentRunEl, 'current-run-vector');
const longestRunVis = new RunVector(longestRunEl, 'longest-run-vector');

const HIST_W = 300, HIST_H = 200;

const runHistogram = new Histogram(runHistEl, {
  width: HIST_W, height: HIST_H,
  title: 'Distribution of Runs',
  xAxisLabel: 'run length',
  actualClassName:      'series-actual run-series',
  theoreticalClassName: 'series-theoretical run-series',
});

const longestHistogram = new Histogram(longestHistEl, {
  width: HIST_W, height: HIST_H,
  title: 'Distribution of Longest Run',
  xAxisLabel: 'longest-run length',
  actualClassName:      'series-actual longest-series',
  theoreticalClassName: 'series-theoretical longest-series',
});

// == Simulator + state ===========================================================
let delayMs   = DEFAULT_DELAY_MS;
let running   = false;
/** setInterval handle for the play loop. Null when paused */
let timer: ReturnType<typeof setInterval> | null = null;

const sim = new CoinFlipSimulator()/*seeded with Date.now() until appState rehydrates*/;

// == Render ======================================================================
const render = (lastFlip: 'H' | 'T' | null = null): void => {
  const snap: Snapshot = sim.snapshot();

  flipCountEl.textContent  = snap.flipCount.toLocaleString();
  seedDisplay.textContent  = sim.getSeed().toString();

  if(lastFlip) {
    coinDisplay.textContent = lastFlip;
    coinDisplay.dataset.coin = lastFlip;
  } else {
    coinDisplay.textContent = '—';
    delete coinDisplay.dataset.coin;
  }

  currentRunVis.update(snap.currentRun);
  longestRunVis.update(snap.longestRun);

  // theoretical "n" parameters preserved from the original sketch -- see
  // theory.ts for the rationale
  const runTheory     = theoreticalRunDistribution(snap.flipCount / 2, MAX_RUN_LENGTH);
  const longestTheory = theoreticalLongestRunDistribution(snap.flipCount / 4, 3, MAX_RUN_LENGTH);

  // longest-run "actual" is a one-hot vector pointing at the current longest
  // (matches the original sketch -- the histogram shows where the longest sits,
  // overlaid against the expected distribution it should have landed in)
  const longestOneHot = new Array(MAX_RUN_LENGTH).fill(0);
  if(snap.longestRun > 0) longestOneHot[Math.min(snap.longestRun, MAX_RUN_LENGTH) - 1] = 1;

  runHistogram.redraw(snap.runCounts, runTheory);
  longestHistogram.redraw(longestOneHot, longestTheory);
};

// == Loop ========================================================================
const stepOnce = (): { coin: 'H' | 'T'; snap: Snapshot; } => {
  const coin = sim.flip();
  render(coin);
  schedulePersist();
  return { coin, snap: sim.snapshot() };
};

const startLoop = (): void => {
  if(running) return;
  running = true;
  playBtn.textContent = 'Pause';
  sketchEl.dataset.running = 'true';

  timer = setInterval(() => {
    if(sim.getFlipCount() >= MAX_FLIP_COUNT) { stopLoop(); return; }
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

// == Persistence =================================================================
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** debounce appState writes — `setInterval`-driven flips can fire 1000Hz at
 *  delay=1, and we don't want to slam appState that hard */
const schedulePersist = (): void => {
  if(!charmiqGlobal?.appState) return;
  if(persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const state: PersistedState = {
      seed:    sim.getSeed(),
      steps:   sim.getFlipCount(),
      delayMs,
    };
    void charmiqGlobal.appState.set(state);
  }, 200);
};

const rehydrate = (state: unknown): void => {
  if(state === null || typeof state !== 'object') return;
  const s = state as Partial<PersistedState>;

  if(typeof s.seed    === 'number') sim.reset(s.seed);
  if(typeof s.steps   === 'number' && (s.steps > 0)) sim.replay(s.steps);
  if(typeof s.delayMs === 'number') {
    delayMs = Math.max(MIN_DELAY_MS, Math.floor(s.delayMs));
    delayInput.value = String(delayMs);
  }
  // always rehydrate paused -- matches doc-reading expectations
  render();
};

// == UI wiring ===================================================================
flipBtn.addEventListener('click', () => {
  if(sim.getFlipCount() >= MAX_FLIP_COUNT) return;
  stepOnce();
});

playBtn.addEventListener('click', () => {
  if(running) stopLoop();
  else        startLoop();
});

resetBtn.addEventListener('click', () => {
  stopLoop();
  sim.reset()/*keep current seed -- gives deterministic re-runs from the same start*/;
  render();
  schedulePersist();
});

delayInput.addEventListener('change', () => {
  const v = parseInt(delayInput.value, 10);
  if(!Number.isFinite(v)) return;
  setDelay(v);
});

// == Command surface =============================================================
charmiqGlobal?.exportCommands?.({
  play: () => { startLoop(); return running; },
  pause: () => { stopLoop(); return running; },

  step: () => {
    const { coin, snap } = stepOnce();
    return {
      flip:        coin,
      flipCount:   snap.flipCount,
      currentRun:  snap.currentRun,
      longestRun:  snap.longestRun,
    };
  },

  reset: ({ seed }: { seed?: number; } = {}) => {
    stopLoop();
    sim.reset(seed);
    render();
    schedulePersist();
    return true;
  },

  setSeed: ({ seed }: { seed: number; }) => {
    stopLoop();
    sim.reset(seed);
    render();
    schedulePersist();
    return sim.getSeed();
  },

  setDelay: ({ ms }: { ms: number; }) => setDelay(ms),
});

// == Bootstrap ===================================================================
const bootstrap = async (): Promise<void> => {
  if(charmiqGlobal?.appState) {
    try {
      const initial = await charmiqGlobal.appState.get();
      if(initial) rehydrate(initial);
      else        render()/*no persisted state -- fresh seed is fine*/;
    } catch{
      render()/*appState read failed; fall back to fresh state*/;
    }
    charmiqGlobal.appState.onChange$().subscribe(rehydrate);
  } else {
    render()/*standalone -- no platform bridge*/;
  }
};

void bootstrap();
