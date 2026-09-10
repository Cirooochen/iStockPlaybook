// B.5.2A — SELL Transaction Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.2a-sell-report.md.
//
// Validates propagation, not just isolated formulas: the SELL goes through
// the real applySell()/portfolio-total-preservation path (the same one
// PlaybookClientShell.handleTransaction uses), and the resulting Position
// + preserved portfolioTotalEur are then fed through the real
// runDecisionEngine() — not a hand-constructed post-sell state.
import { describe, expect, it } from "vitest";
import { applySell, calcPortfolioTotalAfterSell } from "@/domain/portfolio/accounting";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";

describe("B.5.2A — SELL 100 Unity shares propagates correctly end to end", () => {
  it("shares/value/weight/total/concentration/stance/zones all update consistently", () => {
    const price = unitySeed.market.executionPriceEur;

    // 1. Real transaction path — mirrors PlaybookClientShell.handleTransaction's SELL branch.
    const { position: newPosition, realizedGainEur, realizedGainPct } = applySell(
      unitySeed.position,
      { shares: 100, priceEur: price },
      price,
      portfolioSeed.totalValueEur
    );
    const newPortfolioTotalEur = calcPortfolioTotalAfterSell(portfolioSeed.totalValueEur);

    // Position layer
    expect(newPosition.shares).toBe(802);
    expect(newPosition.averageCostEur).toBe(27.76); // unchanged — weighted-average SELL convention
    expect(newPosition.valueEur).toBeCloseTo(32448.92, 2);
    expect(newPosition.unrealizedReturnPct).toBeCloseTo(45.75, 2); // unchanged — price & avg cost both unchanged
    expect(realizedGainEur).toBeCloseTo(1270, 2);
    expect(realizedGainPct).toBeCloseTo(45.75, 2);

    // Portfolio layer — total preserved (cash-inclusive convention)
    expect(newPortfolioTotalEur).toBe(portfolioSeed.totalValueEur);
    expect(newPosition.portfolioWeightPct).toBeCloseTo(52.1, 1); // down from 58.6%

    // 2. Feed the REAL post-transaction state through the REAL engine.
    const input: EngineInput = {
      position: newPosition,
      portfolioTotalEur: newPortfolioTotalEur,
      executionPriceEur: price,
      strategy: unitySeed.strategy,
      thesisHealth: unitySeed.playbook.thesisHealth, // unchanged — no thesis-change scenario here
      scorecard: unityScorecard, // unchanged — no fundamentals/valuation/momentum change here
      actionZoneTemplates: unityActionZones,
    };
    const output = runDecisionEngine(input);

    // Concentration — de-escalates from SEVERELY_OVERWEIGHT to OVERWEIGHT
    expect(output.concentration.state).toBe("OVERWEIGHT");
    expect(output.concentration.tacticalInventory).toEqual({ aboveCoreMax: 152, maxSellToCore: 202 });

    // Target Position — capacity tiers all shrink by exactly the 100 shares sold
    expect(output.targetPosition.positionSizingState).toBe("OVERWEIGHT");
    expect(output.targetPosition.weightShareRange).toEqual({ min: 616, max: 692 }); // unaffected by this position's size
    expect(output.targetPosition.feasibleStrategyRange).toEqual({ min: 616, max: 650 });
    expect(output.targetPosition.trimCapacity).toEqual({ minimum: 110, preferred: 152, maximumNormal: 186 });

    // Constraints — HC-001 still fires (52.1% still exceeds the 50% ceiling); thesis unchanged so HC-002 doesn't
    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(false);
    expect(output.thesis.health).toBe("INTACT");

    // Stance — de-escalates alongside concentration
    expect(output.stance).toBe("HOLD_TRIM");

    // Action zones — ADD stays blocked; TRIM_1/TRIM_2 de-escalate with concentration
    const zoneState = (type: string) => output.actionZones.find((z) => z.type === type)?.state;
    expect(zoneState("ADD")).toBe("INACTIVE");
    expect(zoneState("HOLD")).toBe("ACTIVE");
    expect(zoneState("TRIM_1")).toBe("WATCH");
    expect(zoneState("TRIM_2")).toBe("INACTIVE");

    // Existing trimSizing (old §21 model) — reported separately, not equated
    // with targetPosition.trimCapacity. It still numerically coincides with
    // the "preferred" tier for Unity's configuration (152 = 152) — a
    // standing, already-documented design question, not asserted as
    // equivalence here, just recorded as current behavior.
    expect(output.concentration.trimSizing).toEqual({
      level1: 46,
      level2: 53,
      level3: 53,
      maxTacticalTrim: 152,
    });
  });
});
