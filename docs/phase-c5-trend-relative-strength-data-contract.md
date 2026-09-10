# Phase C.5 — Trend & Relative Strength Data Contract

Status: **RESOLVED / IMPLEMENTED (raw signal computation only)** — both
formulas approved and implemented as pure, synthetic-tested functions:
Primary Trend (`computeDma200Slope`, `src/domain/signals/trend.ts`) and
Relative Strength (`computeRelativeStrength`,
`src/domain/signals/relative-strength.ts`), plus supporting types
(`DerivedTrendSignal`/`RelativeStrengthData` in
`src/types/market-data.ts`) and the new `Strategy.benchmarkInstrumentId?`
field. Both lookback windows (20/63 trading days) live in
`RULESET.technical.trend`/`relativeStrength`. Still no provider chosen,
no API integrated, no 0–100 normalization, no `Scorecard`/stance/
action-zone wiring — see the *Implementation note* after §4 and
`docs/VALIDATION_PROTOCOL.md`-style summary below for exactly what
changed and what remains open.

Ran informed by `docs/VALIDATION_PROTOCOL.md`'s spirit, matching
`docs/phase-c0-market-data-contract.md`'s own delivery pattern (a design
document, not a code checkpoint) — there is nothing to PASS/FAIL yet.

Goal: define the provider-independent data contract needed to eventually
implement spec §14's two still-deferred dimensions — **Primary Trend**
(25%) and **Relative Strength** (20%) — without implementing either
formula in code yet. See
`docs/validation/c4-momentum-score-normalization-report.md` for why they
were deferred out of Phase C.4.

## 1. What was inspected

- `src/types/market-data.ts` — `DataField<T>`, `RawQuote`, `OhlcvBar`,
  `FxRate`, `RawMarketData`, `DerivedTechnicalSignals`.
- `src/domain/market-data/freshness.ts` — `evaluateFreshness`,
  `FreshnessPolicy`, `FreshnessResult<T>`.
- `src/domain/signals/momentum.ts` / `momentum-score.ts` — how DMA50/
  DMA200/RSI/relative volume are computed and normalized, and how `price`
  was added as an explicit `scoreMomentum` parameter in the C.4 resolution
  (the precedent this document follows for trend/relative-strength too).
- `src/domain/portfolio/target-position.ts` — `StrategyAlignment =
  "ALIGNED" | "CONFLICTING" | "NOT_APPLICABLE"`, the precedent reused
  below for relative strength's "not configured" vs. "configured but
  unavailable" distinction.
- `src/types/playbook.ts` — `Strategy` (already has several optional,
  strategy-specific fields: `coreSharesMin`/`coreSharesMax`,
  `preferredTargetWeightPct`), the precedent for where a benchmark
  identifier would live.
- `docs/playbook-decision-engine-spec-v0.1.md` §14 — the only spec text
  for these two dimensions is the dimension names/weights themselves,
  plus one illustrative line ("price > rising 200DMA → constructive") for
  Primary Trend. Relative Strength has no formula or example at all in
  the spec.

## 2. Design principles carried forward, unchanged

Everything decided in `docs/phase-c0-market-data-contract.md` and its
C.1–C.4 implementations still applies and is not re-litigated:

- Missing is a state, never a zero/placeholder value (`DataField<T>`).
- Freshness is derived on demand (`evaluateFreshness`), never stored
  alongside a value.
- Derived indicators are computed internally from raw OHLCV — never
  accepted as provider-supplied source of truth (so trend/relative
  strength must be computed from raw price series here too, not fetched
  as a pre-packaged "trend score" from a provider).
- New inputs a scoring function needs are passed explicitly (the C.4
  precedent: `price` was added as `scoreMomentum`'s own parameter, not
  smuggled into `DerivedTechnicalSignals`) — trend and relative strength
  follow the same pattern, not a `DerivedTechnicalSignals` field.

## 3. Primary Trend

### Data required

Primary Trend needs to know whether the 200DMA (spec's own example
anchor — "rising 200DMA") is itself rising or falling — i.e. its **slope
over time**, not just its current value. `DerivedTechnicalSignals.dma200`
(Phase C.3) is a single point-in-time snapshot; it cannot answer this by
itself.

