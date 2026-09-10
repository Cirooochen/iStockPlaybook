# Personal Stock Playbook — Decision Engine Specification v0.1

**Status:** MVP algorithm contract  
**Purpose:** Define deterministic calculations, scoring, hard rules, AI boundaries, and dynamic Playbook updates.

> Important: numerical weights and thresholds in v0.1 are hypotheses. A formula is not scientifically validated merely because it is quantitative. Parameters should later be backtested, walk-forward tested, sensitivity-tested, and benchmarked.

## 1. Architecture

```text
Transactions + Portfolio + Market Data + Fundamentals
                    ↓
        Deterministic Calculation Layer
                    ↓
     Quantitative Signal / Scoring Layer
                    ↓
             Hard Rules Engine
                    ↓
           Playbook State Machine
                    ↓
              Action Zones
                    ↓
          AI Explanation Layer
```

**Rule:** AI never owns portfolio accounting or overrides hard constraints.

## 2. Responsibility Boundary

### Deterministic / algorithmic
- shares and weighted average cost;
- realized/unrealized P&L;
- position and portfolio value;
- portfolio weight;
- FX arithmetic;
- target shares;
- core/tactical shares;
- concentration;
- technical indicators;
- valuation arithmetic;
- quantitative normalization;
- hard constraints;
- stance rules;
- action sizing.

### AI-assisted
- extracting facts from reports;
- interpreting management commentary;
- identifying company-specific KPIs;
- comparing evidence with the thesis;
- classifying qualitative thesis health;
- summarizing contradictory evidence;
- natural-language explanation.

### AI must never
- invent missing financial/market data;
- calculate authoritative accounting when deterministic code can;
- freely choose BUY/SELL;
- override concentration/core constraints;
- silently treat missing data as zero.

## 3. Transaction Accounting

```text
current_shares = Σ BUY shares - Σ SELL shares
```

Constraint:

```text
current_shares >= 0
```

For a BUY:

```text
old_cost_basis = old_shares × old_average_cost

purchase_cost =
buy_shares × buy_price_in_base_currency
+ fees_in_base_currency

new_average_cost =
(old_cost_basis + purchase_cost)
/
(old_shares + buy_shares)
```

For a SELL under MVP weighted-average accounting:

```text
remaining_average_cost = unchanged

sold_cost_basis =
sell_shares × current_average_cost

realized_pnl =
sell_proceeds_base
- sold_cost_basis
- sell_fees_base
```

This is decision-support accounting, not tax-lot accounting.

## 4. FX

Keep original and base currency separately.

```text
transaction_value_base =
transaction_value_original × transaction_fx_rate
```

```text
position_value_base =
shares × current_market_price × current_fx_rate
```

Every FX value requires a timestamp.

## 5. Position and Portfolio

```text
unrealized_pnl =
current_position_value - remaining_cost_basis
```

```text
unrealized_return =
unrealized_pnl / remaining_cost_basis
```

```text
portfolio_value =
Σ position_values + cash
```

```text
portfolio_weight =
position_value / portfolio_value
```

If stock is sold into portfolio cash, total portfolio value remains approximately unchanged immediately except for costs/slippage.

## 6. Target Position Algorithm

```text
target_position_value =
portfolio_value × target_weight
```

```text
target_shares =
floor(target_position_value / current_price_base)
```

```text
shares_to_sell_to_target =
max(0, current_shares - target_shares)
```

This is recalculated whenever price, portfolio value, holdings, FX, or target changes.

## 7. Core / Tactical Position

```text
tactical_shares_above_core_max =
max(0, current_shares - core_max)
```

```text
max_sell_without_breaching_core_min =
max(0, current_shares - core_min)
```

Tactical recommendations cannot breach `core_min` unless thesis deterioration explicitly activates a higher-priority risk rule.

## 8. Concentration

```text
concentration_ratio =
current_weight / target_max_weight
```

```text
weight_excess_pp =
current_weight - target_max_weight
```

Initial v0.1 states:

```text
WITHIN_TARGET
weight <= target

MODERATELY_OVERWEIGHT
target < weight <= target × 1.15

OVERWEIGHT
target × 1.15 < weight <= target × 1.30

SEVERELY_OVERWEIGHT
weight > target × 1.30
```

All thresholds belong in a versioned parameter registry.

## 9. Position Fit Score

Convention: `100 = attractive/healthy`, `0 = unattractive/high-risk`.

Initial monotonic model:

