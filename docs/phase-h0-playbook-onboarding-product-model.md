# Phase H.0 — Playbook Onboarding Product Model (Design)

Status: **design only, not implemented**. Source: `docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`.

## 0. Current state — what the system already knows

This section is the factual baseline the model below reacts to. Every
claim was verified directly against the current source (file:line cited).

### 0.1 The engine itself is already stock-agnostic

`runDecisionEngine(input: EngineInput)` (`src/domain/engine.ts:157`) contains
no Unity-specific branching anywhere — it takes `position`,
`portfolioTotalEur`, `executionPriceEur`, `strategy`, `thesisHealth`,
`scorecard`, `actionZoneTemplates`, and optional `momentumResult`/
`fundamentalsResult`, and is already fully generic. Likewise the Portfolio
↔ Engine bridge built in G.1–G.6 (`toStockEngineInputs`,
`createStockPlaybookConfig` in `src/domain/portfolio/snapshot.ts`,
`stock-concentration-view.ts`) is generic over any `STOCK` holding, not
Unity-specific. **The deterministic engine and the Portfolio-side plumbing
require zero changes for Phase H.** The gap Phase H must close is entirely
in (a) how a `StockPlaybookConfig` gets *created* for a new stock, and (b)
a body of hand-authored, Unity-only content that has no data-model home
today (§0.3).

### 0.2 The exact shapes onboarding must produce

```ts
// src/types/portfolio.ts:50
export interface StockPlaybookConfig {
  instrumentId: string; // join key to Holding.instrument.id — never embedded in Holding
  strategy: Strategy;
  playbook: Playbook;
}
```

```ts
// src/types/playbook.ts:81
export interface Strategy {
  horizon: string;
  shortTermMaxWeightPct: number;
  mediumTermTargetMinPct: number;
  mediumTermTargetMaxPct: number;
  coreSharesMin?: number;       // both-or-neither with coreSharesMax
  coreSharesMax?: number;
  tacticalSharesMin: number;
  tacticalSharesMax: number;
  preferredTargetWeightPct?: number;
  benchmarkInstrumentId?: string;
}

export interface Playbook {
  stance: Stance;
  confidence: Confidence;       // "LOW" | "MEDIUM" | "HIGH"
  thesisHealth: ThesisHealth;
  version: number;
  updatedAt: string;
  summary: string;
}
```

`EngineInput` (`src/domain/engine.ts:59`) needs two things beyond
`StockPlaybookConfig` that today only exist as Unity's hand-authored seed
data, sourced separately from `unity-seed.ts` by
`src/app/stocks/[ticker]/page.tsx:38-46` and never touched by
`StockPlaybookConfig` at all:

- `scorecard: Scorecard` — six `ScoreItem`s (fundamentals, valuation,
  momentum, thesisHealth, positionFit, concentrationRisk).
- `actionZoneTemplates: ActionZone[]` — five zone objects (ADD / HOLD /
  TRIM_1 / TRIM_2 / THESIS_REVIEW), each carrying `title`, `summary`,
  `primaryTrigger`, `suggestedAction`, `whyBullets`, `doNotTriggerIf`.

### 0.3 What is live-derived vs. stored vs. frozen prose (verified)

