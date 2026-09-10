# Phase E.3 — Fundamentals → Scorecard Integration Design

Status: DESIGN ONLY — no application code changed. **CLEAN INTEGRATION**
per `docs/PHASE-D-INTEGRATION-GUIDE.md` §12's taxonomy — no `MODEL
DECISION REQUIRED`, no `ARCHITECTURE CONFLICT`. The D.0/D.1 Momentum →
Scorecard pattern fits Fundamentals with no structural change: same
shapes, same seam, same transitional handling, symbol names swapped.

## 0. What was inspected (current code, post-E.2/D.1–D.5)

- **`src/domain/engine.ts`** (current) — `EngineInput.momentumResult?:
  MomentumScoreResult` (optional, additive, D.1); `EngineOutput.
  momentumResult?` echoes it verbatim (D.1); inside `runDecisionEngine`,
  the exact transitional-handling block (lines ~184–198):
  ```ts
  const momentumEvidence = input.momentumResult
    ? deriveMomentumEvidenceScoredItem(input.momentumResult)
    : undefined;
  const momentumScoreItem =
    momentumEvidence?.status === "SCORED" ? momentumEvidence.item : signals.momentum;
  ```
  then spread into `finalScorecard: { ...recalculatedScorecard,
  fundamentals: signals.fundamentals, valuation: signals.valuation,
  momentum: momentumScoreItem, ... }`. Confirmed (again): nothing else
  in `runDecisionEngine` — concentration, hard constraints, stance,
  action zones (including D.5's `momentumEligible` gate), target
  position, trim sizing — reads `momentumResult`/`scorecard.momentum`.
  The `fundamentals`/`valuation` lines sit right next to the `momentum`
  line, still both pure `signals.*` pass-throughs, untouched since the
  file was created.
- **`src/types/evidence-scoring.ts`** — `EvidenceScoredItem = {status:
  "SCORED", item: ScoreItem} | {status: "INSUFFICIENT_DATA"}`. Its own
  doc comment, unchanged since D.0: *"General, not momentum-specific:
  any evidence-derived dimension (momentum today; **fundamentals**/
  valuation potentially later) that may or may not have enough evidence
  to produce a real score can use this shape."* This was written to
  anticipate exactly this checkpoint.
- **`src/domain/signals/momentum-score.ts`** —
  `deriveMomentumEvidenceScoredItem(result: MomentumScoreResult):
  EvidenceScoredItem`: `SCORED` → `{status:"SCORED", item:
  result.overall}`; anything else → `{status:"INSUFFICIENT_DATA"}`. The
  "only place this may be produced" convention this design reuses by
  name.
- **`src/types/fundamentals.ts`** (Phase E.2) —
  `FundamentalsScoreResult = {status:"SCORED", overall: ScoreItem,
  components, coverage} | {status:"INSUFFICIENT_DATA", components,
  coverage}`. **Structurally identical** to `MomentumScoreResult` —
  same discriminant, same `overall: ScoreItem` field name and type on
  the `SCORED` branch, same `components`/`coverage` shape pattern. Not
  a coincidence: E.0 §2 deliberately built `FundamentalsScoreResult` by
  copying `MomentumScoreResult`'s shape.
- **`src/domain/signals/fundamentals-score.ts`** (Phase E.2) —
  `scoreFundamentals(template, raw): FundamentalsScoreResult`, the
  archetype-agnostic engine. No `deriveFundamentalsEvidenceScoredItem`
  exists yet (confirmed by grep) — this checkpoint's natural first
  piece of new code, once approved.
- **`src/domain/signals/signals.ts`** — `deriveFundamentalsScore
  (scorecard) => scorecard.fundamentals`, a pure pass-through,
  unchanged since the file's creation — the exact pre-D.1 state
  `deriveTechnicalScore`/`scorecard.momentum` was in before D.1. Same
  file, same `Signals` interface, same `deriveSignals` composition —
  nothing here needs to change shape, only what feeds
  `finalScorecard.fundamentals` in `engine.ts`.
- **`src/types/playbook.ts`** — `Scorecard{fundamentals, valuation,
  momentum, thesisHealth, positionFit, concentrationRisk}`, `ScoreItem
  {score, state}`. Confirmed unchanged through every D-phase and E.2
  checkpoint; not proposed to change here either.
- **D.1's implementation pattern** (the direct precedent) — the exact
  mechanical shape §1 below reuses: new `EngineInput`/`EngineOutput`
  optional field, one `deriveXEvidenceScoredItem` call, one ternary
  assignment into `finalScorecard`, echo the full result on output
  unchanged.

## 1. Resolution — the D.0/D.1 pattern fits directly, symbol-for-symbol

Six questions, in the order asked:

### 1.1 Should Fundamentals reuse `EvidenceScoredItem` directly?

**Yes — reuse it exactly as written, add nothing.** It was built
general-purpose specifically so a second evidence-derived dimension
would not need its own type (§0). No new "FundamentalsEvidenceScoredItem"
variant, no change to `EvidenceScoredItem` itself. The only new code
this implies is one new mapping function, following the same "only
place this may be produced" naming convention:

```ts
// illustrative, not implemented — src/domain/signals/fundamentals-score.ts
export function deriveFundamentalsEvidenceScoredItem(
  result: FundamentalsScoreResult
): EvidenceScoredItem {
  if (result.status === "SCORED") {
    return { status: "SCORED", item: result.overall };
  }
  return { status: "INSUFFICIENT_DATA" };
}
```

Byte-for-byte the same body as `deriveMomentumEvidenceScoredItem`, made
possible entirely by §0's observation that `FundamentalsScoreResult`
and `MomentumScoreResult` already share the same `SCORED{overall,...}`/
`INSUFFICIENT_DATA` shape.

### 1.2 How does `FundamentalsScoreResult` enter `EngineInput`/`EngineOutput`?

Same additive, optional, echoed-verbatim pattern as `momentumResult`:

```ts
// illustrative, not implemented — src/domain/engine.ts
export interface EngineInput {
  // ...existing fields, unchanged...
  fundamentalsResult?: FundamentalsScoreResult; // NEW, optional — same role as momentumResult
}

