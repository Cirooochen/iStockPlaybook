# Phase E.1C — Fundamentals Normalization Model Design

Status: **RESOLVED (design only)** — no application code changed. The
§7 model decision is approved (**B2, refined** — monotonic-then-
plateau, never declining — see §7.1); §7.2 lists the remaining
calibration work before implementation. Every dimension is now either
fully resolved (spec-given, cited verbatim) or has its metric/shape
reasoned through with exact anchor numbers explicitly deferred, not
invented, consistent with the instruction not to silently invent
missing anchors.

## 0. What was read

- `docs/phase-e0-fundamentals-evidence-contract-design.md` — §3's
  dimension table, §3.3's Balance Sheet metric resolution
  (`netCashToRevenue`, anchors explicitly not invented, confirmed by
  grep that spec gives none), §5.1's `FundamentalsTemplate`/
  `FundamentalsComponentDefinition` shape this normalization model will
  eventually populate.
- `src/types/fundamentals.ts` / `src/domain/signals/fundamentals.ts`
  (Phase E.1A) — the exact already-implemented raw/derived functions
  this design scores: `computeRevenueGrowth`, `computeOperatingMargin`,
  `computeFreeCashFlow` (absolute dollar FCF — see §4 for why this is
  not what gets scored), `computeTrailingTwelveMonthRevenue`,
  `computeNetCashToRevenue`, `mapGuidanceEvidenceToScore` (spec §12's
  table, already fully implemented — not revisited here beyond
  confirming it needs no further normalization work, §3).
- `docs/phase-e1b-fundamentals-trend-methodology-design.md` (Phase
  E.1B) — Growth Trend/Margin Trend's approved derivation (§4 there):
  each a two-point delta of an already-derived metric (`revenueGrowth`/
  `operatingMargin`) one quarter apart, explicitly *not yet scored* —
  this checkpoint is the first to address their normalization.