**Raw market-data layer — unchanged.** `RawMarketData.ohlcv` already
supports "as much daily history as the provider returns" (§4) — no new
raw type or field is needed. The only requirement is that enough history
is actually supplied: to compute a DMA200 slope over a lookback of `L`
trading days, the OHLCV series needs at least `dma200Period + L` bars
(200 for the "current" DMA200 window, plus `L` more so the SAME
computation can also be run ending `L` bars earlier).

**Derived-signals layer — one new type.** Rather than compute the
"current DMA200" and "DMA200 as of L days ago" as two separate ad hoc
values, the natural implementation reuses `momentum.ts`'s existing
`simpleMovingAverage`-style logic run against two different suffixes of
the same `ohlcv` array (`ohlcv` itself for "current", and
`ohlcv.slice(0, ohlcv.length - L)` for "L days ago") — no new raw
plumbing, just calling the existing machinery at two cutoffs. The result
is a NEW, separate type (kept apart from `DerivedTechnicalSignals` for
the same reason `MomentumScoreResult` was kept separate from `ScoreItem`
in C.4 — minimal blast radius on an already-shipped, tested type):

```ts
// Implemented as designed — src/types/market-data.ts.
export interface DerivedTrendSignal {
  dma200Slope: DataField<number>;
  // dma50Slope is a possible secondary/faster confirmation signal —
  // deferred; not required to make a first Primary Trend reading
  // computable, and adding it now would be speculative scope.
}
```

**MISSING semantics — same rule as DMA50/DMA200, applied to both
windows.** `dma200Slope` is MISSING if either the "current" 200-bar
window or the "L-days-ago" 200-bar window has fewer than 200 bars, or any
close within EITHER window is itself MISSING — no partial computation,
no skipping past a missing bar, exactly the existing DMA rule (Phase
C.3), just applied twice (once per window).

**`asOf` propagation.** The most recent bar's date — same convention as
every other derived field (the indicator is only as current as its
newest input).

**Lookback period.** `L` (the number of trading days the slope is
measured over) is a config parameter, not a magic number, and not itself
a "multiple legitimate conventions" fight the way RSI's smoothing method
was — it is a window-length choice, the same category of decision as
`relativeVolumeWindow` (Phase C.3). **Approved v0.1 hypothesis: 20
trading days (~1 calendar month)** — matching this contract's own
`relativeVolumeWindow` default and giving a "has the trend meaningfully
shifted in about a month" reading; not an empirically validated value.
Implemented at `RULESET.technical.trend.dma200SlopeLookbackDays`.

**"Trend persistence"** (how many consecutive periods the slope has held
the same sign) was named as a candidate in the brief but is NOT included
in the v0.1 data contract above — it would need a full historical slope
SERIES (slope-of-slope, effectively), a materially heavier data
requirement than a single current-vs-L-days-ago comparison. Noted as a
possible v0.2+ refinement if a single slope reading proves too noisy in
practice; not designed further here (would be speculative scope for a
dimension that isn't implemented at all yet).

**Formula — RESOLVED, approved 2026-09-10.** Percentage change of DMA200
over the lookback above:

```text
trendSlope = (DMA200_current / DMA200_lookbackAgo) - 1
```

Implemented as `computeDma200Slope` in `src/domain/signals/trend.ts`,
reusing `momentum.ts`'s `simpleMovingAverage` at two array cutoffs exactly
as designed above (no new raw plumbing). Produces a **continuous, raw**
trend signal only — how it normalizes into a 0–100 momentum sub-score is
explicitly NOT decided by this resolution, and how it should interact
with the already-implemented `structure` component (independent scoring
vs. some blend) remains open (see §8).

Documented as a v0.1 standardization choice, not a scientifically optimal
model — same framing as Relative Strength's resolution below and spec
§24's confidence weights.

## 4. Relative Strength

### Data required

Relative Strength needs the stock's price performance compared against a
**benchmark's** price performance over some window — an entirely
different instrument's data, not derivable from the stock's own OHLCV at
all.

**Benchmark identifier — a `Strategy` field, never hardcoded.** Per "no
provider-specific benchmark symbols," the actual benchmark (an index
ticker, an ETF, whatever) is a per-strategy configuration concern, not
generic domain logic — the same principle already applied to
`coreSharesMin`/`coreSharesMax`/`preferredTargetWeightPct`. **Implemented:**
`Strategy.benchmarkInstrumentId?: string` (`src/types/playbook.ts`),
deliberately absent for any strategy that doesn't configure one (Relative
Strength is then structurally `NOT_APPLICABLE` for that strategy, not
`MISSING` — see below). Domain logic contains no literal benchmark symbol
anywhere (no test fixture uses a real index/ETF ticker either), mirroring
the B.5.7 finding that no Unity-specific literal exists in generic
decision logic.