```text
if current_weight <= target_max:
    score = 100
else:
    excess_ratio =
      (current_weight - target_max) / target_max

    score =
      max(0, 100 - 200 × excess_ratio)
```

For Unity baseline:

```text
58.6% / 45% = 1.302

excess_ratio ≈ 30.2%

position_fit ≈ 39.6 / 100
```

Later models can incorporate correlation, volatility contribution, sector concentration and risk budgets.

## 10. Score Convention

All normalized scores:

```text
0   extremely unattractive / unhealthy
50  neutral
100 extremely attractive / healthy
```

Never silently reverse score meaning between modules.

## 11. Fundamental Engine

Fundamental models must be **company-archetype aware**.

Example growth-software v0.1:

```text
Revenue Growth           20%
Growth Trend             10%
Operating Margin         15%
Margin Trend             10%
Free Cash Flow           20%
Guidance                 15%
Balance Sheet            10%
                         ----
                         100%
```

```text
fundamental_score =
0.20 revenue_growth
+ 0.10 growth_trend
+ 0.15 operating_margin
+ 0.10 margin_trend
+ 0.20 fcf
+ 0.15 guidance
+ 0.10 balance_sheet
```

Do not use the same template for banks, biotech, utilities, semiconductors, etc.

### Normalization

Use bounded continuous normalization rather than arbitrary raw points.

Example revenue-growth anchors:

```text
<= -10% → 0
0%      → 30
10%     → 50
20%     → 70
30%     → 85
>= 40%  → 100
```

Interpolate between anchors.

Future preference: combine sector-relative percentile with the company's own historical percentile.

## 12. Guidance

AI may extract structured evidence:

```json
{
  "direction": "RAISED",
  "magnitude": "MATERIAL",
  "evidence": []
}
```

Rules map it:

```text
RAISED + MATERIAL   90
RAISED + SMALL      75
REITERATED          55
MIXED               45
LOWERED + SMALL     30
LOWERED + MATERIAL  10
```

AI does not directly assign the final numeric score.

## 13. Valuation Engine

High score = more attractive valuation.

Growth-software candidates:

- forward EV/Revenue;
- forward EV/EBITDA;
- FCF yield;
- growth-adjusted valuation;
- historical valuation percentile;
- peer valuation percentile.

Example:

```text
historical_attractiveness =
100 - historical_valuation_percentile
```

```text
peer_attractiveness =
100 - peer_valuation_percentile
```

Initial example:

```text
valuation_score =
0.35 historical_attractiveness
+ 0.25 peer_attractiveness
+ 0.20 growth_adjusted_score
+ 0.20 fcf_yield_score
```

If a metric is meaningless/unavailable, redistribute weight explicitly rather than inventing a value.

## 14. Technical / Momentum Engine

Technical signals primarily time tactical actions.

Example dimensions:

```text
Primary Trend             25%
50DMA/200DMA Structure    20%
Relative Strength         20%
Volume Confirmation       15%
Momentum/RSI              10%
Price Extension           10%
```

Examples:

```text
price > rising 200DMA → constructive
price > 50DMA > 200DMA → constructive
RSI 50–70 → constructive momentum
RSI > 80 → strong but extended
RSI < 30 → oversold, NOT automatically BUY
```

Price extension:

```text
extension_50dma = (price - 50dma) / 50dma
extension_200dma = (price - 200dma) / 200dma
```

## 15. Thesis Engine

Controlled states only:

```text
STRENGTHENING
INTACT
MIXED
WEAKENING
BROKEN
```

AI may classify thesis health only from supplied thesis criteria and evidence.

Required structured output:

```json
{
  "state": "INTACT",
  "confidence": "MEDIUM",
  "supporting_evidence": [],
  "contradicting_evidence": [],
  "triggered_breakers": [],
  "unknowns": []
}
```

Numeric mapping when needed:

```text
STRENGTHENING  90
INTACT         75
MIXED          50
WEAKENING      25
BROKEN          0
```

The category remains primary.

## 16. Hard Constraints

Rules are evaluated before weighted recommendations.

```text
HC-001
IF current_weight > accumulation_max_weight
THEN accumulation_enabled = false
```

```text
HC-002
IF thesis == BROKEN
THEN accumulation_enabled = false
AND trigger THESIS_REVIEW
```

```text
HC-003
IF tactical sell would breach core_min
AND thesis != BROKEN
THEN cap sell at core_min
```

