// B.5.3A — 50% Concentration Threshold Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.3a-50pct-threshold-report.md.
//
// Threshold/state validation, not transaction accounting: three Position
// inputs constructed directly with a fixed shares/price/avgCost and only
// portfolioWeightPct varied across the HC-001 boundary (50%). Everything
// else (portfolioTotal, price, strategy, thesis, scorecard) is held fixed
// so the threshold is the only variable under test.
import { describe, expect, it } from "vitest";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { Position } from "@/types/playbook";

function buildInput(weightPct: number): EngineInput {
  const price = unitySeed.market.executionPriceEur;
  const position: Position = {
    shares: 770,
    averageCostEur: 27.76,
    valueEur: 770 * price,
    unrealizedReturnPct: ((price - 27.76) / 27.76) * 100,
    portfolioWeightPct: weightPct, // the sole independent variable
  };
  return {
    position,
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: price,
    strategy: unitySeed.strategy,
    thesisHealth: unitySeed.playbook.thesisHealth, // unchanged
    scorecard: unityScorecard, // unchanged — fundamentals/valuation/momentum untouched
    actionZoneTemplates: unityActionZones,
  };
}

describe("B.5.3A — HC-001 50% threshold: just above / exactly at / just below", () => {
  it("50.1% (just above): HC-001 triggered, accumulation disabled, ADD inactive", () => {
    const output = runDecisionEngine(buildInput(50.1));

    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.accumulationEnabled).toBe(false);
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("INACTIVE");
  });

  it("50.0% (exactly at): HC-001 already cleared (boundary is strictly '>', not '>=')", () => {
    const output = runDecisionEngine(buildInput(50.0));

    expect(output.constraints.hc001.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(true);
    // Cleared, but NOT within the 40-45% target -> WATCH, not ACTIVE.
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("WATCH");
  });

  it("49.9% (just below): HC-001 cleared, but PositionSizingState is still OVERWEIGHT relative to 45%", () => {
    const output = runDecisionEngine(buildInput(49.9));

    expect(output.constraints.hc001.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(true);

    // The central point of B.5.3A: clearing the 50% short-term ceiling is
    // NOT the same as being on-target against the 40-45% medium-term
    // range. Both classifications say "still overweight," just via
    // different models.
    expect(output.concentration.state).toBe("MODERATELY_OVERWEIGHT");
    expect(output.targetPosition.positionSizingState).toBe("OVERWEIGHT");
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("WATCH"); // not ACTIVE
  });

  it("all three land in MODERATELY_OVERWEIGHT and surface the known HOLD vs. HOLD_TRIM design question (not fixed here)", () => {
    // Spec §18 groups MODERATELY_OVERWEIGHT/OVERWEIGHT together under
    // HOLD_TRIM; current code returns plain HOLD for MODERATELY_OVERWEIGHT.
    // This is the pre-existing, already-documented design question from
    // the roadmap — reconfirmed here, not reclassified or fixed.
    for (const weightPct of [50.1, 50.0, 49.9]) {
      const output = runDecisionEngine(buildInput(weightPct));
      expect(output.concentration.state).toBe("MODERATELY_OVERWEIGHT");
      expect(output.stance).toBe("HOLD"); // spec §18 would suggest HOLD_TRIM
    }
  });
});
