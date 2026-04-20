// theoretical (closed-form) distribution of the longest heads-run in a
// sequence of fair-coin flips. Same formula the single-trial sim uses, just
// scaled by the number of trials -- this overlay shows the shape the empirical
// histogram converges toward.
//
// P(longest run ≤ k in n flips) ≈ (1 - 1/2^k)^n
// P(longest run = k)            ≈ (1 - 1/2^k)^n - (1 - 1/2^(k-1))^n
// expected-count                = (that probability) * trialCount
// ********************************************************************************
// == Longest-run distribution ====================================================
/** expected number of trials whose longest heads-run is exactly k, for
 *  k ∈ [1, maxRunLength]. `flipsPerTrial` is n (flips per trial) and
 *  `trialCount` is the multiplier that scales probabilities to counts.
 *
 *  when `leadingRun` is true the experiment measures the *initial* run of
 *  heads rather than the longest-anywhere. For a leading run,
 *  P(leading run ≥ k) = 1/2^k exactly (the first k flips all heads), so
 *  P(leading run = k) = 1/2^k - 1/2^(k+1) = 1/2^(k+1). Capped at
 *  `flipsPerTrial` since a leading run can't exceed the trial length */
export const theoreticalLongestRunDistribution = (
  flipsPerTrial: number,
  trialCount:    number,
  leadingRun:    boolean,
  maxRunLength:  number,
): number[] => {
  const distribution = new Array<number>(maxRunLength);
  for(let k=1; k<=maxRunLength; k++) {
    const p = leadingRun ? leadingRunProbability(k, flipsPerTrial)
                         : longestRunProbability(k, flipsPerTrial);
    distribution[k - 1] = trialCount * p;
  }
  return distribution;
};

// == Per-trial probabilities =====================================================
/** P(longest heads-run anywhere in `n` flips == k) */
const longestRunProbability = (k: number, n: number): number => {
  const pAtMostK     = Math.pow(1 - 1 / (1 << k),     n);
  const pAtMostKMin1 = Math.pow(1 - 1 / (1 << (k-1)), n);
  return Math.max(0, pAtMostK - pAtMostKMin1);
};

/** P(leading heads-run in `n` flips == k). For k < n this is 1/2^(k+1)
 *  (k heads then a tails). For k == n it is 1/2^n (all heads, no terminating
 *  tails possible) */
const leadingRunProbability = (k: number, n: number): number => {
  if(k > n) return 0;
  if(k === n) return 1 / (1 << n);
  return 1 / (1 << (k + 1));
};
