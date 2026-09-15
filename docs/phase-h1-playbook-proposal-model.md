# Phase H.1 — Playbook Proposal Model (Design)

Status: **design only, not implemented**. Source:
`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`,
`docs/phase-h0-playbook-onboarding-product-model.md`.

## 0. What H.0 already settled, restated only where H.1 depends on it

H.0 is the factual audit; this document does not re-derive it. The five
resolutions H.1's schema must honor structurally, not just by convention:

1. Fundamentals archetype fit is a **provenance/applicability** axis,
   separate from the score and from evidence coverage — the score stays
   computed and visible; a "LIMITED model fit" disclosure is attached
   alongside it, not blended into it.
2. Hand-authored thesis/research/view-changes content is **out of Phase
   H's scope** entirely (not part of the Proposal).
3. Action-zone body prose must become **deterministic parameterized
   templates**, generated at render time from confirmed `Strategy` +
   live snapshot data — never authored during onboarding, by a human or
   an AI, and never carried by the Proposal.
4. **Investment Role and Core Protection are separate axes.** "Long-term
   core" only makes core protection *eligible*; a conditional follow-up
   question sizes it. Growth/Tactical never get a core range in v0.1.
5. **Current Intention is Proposal-only** — it must never be capable of
   mechanically becoming `Playbook.stance` or any `Strategy` threshold,
   because it is never persisted into `StockPlaybookConfig` at all.

And the concrete dead/vestigial fields (§0.4 of H.0) that must not appear
anywhere in this schema: `Strategy.horizon`, `Strategy.tacticalSharesMin/
Max`, `Playbook.version`, `Playbook.updatedAt`, `Playbook.stance` (as a
value the Proposal *sets* — see §5).

---

## 1. Design principle: product meaning, not legacy shape

The Proposal is **not** a partially-filled `Strategy`/`Playbook`. It is a
new, standalone product concept that happens to be *mappable to* one by
H.2. Two consequences:

- **Field names describe what the user/system/AI is actually reasoning
  about**, not the engine's internal threshold names.
  `mediumTermTargetMinPct/MaxPct` becomes `targetAllocationRange`;
  `shortTermMaxWeightPct` becomes `accumulationCeilingPct`;
  `coreSharesMin/Max` becomes `corePosition` (a share range, only present
  when applicable — never a bare optional pair the reader has to
  remember is both-or-neither by convention).
- **Dead production fields have no Proposal-side representation at
  all** — not as an optional field, not as a placeholder slot. `horizon`,
  `tacticalSharesMin/Max`, `version`, `updatedAt` are H.2's problem to
  fill when materializing the config (§5), never something a user
  answers, an AI proposes, or a review screen shows.

### 1.1 The provenance primitive

Every meaningful value in the Proposal is wrapped, not stored bare:

```ts
type Provenance = "USER" | "SYSTEM" | "AI" | "DETERMINISTIC" | "MISSING";

type ProposalField<T> =
  | { provenance: "USER"; value: T }
  | { provenance: "SYSTEM"; value: T }        // observed fact — portfolio/market data, not computed by a rule
  | { provenance: "AI"; value: T }             // H.5 — not producible before then, but the schema carries the case now
  | { provenance: "DETERMINISTIC"; value: T }  // computed by a pure domain function from USER/SYSTEM inputs
  | { provenance: "MISSING" };                 // asked/needed, not yet available — never defaulted silently
```

`SYSTEM` and `DETERMINISTIC` are deliberately distinct, not a single
"system" bucket: a live quote price is `SYSTEM` (an observed fact); the
concentration state computed from that price plus the user's proposed
target range is `DETERMINISTIC` (a rule applied to facts). Conflating
them would hide exactly the "what did the system observe vs. what did it
conclude" distinction guardrail #13 requires.

`MISSING` is reused verbatim from the existing `DataField<T>`/
`CostBasis`/`EvidenceScoredItem` convention (`src/types/market-data.ts`,
`src/types/portfolio.ts`) — this document does not invent a new "absence"
vocabulary where the codebase already has one that works.

### 1.2 The confirmation boundary — where provenance stops mattering

