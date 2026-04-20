# Coin Flip — Multiple Trials

*A Monte Carlo sketch of many independent coin-flip experiments. Each trial
is a sequence of `n` fair-coin flips; we plot one bar per trial in the
distribution of longest heads-runs and watch it converge to its closed-form
overlay. Three kinds of mean — arithmetic, geometric, harmonic — are drawn
on top, setting up the story HyperLogLog later turns into an estimator.*


## The Sketch

<p style="text-align: center;">
  <iframe-app height="610px" width="640px" style="border: 1px solid #dddddd; vertical-align: top;" src="charmiq://.">
    <app-state>
{
  "seed": 1729,
  "trialCount": 0,
  "flipsPerTrial": 100,
  "leadingRun": false,
  "delayMs": 100
}
    </app-state>
  </iframe-app>
</p>


## What You're Looking At

Each click of **Run Trial** (or each tick of **Play**) generates one
independent sequence of `flipsPerTrial` fair-coin flips and records the
longest heads-run that occurred in the sequence. The bar at that bucket goes
up by one. Over many trials the empirical histogram fills in toward the
**theoretical outline** — the closed-form distribution of the longest
heads-run in `n` flips.

The **current trial run** below the controls visualizes the longest-run from
the most recent trial as a row of *H* cells — useful when you're stepping
trial-by-trial and want to see the sample that just landed in the histogram.

The three **mean lines** overlaid on the histogram — *arithmetic*,
*geometric*, *harmonic* — sit at the running means of the positive samples.
They wobble early on and stabilize as the trial count grows. The **harmonic
mean** sits left of the others, because the harmonic mean weights small
samples more heavily — exactly the behavior that makes it the right
estimator when small longest-runs would otherwise pull a cardinality
estimate up. That's the punchline of HyperLogLog; this figure is where the
intuition starts.


## How To Play

 - **Run Trial** advances one trial manually. The histogram, the current-trial
   run, and the running means update in lockstep.
 - **Play / Pause** runs the auto-trial loop at the **delay** (clamped to ≥ 1 ms).
   At small delays the histogram swarms; at large ones each trial reads cleanly.
 - **Reset** clears all accumulated trials and re-seeds the PRNG to the
   *current* seed, so the same experiment plays out the same way every time.
 - **Flips / trial** changes `n`. Changing it resets the experiment — a
   different `n` is a different distribution.
 - **Leading run only** toggles between two experiments:
   - *off* — record the longest run anywhere in the sequence (the natural
     "longest streak" question).
   - *on* — record only the *initial* run of heads (stops at the first
     tails). This is the experiment that LogLog-family estimators actually
     measure on hashed inputs, so toggling this flag is a preview of sim #4.

   Toggling resets the experiment for the same reason flips/trial does.
 - **Seed** is shown in the header for reproducibility. Reload the page and
   you land on the exact same trajectory.


## What The Math Says

For `n` flips of a fair coin the probability that the longest heads-run is
at most `k` is approximately

```
P(longest ≤ k in n flips)  ≈  (1 - 1/2ᵏ)ⁿ
```

so the probability that the longest run is exactly `k` is the difference of
that expression at `k` and `k - 1`. Multiply by the number of trials and
you get the expected count in each bucket — the theoretical outline you see
on the figure.

For the **leading-run** variant the math is exact rather than asymptotic:
the probability of exactly `k` consecutive heads followed by a tails is
`1/2ᵏ⁺¹` (which is also `½ᵏ × ½`). The bars converge fast since each trial
has a clean closed form per outcome.

The three running means come straight from the samples — every trial whose
longest-run was positive contributes to all three. They are the same three
means that LogLog (1985), Probabilistic Counting with Stochastic Averaging
(Flajolet & Martin, 1985, refined 2003), and HyperLogLog (Flajolet et al.,
2007) consider as candidates for combining per-bucket estimates. HLL's key
insight is that the **harmonic** mean is the right one for this family of
estimators; this sketch is where you can see, by eye, why it sits where it
does.


> **For Developers** — the rest of the page covers how the Application is
> assembled.


## How It's Built