| Field | Source of truth today | Verified by |
|---|---|---|
| `position`, `portfolioTotalEur`, weight | Live, derived every render from `PortfolioSnapshot` | G.1–G.6 |
| `concentrationState`, `stance` (as *displayed*) | Live, derived by `runDecisionEngine`/`deriveStance` — **not** read from `config.playbook.stance` anywhere anymore | `grep` for `playbook.stance` / `.stance` finds only `stock-concentration-view.ts`'s live derivation and `HoldingsTable.tsx`'s consumption of it; `config.playbook.stance` itself is never read for display or decisions after G.6 |
| `Scorecard.positionFit`, `.concentrationRisk` | Live, recomputed every render (`recalculateScorecard`, `src/domain/playbook/scoring.ts:46`) | unchanged since Phase B.5 |
| `Scorecard.thesisHealth` | Live, mechanically derived from `playbook.thesisHealth` (`deriveThesisScoreItem`) | `src/domain/thesis/thesis.ts:24` |
| `Scorecard.fundamentals`, `.momentum` | Live **when** `fundamentalsResult`/`momentumResult` is `SCORED`; otherwise falls back to whatever static value was seeded | `src/domain/engine.ts:220-241` |
| `Scorecard.valuation` | **No derivation function exists.** `deriveValuationScore` (`src/domain/signals/signals.ts:11`) is a literal pass-through of whatever static value was seeded — permanently frozen, for every stock including Unity | `signals.ts:1-4`'s own doc comment: "Phase C will replace these pass-throughs... For now every function returns the static seed value unchanged" |
| `ActionZone.state` | Live, recomputed every render (`deriveActionZoneState`) | `src/domain/engine.ts:199-202` |
| `ActionZone.title/summary/primaryTrigger/suggestedAction/whyBullets/doNotTriggerIf` | **Frozen at authoring time.** Rendered verbatim by `ActionZoneCard.tsx:56`, `ActionZoneDrawer.tsx:134-186`, `PrimaryActionCard.tsx:77` — nothing recomputes this text from live values | Directly demonstrated in this session's own G.6 testing: after a real SELL changed Unity's weight from 58.6% to 55.3%, the ADD zone's `whyBullets` still read "Current portfolio weight: 58.6%" — a live, reproducible staleness bug, not a hypothetical |
| `Playbook.summary` | Frozen hand-authored prose (`unity-seed.ts:52-54`) | Rendered verbatim, `PlaybookStatusBanner.tsx:56` |
| Thesis text/catalysts/risks/thesisBreakers, "what would change my view," research documents | **Not part of `StockPlaybookConfig`/`Strategy`/`Playbook` at all.** `ThesisCard.tsx:1`, `WhatChangesMyView.tsx:1`, and `ResearchPreview.tsx:1` `import { unityThesis }` / `{ unityViewChanges }` / `{ unityResearch }` **directly from `unity-seed.ts`**, take **no props whatsoever**, and are structurally incapable of rendering any other stock without a code change | Read directly; confirmed these three components have zero props in their signatures |
| Fundamentals evidence *archetype* | Hardcoded: `fetchLiveFundamentalsResult` always scores against `GROWTH_SOFTWARE_TEMPLATE`, for every ticker, unconditionally | `src/infrastructure/market-data/sec-edgar/orchestration.ts:28,51`; `FundamentalsArchetype` (`src/types/fundamentals.ts:23`) has exactly one member |

### 0.4 Fields that exist in the type but are provably dead

Grepped with zero non-definition/non-seed hits:

- `Strategy.horizon` — never read anywhere (display uses `unityThesis.horizon`, an unrelated field).
- `Strategy.tacticalSharesMin/Max` — never read by the engine; actual tactical inventory is derived from `coreSharesMin/Max` + current shares (`calcTacticalInventory`, `src/domain/portfolio/concentration.ts:45`), not from these fields.
- `Playbook.version`, `Playbook.updatedAt` — never read; the UI shows hardcoded literal strings ("Last updated today, 16:18") instead.
- `RULESET.confidence.mediumThreshold/highThreshold` (`ruleset-v0.1.ts:24-26`) — no classifier function exists; `Playbook.confidence` is pure stored/display data, never derived from a score.
- `Playbook.stance` — write-only since G.6 (§0.3 above); the engine always recomputes the displayed stance live.

This matters directly for guardrail #12 ("do not expose engine complexity
to beginners without a product reason") and #10 ("do not duplicate derived
values"): onboarding does not need to derive real values for any of these
five fields. A deterministic placeholder is correct, not a shortcut.

### 0.5 Only STOCK holdings, only one config exists

