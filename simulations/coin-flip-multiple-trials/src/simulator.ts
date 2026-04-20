// multi-trial simulator. Each trial runs `flipsPerTrial` coin flips off a
// deterministic PRNG and records the longest heads-run observed. Accumulates
// the distribution of longest-runs across trials plus running arithmetic,
// geometric, and harmonic means of the positive samples.
//
// the PRNG stream is shared across trials so that `{ seed, trialCount,
// flipsPerTrial, leadingRun }` fully determines the experiment -- reload lands
// on the same histogram
// ********************************************************************************
// == Types =======================================================================
/** running statistics over the positive longest-run samples. Zero samples are
 *  excluded to match the original sketch -- a trial that produced no heads has
 *  no contribution to make to the distribution-of-longest-runs conversation */
export type Means = Readonly<{
  arithmetic: number;
  geometric:  number;
  harmonic:   number;
  /** number of positive samples contributing to the means */
  sampleCount: number;
}>;

/** snapshot consumed by the renderers. Pure values -- no DOM, no rxjs */
export type Snapshot = Readonly<{
  trialCount:    number;
  flipsPerTrial: number;
  leadingRun:    boolean;

  /** longest heads-run observed in the most recently completed trial (0 if
   *  no trial has run yet) */
  longestInCurrentTrial: number;

  /** longestRunDistribution[i] = number of trials whose longest heads-run had
   *  length (i + 1). Length is fixed at MAX_RUN_LENGTH */
  longestRunDistribution: readonly number[];

  means: Means;
}>;

// == Constants ===================================================================
/** matches the original sketch's UI bounds. The longest-run distribution for
 *  realistic `flipsPerTrial` almost never reaches this ceiling */
export const MAX_RUN_LENGTH = 15;

/** hard upper bound on accumulated trials so the loop can't run forever */
export const MAX_TRIAL_COUNT = 4000;

export const DEFAULT_FLIPS_PER_TRIAL = 100;

// == PRNG ========================================================================
/** Mulberry32 -- same PRNG as the single-trial sim. Duplicated here pending the
 *  shared-kit extraction milestone */
