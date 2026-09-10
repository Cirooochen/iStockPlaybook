// B.5.3B — 45% Target Boundary Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.3b-45pct-threshold-report.md.
//
// Threshold/state validation, not transaction accounting: three Position
// inputs constructed directly with fixed shares/price/avgCost and only
// portfolioWeightPct varied across the 45% medium-term target boundary.
// Everything else (portfolioTotal, price, strategy, thesis, scorecard) is
// held fixed so the threshold is the only variable under test.
import { describe, expect, it } from "vitest";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { Position } from "@/types/playbook";

function buildInput(weightPct: number): EngineInput {
  const price = unitySeed.market.executionPriceEur;
  const position: Position = {
    shares: 692, // = weightShareRange.max, pinned across all three scenarios
    averageCostEur: 27.76,
    valueEur: 692 * price,
    unrealizedReturnPct: ((price - 27.76) / 27.76) * 100,
    portfolioWeightPct: weightPct, // the sole independent variable
  };
  return {
    position,
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: price,
    strategy: unitySeed.strategy,
    thesisHealth: unitySeed.playbook.thesisHealth, // unchanged
    scorecard: unityScorecard, // unchanged
    actionZoneTemplates: unityActionZones,
  };
}

describe("B.5.3B — 45% target-maximum boundary: just above / exactly at / just below", () => {
  it("45.1% (just above): still OVERWEIGHT relative to the 40-45% target range", () => {
    const output = runDecisionEngine(buildInput(45.1));

    expect(output.concentration.state).toBe("MODERATELY_OVERWEIGHT");
    expect(output.targetPosition.positionSizingState).toBe("OVERWEIGHT");
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("WATCH");
  });

  it("45.0% (exactly at): WITHIN_TARGET — 45% is an inclusive upper bound", () => {
    const output = runDecisionEngine(buildInput(45.0));

    expect(output.concentration.state).toBe("WITHIN_TARGET");
    expect(output.targetPosition.positionSizingState).toBe("WITHIN_TARGET");
    // Crossing this exact boundary flips ADD from WATCH to ACTIVE.
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("ACTIVE");
  });

  it("44.9% (just below): WITHIN_TARGET, consistent with 45.0%", () => {
    const output = runDecisionEngine(buildInput(44.9));

    expect(output.concentration.state).toBe("WITHIN_TARGET");
    expect(output.targetPosition.positionSizingState).toBe("WITHIN_TARGET");
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("ACTIVE");
  });

  it("HC-001 is already cleared at all three weights (all below the 50% short-term ceiling)", () => {
    for (const weightPct of [45.1, 45.0, 44.9]) {
      const output = runDecisionEngine(buildInput(weightPct));
      expect(output.constraints.hc001.triggered).toBe(false);
      expect(output.constraints.accumulationEnabled).toBe(true);
    }
  });

  it("key question: WITHIN_TARGET does not mean zero trim capacity — the core-constrained feasible range still shows headroom", () => {
    // shares (692) is pinned at weightShareRange.max throughout, so
    // minimumTrim (weight-only) is 0 in all three cases — but the core
    // range (600-650) is tighter than the weight range, so
    // preferred/maximumNormal still report real headroom toward the core,
    // regardless of the weight-based WITHIN_TARGET classification. This is
    // intentional model behavior (Preferred/Maximum are core-aware; only
    // Minimum is weight-only), not a bug — HOLD is not "automatically
    // zero capacity."
    for (const weightPct of [45.1, 45.0, 44.9]) {
      const output = runDecisionEngine(buildInput(weightPct));
      expect(output.targetPosition.trimCapacity).toEqual({ minimum: 0, preferred: 42, maximumNormal: 76 });
    }
  });

  it("45.1% (MODERATELY_OVERWEIGHT) reconfirms the known HOLD vs. HOLD_TRIM design question — not fixed here", () => {
    const output = runDecisionEngine(buildInput(45.1));
    expect(output.stance).toBe("HOLD"); // spec §18 would suggest HOLD_TRIM for MODERATELY_OVERWEIGHT
  });
});
