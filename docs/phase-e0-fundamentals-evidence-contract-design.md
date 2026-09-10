# Phase E.0 — Fundamentals Evidence Contract & Model Design

Status: **RESOLVED (design only)** — no application code changed. The
§5 model decision is approved (**F2**, refined — see §5.1); the Balance
Sheet metric is approved (**`netCashToRevenue`**, see §3.3 — anchors
remain unresolved, not invented, per instruction); see §10 for the
proposed E.1 implementation scope.

## 0. What was read

- `docs/PHASE-D-INTEGRATION-GUIDE.md` — full re-read: §1 "evidence is
  not the decision"; §3 deterministic evidence, no duplicate scoring;
  §4 `MISSING != 0` / AVAILABLE / MISSING / NOT_APPLICABLE /
  INSUFFICIENT_DATA vocabulary; §5 evidence coverage is explicit
  metadata, *not* automatically confidence, and v0.1 should prefer that
  over "introducing a general confidence model" (directly informs §4.3
  below); §6 preserve contradictory signals; §7 Scorecard is the
  preferred first integration point, consume-don't-reinvent; §9 hard
  constraints remain authoritative; §10 AI boundary (AI must not
  fabricate missing data, must not assign final scores); §15 out of
  scope unless explicitly started — "fundamentals implementation" is
  listed there, but this checkpoint is explicitly the one that starts
  it.
- `src/domain/signals/signals.ts` — `deriveFundamentalsScore(scorecard)
  => scorecard.fundamentals`, a pure pass-through, unchanged since the
  file was created; doc comment: *"Phase C will replace these
  pass-throughs with real fundamentals/valuation/technical
  computation."* This design is that replacement's contract, for
  fundamentals only — valuation is explicitly out of scope (its own,
  separate spec section and, eventually, its own checkpoint).
- `src/domain/signals/momentum-score.ts` — read as the **reference
  pattern**, per instruction: `MomentumComponentResult` (`AVAILABLE
  {rawValue,score100,weight} | MISSING{weight} | NOT_APPLICABLE
  {weight}`), `MomentumEvidenceCoverage` (`totalDefinedWeight`,
  `applicableWeight`, `availableWeight`, `missingWeight`,
  `availableWeightShare`), `MomentumScoreResult` (`SCORED{overall,
  components,coverage} | INSUFFICIENT_DATA{components,coverage}`),
  bounded continuous anchor-based normalization
  (`interpolateAnchors`), `toScoreItem`'s 0–100 → 1–10 display
  conversion, and the "only place this evidence-derived result may be
  produced" function-naming convention (`deriveMomentum*`).