**Resolved 2026-09-09 (B.5.4B):** HC-003 distinguishes WEAKENING from
BROKEN. Core protection stays active under WEAKENING — the thesis is
under concern but the long-term core commitment has not yet been
invalidated. Core protection is removed only under BROKEN — the thesis
supporting the core commitment is no longer valid. (Previously both
WEAKENING and BROKEN waived core protection identically; see
`docs/validation/b5.4b-thesis-core-protection-report.md` for the
original finding and resolution.)

```text
HC-004
IF critical data is stale
THEN prohibit HIGH-confidence action output
```

```text
HC-005
IF required evidence is missing
THEN Playbook = INCOMPLETE
```

**Rules first; scores second.**

Example:

```text
Fundamentals 88
Valuation    82
Momentum     85

BUT weight 58.6% > accumulation limit

→ ADD remains disabled
```

## 17. State Classification

### Company

```text
if thesis == BROKEN:
    BROKEN
elif thesis == WEAKENING or fundamentals < 35:
    DETERIORATING
elif fundamentals >= 70
and thesis in [INTACT, STRENGTHENING]:
    CONSTRUCTIVE
else:
    MIXED
```

### Valuation

```text
0–19    VERY_EXPENSIVE
20–39   EXPENSIVE
40–59   FAIR
60–79   ATTRACTIVE
80–100  VERY_ATTRACTIVE
```

### Portfolio

```text
WITHIN_TARGET
MODERATELY_OVERWEIGHT
OVERWEIGHT
SEVERELY_OVERWEIGHT
```

Drives stance severity. Distinct from the coarser `UNDERWEIGHT` /
`WITHIN_TARGET` / `OVERWEIGHT` Position Sizing State in §21A, which drives
add/trim capacity direction rather than stance urgency.

## 18. Initial Stance Matrix

Highest-priority matching rule wins.

```text
BROKEN thesis
→ THESIS_REVIEW / REDUCE_RISK
```

```text
WEAKENING thesis + OVERWEIGHT+
→ REDUCE_RISK
```

```text
CONSTRUCTIVE + SEVERELY_OVERWEIGHT
→ HOLD / GRADUALLY_TRIM
```

```text
CONSTRUCTIVE + OVERWEIGHT
→ HOLD / TRIM
```

```text
CONSTRUCTIVE + MODERATELY_OVERWEIGHT
→ HOLD
```

**Resolved v0.1 decision (approved 2026-09-08 — supersedes the original
grouped `MODERATELY_OVERWEIGHT/OVERWEIGHT → HOLD/TRIM` rule above):**
`MODERATELY_OVERWEIGHT` and `OVERWEIGHT` are deliberately **not** treated
as the same portfolio state. `MODERATELY_OVERWEIGHT` represents a small
deviation above the target range and does not by itself justify
escalating the overall Playbook stance to a TRIM posture — it stays
`HOLD`. Tactical intent at that severity is expressed through Action
Zones instead (TRIM_1 may show `WATCH`), not through the stance label.
`OVERWEIGHT` and `SEVERELY_OVERWEIGHT` represent progressively stronger
concentration-management needs and justify explicit trimming language in
the stance itself (`HOLD_TRIM`, `HOLD_GRADUALLY_TRIM`). This creates a
severity ladder — `HOLD` → `HOLD_TRIM` → `HOLD_GRADUALLY_TRIM` — rather
than collapsing a 45.1% position and a 52% position into the same
stance. Current implementation (`src/domain/playbook/stance-rules.ts`)
already matches this ladder exactly; no code change was required.

```text
CONSTRUCTIVE + WITHIN_TARGET
+ valuation >= 65
+ accumulation enabled
→ ADD_SELECTIVELY
```

```text
CONSTRUCTIVE + WITHIN_TARGET
+ valuation < 40
→ HOLD
```

```text
MIXED
→ HOLD / WATCH
```

Priority:

```text
1 Data integrity
2 Thesis-break
3 Portfolio/risk constraints
4 Core constraints
5 Fundamentals
6 Valuation
7 Technical timing
8 Tactical optimization
```

## 19. Action Zones

```ts
type ActionZone = {
  type: "ADD" | "HOLD" | "TRIM" | "THESIS_REVIEW"
  enabled: boolean
  activationConditions: Condition[]
  invalidationConditions: Condition[]
  suggestedShares?: number
  maxSuggestedShares?: number
  priceRange?: PriceRange
  rationaleCodes: string[]
}
```

Action Zones are conditional states, not arbitrary AI price targets.

## 20. Dynamic Trim Logic

Example:

```text
IF portfolio_state >= OVERWEIGHT
AND (
    valuation_score <= 35
    OR price_extension >= configured_threshold
    OR major_resistance_triggered
)
THEN activate TRIM_LEVEL_1
```