`createStockPlaybookConfig` (`src/domain/portfolio/snapshot.ts:208`) already
rejects a non-`STOCK` `instrumentId`, matching brief §1/§14. Today exactly
one `StockPlaybookConfig` exists (`stock-playbook-seed.ts`, Unity), built
from a **static array with no add/edit/persist mechanism** — the same shape
of gap `holdings-seed.ts` had before Phase G.3 introduced
`usePortfolioState`/localStorage CRUD for `Holding[]`. **The persistence
mechanism Phase H needs has a proven, working precedent to extend
(`src/lib/use-portfolio-state.ts`), not one to invent from scratch.**

---

## 1. Responsibility model, mapped onto real fields

Restating the plan's five responsibility categories against what actually
exists today, not in the abstract:

### User provides (cannot be inferred safely)

| Plan's category | Maps to |
|---|---|
| Investment role | New concept — no current field (§3) |
| Confidence | `Playbook.confidence` — direct 1:1 store, already exists, already display-only |
| Current intention | New concept — **no current field, and per guardrail #6 must never become one that mechanically drives `Stance`** (§3) |
| Approval/rejection/edits of a proposal | H.1/H.3 concern — no current equivalent (there is no proposal state machine today) |

### Portfolio/System reuses (already known)

Shares, average cost, portfolio value/weight, cash, other holdings,
instrument identity — **all already available** via `PortfolioSnapshot` +
`Holding` (Phase G, unchanged). Nothing here needs re-asking the user;
`toStockEngineInputs` already assembles exactly this for any `STOCK`
holding with a linked config.

### Market/Research provides (evidence)

Price (`RawQuote`), Momentum (`MomentumScoreResult`), Fundamentals
(`FundamentalsScoreResult`) already exist as live, generic,
per-`instrumentId` pipelines (`twelve-data/orchestration.ts`,
`sec-edgar/orchestration.ts`) — genuinely reusable for any ticker.
**Valuation has no live pipeline at all** (§0.3) — for any stock, not just
new ones. **Fundamentals evidence is scored against a single hardcoded
archetype** regardless of the actual company (§0.3, §4.1).

### AI proposes (Phase H.5, not H.0)

