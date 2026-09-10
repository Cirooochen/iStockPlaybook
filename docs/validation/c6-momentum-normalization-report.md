# Phase C.6 — Primary Trend & Relative Strength Normalization

Status: RESOLVED / COMPLETE (implementation, unwired)

Scope: implements the approved v0.1 normalization for the two remaining
spec §14 dimensions — Primary Trend (`trendSlope`) and Relative Strength
(`relativeStrength`) — completing all six dimensions in `scoreMomentum`.
No `Scorecard`/stance/action-zone wiring, no API work, no HC-004/HC-005,
no confidence model. See `docs/VALIDATION_PROTOCOL.md` for method/format;
`docs/phase-c6-trend-relative-strength-normalization-design.md` for the
approved design this implements exactly.

## Implemented

- **Primary Trend anchors** (`RULESET.technical.momentum.trendAnchors`):
  `-5%→10, -1%→35, 0%→50, +1%→65, +5%→90`, monotonic, clamped outside
  range — matches the approved design verbatim.
- **Relative Strength anchors**
  (`RULESET.technical.momentum.relativeStrengthAnchors`):
  `-20pp→10, -5pp→35, 0pp→50, +5pp→65, +20pp→90`, monotonic, clamped
  outside range — matches the approved design verbatim.
- **Weights**: `trendWeight: 0.25`, `relativeStrengthWeight: 0.20` added
  alongside the unchanged `rsiWeight: 0.10`, `relativeVolumeWeight: 0.15`,
  `structureWeight: 0.20`, `priceExtensionWeight: 0.10` — all six now sum
  to exactly 1.00, restoring spec §14's full original weighting.
- **`scoreMomentum` signature extended**: now takes `trend:
  DerivedTrendSignal` and `relativeStrength: RelativeStrengthData` as two
  additional explicit parameters (alongside the existing `signals`/
  `price`), mirroring exactly how `price` was added in the C.4
  resolution.
- **`MomentumComponentResult`** extended with a third status,
  `NOT_APPLICABLE`, and every status (`AVAILABLE`/`MISSING`/
  `NOT_APPLICABLE`) now carries its `weight` — so a component's expected
  weight is visible even when it produced no score.
- **`MomentumEvidenceCoverage`** (new) replaces the old flat
  `availableWeightShare` field with four explicitly distinguished
  numbers: `totalDefinedWeight`, `applicableWeight`, `availableWeight`,
  `missingWeight`, plus the derived `availableWeightShare`. `score`
  (`overall`), `applicableWeight`, `availableWeight`, and `missingWeight`
  are therefore never conflated — exactly the four things this checkpoint
  was asked to distinguish.
- **`NOT_APPLICABLE` excluded from `applicableWeight`**; **`MISSING`
  stays in `applicableWeight`** — implemented exactly as designed
  (§6 of the design doc). Neither ever contributes a score to the blend;
  `MISSING` is never converted to 0 or any other placeholder value.
- **Trend and Structure remain independent** — no blending, two separate
  components with their own weights, verified by tests where one is
  `AVAILABLE` while the other is `MISSING` simultaneously.

## Scenarios / Expected vs Actual

| Scenario | Expected | Actual |
|---|---|---|
| `trendSlope = 0` | score100 = 50 (neutral) | 50 ✓ |
| `trendSlope = +5%` (or beyond) | score100 = 90 (clamped) | 90 ✓ |
| `trendSlope` monotonic across `-5%…+5%` | strictly increasing score | confirmed ✓ |
| `relativeStrength = 0` | score100 = 50 (neutral) | 50 ✓ |
| `relativeStrength = +20pp` (or beyond) | score100 = 90 (clamped) | 90 ✓ |
| No benchmark configured (`NOT_APPLICABLE`) | excluded from `applicableWeight`; remaining 5 dims can reach `availableWeightShare = 1.0` | confirmed ✓ |
| Benchmark configured, data unaligned (`MISSING`) | stays in `applicableWeight`; `missingWeight = relativeStrengthWeight`; `availableWeightShare < 1.0` | confirmed ✓ |
| MISSING vs. genuinely bearish (`relativeStrength = -20pp`) AVAILABLE, all else equal | MISSING scores strictly higher than the bearish case | confirmed ✓ |
| Full six dimensions AVAILABLE | `SCORED`, blend matches an independently-recomputed weighted average using spec's literal 10/15/20/10/25/20 weights | confirmed ✓ |
| Gate boundary: `availableWeightShare` exactly `0.5` of `applicableWeight` | `SCORED` (not `INSUFFICIENT_DATA`) | confirmed ✓ |

All values verified via real `scoreMomentum()` calls against synthetic
fixtures, cross-checked against an independent anchor-interpolation
oracle re-derived in the test file (not the implementation's own
function).

## Findings

**PASS.** All approved C.6 design decisions implemented without
deviation: both anchor curves match the approved breakpoints exactly;
weights restore spec §14's full six-dimension total (1.00); the
`NOT_APPLICABLE`/`MISSING` distinction in the weight-math denominator
works exactly as designed, including the worked-example boundary case
from the design doc (a no-benchmark strategy reaching full evidence
share); `MISSING` never contributes a score and is verified to be
strictly better-scoring than an equivalent genuinely-bearish `AVAILABLE`
reading (directly answering "do not allow MISSING to silently become
bearish evidence"); Trend and Structure verified independent (each can
be `AVAILABLE` while the other is `MISSING`). No implementation bugs.

No new rule/model design questions — the anchor values and weights are
documented v0.1 hypotheses (unchanged framing from the design doc),
not re-litigated here.

## Tests

`npx vitest run` — **252/252 passing** (19 files unchanged, `momentum-
score.test.ts` rewritten for the new six-dimension shape and evidence-
coverage fields: 21 tests covering component visibility across all 6
keys, Primary Trend anchor interpolation/clamping/monotonicity/MISSING,
Relative Strength anchor interpolation/clamping/monotonicity/MISSING/
NOT_APPLICABLE, evidence-coverage math (`NOT_APPLICABLE`-excluded vs.
`MISSING`-included denominators, the exact 50%-of-`applicableWeight`
gate boundary), the MISSING-never-bearish property, and a full
six-dimension `SCORED` result independently re-derived and compared).
`npx tsc --noEmit` clean. `npx eslint` clean on all changed files.
Domain-only checkpoint; no UI/build verification run (per protocol §9).

## Decision Needed

None. Implementation matches the approved design with no deviation.
