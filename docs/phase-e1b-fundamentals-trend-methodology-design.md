# Phase E.1B — Fundamentals Trend Methodology Design

Status: **RESOLVED (design only)** — no application code changed. All
three candidate methods are legitimate in the abstract, but once
evaluated against this checkpoint's own criteria and fundamentals'
realistically sparse quarterly cadence, one dominates on every axis but
raw noise-averaging — and even that advantage doesn't materialize at
the data depth this app actually has. Not a MODEL DECISION REQUIRED
stop; see §5 for why.

## 0. What was read

- `docs/phase-e0-fundamentals-evidence-contract-design.md` §3.1 — the
  exact standing gap this checkpoint closes: *"Growth Trend/Margin
  Trend need multiple periods and are genuinely derived signals...
  computed by a dedicated function (not sketched further here; exact
  trend metric — e.g. slope of consecutive growth rates — is
  implementation detail for a later checkpoint)."* §3.3's Balance Sheet
  precedent (metric resolved, anchors explicitly not invented) is the
  template this document follows for the same reason.
- `src/domain/signals/fundamentals.ts` (Phase E.1A) — `computeRevenueGrowth`
  and `computeOperatingMargin`, the two already-approved, already-tested
  functions this design composes rather than duplicates. Confirmed
  their exact MISSING/boundary behavior (5-period minimum for revenue
  growth — current + same-quarter-4-back; division-by-zero guarded) —
  directly relevant to §2's periods-required analysis below. Also
  re-read this file's top-of-file doc comment, which already named
  Growth Trend/Margin Trend as explicitly unimplemented and why.
- `src/domain/signals/trend.ts` (Phase C.5) — the **directly analogous
  prior resolution**, both in shape and in spirit: spec's own "Primary
  Trend" dimension (momentum's, not fundamentals') was resolved as
  *"percentage change of DMA200 over a configurable lookback"* —
  `trendSlope = (DMA200_current / DMA200_lookbackAgo) - 1` — a plain
  two-point ratio over a fixed lookback window, computed by calling the
  same underlying function (`simpleMovingAverage`) at two different
  array cutoffs rather than duplicating averaging logic. Notably, this
  was chosen **despite `ohlcv` typically holding hundreds of daily
  bars** — far more than the 2–4 points this checkpoint is asked to plan
  around — meaning even with abundant data available, this project
  already chose the simplest two-point method over an average or
  regression fit for its one existing "trend" dimension. This is strong,
  directly on-point precedent, not just an analogy.
- `docs/playbook-decision-engine-spec-v0.1.md` §11 — reconfirmed (again)
  that "Growth Trend 10%" and "Margin Trend 10%" are named only as
  weighted line items; no formula, no worked example, no anchors exist
  for either anywhere in the spec (same grep result as E.0 §3.3's
  Balance Sheet finding).

## 1. What "Growth Trend" and "Margin Trend" trend over — stated explicitly, not assumed

Before comparing methods, the input series each trend operates on must
be fixed, since spec never states this either:

