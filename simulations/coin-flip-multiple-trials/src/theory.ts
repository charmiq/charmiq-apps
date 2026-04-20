// theoretical (closed-form) distribution of the longest heads-run in a
// sequence of fair-coin flips. Two variants:
//
//  - longest-anywhere: computed via an exact dynamic program. The textbook
//    `(1 - 1/2^k)^n` approximation treats the (overlapping) window-events
//    "k consecutive heads starting at position i" as independent and
//    systematically overestimates long runs. At n=100 the approximation
//    puts E[L] at ~7.9 while the true value is ~6.0. The original 2012
//    sketch patched this with a `flipsPerTrial / 4` fudge factor its author
//    flagged `CHECK: why?`; the DP computes the true distribution directly.
//
//  - leading-run: exact closed form. P(leading = k) = 1/2^(k+1) for k < n,
//    with the k == n edge case (all heads, no terminating tails) at 1/2^n.
//
// the DP cost is O(maxK^2 * n) (~23k ops at n=100, maxK=15). Cached per
// (flipsPerTrial, leadingRun) so redraw on every trial doesn't repay it
// ********************************************************************************
// == Public API ==================================================================
/** expected number of trials whose longest heads-run is exactly k, for
 *  k ∈ [1, maxRunLength]. Returns a length-`maxRunLength` array where
 *  entry i is the expected count at run-length (i + 1) */
export const theoreticalLongestRunDistribution = (
  flipsPerTrial: number,
  trialCount:    number,
  leadingRun:    boolean,
  maxRunLength:  number,
): number[] => {
  const pAt = perTrialProbabilities(flipsPerTrial, leadingRun, maxRunLength);
  return pAt.map((p) => p * trialCount);
};

// == Per-trial probabilities =====================================================
// cache the pAt[] vector by (flipsPerTrial, leadingRun, maxRunLength). Flipping
// any of these invalidates. The overlay recomputes on every trial otherwise
let cachedN: number        = -1;
let cachedLeading: boolean = false;
let cachedMaxK: number     = -1;
let cachedPAt: number[]    = [];

const perTrialProbabilities = (
  n:            number,
  leadingRun:   boolean,
  maxRunLength: number,
): number[] => {
  if((n === cachedN) && (leadingRun === cachedLeading) && (maxRunLength === cachedMaxK)) {
    return cachedPAt;
  } /* else -- cache miss; recompute */

  cachedN       = n;
  cachedLeading = leadingRun;
  cachedMaxK    = maxRunLength;
  cachedPAt     = leadingRun ? leadingRunDistribution(n, maxRunLength)
                             : exactLongestRunDistribution(n, maxRunLength);
  return cachedPAt;
};

// == Exact longest-anywhere distribution =========================================
/** P(L_n = k) for k ∈ [1, maxK] via dynamic programming.
 *
 *  state: `a[r]` = probability that a length-i prefix has no run-of-heads longer
 *  than the current cap `k` AND ends with exactly `r` consecutive heads.
 *
 *  transitions from state (r, mass m):
 *    - append T (prob 1/2): contribute m/2 to next a[0]
 *    - append H (prob 1/2): contribute m/2 to next a[r+1] if r+1 ≤ k;
 *                           else the string's run exceeded k and its mass is
 *                           discarded (not counted toward P(L ≤ k))
 *
 *  after n steps, Σ a[r] == P(L_n ≤ k). Subtracting the runs for `k-1` gives
 *  P(L_n = k). Running the DP separately for each cap keeps the code simple;
 *  the total work is O(maxK^2 * n) */
const exactLongestRunDistribution = (n: number, maxK: number): number[] => {
  const pAtMost = new Array<number>(maxK + 1);
  for(let k=0; k<=maxK; k++) pAtMost[k] = probabilityAtMost(n, k);

  const pAt = new Array<number>(maxK);
  for(let k=1; k<=maxK; k++) {
    pAt[k - 1] = Math.max(0, pAtMost[k] - pAtMost[k - 1]);
  }
  return pAt;
};

const probabilityAtMost = (n: number, k: number): number => {
  // a[r] = P(prefix has no run > k and ends with exactly r consecutive heads)
  let a = new Array<number>(k + 1).fill(0);
  a[0] = 1;

  for(let step=0; step<n; step++) {
    const next = new Array<number>(k + 1).fill(0);
    for(let r=0; r<=k; r++) {
      if(a[r] <= 0) continue;
      const half = 0.5 * a[r];
      next[0] += half/*appended T*/;
      if(r + 1 <= k) next[r + 1] += half/*appended H; run stays within cap*/;
      // else -- r+1 > k; appending H would exceed the cap, mass discarded
    }
    a = next;
  }

  let total = 0;
  for(let r=0; r<=k; r++) total += a[r];
  return total;
};

// == Leading-run distribution ====================================================
/** P(leading = k) for k ∈ [1, maxK]. Exact closed form:
 *    P(leading = k) = 1/2^(k+1) for k < n (k heads then a tails)
 *    P(leading = k) = 1/2^n     for k == n (all heads; no terminator)
 *    P(leading = k) = 0         for k > n */
const leadingRunDistribution = (n: number, maxK: number): number[] => {
  const pAt = new Array<number>(maxK);
  for(let k=1; k<=maxK; k++) {
    if(k > n)       pAt[k - 1] = 0;
    else if(k === n) pAt[k - 1] = Math.pow(2, -n);
    else             pAt[k - 1] = Math.pow(2, -(k + 1));
  }
  return pAt;
};