Exact technical thresholds must eventually be validated/backtested.

## 21. Trim Sizing

```text
shares_to_target =
current_shares - target_shares
```

```text
available_tactical =
max(0, current_shares - core_max)
```

```text
max_tactical_trim =
min(shares_to_target, available_tactical)
```

Initial staging hypothesis:

```text
Level 1 = round(max_tactical_trim × 30%)
Level 2 = round(max_tactical_trim × 35%)
Level 3 = remainder
```

The 30/35/remainder split is a product hypothesis, not a scientifically established optimum.

**Status: refined by §21A below.** The single `max_tactical_trim` figure above
is superseded by the Minimum / Preferred / Maximum Normal tiers in §21A,
which correct two errors in this section: (1) `available_tactical` (core-based)
should never determine the *minimum* required trim — only the target weight
should; (2) `min(shares_to_target, available_tactical)` silently discards the
distinction between "just enough to re-enter target" and "trim all the way to
the core ceiling," which are materially different amounts. This section is
kept for historical reference; §21A is authoritative for trim sizing.

## 21A. Target Position & Sizing Model (v0.2 — approved 2026-09-08, design only, not yet implemented)

Generalizes §21 (trim) with a symmetric add-side model, for both
UNDERWEIGHT and OVERWEIGHT positions. Produces **capacity**, not a
recommendation — see the closing note below.

### Portfolio convention (formally adopted)

**Portfolio Total = Securities + Cash.** This restates §5's
`portfolio_value = Σ position_values + cash` explicitly as the convention
this model is built on. Cash is implicit inside `portfolioTotalEur` — there
is no separate cash ledger during Phase B.5.

- **BUY** — Cash → Security. During Phase B.5, BUY transactions are
  assumed to be funded from existing portfolio cash (not external
  capital/deposits). Portfolio total is unchanged.
- **SELL** — Security → Cash. Portfolio total is unchanged.
- Both leave the total unchanged immediately, except fees/slippage (not
  yet modeled). A deposit or withdrawal is a separate portfolio event —
  a future-phase cash-flow concept, out of scope for B.5 and not modeled
  here.

See the Implementation Note at the end of this section — this was
previously a known implementation gap, now resolved.

### Terminology

- **Target Weight Range** — `[targetWeightMin, targetWeightMax]`.
- **Core Share Range** — `[coreMin, coreMax]`, optional.
- **Weight-Share Range** — the Target Weight Range converted to shares (see rounding below).
- **Feasible Strategy Range** — `intersection(weightShareRange, coreShareRange)`; defaults to `weightShareRange` itself when no core range is configured.
- **Strategy Alignment** — `ALIGNED` (Feasible Strategy Range non-empty) or `CONFLICTING` (empty). Two states only in v0.1 — see note below.
- **Position Sizing State** — `UNDERWEIGHT` / `WITHIN_TARGET` / `OVERWEIGHT`, relative to the Target Weight Range only. Distinct from the §17 Portfolio state (`WITHIN_TARGET`/`MODERATELY_OVERWEIGHT`/`OVERWEIGHT`/`SEVERELY_OVERWEIGHT`), which drives stance severity — this state drives capacity direction (add vs. trim), a different concern.

### Formulas

```text
sharesForWeightCeil(w)  = ceil(portfolioTotal × w / price)   // lower bounds — must not go below w
sharesForWeightFloor(w) = floor(portfolioTotal × w / price)  // upper bounds — must not exceed w

weightShareRange = [
  sharesForWeightCeil(targetWeightMin),
  sharesForWeightFloor(targetWeightMax)
]

feasibleStrategyRange =
  coreShareRange exists
    ? [ max(weightShareRange.min, coreShareRange.min), min(weightShareRange.max, coreShareRange.max) ]
    : weightShareRange

Strategy Alignment:
  ALIGNED      if feasibleStrategyRange.min <= feasibleStrategyRange.max
  CONFLICTING   if feasibleStrategyRange.min >  feasibleStrategyRange.max
  // Only meaningful when a core range is configured.

Position Sizing State:
  UNDERWEIGHT   if currentWeight <  targetWeightMin
  WITHIN_TARGET  if targetWeightMin <= currentWeight <= targetWeightMax
  OVERWEIGHT     if currentWeight >  targetWeightMax

— Minimum tiers: driven ONLY by the Target Weight Range, never by core —
minimumTrim = max(0, currentShares - weightShareRange.max)
minimumAdd   = max(0, weightShareRange.min - currentShares)

— Preferred Target: two branches —
if coreShareRange exists:
  preferredTarget = clamp(currentShares, feasibleStrategyRange.min, feasibleStrategyRange.max)
else:
  preferredTarget = sharesForWeightFloor(preferredTargetWeight)  // if explicitly configured
                     ?? midpoint(weightShareRange)                 // labeled default heuristic, not derived

preferredTrim = max(0, currentShares - preferredTarget)
preferredAdd   = max(0, preferredTarget - currentShares)

— Maximum Normal tiers: bounded by the Feasible Strategy Range (both constraints together) —
maximumNormalTrim = max(0, currentShares - feasibleStrategyRange.min)
maximumNormalAdd   = max(0, feasibleStrategyRange.max - currentShares)

// Invariants:
// 0 <= minimumTrim <= preferredTrim <= maximumNormalTrim
// 0 <= minimumAdd  <= preferredAdd  <= maximumNormalAdd
```