- **Growth Trend** trends the *already-computed* Revenue Growth rate
  (`computeRevenueGrowth`'s own YoY output) across consecutive
  quarters — **not** the raw revenue level. Trending raw revenue would
  just re-derive a coarser version of Revenue Growth itself (duplicate
  evidence, which `docs/PHASE-D-INTEGRATION-GUIDE.md` §3 explicitly
  warns against — "do not introduce duplicate scoring models"); trending
  the *growth rate* answers a genuinely different question ("is growth
  accelerating or decelerating"), which is what "Growth Trend" as a
  named dimension, sitting alongside Revenue Growth in spec's own
  table, must mean for it to carry independent information.
- **Margin Trend** trends Operating Margin (`computeOperatingMargin`'s
  own per-period output) across consecutive quarters — analogous
  reasoning, and the more literal reading of the name in any case
  (nothing else "margin" could plausibly refer to here).

Both are therefore trends *of an already-derived per-period metric*,
not of a raw balance-sheet/income-statement field — this is what makes
composing the existing E.1A functions (§2) possible without
duplicating their internal logic.

## 2. Candidate methods, compared

### 2.1 Option 1 — latest minus previous value (two-point delta)

```text
marginTrend  = operatingMargin(current period)   - operatingMargin(previous period)
growthTrend  = revenueGrowth(current period)      - revenueGrowth(previous period)
```

Where "current"/"previous" for **Margin Trend** are simply the last two
entries of `periods` (sequential, one quarter apart) — needs only 2
periods total. For **Growth Trend**, "current"/"previous" are two
*already-YoY* growth-rate readings one quarter apart — since
`computeRevenueGrowth` itself needs 5 periods (current + the same
quarter 4 back) to produce one reading, computing it twice (once at the
full `periods` array, once at `periods` with the last entry dropped)
needs **6 periods total**, not 2. This asymmetry is a direct, honest
consequence of Growth Trend building on an already-YoY dimension while
Margin Trend builds on a raw per-period one — not an inconsistency to
paper over.

- **Interpretability:** high. "Margin expanded 2.3 points"/"growth
  accelerated from 12% to 18%" (a +6pp move) is immediately legible to
  a retail user with no statistics background — directly usable by the
  spec §30 AI Explanation layer without translation.
- **Behavior with 2–4 quarterly observations:** Margin Trend is
  computable from as few as 2 quarters. Growth Trend needs 6 — with
  only 2–4 quarters of real history (plausible for a recently-listed or
  thinly-covered company), Growth Trend reports `MISSING` honestly,
  never a fabricated or partial value. This is a real, disclosed
  limitation of this option, not solved away here (§4).
- **Sensitivity to one noisy quarter:** highest of the three options —
  a single unusual quarter (one-off charge, timing shift) fully
  determines one side of the delta. This is Option 1's one genuine
  weakness.
- **Missing-data behavior:** simplest and most robust of the three —
  exactly 2 (or, for Growth Trend, 6) specific periods must have their
  specific required fields `AVAILABLE`; failure is a single, easily
  explained `MISSING`, with no window-integrity ambiguity.
- **Consistency with the deterministic/transparent architecture:**
  high — trivially auditable (two numbers, one subtraction), and
  matches `trend.ts`'s own already-approved precedent exactly.

### 2.2 Option 2 — multi-period average / slope

E.g. "average of the trailing N quarter-over-quarter deltas."

- **Interpretability:** medium — "the average quarterly margin change
  over the last 4 quarters was +0.8pp" is understandable but less
  immediately concrete than a single before/after comparison, and
  quietly asks the reader to trust an averaging window they can't see.
- **Behavior with 2–4 observations:** with exactly 2 observations this
  degenerates to Option 1. With 3–4, it can only average 2–3 delta
  terms — not meaningfully smoother than Option 1 at this depth, while
  costing real implementation/explanation complexity for it.
- **Sensitivity to one noisy quarter:** lower than Option 1, but *only*
  once enough periods exist for averaging to actually smooth anything —
  a benefit that doesn't materialize until well past the 2–4-quarter
  regime this checkpoint is explicitly asked to plan around.
- **Missing-data behavior:** more fragile than Option 1 — per this
  codebase's established "no partial computation" convention (§4.1 of
  the momentum precedent, reused throughout E.1A), an N-quarter average
  requires an *unbroken run* of N+1 consecutive `AVAILABLE` periods; one
  gap anywhere in the window fails the whole average, not just one
  comparison. Real-world reporting gaps make this meaningfully more
  likely to report `MISSING` than Option 1.
- **Consistency with the architecture:** medium — still deterministic,
  but introduces a second free parameter (window length `N`) beyond
  what Option 1 already needs, for a smoothing benefit that isn't
  available at the data depth this app realistically has per
  instrument.

### 2.3 Option 3 — linear regression / trend fit

E.g. OLS slope of margin (or growth rate) vs. period index over the
trailing N quarters.

- **Interpretability:** low for this product — "the regression slope
  of margin over the trailing 8 quarters is 0.6" is not something a
  retail user, or the spec §30 AI Explanation layer translating "why
  this stance" for one, can intuitively sanity-check the way a
  two-number before/after comparison can.
- **Behavior with 2–4 observations:** with exactly 2 points, an OLS
  slope is *mathematically identical* to Option 1's delta (divided by
  spacing) — all the added complexity buys nothing. With 3–4 points, a
  fitted line has very low degrees of freedom and high variance — less
  trustworthy than just comparing two representative points, not more.
