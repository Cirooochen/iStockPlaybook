# Phase E.1D — Fundamentals Anchor Calibration v0.1

Status: DESIGN / CALIBRATION PROPOSAL ONLY — no application code
changed, nothing implemented. Not a MODEL DECISION REQUIRED stop: every
dimension's metric and curve *shape* was already settled by E.1A/E.1B/
E.1C, so what remains here is number-picking, not a fork between
competing models. See §5 for why none of the proposed numbers are
withheld, and §6 for the explicit, prominent caveat this whole document
sits under.

**None of the numbers below are empirically validated.** They are v0.1
placeholder hypotheses, in the same spirit — and explicitly the same
epistemic status — as this project's own existing anchor curves
(`relativeVolumeAnchors`: *"this contract's own explicit, documented
v0.1 hypothesis, not a named industry-standard curve"*;
`dma200SlopeLookbackDays`: *"a v0.1 HYPOTHESIS, not an empirically
validated value"*) and as spec's own top-level disclaimer (line 6):
*"numerical weights and thresholds in v0.1 are hypotheses. A formula is
not scientifically validated merely because it is quantitative.
Parameters should later be backtested, walk-forward tested,
sensitivity-tested, and benchmarked."* Nothing here changes that
standing project-wide caveat; this document just extends it to
fundamentals.

## 0. What was read

- `docs/phase-e0-fundamentals-evidence-contract-design.md`,
  `docs/phase-e1b-fundamentals-trend-methodology-design.md`,
  `docs/phase-e1c-fundamentals-normalization-design.md` — the three
  prior checkpoints this one calibrates: E.0 (raw contract, Balance
  Sheet metric), E.1B (Growth Trend/Margin Trend derivation), E.1C
  (every dimension's metric + curve *shape*, including the approved
  Balance Sheet monotonic-then-plateau resolution, §7.1 there).
- `src/domain/signals/fundamentals.ts` (E.1A) — confirmed the exact
  decimal-fraction convention every derivation function already uses
  (e.g. 12% growth represented as `0.12`, matching momentum's own
  `DataField<number>` convention) — anchors below use the same
  convention, not raw percentages, for direct compatibility with
  `interpolateAnchors` and with how every existing caller would pass a
  computed value in.
- `docs/playbook-decision-engine-spec-v0.1.md` §11/§12 (re-confirmed)
  and its line-6 top-level disclaimer (quoted above) — directly
  supports this document's "not scientifically validated" framing as
  spec's own stated position, not something invented for this
  checkpoint.
- `src/config/ruleset-v0.1.ts` — every existing momentum anchor curve
  (`rsiAnchors`, `relativeVolumeAnchors`, `structureAnchors`,
  `priceExtensionAnchors`, `trendAnchors`, `relativeStrengthAnchors`)
  and `interpolateAnchors` itself (`src/domain/signals/momentum-
  score.ts`) — the exact mechanism and stylistic precedent (5–6 point
  piecewise-linear curves, clamped at the extremes) every proposal
  below reuses unchanged.

## 1. Weight confirmation

Spec §11's growth-software example table, re-summed directly from the
spec text:

```text
Revenue Growth     20%
Growth Trend       10%
Operating Margin   15%
Margin Trend       10%
Free Cash Flow     20%
Guidance           15%
Balance Sheet      10%
                  -----
                   100%
```

`20 + 10 + 15 + 10 + 20 + 15 + 10 = 100`. **Confirmed: sums to exactly
1.00.** No adjustment needed or proposed — these are spec's own stated
weights, adopted verbatim (same precedent as momentum's weights, which
were likewise taken directly from spec §14's table without
modification).

## 2. Calibration principles used throughout

1. **Reuse before invention.** Every curve below either cites a
   spec-given source directly, or is built by applying an *already-
   approved* curve's exact shape to a new domain (geometric scaling or
   direct reuse) rather than inventing an unrelated new shape from
   nothing. This is the same discipline the "existing momentum
   anchor/interpolation pattern" this checkpoint was told to read
   already models.
2. **Small number of interpretable anchor points** — 5–6 points per
   curve, matching every existing momentum anchor curve's own point
   count; no curve below needs more to stay legible.
