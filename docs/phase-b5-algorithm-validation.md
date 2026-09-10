# Phase B.5 — Algorithm Validation

## Overall Goal

Validate that the Playbook Decision Engine behaves correctly,
consistently, deterministically, and explainably before we integrate
real market data, real fundamentals, or AI research.

Phase B.5 is primarily a VALIDATION phase, not a feature-development phase.

Every scenario should follow:

```
Input
→ Calculation
→ Rules Triggered
→ State
→ Stance
→ Action
→ PASS / FAIL
```

Failures should be classified as:

1. IMPLEMENTATION BUG
2. RULE / MODEL DESIGN QUESTION
3. NOT YET IMPLEMENTED

A failed validation must NOT automatically cause a rule change.

### Validation report template

Each scenario's report should map the flow above onto the real
`EngineOutput` shape (see *Current Architecture Context*) so results are
traceable back to actual fields, not paraphrased:

| Step | Source |
|---|---|
| Input | `EngineInput` — `position`, `portfolioTotalEur`, `executionPriceEur`, `strategy`, `thesisHealth`, `scorecard`, `actionZoneTemplates` |
| Calculation | intermediate values (weight %, ratios) used to reach the states below |
| Rules Triggered | `EngineOutput.constraints` (`hc001`, `hc002`, `fired`) — HC-003 is transaction-time only, not part of engine output (see below) |
| State | `EngineOutput.concentration.state` |
| Stance | `EngineOutput.stance` |
| Action | `EngineOutput.actionZones[].state`, `EngineOutput.concentration.trimSizing` |
| Result | PASS / FAIL (+ classification if FAIL) |

---

## Generalization Principle

Every rule introduced during B.5 should be challenged with:

> "Is this a general portfolio/investment rule, or is it only true
> because of Unity's current situation?"

Keep three concepts clearly separated:

1. **Generic algorithms** — e.g. average cost, P&L, portfolio weight.
2. **Generic decision framework** — e.g. Position → Concentration →
   Thesis → Constraints → Stance → Action.
3. **Per-stock / per-user strategy configuration** — e.g. target
   weight range, core shares, concentration limits.

Do not allow category 3 values to become hard-coded generic rules.

---

## B.5.1 — Unity Baseline Validation

Validate the current Unity baseline through:

Position
→ Concentration
→ Thesis
→ Hard Constraints
→ Stance
→ Action Zones
→ Scorecard
→ Trim Sizing

Goal:
Confirm that the current Playbook produces an internally consistent
and explainable baseline decision.

**Status: COMPLETE.** The Position → Concentration → Thesis →
Constraints → Stance → Action chain validated cleanly (see
`docs/validation/b5.1-baseline-report.md`). Trim Sizing surfaced a
genuine open question rather than a clear-cut defect — after external
review, reclassified from IMPLEMENTATION BUG to **RULE / MODEL DESIGN
QUESTION**, and resolved by design in *B.5.1 Resolution* below.

---

## B.5.1 Resolution — Target Position & Sizing Model

**Status: IMPLEMENTATION COMPLETE (2026-09-08).** All three prerequisites
below are done. **B.5.2 (Transaction Validation) is now unblocked.**
Full formal definition lives in `docs/playbook-decision-engine-spec-v0.1.md`
§21A; the implementation lives in `src/domain/portfolio/target-position.ts`
(`deriveTargetPosition`, `resolveCoreShareRange`), wired into
`EngineOutput.targetPosition` via `runDecisionEngine`.

### Why this exists

B.5.1 found that the current strategy configuration carries two
related-but-distinct ceilings, and neither the spec nor the
implementation defined how they interact for tactical trimming:

- **Target weight range** — approximately 40–45% (`mediumTermTargetMinPct` / `mediumTermTargetMaxPct`)
- **Core share range** — 600–650 shares (`coreSharesMin` / `coreSharesMax`)

### Approved model (summary — see spec §21A for full formulas)

A generic, two-sided **Target Position & Sizing Model**, symmetric for
UNDERWEIGHT (add capacity) and OVERWEIGHT (trim capacity) positions:

- **Feasible Strategy Range** = intersection of the weight-implied share
  range and the core share range — where both strategy objectives are
  simultaneously satisfied.
