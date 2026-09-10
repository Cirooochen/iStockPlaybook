# Phase C.6 — Primary Trend & Relative Strength Normalization Design

Status: **APPROVED AND IMPLEMENTED (2026-09-10)** — see
`docs/validation/c6-momentum-normalization-report.md` for the
implementation report (anchors, weights, `scoreMomentum` signature,
`MomentumEvidenceCoverage`, and full test results). Every proposal below
was implemented without deviation. Still no `Scorecard`/stance/
action-zone wiring, no API work.

Ran informed by `docs/VALIDATION_PROTOCOL.md`'s spirit, matching the
delivery pattern of `docs/phase-c0-market-data-contract.md` and the
initial (design-only) pass of
`docs/phase-c5-trend-relative-strength-data-contract.md` — a design
document, nothing to PASS/FAIL yet. **Stops for review before
implementation, per instruction.**

Goal: design transparent 0–100 normalization for the two raw signals
implemented in Phase C.5 — `trendSlope` (`computeDma200Slope`,
`src/domain/signals/trend.ts`) and `relativeStrength`
(`computeRelativeStrength`, `src/domain/signals/relative-strength.ts`) —
so that, once approved, they can be wired into `scoreMomentum`
(`src/domain/signals/momentum-score.ts`) as two more components,
completing all six of spec §14's original dimensions.

## 1. What was inspected

- `src/domain/signals/momentum-score.ts` — the existing anchor-
  interpolation pattern (`interpolateAnchors`), `toScoreItem`'s 0–100 →
  1–10 display conversion, `MomentumComponentResult`/`MomentumScoreResult`,
  and the weight-redistribution/minimum-evidence-gate math this design
  must extend, not replace.
- `src/config/ruleset-v0.1.ts`'s `technical.momentum` block — the four
  existing weights (`rsiWeight: 0.10`, `relativeVolumeWeight: 0.15`,
  `structureWeight: 0.20`, `priceExtensionWeight: 0.10`,
  `minimumAvailableWeightShare: 0.5`) and anchor tables (`rsiAnchors`,
  `relativeVolumeAnchors`, `priceExtensionAnchors`) — the exact pattern
  this design follows for the two new dimensions.
- `src/domain/signals/trend.ts` / `relative-strength.ts` — the shape and
  typical magnitude of the two raw signals being normalized here
  (`dma200Slope`: a 20-trading-day percentage change in a 200-day moving
  average, inherently slow-moving; `relativeStrength`: a 63-trading-day
  return-differential percentage, inherently faster-moving than a
  200DMA).
- `src/domain/portfolio/target-position.ts` — `StrategyAlignment`'s
  three-state pattern, reused again here for how `NOT_APPLICABLE`
  differs from `MISSING` in the weight math (§4/§6).