3. **Generic archetype, not Unity.** No anchor below was chosen to
   produce a particular score for Unity's actual reported financials.
   Domain values are argued from general growth-software-company
   characteristics (typical margin ranges, typical net-cash positions
   for equity-funded software companies) stated as such, never checked
   against or tuned to any specific company's numbers.
4. **Decimal-fraction convention** — every anchor `x`-value is a
   decimal fraction (`0.10` = 10%), matching `computeRevenueGrowth`/
   `computeOperatingMargin`/etc.'s existing output convention (E.1A)
   and every existing momentum anchor curve's own convention.
5. **Source-category legend** (per dimension, §3):
   - **SPEC_DEFINED** — spec gives this exact curve/mapping; cited
     verbatim, nothing proposed.
   - **EXISTING_MODEL_PRECEDENT** — this proposal reuses an
     already-approved curve's exact shape (and, where noted, its exact
     numbers), applied to a new dimension.
   - **V0_1_INVESTMENT_HYPOTHESIS** — a new domain-scale choice with no
     direct precedent to reuse, reasoned from general archetype
     characteristics, explicitly unvalidated.

## 3. Per-dimension calibration table

### 3.1 Revenue Growth

| | |
|---|---|
| 1. Metric | `computeRevenueGrowth` (E.1A) — YoY revenue growth rate |
| 2. Curve shape | Monotonic, asymmetric (0% growth is *below* neutral for this archetype) |
| 3. Existing spec anchors | **Yes — spec §11's own worked example, verbatim** |
| 4. Proposed anchors | None needed — spec's own: `[[-0.10, 0], [0, 30], [0.10, 50], [0.20, 70], [0.30, 85], [0.40, 100]]` |
| 5. Source category | **SPEC_DEFINED** |
| 6. Low/neutral/strong | Low: revenue *contracting* ≥10% YoY (score 0). Neutral: ~10% YoY growth (score 50) — not "no growth," reflecting that a growth-software archetype needs real growth to be unremarkable. Strong: ≥40% YoY growth (score 100, clamped beyond). |

### 3.2 Growth Trend

| | |
|---|---|
| 1. Metric | E.1B: `revenueGrowth(current) - revenueGrowth(previous quarter)` — a percentage-point delta |
| 2. Curve shape | Monotonic, symmetric around neutral at delta = 0 (E.1C §6) |
| 3. Existing spec anchors | None (confirmed, §0) |
| 4. Proposed anchors | `[[-0.15, 10], [-0.03, 35], [0, 50], [0.03, 65], [0.15, 90]]` — `momentum`'s `trendAnchors` shape, geometrically scaled ×3 in domain (see §3.4 for the identical treatment applied to Margin Trend, and the shared rationale) |
| 5. Source category | **EXISTING_MODEL_PRECEDENT** (shape and near-zero/extreme ratio copied exactly from `trendAnchors`); the ×3 domain-scaling factor itself is **V0_1_INVESTMENT_HYPOTHESIS** |
| 6. Low/neutral/strong | Low: growth rate decelerating ≥15pp quarter-over-quarter (score 10). Neutral: growth rate unchanged from the prior quarter (score 50). Strong: growth rate accelerating ≥15pp (score 90, clamped beyond). |

### 3.3 Operating Margin

