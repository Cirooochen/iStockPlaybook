# Phase D.0 — Momentum → Scorecard Integration Design

Status: **RESOLVED (design only)** — no application code changed. The
§5 model decision is now approved; see §5 for the decision record and
§7 for the proposed D.1 implementation scope.

Ran informed by `docs/VALIDATION_PROTOCOL.md`'s spirit — read real code
before proposing, classify findings, stop rather than silently choose on
a genuine product/architecture question. §5 documents what was decided
and by whom, rather than silently folding the decision into the design
as if it had always been obvious.

## 0. `docs/PHASE-D-INTEGRATION-GUIDE.md` is empty

Read as instructed — **the file exists but contains zero bytes.** This
design proceeds on the other three named sources
(`docs/VALIDATION_PROTOCOL.md`, the real `Scorecard`/Decision Engine
code, and the real `MomentumScoreResult` shape) plus the full decision
history from Phases C.0–C.8B, since that guide carried no content to
follow. If it was meant to contain integration guidance, worth
populating before D.1; not fabricated here.

## 1. What was inspected

- `src/domain/engine.ts` — `EngineInput`/`EngineOutput`,
  `runDecisionEngine`'s exact sequencing (thesis → signals →
  concentration → hard constraints → stance → action zones → scorecard →
  trim sizing → target position).
- `src/domain/signals/signals.ts` — `deriveSignals`/`deriveTechnicalScore`,
  confirmed still a pure pass-through of `scorecard.momentum`
  (`// Phase C will replace these pass-throughs`).
- `src/domain/signals/momentum-score.ts` — `MomentumScoreResult`
  (`SCORED { overall: ScoreItem; components; coverage }` |
  `INSUFFICIENT_DATA { components; coverage }`), `scoreMomentum`'s
  signature (`signals, price, trend, relativeStrength`), and its own doc
  comment's standing note: *"Its `SCORED.overall` field IS a real, valid
  `ScoreItem`... assigning it to `Scorecard.momentum` is future wiring
  work, not done here."* D.0 is that future wiring work.
- `src/types/playbook.ts` — `ScoreItem { score, state }`,
  `Scorecard { fundamentals, valuation, momentum, thesisHealth,
  positionFit, concentrationRisk }`. Confirmed (again) no state exists
  for "insufficient evidence."
- `src/domain/thesis/thesis.ts` — the established precedent this design
  reuses: `deriveThesisScoreItem(health): ScoreItem`, a single,
  named, "ONLY place a [dimension] ScoreItem may be produced" mapping
  function, plus `EngineOutput.thesis.health` echoing the canonical rich
  value alongside the lossy derived `ScoreItem` on `scorecard`.
- Confirmed via `runDecisionEngine`'s existing logic and the full C-phase
  history: **nothing in the rule layer (`deriveStance`,
  `deriveActionZoneState`, HC-001/002/003) reads `scorecard.momentum`,
  `.fundamentals`, or `.valuation` today.** This integration changes what
  the number *is*, not what anything *does* with it.

## 2. What's clean, not in question

### 2.1 Scope boundary: engine stays market-data-free

`EngineInput` does not gain `RawMarketData`/`DerivedTechnicalSignals`/
`DerivedTrendSignal`/`RelativeStrengthData`/a live price field, and
`runDecisionEngine` never calls `scoreMomentum` itself. This mirrors
exactly how `scorecard.fundamentals`/`.valuation` already work today —
the engine receives an **already-formed `Scorecard`**, it does not
compute one from raw inputs. Whoever eventually runs the live Twelve
Data → C.8A mappers → `deriveTechnicalSignals`/`deriveTrendSignal`/
`computeRelativeStrength` → `scoreMomentum` pipeline (a future,
separate orchestration step — not designed here) does so **before**
calling `runDecisionEngine`, then hands the result in. This keeps the
deterministic engine usable from pure synthetic/seed data alone
(required by B.5.7's stock-generic validation, still true after this
integration) and keeps `docs/phase-c0-market-data-contract.md`'s
boundary decision intact: "everything else stays outside `EngineInput`"
still holds — only the *already-scored* result crosses the boundary,
never raw market data.