- `docs/validation/c4-momentum-score-normalization-report.md` and
  `docs/phase-c5-trend-relative-strength-data-contract.md` — prior
  decisions this design must stay consistent with (spec §14's weights,
  the "do not blend Structure with price" precedent now mirrored as "do
  not blend Trend with Structure").

## 2. Design principles carried forward, unchanged

- Missing is a state, never a zero/placeholder value.
- Freshness stays separate (not touched by this design at all).
- Anchor-based piecewise-linear interpolation, clamped outside the
  anchor range — the established normalization method (spec §11,
  reused for RSI/relative volume/price extension in Phase C.4).
- All thresholds are documented v0.1 hypotheses, not scientifically
  optimal values — same framing as spec §24's confidence weights.
- Component-level visibility is never lost — every defined dimension
  appears in `components[]`, whatever its status.

## 3. Primary Trend normalization

`trendSlope` is a percentage change of a 200-day moving average over a
20-trading-day lookback (Phase C.5) — a genuinely slow-moving quantity
(DMA200 barely moves day to day by construction), so its typical range is
narrow compared to, say, price extension.

### Alternatives considered

1. **Fixed anchor-interpolation on raw `trendSlope`** — the same
   piecewise-linear method already used for every other dimension. Pro:
   fully consistent with the established pattern, requires no new data,
   continuous (no boundary "cliffs"). Con: fixed absolute percentage
   thresholds don't adapt to a given stock's own typical volatility (a
   1% DMA200 move might be large for a low-beta utility and small for a
   high-beta growth name) — a known, accepted v0.1 simplification, not
   fixed here.
2. **Discrete sign/magnitude tiers** (e.g. STRONGLY_FALLING / FALLING /
   FLAT / RISING / STRONGLY_RISING, each a fixed score) — the same
   discrete-lookup style already used for Structure. Pro: simple,
   directly nameable. Con: unlike Structure (which classifies a genuinely
   discrete 6-case ordering of three comparisons), `trendSlope` is
   naturally continuous — bucketing it would introduce artificial
   boundary jumps (0.999% and 1.001% scoring very differently) that
   continuous interpolation avoids. Rejected for that reason.
3. **Volatility-normalized thresholds** (anchors expressed as multiples
   of the stock's own historical slope variability, e.g. "z-score" style,
   rather than fixed percentages) — the most statistically principled
   option, directly addressing alternative 1's stated weakness. Rejected
   for v0.1: it requires NEW data this contract does not have (a
   historical distribution/variance of past `dma200Slope` readings, not
   just the current one) — an additional data-contract extension, out of
   scope for a normalization-only design step. Worth revisiting once (if
   ever) that history is tracked.

### Recommendation: Option 1 — fixed anchor-interpolation

Proposed anchors (v0.1 hypothesis, symmetric around a neutral 50 at
`trendSlope = 0`):

```text
trendAnchors:
  -0.05  ->  10   (200DMA fell ~5% in 20 trading days — a sharp
                    deterioration for such a slow-moving average)
  -0.01  ->  35
   0.00  ->  50   (flat — broadly neutral evidence)
  +0.01  ->  65
  +0.05  ->  90   (200DMA rose ~5% in 20 trading days — a strong,
                    still-plausible reading for this quantity)
```

Clamped outside `[-0.05, +0.05]` to the nearest anchor's score (10/90) —
satisfies "avoid unbounded score growth" directly: no `trendSlope`
magnitude, however extreme, pushes the score past 10 or 90.
Monotonic, NOT hump-shaped — unlike RSI/Price Extension's deliberate
"extension risk" tempering (a stretched price position carries
mean-reversion risk), a strongly rising 200-day trend has no analogous
"too good" ceiling in this design; the brief's own requirements here
("stronger positive evidence should score higher") call for a
straightforwardly monotonic curve, not a peaked one.

## 4. Relative Strength normalization

`relativeStrength` is a return-differential percentage over a
63-trading-day (~quarter) window — a naturally larger-magnitude,
faster-moving quantity than `trendSlope` (individual stocks routinely
diverge from a benchmark by double-digit percentage points over a
quarter), so its anchors need a wider domain.

### Alternatives considered

1. **Fixed anchor-interpolation on raw `relativeStrength`** — direct
   analog to Primary Trend's Option 1, same trade-offs.
2. **Volatility/benchmark-normalized thresholds** — same rejection as
   Primary Trend's Option 3 (needs data this contract doesn't carry).
3. **Sign-only (outperform/match/underperform) scoring**, ignoring
   magnitude — e.g. three fixed scores regardless of whether
   outperformance was 2 points or 40 points. Rejected: this directly
   fails the brief's own requirement that "stronger positive evidence
   should score higher" — a 40-point outperformance and a 2-point
   outperformance are not equally strong evidence, and this option
   cannot distinguish them at all.

### Recommendation: Option 1 — fixed anchor-interpolation

Proposed anchors (v0.1 hypothesis, symmetric around a neutral 50 at
`relativeStrength = 0`, wider domain than Trend's — reflecting the
larger typical magnitude of a 63-day return differential versus a 20-day
DMA200 percentage change):