- **Strategy Alignment** — `ALIGNED` (ranges intersect) or `CONFLICTING`
  (they don't). Kept to two states in v0.1; a `PARTIALLY_ALIGNED`
  middle state was considered and deliberately deferred (see *Deferred
  for later* below).
- **Three capacity tiers**, both directions: **Minimum** (driven only by
  the target weight range, never core), **Preferred** (nearest point
  satisfying both constraints, or an explicit/heuristic midpoint when no
  core range exists), **Maximum Normal** (bounded by the Feasible
  Strategy Range — protects both the weight floor and the core floor
  simultaneously; thesis-deterioration overrides remain HC-003's job,
  not this model's).
- **Capacity ≠ Recommendation.** This model states how much room exists;
  it does not decide entry/valuation/technical timing or whether to act
  now.

### Unity worked example (final, approved figures)

```text
weightShareRange       = [ceil(62280×0.40/40.46), floor(62280×0.45/40.46)] = [616, 692]
coreShareRange           = [600, 650]
feasibleStrategyRange     = [616, 650]  → ALIGNED

Minimum Trim         = 902 - 692 = 210   → 692 shares, ≈45.0%
Preferred Trim         = 902 - 650 = 252   → 650 shares, ≈42.2%
Maximum Normal Trim   = 902 - 616 = 286   → 616 shares, ≈40.0%
```

The lower bound uses `ceil` and the upper bound uses `floor` so that
each edge share count actually satisfies its target-weight guarantee
(the earlier `floor`-only version of this range, `[615, 692]`, let 615
shares round down to 39.96% — technically below the 40% floor).

### Implementation prerequisites before B.5.2

- [x] **Reconcile the portfolio-total convention — done 2026-09-08.**
      Portfolio Total = Securities + Cash, cash implicit in
      `portfolioTotalEur` (no separate ledger). **BUY**: Cash → Security,
      assumed funded from existing portfolio cash during Phase B.5 (not
      external capital/deposits) — total unchanged. **SELL**: Security →
      Cash — total unchanged. Both previously diverged from this (BUY grew
      the total treating it as external capital; SELL shrank it); both now
      go through `calcPortfolioTotalAfterBuy`/`calcPortfolioTotalAfterSell`
      (`src/domain/portfolio/accounting.ts`), used consistently by
      `applyBuy`/`applySell`, the shell, and the modal preview. Deposit/
      withdrawal cash-flow events remain explicitly out of scope for B.5.
- [x] **Implement §21A's formulas in the domain layer — done 2026-09-08.**
      `deriveTargetPosition` (`src/domain/portfolio/target-position.ts`)
      implements Position Sizing State, Weight-Share Range (ceil/floor
      rounding), Feasible Strategy Range, Strategy Alignment
      (`ALIGNED`/`CONFLICTING`/`NOT_APPLICABLE`), and the Minimum/
      Preferred/Maximum Normal capacity tiers for both trim and add
      directions. Wired into `EngineOutput.targetPosition`. Verified
      against the Unity baseline (figures above) and 21 unit tests.
- [x] **Add `preferredTargetWeightPct` as a new optional `Strategy`
      field — done 2026-09-08.** Added to `types/playbook.ts`, alongside
      making `coreSharesMin`/`coreSharesMax` optional as a pair (invalid
      if only one is present — rejected by `resolveCoreShareRange`, not
      silently coerced). The no-core preferred-target branch (explicit
      `preferredTargetWeightPct`, else a labeled midpoint-of-target-range
      default policy heuristic) is implemented and tested.

### Architecture note — two different layers, not equivalent

```text
targetPosition.trimCapacity   = strategic position-capacity boundaries
                                 (minimum / preferred / maximum normal)

concentration.trimSizing      = tactical execution staging
                                 (L1 / L2 / L3)
```

`targetPosition.trimCapacity`/`addCapacity` (spec §21A) answer "how much
room exists to trim or add, given the target weight range and (if
configured) the core range" — a strategic capacity boundary, not tied to
any particular execution plan. `concentration.trimSizing` (spec §21,
original model) answers a narrower, older question: "how should the
tactical inventory above the core ceiling be staged into execution
tranches." They currently coexist unreconciled in `EngineOutput` and
happen to numerically overlap for Unity's specific configuration
(`trimSizing.maxTacticalTrim` = 252 = `trimCapacity.preferred` = 252) —
this is a coincidence of Unity's numbers (core being the tighter upper
constraint), not a general equivalence, and does not hold for arbitrary
strategy configurations (see the generic OVERWEIGHT test in
`target-position.test.ts`, where core `[500,550]` vs. weight range
`[400,600]` diverges from a plain `aboveCoreMax`-based calculation).
**Do not treat these two fields as interchangeable.**

### TODO — deferred integration (not implemented)

Future cleanup should make execution staging (`concentration.trimSizing`'s
L1/L2/L3 split) consume the approved target-position capacity model
(e.g. stage across `minimum`→`preferred`→`maximumNormal` rather than a
single `aboveCoreMax`-derived pool) rather than independently deriving
its own total trim amount. Not implemented here — this is a UI/behavior
change requiring its own review, out of scope for this closeout.

### Deferred for later (not designed now)

- `PARTIALLY_ALIGNED` strategy-alignment state and its gap threshold —
  the two-state `ALIGNED`/`CONFLICTING` model is judged sufficient for
  v0.1; revisit only if validation shows the binary split is too coarse.

---

## B.5.2 — Transaction Validation

**Status: COMPLETE (2026-09-08). B.5.2A (SELL) = PASS. B.5.2B (BUY) = PASS.**
Reports: `docs/validation/b5.2a-sell-report.md`, `docs/validation/b5.2b-buy-report.md`.
Review packets: `docs/review-packets/b5.2a-sell-review-packet.md`,
`docs/review-packets/b5.2b-buy-review-packet.md`.

Validate BUY and SELL propagation.

Check:

- shares
- weighted average cost
- realized / unrealized P&L
- position value
- portfolio weight
- tactical inventory
- concentration
- constraints
- stance
- action sizing

Goal:
Confirm that transactions correctly propagate through the entire
existing Playbook.

Note: BUY/SELL accounting (`applyBuy`/`applySell`) runs *before*
`runDecisionEngine` — the shell applies the transaction, then feeds the
resulting `Position` into the engine as input. HC-003 (core-breach check
on a sell) is invoked directly by `AddTransactionModal`, not by
`runDecisionEngine` — validate it at that call site, not in
`EngineOutput.constraints`.

### Result

Real transaction propagation is now validated in both directions, through
the full chain:

```text
BUY / SELL
  → Position
  → Portfolio Weight
  → Concentration
  → Target Position
  → Constraints
  → Stance
  → Action Zones
```

Both stages used the real `applyBuy()`/`applySell()` path (not
hand-constructed post-transaction state) feeding the real
`runDecisionEngine()`. No implementation bugs found in either direction.
Two items surfaced during B.5.2, neither of which is a B.5.2 failure —
see below.

### Deferred — trimSizing vs. trimCapacity (carried over from B.5.1 Resolution)

`concentration.trimSizing` (old §21 staging model) and
`targetPosition.trimCapacity` (approved §21A model) continue to coexist
unreconciled, and continue to numerically coincide for Unity's specific
configuration (252 = 252 pre-transaction, 152 = 152 after the B.5.2A SELL,
302 = 302 after the B.5.2B BUY) — a coincidence of Unity's core ceiling
being the tighter upper constraint, not a general equivalence. The TODO
recorded in the B.5.1 Resolution closeout (make execution staging consume
the capacity model) remains open and unimplemented.

### Deferred — Transaction Recording vs. Playbook Recommendation (new, from B.5.2B)

**PRODUCT / ARCHITECTURE DESIGN QUESTION — deferred, not a B.5.2
implementation failure.**

B.5.2B found that `AddTransactionModal` allows a BUY to be recorded even
while HC-001 (accumulation disabled) is active — there is no gate tying
BUY entry to that hard constraint, unlike SELL, where HC-003 already
blocks a core-breaching sell.

The underlying design principle, recorded here rather than resolved:

> **Transaction recording and Playbook recommendations are different
> concerns.**
>
> - **Transaction Ledger** — "what actually happened."
> - **Decision Engine / Hard Constraints** — "what the strategy
>   recommends or warns against."

Under this principle, **HC-001 should NOT currently be added as a hard
block preventing a user from recording a BUY that actually occurred** —
doing so would conflate "recording a fact" with "endorsing a decision."

This raises a **symmetric open question about HC-003**: it currently
*does* block a SELL that breaches the configured core floor. If
transaction entry is meant to record real-world facts rather than gate
recommended actions, HC-003 may eventually need to become a
warning/confirmation rather than a hard block, for consistency with the
principle above applied to BUY. **HC-003 is not changed here** — this is
flagged for future product review, not resolved.

Neither HC-001 nor HC-003 blocking behavior was changed as part of this
closeout.

---

## B.5.3 — Concentration Threshold Validation

**Status: COMPLETE (2026-09-08). B.5.3A (50% threshold) = PASS. B.5.3B
(45% threshold) = PASS.**
Reports: `docs/validation/b5.3a-50pct-threshold-report.md`,
`docs/validation/b5.3b-45pct-threshold-report.md`. Review packets:
`docs/review-packets/b5.3a-50pct-threshold-review-packet.md`,
`docs/review-packets/b5.3b-45pct-threshold-review-packet.md`.

Test important portfolio-weight states, including:

- current overweight state
- 50% short-term target
- 45% medium-term target

Validate transitions between concentration states and their effects
on constraints, stance, and action eligibility.

Goal:
Confirm that portfolio concentration genuinely drives Playbook
behavior rather than merely appearing as a UI metric.

### Result

Both thresholds confirmed to genuinely drive behavior, and confirmed
distinct from each other: the 50% short-term ceiling gates
`accumulationEnabled`/HC-001 only; the 45% target maximum separately
gates `ConcentrationState`/`PositionSizingState` and the ADD action
zone's WATCH→ACTIVE transition. Clearing one does not imply clearing
the other (B.5.3A's 49.9% case: HC-001 cleared, still OVERWEIGHT
relative to 45%). No implementation bugs found in either stage.

### Resolved — MODERATELY_OVERWEIGHT stance decision (2026-09-08)

**The previously-tracked "known pre-existing gap" (MODERATELY_OVERWEIGHT
→ HOLD vs. spec's grouped HOLD_TRIM) is now RESOLVED, not an open
question.** Product decision, recorded here:

For v0.1, the concentration → stance ladder is:

```text
WITHIN_TARGET          → HOLD
MODERATELY_OVERWEIGHT  → HOLD
OVERWEIGHT             → HOLD_TRIM
SEVERELY_OVERWEIGHT    → HOLD_GRADUALLY_TRIM
```

Rationale: `MODERATELY_OVERWEIGHT` is a small deviation above the target
range and should not by itself escalate the overall stance to a TRIM
posture — tactical intent at that severity is expressed through Action
Zones (TRIM_1 may show `WATCH`) instead. `OVERWEIGHT` and
`SEVERELY_OVERWEIGHT` represent progressively stronger
concentration-management needs and justify explicit trimming language
in the stance itself. This is a severity ladder, not a binary
threshold — a 45.1% position and a 52% position are deliberately not
treated as the same state.

**No application code changed** — `src/domain/playbook/stance-rules.ts`
already implements exactly this ladder; only `docs/playbook-decision-engine-spec-v0.1.md`
§18 (which previously grouped `MODERATELY_OVERWEIGHT/OVERWEIGHT` together
under one rule) was updated to match. `Stance` (overall strategic
posture) and `Action Zones` (conditional tactical opportunities) remain
an explicit two-layer distinction — Action Zone logic was not touched.

One observation carried forward, not treated as a v0.1 rule problem: the
same `HOLD` label can appear for two structurally different reasons
(the `MODERATELY_OVERWEIGHT` branch vs. the separate `WITHIN_TARGET`
fallback, per the B.5.3B report) — a future explainability/UI
consideration, not something this decision needs to resolve.

---

## B.5.4 — Core Protection Validation

**Status: COMPLETE (2026-09-09). B.5.4A = PASS (2026-09-08). B.5.4B =
PASS (2026-09-09, after an approved HC-003 rule change — see below).**
Report: `docs/validation/b5.4a-core-protection-report.md`. Review
packet: `docs/review-packets/b5.4a-core-protection-review-packet.md`.
B.5.4B report: `docs/validation/b5.4b-thesis-core-protection-report.md`
(follows the lean single-report format in `docs/VALIDATION_PROTOCOL.md`
— no separate review packet).

Validate behavior around the configured Unity core position:

600–650 shares.

Test tactical selling near and below the core boundary.

Goal:
Confirm that normal tactical actions protect the long-term core,
while higher-priority thesis/risk rules behave according to the
ruleset.

### B.5.4A result (healthy thesis only)

All three core-protection boundary cases matched the approved strategy
semantics exactly (600 shares remaining = allowed; 599 = blocked, both
starting from 650 and from 600 shares). No implementation bugs found.

### Resolved — HC-003 vs. `targetPosition.maximumNormalTrim` (2026-09-09)

**Classification: RESOLVED — INTENDED CROSS-LAYER DISTINCTION.** (Was
provisionally flagged during B.5.4A as `FAIL — RULE / MODEL DESIGN
QUESTION`; the original finding is preserved in the B.5.4A report, with
a resolution note added there rather than rewritten.)

B.5.4A found that at 650 Unity shares, HC-003 permits selling up to 50
shares before breaching the core (600), while `targetPosition.trimCapacity.maximumNormal`
reports a more conservative 34 — because `maximumNormalTrim` also
considers the weight-target-implied floor (616 shares), which is
stricter than the core floor (600) for Unity's current configuration.

**Product decision:** this divergence is intentional, not a defect.
The two layers have deliberately different responsibilities:

- **HC-003** — core-only. Protects the explicitly configured long-term
  core-share minimum. Answers *"Would this SELL breach the committed
  long-term core?"* Does **not** consider the target-weight minimum.
  Not extended.
- **`maximumNormalTrim`** — core-and-weight-aware. Protects the upper
  boundary of *normal* strategic trimming across the full Target
  Position model — `max(coreSharesMin, weightShareRange.min)`. May
  therefore be more conservative than HC-003.

**Three-level distinction confirmed for the Unity worked example (650
shares, thesis INTACT):**

```text
SELL 34      → within normal strategic capacity
SELL 35-50   → exceeds normal strategic capacity, still HC-003-clean
SELL 51+     → breaches the core floor, HC-003 triggers
```

Full responsibility-boundary documentation added to
`docs/playbook-decision-engine-spec-v0.1.md` §21A. **No application
code, formulas, or tests changed** — this was a semantic/model
resolution only. No new warning behavior was added for the middle band
(exceeds `maximumNormalTrim` but HC-003-clean); that remains a
possible future execution/UX consideration, not decided here.

### B.5.4B result — HC-003 under thesis deterioration (2026-09-09)

Validated `checkHC003` and `runDecisionEngine` across INTACT/WEAKENING/
BROKEN at the same 650-share Unity position (SELL 100 → remaining 550).
Original validation found HC-003 treated WEAKENING and BROKEN
identically (both waived core protection), while the rest of the engine
(HC-002, stance) already distinguishes BROKEN as a stronger, unconditional
override from WEAKENING — surfaced as a RULE / MODEL DESIGN QUESTION.

**Resolved by product decision (2026-09-09): HC-003 now distinguishes
WEAKENING from BROKEN.**

```text
INTACT     → core protection active
WEAKENING  → core protection remains active — thesis is under concern,
             but the long-term core commitment has not yet been invalidated
BROKEN     → core protection removed — the thesis supporting the
             long-term core is no longer valid
```

`checkHC003` (`src/domain/playbook/hard-constraints.ts`) updated
accordingly; spec §16 updated with the same rule. `targetPosition`/
`maximumNormalTrim` were not redesigned — they remain thesis-independent,
per the existing B.5.1 Resolution model. Full detail, before/after
tables, and the deferred cross-layer signaling issue:
`docs/validation/b5.4b-thesis-core-protection-report.md`.

### Deferred — cross-layer signaling gap (`maximumNormalTrim` vs. thesis-deteriorated HC-003)

Not resolved by the B.5.4B change above. Once thesis is BROKEN, HC-003
may permit a sell past `maximumNormalTrim`'s own boundary with no signal
in `targetPosition`'s output that its healthy-thesis precondition no
longer holds. `maximumNormalTrim` remains the NORMAL strategic-capacity
boundary only — it does not become thesis-sensitive, and no
risk-reduction/exit-capacity concept was introduced. Tracked in spec
§21A; not a defect.

### Deferred — Transaction Recording vs. Playbook Recommendation (retained from B.5.2B)

Still open, not addressed by this resolution: whether HC-003 should
eventually become a warning/confirmation that still allows recording a
real-world core-breaching transaction, rather than a hard block. The
transaction ledger ("what happened") vs. Decision Engine guardrails
("what's recommended") distinction from B.5.2B still applies here and
remains unresolved.

---

## B.5.5 — Thesis Validation

**Status: COMPLETE (2026-09-09).** Ran under
`docs/VALIDATION_PROTOCOL.md`. Report:
`docs/validation/b5.5-thesis-validation-report.md`. No implementation
bugs.

**v0.1 decision (2026-09-09):** implemented spec §22's `thesis IN
[INTACT, STRENGTHENING]` ADD-eligibility clause. `STRENGTHENING`/
`INTACT` are ADD-eligible; `MIXED`/`WEAKENING`/`BROKEN` are not. MIXED
and WEAKENING deliberately share this outcome for v0.1 — no new
stance/HC rule was added to separate them; their semantic distinction
remains in `ThesisHealth`/`scorecard.thesisHealth` and may matter more
once Phase C/D evidence and fundamental logic land. BROKEN stays
structurally different: it is the only state where HC-003 core
protection is removed, and it is additionally ADD-ineligible via
HC-002. Implemented in `src/domain/thesis/thesis.ts`
(`isThesisEligibleForAdd`) and `src/domain/playbook/action-zones.ts`
(`deriveActionZoneState`'s ADD case now takes an `AddEligibility {
accumulationEnabled, thesisEligible }` gate object, structured so
Phase C fundamentals/valuation gates can be added later without
restructuring the function). No other rule (HC-001/002/003, stance, or
any other action zone) was changed. The `fundamental_score >= 60`/
`valuation_score >= 60` clauses of spec §22 remain NOT YET
IMPLEMENTED — genuinely deferred to Phase C.

Revalidated all thesis states:

- STRENGTHENING
- INTACT
- MIXED
- WEAKENING
- BROKEN

No AI integration yet.

Goal:
Confirm that changes in investment thesis can affect the Playbook
independently from stock-price or portfolio changes.

Pay particular attention to rule priority when thesis becomes
WEAKENING or BROKEN.

---

## B.5.6 — Contradictions & Failure States

**Status: COMPLETE (2026-09-09).** Ran under `docs/VALIDATION_PROTOCOL.md`.
Report: `docs/validation/b5.6-contradictions-failure-states-report.md`.
No implementation bugs; no rule/model design question requiring a
decision to close this checkpoint (two deferred architecture gaps
documented below, consistent with this section's own pre-checkpoint
expectation).

Validated:

- strong fundamentals + momentum + expensive valuation + OVERWEIGHT
  concentration — **PASS**: all six scorecard dimensions stay
  independent (no blended/composite score anywhere in `EngineOutput`);
  stance/ADD/TRIM zones are driven by concentration + HC-001 as
  designed; expensive valuation is visible but doesn't yet gate
  anything (same already-documented Phase C deferral as spec §22's
  score thresholds, not a new gap).
- strong company signals (9/9/9) + thesis MIXED — **PASS**: the spec
  §22 thesis-eligibility gate (implemented in B.5.5) correctly keeps
  `ADD = INACTIVE` even though fundamentals/valuation/momentum are all
  strong and accumulation is enabled — confirms thesis caution wins
  over strong company signals, contradiction preserved rather than
  hidden.
- missing required signal data — **NOT YET IMPLEMENTED**. No field in
  `ScoreItem`/`Scorecard`/`MarketData`/`Position` is optional/nullable;
  no `INCOMPLETE` state exists in any union; HC-005 (spec §16) doesn't
  exist in `hard-constraints.ts`. Demonstrated directly: an all-zero
  scorecard (closest available stand-in for "no data") still produces
  a fully ordinary `HOLD` stance and `ADD = ACTIVE` — missing data
  currently *can* produce a fully assertive action output, because
  nothing detects or represents its absence.
- stale market/fundamental data — **NOT YET IMPLEMENTED**. `EngineInput`
  never carries `MarketData.updatedAt` or any timestamp at all (only a
  bare `executionPriceEur: number` crosses the boundary); `EngineOutput`
  has no `confidence` field; `Playbook.confidence` is a static seed
  value with no `deriveConfidence` function anywhere; HC-004 (spec §16)
  doesn't exist. Staleness cannot currently suppress or downgrade
  anything — the architecture has no path for it to reach the decision
  layer.

Goal (met):
Confirm that the engine preserves contradictions and uncertainty
rather than hiding them behind a single score or producing false
certainty. Confirmed for the two implemented-logic scenarios (PASS);
confirmed the architecture genuinely does not yet support missing/stale
-data semantics for the other two (NOT YET IMPLEMENTED, not a bug —
matches this section's pre-checkpoint expectation below).

Note (pre-checkpoint expectation, confirmed correct): the codebase had
no representation of "missing" or "stale" data anywhere in the domain
layer (`MarketData.updatedAt` exists but nothing reads it; no field is
optional/nullable to model absence). This stage surfaced exactly that,
as **NOT YET IMPLEMENTED** findings rather than pass/fail results on
existing logic — see *Current Architecture Context*, and the B.5.6
report's findings 4–5 for the full detail. Building HC-004/HC-005,
`deriveConfidence`, and a real missing/stale-data type model remains
unscoped — a candidate for a future dedicated checkpoint or phase, not
decided here.

---

## B.5.7 — Generalization Test

**Status: COMPLETE (2026-09-09).** Ran under `docs/VALIDATION_PROTOCOL.md`.
Report: `docs/validation/b5.7-generalization-report.md`. No
implementation bugs; no rule/model design question requiring a
decision.

Validated three fully synthetic strategies through the real, unmodified
`runDecisionEngine()` — the first B.5 checkpoint to use anything other
than Unity's seed data:

- **A — ZeroCo:** 0 shares (new position), weight-only strategy (8–12%
  target, no core range), no explicit `preferredTargetWeightPct`
  (exercises the midpoint fallback), thesis STRENGTHENING.
- **B — Beta Corp:** 50-share UNDERWEIGHT position, different
  price/portfolio scale (€120 / €200,000), weight-only strategy (5–8%
  target), explicit `preferredTargetWeightPct: 6`, thesis INTACT.
- **C — Gamma Semi:** 15,000-share OVERWEIGHT position, its own target
  range (18–25%), a 35% short-term ceiling deliberately decoupled from
  that target max, its own core range (9,500–10,500 shares), thesis
  WEAKENING (exercises `REDUCE_RISK` and HC-003 generically).

All three produced correct `PositionSizingState`, preferred targets,
add/trim capacities, `ConcentrationState`, HC-001/002/003 behavior,
thesis ADD eligibility, stance, and action zones — **PASS** on all
counts, with zero Unity-specific coupling found in
`engine.ts`/`concentration.ts`/`target-position.ts`/
`hard-constraints.ts`/`stance-rules.ts`/`action-zones.ts`/`scoring.ts`/
`thesis.ts`/`signals.ts`/`ruleset-v0.1.ts` (checked directly via source
inspection). Gamma Semi additionally proved HC-001 and
concentration-OVERWEIGHT are genuinely independent per-strategy knobs —
they only always co-occur in Unity's own configuration (a numeric
coincidence flagged in B.5.6), not a hidden general rule.

Goal:
Verify that the Decision Engine is a generic Stock Playbook Engine,
not a Unity-specific calculator.

Use at least one second stock with materially different characteristics
from Unity.

The test should NOT require real market data yet.

Provide mock/static:

- position
- portfolio context
- strategy configuration
- thesis state
- signal inputs

Then run the SAME Decision Engine.

Validate that:

- no Unity-specific ticker logic exists in the engine;
- target weights are configurable;
- core position rules are configurable;
- concentration thresholds are generic;
- stance rules operate on normalized states rather than company names;
- action sizing works with another position size and strategy;
- thesis states use the same contract;
- the engine does not depend on Unity seed data;
- no hard-coded 45%, 50%, 600, 650, 902, or other Unity-specific values
  exist inside generic domain logic.

The purpose is to answer:

"Can a new stock be added by supplying data + strategy configuration,
without changing the generic Decision Engine?"

Uses mock/static data only — no real market-data APIs, no live feeds,
no real fundamentals. Stays inside the Scope Boundary below; does not
pull Phase C/D/E work forward.

**Implemented and validated — see *Status* above.** This was the last
checkpoint in the B.5 Algorithm Validation phase's original checklist;
Phase C (real fundamentals/valuation/technical formulas) is next, not a
further B.5.x sub-checkpoint.

---

# Current Architecture Context

## Layers with real, deterministic logic today

| Layer | File | Notes |
|---|---|---|
| Position / Accounting | `src/domain/portfolio/accounting.ts` | `applyBuy`, `applySell`, `previewBuy`, `previewSell` — real weighted-average-cost math, real realized/unrealized P&L. **Not called by `runDecisionEngine`** — the shell applies a transaction first, then passes the resulting `Position` in as engine input. |
| Concentration | `src/domain/portfolio/concentration.ts` | `classifyConcentration`, `calcTargetShares`, `calcTacticalInventory`, `calcTrimSizing` — real, threshold-driven (`RULESET.concentration.moderateMultiplier = 1.15`, `severeMultiplier = 1.30`). Exposed as `EngineOutput.concentration`. |
| Hard Constraints | `src/domain/playbook/hard-constraints.ts` | HC-001 (weight > `shortTermMaxWeightPct` blocks ADD), HC-002 (`thesisHealth === "BROKEN"` blocks ADD) — real, exposed as `EngineOutput.constraints`. HC-003 (tactical sell breaching `coreSharesMin`, unless thesis deteriorating) is real but is invoked only by `AddTransactionModal` at transaction time — **not part of `EngineOutput`**. |
| Decision / Stance | `src/domain/playbook/stance-rules.ts` | `deriveStance(concentrationState, thesisHealth)` — real priority matrix (BROKEN → `THESIS_REVIEW`; WEAKENING + overweight → `REDUCE_RISK`; SEVERELY_OVERWEIGHT → `HOLD_GRADUALLY_TRIM`; OVERWEIGHT → `HOLD_TRIM`; MODERATELY_OVERWEIGHT → `HOLD`; WITHIN_TARGET → `HOLD`). Exposed as `EngineOutput.stance`. |
| Action Zones | `src/domain/playbook/action-zones.ts` | `deriveActionZoneState` — real, derived from concentration state + (for ADD only, since B.5.5) an `AddEligibility` gate object combining `accumulationEnabled` and `thesisEligible` (spec §22). Exposed as `EngineOutput.actionZones[].state`. Zone copy (title/summary/whyBullets/etc.) is static seed content — only `state` is computed. |
| Scorecard (position/concentration dimensions) | `src/domain/playbook/scoring.ts` | `calcPositionFitScore` (uses `RULESET.positionFit.penaltyCoefficient = 200`) and `calcConcentrationRiskScore` — real, re-derived on every engine run. |
| Trim Sizing | `src/domain/portfolio/concentration.ts` (`calcTrimSizing`) | Real, deterministic L1/L2/L3 split of `tacticalInventory.aboveCoreMax` (`RULESET.trimStaging.level1Fraction = 0.30`, `level2Fraction = 0.35`, L3 = remainder). Exposed as `EngineOutput.concentration.trimSizing` — **nested under `concentration`, not a top-level `EngineOutput` field.** |
| `runDecisionEngine()` | `src/domain/engine.ts` | Real composition root. Sequences: thesis → signals → concentration → hard constraints → stance → action zones → scorecard → trim sizing. Pure, no React, fully unit-tested (33 tests across `engine.test.ts`, `thesis.test.ts`, `signals.test.ts`, plus a static guardrail proving `PlaybookClientShell` never imports the individual domain modules directly). |
| `EngineOutput` | `src/domain/engine.ts` | Real, current shape — see below. |
| `PlaybookSnapshot` | `src/domain/engine.ts` | **Type only.** `{ position, portfolioTotalEur, engine: EngineOutput }`. Not yet constructed or persisted anywhere — no history/snapshot feature exists in the app. |

`EngineOutput`, as it exists today:

```ts
interface EngineOutput {
  concentration: {
    state: ConcentrationState;
    targetShares: number;
    sharesToTarget: number;
    tacticalInventory: TacticalInventory;
    trimSizing: TrimSizing;
  };
  thesis: { health: ThesisHealth };
  constraints: {
    hc001: HardConstraintResult;
    hc002: HardConstraintResult;
    fired: HardConstraintResult[];
    accumulationEnabled: boolean;
  };
  stance: Stance;
  actionZones: ActionZone[];
  scorecard: Scorecard;
}
```

## Layers currently using static/mock inputs (no real computation yet)

| Layer | File | Notes |
|---|---|---|
| Fundamentals / Valuation / Technical | `src/domain/signals/signals.ts` | `deriveFundamentalsScore`, `deriveValuationScore`, `deriveTechnicalScore`, `deriveSignals` are pure pass-throughs of the static seed `Scorecard` (`unityScorecard` in `unity-seed.ts`). No real formulas exist. |
| Thesis classification | `src/domain/thesis/thesis.ts` | `deriveThesisHealth` is an identity pass-through. The actual `ThesisHealth` value (`unitySeed.playbook.thesisHealth`) is a hand-set seed field, not derived from any evidence, report, or rule. |
| Confidence | `src/types/playbook.ts` (`Playbook.confidence`) | Static seed field (`"MEDIUM"`). `RULESET.confidence.mediumThreshold`/`highThreshold` exist in config but no `deriveConfidence` function reads them — nothing in the domain layer computes this yet. |
| Market data | `src/data/unity-seed.ts` (`MarketData`) | `executionPriceEur`, `primaryPriceUsd`, `dailyChangePct`, `updatedAt` are static, manually maintained seed values — not a live feed, and `updatedAt` is not read anywhere to detect staleness. |
| Thesis narrative content | `src/data/unity-seed.ts` (`unityThesis`) | Catalysts/risks/thesis-breakers are static copy rendered by `ThesisCard` — not consumed by the engine at all. |

## Layers intended for future phases (not implemented — no code exists)

- **Phase C** — real fundamentals/valuation/technical-indicator formulas and normalization (would replace the pass-throughs in `src/domain/signals/`)
- **Phase D** — AI report extraction, thesis classification, evidence surfacing (would replace `deriveThesisHealth`'s pass-through)
- **Phase E** — backtest harness, sensitivity analysis, benchmarks, ruleset-version tracking
- **Confidence derivation** — spec §37 suggests `domain/playbook/confidence.ts`; this file does not exist
- **`PlaybookSnapshot` persistence/history** — the type exists; no storage or read path is implemented
- **Missing/stale data handling** — no domain type currently models "value absent" or "value stale" (see B.5.6 note above)

## RESOLVED — MODERATELY_OVERWEIGHT stance question (was: "known pre-existing gap relevant to B.5.3")

`deriveStance`'s `MODERATELY_OVERWEIGHT` branch returns plain `HOLD`,
distinct from `OVERWEIGHT`'s `HOLD_TRIM`. This was flagged pre-B.5 as a
discrepancy against the spec's original text, which grouped
`MODERATELY_OVERWEIGHT/OVERWEIGHT` together under one rule, and was
carried as an open **RULE / MODEL DESIGN QUESTION** through B.5.1–B.5.3B.

**Resolved 2026-09-08** (see the B.5.3 checkpoint above for the full
decision and rationale): the current implementation's behavior is the
approved v0.1 severity ladder. The spec (§18) has been updated to match;
no application code changed. No longer an open question.

---

# Scope Boundary

Phase B.5 does NOT include:

- real market-data APIs
- live OHLCV
- real FX feeds
- real fundamental-data APIs
- production valuation models
- production technical indicators
- AI financial research
- AI report analysis
- AI thesis generation

These belong to later phases.

---

# Execution Rule

We will complete B.5 ONE STAGE AT A TIME.

Do not proceed automatically from B.5.1 to B.5.2, etc.

Each stage must:

1. be implemented/tested;
2. produce a validation report;
3. be reviewed;
4. receive explicit approval before the next stage starts.

## Progress tracker

- [x] B.5.1 Unity Baseline Validation — complete; produced a model-design question (Trim Sizing), resolved by design in *B.5.1 Resolution*
- [x] B.5.1 Resolution — Target Position & Sizing Model — designed, approved, and **implementation-complete** 2026-09-08 (all three prerequisites done: portfolio-total convention, with-core §21A model, no-core + `preferredTargetWeightPct`)
- [x] B.5.2 Transaction Validation — **COMPLETE** 2026-09-08 (B.5.2A SELL = PASS, B.5.2B BUY = PASS); surfaced a deferred product/architecture question on transaction recording vs. Playbook recommendation (see checkpoint section above) — not a B.5.2 failure
- [x] B.5.3 Concentration Threshold Validation — **COMPLETE** 2026-09-08 (B.5.3A 50% threshold = PASS, B.5.3B 45% threshold = PASS); resolved the standing MODERATELY_OVERWEIGHT stance question by product decision (see checkpoint section above) — no application code changed
- [x] B.5.4 Core Protection Validation — **COMPLETE** 2026-09-09 (B.5.4A healthy-thesis = PASS 2026-09-08; HC-003/`maximumNormalTrim` cross-layer question RESOLVED 2026-09-09; B.5.4B WEAKENING/BROKEN thesis = PASS 2026-09-09 after an approved HC-003 rule change — see checkpoint section above); cross-layer signaling gap deferred, not blocking
- [x] B.5.5 Thesis Validation — **COMPLETE** 2026-09-09 (see checkpoint section above); spec §22 ADD thesis-eligibility clause implemented per the v0.1 decision (STRENGTHENING/INTACT eligible; MIXED/WEAKENING/BROKEN ineligible), all five thesis states revalidated, no implementation bugs
- [x] B.5.6 Contradictions & Failure States — **COMPLETE** 2026-09-09 (see checkpoint section above); no implementation bugs; missing/stale-data semantics confirmed NOT YET IMPLEMENTED (architecture gap, not a bug), no code changed
- [x] B.5.7 Generalization Test — **COMPLETE** 2026-09-09 (see checkpoint section above); three synthetic strategies (zero position, underweight, overweight — with and without a core range) validated end-to-end through the real engine; no implementation bugs, no hidden Unity-specific coupling found, no decision required

**Phase B.5 Algorithm Validation is now fully complete (B.5.1–B.5.7).**
The deterministic Phase B engine is validated as stock-generic within
its current scope — see the B.5.7 report's *Conclusion* for the exact
scope boundary. **Phase C (real fundamentals/valuation/technical
formulas) is NEXT** — not started; this roadmap's checklist does not
define further B.5.x sub-checkpoints beyond B.5.7.

Update this checklist only when a stage has actually been completed and approved.

---

# Phase B.5 Closeout (2026-09-09)

Ran under `docs/VALIDATION_PROTOCOL.md`. No application code changed by
this closeout — it consolidates B.5.1–B.5.7, all already individually
COMPLETE (see checkpoint sections and the progress tracker above).

## 1. What is now validated

All via real domain function calls / real `runDecisionEngine()`, not
hand-derived output (see each checkpoint's report under
`docs/validation/` for detail):

- **Transaction accounting** — `applyBuy`/`applySell`: weighted-average
  cost, realized/unrealized P&L, position value (B.5.2A/B.5.2B).
- **Cash-inclusive portfolio total** — Portfolio Total = Securities +
  Cash; BUY/SELL both leave `portfolioTotalEur` unchanged
  (`calcPortfolioTotalAfterBuy`/`calcPortfolioTotalAfterSell`) (B.5.1
  Resolution, B.5.2).
- **Concentration states** — `classifyConcentration` against each
  strategy's own `mediumTermTargetMaxPct` and the generic
  `RULESET.concentration` multipliers; 50%/45% Unity thresholds and two
  independently-configured synthetic thresholds all confirmed
  behaviorally correct and genuinely threshold-driven, not cosmetic
  (B.5.3A/B.5.3B, B.5.7).
- **Target-position / sizing model** — Weight-Share Range,
  Feasible Strategy Range, Strategy Alignment
  (`ALIGNED`/`CONFLICTING`/`NOT_APPLICABLE`), and the Minimum/Preferred/
  Maximum-Normal capacity tiers, for both trim and add directions, with
  and without a configured core range, including the
  `preferredTargetWeightPct` no-core path (B.5.1 Resolution, B.5.7).
- **BUY/SELL propagation** — full chain from a transaction through
  Position → Portfolio Weight → Concentration → Target Position →
  Constraints → Stance → Action Zones, using the real `applyBuy`/
  `applySell` path feeding the real engine, not hand-constructed
  post-transaction state (B.5.2A/B.5.2B).
- **Hard constraints** — HC-001 (weight-limit accumulation block),
  HC-002 (BROKEN-thesis accumulation block + THESIS_REVIEW), HC-003
  (core-breach sell protection, WEAKENING-preserves/BROKEN-removes),
  confirmed independently configurable per strategy, not Unity-coupled
  (B.5.2, B.5.4A, B.5.4B, B.5.7).
- **Thesis ADD eligibility** — spec §22's `thesis IN [INTACT,
  STRENGTHENING]` clause, implemented and revalidated across all five
  `ThesisHealth` states; MIXED/WEAKENING deliberately share the
  ADD-ineligible outcome for v0.1, BROKEN structurally distinct via
  HC-002 (B.5.5, reconfirmed generically in B.5.6/B.5.7).
- **Core protection** — HC-003 vs. `targetPosition.maximumNormalTrim`
  as an intentional two-layer distinction (core-only vs.
  core-and-weight-aware); HC-003's WEAKENING/BROKEN distinction; all
  reconfirmed against a strategy with its own, different core range
  (B.5.4A, B.5.4B, B.5.7).
- **Stance / action-zone transitions** — the full concentration ×
  thesis priority matrix (`HOLD`, `HOLD_TRIM`, `HOLD_GRADUALLY_TRIM`,
  `REDUCE_RISK`, `THESIS_REVIEW`) and all five action zones
  (`ADD`/`HOLD`/`TRIM_1`/`TRIM_2`/`THESIS_REVIEW`), including the
  `REDUCE_RISK` branch, exercised against Unity and against a synthetic
  strategy (B.5.1, B.5.3, B.5.4, B.5.5, B.5.7).
- **Stock-generic behavior across multiple synthetic strategies** —
  B.5.7 proved the engine is **configurable and stock-generic within
  its current scope**: three fully synthetic strategies (a zero-share
  new position with no core range, an UNDERWEIGHT position at a
  different price/portfolio scale with an explicit
  `preferredTargetWeightPct`, and an OVERWEIGHT position with its own
  target range, short-term ceiling, and core range) all ran correctly
  through the unmodified real engine, with zero Unity-specific
  numerical coupling found anywhere in the domain/rule logic.

## 2. Deferred items

None of these are B.5 failures — each was explicitly classified NOT YET
IMPLEMENTED or a deferred product/architecture question during the
checkpoint that surfaced it, per `docs/VALIDATION_PROTOCOL.md` §1/§8.
Carried forward as a single list, not re-litigated:

- **Missing/stale-data semantics** — no field in `ScoreItem`/
  `Scorecard`/`MarketData`/`Position` is optional/nullable; no
  `INCOMPLETE` state exists anywhere; an all-zero ("missing") scorecard
  is processed identically to a genuinely bad one (B.5.6).
- **Derived confidence model** — `Playbook.confidence` is a static seed
  value; no `deriveConfidence` function exists; `RULESET.confidence`'s
  weights/thresholds (spec §24) are configured but unread;
  `EngineOutput` has no `confidence` field at all (B.5.6).
- **HC-004 / HC-005** — spec §16's stale-data and missing-evidence hard
  constraints do not exist in `hard-constraints.ts` (B.5.6).
- **`trimSizing` vs. `targetPosition.trimCapacity` integration** — the
  older §21 tactical L1/L2/L3 staging model and the approved §21A
  capacity model coexist unreconciled; they numerically coincide for
  Unity's specific configuration only, not in general (B.5.1
  Resolution, B.5.2).
- **Transaction recording vs. strategy guardrails** — whether HC-003
  should eventually become a warning/confirmation (allowing a
  real-world core-breaching SELL to still be recorded) rather than a
  hard block, for consistency with HC-001 not gating BUY entry
  (B.5.2B).
- **Possible warning when exceeding `maximumNormalTrim`** — no
  execution/UX signal exists today for a sell that clears HC-003 but
  exceeds the more conservative `maximumNormalTrim` boundary (B.5.4A);
  and once thesis is BROKEN, HC-003 may permit a sell past
  `maximumNormalTrim` with no signal that its healthy-thesis
  precondition no longer holds (B.5.4B).
- **Real fundamentals / valuation / technical models** — `signals.ts`
  remains a pure pass-through of seed scorecard values; spec §22's
  `fundamental_score >= 60`/`valuation_score >= 60` ADD clauses are not
  implemented; no rule in `deriveStance`/`deriveActionZoneState` reads
  `scorecard.fundamentals`/`valuation` yet (B.5.5, B.5.6) — this is
  Phase C scope.
- **AI research / thesis evidence** — `deriveThesisHealth` remains an
  identity pass-through of a hand-set seed value; no AI report
  extraction, evidence surfacing, or thesis classification exists — this
  is Phase D scope.

## 3. Phase C entry criteria

**Phase C can begin.** The deterministic engine — concentration,
target-position/sizing, hard constraints, thesis-eligibility gating,
stance, and action zones — is now validated **independently of any
external market-data provider**: every B.5 checkpoint ran against
static seed/synthetic fixtures only, and B.5.7 specifically confirmed
the engine is **configurable and stock-generic within its current
scope**, not a Unity-specific calculator. Phase C's job is to replace
`src/domain/signals/signals.ts`'s pass-throughs with real fundamentals/
valuation/technical formulas and wire spec §22's score-threshold clauses
in — it does not need to touch, and should not need to change, any of
the rule/decision logic validated above. The deferred items in section 2
are independent of Phase C and are not blocking prerequisites for it.

**Phase C is not started by this closeout.**
