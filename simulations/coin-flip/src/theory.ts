// theoretical (closed-form) distributions overlaid on the histograms — ported
// from the original `blog-math.js` (Aggregate Knowledge, 2012, Apache-2.0).
// The arithmetic is identical; the wrapping is typed
// ********************************************************************************
// == Run-length distribution =====================================================
/** expected count of *completed* heads-runs of length k for n flips, for
 *  k ∈ [1, maxRunLength].
 *
 *  The original sketch passes `flipCount / 2` for n. The "/ 2" comes from the
 *  fact that on a fair coin only ~half of all flips terminate a run (the
 *  tails), so the number of opportunities to complete a run is roughly
 *  flipCount / 2. We preserve the convention so the overlay stays calibrated
 *  to the empirical bars.
 *
 *  Closed form per the original: `(1 + (n - k) / 2) / 2^k` for `k < n`,
 *  zero otherwise (not enough flips yet to even potentially complete a run
 *  of that length) */
export const theoreticalRunDistribution = (
  n: number,
  maxRunLength: number,
): number[] => {
  const distribution = new Array<number>(maxRunLength);
  for(let k=1; k<=maxRunLength; k++) {
    distribution[k - 1] = (k < n) ? (1 + (n - k) / 2) / (1 << k) : 0;
  }
  return distribution;
};

// == Longest-run distribution ====================================================
/** expected count of trials whose longest heads-run is exactly k, for
 *  k ∈ [1, maxRunLength]. `n` is the number of flips per trial; `t` is the
 *  number of trials.
 *
 *  P(longest run ≤ k in n flips) ≈ (1 - 1/2^k)^n. So
 *  P(longest run = k) ≈ (1 - 1/2^k)^n - (1 - 1/2^(k-1))^n,
 *  multiplied by t to scale to expected counts.
 *
 *  The original single-trial sketch passes `flipCount / 4` for n and 3 for
 *  t. The factors are empirical fits to the visible bar height — the
 *  comment in the original was `CHECK: why`. Preserved as-is for fidelity */
export const theoreticalLongestRunDistribution = (
  n: number, t: number,
  maxRunLength: number,
): number[] => {
  const distribution = new Array<number>(maxRunLength);
  for(let k=1; k<=maxRunLength; k++) {
    const pAtMostK     = Math.pow(1 - 1 / (1 << k),     n);
    const pAtMostKMin1 = Math.pow(1 - 1 / (1 << (k-1)), n);
    distribution[k - 1] = t * Math.max(0, pAtMostK - pAtMostKMin1);
  }
  return distribution;
};