export interface EngineOutput {
  // ...existing fields, unchanged...
  fundamentalsResult?: FundamentalsScoreResult; // NEW, optional — echoes EngineInput.fundamentalsResult verbatim
}
```

Optional on both sides for the identical reason `momentumResult` is:
every existing caller (every B.5/C/D-phase test, `PlaybookClientShell`,
the Unity seed) constructs `EngineInput` today with no notion of live
fundamentals data. Omitting it must be — and, by construction of this
shape, automatically is — byte-for-byte unchanged behavior. The engine
still never computes `FundamentalsScoreResult` itself (no
`RawFundamentalsData`, no `GROWTH_SOFTWARE_TEMPLATE`, no
`scoreFundamentals` call inside `runDecisionEngine`) — whoever runs
that pipeline (a future orchestration step, out of scope here, see §3)
does so before calling the engine and hands in the already-scored
result, exactly like `fetchLiveMomentumResult` does today for momentum.

### 1.3 When should `scorecard.fundamentals` use the live result?

Only when `SCORED` — the identical ternary D.1 already established,
symbol-for-symbol:

```ts
// illustrative, not implemented — inside runDecisionEngine, next to the
// existing momentum block
const fundamentalsEvidence = input.fundamentalsResult
  ? deriveFundamentalsEvidenceScoredItem(input.fundamentalsResult)
  : undefined;
const fundamentalsScoreItem =
  fundamentalsEvidence?.status === "SCORED" ? fundamentalsEvidence.item : signals.fundamentals;
