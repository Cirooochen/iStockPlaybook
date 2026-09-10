// B.5.2B — BUY Transaction Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.2b-buy-report.md.
//
// Validates propagation, not just isolated formulas: the BUY goes through
// the real applyBuy()/portfolio-total-preservation path (the same one
// PlaybookClientShell.handleTransaction uses), and the resulting Position
// + preserved portfolioTotalEur are then fed through the real
// runDecisionEngine() — not a hand-constructed post-buy state.
import { describe, expect, it } from "vitest";
import { applyBuy, calcPortfolioTotalAfterBuy } from "@/domain/portfolio/accounting";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";

describe("B.5.2B — BUY 50 Unity shares propagates correctly end to end", () => {
  it("shares/avg-cost/weight/total/concentration/stance/zones all update consistently", () => {
    const price = unitySeed.market.executionPriceEur;

    // 1. Real transaction path — mirrors PlaybookClientShell.handleTransaction's BUY branch.
    const newPosition = applyBuy(
      unitySeed.position,
      { shares: 50, priceEur: price },
      price,
      portfolioSeed.totalValueEur
    );
    const newPortfolioTotalEur = calcPortfolioTotalAfterBuy(portfolioSeed.totalValueEur);

    // Position layer — buying at a price above the existing average cost
    // (€40.46 > €27.76) dilutes the blended average cost upward, which in
    // turn reduces the % unrealized return, even though price didn't move
    // and the original shares' euro gain is unchanged. Expected accounting
    // behavior, not a bug.
    expect(newPosition.shares).toBe(952);
    expect(newPosition.averageCostEur).toBeCloseTo(28.43, 2);
    expect(newPosition.averageCostEur).toBeGreaterThan(unitySeed.position.averageCostEur);
    expect(newPosition.valueEur).toBeCloseTo(38517.92, 2);
    expect(newPosition.unrealizedReturnPct).toBeCloseTo(42.33, 2);
    expect(newPosition.unrealizedReturnPct).toBeLessThan(unitySeed.position.unrealizedReturnPct); // diluted

    // Portfolio layer — total preserved (cash-inclusive convention), weight increases
    expect(newPortfolioTotalEur).toBe(portfolioSeed.totalValueEur);
    expect(newPosition.portfolioWeightPct).toBeCloseTo(61.85, 1); // up from 58.6%

    // 2. Feed the REAL post-transaction state through the REAL engine.
    const input: EngineInput = {
      position: newPosition,
      portfolioTotalEur: newPortfolioTotalEur,
      executionPriceEur: price,
      strategy: unitySeed.strategy,
      thesisHealth: unitySeed.playbook.thesisHealth, // unchanged
      scorecard: unityScorecard, // unchanged
      actionZoneTemplates: unityActionZones,
    };
    const output = runDecisionEngine(input);

    // Concentration — stays SEVERELY_OVERWEIGHT (61.85% > 45% × 1.30 = 58.5%),
    // no tier transition, but the underlying figures worsen.
    expect(output.concentration.state).toBe("SEVERELY_OVERWEIGHT");
    expect(output.concentration.tacticalInventory).toEqual({ aboveCoreMax: 302, maxSellToCore: 352 });
    expect(output.concentration.sharesToTarget).toBe(260); // up from 210

    // Target Position — capacity tiers all grow by exactly the 50 shares bought
    expect(output.targetPosition.positionSizingState).toBe("OVERWEIGHT");
    expect(output.targetPosition.weightShareRange).toEqual({ min: 616, max: 692 });
    expect(output.targetPosition.feasibleStrategyRange).toEqual({ min: 616, max: 650 });
    expect(output.targetPosition.trimCapacity).toEqual({ minimum: 260, preferred: 302, maximumNormal: 336 });
    expect(output.targetPosition.addCapacity).toEqual({ minimum: 0, preferred: 0, maximumNormal: 0 });

    // Constraints — HC-001 was already triggered pre-BUY (58.6% > 50%) and
    // remains triggered post-BUY (61.85% > 50%); this BUY does not change
    // its status. Note: the engine correctly computes this, but nothing in
    // AddTransactionModal actually blocks a BUY when HC-001/accumulationEnabled
    // is false — that is a separate, open product-design question, not
    // asserted/enforced here (see the B.5.2B report).
    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(false);
    expect(output.thesis.health).toBe("INTACT");

    // Stance — no severity-tier crossing occurred, so the stance correctly
    // does not change (not forced to change here — this is the actual output).
    expect(output.stance).toBe("HOLD_GRADUALLY_TRIM");

    // Action zones — ADD stays blocked; TRIM_1/TRIM_2 stay at their
    // SEVERELY_OVERWEIGHT-tier states (no de-escalation, unlike B.5.2A's SELL).
    const zoneState = (type: string) => output.actionZones.find((z) => z.type === type)?.state;
    expect(zoneState("ADD")).toBe("INACTIVE");
    expect(zoneState("HOLD")).toBe("ACTIVE");
    expect(zoneState("TRIM_1")).toBe("ACTIVE");
    expect(zoneState("TRIM_2")).toBe("WATCH");

    // Existing trimSizing (old §21 model) — reported separately, not
    // equated with targetPosition.trimCapacity. Still numerically
    // coincides with the "preferred" tier for Unity's configuration
    // (302 = 302) — the same standing, already-documented design question,
    // now larger, not newly raised here.
    expect(output.concentration.trimSizing).toEqual({
      level1: 91,
      level2: 106,
      level3: 105,
      maxTacticalTrim: 302,
    });
  });
});
