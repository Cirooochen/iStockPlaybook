# Phase H.5 — AI-Assisted Research & Proposal (Design)

Status: **design only, not implemented**. Source:
`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`,
`docs/phase-h0-playbook-onboarding-product-model.md`,
`docs/phase-h1-playbook-proposal-model.md`,
`docs/phase-h2-deterministic-strategy-mapping.md`,
`docs/phase-h3-playbook-onboarding-ux.md`,
`docs/playbook-decision-engine-spec-v0.1.md` (§2, §12, §15, §29, §30),
`docs/PHASE-D-INTEGRATION-GUIDE.md` (§10).

H.4 (`PlaybookOnboardingOverlay.tsx`, `materialize-config.ts`, `proposal.ts`,
`onboarding-discrepancies.ts`, `thesis-trajectory.ts`) is implemented and
verified working: 601/601 tests, a real non-Unity holding (ASML) completes
the full onboarding→Engine pipeline. This document does not redesign any
of it — it defines a new, bounded interpretation layer that sits **before**
the existing `PlaybookProposal` schema, changing zero production types.

---

## 0. What already exists — restated only where H.5 depends on it

### 0.1 The deterministic system already does the hard part well

Confirmed directly against the current implementation, not the aspirational
H.3 mock:

- `ResearchEvidence` is **real, live, fail-soft evidence**, not mock data.
  `src/app/stocks/[ticker]/page.tsx:41-44` fetches
  `fetchLiveMomentumResult`/`fetchLiveFundamentalsResult` server-side, for
  every ticker, before the onboarding overlay ever opens — both never throw,
  resolving to `undefined` → `{provenance:"MISSING"}` on any failure
  (`twelve-data/orchestration.ts:11-14`, `sec-edgar/orchestration.ts:43-45`).
- `PlaybookProposal` (`src/types/playbook-proposal.ts:123-131`) already
  carries the full `USER`/`SYSTEM`/`AI`/`DETERMINISTIC`/`MISSING`
  provenance vocabulary (`Provenance`, line 16; `ProposalField<T>`, lines
  18-23) — **this is a faithful, essentially unmodified implementation of
  H.1's schema**, not a divergent one.
- `materializeStockPlaybookConfig`
  (`src/domain/playbook/materialize-config.ts:73-162`) is the **sole**
  place a `PlaybookProposal` becomes a production `StockPlaybookConfig`,
  and the resulting config carries **no provenance at all** (file header,
  lines 6-8) — the exact structural guarantee H.1 §1.2 designed: nothing
  can reach production without passing through this one deterministic
  function, regardless of which `Provenance` tag produced the Proposal's
  field values.
- The discrepancy catalog (`onboarding-discrepancies.ts:16-21`,
  `deriveDiscrepancies`, lines 35-89) is a small, fixed, enumerable rule
  table — "no AI classification, no free-text severity judgment," per its
  own header comment — consumed identically at Review-preview time
  (`proposal.ts:121-129`) and at confirmation time
  (`materialize-config.ts:111-117`), so preview and enforcement cannot
  drift.
- Nothing here is broken or needs AI to "fix" it. **The deterministic
  system's job is not the problem H.5 solves.**

### 0.2 What's actually missing — the real gap, not an assumed one

Two things a beginner genuinely lacks today, confirmed by reading the live
`ReviewScreen` (`PlaybookOnboardingOverlay.tsx:459-635`):

1. **No interpretation of the evidence.** The Reasoning card (lines
   590-614) shows three raw state pills — Fundamentals, Momentum,
   Valuation — with zero prose. A beginner sees "Fundamentals: Positive"
   and has no way to know *why*, what it's weighing, or what "Model fit:
   Unknown" (`modelFitLabel`, lines 637-641) even means in plain language.