```

`finalScorecard`'s `fundamentals: signals.fundamentals` line (today) becomes
`fundamentals: fundamentalsScoreItem`.

### 1.4 Behavior for SCORED / INSUFFICIENT_DATA / absent

- **SCORED** — `scorecard.fundamentals = fundamentalsResult.overall`,
  the fresh, lossless live value.
- **INSUFFICIENT_DATA** — `scorecard.fundamentals` stays at
  `signals.fundamentals` (today's existing pass-through) — **not
  re-encoded as anything**, not a fabricated score, not a stale value
  dressed up as fresh. Identical treatment to momentum's D.0 §6
  resolution.
- **Absent** (`fundamentalsResult` never supplied) — **identical to
  INSUFFICIENT_DATA**: `signals.fundamentals`, unchanged. Both cases
  collapse to the same legacy-field behavior deliberately — this is not
  "encoding insufficient evidence as a stale score" (ruled out
  explicitly, same as D.0 §5's decision for momentum); it is the field
  simply not being updated because there is nothing honest to put there
  yet.

### 1.5 Which result remains the canonical source of evidence status?

**`EngineOutput.fundamentalsResult`** — the full `FundamentalsScoreResult`
(component breakdown, coverage, `.status`) — exactly as
`EngineOutput.momentumResult` already is for momentum (D.0 §2.2/§6).
`scorecard.fundamentals` is a lossy legacy-shaped summary that **cannot
itself distinguish** "a fresh SCORED value" from "evidence was
insufficient this run, showing an older value" — this is the same
explicit, documented, accepted limitation D.0 §6 already carries for
momentum, now inherited by fundamentals for the identical structural
reason (the legacy `Scorecard.fundamentals: ScoreItem` field has no
`INSUFFICIENT_DATA` branch to be honest in). **Any caller that needs to
know whether `scorecard.fundamentals` is trustworthy right now must
check `EngineOutput.fundamentalsResult`/
`deriveFundamentalsEvidenceScoredItem`'s result, never
`scorecard.fundamentals` in isolation** — satisfying the instruction
that a legacy fallback value must never masquerade as authoritative
fresh evidence: it doesn't claim to be, and the one place that could be
confused about it (`scorecard.fundamentals` alone) is documented, not
hidden.

### 1.6 Is provenance needed now?

**No — defer, exactly as it was for momentum.** `MomentumProvenance`/
`deriveMomentumProvenance` (D.3) were built only *after* D.0–D.2 had
already wired `momentumResult` all the way through to a live
orchestration step (`fetchLiveMomentumResult`) — provenance's third
state, `FALLBACK`, only became a meaningful, distinct case once there
was a real fetch that could fail. No such orchestration step exists yet
for fundamentals (§3) — today, "`fundamentalsResult` is absent" has
exactly one cause (this checkpoint's own `EngineInput` simply has no
live data yet), not two, so a 3-way provenance distinction would have
nothing real to distinguish. If/when a fundamentals-equivalent of
`fetchLiveMomentumResult` is built, the identical reasoning D.3 already
worked through applies unchanged: the 3-way distinction (`LIVE_SCORED`/
`LIVE_INSUFFICIENT_DATA`/`FALLBACK`) would already be fully derivable,
for free, from `fundamentalsResult: FundamentalsScoreResult |
undefined` — a `deriveFundamentalsProvenance` function, not a new
stored field, at that later point. Not designed here; explicitly out of
scope.

## 2. Constraints — confirmed preserved, not just asserted

- **Stance/action zones/hard constraints/concentration/target
  position/thesis/sizing** — none of these functions is touched, and
  none reads `fundamentalsResult`/`scorecard.fundamentals` today
  (confirmed by the same inspection D.0 §2.5 already did for momentum,
  re-confirmed here for fundamentals: no existing rule-layer function
  references `scorecard.fundamentals` either). This design adds zero
  new reads of it anywhere in the rule layer — it only changes what the
  *number* is, never what anything *does* with it, identical to D.0's
  own framing.
- **No new evidence-state mechanism** — `EvidenceScoredItem` (D.0),
  reused unchanged, per §1.1.
- **Legacy fallback never masquerades as fresh** — §1.5.
- **`MISSING`/`INSUFFICIENT_DATA` != score 0** — inherited for free:
  `deriveFundamentalsEvidenceScoredItem` never returns a `SCORED`-shaped
  result for anything but a genuine `SCORED` `FundamentalsScoreResult`;
  `scoreFundamentals` itself (E.2) already never fabricates a component
  or aggregate score for missing evidence.
- **Additive over `ScoreItem`-shared-type changes** — zero changes to
  `ScoreItem`/`SignalState`/`Scorecard`'s shape; the only new types are
  the two optional `EngineInput`/`EngineOutput` fields (§1.2), reusing
  an already-existing general type (`EvidenceScoredItem`) for the
  intermediate mapping step.

## 3. Explicit non-goals of this design

- No live fundamentals orchestration (a `fetchLiveFundamentalsResult`-
  equivalent of D.2) — a separate, later checkpoint, exactly as D.2 was
  separate from D.0/D.1 for momentum.
- No AI extraction, no fundamentals data provider — unrelated layers,
  untouched (same non-goal E.0/E.2 already stated, restated here for
  completeness).
- No `FundamentalsProvenance`/`deriveFundamentalsProvenance` — §1.6.
- No `AddEligibility`/decision-influence wiring (a D.4/D.5-equivalent
  for fundamentals) — this checkpoint is Scorecard integration only,
  mirroring D.0's own scope boundary against D.4.
- No UI change.
- No code written — every snippet above is illustrative.

## 4. Architecture conflict check

None found. The proposed shape is purely additive (`?:` on two new
`EngineInput`/`EngineOutput` fields, one new function reusing an
already-general type), reuses D.0/D.1's exact precedent rather than
introducing a new one, and requires no change to `EngineInput`'s
existing required fields, `Scorecard`'s shape, `ScoreItem`,
`SignalState`, `EvidenceScoredItem`, or any rule-layer function's
signature. The engine's market-data-free boundary (D.0 §2.1) is
preserved identically: `runDecisionEngine` never computes
`FundamentalsScoreResult` itself, only receives an already-scored one.

## 5. Recommended next step

Not implemented here, per instruction. An E.4 implementation checkpoint
would be mechanical, mirroring D.1's own scope exactly:

1. `src/domain/signals/fundamentals-score.ts` — add
   `deriveFundamentalsEvidenceScoredItem(result): EvidenceScoredItem`
   (§1.1). No change to `scoreFundamentals` or any anchor/weight.
2. `src/domain/engine.ts` — add `fundamentalsResult?:
   FundamentalsScoreResult` to `EngineInput`/`EngineOutput` (§1.2);
   change `finalScorecard.fundamentals`'s source expression to the
   transitional logic in §1.3/§1.4; echo `input.fundamentalsResult`
   onto the returned `EngineOutput` unchanged.
3. **Tests** — mirroring D.1's exact fixture pattern:
   `deriveFundamentalsEvidenceScoredItem`: `SCORED` →
   `{status:"SCORED", item:overall}`; `INSUFFICIENT_DATA` →
   `{status:"INSUFFICIENT_DATA"}` (no `item` key). Engine-level: (a)
   `fundamentalsResult` absent → `scorecard.fundamentals` and every
   existing engine test unchanged (regression check); (b) `SCORED` →
   `scorecard.fundamentals === fundamentalsResult.overall`; (c)
   `INSUFFICIENT_DATA` → `scorecard.fundamentals` equals today's
   pass-through value, identical to case (a); (d)
   `EngineOutput.fundamentalsResult` echoes
   `EngineInput.fundamentalsResult` exactly in all three cases; (e) the
   manual-pipeline oracle in `engine.test.ts` updated to mirror the same
   logic, same as D.1 did for momentum.
4. **Explicitly NOT in E.4**: no live orchestration wiring, no UI
   change, no decision-influence/`AddEligibility` wiring, no
   provenance, no valuation-dimension generalization of this pattern
   (out of scope, a separate future checkpoint if ever pursued).

No part of this scope requires further design review — §1–§2 already
cover every decision it depends on.