Maximum Normal Trim/Add apply only while the thesis is healthy — a
deteriorating thesis may justify reducing below `feasibleStrategyRange.min`,
but that is existing thesis/risk logic (§23, HC-003's BROKEN-only
carve-out — see B.5.4B resolution above), not this model. Symmetrically,
this model does not itself enforce HC-001/HC-002 (accumulation gating)
or HC-003 (core-breach protection) — hard constraints remain the
downstream gate applied to whatever capacity this model reports; this
model does not replace them.

**Deferred (B.5.4B, 2026-09-09):** `maximumNormalTrim` remains the
NORMAL strategic-capacity boundary and does not become thesis-sensitive
— confirmed intentional, not revisited here. This means once thesis is
BROKEN and HC-003 permits a sell below `feasibleStrategyRange.min`,
`maximumNormalTrim`'s output carries no signal that its own
healthy-thesis precondition no longer holds. Whether a future layer
should surface that signal (a distinct question from risk-reduction/
exit capacity, which is also not introduced here) remains open —
tracked as a deferred cross-layer issue, not a defect.

### HC-003 vs. `maximumNormalTrim` — responsibility boundary (resolved 2026-09-08)

These are two intentionally distinct layers, confirmed by product
decision after B.5.4A surfaced their numerical relationship. Neither
subsumes the other.

- **HC-003** (§16) protects only the explicitly configured long-term
  **core share minimum**. It answers: *"Would this SELL breach the
  committed long-term core?"* Formula: `remainingShares < coreSharesMin`,
  subject to the existing thesis-health carve-out (§23). **It does not
  consider the target-weight minimum.** This scope is intentional, not a
  gap to be widened.
- **`maximumNormalTrim`** protects the upper boundary of *normal*
  strategic trimming across the full Target Position model. It answers:
  *"How much could normally be trimmed while staying inside the approved
  strategic position range?"* Formula: bounded by
  `max(coreSharesMin, weightShareRange.min)` — i.e. the **stricter** of
  the core floor and the weight-target-implied floor.

Because `maximumNormalTrim` considers a floor HC-003 does not
(the weight-target minimum), **it may be more conservative than HC-003**
whenever the weight floor is stricter than the core floor for a given
strategy configuration. Numerical disagreement between the two is
**valid and expected** in that case — not a defect in either layer.

**Worked example (Unity, 650 shares, thesis INTACT — see
`docs/validation/b5.4a-core-protection-report.md`):**

```text
maximumNormalTrim (core+weight-aware)      = 34
HC-003 core-only maximum before breach      = 50 (650 - coreSharesMin 600)

SELL 34        → within normal strategic capacity
SELL 35-50     → exceeds normal strategic capacity, but does NOT
                 breach the explicit 600-share core floor — HC-003
                 does not trigger
SELL 51+       → breaches the core floor — HC-003 triggers
```

This is an intentional **three-level distinction** (normal capacity /
above-normal-but-core-clean / core-breaching), not an implementation
bug. No new warning behavior is implied by this distinction — whether a
transaction in the middle band (exceeds `maximumNormalTrim` but passes
HC-003) should ever surface a signal to the user is a separate,
still-open UX/execution-layer question, not resolved here.

### No-core default

If no Core Share Range is configured: Strategy Alignment is not evaluated
(N/A). Preferred Target uses an explicit `preferredTargetWeight` if the
strategy configures one; otherwise `midpoint(weightShareRange)` is proposed
as a **default policy heuristic**, explicitly not a derived or
scientifically established optimum (same status as the 30/35/remainder
split above).

