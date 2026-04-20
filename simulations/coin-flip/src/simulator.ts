// pure coin-flip simulator. Deterministic given a seed — replay the same seed
// and step count and you land on the same accumulated state. That property
// is what makes embedded figures reproducible across page loads
// ********************************************************************************
// == Types =======================================================================
export type Coin = 'H' | 'T';

/** snapshot consumed by the renderers. Pure values — no DOM, no rxjs */
export type Snapshot = Readonly<{
  /** total flips taken since the last reset */
  flipCount: number;
  /** length of the current streak of heads (0 if the last flip was tails or
   *  before the first flip) */
  currentRun: number;
  /** longest heads-run observed so far */
  longestRun: number;
  /** runCounts[i] = how many *completed* heads-runs of length (i + 1) have
   *  been observed. Length is fixed at MAX_RUN_LENGTH so the histogram never
   *  has to resize */
  runCounts: readonly number[];
}>;

// == Constants ===================================================================
/** matches the original sketch's UI bounds — keeps the run-vector + histogram
 *  rendering in sane pixels regardless of how lucky the PRNG gets */
export const MAX_RUN_LENGTH = 15;

/** safety upper bound on flips so the longest run almost never blows past
 *  MAX_RUN_LENGTH (at fair coin, P(longest run > 15 in 4000 flips) is small) */
export const MAX_FLIP_COUNT = 4000;

// == PRNG ========================================================================
/** Mulberry32 — small, fast, deterministic 32-bit PRNG. Plenty good for a
 *  visual coin-flip; the bias is well below what you can see at 4000 samples */
const advance = (state: number): { state: number; value: number; } => {
  let s = (state + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
};

// == Simulator ===================================================================
export class CoinFlipSimulator {
  /** seed used to (re)initialize the PRNG. Persisted so a reload can replay */
  private seed: number;
  /** running PRNG state — advances with every flip */
  private rngState: number;

  private flipCount = 0;
  private currentRun = 0;
  private longestRun = 0;
  private runCounts: number[] = new Array(MAX_RUN_LENGTH).fill(0);

  public constructor(seed: number = Date.now() >>> 0) {
    this.seed = seed >>> 0;
    this.rngState = this.seed;
  }

  // .. introspection .............................................................
  public getSeed(): number { return this.seed; }
  public getFlipCount(): number { return this.flipCount; }

  public snapshot(): Snapshot {
    return {
      flipCount:  this.flipCount,
      currentRun: this.currentRun,
      longestRun: this.longestRun,
      runCounts:  this.runCounts.slice(),
    };
  }

  // .. mutation ..................................................................
  /** advance one flip. Returns the coin. Caller is responsible for honoring
   *  MAX_FLIP_COUNT — `flip()` itself does not stop, since the auto-flip loop in
   *  `main.ts` already enforces the bound and a programmatic `step()` from the
   *  command surface is allowed to push past it */
  public flip(): Coin {
    const next = advance(this.rngState);
    this.rngState = next.state;
    const coin: Coin = next.value < 0.5 ? 'H' : 'T';

    this.flipCount++;
    if(coin === 'H') {
      this.currentRun++;
      if(this.currentRun > this.longestRun) this.longestRun = this.currentRun;
    } else {
      // a tails terminates the in-progress heads-run; record it (capped at
      // MAX_RUN_LENGTH so an unlucky seed can't write off the end). Empty
      // runs (0 heads) are not recorded — matches the original sketch
      if(this.currentRun > 0) {
        const idx = Math.min(this.currentRun, MAX_RUN_LENGTH) - 1;
        this.runCounts[idx]++;
      } /* else -- nothing to record */
      this.currentRun = 0;
    }
    return coin;
  }

  /** clear all accumulated state and reset the PRNG. If `seed` is supplied,
   *  adopts the new seed; otherwise replays from the current seed (so
   *  `reset()` followed by `flip()` gives the same outcomes as the very first
   *  run with this seed) */
  public reset(seed?: number): void {
    if(seed !== undefined) this.seed = seed >>> 0;
    this.rngState   = this.seed;
    this.flipCount  = 0;
    this.currentRun = 0;
    this.longestRun = 0;
    this.runCounts.fill(0);
  }

  /** replay `steps` flips against the current seed — used to rehydrate from a
   *  persisted `{ seed, steps }` snapshot without storing the full counts.
   *  No-op if `steps <= 0` */
  public replay(steps: number): void {
    this.reset()/*back to fresh state at current seed*/;
    for(let i=0; i<steps && i<MAX_FLIP_COUNT; i++) this.flip();
  }
}