### 2.2 Proposed shape (additive, non-breaking)

```ts
// src/domain/engine.ts — illustrative, not implemented
export interface EngineInput {
  // ...existing fields, unchanged...
  momentumResult?: MomentumScoreResult; // NEW, optional
}

export interface EngineOutput {
  // ...existing fields, unchanged...
  momentumResult?: MomentumScoreResult; // NEW, optional — echoes EngineInput.momentumResult verbatim
}
```

`momentumResult` is **optional on both sides**, for the same reason
`preferredTargetWeightPct`/`coreSharesMin`/`benchmarkInstrumentId` are
optional `Strategy` fields: every existing caller (every B.5 validation
test, `PlaybookClientShell`, the Unity seed data) constructs
`EngineInput` today with no notion of live momentum data at all. Making
this field required would break every existing call site — the opposite
of "smallest." When absent, behavior is **byte-for-byte unchanged from
today.**

On the output side, `EngineOutput.momentumResult` **echoes
`EngineInput.momentumResult`** — the same pass-through pattern already
used for `EngineOutput.thesis.health` (which echoes
`deriveThesisHealth(input.thesisHealth)` unchanged). This exposes the
full component breakdown + evidence coverage (score, applicable weight,
available weight, missing evidence — all four, per the C.6 resolution)
to any future consumer (a richer UI, a future HC-004) without forcing
everyone through the lossy `ScoreItem` summary.

### 2.3 `EvidenceScoredItem` — a new, additive, general discriminated result type (approved 2026-09-10)

Per the §5 decision: evidence availability and signal state are separate
concepts, and neither `SignalState` nor `ScoreItem` is touched. Instead,
a small, new, general-purpose type — not momentum-specific in name or
shape, so any future evidence-derived dimension (fundamentals/valuation,
eventually) can reuse it without inventing its own variant:

```ts
// src/types/evidence-scoring.ts — NEW FILE, illustrative, not implemented.
// Deliberately NOT added to types/playbook.ts — zero diff to that
// heavily-depended-upon shared file (ScoreItem/Scorecard/SignalState all
// stay byte-for-byte unchanged).
export type EvidenceScoredItem =
  | { status: "SCORED"; item: ScoreItem }
  | { status: "INSUFFICIENT_DATA" };
```

This is `MomentumScoreResult`'s own `SCORED`/`INSUFFICIENT_DATA` shape,
stripped down to the minimum a legacy `ScoreItem` consumer needs to know
— "is there a real score right now, yes or no" — without exposing
momentum-specific `components`/`coverage` to something that shouldn't
need them. It is a genuinely separate concept from `ScoreItem`
(signal state) exactly as instructed: `EvidenceScoredItem` answers
"do we have a score," `ScoreItem` (inside the `SCORED` branch) answers
"what does it say."

A new, single, named mapping function — mirrors `deriveThesisScoreItem`'s
"only place this may be produced" role, now returning the honest
`EvidenceScoredItem` instead of a bare, sometimes-fabricated `ScoreItem`:

```ts
// src/domain/signals/momentum-score.ts — illustrative, not implemented
export function deriveMomentumEvidenceScoredItem(result: MomentumScoreResult): EvidenceScoredItem {
  if (result.status === "SCORED") {
    return { status: "SCORED", item: result.overall }; // lossless
  }
  return { status: "INSUFFICIENT_DATA" }; // no item — never fabricated, never a stale fallback baked in here
}
```

This function never fabricates a score 0/Neutral/reserved value and
never reaches back into a stale seed value itself — it is a pure,
honest projection of `MomentumScoreResult`. What happens to the
*legacy* `Scorecard.momentum: ScoreItem` field when this returns
`INSUFFICIENT_DATA` is a separate question, addressed in §6 (that field
has no `INSUFFICIENT_DATA` branch to be honest in — this function does).

### 2.4 Where this replaces `signals.ts`'s pass-through — and why that's the right seam to retire, only for momentum

