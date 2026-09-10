// Momentum score normalization — spec §14 (Technical/Momentum Engine),
// docs/phase-c0-market-data-contract.md §9. Phase C.4/C.6 (resolved).
//
// Normalizes DerivedTechnicalSignals (src/domain/signals/momentum.ts) plus
// explicit current price, trend, and relative-strength inputs into a
// Scorecard-compatible momentum ScoreItem. NOT wired into `signals.ts`,
// `Scorecard`, `runDecisionEngine`, stance, or action zones yet — a
// free-standing function only, exactly like momentum.ts's compute*
// functions before it.
//
// ── All 6 of spec §14's dimensions are now implemented ────────────────────
// Spec §14's example weighting: Primary Trend (25%), 50DMA/200DMA
// Structure (20%), Relative Strength (20%), Volume Confirmation (15%),
// Momentum/RSI (10%), Price Extension (10%) — summing to exactly 100%.
//
//   - Momentum/RSI                -> `rsi`                       (Phase C.3)
//   - Volume Confirmation         -> `relativeVolume`             (Phase C.3)
//   - 50DMA/200DMA Structure      -> `price` + `dma50` + `dma200` (Phase C.4)
//   - Price Extension             -> `price` + `dma50` + `dma200` (Phase C.4)
//   - Primary Trend               -> `trend.dma200Slope`          (Phase C.6)
//   - Relative Strength           -> `relativeStrength`           (Phase C.6)
//
// ── Current price, trend, relative strength: explicit inputs ─────────────
// `scoreMomentum` takes `price: DataField<number>`, `trend:
// DerivedTrendSignal`, and `relativeStrength: RelativeStrengthData` as
// explicit parameters — the same pattern established for `price` in the
// C.4 resolution: this function only knows about the values it's handed,
// not about providers, benchmarks, or how they were obtained. If `price`
// is MISSING, both Structure and Extension are MISSING; Trend and
// Relative Strength are computed independently and are unaffected by it.
//
// ── 50DMA/200DMA Structure ────────────────────────────────────────────────
// Spec's own definition is price-relative and considers all three pairwise
// relationships together: price-vs-50DMA, price-vs-200DMA, and
// 50DMA-vs-200DMA. Of the 8 raw true/false combinations, 2 are
// mathematically impossible for real numbers (transitivity). The
// remaining 6 correspond exactly to the 6 possible strict orderings of
// (price, dma50, dma200), scored via `structureAnchors` (see
// `classifyStructure` below).
//
// ── Price Extension ────────────────────────────────────────────────────
// Spec's own ratios: `extension_50dma = (price - dma50) / dma50` and
// `extension_200dma = (price - dma200) / dma200`, each normalized
// independently via `priceExtensionAnchors` (hump-shaped — a modest
// positive extension is constructive, a large one carries mean-reversion
// risk), then averaged with equal weight.
//
// Both Structure and Extension require price + dma50 + dma200 ALL
// AVAILABLE — if any one is MISSING, the whole component is MISSING.
//
// ── Primary Trend ─────────────────────────────────────────────────────
// `trend.dma200Slope` (Phase C.5's `computeDma200Slope`) is normalized via
// `trendAnchors`, approved 2026-09-10. UNLIKE RSI/Extension, this curve is
// MONOTONIC, not hump-shaped: a rising 200DMA has no "too extended"
// ceiling in this design, so stronger positive trendSlope simply scores
// higher. Deliberately NOT blended with Structure — both remain
// independent components with their own weight, even though they are
// correlated signals in practice (see
// docs/phase-c6-trend-relative-strength-normalization-design.md §5).
//
// ── Relative Strength ─────────────────────────────────────────────────
// `relativeStrength` (Phase C.5's `computeRelativeStrength`, a 3-state
// `RelativeStrengthData`) is normalized via `relativeStrengthAnchors`,
// also monotonic, same reasoning as Trend. `NOT_APPLICABLE` (no
// `Strategy.benchmarkInstrumentId` configured) is a DIFFERENT state from
// `MISSING` (a benchmark IS configured, but this window's data wasn't
// available) — see the evidence-coverage section below for how each
// affects the weight math differently.
//
// ── Output shape: score, applicable weight, available weight, missing
//    evidence — all distinguished, never conflated ──────────────────────
// `Scorecard.momentum: ScoreItem` (src/types/playbook.ts) cannot represent
// "insufficient evidence" — resolved (Phase C.4) without a shared-type
// change: this file returns its own additive, local `MomentumScoreResult`.
// Its `SCORED.overall` field IS a real, valid `ScoreItem` — assigning it
// to `Scorecard.momentum` is future wiring work, not done here.
//
// `MomentumScoreResult` carries a `coverage: MomentumEvidenceCoverage`
// object (approved 2026-09-10) that explicitly distinguishes:
//   - `totalDefinedWeight`  — spec's full six-dimension weight (1.00).
//   - `applicableWeight`    — `totalDefinedWeight` MINUS any NOT_APPLICABLE
//                             component's weight (see below). This is the
//                             renormalized denominator the minimum-evidence
//                             gate and the blend are measured against.
//   - `availableWeight`     — sum of weights for components that actually
//                             produced a score (status AVAILABLE).
//   - `missingWeight`       — `applicableWeight - availableWeight`: the
//                             weight of components that WERE applicable
//                             but came back MISSING. Always visible, never
//                             silently absorbed into the score.
//   - `availableWeightShare`— `availableWeight / applicableWeight`, the
//                             fraction actually gated on.
// `overall` (the score) is therefore never the only signal of data
// quality — a caller can always see exactly how much of the applicable
// evidence was actually available, separate from what the score itself
// says.
//
// ── NOT_APPLICABLE vs. MISSING — different weight-math treatment ─────────
// Approved 2026-09-10. `NOT_APPLICABLE` (Relative Strength only, in
// practice — no benchmark configured) is EXCLUDED from
// `applicableWeight` entirely: a strategy that deliberately doesn't track
// a benchmark isn't producing worse evidence than one that does, so it
// isn't penalized the same way a genuine data gap would be. `MISSING`
// STAYS IN `applicableWeight` (unchanged from the original C.4 design) —
// it represents a real evidence gap and correctly reduces
// `availableWeightShare`. Per instruction, MISSING is never converted to
// a score of 0 and never contributes to the blend at all — it is excluded
// from `availableWeight`/the blend numerator exactly like before; only
// its weight becomes visible via `coverage.missingWeight`, never a
// bearish number.
//
// ── Weight redistribution (unchanged mechanism, six dimensions now) ──────
// When a component is MISSING or NOT_APPLICABLE, its weight is NOT
// redistributed by inventing a placeholder score for it — the blend
// renormalizes proportionally over AVAILABLE components only
// (`componentWeight / availableWeight`), unaffected by whether the
// remaining weight budget came from a MISSING or a NOT_APPLICABLE
// component.
import type { DataField, DerivedTechnicalSignals, DerivedTrendSignal, RelativeStrengthData } from "@/types/market-data";
import type { ScoreItem, SignalState } from "@/types/playbook";
import type { EvidenceScoredItem } from "@/types/evidence-scoring";
import { RULESET } from "@/config/ruleset-v0.1";

