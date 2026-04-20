# Coin Flip

*A Monte Carlo sketch of a fair coin: watch the empirical distribution of
heads-runs converge to its closed form, and the longest heads-run drift
upward as `log₂(n)`. The first figure in the LogLog / HyperLogLog
pedagogical arc — the moment when "how long is the longest run of heads?"
becomes a way to estimate cardinality.*


## The Sketch

<p style="text-align: center;">
  <iframe-app height="520px" width="640px" style="border: 1px solid #dddddd; vertical-align: top;" src="charmiq://.">
    <app-state>
{
  "seed": 1729,
  "steps": 0,
  "delayMs": 100
}
    </app-state>
  </iframe-app>
</p>


## What You're Looking At

A fair coin is flipped repeatedly. Each tails closes off whatever heads-run
was in progress and contributes one tally to the **Distribution of Runs**
histogram on the left. The **Distribution of Longest Run** on the right
tracks where the longest heads-run currently sits — it's a one-bar histogram
that drifts to the right as the experiment grows, overlaid against the
expected position of the longest run for the current flip count.

In both histograms the **filled bars** are the empirical counts and the
**outlined bars** are the closed-form theoretical curve for the current `n`.
The empirical bars wobble; the theoretical bars are exact. Watch them
collide as `n` grows — that convergence is the whole reason this estimator
works.

The number of cells in the **current run** vector is the streak in
progress; the **longest run** vector is the high-water mark. Fifteen cells
is the visual cap (any run that long would already give you a useful
cardinality estimate; there's no need to draw past it).


## How To Play

 - **Flip Coin** advances one step manually — useful for watching the run
   accounting fire on individual tails.
 - **Play / Pause** runs the auto-loop at the **delay** in milliseconds
   (clamped to ≥ 1). At small delays the histograms swarm; at larger ones
   you can read each event.
 - **Reset** clears all accumulated state and re-seeds the PRNG to its
   *original* seed — so the same experiment plays out the same way every
   time. Change the seed via the host (`setSeed`) if you want a different
   roll.
 - **Seed** is shown in the header for reproducibility. The displayed seed
   is what the platform persisted; reload the page and you land on the
   exact same trajectory.


## What The Math Says

For `n` flips of a fair coin, the expected number of *completed* heads-runs
of length exactly `k` is

```
E[runs of length k]  =  (1 + (n - k) / 2) / 2^k
```

(divide by `2` for the same reason a Bernoulli sequence has half as many
"closing tails" as flips). The expected longest heads-run grows as
`log₂(n)` — slowly enough that even at 4 000 flips you rarely cross 12.

The same observation, applied to *hashed* values rather than coin tosses,
is the engine behind LogLog (Durand & Flajolet, 2003) and HyperLogLog
(Flajolet et al., 2007): the longest run of leading zeros in a stream of
`k`-bit hashes estimates `log₂` of the number of distinct values seen.
This sketch is where that intuition starts.


> **For Developers** — the rest of the page covers how the Application is
> assembled.


## How It's Built

A single Application — no sibling discovery, no editor coupling. It
advertises a small command surface (`play` / `pause` / `step` / `reset` /
`setSeed` / `setDelay`) so it can be driven by an agent or a sibling
control panel without polling.

| File | Responsibility |
|----|----|
| [`manifest.json`](charmiq://./manifest.json) | Identity, advertised command surface, app-state runtime opt-in |
| [`src/index.html`](charmiq://./src/index.html) | Figure scaffold — controls, readout, run vectors, histograms, caption |
| [`src/styles.scss`](charmiq://./src/styles.scss) | Paper-figure tokens (Palatino body, Gill Sans labels, hairline frame, restrained palette) and sim-specific styles |
| [`src/simulator.ts`](charmiq://./src/simulator.ts) | Pure simulator with a Mulberry32 PRNG; `flip()` / `reset()` / `replay()` and a `Snapshot` for the renderers |
| [`src/theory.ts`](charmiq://./src/theory.ts) | Closed-form run-length and longest-run distributions, ported from the original `blog-math.js` |
| [`src/run-vector.ts`](charmiq://./src/run-vector.ts) | Bespoke SVG row of "H" cells — the current and longest run visuals |
| [`src/histogram.ts`](charmiq://./src/histogram.ts) | Two-series SVG histogram (empirical filled; theoretical outlined) with autoscaled y-axis |
| [`src/main.ts`](charmiq://./src/main.ts) | Entry point — wires the auto-flip loop, persists `{ seed, steps, delayMs }` to `appState`, advertises the command surface |


### Persistence

State persists as `{ seed, steps, delayMs }`. On reload the simulator
re-seeds and **replays** that many flips against the deterministic PRNG to
rebuild the full snapshot — the experiment doesn't lose history across
page loads, and the persisted blob never grows past three numbers.

Reloads always come back **paused**, regardless of whether the loop was
running when the page was unloaded. That matches reading expectations —
opening a paper figure shouldn't immediately start animating.


### Composability

Every interactive control on the figure is also a command. An agent can:

 - call `setSeed({ seed: 42 })` to fix the trajectory before screenshotting,
 - call `step()` in a loop to drive the experiment frame-by-frame and read
   back the snapshot after each flip, or
 - call `setDelay({ ms: 1 })` followed by `play()` to fast-forward toward
   `MAX_FLIP_COUNT = 4000`.

The same surface is what a sibling Application (a future "experiment
runner" panel, say) would use to drive multiple simulations in lockstep.


## Credit

This is a re-implementation of the *Coin Flip* sketch from the **AK Tech
Blog** post [*"Sketch of the Day: Probabilistic Counting with Stochastic
Averaging (PCSA)"*][ak-pcsa-post] (Aggregate Knowledge, Inc., October
2012, Apache-2.0). The closed-form distributions in
[`theory.ts`](./src/theory.ts) are ported directly from the original
`blog-math.js`. The "/2" and "/4" theoretical scaling factors and the
`t = 3` trial multiplier are preserved as the original sketch had them —
they're empirical fits the original authors flagged with `CHECK: why`.

The visual conventions — Palatino body, Gill Sans axes, 1px hairline
frame, the categorical palette — are also inherited. They're what makes
the figure read as *paper*.

[ak-pcsa-post]: https://research.neustar.biz/2012/10/25/sketch-of-the-day-probabilistic-counting-with-stochastic-averaging-pcsa/