Today, `deriveTechnicalScore(scorecard) => scorecard.momentum` is a pure
pass-through inside `signals.ts`, alongside `deriveFundamentalsScore`/
`deriveValuationScore` (also pass-throughs — **unaffected by this
design**, still Phase C scope, not touched). `deriveSignals`/
`deriveTechnicalScore` themselves are **not deleted or changed** —
`fundamentals`/`valuation` still flow through them exactly as today.
Only `finalScorecard.momentum`'s source expression in
`runDecisionEngine` changes (see §6 for the exact transitional logic) —
a narrow, additive change to one call site, not a signature change to
`deriveSignals` itself.

### 2.5 Confirmed non-conflict with the rule layer

Grepped/confirmed (again, as every prior checkpoint has): `deriveStance`,
`deriveActionZoneState`, `checkHC001`/`checkHC002` never read
`scorecard.momentum` (or `.fundamentals`/`.valuation`). This integration
makes the *number* real; it does not make the number *matter* to any
existing rule. Stance/action-zone/HC wiring remains untouched and
out of scope, consistent with every C-phase checkpoint's boundary —
not restated as an instruction this time, but unambiguous from the
checkpoint's own name ("Momentum → **Scorecard** Integration," not
"→ Stance").

## 3. Explicit non-goals of this design

- No real orchestration of Twelve Data → mappers → derived signals →
  `scoreMomentum` before `runDecisionEngine` is designed here — that
  pipeline exists (Phase C.8A/C.8B) but *calling* it as part of a normal
  app/session flow is a separate, later integration step.
- No UI change — `SignalScorecard`/`PlaybookStatusBanner` etc. are not
  touched or redesigned here.
- No stance/action-zone/HC-004/HC-005/confidence wiring.
- No change to `fundamentals`/`valuation`'s existing pass-through
  behavior.
- No code written — every snippet above is illustrative.

## 4. Architecture conflict check

None found. The proposed shape is purely additive (`?:` on both new
`EngineInput`/`EngineOutput` fields, a new `EvidenceScoredItem` type in
a new file), reuses an established pattern
(`thesis.health`-echo + `deriveThesisScoreItem`-style single mapping
function) while deliberately NOT reusing `ScoreItem` itself for the
insufficient-evidence case, and does not require changing `EngineInput`'s
existing required fields, `Scorecard`'s shape, `ScoreItem`, `SignalState`,
or any rule-layer function's signature. The engine's "market-data-free"
boundary (§2.1) is preserved, not weakened.

## 5. RESOLVED — decision record (approved 2026-09-10)

**Original question:** what should the momentum→`ScoreItem` mapping
return when `MomentumScoreResult.status === "INSUFFICIENT_DATA"`?

**Decision:** none of the three options originally weighed (stale
fallback presented as fresh, expand `SignalState`, a reserved lossy
score/state encoding) is used. Instead:

- Evidence availability and signal state are treated as genuinely
  separate concepts — resolved via the new, additive
  `EvidenceScoredItem` discriminated type (§2.3), not by expanding
  `SignalState` or redesigning `ScoreItem`.
- `deriveMomentumEvidenceScoredItem` never fabricates a `SCORED`-shaped
  result for `INSUFFICIENT_DATA`, and never itself substitutes a stale
  value — it honestly returns `{ status: "INSUFFICIENT_DATA" }`, full
  stop.
- `EngineOutput.momentumResult` (the full `MomentumScoreResult`, §2.2)
  remains the canonical source for momentum evidence/coverage — nothing
  about "why" or "how much evidence" is lost; it just doesn't fit inside
  the legacy `ScoreItem`-shaped field.
- For `SCORED`, `scorecard.momentum` may use `result.overall` directly —
  unchanged from §2.3's original design, still lossless.
- What the *legacy* `Scorecard.momentum: ScoreItem` field does when
  there is no `SCORED` result is a **separate, explicitly documented
  transitional-handling question** — see §6, not silently bundled into
  this decision.

## 6. Legacy `Scorecard.momentum` — transitional handling and its documented limitation

