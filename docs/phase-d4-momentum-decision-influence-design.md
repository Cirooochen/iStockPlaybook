# Phase D.4 — Momentum → Decision Influence Design

Status: **RESOLVED (design only)** — no application code changed. The
§8 model decision (stance: S1, action zones: Z2) is now approved; see
§8 for the decision record and §9 for the proposed D.5 implementation
scope.

## 0. What was read

- `docs/PHASE-D-INTEGRATION-GUIDE.md` — full read (not excerpted here
  again in D.0/D.2/D.3's style, since this design turns on the guide's
  text directly): §1 "Evidence is not the decision"; §2's own worked
  example ("Strong momentum + severe overweight does not automatically
  mean BUY or HOLD... may still conclude HOLD_GRADUALLY_TRIM"); §6
  preserve contradictory signals; §8 "Do not automatically make every
  new Scorecard dimension a direct stance dependency... A new direct
  stance dependency requires an explicit model decision"; §9 hard
  constraints remain authoritative, with the explicit example "positive
  momentum must not bypass concentration protection"; §11's integration
  strategy, whose own step 5 is "only then consider decision/stance
  influence" — i.e. this is deliberately the *last* step, not a
  default; §12's stop taxonomy; §15's out-of-scope list (HC-004/005,
  new formulas — neither is proposed here).
- `docs/phase-d0-momentum-scorecard-integration-design.md` §2.5 —
  confirmed (again) that `deriveStance`/`deriveActionZoneState`/
  HC-001/002 read nothing from `scorecard.momentum` today; §6 — the
  legacy `Scorecard.momentum` limitation, unaffected by this design.
- `docs/phase-d2-live-momentum-engine-orchestration-design.md` §3 — "No
  stance/action-zone influence" was an explicit non-goal of D.2, carried
  forward unchanged until this checkpoint.
- `docs/phase-d3-momentum-provenance-design.md` — `MomentumProvenance`
  (`LIVE_SCORED`/`LIVE_INSUFFICIENT_DATA`/`FALLBACK`), derived, not
  stored. Relevant here because any decision-influence design must
  decide what a non-`LIVE_SCORED` provenance does to that influence
  (see §3 below) — it must not silently degrade to a bearish or
  fabricated signal.
- `src/domain/playbook/stance-rules.ts` — `deriveStance(concentrationState,
  thesisHealth)`: priority 1 thesis BROKEN → `THESIS_REVIEW`; priority 2
  thesis WEAKENING + overweight → `REDUCE_RISK`; priority 3 concentration
  ladder (`SEVERELY_OVERWEIGHT`→`HOLD_GRADUALLY_TRIM`,
  `OVERWEIGHT`→`HOLD_TRIM`, `MODERATELY_OVERWEIGHT`→`HOLD`); otherwise
  `WITHIN_TARGET`→`HOLD` with the standing comment *"Phase C will refine
  with valuation/fundamentals signals"* — an anticipated, not-yet-built
  extension point, momentum included, never resolved by any earlier
  checkpoint.
- `src/domain/playbook/action-zones.ts` — `deriveActionZoneState(type,
  concentrationState, addEligibility)`. Only `ADD` reads
  `AddEligibility` (`accumulationEnabled` from HC-001/002,
  `thesisEligible`), ANDed together (`eligible = accumulationEnabled &&
  thesisEligible`), then gated further by `concentrationState`. The
  file's own comment: *"Phase C will add fundamentalsEligible /
  valuationEligible gates here... the ADD case ANDs every gate
  together, so new conditions plug in without restructuring this
  function"* — an existing, anticipated, AND-only extension point.
  `HOLD`/`THESIS_REVIEW` are thesis-driven, not weight- or
  evidence-driven. `TRIM_1`/`TRIM_2` are driven by `concentrationState`
  alone — no eligibility gate of any kind exists for either today.
- `src/domain/playbook/hard-constraints.ts` — HC-001 (weight limit
  disables accumulation), HC-002 (BROKEN thesis disables accumulation +
  forces `THESIS_REVIEW`), HC-003 (core-minimum sell protection, keyed
  on thesis health only). None read momentum or any Scorecard dimension
  today; none are proposed to.
- `src/domain/portfolio/concentration.ts` — `classifyConcentration`,
  pure ratio thresholds off `weightPct`/`targetMaxPct`. Not proposed to
  change.
- `src/types/playbook.ts` — `Scorecard { fundamentals, valuation,
  momentum, thesisHealth, positionFit, concentrationRisk }`, `ScoreItem
  { score: number; state: SignalState }`, `SignalState = "Positive" |
  "Neutral" | "Weak" | "Elevated" | "Intact"`, `Stance` (8 values),
  `ActionZoneType`/`ActionZoneState`. Confirmed unchanged by every prior
  D-phase checkpoint and not proposed to change here.
- `src/domain/signals/momentum-score.ts` — `MomentumScoreResult`
  (`SCORED{overall,components,coverage}` | `INSUFFICIENT_DATA{...}`),
  `deriveMomentumEvidenceScoredItem`, `deriveMomentumProvenance` (D.3).

## 1. What's already settled, not reopened here

- Momentum is already visible as evidence: `scorecard.momentum` (when
  `SCORED`) and the full `EngineOutput.momentumResult` (component
  breakdown, coverage, provenance via D.3) are already in place. This
  checkpoint is strictly about whether the *rule layer*
  (`deriveStance`/`deriveActionZoneState`/trim sizing) additionally
  *reads* any of that — nothing about how momentum is scored, normalized,
  or surfaced as evidence changes.
- Concentration/target-position remain the sole authority over sizing
  math (`calcTargetShares`, `calcTacticalInventory`, `calcTrimSizing`,
  `deriveTargetPosition`) — no alternative proposed anywhere below
  touches these functions or their inputs.
- Hard constraints (HC-001/002/003) remain fully independent of
  momentum in every alternative below — none of them reads
  `momentumResult`, and none is proposed to.
- Thesis semantics (`deriveThesisHealth`, `isThesisEligibleForAdd`,
  HC-002/003's use of `thesisHealth`) are untouched in every
  alternative — momentum never substitutes for or overrides a thesis
  judgment.
- Missing/insufficient-data handling: every alternative below is
  required to fail open — `MISSING`/`INSUFFICIENT_DATA`/`FALLBACK`
  momentum must produce **exactly today's behavior** (as if momentum
  were never wired in at all), never a bearish default. This is not
  optional in any option presented; it's a constraint on the design
  space, consistent with `MISSING != 0` and D.0 §6's precedent.
- Contradictory signals: per guide §6/§2's own worked example, no
  alternative below lets strong momentum override a severe-overweight
  trim stance, and no alternative lets weak momentum force a stance
  more defensive than the existing thesis/concentration ladder already
  produces on its own.

## 2. The three questions, and why each is a genuine fork

### 2.1 Stance

**Current:** `deriveStance` takes only `concentrationState` and
`thesisHealth`. `WITHIN_TARGET` + non-broken/non-weakening thesis always
resolves to `HOLD` — there is no `BUILD` or `ADD` stance produced by any
code path today, despite both existing in the `Stance` union. The
in-code comment anticipates this gap but assigns it to "Phase C," not
specifically to momentum.

Per guide §8, *any* new direct read of `scorecard.momentum` or
`momentumResult` inside `deriveStance` is, by the guide's own
definition, a new direct stance dependency — **requires an explicit
model decision, full stop, regardless of how small the change looks.**
Three shapes this could legitimately take, presented without a chosen
default:

- **(S1) No stance influence at all.** `deriveStance`'s signature and
  logic are untouched. Momentum stays fully evidence-only; a caller
  wanting to reflect momentum in "why this stance" does so in a UI
  layer or a future explanatory pass, never inside `deriveStance`
  itself. Smallest possible answer to "whether" — the answer is "not
  yet."
- **(S2) A narrow, `WITHIN_TARGET`-only upgrade path.** Only the
  currently-unconditional `WITHIN_TARGET → HOLD` branch gains a new
  condition: e.g. `WITHIN_TARGET` + thesis not `WEAKENING`/`BROKEN` +
  momentum `SCORED` with `overall.state === "Positive"` → `BUILD` (not
  `ADD` — `ADD` already has its own eligibility-gated action zone, §2.2).
  Every other branch (all four overweight tiers, both thesis-override
  priorities) is untouched — momentum can only ever *add* a new
  favorable outcome to the one branch that has none today, never
  soften an overweight or thesis-driven outcome. This is the narrowest
  possible new dependency, but it is still, unambiguously, a new direct
  stance dependency per §8's definition.
- **(S3) A defensive-only stance tightener.** Momentum is read only to
  make `REDUCE_RISK`-class outcomes *more* likely, never less — e.g.
  `MODERATELY_OVERWEIGHT` + thesis `INTACT`/`MIXED` + momentum `SCORED`
  clearly `Weak` could escalate `HOLD` toward `HOLD_TRIM`. Directionally
  safer (evidence only ever tightens, never loosens, a
  protection-adjacent outcome — consistent with §9's spirit even though
  §9 is written about hard constraints, not stance), but it is a second,
  *independent* new dependency from S2, with its own threshold questions
  and its own risk of surprising a user who sees a stance downgrade from
  a signal they may not be looking at.

**All three require an explicit decision if any is to proceed.** None
is recommended over the others here — S1 needs no further approval to
*remain* the status quo, but confirming that is itself part of what
this checkpoint is asking to settle.

### 2.2 Action-zone state

**Current:** only `ADD`'s eligibility is gated at all, via an
already-anticipated AND-only extension point (`AddEligibility`,
`action-zones.ts`'s own comment reserving exactly this kind of
addition). `TRIM_1`/`TRIM_2`/`HOLD`/`THESIS_REVIEW` have no eligibility
concept today.

- **(Z1) No action-zone influence.** `AddEligibility`/
  `deriveActionZoneState` untouched.
- **(Z2) A new `momentumEligible` gate on `ADD` only**, fitting the
  existing AND pattern exactly:
  ```ts
  // illustrative, not implemented
  export interface AddEligibility {
    accumulationEnabled: boolean;
    thesisEligible: boolean;
    momentumEligible: boolean; // NEW
  }
  const eligible =
    addEligibility.accumulationEnabled &&
    addEligibility.thesisEligible &&
    addEligibility.momentumEligible;
  ```
  `momentumEligible` would default to `true` (fail-open) whenever
  `momentumResult` is absent, `INSUFFICIENT_DATA`, or (per D.3)
  provenance is `FALLBACK`/`LIVE_INSUFFICIENT_DATA` — only a confirmed
  `SCORED` result with a `Weak` `overall.state` would set it `false`.
  Because it is AND-ed in alongside `accumulationEnabled`/
  `thesisEligible`, it can only ever make `ADD` *less* available, never
  bypass HC-001/002 or the thesis gate (§9 preserved structurally, not
  just by convention). This is architecturally the smallest and safest
  of every option in this document — it reuses a pattern the codebase
  already reserved for exactly this purpose.
- **(Z3) A `TRIM_1`/`TRIM_2` momentum accelerant.** E.g. `OVERWEIGHT`
  (currently `TRIM_1: WATCH`) escalates to `TRIM_1: ACTIVE` early when
  momentum is confirmed `Weak`. Directionally same "only tighten, never
  loosen" shape as S3 above, but it is a *new kind* of rule
  (`deriveActionZoneState`'s trim branches have never taken an
  eligibility argument at all) — a real structural addition, not a
  drop-in to an existing AND-gate.

**Z1/Z2 do not require inventing a new mechanism** — Z2 in particular
fits a slot the code already reserved. Even so, per §11's own ordering
("only then consider decision/stance influence" as the last of five
steps) and because Z2 is the very first time *any* evidence module
would use that reserved slot, this document treats **the choice of
Z1 vs. Z2 vs. Z3 as needing the same explicit sign-off as §2.1**, not
because the architecture can't support it, but because it is a real,
user-visible change to when the app recommends accumulation — exactly
the kind of decision `docs/VALIDATION_PROTOCOL.md`'s established
pattern (stop, present options, let the decision be explicit and
recorded) has applied to every comparable fork so far in this project
(RSI convention, `INSUFFICIENT_DATA` representation).

### 2.3 Trim/add timing (sizing, not eligibility)

**Current:** `calcTrimSizing`/`calcTacticalInventory`/
`deriveTargetPosition` are pure functions of shares/weight/price —
none reads thesis, evidence, or eligibility of any kind.

**Recommendation (not a fork — resolved directly in this design):**
momentum should influence **none** of trim sizing, `TRIM_1`/`TRIM_2`
zone gating (beyond the already-flagged Z3 *eligibility-escalation*
idea in §2.2, which is about *when* a trim zone shows as active, not
*how much* to trim), or core-protection math (HC-003). This is
recommended as settled, not left open, for two reasons: (a) trim
sizing and core protection are explicitly the guide's own worked
example of what evidence must never influence — §9's *"positive
momentum must not bypass concentration protection"* generalizes
symmetrically: momentum (of either sign) has no legitimate role in
*how many shares* a protective trim removes, only concentration/core
math does; (b) unlike Z2's ADD-only AND-gate, there is no existing
"only tighten, never loosen" mechanism for sizing math — building one
would be new machinery serving a use case the guide itself frames as
out of bounds. **No alternatives are presented here; this is treated
as resolved, not a stop.**

## 3. Provenance interaction (ties back to D.3)

Whichever of S1–S3/Z1–Z3 is eventually approved, the same rule applies
uniformly: only `MomentumProvenance === "LIVE_SCORED"` (equivalently,
`momentumResult?.status === "SCORED"`) may ever produce a
*more*-favorable-than-baseline outcome (S2/the positive half of any
future stance branch). `LIVE_INSUFFICIENT_DATA` and `FALLBACK` must
behave identically to "momentum absent" everywhere — never silently
downgraded to `Weak`, never silently upgraded to `Positive`. A
defensive-tightening option (S3/Z3) may reasonably still act on a
confirmed `SCORED`+`Weak` result, since that is real evidence, not an
absence — but must not additionally treat `INSUFFICIENT_DATA`/
`FALLBACK` as if they were bearish evidence themselves; that would
violate `MISSING != 0` by conflating "we don't know" with "it's bad."

## 4. Explicit non-goals of this design

- No formula, weight, or anchor change to `scoreMomentum` — untouched.
- No `Scorecard`/`ScoreItem`/`SignalState` shape change.
- No HC-004/HC-005 (explicitly out of scope per guide §15).
- No trim-sizing/core-protection math change (§2.3, resolved: none).
- No UI change.
- No code written — every snippet above is illustrative, and none of
  S1–S3/Z1–Z3 is selected here.

## 5. Architecture conflict check

None found for any of S1–S3/Z1–Z3. Every option composes with existing
function signatures either by adding an optional/new parameter
(`deriveStance` would gain a new parameter for S2/S3;
`deriveActionZoneState`'s `AddEligibility` already has a reserved slot
for Z2; Z3 would need a new parameter analogous to `AddEligibility` but
for trim branches) or by choosing not to change anything (S1/Z1). None
requires touching `EngineInput`/`EngineOutput`'s existing shape beyond
what D.0–D.3 already added, none requires new stored state, and none
conflicts with the provider/domain/Server-Client boundaries established
in D.2. This is a **MODEL DECISION**, not an **ARCHITECTURE CONFLICT**.

## 6. What is being asked of the reviewer

Two independent choices (§2.3 is already resolved to "no influence,"
not part of this decision):

1. **Stance:** S1 (no change) / S2 (narrow `WITHIN_TARGET` upgrade) /
   S3 (defensive-only tightener) — or approve more than one together.
2. **Action zones:** Z1 (no change) / Z2 (ADD-only `momentumEligible`
   AND-gate) / Z3 (TRIM watch→active accelerant) — or approve more than
   one together.

If nothing is approved, D.4 concludes with momentum's decision
influence remaining exactly what D.0–D.3 already built: full-fidelity
evidence on `EngineOutput.momentumResult`/`scorecard.momentum`, zero
reach into `deriveStance`/`deriveActionZoneState`. That is itself a
valid, explicit answer to "whether" — not a default this document
assumes.

## 8. RESOLVED — decision record (approved 2026-09-10)

**Stance:** **S1** — no direct momentum influence on `deriveStance` in
v0.1. `deriveStance`'s signature and logic are unchanged by Phase D
entirely; S2 and S3 are declined, not deferred — reopening stance
influence later is a new, separate design question, not an
implicit continuation of this one.

**Action zones:** **Z2**, with the shape narrowed by explicit
instruction beyond §2.2's original sketch:

- `momentumEligible` is a **defensive-only timing gate** on `ADD` — it
  may only ever *remove* eligibility, never *grant* it. Positive
  momentum is not required for, and must never be treated as, a reason
  `ADD` becomes active — `accumulationEnabled`/`thesisEligible` (and
  `concentrationState`, evaluated after eligibility in
  `deriveActionZoneState`) remain the only things that can make `ADD`
  active. Momentum can only ever subtract from that outcome. This
  keeps momentum in the guide's own boundary — evidence, not a BUY
  trigger.
- Only a **clearly unfavorable** `LIVE_SCORED` result sets
  `momentumEligible = false`. Neutral or acceptable live momentum must
  not block `ADD`.
- `INSUFFICIENT_DATA` and `FALLBACK` (per D.3's `MomentumProvenance`)
  add no restriction — `momentumEligible = true`, identical to momentum
  being entirely absent. This is the same fail-open rule §3 already
  established; restated here as the approved behavior, not a new one.
- **Z3 (trim acceleration) is explicitly declined**, not deferred —
  `TRIM_1`/`TRIM_2` gain no eligibility concept of any kind in this or
  any following D-phase checkpoint unless a future checkpoint reopens
  it with its own design.
- Trim sizing, add sizing, core protection, concentration, and
  target-position capacity gain **zero** momentum influence — this was
  already resolved as non-negotiable in §2.3/§9 of the earlier design
  and is restated here as explicitly confirmed, not just carried
  forward by omission.

### 8.1 Ambiguity check — "clearly unfavorable," resolved without a threshold invention

The instruction was to stop rather than invent a threshold if the
existing momentum state taxonomy makes "clearly unfavorable" ambiguous.
It does not: `scoreMomentum`'s `toScoreItem` (`src/domain/signals/
momentum-score.ts`) already maps every `SCORED` result's blended
0–100 score onto exactly one of three `SignalState` values —
`"Positive"` (score ≥ 7/10), `"Neutral"` (score 4–6/10), or `"Weak"`
(score 1–3/10) — using the **same threshold convention already shared
by every other Scorecard dimension** (`src/domain/playbook/scoring.ts`'s
`calcPositionFitScore`), not a momentum-specific invention. Momentum's
`overall.state` can only ever be one of these three values; `"Elevated"`
and `"Intact"` (the other two `SignalState` members) are never produced
by momentum and are irrelevant here.

**"Clearly unfavorable" = `overall.state === "Weak"`.** This is not a
new threshold being invented for D.5 — it is the pre-existing "bottom
bucket" label this codebase already uses everywhere a ScoreItem needs
to say "this dimension looks bad," reused as-is. `"Neutral"` and
`"Positive"` both count as "neutral/acceptable" per the instruction and
leave `momentumEligible = true`. No stop required.

## 9. Proposed D.5 implementation scope (not implemented here)

Smallest mechanical scope to build what §8 approved:

1. **`src/domain/signals/momentum-score.ts`** — add
   `deriveMomentumEligibility(momentumResult: MomentumScoreResult |
   undefined): boolean`, colocated with `deriveMomentumProvenance`
   (same file, same "only place this may be produced" precedent):
   ```ts
   // illustrative, not implemented
   export function deriveMomentumEligibility(
     momentumResult: MomentumScoreResult | undefined
   ): boolean {
     if (momentumResult?.status !== "SCORED") return true; // absent, INSUFFICIENT_DATA, or FALLBACK — fail-open
     return momentumResult.overall.state !== "Weak";
   }
   ```
   Reads only `.status`/`.overall.state` — never `.overall.score`
   directly — consistent with D.3's "structural discriminator, not a
   raw-value inference" convention, while still ultimately resting on
   the same named `SignalState` bucket every other dimension uses.
2. **`src/domain/playbook/action-zones.ts`** — add `momentumEligible:
   boolean` to `AddEligibility`; change the `ADD` case's eligibility
   check to `accumulationEnabled && thesisEligible &&
   momentumEligible`. No other case (`HOLD`/`TRIM_1`/`TRIM_2`/
   `THESIS_REVIEW`) changes.
3. **`src/domain/engine.ts`** — inside `runDecisionEngine`, compute
   `momentumEligible = deriveMomentumEligibility(input.momentumResult)`
   and add it to the existing `addEligibility` object literal alongside
   `accumulationEnabled`/`thesisEligible`. No change to
   `EngineInput`/`EngineOutput`'s shape (both already carry
   `momentumResult?`, unchanged since D.1).
4. **Tests:**
   - `deriveMomentumEligibility`: absent → `true`; `INSUFFICIENT_DATA`
     → `true`; `SCORED` + `Weak` → `false`; `SCORED` + `Neutral` →
     `true`; `SCORED` + `Positive` → `true`.
   - `deriveActionZoneState`/`AddEligibility`: existing tests updated
     with `momentumEligible: true` (regression-neutral default);
     new test confirming `momentumEligible: false` alone makes `ADD`
     `INACTIVE` even when `accumulationEnabled`/`thesisEligible`/
     concentration would otherwise allow it (proves it can only
     subtract, matching §8's "not a BUY trigger" requirement); new test
     confirming `momentumEligible: true` never *by itself* makes `ADD`
     active when the other two gates don't (proves it grants nothing).
   - `runDecisionEngine` (engine.test.ts): momentum absent →
     `ADD` zone behavior unchanged from every existing B.5/C-phase/D.1
     test (regression check); `SCORED`+`Weak` momentumResult → `ADD`
     zone `INACTIVE` even in an otherwise-eligible scenario;
     `INSUFFICIENT_DATA` momentumResult → `ADD` zone behavior identical
     to absent.
5. **Explicitly NOT in D.5:** no stance change (S1 stands), no Z3, no
   trim/add sizing, core protection, concentration, or target-position
   change, no UI change.

No part of this scope requires further design review — §8/§9 already
cover every decision it depends on.
