# Phase D.3 — Momentum Evidence Provenance Design

Status: DESIGN ONLY — no application code changed. No `MODEL DECISION
REQUIRED` or `ARCHITECTURE CONFLICT` (per
`docs/PHASE-D-INTEGRATION-GUIDE.md` §12's taxonomy, this is a **CLEAN
INTEGRATION** — the three-way distinction the task asks for already
exists structurally; the design contribution is naming and deriving it
consistently, not inventing new state).

## 0. What was read

- `docs/PHASE-D-INTEGRATION-GUIDE.md` — §4 (`MISSING != 0`, and the
  `AVAILABLE`/`MISSING`/`NOT_APPLICABLE`/`INSUFFICIENT_DATA` vocabulary),
  §5 ("evidence coverage... is not automatically the same thing as
  confidence... prefer explicit metadata"), §11 ("use the smallest clean
  integration step"), §12 (stop taxonomy).
- `docs/phase-d0-momentum-scorecard-integration-design.md` — §2.2
  (`EngineInput`/`EngineOutput.momentumResult?: MomentumScoreResult`,
  additive, echoed verbatim) and §6, which **already documents** the
  exact limitation this checkpoint is asked to address: `Scorecard.
  momentum` alone cannot distinguish "fresh" from "fallback," and "the
  canonical, authoritative distinction always lives on
  `EngineOutput.momentumResult.status`."
- `docs/phase-d2-live-momentum-engine-orchestration-design.md` — §2.1
  (`fetchLiveMomentumResult` returns `MomentumScoreResult | undefined`,
  swallowing every failure mode into a single `undefined`) and §4's
  explicit non-goal: "No user-facing UI signal for 'live vs. fallback
  momentum data'... no UI change is designed or implied."
- `src/domain/signals/momentum-score.ts` (current) —
  `MomentumScoreResult = {status:"SCORED", overall, components,
  coverage} | {status:"INSUFFICIENT_DATA", components, coverage}`, and
  `deriveMomentumEvidenceScoredItem` — the precedent this design's own
  derivation function follows exactly.
- `src/domain/engine.ts` (current, post-D.1/D.2) —
  `EngineOutput.momentumResult?: MomentumScoreResult` echoes
  `EngineInput.momentumResult` verbatim; no provenance field exists
  today.
- `src/infrastructure/market-data/twelve-data/orchestration.ts` /
  `src/app/stocks/[ticker]/page.tsx` /
  `src/components/playbook/PlaybookClientShell.tsx` (current, post-D.2)
  — `fetchLiveMomentumResult` catches every failure (missing
  credentials, network error, provider error, mapping error) into one
  undifferentiated `undefined`; `page.tsx` passes whatever it gets
  straight through as `initialMomentumResult`; the shell passes it
  straight into `runDecisionEngine`. No provenance concept exists
  anywhere in this flow today.

## 1. The three-way distinction already exists — it just has no name

Given `EngineOutput.momentumResult: MomentumScoreResult | undefined`
(unchanged since D.1), the three states the task asks to distinguish are
**already 100% structurally distinguishable, with zero new stored
data**:

```text
momentumResult === undefined                    -> fallback / no live momentum
momentumResult.status === "SCORED"               -> live scored momentum
momentumResult.status === "INSUFFICIENT_DATA"    -> live insufficient-data momentum
```

This is not a gap in the DATA — it is a gap in **naming and
consistency**: nothing today gives this 3-way check a single, canonical,
reusable, tested expression. Left alone, every future consumer (a UI
component, a log line, a future HC-004) would re-derive this ad hoc,
risking subtly different re-implementations drifting apart. That is
exactly what this design fixes — additively, without touching any
existing type's shape.

## 2. Proposed design: one named type, one pure derivation function

```ts
// src/domain/signals/momentum-score.ts — illustrative, not implemented.
// Placed alongside MomentumScoreResult and deriveMomentumEvidenceScoredItem
// — same file, same "only place this may be produced" precedent.

export type MomentumProvenance = "LIVE_SCORED" | "LIVE_INSUFFICIENT_DATA" | "FALLBACK";

export function deriveMomentumProvenance(
  momentumResult: MomentumScoreResult | undefined
): MomentumProvenance {
  if (momentumResult === undefined) return "FALLBACK";
  return momentumResult.status === "SCORED" ? "LIVE_SCORED" : "LIVE_INSUFFICIENT_DATA";
}
```

Reads **only** the existing structural discriminators
(`momentumResult`'s presence, `momentumResult.status`) — never
`.overall.score`/`.overall.state`. This directly satisfies "prefer
explicit provenance metadata over inferring state from score values":
there is no score-value inference anywhere in this function, by
construction, and the type system (a `MomentumScoreResult` with
`status: "INSUFFICIENT_DATA"` structurally has no `overall` field at
all — confirmed from the current type) makes score-based inference for
that branch impossible even by accident.

No other file changes. `MomentumComponentResult`, `MomentumScoreResult`,
`EngineInput`, `EngineOutput`, `EvidenceScoredItem`,
`deriveMomentumEvidenceScoredItem`, `Scorecard`, `ScoreItem` are all
untouched.

## 3. Where does provenance belong — EngineOutput, orchestration result, or both?

**Neither, as stored state.** Provenance is a pure, lossless *view* over
data that already exists on `EngineOutput.momentumResult` (equally
computable from `EngineInput.momentumResult` or
`fetchLiveMomentumResult`'s return value directly, since all three carry
the identical `MomentumScoreResult | undefined`). Storing it as a new
field on any of them would be pure duplication with a real, avoidable
drift risk:

- **`EngineOutput.momentumProvenance` (rejected):** `runDecisionEngine`
  would have to compute this from `input.momentumResult` internally —
  the exact same computation `deriveMomentumProvenance` already does. A
  stored field only saves a caller one function call, at the cost of a
  permanent new field on an already-growing type and a value that must
  never be allowed to disagree with `momentumResult` itself. Not worth
  it for "smallest additive."
- **`fetchLiveMomentumResult`'s return type (rejected):** changing its
  signature (e.g. wrapping the return value) would touch D.2's
  freshly-implemented, tested function and its one caller
  (`page.tsx`) for no informational gain — `deriveMomentumProvenance`
  already works unchanged on its existing `MomentumScoreResult |
  undefined` return value.
- **A free, exported pure function (chosen):** zero new fields, zero
  drift risk (nothing is stored, so nothing can disagree), usable
  identically at every layer that already has a `MomentumScoreResult |
  undefined` value in hand — `runDecisionEngine`'s internals, a future
  `PlaybookClientShell` render, a future log line, a future UI badge —
  without any of them needing a different code path depending on which
  layer they're at.

## 4. What this does NOT attempt (explicit non-goals)

- **No finer breakdown of "FALLBACK."** Today,
  `fetchLiveMomentumResult` collapses missing credentials, network
  failure, and a Twelve Data provider error into one `undefined` — this
  design's `FALLBACK` bucket inherits that same granularity (a single
  bucket), matching the task's own three-way framing exactly. The
  distinction between *why* a fallback happened still exists only as a
  server-side `console.error` log (Phase D.2, unchanged) — surfacing it
  as structured provenance (e.g. `"FALLBACK_NOT_CONFIGURED"` vs.
  `"FALLBACK_FETCH_FAILED"`) would require changing
  `fetchLiveMomentumResult`'s return shape, which is a real, separate,
  slightly larger design question — noted here as a plausible future
  extension, explicitly **not decided or scoped in this design**.
- **No momentum formula change** — `scoreMomentum`, its anchors, and its
  weights are untouched.
- **No stance/action-zone change** — `deriveStance`/
  `deriveActionZoneState` do not read `momentumResult` today and this
  design gives them no new reason to.
- **No Scorecard redesign** — `Scorecard`, `ScoreItem`, `SignalState`,
  and `EvidenceScoredItem` (Phase D.0/D.1) are all unchanged.
  `Scorecard.momentum`'s own documented limitation (D.0 §6 — it cannot
  itself distinguish `INSUFFICIENT_DATA` from `FALLBACK`) is **not**
  resolved by this design and is not claimed to be — `MomentumProvenance`
  is deliberately a *parallel*, `EngineOutput`-level concept, not a
  patch to the legacy field.