- **Sensitivity to one noisy quarter:** with this few points, one
  outlier (e.g. 1 of 4) still dominates the fit — regression's
  noise-averaging advantage requires substantially more observations
  than fundamentals data realistically offers per instrument here.
- **Missing-data behavior:** most fragile of the three — a well-posed
  regression needs either evenly-spaced periods or explicit date-aware
  handling of gaps, neither of which this codebase's `DataField`/
  "no partial computation" conventions currently model; would require
  genuinely new, unprecedented missing-data design, not a reuse of
  anything already established.
- **Consistency with the architecture:** low-to-medium — every other
  derived signal in this codebase (DMA, RSI, relative volume, DMA200
  slope, relative strength) is a closed-form ratio or average, never a
  fitted regression. Introducing one here would be the first
  statistically-fitted signal in the domain layer, a materially
  different and less auditable kind of computation than anything this
  checkpoint's own "deterministic/transparent" evaluation criterion is
  asking to preserve.

## 3. Comparison summary

| Criterion | Option 1 (2-point delta) | Option 2 (multi-period avg) | Option 3 (regression) |
|---|---|---|---|
| Interpretability | High | Medium | Low |
| Works at 2–4 quarters | Margin: yes. Growth: needs 6 (disclosed limitation, not this option's fault) | Degenerates to Option 1, or worse | Degenerates to Option 1, or statistically weak |
| Noisy-quarter sensitivity | Highest (real weakness) | Lower, but benefit absent at this data depth | Lower, but benefit absent at this data depth |
| Missing-data robustness | Simplest, most robust | More fragile (unbroken-window requirement) | Most fragile (needs new gap-handling design) |
| Architecture consistency | Matches existing precedent exactly | Adds a free parameter for no realized benefit | First fitted/statistical signal in the domain layer |

## 4. Resolution — Option 1, adopted for both dimensions

```text
marginTrend = operatingMargin(current period) - operatingMargin(previous period)

growthTrend = revenueGrowth(current period) - revenueGrowth(previous period)
```

Both defined as pure composition of the already-approved E.1A functions
evaluated at two adjacent array cutoffs — the same technique
`trend.ts` already established for `computeDma200Slope`
(`simpleMovingAverage` called twice, once on the full array and once on
a shorter prefix), not a new pattern:

```ts
// illustrative, not implemented (E.1B is design only)
function computeMarginTrend(periods: RawFundamentalsPeriod[]): DataField<number> {
  const current = computeOperatingMargin(periods);
  const previous = computeOperatingMargin(periods.slice(0, -1));
  if (current.status === "MISSING" || previous.status === "MISSING") return { status: "MISSING" };
  return { status: "AVAILABLE", value: current.value - previous.value, asOf: current.asOf };
}

function computeGrowthTrend(periods: RawFundamentalsPeriod[]): DataField<number> {
  const current = computeRevenueGrowth(periods);
  const previous = computeRevenueGrowth(periods.slice(0, -1));
  if (current.status === "MISSING" || previous.status === "MISSING") return { status: "MISSING" };
  return { status: "AVAILABLE", value: current.value - previous.value, asOf: current.asOf };
}
```

MISSING propagates automatically — no new missing-data mechanism is
introduced; `slice(0, -1)` re-evaluating an already-tested function is
the entire "previous" computation. Minimum history: Margin Trend needs
2 periods; Growth Trend needs 6 (§2.1) — both a direct, honest
consequence of composing already-approved functions, not a new design
choice made here.

**Lookback spacing** (one quarter, sequential) is deliberately chosen
over a full-year YoY-of-YoY comparison, for three reasons: (a) it needs
meaningfully less history (6 vs. 9 periods for Growth Trend), (b) it
answers a more immediately actionable question — "is growth
accelerating *this quarter*," not "compared to a year ago" — matching
what a tactically-timed evidence dimension should measure, and (c) it
mirrors `trend.ts`'s own choice of a short, configurable lookback
(`RULESET.technical.trend.dma200SlopeLookbackDays`) over a longer one.
The exact lookback (here, implicitly "1 quarter") should itself be a
versioned `RULESET` value when implemented, not a hardcoded literal —
consistent with every other lookback in this codebase — but choosing
"1 quarter" as the v0.1 default is a data-shape/cadence choice in the
same non-controversial category as `trend.ts`'s own lookback default,
not a fresh model fork.

## 5. Why this is not a MODEL DECISION REQUIRED stop

All three options are individually legitimate methods in the abstract —
this is not a case of one option being obviously wrong. What resolves
it without a stop is that, once evaluated against **this checkpoint's
own stated criteria** and fundamentals' actual data depth (2–4, or at
best a handful more, quarterly observations per instrument), Option 1
dominates on every axis except noisy-quarter sensitivity — and Options
2/3's theoretical advantage on that one axis specifically requires more
observations than this app realistically has per instrument, so it
never actually materializes here. This mirrors how the FCF-as-raw-
dollars question (E.0's own table) and the Balance Sheet metric formula
(E.0 §3.3, resolved directly from an explicit instruction) were each
resolved without a stop: the comparison was asked for to make the
reasoning explicit and reviewable, not because the outcome was assumed
close. Contrast with the archetype-model fork (E.0 §5) or the RSI
convention (Phase C.3), where multiple options were each fully
defensible on identical criteria with no dominant choice — genuine
ties, which is what actually required a stop there.

## 6. Explicit non-goals of this design

- No 0–100 scoring anchors for Growth Trend or Margin Trend — per
  instruction, not defined here. Spec gives none for either dimension
  (same grep result as Balance Sheet's, §0), so none are invented; this
  leaves both dimensions in the same "evidence resolved, scoring not"
  state Balance Sheet is already in after E.0 §3.3.
- No change to `computeRevenueGrowth`/`computeOperatingMargin`
  themselves (E.1A, unchanged) — this design only composes them.
- No new raw fields on `RawFundamentalsPeriod`/`RawFundamentalsData` —
  both trend functions are computable entirely from data already
  defined there.
- No Scorecard/engine/stance/action-zone wiring.
- No code written — every snippet above is illustrative, matching every
  prior design-only checkpoint in this phase.

## 7. Recommended next step

An E.1C implementation checkpoint would be mechanical: add
`computeGrowthTrend`/`computeMarginTrend` to
`src/domain/signals/fundamentals.ts` exactly as sketched in §4, plus
focused tests mirroring E.1A's own style (normal computation; MISSING
current-period inputs; MISSING previous-period inputs; the
history-length boundary — Margin Trend at exactly 2 periods vs. 1;
Growth Trend at exactly 6 periods vs. 5). This still leaves Growth
Trend, Margin Trend, and Balance Sheet all without scoring anchors —
three of seven `GROWTH_SOFTWARE_TEMPLATE` dimensions remain evidence-
only, unscoreable, honestly so, until a dedicated anchor-calibration
checkpoint resolves them (not assumed to be this one).
