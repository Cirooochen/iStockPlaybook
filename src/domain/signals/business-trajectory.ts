// Business Trajectory — Phase I.3. Spec: docs/phase-i-minimum-research-evidence.md §11.
//
// Deliberately NOT a new evidence source and NOT a new score: this reads
// the `growthTrend`/`marginTrend` FundamentalsComponentResult values
// scoreFundamentals (src/domain/signals/fundamentals-score.ts) already
// computes — no new fetch, no new weights, no new anchors. Two
// independent lines, never combined into one aggregate
// IMPROVING/MIXED/DETERIORATING verdict — a beginner reads "is revenue
// improving" and "is profitability improving" side by side, not a single
// blended read of two potentially-contradictory signals (the product
// review's own "don't fold contradictions away" principle).
//
// Cadence-agnostic by construction: growthTrend/marginTrend are already
// cadence-aware (Phase I.2 — computeGrowthTrend/computeMarginTrend), so
// this file reads whatever FundamentalsScoreResult it's given, QUARTERLY
// or ANNUAL, with no branching of its own.
import type { FundamentalsComponentResult, FundamentalsScoreResult } from "@/types/fundamentals";

export type BusinessTrajectoryDirection = "IMPROVING" | "DETERIORATING" | "STABLE";

// MISSING here means exactly what it means everywhere else in this
// codebase: no evidence, never "Stable" — a flat/zero delta is a real,
// AVAILABLE observation (STABLE), not the same thing as no observation
// at all.
export type BusinessTrajectoryLine =
  | { status: "AVAILABLE"; direction: BusinessTrajectoryDirection; asOf: string }
  | { status: "MISSING" };

export interface BusinessTrajectory {
  revenue: BusinessTrajectoryLine; // from growthTrend
  profitability: BusinessTrajectoryLine; // from marginTrend
}

const MISSING_LINE: BusinessTrajectoryLine = { status: "MISSING" };

function findComponent(components: FundamentalsComponentResult[], key: string): FundamentalsComponentResult | undefined {
  return components.find((c) => c.key === key);
}

// growthTrend/marginTrend's own rawValue is always a plain delta number
// in the GROWTH_SOFTWARE_TEMPLATE (never GuidanceEvidence, which only
// the `guidance` component ever produces) — the `typeof` check is
// defensive, not expected to fire, matching this codebase's convention
// of dropping rather than fabricating when a shape assumption doesn't
// hold (mirrors mappers.ts's own "defensive skip" comments).
function toTrajectoryLine(component: FundamentalsComponentResult | undefined): BusinessTrajectoryLine {
  if (component === undefined || component.status !== "AVAILABLE" || typeof component.rawValue !== "number") {
    return MISSING_LINE;
  }
  const direction: BusinessTrajectoryDirection = component.rawValue > 0 ? "IMPROVING" : component.rawValue < 0 ? "DETERIORATING" : "STABLE";
  return { status: "AVAILABLE", direction, asOf: component.asOf };
}

// `result` is `undefined` when no live Fundamentals fetch succeeded at
// all (src/infrastructure/market-data/sec-edgar/orchestration.ts's own
// "never throws, resolves undefined" contract) — both lines are honestly
// MISSING in that case, same as every other evidence gap in this
// product. Reads `result.components` directly, present on BOTH the
// SCORED and INSUFFICIENT_DATA branches of FundamentalsScoreResult — so
// Business Trajectory can show real evidence even when the fuller
// 7-component composite score didn't reach SCORED (e.g. Guidance is
// permanently MISSING for everyone, which alone can sink the overall
// score below its coverage threshold without affecting growthTrend/
// marginTrend's own availability at all).
export function deriveBusinessTrajectory(result: FundamentalsScoreResult | undefined): BusinessTrajectory {
  if (result === undefined) {
    return { revenue: MISSING_LINE, profitability: MISSING_LINE };
  }
  return {
    revenue: toTrajectoryLine(findComponent(result.components, "growthTrend")),
    profitability: toTrajectoryLine(findComponent(result.components, "marginTrend")),
  };
}