export type MomentumComponentKey =
  | "rsi"
  | "relativeVolume"
  | "structure"
  | "priceExtension"
  | "trend"
  | "relativeStrength";

// Preserves component-level visibility (goal 2) — every defined component
// appears here, whatever its status, even when the overall result is
// INSUFFICIENT_DATA. `score100` is the component's own normalized 0–100
// reading, kept unrounded (rounding happens once, at the very end, on the
// final blended value). `weight` is carried on EVERY status (not just
// AVAILABLE) so a caller can always see how much evidence a MISSING or
// NOT_APPLICABLE component was worth, not just that it was absent.
export type MomentumComponentResult =
  | {
      key: MomentumComponentKey;
      status: "AVAILABLE";
      rawValue: number | string;
      score100: number;
      weight: number;
    }
  | { key: MomentumComponentKey; status: "MISSING"; weight: number }
  | { key: MomentumComponentKey; status: "NOT_APPLICABLE"; weight: number };

// Distinguishes score / applicable weight / available (scored) weight /
// missing evidence — approved 2026-09-10, see the top-of-file doc comment.
export interface MomentumEvidenceCoverage {
  totalDefinedWeight: number;
  applicableWeight: number;
  availableWeight: number;
  missingWeight: number;
  availableWeightShare: number;
}

export type MomentumScoreResult =
  | {
      status: "SCORED";
      overall: ScoreItem;
      components: MomentumComponentResult[];
      coverage: MomentumEvidenceCoverage;
    }
  | {
      status: "INSUFFICIENT_DATA";
      components: MomentumComponentResult[];
      coverage: MomentumEvidenceCoverage;
    };

type Anchor = readonly [input: number, score: number];

// Bounded continuous normalization via piecewise-linear interpolation
// between named anchors — the same pattern spec §11 already establishes
// for fundamentals (revenue-growth anchors). Clamped outside the anchor
// range to the first/last anchor's score, never extrapolated further.
function interpolateAnchors(anchors: readonly Anchor[], value: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  /* istanbul ignore next -- unreachable: value is bounded by the checks above */
  return last[1];
}

