# Simulations

*Interactive figures in the spirit of a science paper or textbook — small,
self-contained Applications that illustrate a single idea well enough to be
embedded in a long-form post.*

These are distinct from `demos/` (which exist to stretch the platform's legs
and show what an Application can do). A simulation is *expository content
built on top of the platform*: the math is the point, the platform is just the
canvas.

The first wave is a re-incarnation of a series of Monte Carlo sketches
originally published on the **AK Tech Blog** between 2012 and 2013, ported
from D3 v2/v3 + raw `<script>` blobs into TypeScript Applications with proper
command surfaces and persisted state. Where it makes sense, the modern
versions add a `setSeed` command for reproducibility — the difference between
an illustration and a toy.


## The Catalogue

| Application | Originally | Subject |
|----|----|----|
| [`coin-flip`](./coin-flip/) | [*"Sketch of the Day: Probabilistic Counting with Stochastic Averaging (PCSA)"*][ak-pcsa-post], 2012 | Distributions of heads-runs in fair coin flips — the foundation behind the LogLog family |


## A Note on Provenance and Licensing

The originals were published by **Aggregate Knowledge, Inc.** (later acquired
by Neustar) under the **Apache License, Version 2.0**.

Each Application in this directory is a **re-implementation**, not a port —
new TypeScript, new visualization code, new command surface. The new code is
covered by this repository's [MIT license](../LICENSE). Where a simulation
draws on math or aesthetic choices from the original, the per-app `README.md`
credits the source.


## House Style

These read as *figures in a paper*, not as application UIs. Every simulation
in this directory shares the same visual conventions:

 - **Type** — Palatino / Cambria serif body, "Gill Sans" / Inter sans for axes
   and small captions
 - **Frame** — a 1px hairline border (`#DDD`) around the figure with restrained
   internal padding; a caption slot below
 - **Palette** — the d3 v1 default categorical (`#1f77b4`, `#9467bd`,
   indianred, `#bcbd22`, …) for the textbook feel; theoretical overlays
   distinguished by stroke, not by hue
 - **Light only** — figures render on a fixed light background even when the
   surrounding document is in dark mode. The aesthetic doesn't survive
   inversion

These tokens live alongside the first simulation while the catalog is small.
When a second simulation arrives the shared bits will lift into
[`charmiq-apps/shared/`](../shared/).

[ak-pcsa-post]: https://research.neustar.biz/2012/10/25/sketch-of-the-day-probabilistic-counting-with-stochastic-averaging-pcsa/