### Worked example — Unity (OVERWEIGHT)

`currentShares=902, price=€40.46, portfolioTotal=€62,280`, target weight
range `[40%, 45%]`, core range `[600, 650]`.

```text
weightShareRange       = [ceil(62280×0.40/40.46), floor(62280×0.45/40.46)] = [616, 692]
coreShareRange           = [600, 650]
feasibleStrategyRange     = [max(616,600), min(692,650)] = [616, 650]  → ALIGNED

Minimum Trim         = 902 - 692 = 210   → 692 shares, ≈45.0%
Preferred Trim         = 902 - 650 = 252   → 650 shares, ≈42.2%
Maximum Normal Trim   = 902 - 616 = 286   → 616 shares, ≈40.0%
```

These are position **capacity** boundaries, not a recommendation to sell
today, at any particular price, or for any particular reason. This model
does not decide entry timing, valuation timing, technical timing, or
tranche percentages — those belong to later phases.

### Worked example — hypothetical (UNDERWEIGHT, no core range)

`currentShares=150, price=€20, portfolioTotal=€100,000`, target weight
range `[8%, 12%]`, no core range configured.

```text
weightShareRange = [ceil(100000×0.08/20), floor(100000×0.12/20)] = [400, 600]
feasibleStrategyRange = weightShareRange = [400, 600]  (no core -> defaults to weight range)
Strategy Alignment: N/A (no core range)

Minimum Add        = 400 - 150 = 250   → 400 shares, 8.0%
Preferred Add        = 500 - 150 = 350   → 500 shares, 10.0%  (midpoint heuristic, no preferredTargetWeight configured)
Maximum Normal Add  = 600 - 150 = 450   → 600 shares, 12.0%
```

### Implementation Note — resolved 2026-09-08

`applySell` previously shrank `portfolioTotalEur` by the sold position's
value on every SELL, and `applyBuy` previously grew it by the purchase
value (treating BUY as externally-funded new capital) — both contradicted
the cash-inclusive convention adopted above. Both are now fixed:
`calcPortfolioTotalAfterBuy` and `calcPortfolioTotalAfterSell`
(`src/domain/portfolio/accounting.ts`) both leave the portfolio total
unchanged, used consistently by `applyBuy`/`applySell`,
`PlaybookClientShell.handleTransaction`, and `AddTransactionModal`'s live
preview. This note tracks the accounting-layer prerequisite, which B.5.2
(Transaction Validation) depended on. §21A's formulas themselves are now
implemented (`src/domain/portfolio/target-position.ts`, both the
with-core and no-core branches) and exposed as `EngineOutput.targetPosition`.

## 22. Add Logic

```text
ADD enabled only if:

accumulation_enabled
AND portfolio_state == WITHIN_TARGET
AND thesis IN [INTACT, STRENGTHENING]
AND fundamental_score >= 60
AND valuation_score >= 60
```

Momentum influences timing rather than basic eligibility.

**Resolved 2026-09-09 (B.5.5):** the `thesis IN [INTACT, STRENGTHENING]`
clause is implemented — `deriveActionZoneState`'s ADD case now gates on
`isThesisEligibleForAdd(thesisHealth)` (`src/domain/thesis/thesis.ts`)
in addition to `accumulation_enabled`. MIXED and WEAKENING are both
ADD-ineligible in v0.1, sharing this outcome deliberately — their
semantic distinction remains in `ThesisHealth`/`scorecard.thesisHealth`
and is expected to matter more once Phase C/D evidence and fundamental
logic exist. BROKEN is separately ADD-ineligible via HC-002 regardless
of this clause. The `fundamental_score >= 60` and `valuation_score >=
60` clauses remain **not implemented** — genuinely deferred to Phase C
(no real fundamentals/valuation formulas exist yet; see
`docs/validation/b5.5-thesis-validation-report.md`).

## 23. Thesis Review

```text
Trigger if:
thesis == WEAKENING
OR thesis == BROKEN
OR explicit thesis breaker triggered
```

Technical decline alone cannot mark the thesis BROKEN.

## 24. Confidence

Do not use an arbitrary LLM percentage.

Internal v0.1:

```text
confidence =
0.30 data_completeness
+ 0.25 freshness
+ 0.20 source_quality
+ 0.15 signal_agreement
+ 0.10 thesis_confidence
```

Map:

```text
< 0.55      LOW
0.55–0.79   MEDIUM
>= 0.80     HIGH
```

These weights are hypotheses.