// Converts an internal 0–100 score to this codebase's existing ScoreItem
// display convention — 1–10 (rounded), min 1 — matching
// src/domain/playbook/scoring.ts's calcPositionFitScore exactly, so
// momentum's ScoreItem is on the same scale as every other Scorecard
// dimension.
function toScoreItem(score100: number): ScoreItem {
  const score = Math.max(1, Math.round(score100 / 10));
  const state: SignalState = score >= 7 ? "Positive" : score >= 4 ? "Neutral" : "Weak";
  return { score, state };
}

// Classifies (price, dma50, dma200) into one of the 6 possible real-number
// orderings and returns the matching structureAnchors key — see this
// file's top-of-file doc comment for why exactly 6 (not 8) cases exist.
function classifyStructure(
  price: number,
  dma50: number,
  dma200: number
): keyof typeof RULESET.technical.momentum.structureAnchors {
  const priceAboveDma50 = price > dma50;
  const priceAboveDma200 = price > dma200;
  const dma50AboveDma200 = dma50 > dma200;

  if (priceAboveDma50 && priceAboveDma200 && dma50AboveDma200) return "fullBullish";
  if (priceAboveDma50 && priceAboveDma200 && !dma50AboveDma200) return "priceStrongRegimeBearish";
  if (!priceAboveDma50 && priceAboveDma200 && dma50AboveDma200) return "pullbackInUptrend";
  if (priceAboveDma50 && !priceAboveDma200 && !dma50AboveDma200) return "bounceInDowntrend";
  if (!priceAboveDma50 && !priceAboveDma200 && dma50AboveDma200) return "breakdownInUptrend";
  // Remaining case: price <= dma50, price <= dma200, dma50 <= dma200.
  // (The other 2 of the 8 raw combinations are transitivity-impossible and
  // never reached.)
  return "fullBearish";
}

function scoreComponent(
  key: MomentumComponentKey,
  field: DataField<number>,
  anchors: readonly Anchor[],
  weight: number
): MomentumComponentResult {
  if (field.status === "MISSING") return { key, status: "MISSING", weight };
  return {
    key,
    status: "AVAILABLE",
    rawValue: field.value,
    score100: interpolateAnchors(anchors, field.value),
    weight,
  };
}

export function scoreMomentum(
  signals: DerivedTechnicalSignals,
  price: DataField<number>,
  trend: DerivedTrendSignal,
  relativeStrength: RelativeStrengthData
): MomentumScoreResult {
  const {
    rsiWeight,
    relativeVolumeWeight,
    structureWeight,
    priceExtensionWeight,
    trendWeight,
    relativeStrengthWeight,
    minimumAvailableWeightShare,
    rsiAnchors,
    relativeVolumeAnchors,
    structureAnchors,
    priceExtensionAnchors,
    trendAnchors,
    relativeStrengthAnchors,
  } = RULESET.technical.momentum;

  const components: MomentumComponentResult[] = [
    scoreComponent("rsi", signals.rsi, rsiAnchors, rsiWeight),
    scoreComponent("relativeVolume", signals.relativeVolume, relativeVolumeAnchors, relativeVolumeWeight),
  ];

  // Structure and Extension both require price + dma50 + dma200 all
  // AVAILABLE — if any one is MISSING, the whole component is MISSING (no
  // partial computation from just one relationship or one ratio).
  if (price.status === "AVAILABLE" && signals.dma50.status === "AVAILABLE" && signals.dma200.status === "AVAILABLE") {
    const p = price.value;
    const dma50 = signals.dma50.value;
    const dma200 = signals.dma200.value;

    const structureCase = classifyStructure(p, dma50, dma200);
    components.push({
      key: "structure",
      status: "AVAILABLE",
      rawValue: structureCase,
      score100: structureAnchors[structureCase],
      weight: structureWeight,
    });

    const extension50 = (p - dma50) / dma50;
    const extension200 = (p - dma200) / dma200;
    const extensionScore =
      (interpolateAnchors(priceExtensionAnchors, extension50) +
        interpolateAnchors(priceExtensionAnchors, extension200)) /
      2;
    components.push({
      key: "priceExtension",
      status: "AVAILABLE",
      rawValue: (extension50 + extension200) / 2,
      score100: extensionScore,
      weight: priceExtensionWeight,
    });
  } else {
    components.push({ key: "structure", status: "MISSING", weight: structureWeight });
    components.push({ key: "priceExtension", status: "MISSING", weight: priceExtensionWeight });
  }

  // Primary Trend — deliberately independent of Structure (never blended),
  // monotonic anchor curve.
  components.push(scoreComponent("trend", trend.dma200Slope, trendAnchors, trendWeight));

  // Relative Strength — 3-state input, NOT_APPLICABLE handled distinctly
  // from MISSING (see the top-of-file doc comment).
  if (relativeStrength.status === "NOT_APPLICABLE") {
    components.push({ key: "relativeStrength", status: "NOT_APPLICABLE", weight: relativeStrengthWeight });
  } else if (relativeStrength.status === "MISSING") {
    components.push({ key: "relativeStrength", status: "MISSING", weight: relativeStrengthWeight });
  } else {
    components.push({
      key: "relativeStrength",
      status: "AVAILABLE",
      rawValue: relativeStrength.relativeStrength,
      score100: interpolateAnchors(relativeStrengthAnchors, relativeStrength.relativeStrength),
      weight: relativeStrengthWeight,
    });
  }

  const totalDefinedWeight =
    rsiWeight + relativeVolumeWeight + structureWeight + priceExtensionWeight + trendWeight + relativeStrengthWeight;

  const notApplicableWeight = components
    .filter((c) => c.status === "NOT_APPLICABLE")
    .reduce((sum, c) => sum + c.weight, 0);
  const applicableWeight = totalDefinedWeight - notApplicableWeight;

  const availableComponents = components.filter(
    (c): c is Extract<MomentumComponentResult, { status: "AVAILABLE" }> => c.status === "AVAILABLE"
  );
  const availableWeight = availableComponents.reduce((sum, c) => sum + c.weight, 0);
  const missingWeight = applicableWeight - availableWeight;
  const availableWeightShare = applicableWeight > 0 ? availableWeight / applicableWeight : 0;

  const coverage: MomentumEvidenceCoverage = {
    totalDefinedWeight,
    applicableWeight,
    availableWeight,
    missingWeight,
    availableWeightShare,
  };

  if (availableWeightShare < minimumAvailableWeightShare) {
    return { status: "INSUFFICIENT_DATA", components, coverage };
  }

  const blended100 = availableComponents.reduce(
    (sum, c) => sum + c.score100 * (c.weight / availableWeight),
    0
  );

  return { status: "SCORED", overall: toScoreItem(blended100), components, coverage };
}