```text
relativeStrengthAnchors:
  -0.20  ->  10   (stock trailed the benchmark by 20 points over the
                    quarter — a strong underperformance signal)
  -0.05  ->  35
   0.00  ->  50   (matched the benchmark — broadly neutral evidence)
  +0.05  ->  65
  +0.20  ->  90   (stock led the benchmark by 20 points — a strong
                    outperformance signal)
```

Clamped outside `[-0.20, +0.20]`. Also monotonic, not hump-shaped, for
the same reason as Trend — "stronger outperformance is unambiguously
more constructive evidence" carries none of RSI/Extension's
mean-reversion caveat in this design.

## 5. Do not blend Trend with Structure

Explicitly preserved, per instruction: Primary Trend and 50DMA/200DMA
Structure remain **two independent components** in the weighted blend,
each with its own weight and anchor curve, never combined into one
joint reading before scoring. This is a different kind of "combination"
than what Structure already does internally (Structure combines THREE
raw comparisons — price-vs-dma50, price-vs-dma200, dma50-vs-dma200 —
into ONE component's score; that happens once, inside `scoreStructure`,
and is not revisited here). Trend and Structure are correlated signals
in practice (a rising 200DMA and a `price > dma50 > dma200` ordering
often co-occur) but are scored, weighted, and reported completely
separately — the same way RSI and Price Extension (both derived from
price/momentum) are already scored independently today, not merged.

## 6. Weight integration — completing the six-dimension model

