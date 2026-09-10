# Phase C.4 — Momentum Score Normalization

Status: RESOLVED / COMPLETE (design + implementation, unwired)

Scope: normalizes `DerivedTechnicalSignals` (Phase C.3) plus an explicit
current price into a Scorecard-compatible momentum reading. No provider/
API integration, no wiring into `signals.ts`/`Scorecard`/
`runDecisionEngine`/stance/action zones, no HC-004/HC-005, no confidence
model. See `docs/VALIDATION_PROTOCOL.md` for method/format;
`docs/playbook-decision-engine-spec-v0.1.md` §14 (Technical/Momentum
Engine) and `docs/phase-c0-market-data-contract.md` §9 for the rules this
implements.

Ran in two passes: an initial pass covering RSI and Relative Volume only
(stopped before Structure/Price Extension, pending a decision on how to
source current price — see *Resolution* below), then a resolution pass
implementing Structure and Price Extension once that decision (Option A —
extend the input, not redefine the terminology) was made.

## Resolution — Option A (current price as explicit input)

**Decision:** extend `scoreMomentum`'s signature to take current price as
an explicit second parameter — `scoreMomentum(signals:
DerivedTechnicalSignals, price: DataField<number>)` — rather than (a)
shipping a narrower `dma50`-vs-`dma200`-only proxy under the "Structure"
name, or (b) leaving Structure/Extension unimplemented indefinitely.
`price` uses the same `DataField<number>` wrapper as every other value in
this contract; the function only knows about the `DataField` it's handed,
not about `RawQuote`, providers, or how the price was obtained — keeping
provider/API concerns entirely outside this layer, unchanged from the
standing rule established in Phase C.0.

## Implemented — all 4 computable spec §14 dimensions

| Dimension | Spec weight | Status |
|---|---|---|
| Momentum/RSI | 10% | **Complete** (Phase C.3 formula, C.4 normalization) |
| Volume Confirmation | 15% | **Complete** (Phase C.3 formula, C.4 normalization) |
| 50DMA/200DMA Structure | 20% | **Complete** (this pass) |
| Price Extension | 10% | **Complete** (this pass) |
| Primary Trend | 25% | **Deferred** — see below |
| Relative Strength | 20% | **Deferred** — see below |

- **RSI** — anchor-normalized (spec §11-style piecewise-linear
  interpolation), operationalizing spec's own prose: constructive 50–70,
  discounted for extension risk above 80, never inverted so oversold (<30)
  reads as bullish.
- **Relative Volume** — anchor-normalized around a 1.0 = neutral baseline.
- **50DMA/200DMA Structure** — spec's actual, price-relative definition:
  classifies `(price, dma50, dma200)` into one of the 6 possible
  real-number orderings (2 of the 8 raw true/false combinations of
  price-vs-dma50/price-vs-dma200/dma50-vs-dma200 are mathematically
  impossible by transitivity), each scored via a symmetric,
  named-case lookup table (`RULESET.technical.momentum.structureAnchors`).
  Requires `price` + `dma50` + `dma200` all AVAILABLE.
- **Price Extension** — spec's own ratios, `(price-dma50)/dma50` and
  `(price-dma200)/dma200`, each normalized via the same hump-shaped anchor
  curve (modest positive extension constructive, large extension
  discounted for mean-reversion risk — same reasoning as RSI's extension
  handling), then averaged with equal weight. Requires the same three
  inputs as Structure; MISSING either DMA or price fails the whole
  component (no partial computation from just one ratio).

## Deferred — Primary Trend, Relative Strength

Explicitly **not implemented**, and not approximated:

- **Primary Trend (25%)** — requires trend/slope history (e.g. whether the
  200DMA is itself rising), which is not represented anywhere in
  `DerivedTechnicalSignals` (a point-in-time snapshot, not a time series of
  past DMA values). Needs a new data-contract step that adds historical
  DMA tracking before this can be scored.
- **Relative Strength (20%)** — requires a benchmark/index comparison; no
  benchmark data exists anywhere in this codebase. Needs a new
  data-contract step that adds benchmark data before this can be scored.

Both remain genuine, reportable data gaps, not silently folded into the
other four weights or invented via a substitute signal.

## Output shape, weighting, and MISSING handling

Unchanged in kind from the initial pass, extended to 4 components:

- `MomentumScoreResult` is a new, additive, local discriminated union
  (`SCORED` with a real `ScoreItem` + full component breakdown, or
  `INSUFFICIENT_DATA` + breakdown) — `ScoreItem`/`SignalState`
  (`src/types/playbook.ts`) were not modified; they have no way to
  represent "insufficient evidence," and extending them was judged
  out-of-scope (blast radius into already-validated Phase B/UI code).
- Component weights are spec §14's own literal percentages for these four
  dimensions (10/15/20/10, summing to 55, used as-is — the blend formula
  renormalizes over whichever components are AVAILABLE, so the raw
  percentages don't need to be pre-normalized to sum to 1).
- `minimumAvailableWeightShare = 0.5` (unchanged) — a proportional gate,
  so it scales naturally now that there are 4 dimensions instead of 2: any
  single component alone, or any component-pair not including Structure,
  falls short (structure+extension always travel together and total 30%
  of defined weight); any combination including Structure, or any 3-of-4
  combination, clears it.
- Every one of the 4 components always appears in `components[]`,
  AVAILABLE or MISSING, in both the `SCORED` and `INSUFFICIENT_DATA`
  branches — component-level visibility is never lost, even when the
  overall gate fails.

## Tests

`npx vitest run` — **239/239 passing** (27 in
`src/domain/signals/momentum-score.test.ts`: all 6 Structure orderings
individually verified against spec's own example, Price Extension's
dual-ratio averaging and MISSING-either-DMA behavior, RSI's non-inverted
oversold/discounted-overbought behavior, the minimum-evidence gate
re-verified across multiple 4-component combinations — including the
coupled structure+extension availability this pass introduced —
component-level visibility in both branches, and determinism).
`npx tsc --noEmit` clean. `npx eslint` clean on all changed files. No
Phase B, C.1–C.3, or shared-type file behavior changed.

## Is the current 4-dimension momentum score sufficient for v0.1 scoring?

**Sufficient as what this checkpoint actually is — a standalone,
unwired, honestly-scoped normalization module — not yet sufficient as a
complete picture of spec §14's original "momentum" concept.**

In favor: 4 of 6 dimensions (55% of spec's original weight) are
implemented using spec's actual semantics, not approximations; the
minimum-evidence gate prevents a thin, low-confidence reading from being
reported as a real score; component-level visibility means no
contradiction is hidden; and — critically — this module is **not wired
into anything yet**, so no live Decision Engine output currently depends
on its completeness.

Against: Primary Trend and Relative Strength together represent 45% of
spec's original weighting — nearly half. Relative Strength in particular
(20%, tied with Structure) is arguably one of the more important
dimensions for a concentration-risk-aware single-stock tool, since it's
the only spec-defined dimension that distinguishes "this stock is moving"
from "this stock is moving *relative to the market*." A `SCORED` result
from only 4 dimensions is real and honestly computed, but it is not the
full spec §14 picture, and should not be presented (in a future UI or
wiring step) as if it were.

**Recommendation:** treat this as sufficient to *continue building on*
(e.g., proceed to design how `MomentumScoreResult` eventually reaches
`Scorecard.momentum`), but before it is wired into stance/action zones or
shown to a user as "the momentum score," either (a) prioritize a future
data-contract step for Primary Trend and/or Relative Strength, or (b)
make sure any consuming UI/wiring is explicit that this is a 4-of-6-
dimension reading, not the complete spec §14 model.