- `docs/VALIDATION_PROTOCOL.md` — classification vocabulary (PASS /
  IMPLEMENTATION BUG / RULE-MODEL DESIGN QUESTION / NOT YET
  IMPLEMENTED), stop conditions (§5: "a rule/model/product decision is
  required... architecture needs to change"), lean single-artifact
  reporting.
- `docs/playbook-decision-engine-spec-v0.1.md` — §2 Responsibility
  Boundary (deterministic vs. AI-assisted, "AI must never... invent
  missing financial/market data... silently treat missing data as
  zero"); §10 Score Convention (0/50/100 = unattractive/neutral/
  attractive — the same internal 0–100 scale momentum already uses
  before its 1–10 `ScoreItem` conversion); **§11 Fundamental Engine**
  (dimensions must be **company-archetype aware**; a fully worked
  growth-software example with weights; an explicit instruction *"Do
  not use the same template for banks, biotech, utilities,
  semiconductors, etc."*; bounded continuous normalization, with a
  worked revenue-growth anchor example); §12 Guidance (a fully
  specified AI-extraction-then-deterministic-mapping contract: AI
  extracts `{direction, magnitude, evidence}`, a fixed rule table maps
  it to a score, *"AI does not directly assign the final numeric
  score"*); §24 Confidence ("these weights are hypotheses" — explicitly
  not required now, consistent with the integration guide's §5); §25
  Contradictory Signals (a worked example where Fundamentals=85,
  Valuation=28 coexist without being forced into one number); §29 AI
  Research Contract (the structured JSON shape an AI extraction step
  would eventually produce — `document_type`, `guidance_direction`,
  `revenue_outlook`, `margin_outlook`, `fcf_outlook`,
  `company_specific_kpis`, `risks`, `evidence`); §36 Implementation
  Order (spec's own Phase C "Signal Engine" already lists
  "fundamentals" — consistent with, not conflicting with, this
  session's own D-phase numbering, which is a project-internal
  checkpoint scheme layered on top of the spec, not a replacement for
  it).
- `src/types/market-data.ts` / `src/domain/market-data/freshness.ts` —
  the **second** reference pattern this design reuses directly:
  `DataField<T> = {status:"AVAILABLE",value,asOf} | {status:"MISSING"}`
  (freshness deliberately *not* stored on the field — a corrected
  design from Phase C.0, see the file's own doc comment); `RawQuote`/
  `OhlcvBar`/`RawMarketData` as the provider-independent raw-evidence
  contract shape; `evaluateFreshness(field, evaluationTime, policy) =>
  MISSING | FRESH{...} | STALE{...}`, pure, provider-independent,
  derived on demand from an explicit `evaluationTime` — never an
  ambient clock read, never a stored tag. Grepped: not currently called
  from anywhere in the momentum pipeline — an existing, validated,
  unused-by-momentum general utility, exactly what fundamentals'
  staleness question needs (§4.2 below).
- Grepped the codebase for `archetype`/`Archetype`/
  `FundamentalsScoreResult`/`Guidance` — **zero existing references**
  outside the spec file itself. No prior design or code has touched
  company-archetype-awareness at all; this is genuinely new ground,
  not a gap in something already started.

## 1. Scope of this design

Define a provider-independent Fundamentals evidence model: which
dimensions exist for v0.1, what raw evidence each needs, which parts
are deterministic vs. require an upstream AI-extraction step, how
MISSING/stale/insufficient-data are each represented, the normalized
per-component result shape, and the aggregate `FundamentalsScoreResult`
shape. Explicitly **not** in scope, per instruction and confirmed
non-conflicting with everything read above: choosing a data provider
(no Twelve-Data-equivalent adapter designed here — §7); implementing
AI extraction (no prompt, no LLM call designed — the *contract* AI
extraction must satisfy is defined, not the extraction itself — §3.2);
wiring anything into `Scorecard`/stance/action zones (mirrors D.0's own
staged approach — Scorecard wiring is a natural, separate future
checkpoint, not attempted here); inventing numeric weights beyond what
spec already gives verbatim as its own worked example (§11's growth-
software table and §12's Guidance mapping table are *cited*, not
*invented* — see §5 for the one place this document declines to go
further).

## 2. What transfers directly from `MomentumScoreResult` (no fork)

These four pieces of the reference architecture apply to fundamentals
with **no** structural change, and are treated as resolved, not
reopened:

1. **Component-level visibility.** Every defined dimension appears in
   the result, whatever its status — mirrors
   `MomentumComponentResult` carrying `weight` on every branch, not
   just the available one.
2. **Bounded continuous normalization.** Anchor-based
   piecewise-linear interpolation (spec §11's own revenue-growth
   anchor example uses exactly this shape) — the same
   `interpolateAnchors` mechanism, not a new one.
3. **`MISSING != 0`, weight redistribution over available evidence
   only.** No fabricated placeholder score for an absent dimension; the
   blend renormalizes over whatever's actually available, exactly like
   momentum's `componentWeight / availableWeight`.
4. **Aggregate discriminated result + evidence coverage.** A `SCORED`/
   `INSUFFICIENT_DATA` union, each carrying `components` +
   `coverage: {totalDefinedWeight, applicableWeight, availableWeight,
   missingWeight, availableWeightShare}`, with a minimum-evidence gate
   producing `INSUFFICIENT_DATA` rather than a low-confidence fabricated
   number — same shape as `MomentumEvidenceCoverage`/
   `MomentumScoreResult`, just renamed for fundamentals (§6).

## 3. Dimensions and their raw evidence (spec §11's worked example, adopted)

Spec §11's growth-software example is the only fully worked dimension
set spec provides anywhere, and is adopted directly for v0.1 — not
invented, cited. §5 covers **why the archetype question is still open**
even though this specific dimension *set* is taken as-is for the one
archetype v0.1 actually needs (Unity is the only real seeded security,
and it *is* a growth-software company).

| Dimension | Raw evidence needed | Deterministic once evidence exists? |
|---|---|---|
| Revenue Growth | current-period revenue, same-period-prior-year revenue | Yes — a ratio |
| Growth Trend | revenue growth across ≥2 consecutive periods | Yes — a derived signal (see §3.1) |
| Operating Margin | operating income, revenue (current period) | Yes — a ratio |
| Margin Trend | operating margin across ≥2 consecutive periods | Yes — a derived signal |
| Free Cash Flow | operating cash flow, capital expenditures (current period) | Yes — computed from two raw fields |
| Guidance | AI-extracted `{direction, magnitude}` from the latest earnings/guidance disclosure | Yes, the *mapping* is (spec §12's fixed table) — the *evidence* is AI-extracted (§3.2) |
| Balance Sheet | `cashAndEquivalents`, `totalDebt` (current period), trailing-twelve-month revenue (derived, see §3.3) | Yes — a ratio, **anchors not yet specified** (§3.3) |

### 3.1 Raw vs. derived — the same split `RawMarketData` →
`DerivedTechnicalSignals` already establishes

Mirroring `RawMarketData.ohlcv` (raw, provider-supplied) →
`DerivedTechnicalSignals`/`DerivedTrendSignal` (computed internally,
never provider-supplied) exactly:

```ts
// illustrative, not implemented — provider-independent raw contract,
// same role as RawQuote/OhlcvBar/RawMarketData (src/types/market-data.ts)
export interface RawFundamentalsPeriod {
  periodId: string;           // e.g. "2026-Q2" — provider-agnostic, not a display label
  revenue: DataField<number>;
  operatingIncome: DataField<number>;
  operatingCashFlow: DataField<number>;
  capitalExpenditures: DataField<number>;
  // Balance-sheet snapshot as of this period's end — point-in-time facts,
  // same tier as revenue/operatingIncome (§3.3, resolved 2026-09-10).
  cashAndEquivalents: DataField<number>;
  totalDebt: DataField<number>; // short-term + long-term interest-bearing debt, combined
}

export interface RawFundamentalsData {
  instrumentId: string;
  periods: RawFundamentalsPeriod[]; // as much history as the provider returns, oldest-to-newest; length not fixed by this contract
  guidanceEvidence: DataField<GuidanceEvidence>; // §3.2 — AI-extracted, not provider-supplied
  checkedAt: string;
}
```

`Revenue Growth`/`Operating Margin`/`Free Cash Flow` are computed from
exactly one `RawFundamentalsPeriod` (current vs. prior-year same
period) — raw-adjacent, one arithmetic step, same tier as momentum's
Price Extension ratio. `Growth Trend`/`Margin Trend` need **multiple**
periods and are genuinely derived signals — same tier as
`DerivedTrendSignal.dma200Slope` (computed internally from history,
never itself provider-supplied) — computed by a dedicated function
(not sketched further here; exact trend metric — e.g. slope of
consecutive growth rates — is implementation detail for a later
checkpoint, mirroring how `dma200Slope`'s exact computation was its own
later checkpoint, not decided in the C.0 contract design).

### 3.2 Guidance — the one dimension with an AI-extraction step, fully specified by spec already

Spec §12 and §29 together **already fully specify** this dimension's
contract — nothing here is invented:

```ts
// illustrative, not implemented — the extraction OUTPUT contract (§29,
// scoped down to just what Guidance needs), not the extraction itself
export interface GuidanceEvidence {
  direction: "RAISED" | "REITERATED" | "MIXED" | "LOWERED";
  magnitude: "MATERIAL" | "SMALL" | null; // null when direction is REITERATED/MIXED — spec's table has no magnitude branch for those
  evidence: string[]; // supporting excerpts/citations — never used to compute the score itself
}
```

The deterministic mapping (spec §12's table, cited verbatim):

```text
RAISED + MATERIAL   90
RAISED + SMALL      75
REITERATED          55
MIXED               45
LOWERED + SMALL      30
LOWERED + MATERIAL  10
```

This is the concrete model for "deterministic vs. AI-derived evidence"
the task asks to define: **AI's role stops at producing
`GuidanceEvidence`** (a structured fact, per spec §2's AI-assisted list
— "extracting facts from reports... identifying company-specific
KPIs" — and per §2's explicit prohibition, AI must never "calculate
authoritative accounting" or, by the same principle applied to §12,
assign the final numeric score itself). The score-mapping table above
is deterministic code, exactly like `deriveMomentumEvidenceScoredItem`
— given the same `GuidanceEvidence`, the mapped score never varies.
**No other v0.1 fundamentals dimension needs an AI step at all** — the
other six are numeric-report-derived, deterministic end to end, once
`RawFundamentalsData` is populated (regardless of *how* it's populated
— a structured-data API, a parsed filing, or AI-assisted extraction of
numbers from a PDF are all equally "outside this contract," exactly
how momentum never cares whether Twelve Data or another provider
supplied its OHLCV bars).

### 3.3 Balance Sheet — metric resolved (approved 2026-09-10), anchors still open

**Metric, as directed:**

```text
netCashToRevenue =
(cashAndEquivalents - totalDebt) / trailingTwelveMonthRevenue
```

**1. Does spec already define or imply another balance-sheet metric?**
No. Grepped the full spec for "balance sheet," "net debt," "net cash,"
"debt," "cash and equivalents," "solvency," "liquidity" — the **only**
hit anywhere in the document is the `Balance Sheet 10%` line in §11's
weighting table (line 262). No formula, no worked example, no anchors,
no parameter-registry entry (§32) exists for this dimension, unlike
Revenue Growth, which spec gives a full anchor example for.
`netCashToRevenue` does not conflict with anything spec states — there
is simply nothing else to reconcile it against.

**2. Does it fit the current `RawFundamentalsData` contract cleanly?**
Yes, using the same two-tier raw/derived split §3.1 already
establishes — no new architectural mechanism required:

- `cashAndEquivalents` and `totalDebt` are **point-in-time balance-sheet
  facts**, the same tier as `revenue`/`operatingIncome` — added directly
  to `RawFundamentalsPeriod` above, each an ordinary `DataField<number>`.
- `trailingTwelveMonthRevenue` is **not** a new raw field — it is a
  **derived signal**, the same tier as Growth Trend/Margin Trend
  (§3.1): computed from `RawFundamentalsData.periods[]` (sum of the
  trailing four quarterly `revenue` values, or the latest period's
  `revenue` directly if the provider reports annual periods — which
  shape a given provider uses is a data-provider question, explicitly
  out of scope per §7's "no API provider chosen"). This mirrors exactly
  why Growth Trend/Margin Trend were already modeled as derived rather
  than raw.

**3. What additional raw fields/history does it require?**
Two new per-period raw fields (`cashAndEquivalents`, `totalDebt`,
added to `RawFundamentalsPeriod` above) plus, for the TTM-revenue
derived signal specifically, **more history than any other v0.1
dimension needs**: at minimum four quarterly periods with `revenue`
`AVAILABLE` (or one annual period), versus the two periods (current +
prior-year-same-period) every other numeric dimension needs. If fewer
than four qualifying periods are available, `trailingTwelveMonthRevenue`
cannot be computed — this is handled by the **existing** MISSING
mechanism (§4.1), not a new state: the Balance Sheet component reports
`MISSING` for that scoring run, exactly like any other dimension whose
required raw evidence isn't available, with its weight visible via
`coverage.missingWeight` as usual.

**4. Are scoring anchors already specified anywhere?**
No — confirmed by the same grep in point 1. Per instruction, **no
anchors are invented here.** This leaves Balance Sheet in a
partially-resolved state, distinct from every other v0.1 dimension:
the raw contract, the derived-signal requirement, and the metric
formula are all now fixed, but the `score100` normalization curve for
`netCashToRevenue` is **not** — `GROWTH_SOFTWARE_TEMPLATE`'s Balance
Sheet `FundamentalsComponentDefinition` cannot be fully implemented
until anchors are supplied. This is *not* the same category as the
freshness `maxAgeMs`/`minimumAvailableWeightShare` calibration values
(single thresholds a reasonable default can stand in for without
changing what the dimension *means*) — an anchor curve defines the
entire dimension's normalization, so it is called out separately here
rather than folded into "deferred calibration." §10 updates E.1's scope
to reflect this explicitly: E.1 can implement Balance Sheet's raw
evidence plumbing and the `netCashToRevenue` computation now, but its
`score()` normalization step remains a named placeholder until anchors
are provided — a small, explicit follow-up, not a blocker for the other
six dimensions.

## 4. MISSING / stale / insufficient-data semantics

### 4.1 MISSING — identical to momentum's meaning, reused as-is

A dimension is `MISSING` when its required raw evidence isn't
available at all — `RawFundamentalsPeriod` fields (or
`guidanceEvidence`) are `DataField.MISSING`. No fabricated placeholder
score; weight stays visible via `coverage.missingWeight`, exactly like
momentum. `NOT_APPLICABLE` is **not currently needed** for any of the
seven dimensions above (unlike momentum's Relative Strength, nothing
here is strategy-configuration-dependent) — the component-result union
still reserves the branch for forward-compatibility (mirrors
`MomentumComponentResult`'s shape) but no dimension is expected to use
it in v0.1.

### 4.2 Stale — reuses `evaluateFreshness` directly, not a new mechanism (resolved, not a fork)

Unlike momentum (near-real-time daily bars, refetched every page load
per D.2), fundamentals data has a genuinely different cadence: a
dimension can be `AVAILABLE` — a real number with a real `asOf` — yet
meaningfully old (last quarter's figures, with a new quarter already
overdue). This is a real difference from momentum, but **not a new
design fork**: `src/domain/market-data/freshness.ts`'s
`evaluateFreshness(field, evaluationTime, policy)` is already
provider-independent, already pure, already operates on any
`DataField<T>`, and is already *unused* by momentum today (confirmed
by grep) — exactly the general-purpose tool this need calls for. The
resolution:

- Every `RawFundamentalsPeriod` field keeps its `DataField<T>` shape
  (`asOf` carried, nothing new added).
- Staleness is **never stored** on a component result, for the exact
  reason C.0 already corrected once (a stored `quality` tag drifts out
  of sync with an unmoving `asOf`) — it is evaluated on demand by
  whichever caller needs it, via `evaluateFreshness` with a
  fundamentals-appropriate `FreshnessPolicy` (a `maxAgeMs` sized to a
  reporting cadence — e.g. roughly one quarter plus a grace period; the
  exact number is calibration, not a model decision, and is not chosen
  here).
- **Staleness does not feed the `INSUFFICIENT_DATA` gate or the blend**
  in this design. A stale-but-present component still counts toward
  `availableWeight` exactly as a fresh one would. This mirrors
  `docs/PHASE-D-INTEGRATION-GUIDE.md` §5 directly: *"evidence coverage
  is not automatically the same thing as confidence... prefer keeping
  evidence coverage as explicit metadata rather than introducing a
  general confidence model."* Making staleness demote evidence weight
  would be exactly the confidence model §5 says to defer. A future
  confidence model (spec §24, already flagged there as "hypotheses,"
  not v0.1 scope) is the right place to fold freshness in — not this
  checkpoint.

### 4.3 INSUFFICIENT_DATA — same aggregate-level gate as momentum, reused as-is

When too much of `applicableWeight` is `MISSING` (§4.1), the aggregate
result is `INSUFFICIENT_DATA` rather than a fabricated low-confidence
score — identical mechanism and identical reasoning to
`MomentumScoreResult`'s `minimumAvailableWeightShare` gate. The
specific threshold is calibration (like momentum's own
`minimumAvailableWeightShare`, itself a `RULESET` value, not invented
in the C.0-equivalent contract stage) — not chosen here.

## 5. MODEL DECISION REQUIRED — `FundamentalsComponentKey`: fixed union or archetype-agnostic config?

Momentum's six dimensions are **universal** — the same technical
indicators apply to literally any equity, so `MomentumComponentKey` is
a plain, fixed, six-member TypeScript union
(`"rsi"|"relativeVolume"|"structure"|"priceExtension"|"trend"|
"relativeStrength"`), matching the reference pattern this checkpoint
was told to follow.

Fundamentals is **not** universal — spec §11 states this as an explicit
requirement, not a stylistic preference: *"Fundamental models must be
company-archetype aware... Do not use the same template for banks,
biotech, utilities, semiconductors, etc."* A bank's meaningful
dimensions (net interest margin, loan-loss provisioning, capital
ratios) share almost nothing with growth-software's (revenue growth,
FCF, guidance). This is a genuine structural fork the reference pattern
alone does not resolve, with two legitimate shapes:

- **(F1) Fixed union, growth-software only (matches the reference
  pattern exactly).** `FundamentalsComponentKey = "revenueGrowth" |
  "growthTrend" | "operatingMargin" | "marginTrend" | "fcf" |
  "guidance" | "balanceSheet"` — a direct, literal mirror of
  `MomentumComponentKey`'s style. Smallest, most consistent with the
  stated reference architecture, and sufficient for Unity (the only
  real seeded security today) and for B.5.7's stock-generic-engine
  requirement (the *engine* stays generic regardless of which
  fundamentals template is plugged in — only the fundamentals
  *scoring module itself* would be growth-software-specific).
  **Cost:** extending to a second archetype later means a breaking
  type change to `FundamentalsComponentKey` and a second, parallel
  `scoreFundamentals`-equivalent function — not additive.
- **(F2) Archetype-agnostic: component keys are caller-supplied
  strings, not a fixed union.** `FundamentalsComponentKey = string`;
  the dimension *set itself* (which keys exist, their weights, their
  anchors) becomes external configuration data supplied by the caller
  — conceptually similar to how `RULESET.technical.momentum` already
  supplies momentum's weights/anchors as data, except here the *set of
  dimension keys* also becomes data, not just their numeric parameters.
  A future bank archetype is then a second config object, zero type
  changes. **Cost:** real, new indirection this codebase hasn't needed
  before (`scoreFundamentals` becomes generic over an externally
  supplied dimension list rather than a hardcoded sequence of
  `scoreComponent` calls) — genuinely larger than momentum's own C.0
  design needed to be, and a deviation from the literal reference
  pattern this checkpoint was pointed at.

Both are architecturally sound; neither is an architecture conflict.
This is squarely `docs/PHASE-D-INTEGRATION-GUIDE.md` §12's definition
of **MODEL DECISION REQUIRED**: *"multiple legitimate behaviors exist
and product/model semantics must be chosen explicitly."* Given how
consistently this project has stopped for comparable or smaller forks
(the C.3 RSI convention, D.0's `INSUFFICIENT_DATA` representation,
D.4's stance/action-zone influence), this is not resolved silently here
— not because F1 vs. F2 is hard to reason about, but because choosing
to *deviate from the reference pattern the task explicitly pointed at*
is exactly the kind of choice this project's established process treats
as needing explicit sign-off, not an inferred default.

Every other piece of this design (§3's dimension table, §3.2's Guidance
contract, §4's MISSING/stale/insufficient-data semantics, §6's result
shape below) is written to work identically under either F1 or F2 —
nothing else in this document depends on which is chosen.

## 5.1 RESOLVED — decision record (approved 2026-09-10)

**Decision: F2, refined.** Fundamentals must be archetype-aware and
config-driven; the generic scoring engine must not be hardcoded to the
growth-software component set. Per instruction, plain F2
("`FundamentalsComponentKey = string`, caller supplies whatever") is
rejected as too unconstrained — the refinement adds one piece of
structure F2's original sketch left implicit: an explicit
`FundamentalsArchetype` identifier plus a named, typed
**`FundamentalsTemplate`** that owns each archetype's component keys,
weights, and normalization/scoring rules together, as one unit, rather
than leaving "which keys, which weights, which anchors" as three
independently-suppliable, uncoordinated pieces of data.

```ts
// illustrative, not implemented
export type FundamentalsArchetype = "GROWTH_SOFTWARE"; // v0.1: exactly one member; a future archetype adds a member here, nothing else in this file changes

// Archetype-scoped, not a cross-archetype global union — deliberately
// `string` at this generic layer (a bank's keys share nothing with
// growth-software's), but NOT "arbitrary": every concrete template
// (e.g. GROWTH_SOFTWARE_TEMPLATE, §10) defines its own closed literal
// union internally and widens it only when constructing this shape —
// same discipline RULESET.technical.momentum's anchors already have,
// applied one level up.
export type FundamentalsComponentKey = string;

export interface FundamentalsComponentDefinition {
  key: FundamentalsComponentKey;
  weight: number;
  // Pulls this component's own raw evidence out of RawFundamentalsData
  // and normalizes it to 0-100 in one step. Archetype-specific by
  // necessity (a bank's "capital ratio" and growth-software's "revenue
  // growth" have nothing in common as raw inputs or normalization
  // curves) but returns the same shape every archetype's generic
  // engine consumes identically — this is what makes the engine below
  // archetype-agnostic despite each dimension's logic being bespoke.
  // `key`/`weight` are already known from this definition, so `score`
  // only returns the per-call part of FundamentalsComponentResult (§6).
  score(raw: RawFundamentalsData): Omit<FundamentalsComponentResult, "key" | "weight">;
}

export interface FundamentalsTemplate {
  archetype: FundamentalsArchetype;
  components: readonly FundamentalsComponentDefinition[]; // weights sum to 1.0 — validated at construction, not by the engine
  minimumAvailableWeightShare: number; // the INSUFFICIENT_DATA gate threshold (§4.3) — archetype-specific, not global
}

// The generic engine — archetype-agnostic by construction: it never
// names "revenueGrowth" or "growthTrend" anywhere in its own body, it
// only iterates `template.components`. Same coverage-math/blend/gate
// shape as scoreMomentum, parameterized over whatever template it's
// handed.
export function scoreFundamentals(
  template: FundamentalsTemplate,
  raw: RawFundamentalsData
): FundamentalsScoreResult {
  const components = template.components.map((def) => ({ ...def.score(raw), key: def.key, weight: def.weight }));
  // ...totalDefinedWeight / applicableWeight / availableWeight / missingWeight math,
  // identical shape to scoreMomentum, then the minimumAvailableWeightShare gate,
  // then the weighted blend over AVAILABLE components only.
}
```

This satisfies every explicit instruction in the resolution: **archetype-
aware and config-driven** (`FundamentalsArchetype` + `FundamentalsTemplate`
carry the identity and full configuration); **the scoring engine is not
hardcoded to growth-software** (`scoreFundamentals`'s own body contains
zero growth-software-specific logic — it only ever reads
`template.components`, generically); **not an unconstrained arbitrary
string** (each template's own component keys are defined once, together,
as a closed set alongside their weights and scoring rules — see §10's
`GROWTH_SOFTWARE_TEMPLATE` — never assembled ad hoc from independently-
sourced strings scattered across call sites).

**For v0.1: only `GROWTH_SOFTWARE` is designed/implemented** (§10). The
`FundamentalsArchetype` union has exactly one member. Adding a second
archetype later is additive at this layer — a new union member, a new
`FundamentalsTemplate` value, zero changes to `scoreFundamentals` or to
any type in §3/§3.2/§6 (all of which are confirmed, per §5's own closing
paragraph, to work identically under F1 or F2 — and therefore under this
refinement of F2 too).

**One caveat surfaced, not reopened:** `RawFundamentalsData`/
`RawFundamentalsPeriod` (§3.1) are shaped around growth-software's own
raw inputs (`revenue`, `operatingIncome`, `operatingCashFlow`,
`capitalExpenditures`) — they are *today's* provider-independent
contract for the one archetype v0.1 implements, not yet a
proven-generic raw-evidence contract for every future archetype. A bank
archetype would likely need its own raw fields (or an extended/
archetype-parameterized `RawFundamentalsData`) — that is future work,
consistent with "other archetypes are future config/templates, not
implemented now," and does not block or contradict anything decided
here.

## 6. Aggregate `FundamentalsScoreResult` shape (independent of §5's outcome)

```ts
// illustrative, not implemented — shape only; FundamentalsComponentKey
// intentionally left as `string` in this sketch since §5 is unresolved
// (F1 would narrow it to a literal union; nothing else below changes)
export type FundamentalsComponentKey = string;

export type FundamentalsComponentResult =
  | { key: FundamentalsComponentKey; status: "AVAILABLE"; rawValue: number | GuidanceEvidence; score100: number; weight: number; asOf: string }
  | { key: FundamentalsComponentKey; status: "MISSING"; weight: number }
  | { key: FundamentalsComponentKey; status: "NOT_APPLICABLE"; weight: number }; // reserved, unused by any v0.1 dimension — see §4.1

export interface FundamentalsEvidenceCoverage {
  totalDefinedWeight: number;
  applicableWeight: number;
  availableWeight: number;
  missingWeight: number;
  availableWeightShare: number;
}

export type FundamentalsScoreResult =
  | { status: "SCORED"; overall: ScoreItem; components: FundamentalsComponentResult[]; coverage: FundamentalsEvidenceCoverage }
  | { status: "INSUFFICIENT_DATA"; components: FundamentalsComponentResult[]; coverage: FundamentalsEvidenceCoverage };
```

One deliberate addition over `MomentumComponentResult`: `asOf` is
carried on every `AVAILABLE` component (momentum's components don't
carry it individually — only the raw `DataField`s upstream of
`scoreMomentum` do, since momentum's own per-component staleness isn't
a modeled concern the way it is here). This is what §4.2's
`evaluateFreshness` call needs from a caller holding a
`FundamentalsScoreResult`, without re-threading the original
`RawFundamentalsData` through everywhere the scored result travels.

Following the same "only place this may be produced" naming
convention as `deriveMomentumEvidenceScoredItem`/
`deriveMomentumProvenance`/`deriveMomentumEligibility`, a future
implementation would add `deriveFundamentalsEvidenceScoredItem` (for
eventual `Scorecard.fundamentals` wiring, mirroring D.0/D.1 — not
designed here) and, if useful later, a `FundamentalsProvenance`/
`deriveFundamentalsProvenance` pair mirroring D.3 once a live
orchestration step (a fundamentals-equivalent of D.2's
`fetchLiveMomentumResult`) exists. Neither is scoped into this
checkpoint.

## 7. Explicit non-goals of this design

- No API provider chosen (no fundamentals-data-provider adapter
  designed, unlike Twelve Data for momentum) — the raw contract in §3.1
  is provider-independent by construction, same as `RawMarketData` was
  before Twelve Data was chosen for market data.
- No AI extraction implemented — §3.2 defines the contract AI
  extraction must satisfy (`GuidanceEvidence`), not a prompt, model
  choice, or extraction pipeline.
- No Scorecard/stance/action-zone wiring — mirrors D.0's own staged
  approach; a `Scorecard.fundamentals`-wiring checkpoint is a natural,
  separate next step, not attempted here.
- No numeric weights invented — §3's dimension table and §3.2's
  Guidance mapping are spec-given, not invented; §10's
  `GROWTH_SOFTWARE_TEMPLATE` reuses spec §11's own stated growth-software
  weights (20/10/15/10/20/15/10) verbatim, for the same reason. The
  Balance Sheet dimension's own normalization anchors (§3.3 — the
  metric itself, `netCashToRevenue`, is now resolved, but no spec-given
  anchors exist for it, so none are invented here), the freshness
  policy's `maxAgeMs`, and the `INSUFFICIENT_DATA` gate threshold remain
  calibration decisions left open for E.1 itself, exactly as momentum's
  equivalent numbers were left to C.3–C.6 rather than decided in the
  C.0 contract stage.
- No valuation-engine design (spec §13 is a separate, later
  checkpoint).
- No code written — every snippet above is illustrative.

## 8. Architecture conflict check

None found. Every reused pattern (`DataField`, `evaluateFreshness`,
the `SCORED`/`INSUFFICIENT_DATA` discriminated union, anchor-based
normalization, the "only place this may be produced" derivation
function convention) composes with fundamentals' needs without
modification to any existing type or function. §5.1's
`FundamentalsTemplate`/`FundamentalsComponentDefinition` addition is
purely additive on top of §6's already-designed result shape — no
existing type changes.

## 9. Status

Fully resolved — §5.1 records the approved archetype-model decision;
§3.3 records the approved Balance Sheet metric (`netCashToRevenue`),
with its scoring anchors explicitly left open (not invented, per
instruction — spec provides none). §10 defines the smallest E.1
implementation scope, including how it accommodates Balance Sheet's
still-open anchors. No further design review is needed to proceed to
implementation.

## 10. Smallest E.1 implementation scope (not implemented here)

1. **`src/types/fundamentals.ts`** (new file, mirrors
   `src/types/market-data.ts`'s role) — `RawFundamentalsPeriod`,
   `RawFundamentalsData`, `GuidanceEvidence` (§3.1/§3.2, unchanged from
   this design); `FundamentalsComponentResult`,
   `FundamentalsEvidenceCoverage`, `FundamentalsScoreResult` (§6,
   unchanged); `FundamentalsArchetype`, `FundamentalsComponentKey`,
   `FundamentalsComponentDefinition`, `FundamentalsTemplate` (§5.1,
   new).
2. **`src/domain/signals/fundamentals-score.ts`** (new file, mirrors
   `momentum-score.ts`'s role) — the generic `scoreFundamentals(template,
   raw)` engine (§5.1): coverage math
   (`totalDefinedWeight`/`applicableWeight`/`availableWeight`/
   `missingWeight`/`availableWeightShare`), the
   `minimumAvailableWeightShare` gate, the weighted blend over
   `AVAILABLE` components, and a `toScoreItem`-equivalent 0–100 → 1–10
   conversion (same convention as momentum's, defined locally — not
   imported, matching momentum's own precedent of restating rather than
   sharing this tiny function). Contains **zero** growth-software-
   specific logic — it only ever reads `template.components`.
3. **`src/domain/signals/fundamentals-templates/growth-software.ts`**
   (new file) — `GROWTH_SOFTWARE_TEMPLATE: FundamentalsTemplate`: all
   seven `FundamentalsComponentDefinition`s (§3's table), each reading
   its own raw fields from `RawFundamentalsData` and normalizing via
   bounded continuous anchors (reusing spec §11's own worked
   revenue-growth anchor example directly for that one dimension;
   anchors for the other four numeric dimensions besides Balance Sheet
   are a small remaining detail to settle at E.1 kickoff, mirroring how
   momentum's own anchors were settled incrementally across C.3–C.6,
   not all at once in its contract stage) or, for Guidance, spec §12's
   fixed mapping table (already fully specified, §3.2 — no further
   decision needed). Weights: spec §11's stated growth-software
   percentages (20/10/15/10/20/15/10), adopted verbatim, not invented.
   **Balance Sheet specifically (§3.3):** the raw fields
   (`cashAndEquivalents`/`totalDebt`), the trailing-twelve-month-revenue
   derived signal, and the `netCashToRevenue` formula are all resolved
   and can be implemented now; only its `score()` normalization curve
   has no anchors to implement yet — E.1 may either (i) implement the
   other six dimensions and leave Balance Sheet's component reporting
   `MISSING` (its raw-evidence plumbing wired, its `score()` step a
   named `throw`/placeholder) until anchors are supplied, or (ii) treat
   supplying Balance Sheet anchors as a tiny pre-E.1 sign-off — either
   is a scheduling choice for whoever kicks off E.1, not a design
   question. **Two further small details deliberately left for E.1
   itself, not resolved here:** the freshness policy's `maxAgeMs` and
   the `minimumAvailableWeightShare` gate threshold (both calibration
   values, same category as momentum's `RULESET` numbers).
4. **Tests** — `scoreFundamentals` unit tests using a synthetic
   `FundamentalsTemplate` fixture (proving the engine is genuinely
   archetype-agnostic, independent of `GROWTH_SOFTWARE_TEMPLATE`)
   covering: all components `AVAILABLE` → `SCORED`; a `MISSING`
   component → weight redistribution, never a fabricated score;
   `availableWeightShare` below the gate → `INSUFFICIENT_DATA`.
   Separately, `GROWTH_SOFTWARE_TEMPLATE`-specific tests: each
   dimension's raw-evidence-to-score100 mapping (mirroring
   `momentum-score.test.ts`'s per-dimension fixture style), and the
   Guidance mapping table's six cases against spec §12's literal
   numbers.
5. **Explicitly NOT in E.1**: no second archetype/template; no
   `Scorecard.fundamentals` wiring; no AI extraction implementation (a
   hand-built `GuidanceEvidence` fixture stands in for it in tests,
   exactly like `MomentumScoreResult` fixtures stand in for a live
   Twelve Data fetch in engine-level tests); no data-provider adapter;
   no `deriveFundamentalsEvidenceScoredItem`/provenance/eligibility
   (those are D.0/D.3/D.5-equivalent follow-on checkpoints, once a
   Scorecard-wiring decision is made — not assumed here).

No part of this scope requires further design review — §5.1/§10
already cover every decision it depends on, aside from the two small
E.1-kickoff details named in step 3.
