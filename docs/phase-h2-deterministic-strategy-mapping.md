# Phase H.2 — Deterministic Strategy Mapping (Design)

Status: **design only, not implemented**. Source:
`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`,
`docs/phase-h0-playbook-onboarding-product-model.md`,
`docs/phase-h1-playbook-proposal-model.md`.

## 0. What H.0/H.1 already fixed, restated only where H.2 depends on it

- The engine, `toStockEngineInputs`, `createStockPlaybookConfig`, and the
  concentration/target-position/hard-constraint domain functions are
  already fully generic (H.0 §0.1) — H.2 adds a new *producer* of
  `StockPlaybookConfig`, it does not touch any of these.
- Five fields are provably dead: `Strategy.horizon`,
  `Strategy.tacticalSharesMin/Max`, `Playbook.version`,
  `Playbook.updatedAt`, `Playbook.stance` (write-only since G.6). Any
  valid value is correct (§7).
- `PlaybookProposal` (H.1) is the sole input to this mapping. Its
  `ProposedConfiguration` already carries `targetAllocationRange`,
  `accumulationCeilingPct`, optional `corePosition`, optional
  `preferredTargetPct`, optional `relativeStrengthBenchmark`, and
  optional `thesisHealthPreview` — all `DETERMINISTIC` provenance in
  v0.1. **This document defines exactly how those get computed** (the
  thing H.1 named as H.2's job but did not design).
- Fundamentals `modelFit` (`CONFIRMED_FIT`/`LIMITED_FIT`/`UNKNOWN_FIT`) is
  a fixed, independent third axis (H.0 §5 item 1) — no classifier is
  built here, per this task's explicit instruction.

---

## 1. Mapping overview

```
PlaybookProposal (status: CONFIRMED)
  ├─ userIntent.investmentRole ──────────────┐
  ├─ userIntent.corePortion ──────┐          │
  ├─ userIntent.thesisTrajectory ─┼──┐       │
  ├─ userIntent.confidence ───────┼──┼───┐   │
  ├─ userIntent.currentIntention ─┼──┼───┼─╳ (never mapped — H.0 §0 item 5)
  ├─ portfolioContext ─────────────┤  │   │   │
  └─ researchEvidence ─────────────┤  │   │   │
                                   ▼  ▼   ▼   ▼
                         §3        §4  §7  §2
                          │         │   │   │
                          ▼         ▼   ▼   ▼
                    coreSharesMin/  thesis  Playbook.  Strategy's
                    coreSharesMax  Health  confidence  numeric fields
                          │         │       │           │
                          └─────────┴───────┴───────────┘
                                        ▼
                         StockPlaybookConfig { instrumentId, strategy, playbook }
                                        ▼
                    (read/render time, never stored — §8, §9)
                    Scorecard  +  ActionZone[] body content
```

Materialization happens **once**, at confirmation (H.1 §2.7). The
resulting `StockPlaybookConfig` is indistinguishable from one authored
any other way — it carries no memory of `ProposalField` provenance
(H.1 §1.2).

---

## 2. InvestmentRole → Strategy numeric rules — RESOLVED

`Strategy.mediumTermTargetMinPct/MaxPct` (Proposal: `targetAllocationRange`)
and `Strategy.shortTermMaxWeightPct` (Proposal: `accumulationCeilingPct`)
are looked up from a per-role table, then the ceiling is derived, never
independently chosen:

```ts
interface RoleStrategyDefaults {
  targetAllocationRange: { minPct: number; maxPct: number };
}

// Versioned, matching ruleset-v0.1.ts's own convention — every number a
// labeled v0.1 policy hypothesis, not a universal investment truth, and
// not derived from Unity's own configuration (Unity is a user-specific
// legacy config, not the generic onboarding default). NOT_SURE has no
// entry: it cannot reach this mapping at all (H.1 §6 item 3 — blocks
// READY_FOR_REVIEW, so a Proposal never reaches CONFIRMED with it set).
type RoleStrategyDefaultTable = Record<
  Exclude<InvestmentRole, "NOT_SURE">,
  RoleStrategyDefaults
>;

const ROLE_STRATEGY_DEFAULTS_V0_1: RoleStrategyDefaultTable = {
  LONG_TERM_CORE: { targetAllocationRange: { minPct: 20, maxPct: 30 } },
  GROWTH:         { targetAllocationRange: { minPct: 10, maxPct: 18 } },
  TACTICAL:       { targetAllocationRange: { minPct: 3,  maxPct: 8  } },
};

// RULESET.strategyDefaults.accumulationCeilingBufferPct = 5 — a single
// versioned v0.1 policy constant, not a per-role number.
function deriveAccumulationCeilingPct(targetMaxPct: number): number {
  return targetMaxPct + RULESET.strategyDefaults.accumulationCeilingBufferPct;
}
```

Resulting v0.1 table:

| Role | Target allocation range | Ceiling (`= maxPct + 5pp`) |
|---|---|---|
| `LONG_TERM_CORE` | 20–30% | 35% |
| `GROWTH` | 10–18% | 23% |
| `TACTICAL` | 3–8% | 13% |

Rationale for deriving rather than independently setting the ceiling: it
is a guardrail *above* the target allocation, not a second independent
allocation objective — this avoids doubling the policy degrees of
freedom, and a fixed percentage-point buffer is simpler and more
interpretable for a beginner than a multiplier. The buffer is a named,
versioned v0.1 constant so it can be revised later without touching the
Proposal model.

Constraints this table satisfies, independent of the actual numbers
(these are structural invariants, not numeric choices):

- `targetAllocationRange.minPct < targetAllocationRange.maxPct` for every
  role (required by `deriveTargetPosition`'s own weight-share-range
  computation, `src/domain/portfolio/target-position.ts`) — holds for
  all three rows above.
- `accumulationCeilingPct >= targetAllocationRange.maxPct` for every role
  — otherwise HC-001 (`checkHC001`, triggers when weight exceeds
  `shortTermMaxWeightPct`) would fire *before* a position even reaches
  its own target ceiling, which is incoherent. Guaranteed by
  construction here, since the ceiling is always `maxPct + 5`.

`Strategy.preferredTargetWeightPct` is **not set** by this mapping for
any role. `deriveTargetPosition`'s existing no-core branch already
defines a documented, deterministic midpoint-of-range fallback when it is
absent (`resolvePreferredTargetShares`'s `midpoint` case,
`target-position.ts`) — reusing that existing, already-approved default
is more correct than inventing a second one here. `Strategy.
benchmarkInstrumentId` is also not set (H.0 §3 — no beginner input
requests a benchmark; stays `undefined`, `RelativeStrengthData`'s
existing `NOT_APPLICABLE` state).

---

## 3. CorePortion → core share range — RESOLVED

Only reachable when `investmentRole === "LONG_TERM_CORE"` and
`corePortion.status === "PROVIDED"` (H.1 §2.3). `Strategy.coreSharesMin`/
`coreSharesMax` must be set **together** — `resolveCoreShareRange`
(`target-position.ts`) already enforces both-or-neither and this mapping
must never violate it.

**Fixed by the production type itself, not a new choice:** `Strategy.
coreSharesMin`/`coreSharesMax` are absolute share counts, not a
percentage or a live-recomputed fraction. This mapping therefore computes
them **once, at confirmation time**, from the holding's actual share
count at that moment, as a symmetric percentage band around a center
(chosen over a single point or a fixed absolute-share buffer — a
percentage band scales proportionally with position size, matching how
Unity's own undocumented 600–650 band already behaves):

```ts
// RULESET.strategyDefaults.coreBandHalfWidthPct = 0.08 — a single named,
// versioned v0.1 policy constant, chosen to give a beginner's
// approximate core-portion answer reasonable flexibility. This is NOT
// derived from Unity's own 600–650 range (≈±4% of its 625 center) —
// that band has no documented derivation and is not treated as a
// generic-onboarding precedent.
const coreCenterShares = Math.round(
  corePortion.value.fractionOfCurrentHolding * holdingSnapshot.quantity
);
const coreSharesMin = Math.floor(
  coreCenterShares * (1 - RULESET.strategyDefaults.coreBandHalfWidthPct)
);
const coreSharesMax = Math.ceil(
  coreCenterShares * (1 + RULESET.strategyDefaults.coreBandHalfWidthPct)
);
```

If the user's holdings later change (a BUY/SELL, Phase G.6), the core
range does **not** auto-adjust — it stays fixed, exactly like Unity's
own `coreSharesMin: 600, coreSharesMax: 650` has never auto-adjusted
either. Revisiting an already-confirmed core range is an editing
capability outside Phase H's stated scope (H.0 §0.5 — Phase H is a
creation flow, not an edit flow).

Resolved to `coreBandHalfWidthPct = 0.08` (§11 item 1) — a versioned
v0.1 hypothesis chosen for beginner flexibility, explicitly *not*
derived from Unity's own (undocumented, ≈±4%) 600–650 band.

---

## 4. ThesisTrajectory → ThesisHealth

Fully resolved in H.1 (§5 item 8) — restated here as the authoritative
table, since this document is where it is actually consumed:

| `ThesisTrajectory` | → `ThesisHealth` |
|---|---|
| `GETTING_STRONGER` | `STRENGTHENING` |
| `NO_MEANINGFUL_CHANGE` | `INTACT` |
| `SOME_DOUBTS` | `MIXED` |
| `GETTING_WEAKER` | `WEAKENING` |
| `REASONS_NO_LONGER_HOLD` | `BROKEN` |
| `NOT_SURE` | *(no value — blocks `READY_FOR_REVIEW`, never reaches this mapping)* |

A fixed 1:1 lookup, not a judgment call — no numbers to choose, nothing
to ask about.

---

## 5. Proposal validation and confirmation rules

`CONFIRMED` (H.1 §2.7) requires, checked in this order:

1. **All `userIntent` fields concrete** — `investmentRole`,
   `confidence`, `currentIntention`, `thesisTrajectory` each hold a
   real answer, none is `"NOT_SURE"`/`"HELP_ME_ASSESS"` (H.1 §6 item 3).
2. **`corePortion` resolved if applicable** — `NOT_APPLICABLE` (role
   isn't `LONG_TERM_CORE`) or `PROVIDED` (a concrete fraction); never
   confirmed while still `MISSING`.
3. **`researchEvidence` assembled** — every field present in *some*
   valid state (`SCORED`/`INSUFFICIENT_DATA`/`MISSING`, per its own
   type) — evidence being absent does **not** block confirmation
   (missing evidence is a legitimate, honestly-representable state,
   never a reason to refuse to let the user proceed); only *unanswered
   user intent* blocks.
4. **`guardrailPreview.discrepancies` resolved per the contradiction
   policy** (§6) — `HARD` discrepancies block `CONFIRMED` until the
   conflicting `userIntent` field is revised; `SOFT` discrepancies
   require an explicit user acknowledgment; no discrepancy proceeds
   normally.
5. **`portfolioContext.valuation.state`** may be `COMPLETE`, `PARTIAL`,
   or `UNAVAILABLE` — onboarding is not blocked by portfolio valuation
   state (a user can express intent for a holding whose portfolio
   happens to be `PARTIAL` right now), but `toStockEngineInputs`
   (unchanged, G.1) will still honestly return `null` at *engine
   run-time* if valuation isn't `COMPLETE` then — materializing a
   `StockPlaybookConfig` is not the same as guaranteeing the Engine can
   immediately produce a Stance for it. This mirrors exactly how a
   `STOCK` holding with a config can already be un-computable today
   (G.5's "Playbook unavailable" state) — Phase H does not need a new
   mechanism for this, only to not accidentally special-case around it.

---

## 6. Contradiction handling — RESOLVED

### 6.1 The discrepancy catalog

`HARD` is reserved for discrepancies that conflict with an existing
*production hard constraint* or *actual action-eligibility rule* —
never assigned merely because an intent "looks" inconsistent with
portfolio size. This is why the earlier draft's
`BUILD_INTENT_ALREADY_OVERWEIGHT` (triggered purely by the
`OVERWEIGHT`/`SEVERELY_OVERWEIGHT` concentration classification) is
removed as its own Hard code: concentration classification alone is not
a real eligibility rule, and treating it as Hard would invent a new
prohibition the Engine itself doesn't enforce. The one case where BUILD
is genuinely, structurally blocked is HC-001 against the *proposed*
ceiling — that case is kept, and demoted concentration-only tension to
Soft:

| Code | Condition | Severity | Grounded in |
|---|---|---|---|
| `BUILD_INTENT_THESIS_BROKEN` | `currentIntention == BUILD` and `thesisTrajectory == REASONS_NO_LONGER_HOLD` (→ `BROKEN`) | Hard | HC-002 (`checkHC002` — any accumulation is prohibited once thesis is `BROKEN`) |
| `BUILD_INTENT_ACCUMULATION_BLOCKED` | `currentIntention == BUILD` and `checkHC001`-equivalent already triggers against the proposed `accumulationCeilingPct` | Hard | HC-001 (`checkHC001` — weight already exceeds the proposed ceiling) |
| `BUILD_INTENT_ALREADY_OVERWEIGHT` | `currentIntention == BUILD` and `concentrationStateIfConfirmedNow` is `OVERWEIGHT`/`SEVERELY_OVERWEIGHT`, **and HC-001 above does not already fire** | Soft | Concentration classification only — a heads-up, not a prohibition |
| `REDUCE_INTENT_WITHIN_TARGET` | `currentIntention == REDUCE` and `concentrationStateIfConfirmedNow == WITHIN_TARGET` | Soft | No rule is violated; simply low-stakes tension worth surfacing |

(The earlier draft's `HOLD_INTENT_SEVERELY_OVERWEIGHT` is dropped
entirely, not merely downgraded: wanting to hold steady while already
overweight is not actually in tension with anything — a beginner may
rationally choose not to act. Inventing a discrepancy for it would be
exactly the kind of unfounded prohibition this rule is meant to avoid.)

A small, enumerable, versioned table — no AI classification, no
free-text severity judgment. `Current Intention` still never drives
`Stance` or `Strategy` directly (H.0/H.1); discrepancies only gate
whether a `PlaybookProposal` may cross the confirmation boundary. Each
row's `message` (H.1 §2.5) is a fixed template per code, filled from
`portfolioContext`/`proposedConfiguration` values (e.g., current weight,
the proposed ceiling) — never freeform, never AI-authored (H.0 §5 item 3
applied to this content too).

### 6.2 What happens when a discrepancy exists

- **`HARD`** → blocks `CONFIRMED` outright. The user must revise the
  conflicting `userIntent` field (e.g., change `currentIntention` away
  from `BUILD`, or resolve the thesis question) before the Proposal can
  proceed — there is no acknowledgment path around a Hard discrepancy.
- **`SOFT`** → does not block by itself, but `CONFIRMED` requires an
  explicit user acknowledgment of the discrepancy's message (a distinct,
  recorded action — not merely having seen the screen).
- **No discrepancy** → proceeds through §5's ordinary validation.

---

## 7. Legacy/dead-field compatibility placeholders

All five verified dead (H.0 §0.4) — a placeholder is correct here
precisely *because* nothing ever reads these, not as a shortcut around a
harder problem:

| Field | Placeholder | Why this specific value is safe |
|---|---|---|
| `Strategy.horizon` | `""` (empty string) | Never read anywhere in the codebase (H.0 §0.4) — no display depends on its content |
| `Strategy.tacticalSharesMin` | `0` | Never read by the engine — actual tactical inventory comes from `coreSharesMin/Max` + current shares (`calcTacticalInventory`) |
| `Strategy.tacticalSharesMax` | `0` | Same as above |
| `Playbook.version` | `1` | Never read; `1` is simply the honest truth (first materialization) |
| `Playbook.updatedAt` | The confirmation timestamp | Never read for display (the UI shows hardcoded literal strings instead, H.0 §0.3) or for any computation — recording the real timestamp anyway costs nothing and is more honest than a fixed sentinel |
| `Playbook.stance` | `deriveStance(classifyConcentration(...), thesisHealth)` computed once at confirmation | Never read for decisions post-G.6 (Portfolio and Stock Detail both live-recompute it independently) — a freshly computed value is tidier than a arbitrary literal, but genuinely not load-bearing either way |

None of these require a product decision — H.0 already established they
are dead, and "any valid value is correct" is the finding being applied,
not a new one.

---

## 8. Scorecard assembly for newly onboarded stocks

Not stored on `StockPlaybookConfig` (H.1 §3) — assembled at read/render
time from the confirmed config + current evidence, the same seam
`runDecisionEngine`'s existing callers already use:

| `Scorecard` field | Source |
|---|---|
| `positionFit` | `calcPositionFitScore(weightPct, targetMaxPct)` — live, unchanged |
| `concentrationRisk` | `calcConcentrationRiskScore(concentrationState)` — live, unchanged |
| `thesisHealth` | `deriveThesisScoreItem(thesisHealth)` — live, unchanged; fed the value §4 produced |
| `fundamentals` | `researchEvidence.fundamentals.result.overall` when `SCORED`; **compatibility placeholder** (below) when `INSUFFICIENT_DATA`/`MISSING` |
| `momentum` | `researchEvidence.momentum.result.overall` when `SCORED`; **compatibility placeholder** when `INSUFFICIENT_DATA`/`MISSING` |
| `valuation` | **Always** the compatibility placeholder — no live pipeline exists for this dimension at all (H.0 §0.3), for any stock, including Unity |

### 8.1 The compatibility placeholder — explicitly not a real signal

Per this task's instruction, **missing evidence must never acquire
Neutral domain meaning**. Concretely:

- A single named constant,
  e.g. `RULESET.compatibilityPlaceholders.scorecardItem = { score: 5,
  state: "Neutral" }`, added to `ruleset-v0.1.ts` alongside every other
  versioned hypothesis in this project — never a per-stock guess, never
  computed from anything.
- This constant exists **only** because `ScoreItem` (the legacy type)
  has no representation for "unknown" — it is not a claim that the
  fundamentals/momentum/valuation are actually neutral. The real
  status (`SCORED`/`INSUFFICIENT_DATA`/`MISSING`, and — for
  fundamentals — `modelFit`) remains fully available on
  `researchEvidence` and **must** be what any review/detail UI reads to
  explain the number, never inferred from the placeholder value itself.
- A true fix (making `Scorecard` fields capable of representing
  "unknown") is out of scope for Phase H — tracked as future work,
  exactly parallel to how multi-archetype fundamentals is tracked (H.0
  §5 item 1). This document does not open that type change.
- This reframes something already true today: Unity's own
  `Scorecard.valuation` (`{score: 5, state: "Neutral"}`, hand-typed in
  `unity-seed.ts`) has always been this same kind of placeholder, simply
  undocumented as one. Phase H does not change Unity's behavior — it
  gives the existing pattern a name and applies it consistently to new
  stocks.

### 8.2 Fundamentals model fit stays independent

`modelFit` (`CONFIRMED_FIT`/`LIMITED_FIT`/`UNKNOWN_FIT`) is carried on
`researchEvidence.fundamentals`, never on the assembled `Scorecard` (the
legacy `ScoreItem` has no field for it, and it must not be squeezed into
`state` — doing so would silently overload `SignalState`'s existing
`Positive`/`Neutral`/`Weak`/`Elevated`/`Intact` meanings with a second,
unrelated concept). A `Scorecard.fundamentals` of `{score: 8, state:
"Positive"}` with `modelFit: "UNKNOWN_FIT"` sitting alongside it (on
`researchEvidence`, not folded in) is the correct, fully honest shape —
a good score does not become less true because the archetype fit is
unconfirmed; it is only the *interpretation* that needs the caveat,
exactly H.0's original resolution. No archetype classifier is built
here, per this task's explicit instruction — `modelFit` for any newly
onboarded stock other than Unity remains `"UNKNOWN_FIT"` by construction
(H.0 §5 item 1), never inferred.

---

## 9. Deterministic parameterized ActionZone templates

### 9.1 What already doesn't need templating

`zoneConfig[type].label` (`src/components/playbook/actionZoneConfig.ts`)
— e.g. `"ADD"`, `"TRIM — LEVEL 1"` — is **already** a fixed, type-keyed,
fully generic constant, not per-stock content. `ActionZone.state` is
**already** 100% derived at engine-run time (`deriveActionZoneState`,
H.0 §0.1). Neither needs any new mechanism.

### 9.2 What needs a new mechanism

`ActionZone.title`, `.summary`, `.primaryTrigger`, `.suggestedAction`,
`.whyBullets`, `.doNotTriggerIf` are today hand-typed per stock (Unity
only) and go stale (H.0 §0.3's demonstrated bug). Reviewing Unity's
actual content line by line reveals it is **not uniformly
stock-specific** — it splits into three kinds:

1. **Generic, type-level boilerplate** — true for any stock's ADD/HOLD/
   TRIM/THESIS_REVIEW zone regardless of which company it is (e.g.,
   "Additional buying would worsen single-stock concentration").
2. **Live-value facts** — true for any stock, but the actual numbers
   differ (e.g., "Current portfolio weight: 58.6%", "Short-term target:
   below 50%").
3. **Genuine company-specific analysis** — e.g., "Valuation remains
   elevated relative to earnings expectations." This requires real
   research judgment about *this* company. No deterministic formula
   over `Strategy`/`PortfolioSnapshot`/existing evidence types can
   produce it, and per this task's instruction, no AI is introduced to
   fabricate it either.

**Resolution:** a newly onboarded stock's zone content is composed
entirely from kinds (1) and (2) — deterministic, parameterized, and
identical in structure across every stock. Kind (3) content is **simply
absent** for a newly onboarded stock, not replaced by a guess. This is
not a loss of correctness; it is the honest consequence of the system
genuinely not having that analysis. Unity's own zones will look richer
than a newly onboarded stock's for as long as Unity keeps its
hand-authored content — the two are allowed to differ, matching brief
§15/H.0's "do not redesign unrelated Phase F interfaces."

### 9.3 The parameter contract

Every field in kind (2) is fed exclusively from values `runDecisionEngine`
already computes as `EngineOutput` (`concentration.targetShares`,
`.sharesToTarget`, `.tacticalInventory`, `.trimSizing`,
`targetPosition.preferredTargetShares`, `constraints.fired`) plus
`instrument.name`/`ticker` and the confirmed `Strategy`'s own fields
(`accumulationCeilingPct`/`targetAllocationRange`/etc.) — **nothing this
mapping needs is not already produced somewhere in the existing
pipeline.** No new domain computation is required, only a template
layer that selects and formats already-computed values per
`(zoneType, zoneState)`.

**Deliberately not decided here:** the literal English wording of each
template. This is copy/UX content ("Design only. No UI." — this task's
own scope boundary), not a numeric/threshold/formula choice, and belongs
to H.3. What this document fixes is that the wording, whenever it is
written, is a **fixed template string per `(zoneType, zoneState)` pair**
filled by substitution — never authored per stock, never AI-generated,
and structurally incapable of going stale the way Unity's frozen prose
does today, because it is regenerated from live values on every render.

---

## 10. Guardrail and instruction compliance checklist

| Requirement | How this design satisfies it |
|---|---|
| Missing evidence never acquires Neutral domain meaning | §8.1 — the placeholder is a named, documented constant existing only because of the legacy type; the real status always sits alongside it, never inferred from the placeholder |
| Fundamentals model-fit independent of score and coverage | §8.2 — `modelFit` lives on `researchEvidence`, never folded into `Scorecard.fundamentals.state`; no classifier built |
| Legacy production types do not dictate the product model | §2/§3/§4 name product-level inputs (`InvestmentRole`, `CorePortion`, `ThesisTrajectory`) first, mapping to production fields second, not the reverse; §7's placeholders exist because the legacy shape demands *something*, not because the model was designed around them |
| No AI decision logic | Every mapping in §2–§9 is a pure function of existing types/values; §9.2 explicitly omits content that would require AI rather than fabricating it |
| Do not implement yet | This document contains no code, only interfaces/tables illustrating the mapping shape |
| Stop on genuine product/model decisions | §11 — all four originally-flagged items resolved by explicit user decision, folded into §2/§3/§6 above |

---

## 11. MODEL DECISIONS — ALL RESOLVED

All four items originally flagged here were resolved by explicit user
decision and are now embedded above:

1. **Ceiling-derivation policy and per-role numeric defaults (§2)** —
   `accumulationCeilingPct = targetAllocationRange.maxPct +
   RULESET.strategyDefaults.accumulationCeilingBufferPct` (buffer =
   5pp); `targetAllocationRange` per role: `LONG_TERM_CORE` 20–30%,
   `GROWTH` 10–18%, `TACTICAL` 3–8%. Deliberately not derived from
   Unity's own configuration.
2. **Core-band formula and width (§3)** — symmetric percentage band,
   `coreBandHalfWidthPct = 0.08`, applied around `coreCenterShares`
   computed once at confirmation from current shares. Deliberately not
   derived from Unity's own (undocumented) 600–650 range.
3. *(Merged into item 1 — was never a separate decision.)*
4. **Contradiction severity and resolution policy (§6)** — `HARD`
   reserved for actual production hard-constraint/eligibility
   conflicts (HC-001, HC-002) and blocks confirmation; `SOFT` covers
   lower-stakes tensions and requires explicit acknowledgment;
   concentration-classification-only tension is `SOFT`, not `HARD`,
   since it isn't backed by a real eligibility rule.