// Phase D.0/D.1 — the only place a momentum EvidenceScoredItem may be
// produced, mirroring deriveThesisScoreItem's "only place this may be
// produced" role for thesis (src/domain/thesis/thesis.ts). Never
// fabricates a SCORED-shaped result for INSUFFICIENT_DATA — no score 0,
// no Neutral, no reserved value, no stale fallback baked in here. What a
// legacy ScoreItem-only consumer does when this returns
// INSUFFICIENT_DATA is that consumer's decision, not this function's
// (see runDecisionEngine's transitional handling,
// docs/phase-d0-momentum-scorecard-integration-design.md §6).
export function deriveMomentumEvidenceScoredItem(result: MomentumScoreResult): EvidenceScoredItem {
  if (result.status === "SCORED") {
    return { status: "SCORED", item: result.overall };
  }
  return { status: "INSUFFICIENT_DATA" };
}

// Phase D.3 — names the 3-way distinction between live scored momentum,
// live insufficient-data momentum, and no live momentum at all (fallback)
// that was already structurally derivable from `MomentumScoreResult |
// undefined`. A pure, on-demand view — deliberately not stored anywhere
// (not on EngineOutput, not on the orchestration result): storing it
// would duplicate what `momentumResult` itself already encodes, with a
// real drift risk and no informational gain. See
// docs/phase-d3-momentum-provenance-design.md §2/§3. Reads only the
// structural discriminators (presence, `.status`) — never `.overall`, so
// this can never be an inference from score values.
export type MomentumProvenance = "LIVE_SCORED" | "LIVE_INSUFFICIENT_DATA" | "FALLBACK";

export function deriveMomentumProvenance(
  momentumResult: MomentumScoreResult | undefined
): MomentumProvenance {
  if (momentumResult === undefined) return "FALLBACK";
  return momentumResult.status === "SCORED" ? "LIVE_SCORED" : "LIVE_INSUFFICIENT_DATA";
}

// Phase D.5 — approved decision (docs/phase-d4-momentum-decision-
// influence-design.md §8): a defensive-only ADD-zone timing gate.
// Fails open (true) for anything short of a confirmed SCORED result —
// absent, INSUFFICIENT_DATA, and (by extension, since both collapse to
// non-SCORED here) FALLBACK all behave as "momentum absent," never a
// restriction. Only a clearly unfavorable live score (the pre-existing
// "Weak" SignalState bucket every other Scorecard dimension already
// uses — not a new threshold) may return false. Never returns false
// for Neutral/Positive, and this function can only ever be used to
// remove ADD eligibility, never grant it (see AddEligibility/
// deriveActionZoneState — momentumEligible is AND-ed in alongside
// accumulationEnabled/thesisEligible).
export function deriveMomentumEligibility(momentumResult: MomentumScoreResult | undefined): boolean {
  if (momentumResult?.status !== "SCORED") return true;
  return momentumResult.overall.state !== "Weak";
}