## 25. Contradictory Signals

Preserve contradictions.

Example:

```text
Fundamentals  85
Momentum      82
Valuation     28
Position Fit  35

Company       CONSTRUCTIVE
Market        STRONG
Valuation     EXPENSIVE
Portfolio     OVERWEIGHT

Stance        HOLD / TRIM
```

Do not hide disagreement by averaging everything into one number.

## 26. Audit Trail

Every Playbook stores:

```text
playbook_id
security_id
engine_version
ruleset_version
input_snapshot
market_data_timestamp
fundamental_data_timestamp
thesis_version
scores
states
constraints
stance
rules_triggered
action_zones
confidence
created_at
```

Historical versions are immutable.

Example:

```json
{
  "stance": "HOLD_TRIM",
  "rules_triggered": [
    "HC-001",
    "PB-CONSTRUCTIVE-OVERWEIGHT",
    "TRIM-L1-ELIGIBLE"
  ]
}
```

The UI can therefore display:

```text
CALCULATED
Portfolio weight: 58.6%

RULE
Position exceeds target.

AI ASSESSMENT
Thesis intact.

RESULT
HOLD / TRIM
```

## 27. Transaction → Dynamic Update

Example:

```text
SELL 100 @ €48
```

Pipeline:

```text
save transaction
→ 902 → 802 shares
→ recalculate cost/P&L
→ recalculate position value
→ recalculate portfolio weight
→ recalculate tactical inventory
→ classify concentration
→ apply hard constraints
→ rerun stance rules
→ recalculate action sizing
→ create new Playbook version
```

No LLM is required for this transaction-driven recalculation.

## 28. Recalculation Events

Deterministic:

```text
BUY
SELL
price update
FX update
portfolio-value update
strategy-target change
```

Potential AI evidence processing:

```text
earnings upload
annual report
guidance update
material company event
```

## 29. AI Research Contract

```json
{
  "document_type": "EARNINGS",
  "period": "Q3_2026",
  "extracted_facts": [],
  "guidance_direction": "RAISED",
  "revenue_outlook": "IMPROVING",
  "margin_outlook": "IMPROVING",
  "fcf_outlook": "IMPROVING",
  "company_specific_kpis": [],
  "risks": [],
  "evidence": []
}
```

The deterministic engine maps structured fields to scores/states.

## 30. AI Explanation Contract

AI receives the already-calculated:

```text
stance
scores
states
constraints
rules triggered
action zones
position
strategy
evidence
unknowns
```

It may generate:
- summary;
- why this stance;
- more-bullish conditions;
- more-cautious conditions;
- action-zone explanations.

It **cannot alter the calculated stance**.

## 31. Scientific Validation Plan

A quantitative model must be tested.

### Backtesting
Use historical snapshots without future information. Measure:
- drawdown;
- risk-adjusted return;
- turnover;
- concentration reduction;
- false thesis-break rate;
- signal stability.

### Walk-forward testing
Tune only on past data and test on unseen future periods.

### Sensitivity analysis
Vary weights and thresholds. A useful model should not flip wildly after tiny parameter changes.

### Ablation testing
Test without:
- momentum;
- valuation;
- concentration;
- thesis layer.

Measure whether each component contributes useful information.

### Benchmarks
Compare with:
- buy-and-hold;
- fixed stop-loss;
- fixed take-profit;
- periodic rebalancing;
- simple valuation rules.

### Avoid overfitting
Do not optimize specifically to Unity history. Unity is a seed case, not the training target.

## 32. Parameter Registry

All magic numbers belong in versioned configuration.

```json
{
  "ruleset_version": "0.1",
  "concentration": {
    "moderate_multiplier": 1.15,
    "severe_multiplier": 1.30
  },
  "add": {
    "minimum_fundamental_score": 60,
    "minimum_valuation_score": 60
  },
  "confidence": {
    "medium_threshold": 0.55,
    "high_threshold": 0.80
  }
}
```

## 33. Unity Baseline Test Case

```text
Shares            902
Average cost      €27.76
Reference price   €40.46
Portfolio weight  58.6%
Target max        45%
Core              600–650
Thesis            INTACT
Company state     CONSTRUCTIVE
```

Derived:

```text
Concentration ratio:
58.6 / 45 ≈ 1.302

Excess:
13.6 percentage points

Accumulation:
DISABLED

Tactical inventory above core max:
902 - 650 = 252 shares

Result:
HOLD / GRADUALLY TRIM
```

The stance does not require an LLM.

## 34. Minimum Unit Tests