Once a Proposal is confirmed and validated (H.2), the resulting
`StockPlaybookConfig` carries **no provenance at all** — it is the same
plain `{ instrumentId, strategy, playbook }` shape it is today. This is
not an oversight; it is the mechanism that makes guardrail #5 ("AI
proposes; it does not silently control production rules") structural
rather than a convention someone could forget: **there is no field in
production `Strategy`/`Playbook` an AI-provenance `ProposalField` could
flow into without passing through H.2's deterministic validation/mapping
first**, because the production types have no provenance slot to smuggle
itself through. AI-authored numbers and user-typed numbers look
identical to the engine — the only thing that ever distinguished them
was the Proposal, and the Proposal's job is finished once H.2 runs.

---

## 2. The Proposal schema

```ts
interface PlaybookProposal {
  subject: ProposalSubject;
  portfolioContext: PortfolioContext;
  userIntent: UserIntent;
  researchEvidence: ResearchEvidence;
  guardrailPreview: GuardrailPreview;
  proposedConfiguration: ProposedConfiguration;
  status: ProposalStatus;
}
```

### 2.1 Subject — which instrument this is for

```ts
interface ProposalSubject {
  instrumentId: string;   // the same join key StockPlaybookConfig already uses
  holdingId: string;      // the specific Holding this proposal is being built from
}
```
Both `SYSTEM` by construction (the user picked "Create Playbook" from an
existing holding row — brief's own onboarding entry point) — not worth
wrapping in `ProposalField`, since there is no other possible provenance
for "which stock is this."

### 2.2 Portfolio Context — reused, not re-derived

```ts
interface PortfolioContext {
  // A frozen-at-proposal-time copy of the live facts, for stable review —
  // not a second, independently-maintained source of these numbers.
  // Fields are exactly HoldingSnapshot/Position's existing shape,
  // referenced, not redefined (guardrail #10).
  holdingSnapshot: HoldingSnapshot;   // src/types/portfolio.ts, unchanged
  valuation: PortfolioValuation;      // src/types/portfolio.ts, unchanged — COMPLETE/PARTIAL/UNAVAILABLE
  currentWeightPct: number | null;    // holdingWeightPct's own output — null exactly when it already returns null
}
```
This section exists so H.1's later sections have something to compare
against (e.g., is the user's proposed target range already violated by
today's actual weight) — it is **read-only** and carries no new
derivation. If `valuation.state !== "COMPLETE"`, onboarding can still
proceed (the user can still express intent), but `currentWeightPct` is
honestly `null` and `guardrailPreview` (§2.5) must degrade accordingly —
exactly the same fail-soft/fail-safe split G.1's design already
established for the Portfolio page.

### 2.3 User Intent

```ts
type InvestmentRole = "LONG_TERM_CORE" | "GROWTH" | "TACTICAL" | "NOT_SURE";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "HELP_ME_ASSESS";
type CurrentIntention = "BUILD" | "HOLD" | "REDUCE" | "NOT_SURE";

interface UserIntent {
  investmentRole: ProposalField<InvestmentRole>;
  confidence: ProposalField<ConfidenceLevel>;
  // Proposal-only per H.0 resolution #5 — deliberately has no
  // counterpart anywhere in Strategy/Playbook. See §3.
  currentIntention: ProposalField<CurrentIntention>;
  // Conditional per H.0 §3.1/resolution #4 — NOT an optional
  // ProposalField (that would conflate "not asked because not
  // applicable" with "asked but not yet answered"). Reuses the
  // AVAILABLE/MISSING/NOT_APPLICABLE 3-state shape CostBasis already
  // establishes for exactly this "conditionally meaningful" pattern.
  corePortion: CorePortionInput;
  // Resolved 2026-09-15 (§6 item 1) — a fourth unconditional question,
  // deliberately NOT the raw ThesisHealth enum. This is product-level
  // meaning ("have the reasons you own this changed?"), USER provenance;
  // H.2 owns the deterministic mapping to ThesisHealth (§5 item 8). The
  // Proposal never stores a ThesisHealth value directly from the user —
  // only a preview of what it maps to (§2.6's thesisHealthPreview).
  thesisTrajectory: ProposalField<ThesisTrajectory>;
}

// Conceptually maps to ThesisHealth (STRENGTHENING/INTACT/MIXED/
// WEAKENING/BROKEN) but is a DISTINCT type with its own beginner-facing
// vocabulary — the production enum is never shown to or set by the user
// directly (same "product meaning, not legacy shape" principle as
// targetAllocationRange vs. mediumTermTargetMinPct/MaxPct, §1).
type ThesisTrajectory =
  | "GETTING_STRONGER"          // → STRENGTHENING (H.2 mapping)
  | "NO_MEANINGFUL_CHANGE"      // → INTACT
  | "SOME_DOUBTS"               // → MIXED
  | "GETTING_WEAKER"            // → WEAKENING
  | "REASONS_NO_LONGER_HOLD"    // → BROKEN
  | "NOT_SURE";                 // → unresolved, never INTACT — see below

type CorePortionInput =
  | { status: "NOT_APPLICABLE" }              // investmentRole !== LONG_TERM_CORE
  | { status: "MISSING" }                     // applicable, not yet answered
  | { status: "PROVIDED"; value: CorePortionValue };

// The exact response format (fraction / qualitative scale / share
// count) is an H.3 UX decision. What H.1 fixes: it is one plain-language
// answer, never a raw coreSharesMin/coreSharesMax entry.
interface CorePortionValue {
  fractionOfCurrentHolding: number; // 0 < x <= 1 — never defaults to 1
}
```

`investmentRole`/`confidence`/`currentIntention`/`thesisTrajectory` are
always `USER` provenance when answered, or the `"NOT_SURE"`/
`"HELP_ME_ASSESS"` literal value when the user explicitly defers —
**not** `MISSING`. Deferring is itself a piece of user-provided
information ("I don't know, help me decide"), distinct from a field
simply not having been asked yet. `thesisTrajectory: "NOT_SURE"` is
treated identically to the other fields' deferrals for `ProposalStatus`
purposes (§6 item 3) — with one addition specific to thesis: it **never**
resolves to `INTACT` by default. It stays unresolved — blocking
`READY_FOR_REVIEW` (§2.6's `thesisHealthPreview` cannot be computed
without a concrete trajectory) — until the user picks a concrete answer,
optionally with AI assistance once H.5 exists.

### 2.4 Research Evidence

```ts
interface ResearchEvidence {
  // A live quote is always an observed fact, never USER/AI/DETERMINISTIC
  // in v0.1 — restricted to the two provenances that are actually
  // possible here, same pattern as momentum/fundamentals below, rather
  // than the full ProposalField<T> (which would redundantly re-offer a
  // MISSING case it already has, alongside three provenances that can
  // never occur for a raw quote).
  price: { provenance: "SYSTEM"; value: { nativeAmount: number; currency: string } } | { provenance: "MISSING" };
  // Reuses the existing MomentumScoreResult/FundamentalsScoreResult
  // verbatim (src/domain/signals/momentum-score.ts,
  // src/domain/signals/fundamentals-score.ts) — already distinguishes
  // SCORED vs INSUFFICIENT_DATA and carries its own coverage object.
  // Not re-modeled here; wrapping it again would create a second,
  // divergent "how much evidence do we have" vocabulary.
  momentum: { provenance: "DETERMINISTIC"; result: MomentumScoreResult } | { provenance: "MISSING" };
  fundamentals: {
    provenance: "DETERMINISTIC";
    result: FundamentalsScoreResult;
    // H.0 resolution #1 — a THIRD axis, independent of the score and of
    // result.coverage. Never blended into the score, never inferred by
    // this document (no classifier exists — see H.0 §5 item 1).
    modelFit: "CONFIRMED_FIT" | "LIMITED_FIT" | "UNKNOWN_FIT";
  } | { provenance: "MISSING" };
  // No live pipeline exists for this dimension at all today (H.0 §0.3) —
  // always literally absent, for every stock including Unity. The
  // Proposal must show this honestly rather than omit the section.
  valuation: { provenance: "MISSING" };
}
```

`modelFit` defaults to `"UNKNOWN_FIT"` for any stock other than Unity,
per H.0's resolution: no classifier exists in Phase H, so nothing
justifies claiming `"CONFIRMED_FIT"` for a newly onboarded stock.
`"LIMITED_FIT"` is reserved for a case Phase H does not yet produce (it
would require *some* classification signal); `"UNKNOWN_FIT"` is the
honest default until a future capability adds one. This document does
not choose between `"LIMITED_FIT"` and `"UNKNOWN_FIT"` as v0.1's actual
default value — that one-line choice belongs to H.2/H.4 (the Proposal
*shape* already supports either without change).

### 2.5 Guardrail Preview — deterministic, computed before any number is proposed

```ts
interface GuardrailPreview {
  // What concentration state would apply RIGHT NOW, using the user's
  // proposed target range (§2.6) against today's actual weight — null
  // whenever currentWeightPct is null (PortfolioContext §2.2).
  concentrationStateIfConfirmedNow: ConcentrationState | null; // src/domain/portfolio/concentration.ts, unchanged
  // Deterministic, human-readable tension flags between what the user
  // said (§2.3) and what the numbers say (§2.2/§2.6) — never silently
  // resolved in either direction (guardrail #6). Generated by a fixed,
  // enumerable rule set, not free text.
  discrepancies: IntentDiscrepancy[];
}

interface IntentDiscrepancy {
  code: string;    // e.g. "BUILD_INTENT_ALREADY_OVERWEIGHT" — enumerable, not free-form; the review UI (H.3) may key its own copy off this instead of `message`
  // Deterministically templated from live values (H.0 resolution #3's
  // same "never frozen prose, never AI text" rule applied here too) —
  // e.g. "You said you want to build this position, but it's already
  // {weightPct}% of your portfolio, above the {ceilingPct}% ceiling for
  // a {role} position." Never authored per-stock, never AI-generated —
  // one fixed template per `code`, filled from §2.2/§2.3/§2.6 values.
  message: string;
}
```
This section is what gives guardrail #6 ("user intent is not
automatically the recommendation") a visible product surface: a Proposal
where Current Intention is "Build" but the numbers say otherwise does not
quietly produce a Strategy that blocks building — it produces a Strategy
that blocks building **and a Review screen (H.3) that explains why**,
using the same `currentIntention` value the user already gave.

### 2.6 Proposed Configuration — the reviewable preview of the eventual Strategy/Playbook

```ts
interface ProposedConfiguration {
  targetAllocationRange: ProposalField<{ minPct: number; maxPct: number }>;
  accumulationCeilingPct: ProposalField<number>;
  // Present only when corePortion.status === "PROVIDED". Absent
  // (not null, not zero) otherwise — mirrors CorePortionInput's own
  // three-state shape rather than introducing a second one.
  corePosition?: ProposalField<{ minShares: number; maxShares: number }>;
  preferredTargetPct?: ProposalField<number>;
  // Stays absent by default (H.0 §3) — no beginner input requests this;
  // present only if a future benchmark-inference capability sets it.
  relativeStrengthBenchmark?: ProposalField<string>;
  // H.2's deterministic mapping of userIntent.thesisTrajectory →
  // ThesisHealth (src/types/playbook.ts, unchanged) — a review-time
  // preview, not something the user set directly (§2.3). Absent, not a
  // fabricated `INTACT`, whenever thesisTrajectory is "NOT_SURE" — this
  // is the field whose absence is what actually blocks
  // ProposalStatus.READY_FOR_REVIEW (§2.7) for an unresolved thesis.
  thesisHealthPreview?: ProposalField<ThesisHealth>;
}
```
In H.0–H.4 every field here is `DETERMINISTIC` (computed from
`userIntent` + `portfolioContext` by a rule table H.2 owns — the actual
per-role numbers are explicitly **not** chosen in this document, per the
plan's own H.2 charge). From H.5 onward, an AI-assisted flow may populate
these with `provenance: "AI"` instead, reviewed by the same H.3 screen,
validated by the same H.2 mapping — the schema does not change when AI
arrives, only which provenance tag shows up.

This section deliberately does **not** include a `Scorecard` or
`ActionZone[]` field. See §3.

### 2.7 Status — the Proposal's own lifecycle

```ts
type ProposalStatus =
  | "GATHERING_INTENT"      // §2.3 incomplete, OR any answer still deferred ("NOT_SURE"/"HELP_ME_ASSESS", §6 item 3)
  | "READY_FOR_REVIEW"      // §2.3 fully concrete (no deferrals), §2.4-§2.6 assembled
  | "CONFIRMED"             // user approved — H.2 may materialize a StockPlaybookConfig
  | "DISCARDED";            // user abandoned onboarding — nothing persisted
```
A confirmed Proposal is not itself mutated further — an edit after
confirmation re-enters `GATHERING_INTENT`/`READY_FOR_REVIEW` for a *new*
Proposal, never silently rewrites an already-materialized
`StockPlaybookConfig` out from under the Engine. The state machine's
finer detail (e.g., what an in-place edit before confirmation looks like)
is an H.3 UX concern, not fixed here.

---

## 3. What the Proposal deliberately does not carry

- **No `Scorecard` field.** `positionFit`/`concentrationRisk` are already
  100% recomputed live from the confirmed `Strategy` + current weight
  (`recalculateScorecard`), regardless of origin — nothing to propose.
  `thesisHealth`'s `ScoreItem` is a mechanical relabeling of whatever
  `ThesisHealth` H.2 mapped `userIntent.thesisTrajectory` to
  (`deriveThesisScoreItem`) — also nothing to propose beyond the intent
  itself. `fundamentals`/`momentum` are already
  fully carried by `researchEvidence` (§2.4) in their native,
  richer shape; re-deriving a `Scorecard`-shaped duplicate here would be
  exactly the duplication guardrail #10 forbids. `valuation` has no
  content to propose (§2.4). A `Scorecard` is therefore something H.2
  *assembles at read time* from the confirmed config + evidence, the same
  way it already is for Unity today in spirit — not something the
  Proposal authors. One real gap this surfaces for H.2, not solved here:
  see §6 item 2.
- **No `ActionZone[]` field, and no zone body text of any kind.** Zone
  *state* is 100% derived from the confirmed `Strategy` at engine-run
  time (`deriveActionZoneState`, already generic). Zone *prose* is a
  deterministic template concern (H.0 resolution #3) evaluated at render
  time from the confirmed config + live snapshot — never authored during
  onboarding by the user, the system, or an AI. This is the structural
  guarantee behind "no AI-generated production Action Zone prose": there
  is no field here an AI-authored sentence could ever occupy.
- **No `horizon`, `tacticalSharesMin/Max`, `version`, `updatedAt`
  fields**, anywhere, in any provenance. These are H.2's placeholders to
  fill (§5), never onboarding content.
- **No thesis narrative / catalysts / risks / thesis-breakers / "what
  would change my view" / research documents** — out of Phase H
  entirely per H.0 resolution #2.

---

## 4. Guardrail and "preserve" checklist

| Requirement (this task / H.0 guardrails) | How this schema satisfies it |
|---|---|
| Provenance: USER/SYSTEM/AI/DETERMINISTIC/MISSING | §1.1 `ProposalField<T>` — the schema's central primitive, used everywhere a value could plausibly come from more than one source |
| Current Intention Proposal-only | §2.3 — `currentIntention` exists only in `UserIntent`; no `ProposedConfiguration`/H.2 output field it maps to (§0 item 5) |
| Investment Role ≠ Core Protection | §2.3 — `investmentRole` and `corePortion` are sibling fields, not one derived from the other; `corePosition` (§2.6) only exists when `corePortion.status === "PROVIDED"` |
| Conditional Core Protection input | §2.3's `CorePortionInput` — reuses the existing AVAILABLE/MISSING/NOT_APPLICABLE idiom (`CostBasis`) rather than a bare optional |
| Fundamentals model-fit separate from score and coverage | §2.4 — `modelFit` is a third field alongside `result` (which itself carries `coverage`); never blended into `result.overall` |
| AI proposal ≠ deterministic production decision | §1.2 — the confirmation boundary: `StockPlaybookConfig` has no provenance slot at all, so an AI-provenance value cannot reach production without passing through H.2 |
| No AI-generated production Action Zone prose | §3 — no zone-body field exists anywhere in the schema for any provenance to occupy |
| Do not duplicate derived portfolio/position values | §2.2 references `HoldingSnapshot`/`Position` rather than redefining shares/cost/weight fields |
| Do not ask users for information the system already knows | §2.2 is entirely `SYSTEM`; §2.3 contains only the four unconditional (+1 conditional) genuinely personal questions |
| Missing != 0 / missing evidence != false certainty | §2.4 — every evidence field is `MISSING`-capable; `modelFit` exists specifically so a real score is never read as "confident and well-fitted" when it isn't |
| Evidence coverage and evidence quality/state remain separate | §2.4 reuses `MomentumEvidenceCoverage`/`FundamentalsEvidenceCoverage` verbatim, and adds `modelFit` as a *third*, independent axis rather than folding fit into coverage |
| Preserve explainability (user-said / system-observed / proposed) | §1.1 is exactly this three-way (five-way) split, applied per field, not per document |

---

## 5. What H.2 must derive deterministically

Explicit checklist — H.1 defines the Proposal's shape; none of the
following is decided here, only named as H.2's responsibility:

1. **Per-role default numeric tables** — `targetAllocationRange` and
   `accumulationCeilingPct` for `GROWTH`/`TACTICAL` (and the *range*, not
   just eligibility, for `LONG_TERM_CORE`). A versioned table, matching
   this project's existing `ruleset-v0.1.ts` convention (every number a
   labeled hypothesis, not tuned to any one stock).
2. **`corePortion.fractionOfCurrentHolding` → `coreSharesMin`/
   `coreSharesMax`** — the actual formula (e.g., rounding rule, whether
   the fraction applies to current shares at confirmation time or at
   materialization time if they differ).
3. **Contradiction resolution** — when `GuardrailPreview.discrepancies`
   is non-empty at confirmation time, whether confirmation is blocked
   entirely, allowed with acknowledgment, or auto-adjusts the proposed
   numbers (guardrail #6 forbids the last option silently; an explicit
   user acknowledgment step is consistent with it, a silent auto-adjust
   is not).
4. **Placeholder values for dead fields** — `Strategy.horizon` (a
   display string never read — any value is correct),
   `tacticalSharesMin/Max` (never read by the engine — any value is
   correct), `Playbook.version` (start at 1), `Playbook.updatedAt` (the
   materialization timestamp), `Playbook.stance` (never read for
   decisions post-G.6 — a freshly computed preview value is tidy but not
   load-bearing).
5. **`Scorecard` assembly at read/render time** — not stored on
   `StockPlaybookConfig`, assembled the same way `runDecisionEngine`'s
   callers already do, from: live `positionFit`/`concentrationRisk`
   (existing `recalculateScorecard`), `thesisHealth` (existing
   `deriveThesisScoreItem`, fed the `ThesisHealth` value item 8 below
   produces), and `researchEvidence.momentum`/`.fundamentals` (existing
   `deriveMomentumEvidenceScoredItem`/`deriveFundamentalsEvidenceScoredItem`).
   **Flagged, not solved, here:** when either evidence is
   `INSUFFICIENT_DATA`/`MISSING`, today's engine fallback
   (`signals.momentum`/`signals.fundamentals`) reads whatever static
   value the seed happened to hand-type — for a newly onboarded stock
   there is no seed to fall back to, and `ScoreItem` has no "unknown"
   state to hold instead. See §6 item 2.
6. **`ActionZone[]` template instantiation** — the five zone types'
   parameterized body text (H.0 resolution #3), generated from the
   confirmed `Strategy` + live snapshot at render time, never stored per
   stock.
7. **`benchmarkInstrumentId`** — stays unset unless/until a future
   benchmark-inference capability exists (no H.2 work required beyond
   leaving it absent).
8. **`ThesisTrajectory` → `ThesisHealth`** — the deterministic mapping
   from the beginner-facing trajectory answer (§2.3) to the production
   enum (`GETTING_STRONGER`→`STRENGTHENING`, `NO_MEANINGFUL_CHANGE`→
   `INTACT`, `SOME_DOUBTS`→`MIXED`, `GETTING_WEAKER`→`WEAKENING`,
   `REASONS_NO_LONGER_HOLD`→`BROKEN`). Resolved 2026-09-15 (§6 item 1):
   the mapping itself is a 1:1 lookup with no numbers to tune, so H.2's
   only real job here is enforcing that `"NOT_SURE"` produces **no**
   `ThesisHealth` value at all (§2.6's `thesisHealthPreview` stays
   absent) rather than defaulting to `INTACT`.

---

## 6. MODEL DECISIONS

### 1. Thesis Health has no intent question — RESOLVED (2026-09-15)

`ThesisHealth` (`STRENGTHENING`/`INTACT`/`MIXED`/`WEAKENING`/`BROKEN`) is
**not dead** — unlike the five vestigial fields in §0, it directly gates
HC-002 (accumulation disabled + `THESIS_REVIEW` when `BROKEN`),
`deriveStance`'s `REDUCE_RISK` branch, `isThesisEligibleForAdd`, and
`Scorecard.thesisHealth`. H.0's validated Beginner Intent Hypothesis
(Investment Role / Confidence / Current Intention) had no question that
produces it. **Decision:** add a fourth unconditional question, but do
**not** expose the `ThesisHealth` enum to the user directly. Instead:

- The question asks, in plain language, whether the reasons the user
  owns the investment have changed — answered via `ThesisTrajectory`
  (§2.3), a distinct, beginner-facing product concept, never the
  production enum itself:
  `GETTING_STRONGER` / `NO_MEANINGFUL_CHANGE` / `SOME_DOUBTS` /
  `GETTING_WEAKER` / `REASONS_NO_LONGER_HOLD` / `NOT_SURE`.
- H.1 preserves the answer as `ProposalField<ThesisTrajectory>`, `USER`
  provenance — product-level meaning, not the production value.
- **H.2 owns the deterministic mapping** from `ThesisTrajectory` to
  `ThesisHealth` (§5 item 8) — a fixed 1:1 lookup, not a judgment call.
- **`"NOT_SURE"` never defaults to `INTACT`.** It remains genuinely
  unresolved — no `ThesisHealth` value is produced
  (`thesisHealthPreview`, §2.6, stays absent) until the user confirms a
  concrete trajectory, optionally with AI assistance once H.5 exists.
  This is the same treatment already given to Investment Role's and
  Confidence's own deferrals (§6 item 3), applied consistently rather
  than as a special case.

This supersedes the three options originally drafted here (a fourth
question that exposes the raw enum directly, a silent `INTACT` default,
or a silent default deferred for later cleanup) — none of the three was
correct as stated; the resolution is a fourth question with its *own*
vocabulary, mapped deterministically, defaulting to nothing when unsure.

### 2. `ScoreItem` cannot represent "insufficient evidence" for a new stock — RESOLVED (recommended)

Flagged in §5 item 5. **Recommendation:** treat this exactly like the
already-accepted `valuation` gap (H.0 §2 item 1) rather than opening a
`Scorecard`/`ScoreItem` type change inside Phase H — out of scope here,
not a Phase H blocker. Concretely: H.2 should define **one** documented,
uniform neutral placeholder (e.g., a fixed mid-scale `ScoreItem`) used
only when evidence is `INSUFFICIENT_DATA`/`MISSING`, applied identically
regardless of which stock — never a per-stock guess — and the Review
screen (H.3) must visibly distinguish this placeholder from a real
assessment (reusing `researchEvidence`'s own `MISSING`/`INSUFFICIENT_DATA`
status for that distinction, never inferring it from the placeholder
number itself). A true fix (making `Scorecard` fields `MISSING`-capable)
is tracked as future work, exactly parallel to how H.0 already tracks
multi-archetype fundamentals.

### 3. "Not sure" / "Help me assess" answers have no resolution before H.5 — RESOLVED (recommended)

**Recommendation:** these answers remain fully selectable in v0.1 — the
plan does not gate the *questions* on AI's existence, only the ability to
*resolve* a deferred answer. A Proposal containing any
`"NOT_SURE"`/`"HELP_ME_ASSESS"` value can reach `GATHERING_INTENT` but
not `READY_FOR_REVIEW` — `ProposedConfiguration` (§2.6) has no
deterministic rule table entry for "unsure," and fabricating one would
be exactly the silent-default guardrail #6 forbids. The Review screen
(H.3) should say plainly that this answer needs either a concrete choice
or AI assistance not yet available — never silently substitute a default
role/confidence/thesis value to unblock progress.