2. **No help resolving "Not sure."** Every "I'm not sure" / "Help me
   decide" / "Help me assess" option (Q1, Q2, Q3, Q4, Q1a) is fully
   selectable today and correctly blocks `READY_FOR_REVIEW`
   (`materialize-config.ts:82-104`) — but nothing in the product actually
   helps the user get *un*-stuck. They either already know the answer or
   they're stopped cold.

These map directly to the three goals in this task's brief. H.5 does not
need to touch anything else.

### 0.3 Prior art already in this codebase — adopt, don't reinvent

The original decision-engine spec (predates the H-phase numbering) already
designed the AI boundary this task is asking for, and it has never been
implemented. H.5 is that implementation, scoped to onboarding:

- **§2 Responsibility Boundary** (`playbook-decision-engine-spec-v0.1.md:28-61`)
  — AI-assisted: "extracting facts... interpreting commentary... comparing
  evidence with the thesis... summarizing contradictory evidence...
  natural-language explanation." AI must never: "invent missing
  data... freely choose BUY/SELL... override concentration/core
  constraints... silently treat missing data as zero."
- **§30 AI Explanation Contract** (lines 1088-1113) — AI receives
  *already-calculated* stance/scores/states/evidence/unknowns and may
  generate summary/why/more-bullish/more-cautious conditions. **"It cannot
  alter the calculated stance."** This is the exact shape of H.5's Evidence
  Brief (§4 below).
- **§15 Thesis Engine** (lines 393-430) — "AI may classify thesis health
  only from supplied thesis criteria and evidence," with a required
  structured output (`state`, `confidence`, `supporting_evidence`,
  `contradicting_evidence`, `triggered_breakers`, `unknowns`). This is the
  exact shape H.5 reuses for the Thesis Trajectory Intent Assist (§5.4).
- **PHASE-D-INTEGRATION-GUIDE.md §10** — "AI should not silently: change
  deterministic weights, change thresholds, alter position accounting,
  override hard constraints, fabricate missing market evidence... AI
  explanation and deterministic decision computation should remain
  separable." This is restated as this task's own "Core boundary," and
  H.5 inherits it unchanged.

Nothing above has ever been implemented — greenfield confirmed: zero AI/LLM
imports, zero API routes, zero AI provider env vars anywhere in the repo.

---

## 1. The three product goals, mapped to what AI actually does

| Goal (this task's brief) | What's missing today (§0.2) | AI surface (§5) |
|---|---|---|
| Understand the stock and available evidence | Reasoning card has no prose | Evidence Brief |
| Understand uncertainty / missing evidence | `modelFitLabel`/"Not available" have no explanation | Evidence Brief |
| Resolve "Not sure" and form their own view | No help exists at all | Intent Assist |

Two AI surfaces, not more. A third possible surface — "challenge my
answer even when I'm confident" (the plan's "AI may... challenge") — is
folded into Evidence Brief's `uncertainties` field (§4.2) rather than
built as a separate feature, keeping H.5 v0.1 to exactly two touchpoints.

---

## 2. Core boundary (restated, then made structural)

```
Raw Evidence
→ AI Interpretation      ← H.5 lives entirely here
→ User Decision          ← unchanged: UserIntent ProposalFields, USER provenance
→ Deterministic Proposal ← unchanged: proposal.ts + materialize-config.ts
→ Engine Decision        ← unchanged: runDecisionEngine
```

AI Interpretation sits **strictly upstream of User Decision**. Concretely:

- AI never writes to `PlaybookProposal`, `StockPlaybookConfig`, or any
  persisted state. It has no tool-use loop over the domain layer — each
  touchpoint is a single structured-completion request/response, not an
  agent with actions.
- AI output is **ephemeral, request-scoped UI state** — never persisted
  alongside the Proposal, never round-tripped into `materialize-config.ts`,
  never written to `localStorage` via `use-portfolio-state.ts`.
- Every `UserIntent` field the user ultimately sets is still `provenance:
  "USER"` — set only by the user's own click, exactly as today
  (`materialize-config.ts:82-104` is completely unchanged by H.5). An AI
  suggestion the user clicks is indistinguishable, at the type level, from
  an answer the user typed unprompted.