const advance = (state: number): { state: number; value: number; } => {
  let s = (state + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
};

// == Simulator ===================================================================
export class MultiTrialSimulator {
  // .. PRNG ......................................................................
  private seed: number;
  private rngState: number;

  // .. experiment parameters .....................................................
  private flipsPerTrial: number;
  private leadingRun:    boolean;

  // .. accumulated state .........................................................
  private trialCount            = 0;
  private longestInCurrentTrial = 0;
  private longestRunDistribution: number[] = new Array(MAX_RUN_LENGTH).fill(0);

  // running stats over positive samples -- O(1) per trial, O(1) memory
  private statCount      = 0;
  private statSum        = 0;
  private statSumLog     = 0;
  private statSumInverse = 0;

  public constructor(
    seed:          number  = Date.now() >>> 0,
    flipsPerTrial: number  = DEFAULT_FLIPS_PER_TRIAL,
    leadingRun:    boolean = false,
  ) {
    this.seed          = seed >>> 0;
    this.rngState      = this.seed;
    this.flipsPerTrial = Math.max(1, Math.floor(flipsPerTrial));
    this.leadingRun    = leadingRun;
  }

  // == Introspection =============================================================
  public getSeed():          number  { return this.seed; }
  public getTrialCount():    number  { return this.trialCount; }
  public getFlipsPerTrial(): number  { return this.flipsPerTrial; }
  public getLeadingRun():    boolean { return this.leadingRun; }

  public snapshot(): Snapshot {
    return {
      trialCount:             this.trialCount,
      flipsPerTrial:          this.flipsPerTrial,
      leadingRun:             this.leadingRun,
      longestInCurrentTrial:  this.longestInCurrentTrial,
      longestRunDistribution: this.longestRunDistribution.slice(),
      means:                  this.computeMeans(),
    };
  }

  // == Mutation ==================================================================
  /** advance by one trial. Returns the longest heads-run observed in the
   *  trial (clamped to MAX_RUN_LENGTH). Caller is responsible for honoring
   *  MAX_TRIAL_COUNT */
  public runTrial(): number {
    const observed = this.leadingRun ? this.countLeadingHeads()
                                     : this.countLongestHeadsAnywhere();
    const clamped  = Math.min(observed, MAX_RUN_LENGTH);

    this.longestInCurrentTrial = clamped;
    this.trialCount++;

    if(clamped > 0) {
      this.longestRunDistribution[clamped - 1]++;
      this.statCount++;
      this.statSum        += clamped;
      this.statSumLog     += Math.log(clamped);
      this.statSumInverse += 1 / clamped;
    } /* else -- the trial produced no heads-run; excluded from the distribution */

    return clamped;
  }

  /** clear accumulated trials. Optionally re-seeds the PRNG and/or changes
   *  the experiment parameters. Any parameter change resets the distribution
   *  -- different parameters are a different experiment */
  public reset(opts: Readonly<{
    seed?:          number;
    flipsPerTrial?: number;
    leadingRun?:    boolean;
  }> = {}): void {
    if(opts.seed          !== undefined) this.seed          = opts.seed >>> 0;
    if(opts.flipsPerTrial !== undefined) this.flipsPerTrial = Math.max(1, Math.floor(opts.flipsPerTrial));
    if(opts.leadingRun    !== undefined) this.leadingRun    = opts.leadingRun;

    this.rngState = this.seed;

    this.trialCount            = 0;
    this.longestInCurrentTrial = 0;
    this.longestRunDistribution.fill(0);

    this.statCount      = 0;
    this.statSum        = 0;
    this.statSumLog     = 0;
    this.statSumInverse = 0;
  }

  /** replay `trialCount` trials at the current parameters. Used to rehydrate
   *  from a persisted snapshot without storing the full distribution */
  public replay(trialCount: number): void {
    const target = Math.min(Math.max(0, Math.floor(trialCount)), MAX_TRIAL_COUNT);
    this.reset()/*back to fresh state at current seed + parameters*/;
    for(let i=0; i<target; i++) this.runTrial();
  }

  // == Internals =================================================================
  // .. trial runners .............................................................
  /** count the longest run of consecutive heads anywhere in `flipsPerTrial`
   *  flips off the shared PRNG stream. Advances `rngState` by exactly
   *  `flipsPerTrial` steps regardless of outcome */
  private countLongestHeadsAnywhere(): number {
    let longest = 0;
    let current = 0;
    for(let i=0; i<this.flipsPerTrial; i++) {
      if(this.nextCoinIsHeads()) {
        current++;
        if(current > longest) longest = current;
      } else {
        current = 0;
      }
    }
    return longest;
  }

  /** count the initial run of heads -- stops on the first tails. Still advances
   *  `rngState` by exactly `flipsPerTrial` steps so the PRNG stream stays
   *  deterministic regardless of which mode the trial is in (swapping modes
   *  mid-stream would desync reloads otherwise) */
  private countLeadingHeads(): number {
    let leading = 0;
    let stopped = false;
    for(let i=0; i<this.flipsPerTrial; i++) {
      const heads = this.nextCoinIsHeads();
      if(!stopped) {
        if(heads) leading++;
        else      stopped = true;
      } /* else -- already past the leading run; still consuming PRNG to keep the stream aligned */
    }
    return leading;
  }

  private nextCoinIsHeads(): boolean {
    const next    = advance(this.rngState);
    this.rngState = next.state;
    return next.value < 0.5;
  }

  // .. stats .....................................................................
  private computeMeans(): Means {
    const n = this.statCount;
    if(n < 1) return { arithmetic: 0, geometric: 0, harmonic: 0, sampleCount: 0 };
    return {
      arithmetic:  this.statSum / n,
      geometric:   Math.exp(this.statSumLog / n),
      harmonic:    n / this.statSumInverse,
      sampleCount: n,
    };
  }
}