**Benchmark OHLCV/close series — reuse `RawMarketData` as-is.** No new
raw type is needed: a benchmark's data is just another `RawMarketData`
fetch, keyed by whatever `instrumentId` the strategy's
`benchmarkInstrumentId` names. `RawMarketData` is already fully generic
(§4) — it doesn't know or care whether the instrument it describes is a
tradeable position or a comparison benchmark.

**Aligned dates — explicit date-string matching, not index-based.**
A stock and its benchmark may trade on different exchanges with different
holiday calendars (this app already tracks a NYSE-listed stock against a
EUR-based portfolio — cross-market data is the normal case here, not an
edge case) — so "the Nth bar back" in one series is not safely assumed to
be the same calendar date as "the Nth bar back" in the other. For a
comparison window of `W` trading days ending at the stock's most recent
bar date `D_end`:

1. Look up the stock's close at `D_end`, and the benchmark's close at the
   SAME date `D_end` (exact string match on `OhlcvBar.date`) — if the
   benchmark has no bar dated `D_end`, this window is unusable.
2. Determine `D_start` = the stock's own bar date `W` bars back in the
   stock's series. Look up the benchmark's close at that SAME date
   `D_start` — if absent, this window is unusable.
3. `stockReturn = (stockClose[D_end] - stockClose[D_start]) / stockClose[D_start]`
4. `benchmarkReturn = (benchmarkClose[D_end] - benchmarkClose[D_start]) / benchmarkClose[D_start]`

No nearest-date fallback, no interpolation across a gap — the same "no
invented data" rule already governing DMA/RSI/relative volume. If any of
the four required closes (stock@D_end, stock@D_start, benchmark@D_end,
benchmark@D_start) is missing, that window's comparison is MISSING in
full, not partially estimated.

**Return-comparison window — SINGULAR in v0.1, config-driven, no
multi-window blend.** Resolved (see *RESOLVED* below): v0.1 uses exactly
one configured aligned window, not several combined together. **Approved
v0.1 hypothesis: 63 trading days (~1 quarter)** — a common single-window
choice when a convention isn't blending multiple horizons; not an
empirically validated value. Implemented at
`RULESET.technical.relativeStrength.comparisonWindowTradingDays`.

**Missing/misaligned-data behavior — three explicit states, not two.**
Reusing `target-position.ts`'s existing `StrategyAlignment` pattern
(`ALIGNED`/`CONFLICTING`/`NOT_APPLICABLE`) rather than inventing a new
one:

```ts
// Implemented as designed — src/types/market-data.ts.
export type RelativeStrengthData =
  | { status: "NOT_APPLICABLE" } // Strategy.benchmarkInstrumentId not configured
  | { status: "MISSING" }        // benchmark configured, but this window's data didn't align
  | {
      status: "AVAILABLE";
      benchmarkInstrumentId: string;
      windowTradingDays: number; // sourced from RULESET at call time — see above
      asOf: string;              // D_end — the window's end date, for freshness evaluation (see §6)
      stockReturn: number;       // (stockEnd / stockStart) - 1
      benchmarkReturn: number;   // (benchmarkEnd / benchmarkStart) - 1
      relativeStrength: number;  // stockReturn - benchmarkReturn — see RESOLVED below
    };
```