A single Application in the same shape as the single-trial
[`coin-flip`](../coin-flip/) sim. The deterministic-replay persistence pattern
is the same; the histogram class is the same shape with a small extension
(overlaid mean lines); the run-vector visual is the same. Both sims will
share these once the shared-kit extraction milestone lands — see
[`simulations/Plan.md`](../Plan.md).

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Identity, advertised command surface, app-state runtime opt-in |
| [`src/index.html`](charmiq://./src/index.html) | Figure scaffold — controls, readout, current-trial run, histogram, mean legend, caption |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Paper-figure tokens (Palatino body, Gill Sans labels, hairline frame, restrained palette) and sim-specific styles |
| [`src/simulator.ts`](charmiq://./src/simulator.ts) | `MultiTrialSimulator` with a Mulberry32 PRNG; `runTrial()` / `reset()` / `replay()`. Maintains running arithmetic / geometric / harmonic means as O(1) per trial |
| [`src/theory.ts`](charmiq://./src/theory.ts) | Closed-form longest-run distribution scaled by trial count; leading-run variant uses the exact `1/2ᵏ⁺¹` formula |
| [`src/run-vector.ts`](charmiq://./src/run-vector.ts) | Bespoke SVG row of *H* cells — the current trial's longest run |
| [`src/histogram.ts`](charmiq://./src/histogram.ts) | Two-series SVG histogram with optional overlaid mean lines (autoscaled y-axis, no D3) |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point — wires the auto-trial loop, persists `{ seed, trialCount, flipsPerTrial, leadingRun, delayMs }` to `appState`, advertises the command surface |


### Persistence

State persists as `{ seed, trialCount, flipsPerTrial, leadingRun, delayMs }`.
On reload the simulator re-seeds, applies the saved parameters, and
**replays** that many trials against the deterministic PRNG to rebuild the
full distribution and running means — the experiment doesn't lose history
across page loads, and the persisted blob never grows past five values.

The PRNG stream is shared across trials, and *both* trial modes (longest-run
and leading-run) advance the stream by exactly `flipsPerTrial` steps per
trial. That keeps the same `{seed, trialCount, flipsPerTrial}` pair
deterministic regardless of which mode the trials were run in — though
toggling the mode does reset the experiment, since the histogram for the
other mode would not be correct.

Reloads always come back **paused** — opening a paper figure shouldn't
immediately start animating.


### Composability

Every interactive control on the figure is also a command. An agent can:

 - call `setSeed({ seed: 42 })` to fix the trajectory before screenshotting,
 - call `setFlipsPerTrial({ n: 200 })` followed by `setLeadingRun({ enabled: true })`
   to set up the leading-run experiment exactly,
 - call `runTrial()` in a loop and read back the snapshot per trial, or
 - call `setDelay({ ms: 1 })` followed by `play()` to fast-forward toward
   `MAX_TRIAL_COUNT = 4000`.


## Deviations From The Original

A few intentional changes against the 2012 original:

 - **Dropped "Collapse Trials"** — the original had a modulo-based bucket
   reuse mode whose scaling math the author flagged with `CHECK: why?`. It
   confused the basic message and is gone.
 - **Deterministic PRNG** — the original used `Math.random()`. This version
   uses Mulberry32 seeded from `appState`, which is the price of admission
   for an embedded figure that should look the same every time it's loaded.
 - **Leading-run theory is exact** — the original used the same approximate
   `(1 - 1/2ᵏ)ⁿ` formula for both modes. The leading-run variant has an
   exact closed form (`1/2ᵏ⁺¹`); the new version uses it.


## Credit

This is a re-implementation of the *Coin Flip — Multiple Trials* sketch from
the **AK Tech Blog** post [*"Sketch of the Day: Probabilistic Counting with
Stochastic Averaging (PCSA)"*][ak-pcsa-post] (Aggregate Knowledge, Inc.,
October 2012, Apache-2.0). The closed-form distribution and the choice of
the three-mean overlay are inherited from the original; the visual
conventions (Palatino body, Gill Sans axes, 1px hairline frame, the
categorical palette) are the house style for every figure in this catalog.

[ak-pcsa-post]: https://research.neustar.biz/2012/10/25/sketch-of-the-day-probabilistic-counting-with-stochastic-averaging-pcsa/