### Accounting
- buy into empty position;
- additional buy;
- partial sell;
- full sell;
- reject oversell;
- fees;
- FX.

### Concentration
- below target;
- exactly target;
- moderately overweight;
- overweight;
- severely overweight;
- target shares;
- core constraint.

### Rules
- great fundamentals + overweight;
- great fundamentals + within target;
- broken thesis + profitable position;
- weak momentum + intact thesis;
- expensive valuation + overweight;
- stale/missing data.

### Versioning
- transaction creates new snapshot;
- identical deterministic inputs reproduce identical result;
- historical Playbooks remain immutable.

## 35. Invariants

```text
shares >= 0

0 <= portfolio_weight <= 1
unless leverage is explicitly supported

ADD cannot activate while its hard constraint is active

AI cannot override hard constraints

historical Playbooks are immutable

missing data != zero

stale data remains identifiable

price decline alone cannot mark thesis BROKEN
```

## 36. Implementation Order

### Phase A — Portfolio Engine
Implement:
- transactions;
- weighted average cost;
- P&L;
- FX;
- position/portfolio value;
- portfolio weight;
- target shares;
- core/tactical shares.

### Phase B — Rules Engine
Implement:
- concentration states;
- hard constraints;
- stance matrix;
- deterministic action sizing;
- versioned rules.

### Phase C — Signal Engine
Implement:
- fundamentals;
- valuation;
- technical indicators;
- normalization.

Structured mock data is sufficient initially.

### Phase D — AI Evidence
Implement:
- report extraction;
- thesis classification;
- evidence;
- explanations.

### Phase E — Validation
Implement:
- backtest harness;
- sensitivity analysis;
- benchmarks;
- parameter/version tracking.

## 37. Suggested Code Structure

```text
src/
├── domain/
│   ├── portfolio/
│   │   ├── position-engine.ts
│   │   ├── accounting.ts
│   │   └── concentration.ts
│   ├── signals/
│   │   ├── fundamentals.ts
│   │   ├── valuation.ts
│   │   ├── momentum.ts
│   │   └── normalization.ts
│   ├── playbook/
│   │   ├── decision-engine.ts
│   │   ├── hard-constraints.ts
│   │   ├── stance-rules.ts
│   │   ├── action-zones.ts
│   │   └── confidence.ts
│   └── thesis/
│       └── thesis-types.ts
├── config/
│   └── ruleset-v0.1.ts
└── tests/
    ├── portfolio/
    ├── signals/
    └── playbook/
```

Domain logic must remain independent from React.

## 38. Claude Code — Next Implementation Prompt

```text
Read playbook-decision-engine-spec-v0.1.md and the existing
Unity Playbook.

Implement only Phase A and Phase B first.

Requirements:

1. Keep investment calculations in pure TypeScript domain
   functions independent from React.

2. Implement shares, weighted average cost, realized P/L,
   unrealized P/L and position value.

3. Implement portfolio weight and target-share calculations.

4. Implement core/tactical share calculations.

5. Implement concentration states and hard constraints.

6. Implement the initial stance rule matrix.

7. Implement deterministic trim sizing.

8. Put every threshold in a versioned ruleset config.
   Do not scatter magic numbers through application code.

9. Add unit tests for calculations and rules.

10. Do NOT implement AI, external market APIs, PDF parsing,
    valuation scoring, or technical indicators yet.

11. Wire the existing Unity local-mock prototype to consume
    Decision Engine output instead of hard-coded stance,
    concentration, and action sizing.

Before editing code, inspect the repository and propose a
minimal migration plan. Preserve the existing UI unless a
change is necessary to expose calculated engine output.
```

## 39. Definition of Done — v0.1

```text
✓ User can add BUY
✓ User can add SELL
✓ Shares recalculate
✓ Average cost recalculates
✓ Realized/unrealized P&L recalculates
✓ Portfolio weight recalculates
✓ Target shares recalculate
✓ Core/tactical shares recalculate
✓ Concentration state changes dynamically
✓ Hard constraints execute deterministically
✓ Stance updates from explicit rules
✓ Trim sizing updates
✓ Same inputs produce same deterministic output
✓ Triggered rules are exposed
✓ Core calculations have unit tests
✓ Transaction-driven updates require no AI
```

## Appendix — Principle

The long-term goal is not to make the algorithm complicated.

> **Make every important assumption explicit, measurable, testable, versioned, and falsifiable.**

A simple rule with strong validation is preferable to a sophisticated-looking formula that has never been tested.