- `materializeStockPlaybookConfig`, `deriveStrategyFieldsFromIntent`,
  `deriveDiscrepancies`, `mapThesisTrajectoryToHealth`,
  `RULESET.strategyDefaults` — **zero changes**. This is not a simplifying
  assumption; it's the whole point of the boundary in §0.1: nothing H.5
  adds can reach these functions except through the same `UserIntent`
  shape they already validate today.

---

## 3. AI Research Context — the input, assembled deterministically

A single, bounded, explicitly-typed context object built by a pure
function from data the app already has — **never** a live web fetch,
document upload, or open-ended retrieval in v0.1 (see §8, "What v0.1
deliberately excludes," for why).

```ts
interface AIResearchContext {
  instrument: { ticker: string; name: string };
  // Reused verbatim — src/types/playbook-proposal.ts:33-37. Read-only.
  portfolioContext: PortfolioContext;
  // Reused verbatim — src/types/playbook-proposal.ts:79-90. Includes
  // MISSING/INSUFFICIENT_DATA states exactly as computed today; AI never
  // sees a "cleaned up" or reinterpreted version of this.
  researchEvidence: ResearchEvidence;
  // Whatever the user has already answered, literal enum values only —
  // never inferred, never guessed at by this function.
  userIntentSoFar: Partial<{
    investmentRole: InvestmentRole;
    confidence: ConfidenceLevel;
    currentIntention: CurrentIntention;
    thesisTrajectory: ThesisTrajectory;
  }>;
  // Only included once computable (mirrors GuardrailPreview's own
  // dependency on currentWeightPct being non-null) — lets AI reference a
  // live discrepancy without ever being asked to resolve it.
  guardrailPreview?: GuardrailPreview;
}
```

No user identity, name, or email is included — the model reasons about an
instrument + portfolio position, not a person.

This context is built once per onboarding session (evidence doesn't change
mid-flow — it was already fetched once, server-side, before the overlay
opened, `page.tsx:41-44`) and reused for both AI touchpoints.

---

## 4. AI output contract #1 — Evidence Brief

**Purpose:** goals 1 and 2 — understand the stock, understand what's
missing and why that matters. Shown passively to every user, not gated on
any question being unresolved.

```ts
interface AIEvidenceBrief {
  summary: string;              // 2-4 sentences, plain language
  strengths: EvidencePoint[];   // only from SCORED/AVAILABLE evidence
  uncertainties: EvidencePoint[]; // MISSING/INSUFFICIENT_DATA/UNKNOWN_FIT
                                   // AND genuine counterpoints/risks even
                                   // where evidence is SCORED — this is
                                   // where "challenge" lives (§1)
  meta: AIResponseMeta;
}

interface EvidencePoint {
  text: string;
  // Which field(s) of AIResearchContext this claim is grounded in — see
  // §6. Empty array is legal ONLY when `text` is itself a disclosed
  // generality (e.g. "growth-stage companies often show mixed guidance in
  // early quarters"), never for a claim about THIS company.
  groundedIn: EvidenceFieldRef[];
}

type EvidenceFieldRef =
  | "researchEvidence.momentum"
  | "researchEvidence.fundamentals"
  | "researchEvidence.fundamentals.modelFit"
  | "researchEvidence.valuation"
  | "researchEvidence.price"
  | "portfolioContext.currentWeightPct"
  | "portfolioContext.valuation"
  | "guardrailPreview";

interface AIResponseMeta {
  modelVersion: string;
  generatedAt: string;
  latencyMs: number;
}
```

Rendering rule: `strengths`/`uncertainties` never use the deterministic
`Positive`/`Neutral`/`Weak` pill styling (`SignalScorecard`'s semantic
language, Interface Principles §10) — that visual vocabulary is reserved
for actually-computed `ScoreItem`/`SignalState` values. AI prose gets its
own visually distinct treatment (e.g. a bordered "AI interpretation" panel
with a small AI-source label), so it never reads as a fourth deterministic
signal sitting alongside Fundamentals/Momentum/Valuation.

**Placement in the real DOM:** between the Decision card and the
Reasoning card in `ReviewScreen` (`PlaybookOnboardingOverlay.tsx:542-588`
ends, `590` begins) — i.e. exactly where H.3 §5 originally placed
discrepancy callouts, but AI's Evidence Brief is additive commentary, not
a blocking callout, so it sits just after them, immediately before the
raw Reasoning rows it's explaining.

**Trigger:** requested once, automatically, when the Analyze step begins
— extending, not replacing, the existing three-row checklist
(`AnalyzeScreen`, lines 446-457) with a fourth row ("Reading the
evidence"). Unlike the existing three rows (which are already resolved by
the time Analyze renders — evidence was fetched before the overlay opened,
per the file's own comment at lines 123-127), this row is genuinely async.

---

## 5. AI output contract #2 — Intent Assist

**Purpose:** goal 3 — resolve "Not sure." Requested on demand, never
automatically, and never for a question the user has already answered
confidently.

```ts
interface AIIntentAssist {
  question: "INVESTMENT_ROLE" | "CORE_PORTION" | "CONFIDENCE"
          | "CURRENT_INTENTION" | "THESIS_TRAJECTORY";
  // Each suggestion's `value` MUST be a literal member of that question's
  // existing production enum — never a new value, never free text as a
  // selectable option. Validated server-side before the client ever sees
  // it (§6). 1-3 suggestions, not a ranked single "answer."
  suggestions: IntentSuggestion[];
  // Investment Role and Core Portion are personal-preference questions no
  // amount of evidence fully resolves (§5.1) — AI may ask instead of/
  // alongside suggesting.
  clarifyingQuestions?: string[];
  caveats: string[];
  meta: AIResponseMeta;
}

interface IntentSuggestion {
  value: string;   // e.g. "MEDIUM" for CONFIDENCE, "GETTING_STRONGER" for THESIS_TRAJECTORY
  rationale: string;
  groundedIn: EvidenceFieldRef[];
}
```

### 5.1 Not all five questions are equally "answerable" from evidence

This matters enough to state explicitly rather than let the UI imply a
uniform capability:

- **Confidence** and **Thesis Trajectory** are the two questions evidence
  can genuinely speak to — coverage, model fit, and score can support a
  concrete, well-grounded suggestion (§5.4 reuses spec §15's exact
  structured shape for thesis).
- **Investment Role** and **Core Portion** are fundamentally about the
  user's own financial situation and intent — how much of *their*
  portfolio *they* want here. AI has no access to goals, time horizon, or
  risk tolerance beyond what's already in `portfolioContext`. For these
  two, `clarifyingQuestions` (e.g. "Do you expect to need this money
  within 5 years?") carry more weight than `suggestions`, and any
  `suggestions` offered must frame themselves as a starting point tied to
  observable portfolio facts ("this would already be your 3rd-largest
  position at current weight"), never as a confident recommendation.
- **Current Intention** sits in between — AI can reference the
  `guardrailPreview` to point out a likely tension (e.g. "if you're
  leaning toward buying more, note you're already near a typical ceiling
  for this size of position") without asserting what the user wants.

This is a product-quality distinction the UI copy must reflect (H.3-style
"speak to the user, not to the model's confidence" — Interface Principles
§14/§15), not a schema-level rule — the type is uniform across all five
questions on purpose (§5, "product meaning, not legacy shape," H.1 §1)
because a future, better-evidenced version of this feature (e.g. richer
portfolio-level context) should not require a schema change.

### 5.2 Trigger and placement

Two entry points, both explicit user actions, never automatic:

1. **On the question screen itself** — selecting "I'm not sure" / "Help me
   decide" / "Help me assess" reveals a secondary "Get AI help" action
   next to that option (not replacing it — the option remains fully
   selectable on its own, per H.3 §2's "not visually demoted" rule).
   Clicking it calls Intent Assist for that specific question and renders
   `suggestions` as additional selectable cards, visually distinguished
   (e.g. a small AI-source tag) from the four original hand-authored
   options — selecting one sets the real `UserIntent` field exactly as
   selecting any other option would.
2. **From Review's unresolved list** — the existing amber "Decide" link
   (`ReviewScreen`, lines 506-518) already jumps back to the specific
   question; H.5 adds nothing new here except that arriving via this path
   auto-triggers Intent Assist immediately (the user has already signaled
   "I need help" by not resolving it before reaching Review).

### 5.3 What happens after a suggestion is selected

Nothing new. The click sets `userIntent.<field> = {provenance: "USER",
value: <the selected literal>}` through the exact same handler every other
option already uses (`PlaybookOnboardingOverlay.tsx`'s existing
`QuestionScreen` selection handling). `AIIntentAssist` is discarded once
its screen is left — it is not re-shown on Review, not stored, not
threaded into `PlaybookProposal` in any form. The Proposal has no memory
that AI was involved in reaching this answer.

### 5.4 Thesis Trajectory reuses an existing, more detailed contract

Because spec §15 already fully specifies this, Thesis Trajectory's
`IntentSuggestion.rationale` is backed by a richer intermediate structure
before being compressed to the uniform shape above:

```ts
// Internal to the Thesis Trajectory Intent Assist call only — not part of
// the public AIIntentAssist type other questions use.
interface ThesisAssessment {
  state: ThesisTrajectory;         // beginner vocabulary, not raw ThesisHealth (H.1 §2.3)
  confidence: "HIGH" | "MEDIUM" | "LOW";
  supportingEvidence: EvidencePoint[];
  contradictingEvidence: EvidencePoint[];
  unknowns: string[];
}
```

`triggered_breakers` from spec §15's original contract is **not** carried
here — thesis breakers are hand-authored, Unity-only content
(H.0 §5 item 2, out of Phase H entirely); a newly onboarded stock has none
to reference, and H.5 does not add a beginner-facing concept of
"breakers" that H.0 already ruled out of scope.

---

## 6. Grounding — the anti-fabrication mechanism

Prompt instructions alone cannot guarantee a model never states an
ungrounded claim as fact. H.5 backs the instruction with a mechanical
check, applied server-side before any AI output reaches the client:

1. **Enum validation.** Every `IntentSuggestion.value` is checked against
   the actual production enum for that `question` (the same
   `InvestmentRole`/`ConfidenceLevel`/`CurrentIntention`/`ThesisTrajectory`
   union types `src/types/playbook-proposal.ts` already defines). A
   suggestion with an invalid/hallucinated value is dropped, not
   repaired — never silently coerced to the nearest valid value.
2. **Citation validation.** Every `EvidenceFieldRef` in a response is
   checked against the actual `AIResearchContext` that was sent for that
   request. A reference to a field that wasn't in the context (e.g. citing
   `researchEvidence.valuation` when it was `MISSING`, or citing a made-up
   path) invalidates that specific point — it is dropped, not shown with
   a broken citation.
3. **Missing-evidence consistency.** If `researchEvidence.momentum.status
   !== "SCORED"`, no `EvidencePoint` may cite `researchEvidence.momentum`
   as support for a "strength" — only as an "uncertainty" (i.e., a point
   can cite MISSING/INSUFFICIENT_DATA evidence only when its own text
   is *about* that absence, never blended in as if it were a signal).
   This is `MISSING != 0` (PHASE-D-INTEGRATION-GUIDE §4) applied to AI
   text, not just numbers.
4. **A response that fails validation entirely degrades to "AI assistance
   unavailable"** (§7), never to a partially-repaired or best-effort
   rendering — a malformed AI answer is functionally identical to a failed
   one from the UI's perspective.

This is deterministic, ordinary application code — not a second AI call
"checking" the first one. It cannot catch every possible subtle
inaccuracy in `summary`/`rationale` prose (an LLM can still phrase a true
fact misleadingly), which is why every AI-sourced panel is labeled as AI
interpretation with visible citations the user can check against the raw
Reasoning rows sitting right next to it (§4) — verifiability, not just
validation, is the actual anti-fabrication mechanism for the parts that
can't be mechanically checked.

---

## 7. Failure, timeout, and fail-soft behavior

Matches the existing precedent `fetchLiveMomentumResult`/
`fetchLiveFundamentalsResult` already established (never throw, resolve to
an honest "unavailable" state) — H.5 does not invent a new failure
philosophy:

| Touchpoint | Timeout | On failure/timeout |
|---|---|---|
| Evidence Brief | ~6-8s, non-blocking | Analyze proceeds to Review on schedule regardless (§4); the Evidence Brief panel shows "AI interpretation unavailable right now" and the Reasoning card below it renders exactly as it does today — nothing about the deterministic Review screen depends on this succeeding |
| Intent Assist | ~8-10s | The triggering option's own selection remains fully usable; UI shows "AI assistance unavailable — you can still choose directly" and clears the loading state; the question screen never blocks on this |

**Confirm Playbook is never gated on any AI call succeeding, ever** — it
was never gated on AI to begin with (`materialize-config.ts`'s validation,
§0.1, has no AI-related precondition and gets none added).

No retries that could extend perceived latency; one attempt per user
action, matching the "each AI call is user-initiated, bounded, and
predictable" cost posture (Analyze triggers at most one Evidence Brief
call per onboarding session; Intent Assist triggers at most one call per
"Get AI help" click).

---

## 8. What v0.1 deliberately excludes

Stated explicitly, matching this project's convention of naming
out-of-scope items rather than letting scope creep in silently
(PHASE-D-INTEGRATION-GUIDE §15):

1. **No live web research, news, or document extraction.** The plan's
   "AI may research" is satisfied here by *interpreting already-fetched,
   already-scored structured evidence* (§30's Explanation Contract shape)
   — not by giving the model browsing/retrieval tools or ingesting raw
   filings (§29's Research Contract, which requires a document pipeline
   that does not exist). Rationale: "smallest useful" (this task's own
   framing), and open-web content is a materially larger fabrication
   surface with no existing provenance-tracking mechanism to ground
   citations against (§6 depends on the context being a closed, typed
   object). Real external research (filings, news, analyst commentary) is
   a distinct, larger future capability — tracked the same way multi-
   archetype fundamentals already is (H.0 §5 item 1) — not silently
   assumed to be in scope because "research" is in H.5's name.
2. **No fundamentals archetype/model-fit classification.** H.0 §5 item 1
   already resolved this **out of Phase H entirely**, not deferred to
   H.5 specifically. `modelFit` stays `"UNKNOWN_FIT"` by construction;
   H.5 does not reopen this even though `ResearchEvidence.fundamentals`
   has an obvious-looking `modelFit` slot (audit-confirmed: it's
   `DETERMINISTIC`-only in the type today, with no `AI` case — adding one
   would itself be new scope this document declines to open).
3. **AI never populates `ProposedConfiguration`.** H.1 §2.6
   (`docs/phase-h1-playbook-proposal-model.md:314-320`) speculatively
   anticipated `provenance: "AI"` eventually appearing on
   `targetAllocationRange`/`accumulationCeilingPct`/`corePosition`/
   `thesisHealthPreview` — i.e., AI directly proposing the numbers H.2's
   rule tables compute today. **H.5 v0.1 does not exercise this.** See
   §9 (Model Decision) for why this is a deliberate narrowing of H.1's
   forward-looking design, not an oversight.
4. **No persistence of AI output.** Not attached to `PlaybookProposal`,
   not saved alongside `StockPlaybookConfig`, not logged to any
   user-visible history. (Server-side request logging for quality
   evaluation is an infra/ops concern, out of this design's scope.)
5. **No agentic tool use.** Each AI call is one structured-completion
   request over a fixed context; the model cannot call other tools,
   fetch additional data, or take multiple turns to "investigate."
6. **No change to discrepancy handling.** `onboarding-discrepancies.ts`'s
   HARD/SOFT catalog and its blocking/acknowledgment behavior
   (H.2 §6) are untouched — AI may reference a discrepancy in its
   commentary (via `guardrailPreview` in context) but never resolves,
   suppresses, or explains it away; the deterministic callout (H.3 §6.2/
   §6.3) remains the only authority on what blocks confirmation.

---

## 9. MODEL DECISION — AI stays upstream of the Proposal, not inside it

H.1 §2.6 left the door open for `provenance: "AI"` to eventually appear
directly on `ProposedConfiguration` fields — i.e., a future version where
AI itself proposes the target allocation range, not just helps the user
answer intent questions. This task's own boundary diagram
(`Raw Evidence → AI Interpretation → User Decision → Deterministic
Proposal → Engine Decision`) puts AI Interpretation **before** User
Decision, which resolves this in favor of the narrower reading:

**Decision: H.5 v0.1 never uses `provenance: "AI"` anywhere in
`PlaybookProposal`.** Every field in `ProposedConfiguration` remains
exactly what H.2 already makes it — a deterministic function of whatever
concrete `UserIntent` the user lands on, whether or not AI helped them get
there. `AIEvidenceBrief`/`AIIntentAssist` are new types that live entirely
outside `PlaybookProposal`, never merged into it.

Why this is the right v0.1 scope, not merely the cautious one:

- It requires **zero schema changes** — `PlaybookProposal`,
  `ProposalField<T>`, `materialize-config.ts` are byte-for-byte unchanged.
  The "AI" provenance case the type already reserves stays reserved,
  unused, for a genuinely later decision.
- It keeps the confirmation boundary (§0.1, H.1 §1.2) at its current,
  already-proven strength: an AI-authored *number* never has to be
  validated/clamped by H.2, because AI never produces a number that
  reaches `ProposedConfiguration` — it only ever influences which
  `UserIntent` literal the user clicks, and H.2's existing validation of
  `UserIntent` (unresolved-answer rejection, discrepancy gating) already
  covers every value that could arrive this way, exactly as it does for a
  value the user reached with no AI involvement at all.
- It matches the three stated goals exactly — none of them asks for AI to
  set numbers; they ask for understanding and unblocking.

A future H.5.x/H.6-adjacent phase that lets AI directly propose
`ProposedConfiguration` values (H.1's original speculation) would need its
own design pass — most notably, deciding what "H.2 validates it" means
when the input number itself, not just the user's intent category, comes
from AI. That is explicitly not resolved here.

---

## 10. Infrastructure shape (design-level only)

Not implementation detail, but the design has structural implications
worth fixing now so H.5's implementation doesn't improvise the boundary:

- **Server-only.** Both touchpoints require a new server-side entry point
  (Next.js Route Handler or Server Action) — there are none in this
  codebase today (`find src/app -path '*api*' -name route.ts` is empty).
  The AI provider API key lives in an env var read only server-side,
  mirroring `SEC_EDGAR_USER_AGENT`'s existing pattern
  (`.env.local.example`) — never bundled to the client.
- **`AIResearchContext` is assembled server-side**, from data the client
  already has (it's already in the rendered `PlaybookProposal`/overlay
  state) — the client sends the same shape it already computes locally
  for `buildProposal` (`PlaybookOnboardingOverlay.tsx:176`), the server
  does not re-derive portfolio/evidence facts from scratch or trust a
  client-supplied "summary" of them.
- **Two request shapes, one grounding layer.** `AIEvidenceBrief` and
  `AIIntentAssist` can share one validation module (§6) even if they're
  separate endpoints/actions — the enum-membership and
  citation-against-context checks are identical in structure for both.
- Provider/model choice is an implementation-time decision, not a design
  constraint fixed here.

---

## 11. Guardrail and AI-boundary compliance checklist

| Requirement | How this design satisfies it |
|---|---|
| AI may research, summarize, explain, challenge | §4 (Evidence Brief: summarize/explain/challenge via `uncertainties`), §5 (Intent Assist: helps articulate intent, per plan's own language) |
| AI must never silently decide user intent | §5.3 — every `UserIntent` field is still set only by the user's own click; AI produces `suggestions`, never a write |
| AI must never change strategy numbers | §9 — `provenance:"AI"` never used on `ProposedConfiguration`; H.2's rule tables are the only source of `Strategy` numbers, unchanged |
| AI must never override constraints | §8 item 6 — discrepancy HARD/SOFT catalog and its blocking behavior are untouched; AI may reference but never resolve a discrepancy |
| AI must never fabricate evidence | §6 — mechanical enum + citation validation; missing evidence can only be cited as an uncertainty, never blended in as a signal (§6 item 3) |
| AI must never determine production Stance/ActionZones | Not touched anywhere in this design — `deriveActionZoneState`/`runDecisionEngine` receive no AI input, direct or indirect |
| AI must never mutate `StockPlaybookConfig` | §2 — AI has no write path to `materialize-config.ts` or any persisted state; `PlaybookProposal` itself is unchanged by AI (§9) |
| Missing != 0 / missing evidence != false certainty | §6 item 3; §4's Evidence Brief exists specifically to make missing/uncertain evidence *more* visible, in plain language, not to paper over it |
| Preserve explainability (user-said/system-observed/proposed) | §3 — `AIResearchContext` is built only from already-tagged `ProposalField`-shaped data; AI adds a fourth, clearly-labeled "AI interpretation" register, never blended into the other three |
| Deterministic engine remains sole decision authority | §0.1, §2 — `runDecisionEngine` and everything upstream of it in H.2 is unchanged; AI's entire footprint sits before `UserIntent` is finalized |
| Fail-soft, non-blocking | §7 — Confirm Playbook has no AI precondition; both touchpoints degrade to an honest "unavailable" state under failure/timeout |

---

## 12. Minimum useful H.5 v0.1 — summary

**New (additive only):**
- Types: `AIResearchContext`, `AIEvidenceBrief`, `AIIntentAssist`,
  `IntentSuggestion`, `EvidencePoint`, `EvidenceFieldRef`,
  `AIResponseMeta` (and the internal `ThesisAssessment` for §5.4).
- A pure, server-side context-builder function (§3, §10).
- A grounding/validation module shared by both touchpoints (§6).
- Two server-side AI entry points (§10).
- UI: an Evidence Brief panel in `ReviewScreen`, a fourth Analyze-checklist
  row, a "Get AI help" affordance on not-sure options and on Review's
  existing "Decide" links (§4, §5.2).

**Unchanged (verified, not merely asserted):**
- `PlaybookProposal` and every field in it.
- `materializeStockPlaybookConfig`, `deriveStrategyFieldsFromIntent`,
  `deriveDiscrepancies`, `mapThesisTrajectoryToHealth`,
  `RULESET.strategyDefaults`.
- `runDecisionEngine` and everything it consumes.
- Persistence (`use-portfolio-state.ts`/`portfolio-storage.ts`) — AI
  output is never written there.

**Explicitly out of scope for v0.1:** live web/document research,
fundamentals archetype classification, AI-authored `ProposedConfiguration`
values, AI-authored discrepancy resolution, any persistence of AI output
(§8).

This is intentionally small: two read-only interpretation surfaces, zero
schema changes to the confirmed Proposal/config pipeline, and a boundary
that is enforced mechanically (§6), not merely by prompt instruction.