`NOT_APPLICABLE` (no benchmark configured at all) is deliberately
distinct from `MISSING` (a benchmark IS configured, but this window's
dates didn't align, or the benchmark's data couldn't be obtained) — a
caller needs to be able to tell "this strategy doesn't use relative
strength" apart from "relative strength should be available but isn't
right now," the same distinction `NOT_APPLICABLE` already draws for
`StrategyAlignment` when no core range is configured. The `MISSING`
branch deliberately carries no partial payload (no half-filled
`stockReturn`/`benchmarkReturn`) — matching `MomentumComponentResult`'s
existing MISSING shape (Phase C.4): MISSING means MISSING, not "some
fields present, some absent."

### RESOLVED — Relative Strength formula: return differential (v0.1)

**Approved 2026-09-09.** Of the four conventions the initial design
identified (return differential, return ratio, price-ratio-slope,
multi-window blend), **return differential** is the v0.1 choice:

```text
stockReturn      = (stockEnd / stockStart) - 1
benchmarkReturn  = (benchmarkEnd / benchmarkStart) - 1
relativeStrength = stockReturn - benchmarkReturn
```

using the single configured aligned window and exact date-string
alignment already specified above (`stockStart`/`stockEnd` and
`benchmarkStart`/`benchmarkEnd` are the four aligned closes from that
algorithm — `stockEnd`/`benchmarkEnd` at `D_end`, `stockStart`/
`benchmarkStart` at `D_start`).

**Interpretation:**

```text
relativeStrength > 0   the stock outperformed the benchmark over the window
relativeStrength = 0   the stock matched the benchmark
relativeStrength < 0   the stock underperformed the benchmark
```

**Explicitly a v0.1 standardization choice, not a scientifically optimal
model** — the same framing spec §24 already applies to its own confidence
weights ("these weights are hypotheses"). Return ratio, price-ratio-slope,
and multi-window blending remain legitimate alternative conventions
(recorded, not deleted, in case a future phase revisits this); none is
claimed to be mathematically superior to return differential here — it
was chosen for being the simplest, most directly interpretable form of
"outperformance" (a plain percentage-point gap), not because the
alternatives were found lacking. Explicitly ruled out for v0.1 per this
resolution, not merely deferred: return-ratio formula, price-ratio-slope
formula, multi-window blending.

**Implemented** as `computeRelativeStrength` in
`src/domain/signals/relative-strength.ts` (2026-09-10), matching this
formula and the alignment algorithm above exactly.

## 5. Where each piece of data belongs

| Data | Layer | Notes |
|---|---|---|
| Extended-history OHLCV (stock) | Raw market-data | No new type — `RawMarketData.ohlcv` already supports arbitrary history depth; only the REQUIRED depth increases (200 + lookback, instead of just 200). |
| Benchmark OHLCV/close series | Raw market-data | Reuses `RawMarketData` verbatim, fetched under the benchmark's own `instrumentId`. |
| `Strategy.benchmarkInstrumentId` | Strategy config (not raw market data) | Per-strategy, never hardcoded — **implemented** in `types/playbook.ts`. |
| `dma200Slope` | Derived-signals | `DerivedTrendSignal` (**implemented**, `types/market-data.ts`), computed internally from the stock's own extended OHLCV via `computeDma200Slope` (`src/domain/signals/trend.ts`) — never provider-supplied. |
| `RelativeStrengthData` (incl. `relativeStrength`, the return-differential result) | Derived-signals | **Implemented** (`types/market-data.ts`), computed internally from the stock's + benchmark's raw OHLCV via `computeRelativeStrength` (`src/domain/signals/relative-strength.ts`) — never provider-supplied. |
| Trend/relative-strength SCORES (0–100, weighted into the overall momentum blend) | Momentum-score input | **Not implemented yet** — same pattern as `price` in Phase C.4 — explicit function parameters to a future `scoreMomentum` (or a dedicated trend/RS scoring function), not folded into `DerivedTechnicalSignals`, not part of `EngineInput`. |

`EngineInput`/`runDecisionEngine` are untouched by this design, same as
every prior C-phase checkpoint — this data stays entirely outside the
deterministic engine boundary until a future, separate wiring decision.

## 6. Freshness

Unchanged. Neither `DerivedTrendSignal.dma200Slope` nor
`RelativeStrengthData`'s `AVAILABLE` branch stores its own freshness —
each carries only its value(s) plus an `asOf` (the most recent
contributing bar's date; for `RelativeStrengthData`, the window's end
date `D_end`), evaluated on demand via the existing `evaluateFreshness`
exactly like every other `DataField` in this contract. `stockReturn`/
`benchmarkReturn`/`relativeStrength` are plain numbers inside the
`AVAILABLE` branch, not individually `DataField`-wrapped — their
presence is already implied by that branch (the same pattern
`MomentumComponentResult`'s `AVAILABLE` branch already uses for
`score100`/`weight` in Phase C.4) — but the single `asOf` on that branch
is enough for a caller to run `evaluateFreshness` against the whole
reading. No new freshness concept is introduced.

## 7. Explicit non-goals of this checkpoint (as of the C.5 implementation pass, 2026-09-10)

- No API provider chosen, evaluated, or called; no benchmark data fetched
  — `computeRelativeStrength`/`computeDma200Slope` are pure functions
  over already-fetched, synthetic `OhlcvBar[]` fixtures only.
- No 0–100 normalization for either dimension — both produce a
  continuous, raw signal only (`dma200Slope`/`relativeStrength`), exactly
  as instructed.
- No change to the existing momentum-score weights
  (`RULESET.technical.momentum` untouched) and no wiring of either new
  signal into `scoreMomentum`, `Scorecard`, stance, or action zones.
- No HC-004/HC-005, no confidence model.

## 8. Open design questions / decision needed

1. **Primary Trend's formula shape is approved (§3), but how it should
   interact with the already-implemented Structure component** —
   independent scoring vs. some blend (a rising 200DMA plus `price >
   dma50 > dma200` is a stronger signal than either alone) — is not
   decided.
2. **Exact lookback/window values remain v0.1 hypotheses, not empirically
   validated** — Primary Trend's 20-trading-day slope lookback and
   Relative Strength's 63-trading-day comparison window are both
   implemented in `RULESET` exactly as approved, but neither is claimed
   to be optimal; revisiting either is always available without touching
   any calling code (both are single config values).
3. **Single benchmark vs. multiple** — this design scopes v0.1 to exactly
   one configured benchmark per strategy (`benchmarkInstrumentId?:
   string`, singular). Supporting multiple benchmarks (e.g. a sector ETF
   AND a broad index) is a straightforward future extension of the same
   pattern, not designed or implemented here since nothing in the brief
   asked for it.
4. **How `dma200Slope`/`relativeStrength` (both continuous, unbounded-in-
   principle raw signals) normalize into 0–100 momentum sub-scores** —
   Phase C.4's anchor-interpolation pattern is the obvious candidate
   (same as RSI/relative volume/price extension), but no anchor values
   are proposed for either here — this checkpoint resolves and implements
   the *raw* formulas only, not their normalization curves, which belong
   with a future momentum-score wiring step.

Both formula conventions (§3, §4) are resolved and implemented as of this
pass — nothing about the raw-signal computation itself remains an open
question.

## 9. Recommended next step

Both raw signal computations are done (`computeDma200Slope`,
`computeRelativeStrength`, 2026-09-10) — data contract, formula, and
implementation all settled for §3 and §4. The natural next step is
normalization: design 0–100 anchor curves for `dma200Slope` and
`relativeStrength` (same pattern as Phase C.4's RSI/relative-volume/
price-extension anchors), decide how Primary Trend should interact with
the existing Structure component, and only then extend `scoreMomentum`
(or a dedicated function) with these two as new, explicit parameters —
mirroring exactly how `price` was added in the C.4 resolution. Wiring
into `Scorecard`, stance, or action zones remains a separate, later step
regardless, consistent with every prior C-phase checkpoint's scope
boundary.