- **No UI work** — `MomentumProvenance`/`deriveMomentumProvenance` are
  designed to be consumable by a future UI badge/indicator, but no
  component is designed, changed, or implied here.
- **No code written** — every snippet above is illustrative.

## 5. Architecture conflict check

None found. The proposed addition is a single new exported type and a
single new pure function in an already-existing file, reading only
already-existing, unchanged data. It does not require changing
`EngineInput`, `EngineOutput`, `fetchLiveMomentumResult`,
`PlaybookClientShell`, `page.tsx`, or any rule-layer function's
signature — every boundary established in D.0/D.1/D.2 (engine stays
market-data-free, API key stays server-only, provider/domain import
direction) is left exactly as it is.

## 6. Recommended next step

Not implemented here, per instruction. A D.4 implementation would be
purely mechanical: add `MomentumProvenance`/`deriveMomentumProvenance`
to `momentum-score.ts` (§2), and add focused unit tests covering all
three branches (`undefined` -> `FALLBACK`; `SCORED` -> `LIVE_SCORED`;
`INSUFFICIENT_DATA` -> `LIVE_INSUFFICIENT_DATA`) plus a check that no
branch reads `.overall`. Whether/when to surface provenance in the UI,
and whether "FALLBACK" ever needs a finer sub-reason (§4), are each
separate, later design questions — not implied or pre-decided by
building this function.