`Scorecard.momentum: ScoreItem` (`src/types/playbook.ts`) is not changed
by this design and, unlike `EvidenceScoredItem`, **has no way to
represent "insufficient evidence" at all** — it is always exactly one
`{ score, state }` pair. Per instruction, the smallest backward-compatible
transitional handling is:

```ts
// runDecisionEngine — illustrative, not implemented
const momentumEvidence = input.momentumResult
  ? deriveMomentumEvidenceScoredItem(input.momentumResult)
  : undefined;
const momentumScoreItem =
  momentumEvidence?.status === "SCORED" ? momentumEvidence.item : signals.momentum;
```

`signals.momentum` (today's existing pass-through of the seed
`Scorecard.momentum`) is used whenever there is **no `SCORED` result to
assign** — whether because `momentumResult` was never supplied at all,
or because it was supplied and came back `INSUFFICIENT_DATA`. Both
cases are treated identically for this one legacy field, and
deliberately so: this is *not* "encoding `INSUFFICIENT_DATA` as a
stale score" (§5's decision explicitly rules that out) — it is the
field **simply not being updated**, because there is nothing honest to
put there yet. No new claim is made by this field in the
`INSUFFICIENT_DATA` case; it silently retains whatever it already held.

**This is a real, explicit, documented limitation, not hidden:**
`Scorecard.momentum` alone cannot currently distinguish "a fresh,
confident score" from "evidence was insufficient this run, showing an
older value." **The canonical, authoritative distinction always lives on
`EngineOutput.momentumResult.status` (§2.2) — any caller that needs to
know whether `scorecard.momentum` is trustworthy right now must check
`momentumResult`/`deriveMomentumEvidenceScoredItem`'s result, not
`Scorecard.momentum` in isolation.** Resolving this fully — so the
legacy field itself can express the distinction — would require a
broader `Scorecard`/`ScoreItem` migration (§5's option 2, still declined
as out of scope here) and is not attempted in D.0/D.1.

## 7. Proposed D.1 implementation scope (not implemented here)

Smallest mechanical scope to build what §2–§6 designed:

1. **New file** `src/types/evidence-scoring.ts` — `EvidenceScoredItem`
   (§2.3). Zero diff to `types/playbook.ts`.
2. **`src/domain/signals/momentum-score.ts`** — add
   `deriveMomentumEvidenceScoredItem(result): EvidenceScoredItem` (§2.3).
   No change to `scoreMomentum`, anchors, or weights.
3. **`src/domain/engine.ts`** — add `momentumResult?: MomentumScoreResult`
   to `EngineInput` and `EngineOutput` (§2.2); change
   `finalScorecard.momentum`'s source expression in `runDecisionEngine`
   to the transitional logic in §6; echo `input.momentumResult` onto the
   returned `EngineOutput` unchanged (`undefined` stays `undefined`).
4. **Tests** — `deriveMomentumEvidenceScoredItem`: `SCORED` →
   `{status:"SCORED", item: overall}`; `INSUFFICIENT_DATA` →
   `{status:"INSUFFICIENT_DATA"}` (no `item` key at all). Engine-level:
   (a) `momentumResult` absent → `scorecard.momentum` and all existing
   B.5/C-phase engine tests unchanged (regression check); (b)
   `momentumResult` `SCORED` → `scorecard.momentum === momentumResult.overall`;
   (c) `momentumResult` `INSUFFICIENT_DATA` → `scorecard.momentum` equals
   today's pass-through value, identical to case (a); (d)
   `EngineOutput.momentumResult` echoes `EngineInput.momentumResult`
   exactly in all three cases, including staying `undefined` in case (a).
5. **Explicitly NOT in D.1**: no orchestration wiring of the live Twelve
   Data pipeline into `PlaybookClientShell`/any app flow; no UI change;
   no stance/action-zone/HC-004/HC-005/confidence wiring; no
   `fundamentals`/`valuation` generalization of `EvidenceScoredItem` (it
   is defined generally, but only momentum uses it in D.1).

No part of this scope requires further design review — §2–§6 already
cover every decision it depends on.