Nothing in the current codebase calls an LLM. This is a hard boundary:
Phase H.0–H.4 must be fully specifiable and buildable with **zero** AI
involvement, exactly as the plan orders phases (H.5 only "after Proposal
and deterministic mapping contracts are stable"). Where the beginner
intent hypothesis includes "I'm not sure — help me decide," H.0 records
that this branch has **no deterministic answer** and is explicitly
out of scope until H.5.

### Deterministic Engine remains authoritative (unchanged)

Confirmed in §0.1 — already true today, requires no work.

---

## 2. What "Create Playbook" must actually assemble

Restating the product goal's pipeline against the real types:

```
Stock Holding (Holding, assetType STOCK, already exists — G.3)
  + Portfolio Context (PortfolioSnapshot — already exists — G.1/G.2)
  + Research Evidence (RawQuote / MomentumScoreResult / FundamentalsScoreResult — already exist, generic)
  + Beginner Intent (role, confidence, current intention — NEW, §3)
→ Playbook Proposal (H.1 — NEW, does not exist today)
→ Review & Confirm (H.3 — NEW)
→ StockPlaybookConfig { instrumentId, strategy: Strategy, playbook: Playbook } (H.4 — persisted, extending G.3's mechanism)
→ Deterministic Engine (runDecisionEngine — unchanged, already generic)
→ Recommended Holding / Stance / Primary Action / Signals
```

Two things the pipeline's final output requires that a bare
`StockPlaybookConfig` does **not** supply, per §0.2–§0.3:

1. **A `Scorecard`.** `positionFit`/`concentrationRisk`/`thesisHealth` are
   free (recomputed live regardless of origin). `fundamentals`/`momentum`
   are free when live evidence is `SCORED`. `valuation` has no honest
   source at all today — for a new stock this must be `MISSING`/absent,
   never a fabricated static number (guardrail #7/#8), which the current
   `ScoreItem`-only `Scorecard.valuation` slot cannot represent (it has no
   "missing" state — only `EvidenceScoredItem`-shaped fields do, and
   valuation isn't wired into that pattern at all yet). **This is a
   pre-existing gap Phase H inherits, not one it introduces** — it affects
   Unity today exactly as it would any newly onboarded stock, so Phase H
   preserves the same honest-absence behavior rather than fixing it.
2. **`ActionZone[]` body content.** The five zone *types* (ADD/HOLD/
   TRIM_1/TRIM_2/THESIS_REVIEW) and their `state` derivation are already
   fully generic (`deriveActionZoneState`, §0.1). Their **prose** is not.
   This is the single largest concrete gap between "engine can decide" and
   "user can understand the decision" for a new stock (§5 item 3).

---

## 3. Beginner Intent Hypothesis — field-by-field mapping

| Intent question | Existing field it could inform | Deterministic mapping exists today? |
|---|---|---|
| **Investment Role** (long-term core / growth / tactical / not sure) | Whether core protection is *eligible* at all (§3.1) — not, by itself, the core range's size | No — the *shape* already supports a role-conditional core range without any type change (`resolveCoreShareRange`, `target-position.ts:68`, already accepts "both present" or "both absent"). The role tier alone does not size it (§3.1). |
| **Confidence** (high/medium/low/help me assess) | `Playbook.confidence` | Yes — direct store, zero derivation needed (§0.4 confirms this field is display-only). "Help me assess" has no deterministic answer (H.5). |
| **Current Intention** (build/hold/reduce/not sure) | **No existing field.** | Cannot map to `Playbook.stance` or any `Strategy` threshold — doing so would let a user's stated wish mechanically become the production recommendation, violating guardrail #6 ("User intent is not automatically the recommendation") outright. See §5, item 3. |

`benchmarkInstrumentId` (Relative Strength) needs no beginner input either
way — leaving it `undefined` is already a fully supported, non-degraded
state (`RelativeStrengthData`'s `NOT_APPLICABLE`, distinct from `MISSING`,
`src/types/market-data.ts:82-93`). Sensible-default benchmark inference
(e.g., by sector) is a possible future enhancement, not required for H.0–H.6.

### 3.1 Amendment (resolved 2026-09-15): Investment Role and Core Protection are separate axes

H.0's charge is to *validate, not assume* the plan's three-question
hypothesis is sufficient. It is not, as stated: **Investment Role and
Core Protection are two separate concepts, not one derived from the
other.** Resolution:

- Choosing **"Long-term core investment"** as Investment Role makes core
  protection *eligible* — it does **not** imply 100% of the current
  holding is automatically protected, and it must not be defaulted to
  100% either.
- A **second, conditional beginner-friendly question** — shown only when
  Investment Role is "Long-term core investment" — asks how much of the
  position the user considers long-term/permanent. The exact response
  format (a fraction, a share amount, a qualitative scale) is an H.3 UX
  decision, not an H.0 one; what H.0 fixes is that it is one plain-language
  question, never a raw `coreSharesMin`/`coreSharesMax` entry field.
- H.2 maps that answer **deterministically** into `coreSharesMin`/
  `coreSharesMax` (set together, honoring `resolveCoreShareRange`'s
  existing both-or-neither invariant unchanged) — the exact formula is
  H.2's job, not H.0's, per the plan's own phase split.
- **Growth** and **Tactical** roles do not get a core range in v0.1 —
  `coreSharesMin`/`Max` stay unset, exactly like every non-Unity
  `Strategy` shape already supports today.
- **"I'm not sure / help me decide"** remains available for Investment
  Role and is unaffected by this amendment — it still has no
  deterministic answer (H.5).

This means the beginner-facing flow is **three unconditional questions
plus one conditional follow-up**, not a flat four — H.1/H.3 should treat
the follow-up as gated on the Investment Role answer, not as a fourth
peer question asked unconditionally.

---

## 4. Guardrail compliance check

Walking the plan's 15 cross-phase guardrails against what this document
establishes:

1. **Portfolio remains ownership source of truth** — unaffected; Phase H
   only adds `StockPlaybookConfig` entries, never touches `Holding[]`.
2. **Engine remains production decision source of truth** — confirmed
   already true (§0.1); Phase H must not add a parallel decision path
   (e.g., an AI-computed stance) anywhere.
3. **Holding and StockPlaybookConfig remain separate** — already the
   case structurally (§0.5); Phase H must not fold Playbook fields into
   `Holding` or vice versa.
4. **Transactions are facts, not recommendations** — unaffected; no
   change to `applyTransactionToHoldings` (Phase G.6) is implied here.
5. **AI proposes; does not silently control production rules** — see §1's
   AI boundary and §5 item 1.
6. **User intent is not automatically the recommendation** — directly
   shapes §3's rejection of a naive Current-Intention→Stance mapping; see
   §5 item 3.
7. **Missing != 0** — already the established pattern throughout
   `PortfolioSnapshot`/`RawQuote`; Phase H must extend it to onboarding
   evidence (e.g., a stock with no live fundamentals must show that
   honestly, never a fabricated neutral score).
8. **Missing evidence must not become false certainty** — directly
   relevant to the fundamentals-archetype question (§5 item 1): applying
   a mis-fitted archetype is a subtler version of this violation than an
   outright missing value.
9. **Evidence coverage and evidence quality/state remain separate** —
   already the pattern (`MomentumEvidenceCoverage`/
   `FundamentalsEvidenceCoverage` distinguish `SCORED` vs.
   `INSUFFICIENT_DATA` from *how much* evidence was available); Phase H
   must reuse, not reinvent, this shape for any new evidence surfaced
   during onboarding.
10. **Do not duplicate derived portfolio/position values in Playbook
    config** — confirmed already true; `Strategy`/`Playbook` carry no
    position/value/weight fields (§0.2).
11. **Do not ask users for information the system already knows** —
    directly enforced in §1: shares/cost/weight/cash are never part of
    the beginner intent questions.
12. **Do not expose engine complexity to beginners without a product
    reason** — directly supported by §0.4's dead-field inventory: five
    fields need no real beginner-facing derivation at all.
13. **Preserve explainability (user-said vs. system-observed vs.
    system-proposed)** — no current type distinguishes these three
    provenances anywhere in `Strategy`/`Playbook`. This is a real gap
    H.1's Proposal schema must close; H.0 does not invent the schema
    (per the plan, that's explicitly H.1's deliverable) but flags that
    today's flat `Strategy`/`Playbook` shape has nowhere to record
    "the user said X" separately from "the engine computed Y."
14. **Broker execution not required** — unaffected; no change implied.
15. **Do not redesign unrelated Portfolio or Phase F interfaces** —
    directly grounds §5 item 2's recommendation (leave `ThesisCard`/
    `WhatChangesMyView`/`ResearchPreview` alone rather than retrofitting
    them now).

---

## 5. MODEL DECISIONS

Five items below are genuine product/model forks surfaced by this review.
All five are now resolved — three (items 2, 3, 5) by an existing guardrail
or the plan's own stated Success Criteria, two (items 1, 4) by explicit
product decision on 2026-09-15.

### 1. Fundamentals archetype for non-growth-software stocks — RESOLVED (2026-09-15)

Every ticker is scored against `GROWTH_SOFTWARE_TEMPLATE` today,
unconditionally (§0.3). ASML (Phase H.6's own validation target) is a
semiconductor-equipment manufacturer, not a growth-software company.
**Decision:** archetype fit is modeled as an **evidence
applicability/provenance** concern, not a score penalty — reusing the
same coverage/quality separation guardrail #9 already establishes for
`MomentumEvidenceCoverage`/`FundamentalsEvidenceCoverage` (§0.4's
"evidence coverage and evidence quality/state remain separate," now
extended with a third axis: archetype fit). Concretely:

- The `GROWTH_SOFTWARE` score remains computed and available — it is
  **never suppressed or treated as `MISSING`** just because the stock may
  not fit the archetype.
- The Proposal (H.1) must attach a visible **"LIMITED model fit"**
  disclosure whenever the archetype is not known to be appropriate for
  the stock — a fit judgment, not a data-availability judgment, and never
  presented as if it degrades the number itself (guardrail #8: missing
  evidence — or in this case, ill-fitted evidence — must not become false
  certainty *or* false uncertainty about the number's own correctness).
- **No archetype classification step is added in Phase H.** Since no
  classifier exists, and Unity is the only stock ever confirmed to fit
  `GROWTH_SOFTWARE` (its original hand-authored config), the conservative
  default for any newly onboarded stock is to show the "LIMITED model
  fit" disclosure unless/until a real classifier exists — H.1/H.4 should
  not invent a heuristic classifier as a side effect of this decision.
- **Multi-archetype fundamentals (a bank/biotech/etc. template, plus real
  classification) is tracked as a future capability, out of Phase H
  entirely** — not H.2, not H.5. `FundamentalsArchetype`
  (`src/types/fundamentals.ts:23`) already documents itself as "v0.1:
  exactly one member... a future archetype adds its own sibling key
  here," so this decision requires no type change now, only the
  provenance/disclosure field H.1's Proposal schema must add.

### 2. Where does hand-authored qualitative content live? — RESOLVED (recommended)

Thesis text/catalysts/risks/thesis-breakers, "what would change my view,"
and research documents (§0.3) have no field in `Strategy`/`Playbook` and
are hardcoded to Unity in three components with zero props. **Recommendation:
these are out of scope for Phase H.** The plan's own Success Criteria list
requires only "Recommended Holding, Stance, Primary Action, and signals"
for a newly onboarded stock — it does not mention thesis narrative, view-
changes, or research documents. Per guardrail #15, `ThesisCard`/
`WhatChangesMyView`/`ResearchPreview` should remain Unity-only and simply
not render (or render an honest empty state) for any other stock, rather
than being retrofitted now. Revisit only if a later phase's success
criteria explicitly expands to include this content.

### 3. Action-zone body content is frozen prose, and Primary Action is in scope — RESOLVED (recommended)

Unlike thesis/research content, **Primary Action is explicitly required**
by Success Criteria — and `PrimaryActionCard` renders `zone.primaryTrigger`/
`suggestedAction` verbatim from hand-typed text that already goes stale
for Unity itself (§0.3's demonstrated staleness bug). This cannot be
deferred like item 2. **Recommendation:** zone body content should become
deterministic, parameterized templates (e.g., "{ticker} is {weightPct}%
above your target maximum of {targetMaxPct}%" rendered from live
`Strategy`+snapshot values at display time), not AI-generated text
(premature per the plan's AI-ordering) and not a second round of frozen
hand-typed prose per onboarded stock (repeats the exact bug just found).
This is a genuine scope decision for H.1/H.2 — flagging rather than
designing the template mechanism here, since H.0 is explicitly design-only
for the *product model*, not the proposal schema itself.

### 4. Core-range applicability and derivation — RESOLVED (2026-09-15)

**Decision:** see §3.1 (Amendment) for the full resolution, which
supersedes this item's original framing. Summary:

- Only **"Long-term core investment"** makes a core range eligible;
  Growth and Tactical never get one in v0.1.
- Investment Role alone does **not** size it, and it is never defaulted
  to 100% of the current holding — Investment Role and Core Protection
  are separate concepts, not one derived from the other.
- A single conditional beginner question (asked only in the Long-term
  core branch) captures how much of the position is considered
  long-term/permanent; H.2 maps that answer deterministically into
  `coreSharesMin`/`coreSharesMax` (exact formula is H.2's job).
- This revises the plan's three-question hypothesis to "three
  unconditional plus one conditional follow-up," not a flat four —
  H.0's charge was to validate, not assume, the hypothesis was
  sufficient, and this is the validation finding.

### 5. "Current Intention" has no field — RESOLVED (recommended)

Per §3/guardrail #6, Current Intention must never mechanically set
`Stance` or any `Strategy` threshold. **Recommendation:** keep it
Proposal-only (H.1) — used to contextualize/explain the review screen
(e.g., surfacing a mismatch: "you said you want to build this position,
but it's already above your concentration limit") — and never persist it
into `StockPlaybookConfig` at all. This satisfies guardrail #6 by
construction: a value that is never stored in the production config
cannot leak into production decisions.
