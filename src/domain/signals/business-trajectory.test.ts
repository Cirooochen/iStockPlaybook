// Phase I.3 — deriveBusinessTrajectory. Fixtures build FundamentalsScoreResult
// directly (not through the mapper/template) since this file only reads
// two already-computed components — see business-trajectory.ts's own
// doc comment for why no scoring/fetching happens here.
import { describe, expect, it } from "vitest";
import { deriveBusinessTrajectory } from "@/domain/signals/business-trajectory";
import type { FundamentalsComponentResult, FundamentalsScoreResult } from "@/types/fundamentals";

const COVERAGE = { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 };

function scored(components: FundamentalsComponentResult[]): FundamentalsScoreResult {
  return { status: "SCORED", overall: { score: 7, state: "Positive" }, components, coverage: COVERAGE };
}

function insufficientData(components: FundamentalsComponentResult[]): FundamentalsScoreResult {
  return { status: "INSUFFICIENT_DATA", components, coverage: COVERAGE };
}

function available(key: string, rawValue: number, asOf = "2026-09-01"): FundamentalsComponentResult {
  return { key, weight: 0.1, status: "AVAILABLE", rawValue, score100: 50, asOf };
}

function missing(key: string): FundamentalsComponentResult {
  return { key, weight: 0.1, status: "MISSING" };
}

function notApplicable(key: string): FundamentalsComponentResult {
  return { key, weight: 0.1, status: "NOT_APPLICABLE" };
}

describe("deriveBusinessTrajectory — revenue trajectory (from growthTrend)", () => {
  it("IMPROVING when growthTrend's rawValue is positive", () => {
    const result = deriveBusinessTrajectory(scored([available("growthTrend", 0.05, "asOf-1")]));
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "asOf-1" });
  });

  it("DETERIORATING when growthTrend's rawValue is negative", () => {
    const result = deriveBusinessTrajectory(scored([available("growthTrend", -0.03, "asOf-1")]));
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "DETERIORATING", asOf: "asOf-1" });
  });

  it("STABLE when growthTrend's rawValue is exactly 0 — a real observation, not the same as missing", () => {
    const result = deriveBusinessTrajectory(scored([available("growthTrend", 0, "asOf-1")]));
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "STABLE", asOf: "asOf-1" });
  });

  it("MISSING, never STABLE, when growthTrend itself is MISSING", () => {
    const result = deriveBusinessTrajectory(scored([missing("growthTrend")]));
    expect(result.revenue).toEqual({ status: "MISSING" });
  });

  it("MISSING when growthTrend is NOT_APPLICABLE", () => {
    const result = deriveBusinessTrajectory(scored([notApplicable("growthTrend")]));
    expect(result.revenue).toEqual({ status: "MISSING" });
  });

  it("MISSING when growthTrend isn't present in components at all", () => {
    const result = deriveBusinessTrajectory(scored([available("marginTrend", 0.01)]));
    expect(result.revenue).toEqual({ status: "MISSING" });
  });
});

describe("deriveBusinessTrajectory — profitability trajectory (from marginTrend)", () => {
  it("IMPROVING when marginTrend's rawValue is positive", () => {
    const result = deriveBusinessTrajectory(scored([available("marginTrend", 0.02, "asOf-2")]));
    expect(result.profitability).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "asOf-2" });
  });

  it("DETERIORATING when marginTrend's rawValue is negative", () => {
    const result = deriveBusinessTrajectory(scored([available("marginTrend", -0.01, "asOf-2")]));
    expect(result.profitability).toEqual({ status: "AVAILABLE", direction: "DETERIORATING", asOf: "asOf-2" });
  });

  it("MISSING, never STABLE, when marginTrend is MISSING", () => {
    const result = deriveBusinessTrajectory(scored([missing("marginTrend")]));
    expect(result.profitability).toEqual({ status: "MISSING" });
  });
});

describe("deriveBusinessTrajectory — independence: revenue and profitability never collapse into one aggregate", () => {
  it("one line AVAILABLE and the other MISSING at the same time — no forced pairing, no aggregate state", () => {
    const result = deriveBusinessTrajectory(scored([available("growthTrend", 0.1, "rev-asOf"), missing("marginTrend")]));
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "rev-asOf" });
    expect(result.profitability).toEqual({ status: "MISSING" });
  });

  it("revenue improving while profitability deteriorates at the same time — both shown honestly, not folded into one verdict", () => {
    const result = deriveBusinessTrajectory(
      scored([available("growthTrend", 0.1, "rev-asOf"), available("marginTrend", -0.05, "margin-asOf")])
    );
    expect(result.revenue.status === "AVAILABLE" && result.revenue.direction).toBe("IMPROVING");
    expect(result.profitability.status === "AVAILABLE" && result.profitability.direction).toBe("DETERIORATING");
  });
});

describe("deriveBusinessTrajectory — reads components from BOTH SCORED and INSUFFICIENT_DATA results", () => {
  it("still surfaces real evidence when the overall Fundamentals result is INSUFFICIENT_DATA (e.g. Guidance's permanent MISSING sinks overall coverage without affecting growthTrend/marginTrend)", () => {
    const result = deriveBusinessTrajectory(
      insufficientData([available("growthTrend", 0.08, "asOf-3"), available("marginTrend", 0.02, "asOf-4"), missing("guidance")])
    );
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "asOf-3" });
    expect(result.profitability).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "asOf-4" });
  });
});

describe("deriveBusinessTrajectory — no live Fundamentals result at all", () => {
  it("both lines MISSING when the fetch never produced a result (undefined)", () => {
    const result = deriveBusinessTrajectory(undefined);
    expect(result).toEqual({ revenue: { status: "MISSING" }, profitability: { status: "MISSING" } });
  });
});

describe("deriveBusinessTrajectory — cadence-agnostic (Phase I.2's cadence-aware growthTrend/marginTrend feed in unchanged)", () => {
  it("reads an ANNUAL-cadence-derived growthTrend/marginTrend identically to a QUARTERLY one — no cadence branching of its own", () => {
    // The values here are exactly what computeGrowthTrend/computeMarginTrend
    // would produce for either cadence (Phase I.2) — this file has no
    // opinion on how they were computed, only on their sign.
    const result = deriveBusinessTrajectory(scored([available("growthTrend", 0.03, "annual-asOf"), available("marginTrend", -0.01, "annual-asOf")]));
    expect(result.revenue).toEqual({ status: "AVAILABLE", direction: "IMPROVING", asOf: "annual-asOf" });
    expect(result.profitability).toEqual({ status: "AVAILABLE", direction: "DETERIORATING", asOf: "annual-asOf" });
  });
});