| | |
|---|---|
| 1. Metric | `computeOperatingMargin` (E.1A) — operating income / revenue, current period |
| 2. Curve shape | Monotonic, asymmetric (E.1C §5) |
| 3. Existing spec anchors | None (confirmed, §0) |
| 4. Proposed anchors | `[[-0.10, 0], [0, 30], [0.10, 50], [0.20, 70], [0.30, 85], [0.40, 100]]` — **identical to Revenue Growth's spec-given curve**, reused wholesale, not just in shape |
| 5. Source category | **EXISTING_MODEL_PRECEDENT** (direct reuse of spec's own curve — see rationale below) |
| 6. Low/neutral/strong | Low: operating margin ≤ -10% (score 0). Neutral: ~10% operating margin (score 50) — plausible for a mid-stage growth-software company. Strong: ≥40% operating margin (score 100, clamped beyond) — best-in-class mature SaaS territory. |

**Rationale for reusing Revenue Growth's exact curve:** both dimensions
are "a percentage where higher is better, and low-double-digits is
roughly neutral for this specific archetype" — the same underlying
shape spec already committed to once. Reusing it wholesale (not just
copying the shape but the literal numbers) is the smallest-footprint,
least-invented option available, and is explicitly preferred by this
checkpoint's own "prefer a small number of interpretable anchor points"
instruction — one fewer independently-unvalidated curve to defend. This
is a real choice being made here, not a forced necessity — Operating
Margin's true realistic range could differ from Revenue Growth's, and a
dedicated calibration effort may later find they should diverge (§5).

### 3.4 Margin Trend

| | |
|---|---|
| 1. Metric | E.1B: `operatingMargin(current) - operatingMargin(previous quarter)` — a percentage-point delta |
| 2. Curve shape | Monotonic, symmetric around neutral at delta = 0 (E.1C §6) |
| 3. Existing spec anchors | None (confirmed, §0) |
| 4. Proposed anchors | **Identical to Growth Trend's**: `[[-0.15, 10], [-0.03, 35], [0, 50], [0.03, 65], [0.15, 90]]` — one shared curve for both trend dimensions |
| 5. Source category | **EXISTING_MODEL_PRECEDENT** (shape from `trendAnchors`) |
| 6. Low/neutral/strong | Low: margin contracting ≥15pp quarter-over-quarter (score 10). Neutral: margin unchanged (score 50). Strong: margin expanding ≥15pp (score 90, clamped beyond). |

**Why one shared curve for both trend dimensions:** Growth Trend and
Margin Trend are both percentage-point deltas of a per-period ratio,
with no principled basis available here to argue one is typically
more/less volatile than the other for this archetype. Proposing two
independently-tuned curves with no differentiating rationale would be
inventing a distinction that doesn't exist yet — sharing one curve is
the more honest choice given the current evidence, not a shortcut. A
future calibration effort with real data may find they should diverge.

### 3.5 Free Cash Flow (scored as FCF Margin, per E.1C §4)

| | |
|---|---|
| 1. Metric | FCF Margin = `computeFreeCashFlow(periods)` (E.1A, dollar FCF) ÷ current period's revenue — E.1C §4.1's resolved metric choice |
| 2. Curve shape | Monotonic, asymmetric (E.1C §4.2) |
| 3. Existing spec anchors | None (confirmed, §0) |
| 4. Proposed anchors | **Identical to Revenue Growth/Operating Margin's**: `[[-0.10, 0], [0, 30], [0.10, 50], [0.20, 70], [0.30, 85], [0.40, 100]]` |
| 5. Source category | **EXISTING_MODEL_PRECEDENT** (direct reuse, same rationale as §3.3) |
| 6. Low/neutral/strong | Low: FCF margin ≤ -10% (score 0). Neutral: ~10% FCF margin (score 50). Strong: ≥40% FCF margin (score 100, clamped beyond) — high but not unheard of for capital-light, mature SaaS businesses. |

**Rationale:** the same "higher is better, low double-digits roughly
neutral" shape applies for the same archetype reasons as §3.3, and no
information available here justifies giving FCF Margin a different
domain than Operating Margin — the two ratios often move together for
capital-light software businesses (FCF margin can run above or below
operating margin depending on stock-based-comp add-backs and working
capital, with no consistent, arguable-from-first-principles direction
for a *generic* growth-software company). Reusing the identical curve
keeps this proposal to a small number of genuinely distinct curves (2
new ones — §3.2/3.4's shared trend-delta curve and §3.6's Balance Sheet
curve — plus 3 dimensions reusing spec's revenue-growth curve wholesale)
rather than fabricating unjustified differences between similar ratios.

### 3.6 Guidance

| | |
|---|---|
| 1. Metric | `GuidanceEvidence.{direction,magnitude}` (E.1A) |
| 2. Curve shape | Not an anchor curve — a discrete lookup table |
| 3. Existing spec anchors | **Yes — spec §12's mapping table, verbatim** |
| 4. Proposed anchors | None needed — already fully implemented (`mapGuidanceEvidenceToScore`, E.1A) |
| 5. Source category | **SPEC_DEFINED** |
| 6. Low/neutral/strong | Low: `LOWERED + MATERIAL` (score 10). Neutral: `REITERATED` (score 55) or `MIXED` (score 45). Strong: `RAISED + MATERIAL` (score 90). |

### 3.7 Balance Sheet (`netCashToRevenue`)

| | |
|---|---|
| 1. Metric | `computeNetCashToRevenue` (E.0 §3.3) — (cash − total debt) / trailing-twelve-month revenue |
| 2. Curve shape | Monotonic-then-plateau, never declining — E.1C §7.1's approved resolution |
| 3. Existing spec anchors | None (confirmed, §0) |
| 4. Proposed anchors | `[[-0.50, 10], [-0.15, 30], [0, 50], [0.30, 70], [0.75, 85]]` |
| 5. Source category | **V0_1_INVESTMENT_HYPOTHESIS** — no existing curve has this shape to reuse; this is the one genuinely new curve in this proposal |
| 6. Low/neutral/strong | Low: net debt ≥50% of trailing revenue (score 10) — unusual leverage for an equity-funded growth-software company. Neutral: net cash exactly offsets total debt (score 50), mirroring momentum's own "metric = 0 → score 50" convention. Strong/plateau: net cash ≥75% of trailing revenue (score 85) — a substantial buffer, common for post-IPO growth-software companies; **any value beyond 0.75 clamps to 85, never higher, never lower** — the approved plateau, achieved with zero new mechanism (`interpolateAnchors`' existing clamping behavior, per E.1C §7.1). |

**Two of E.1C §7.2's open calibration questions are resolved as a
direct, unavoidable side effect of choosing any finite anchor set, not
as separate decisions requiring their own deliberation:**
- *"Should breakeven land on neutral-50?"* — yes, proposed here,
  mirroring the convention `trendAnchors`/`relativeStrengthAnchors`
  already use for their own zero point.
- *"Should the low end also plateau, or keep declining?"* — it
  necessarily plateaus, at score 10 for any value ≤ −0.50, because
  `interpolateAnchors` clamps at the *first* anchor exactly as it does
  at the last — this was never actually an open design choice distinct
  from picking the anchor set itself, just an under-examined
  consequence of it, now made explicit.

The plateau threshold (0.75) and the low-end floor (−0.50) themselves
remain V0_1_INVESTMENT_HYPOTHESIS, unvalidated (§5, §6).

## 4. Full proposed configuration (illustrative, not implemented)

```ts
// illustrative — src/config/ruleset-v0.1.ts, a new `fundamentals`
// section mirroring `technical.momentum`'s existing structure. Not
// implemented; E.1D is calibration proposal only.
fundamentals: {
  growthSoftware: {
    // Weights — spec §11, verbatim (§1 above). Sums to 1.00.
    revenueGrowthWeight: 0.20,
    growthTrendWeight: 0.10,
    operatingMarginWeight: 0.15,
    marginTrendWeight: 0.10,
    fcfMarginWeight: 0.20,
    guidanceWeight: 0.15,
    balanceSheetWeight: 0.10,

    // Revenue Growth — SPEC_DEFINED (§3.1)
    revenueGrowthAnchors: [[-0.10, 0], [0, 30], [0.10, 50], [0.20, 70], [0.30, 85], [0.40, 100]],
    // Operating Margin / FCF Margin — EXISTING_MODEL_PRECEDENT, reuses
    // revenueGrowthAnchors' curve wholesale (§3.3/§3.5)
    marginAnchors: [[-0.10, 0], [0, 30], [0.10, 50], [0.20, 70], [0.30, 85], [0.40, 100]],
    // Growth Trend / Margin Trend — EXISTING_MODEL_PRECEDENT,
    // trendAnchors' shape scaled 3x (§3.2/§3.4)
    trendDeltaAnchors: [[-0.15, 10], [-0.03, 35], [0, 50], [0.03, 65], [0.15, 90]],
    // Balance Sheet — V0_1_INVESTMENT_HYPOTHESIS, new (§3.7)
    netCashToRevenueAnchors: [[-0.50, 10], [-0.15, 30], [0, 50], [0.30, 70], [0.75, 85]],
    // Guidance — SPEC_DEFINED discrete mapping, already implemented
    // (mapGuidanceEvidenceToScore, E.1A) — not an anchor curve, no
    // config entry needed here.
  },
},
```

## 5. What this document flags rather than silently asserts

Per instruction, this section names what cannot be treated as more than
a placeholder without real external work — not because any dimension
was withheld (§3 proposes something defensible for all seven), but
because the *validation status* of what's proposed needs to stay
visible:

- **Every V0_1_INVESTMENT_HYPOTHESIS and EXISTING_MODEL_PRECEDENT
  number above** (i.e. everything except Revenue Growth's and
  Guidance's literal spec text) is a reasoned placeholder, not a
  finding. In particular: the ×3 domain-scaling factor for Growth/
  Margin Trend (§3.2), the decision to reuse Revenue Growth's curve
  wholesale for Operating Margin and FCF Margin (§3.3/§3.5) rather than
  giving them independently-fitted domains, and every one of Balance
  Sheet's five breakpoints (§3.7) — none of these are derived from any
  actual growth-software company dataset, peer benchmarking, or expert
  review. They are internally consistent and reasoned from general
  archetype characteristics, nothing more.
- **What would actually validate or correct these:** real financial
  data across a sample of growth-software companies (distribution of
  actual YoY revenue-growth deltas, actual operating/FCF margins,
  actual net-cash-to-revenue positions) — exactly the kind of
  backtesting/sensitivity work spec's own line-6 disclaimer and §31
  (Scientific Validation Plan) already call for and explicitly defer
  past v0.1.
- **Nothing here rises to a blocking "cannot be responsibly proposed"
  refusal.** Every dimension has at least a reasoned, precedent-
  connected placeholder; none required withholding entirely. This
  document's answer to "flag what can't be proposed without external
  research" is: *the validation of all of it*, not the existence of any
  one specific curve.

## 6. Explicit non-goals of this document

- Not scientifically validated — restated one more time, deliberately,
  per instruction: nothing in §3/§4 should be read as more than a v0.1
  starting hypothesis.
- Not tuned to Unity or any other specific company's actual reported
  financials.
- No `FundamentalsComponentDefinition`/`FundamentalsTemplate`
  population, no `scoreFundamentals` implementation, no
  `RULESET.fundamentals` addition — §4's snippet is illustrative only.
- No Scorecard/engine/action-zone wiring.
- No second archetype — this calibration is `GROWTH_SOFTWARE`-only, per
  E.0 §5.1's scope.
- No code written.

## 7. Architecture conflict check

None found. Every proposed curve uses the existing
`interpolateAnchors` mechanism unchanged; the Balance Sheet plateau
(§3.7) is achieved entirely through that mechanism's existing clamping
behavior, exactly as E.1C §7.1 anticipated. No new normalization
technique, config shape, or domain type is introduced beyond what
`RULESET.technical.momentum` already establishes as this codebase's
pattern for exactly this kind of data.

## 8. Status and recommended next step

Not a MODEL DECISION REQUIRED stop — every open question this
checkpoint could have surfaced (curve shape, metric choice, weight
sums) was already settled by E.1A–E.1C; this document only proposes
numbers within those already-approved shapes, explicitly flagged as
unvalidated throughout (§5, §6). An E.2 implementation checkpoint,
once/if this calibration is approved, would be mechanical: add the §4
config block to `RULESET`, build `GROWTH_SOFTWARE_TEMPLATE` (E.0 §5.1's
`FundamentalsTemplate` shape) wiring each dimension's already-
implemented derivation function (E.1A/E.1B/§3.5 here) through
`interpolateAnchors` with these anchors, implement the generic
`scoreFundamentals` engine (E.0 §5.1), and add tests mirroring
`momentum-score.test.ts`'s per-dimension fixture style. Real
calibration (§5) — replacing these hypotheses with data-backed numbers
— remains a separate, later, explicitly out-of-scope effort, consistent
with spec's own validation plan (§31) never being a v0.1 requirement.