Proposed weights (v0.1 hypothesis, spec §14's own literal percentages
for the two new dimensions — same "use spec's literal numbers, let the
blend renormalize" approach Phase C.4 already established):

```text
rsiWeight               0.10   (unchanged)
relativeVolumeWeight    0.15   (unchanged)
structureWeight         0.20   (unchanged)
priceExtensionWeight    0.10   (unchanged)
trendWeight             0.25   (new)
relativeStrengthWeight  0.20   (new)
                        ----
                        1.00
```

All six now sum to exactly 1.00 — spec §14's original weighting
(25+20+20+15+10+10=100%) is fully preserved for the first time since
Phase C.4 (which could only implement 4 of 6 and therefore only reached
55% of spec's total weight). `minimumAvailableWeightShare` (0.5) is
proposed UNCHANGED — still "at least half the total defined evidence,"
now measured against the full six-dimension total rather than the
partial 0.55 total C.4 used.

### MISSING vs. NOT_APPLICABLE — different treatment in the weight math

Primary Trend has no "opt-out" — every strategy attempts it, and it can
only be `AVAILABLE` or `MISSING` (insufficient OHLCV history), same
two-state shape as the four existing dimensions.

Relative Strength is different: it can be `NOT_APPLICABLE` (no
`Strategy.benchmarkInstrumentId` configured — a deliberate, structural
non-configuration) in addition to `MISSING` (a benchmark IS configured,
but this window's data didn't align — a genuine evidence gap) and
`AVAILABLE`. These two absent-states are proposed to affect the weight
math **differently**:

- **`MISSING` stays in the denominator**, exactly like every other
  dimension today: `totalDefinedWeight` is unchanged, so a `MISSING`
  Relative Strength reduces `availableWeightShare` — it represents a real
  evidence gap that should count against overall confidence, consistent
  with how a `MISSING` RSI or Volume Confirmation already behaves.
- **`NOT_APPLICABLE` is proposed to be EXCLUDED from the denominator
  entirely** for that scoring run: `totalDefinedWeight` would be
  recomputed as the sum of weights for every dimension that is not
  structurally not-applicable (i.e. `1.00 - relativeStrengthWeight =
  0.80` for a strategy with no configured benchmark). Rationale: a
  strategy that deliberately doesn't track a benchmark hasn't produced
  worse evidence than one that does — penalizing it the same way as a
  genuine data gap would permanently cap how much "evidence share" that
  strategy could ever reach, for a reason that has nothing to do with
  data quality. This mirrors `StrategyAlignment`'s existing
  `NOT_APPLICABLE` semantics (a no-core-range strategy isn't a *degraded*
  target-position strategy, it's a *different, equally valid* one).
- **Component-level visibility is preserved for `NOT_APPLICABLE` too** —
  `MomentumComponentResult`'s union would gain a third status
  (`{ key: "relativeStrength"; status: "NOT_APPLICABLE" }`) alongside
  `AVAILABLE`/`MISSING`, so `components[]` always reports all six
  dimensions' true state, matching the existing "never hide a
  contradiction, never hide an absence" principle.

Worked example (not implemented, illustrative only): a strategy with no
benchmark configured, all other 5 dimensions `AVAILABLE` — under this
proposal, `totalDefinedWeight = 0.80`, `availableWeight = 0.80`,
`availableWeightShare = 1.0` (the gate is fully satisfiable without ever
having Relative Strength — correct, since it's genuinely not part of
that strategy's evidence model). Contrast: a strategy WITH a benchmark
configured, but this window's alignment failed (`MISSING`) and all other
5 dimensions `AVAILABLE` — `totalDefinedWeight` stays `1.00`,
`availableWeight = 0.80`, `availableWeightShare = 0.80` (still clears the
0.5 gate here, but visibly and correctly short of 100% — a real,
reportable evidence gap, not a structural non-issue).

## 7. Explicit non-goals of this document

- No `RULESET` entries added (`trendAnchors`, `relativeStrengthAnchors`,
  `trendWeight`, `relativeStrengthWeight` are proposals only).
- No change to `scoreMomentum`, `MomentumComponentResult`,
  `MomentumComponentKey`, or the weight-redistribution/gate logic itself
  — the `NOT_APPLICABLE`-vs-`MISSING` distinction in §6 is a design
  proposal for a future implementation pass, not made in code here.
- No `Scorecard`/stance/action-zone wiring.
- No API work, no real benchmark/provider integration.
- Trend is not blended with Structure (§5) — two independent components.

## 8. Open design questions / decision needed

1. **Anchor values themselves** — both curves (§3/§4) are v0.1
   hypotheses; the exact breakpoints and their scores are not
   empirically validated and may need revisiting once real market data
   is available to check whether "typical" `trendSlope`/
   `relativeStrength` magnitudes match what these anchors assume.
2. **`NOT_APPLICABLE`-excluded-from-denominator proposal (§6)** — this is
   a genuine design choice, not dictated by any existing precedent beyond
   the `StrategyAlignment` analogy; worth explicit sign-off before
   implementation, since it changes how `totalDefinedWeight` is computed
   (from a fixed constant to something computed per scoring run).
3. **Volatility-normalized anchors** (Trend's Option 3, Relative
   Strength's Option 2) — rejected for v0.1 due to missing supporting
   data, not because they're wrong; a candidate for a future
   data-contract extension if fixed thresholds prove too blunt in
   practice.

## 9. Recommended next step

Not started here, per instruction — stop for review. Once §3/§4's anchor
proposals and §6's `NOT_APPLICABLE` weight-math proposal are approved,
implementation is a close analog of the Phase C.4 pattern: add
`trendWeight`/`relativeStrengthWeight`/`trendAnchors`/
`relativeStrengthAnchors` to `RULESET.technical.momentum`, extend
`MomentumComponentKey`/`MomentumComponentResult` for the two new
dimensions (plus `NOT_APPLICABLE` as a third status), extend
`scoreMomentum`'s signature with `trend: DataField<number>` and
`relativeStrength: RelativeStrengthData` parameters (mirroring how
`price` was added in C.4), and add synthetic tests covering both new
components' AVAILABLE/MISSING/NOT_APPLICABLE paths and the weight-gate
interaction described in §6. `Scorecard`/stance/action-zone wiring
remains a separate, later step regardless.
