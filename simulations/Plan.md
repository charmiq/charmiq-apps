# Simulations Plan

*The catalog is a pedagogical arc, not an anthology. Each sim earns its slot
by teaching exactly one idea that the next sim builds on. The originals were
written in this order for a reason — we preserve that spine, reshuffle where
modern rendering makes a step redundant, and fold the two that don't fit the
arc into their own branches.*


## The Arc

```
coin-flip ──┬── coin-flip-multiple-trials      (variance reduction / LLN)
            │
            └── fringe-bitmaps ── pcsa ── hll ── js-hll
                 (bitmap intuition)  (full sketch)  (harmonic mean)  (set ops)

kmv ── kmv-stochastic-averaging                 (parallel sketch family — order statistics)

frugal-sketch                                   (separate family — streaming quantiles)
```

The **main trunk** is `coin-flip → fringe-bitmaps → pcsa → hll → js-hll`. It is
the LogLog story told end to end: a single coin teaches you that the longest
run of heads estimates `log₂(n)`; bitmaps teach you that a hashed stream does
the same thing in parallel; PCSA packages it into a sketch; HLL refines the
estimator; js-hll puts two of them next to each other to compute unions and
intersections.

The **KMV branch** (min-hash / order statistics) is a parallel sketch family
with a very different mechanic — it deserves its own two-step mini-arc rather
than being wedged into the trunk.

The **Frugal branch** is about streaming quantiles, not cardinality. It shares
the house style and the aesthetic but is not pedagogically continuous with the
rest; it's a standalone figure.


## Catalogue

| # | Application | Subject | Status | Reuses | Notes |
|---|----|----|----|----|----|
| 1 | [`coin-flip`](./coin-flip/) | One fair coin; distribution of runs + longest run | **done** | — | Establishes house style, PRNG, persistence |
| 2 | `coin-flip-multiple-trials` | N independent runs of n flips; longest-run distribution converges | planned | coin-flip's simulator + histogram | First test of the *shared kit* — see Milestone A |
| 3 | `fringe-bitmaps` | Hashed-stream → bitmap visualization of leading zeros | planned | Jenkins hash, bit-vector visual | Bridge from coin-flip intuition to sketch mechanics |
| 4 | `pcsa` | Full PCSA sketch: hash → bitmap register → cardinality estimate | planned | hash, bit-vector visual, histogram | The first real sketch |
| 5 | `hll` | HyperLogLog: longest-run register bank + harmonic-mean estimator | planned | hash, register-bank visual | Refinement of PCSA — same inputs, better estimator |
| 6 | `js-hll` | Two HLLs side by side; union / intersection via Venn + table | planned | `js-hll-1.0.0.js` port, Venn visual, table | Milestone C: typed port of the HLL impl |
| 7 | `kmv` | K minimum values; estimate via the k-th smallest hash | planned | hash, sorted-list visual | Parallel branch; new visuals |
| 8 | `kmv-stochastic-averaging` | KMV + register partitioning — same trick HLL uses | planned | kmv's simulator + histogram | Shows the partitioning trick is sketch-family-agnostic |
| 9 | `frugal-sketch` | Frugal Streaming: quantile estimate with O(1) memory | planned | trajectory plot | Standalone; different family |

Out of scope: `chord.html` in the originals is a chord-diagram loader, not a
probabilistic-sketch sim. It doesn't belong in this catalog.


## Milestones

**Milestone A — Shared kit (after sim #2).** Once `coin-flip-multiple-trials`
lands, lift the bits that both sims need into
[`charmiq-apps/shared/`](../shared/):

- **Paper-figure tokens** (`_paper.scss`) — the `--sketch-*` CSS vars currently
  local to [coin-flip/src/styles.scss](./coin-flip/src/styles.scss).
- **`Histogram`** — two-series SVG histogram. Already general; moves as-is.
- **`RunVector`** — bespoke `H`-cell row. Moves as-is.
- **`Mulberry32`** PRNG + reset/replay pattern — small but reused.

We deliberately didn't do this up-front — it's easier to extract once we have
two callers to validate the shape.

**Milestone B — Hash + bit-vector visuals (sim #3).** `fringeBitmaps.html`
introduces two things the trunk reuses: the Jenkins hash from
`specs/ak-blog/kmv/blog-util.js`, and the per-hash bit-vector visual from
`blog-chart.js`. Both become shared modules the moment sim #3 lands —
`pcsa` and `hll` will both want them.

**Milestone C — HLL implementation port (sim #6).** `js-hll-1.0.0.js` is ~1200
lines of 2013-era JS implementing the HLL sketch (registers, folding, unions,
Cliff Click's estimator). Port it to typed ESM as `shared/hll.ts` when sim #5
(`hll`) needs it — sim #6 (`js-hll`) then composes two instances for the
set-ops figure.

**Milestone D — Venn + set-ops table (sim #6).** `jshll.html` has a non-trivial
custom Venn renderer (`blog-venn.js`) plus a scrolling result table
(`ListTable.js` + `FakeScroller.js`). The scroller is a workaround for 2013
browser limitations — modern CSS `overflow-y: auto` replaces it for free. The
Venn renderer we keep; it's the whole visual point of the sim.


## Open Decisions

**Which HLL source — `kmv/hll.html` or `hll/hyperloglog.html`?** The originals
have two. Expect one to be an earlier draft. Diff them when we get to sim #5;
take whichever has the cleaner register-bank visual and harmonic-mean estimator.

**Does `frugal-sketch` earn a slot in `simulations/`?** It shares the visual
house style but not the pedagogical spine. Leaning yes — it's still an
expository figure built on the same platform conventions, and splitting it off
into its own directory would be premature for a single orphan. Revisit if a
second streaming-quantile sim appears.

**Does `coin-flip-multiple-trials` still carry weight given what sim #1
already shows?** The original coin-flip already draws the longest-run
distribution in one panel. The "multiple trials" sim adds trial-to-trial
variance — watching the empirical distribution fill in one bar per trial. Keep
it: the pedagogical beat *"now run it many times and see the distribution
emerge"* is worth a dedicated figure, and it's the cheapest sim in the
catalog to build.