- `docs/playbook-decision-engine-spec-v0.1.md` §11–§12 — re-confirmed by
  full re-read (not just grep this time): **only Revenue Growth has a
  spec-given anchor example**; §11's "Normalization" subsection states
  the general principle ("use bounded continuous normalization...
  interpolate between anchors") once, illustrated with Revenue Growth's
  numbers only — no anchor examples exist anywhere for Growth Trend,
  Operating Margin, Margin Trend, Free Cash Flow, or Balance Sheet.
  §12's Guidance mapping table is the only other dimension with a fully
  spec-given normalization (a lookup table, not an anchor curve — §3).
  §13 (Valuation Engine) separately defines "FCF yield" as a
  *valuation*-dimension metric, distinct from and not to be confused
  with Fundamentals' own Free Cash Flow dimension (§4.4).
- `src/domain/signals/momentum-score.ts` / `src/config/ruleset-v0.1.ts`
  — the reference normalization mechanism (`interpolateAnchors`,
  piecewise-linear, clamped at the domain's extremes) this design
  reuses unchanged, plus its own anchor-curve precedent, which is
  **mixed**, not uniform: `rsiAnchors`' breakpoints reference spec's
  own named thresholds (30/50/70/80) but the actual score values at
  them are this project's own documented hypothesis;
  `relativeVolumeAnchors` is explicitly "this contract's own explicit,
  documented v0.1 hypothesis, not a named industry-standard curve,"
  invented directly with no separate approval gate; `trendAnchors`/
  `relativeStrengthAnchors` are each marked "approved 2026-09-10,"
  implying an explicit sign-off step was used for those two
  specifically. §5's approach follows the stricter of these two
  existing patterns — explicit sign-off before any specific numbers
  exist — per this checkpoint's own instruction not to silently invent.

## 1. Method: metric first, normalization second — per dimension

Per instruction, each of the seven dimensions below is evaluated in two
separate steps that must not be conflated: **(1)** what raw/derived
metric is actually being scored (already settled for five of seven by
E.0/E.1A/E.1B; genuinely open only for Free Cash Flow, §4), and **(2)**
how that metric's value maps to 0–100 — reusing spec's anchors/mapping
verbatim where they exist (§2, §3), and otherwise reasoning about the
curve's *shape* (monotonic vs. hump vs. plateau — directly answering
this checkpoint's own "monotonicity" evaluation criterion) without
inventing the specific numbers that would only be needed to draw it.

## 2. Revenue Growth — fully resolved, spec-given

**Metric:** `computeRevenueGrowth` (E.1A) — already settled.

**Normalization:** spec §11's own worked example, cited verbatim, no
invention:

```text
<= -10% -> 0
  0%    -> 30
 10%    -> 50
 20%    -> 70
 30%    -> 85
>= 40%  -> 100
```

Interpolated via the existing `interpolateAnchors` mechanism, same as
every momentum anchor curve. No open question remains for this
dimension.

## 3. Guidance — fully resolved, spec-given (already implemented)

**Metric:** `GuidanceEvidence.{direction,magnitude}` (E.1A).

**Normalization:** spec §12's deterministic mapping table, already
implemented verbatim in `mapGuidanceEvidenceToScore` (E.1A) — not a
continuous anchor curve at all, a discrete lookup, and already complete.
Nothing further to design here; included for completeness against the
task's full seven-dimension list.

## 4. Free Cash Flow — metric choice resolved, anchors deferred (not invented)

### 4.1 The metric question, evaluated against the five criteria

E.1A's `computeFreeCashFlow` returns **absolute dollar FCF**
(`operatingCashFlow - capitalExpenditures`) — correct as a raw
*evidence* computation, but the task explicitly asks whether that is
the right thing to *score*. It is not:

| Candidate | Interpretability | Company-size independence | Growth-software relevance | Monotonicity | Noisy-quarter robustness |
|---|---|---|---|---|---|
| **Absolute FCF** (dollars) | Meaningless without a size reference on a shared 0–100 scale | **Fails** — no single anchor curve can sensibly score a $20M and a $2B company identically | High relevance in isolation, but unusable without normalization | Trivially monotonic, but the scale itself is meaningless | Same single-quarter volatility as any dollar figure, compounded by the scale problem |
| **FCF Margin** (FCF / revenue) | High — a standard, widely-quoted SaaS metric, directly comparable in format to Operating Margin | Strong — a ratio, same scale at any company size, matching every other v0.1 dimension except FCF itself | Very high — FCF margin is one of the most closely watched growth-software metrics specifically (accrual profit can mislead; FCF margin tells the cash story) | Monotonic (see §4.2) | Same single-quarter noise as Operating Margin — no worse than a dimension already accepted elsewhere in this template |
| **FCF Growth** (YoY change in FCF or margin) | Reasonable, but conceptually redundant | Fine if expressed as a rate | Moderate | Monotonic | **Worse** — a rate built from an already-volatile single-quarter figure compounds noise |
| **FCF Yield** (FCF / market cap or EV) | High in isolation | Strong | High | Monotonic | Comparable to margin |

**FCF Yield is excluded on a separate, structural ground, not a
criteria score:** spec §13 (Valuation Engine) already names "FCF yield"
as its own valuation dimension. Reusing it here would duplicate a
metric spec deliberately keeps in a different engine section —
`docs/PHASE-D-INTEGRATION-GUIDE.md` §3's "do not introduce duplicate
scoring models" applies directly. **FCF Growth is excluded because it
duplicates territory `docs/phase-e1b-fundamentals-trend-methodology-
design.md` already assigned to Growth Trend/Margin Trend** — spec's own
dimension list keeps "trend of X" and "X itself" as separate line
items; a Free Cash Flow dimension that is itself a growth rate would
blur that boundary spec draws elsewhere in the same table. **Absolute
FCF is excluded outright** — it fails company-size independence, one
of this checkpoint's own required evaluation criteria, not on a close
call but categorically.

**Resolved: FCF Margin (`computeFreeCashFlow(periods) / current
period's revenue`).** No stop needed — one candidate dominates on every
criterion or is excluded on independent structural grounds; this is the
same "clean dominance, no genuine tie" pattern §5 of E.1B already used
to resolve trend methodology without a stop.

This does not revise E.1A: `computeFreeCashFlow`'s dollar-figure
computation remains correct and reusable as-is — FCF Margin is one
small additional division on top of it (`computeFreeCashFlow(periods)`
÷ the current period's revenue), not a replacement.

### 4.2 Shape, reasoned (numbers not invented)

Monotonic — higher FCF margin means healthier cash generation, with no
natural "too high" penalty point the way RSI/Price Extension's
mean-reversion risk creates a hump. The plausible counter-argument
("very high FCF margin might mean under-investing in growth") is a real
consideration, but it is **already captured by this template's own
dedicated growth dimensions** (Revenue Growth, Growth Trend) — a
growth-software company sacrificing growth investment to inflate FCF
margin already scores worse on those two dimensions. Having FCF Margin
*also* penalize high values for the same underlying concern would
double-count it. This is not a genuine competing model, just a
consideration already resolved elsewhere in the template — no stop
needed for shape.

**No anchor numbers are proposed here** — spec gives none, and no
directly-analogous precedent (like Balance Sheet's, §7) exists to lean
on. Deferred to a dedicated calibration step (§9).

## 5. Operating Margin — metric resolved (E.1A), shape reasoned, anchors deferred

**Metric:** `computeOperatingMargin` — already settled, unchanged.

**Shape:** monotonic, for the identical reasoning as §4.2 — higher
margin is better, and the "under-investment" counter-argument is
already captured by the template's dedicated growth dimensions rather
than needing Operating Margin's own curve to penalize it. No genuine
fork; no stop.

**Anchors:** none exist in spec (confirmed §0); none invented here.

## 6. Growth Trend / Margin Trend — metric+derivation resolved (E.1B), shape reasoned, anchors deferred

**Metric:** each a two-point delta of an already-derived metric,
per E.1B — unchanged.

**Shape:** monotonic, symmetric around a neutral score at delta = 0 —
directly matching the shape momentum's own **Primary Trend**
(`trendAnchors`) and **Relative Strength** (`relativeStrengthAnchors`)
curves already use (§0): both are "monotonic... symmetric around a
neutral 50" per their own `RULESET` comments, for the same underlying
reason — acceleration/deterioration has no natural mean-reversion
ceiling the way RSI/Price Extension's *level* (not *trend*) does. A
"growth accelerating too fast is bad" counter-argument was considered
and set aside as speculative and non-standard, unlike Balance Sheet's
capital-efficiency counter-argument (§7), which reflects a mainstream,
well-documented investment debate — that distinction is why one gets a
stop here and these two don't.

**Anchors:** none exist in spec; none invented here. A future
calibration step can lean on `trendAnchors`/`relativeStrengthAnchors`
as a structural template (monotonic, symmetric, domain calibrated to
the metric's typical observed magnitude) without that itself resolving
the actual numbers, which depend on real data this design doesn't have.

## 7. Balance Sheet (`netCashToRevenue`) — RESOLVED (B2, refined)

**Metric:** `computeNetCashToRevenue` — already resolved (E.0 §3.3),
unchanged.

**The fork, evaluated against the five criteria:**

- **(B1) Monotonic** — higher `netCashToRevenue` is always scored
  better, no ceiling. Interpretability: high, simplest possible reading
  ("more net cash relative to revenue is safer"). Company-size
  independence: strong (a ratio). Growth-software relevance: reasonable
  — solvency/safety is a real concern for any archetype. Robustness to
  noisy quarters: same single-period volatility as any balance-sheet
  snapshot, unaffected by which shape is chosen.
- **(B2) Plateau / capital-efficiency-aware** — score rises with
  `netCashToRevenue` up to a reasonable buffer level, then flattens as
  originally framed here (a "mildly discounts further increases"
  wording appeared in this draft's first pass — superseded by §7.1's
  resolution, which explicitly forbids any decline; the approved shape
  is rise-then-flat only, never rise-then-fall). Reflects a real,
  mainstream investment-philosophy view: cash held meaningfully beyond
  a sensible operating buffer is undeployed capital (no buybacks, no
  reinvestment, no acquisitions) — a genuine capital-allocation
  critique long applied to large, cash-rich technology companies.
  Interpretability: slightly more nuanced to explain ("very high cash
  reserves are treated as merely healthy, not increasingly so"), but
  still a single, legible curve. Company-size independence and
  noisy-quarter robustness: identical to B1 (the shape doesn't change
  either property). Growth-software relevance: arguably higher than B1
  for this specific archetype, where capital is often better deployed
  into growth than held.

Unlike Operating Margin/FCF Margin (§4.2, §5), where the equivalent
"too much of this is actually bad" concern is already captured by the
template's separate growth dimensions, **nothing else in the
`GROWTH_SOFTWARE` template captures a capital-efficiency or cash-
deployment concept** — Balance Sheet is the *only* dimension that could
express it, so this concern cannot be dismissed as already handled
elsewhere the way it was for §4.2/§5. Both B1 and B2 are legitimate,
commonly-used investment lenses with no objectively dominant answer
from first principles, spec text, or existing precedent (unlike Growth
Trend/Margin Trend's shape, §6, where a directly on-point precedent —
`trendAnchors`/`relativeStrengthAnchors` — already exists). Per
`docs/PHASE-D-INTEGRATION-GUIDE.md` §12's definition, this is a genuine
**MODEL DECISION REQUIRED**, not resolved here.

**Smallest set of choices:**

1. **B1 — monotonic.** Simplest, smallest to specify and calibrate
   later; defers the capital-efficiency question entirely (a company
   with an extreme cash pile simply scores very well on this one
   dimension, for better or worse).
2. **B2 — plateau above a buffer threshold.** Captures a real,
   mainstream concern this template would otherwise have no way to
   express at all, at the cost of one additional calibration parameter
   (where the plateau begins) beyond what B1 needs.

Neither choice blocks anything else in this design — §2–§6 all stand
regardless of which is picked, and even B2's exact plateau threshold is
itself deferred numeric calibration, not resolved by choosing B2 over
B1.

## 7.1 RESOLVED — decision record (approved 2026-09-10)

**Decision: B2, refined.** Monotonic-then-plateau. Three properties are
now fixed, not left to future calibration to reinterpret:

1. **Rising region:** weaker balance sheets (low or negative
   `netCashToRevenue` — net debt exceeding cash) score lower; an
   improving net-cash buffer strictly increases the score.
2. **Plateau region:** once a healthy/strong buffer is reached,
   additional net cash produces **no further score increase** — flat,
   not diminishing.
3. **No decline, anywhere in the domain.** This is the one place where
   this decision **narrows** §7's original B2 framing: the earlier
   "mildly discounts further increases" wording (written before this
   resolution) is superseded — the curve must never slope negative at
   high `netCashToRevenue`. Excess cash is not penalized in v0.1; it
   simply stops earning additional score.

**Rationale, as directed — a scope boundary, not just a shape choice:**
Balance Sheet measures **financial resilience** (can this company
absorb a downturn, fund itself, survive stress) — not capital-
allocation efficiency (is management deploying cash optimally). Those
are two different, legitimate questions; v0.1 answers only the first
with this dimension. A future, separate model may assess inefficient
cash deployment (buyback discipline, reinvestment rate, etc.) — that is
explicitly not this dimension's job, and not attempted by giving it a
declining tail.

**Mechanism — no new normalization technique needed.** The existing
`interpolateAnchors` function (momentum's own, reused unchanged per §0)
already clamps to the outermost anchor's score for any input beyond it
— "clamped outside the anchor range to the first/last anchor's score,
never extrapolated further" (`momentum-score.ts`'s own doc comment).
The plateau this decision requires is therefore **a direct, free
consequence of placing the highest-`netCashToRevenue` anchor at the
"healthy/strong buffer" breakpoint** — any value beyond it clamps to
that same score automatically. No conditional logic, no new shape of
curve, no departure from the one interpolation mechanism this whole
design already reuses everywhere else (§2, §6). The same clamping
gives the low end a floor for free too, though whether the low end
should plateau early (vs. continue declining across its full modeled
domain) is not specified by this decision and remains open (§7.2).

## 7.2 Remaining calibration work before implementation

Per instruction, no numeric anchors are proposed here — the following
is the list of what a dedicated calibration checkpoint still needs to
settle before `GROWTH_SOFTWARE_TEMPLATE`'s Balance Sheet component can
be implemented:

1. **Where the rising region starts and how steep it is** — i.e. the
   `netCashToRevenue` value(s) representing "severe net debt" (low
   anchor) through "breakeven" (net cash equals net debt) up to where
   the healthy-buffer zone begins. Unlike Growth Trend/Margin Trend
   (§6), this shape is **not** required to be symmetric around a
   neutral midpoint — §7.1 only fixes that low values score lower and
   the region rises; it does not fix how steeply, or whether the
   breakeven point (`netCashToRevenue = 0`) should land exactly on this
   codebase's neutral score (50, matching `trendAnchors`/
   `relativeStrengthAnchors`' own convention) or somewhere else. This
   is a real, undecided calibration question, not an oversight.
2. **Where the plateau begins** — the `netCashToRevenue` value marking
   a "healthy/strong buffer," i.e. the highest anchor's x-coordinate.
   Needs a defensible reference point (e.g. informed by typical
   growth-software balance-sheet ratios) not invented here.
3. **What score the plateau settles at** — momentum's own analogous
   curves (`trendAnchors`, `relativeStrengthAnchors`) cap at 90, not
   100, at their extremes; whether Balance Sheet's plateau should also
   leave headroom below 100 or reach it is undecided.
4. **Whether the low end also plateaus** (a floor before the domain's
   true minimum) **or continues declining across its full modeled
   range** — §7.1 constrains only the high end; the low end's exact
   shape is unaddressed and open.
5. **The number and placement of intermediate anchor points** between
   the low end and the plateau — `interpolateAnchors` supports any
   number of piecewise-linear segments; how many are needed for a
   sensible curve (matching, e.g., `trendAnchors`' 5-point curve or
   `relativeVolumeAnchors`' 5-point curve) is not decided here.

None of these five blocks §2–§6 of this design, and none is proposed to
be resolved silently — each needs real reference data or an explicit
calibration decision, consistent with this checkpoint's instruction not
to invent numeric anchors.

## 8. Summary

| Dimension | Metric | Normalization status |
|---|---|---|
| Revenue Growth | `computeRevenueGrowth` (E.1A) | **Resolved** — spec §11 anchors, cited |
| Guidance | `GuidanceEvidence` (E.1A) | **Resolved** — spec §12 mapping, implemented |
| Free Cash Flow | FCF Margin = `computeFreeCashFlow` / revenue (metric resolved here) | Shape: monotonic (reasoned, §4.2). Anchors: deferred, not invented |
| Operating Margin | `computeOperatingMargin` (E.1A) | Shape: monotonic (reasoned, §5). Anchors: deferred, not invented |
| Growth Trend | E.1B derivation | Shape: monotonic-symmetric (reasoned, §6). Anchors: deferred, not invented |
| Margin Trend | E.1B derivation | Shape: monotonic-symmetric (reasoned, §6). Anchors: deferred, not invented |
| Balance Sheet | `computeNetCashToRevenue` (E.0 §3.3) | Shape: monotonic-then-plateau, resolved (§7.1). Anchors: deferred, not invented (§7.2) |

## 9. Explicit non-goals of this design

- No specific anchor numbers proposed for Free Cash Flow, Operating
  Margin, Growth Trend, Margin Trend, or Balance Sheet — every
  dimension's shape is now reasoned/resolved, but exact breakpoints are
  deferred to a dedicated calibration checkpoint (this document's own
  recommended next step, §7.2 for Balance Sheet specifically), not
  invented here.
- No changes to any E.1A function (`computeFreeCashFlow` keeps
  returning absolute dollar FCF; FCF Margin is a new, small derived
  ratio on top of it, not a replacement).
- No `FundamentalsComponentDefinition`/`FundamentalsTemplate`
  population (E.0 §5.1's aggregate shapes) — three of seven dimensions
  still lack anchors, so the template cannot be honestly completed yet.
- No Scorecard/engine/action-zone wiring.
- No code written — every snippet and table above is analysis, not
  implementation.

## 10. Architecture conflict check

None found. Every dimension reuses the existing `interpolateAnchors`
mechanism (or, for Guidance, the existing discrete mapping) with no
new normalization technique introduced. FCF Margin is a trivial
composition of an already-implemented function. Balance Sheet's
resolved plateau shape (§7.1) is a direct, free consequence of
`interpolateAnchors`' existing clamping behavior — no new mechanism
required.

## 11. Status

Fully resolved — §7.1 records the approved Balance Sheet decision.
Every dimension's metric and curve shape is now settled; only specific
anchor numbers remain, deferred to a dedicated calibration checkpoint
(§7.2 lists Balance Sheet's five open calibration questions; §9 covers
the other four dimensions). No further design review is needed to
proceed to that calibration work.
