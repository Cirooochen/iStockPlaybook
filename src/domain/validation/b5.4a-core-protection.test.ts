// B.5.4A — Core Protection with Healthy Thesis
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.4a-core-protection-report.md.
//
// Validates HC-003 (transaction-time core-breach protection) directly,
// and separately validates targetPosition.maximumNormalTrim (strategic
// capacity) at the same starting positions — these are different layers
// and are asserted separately, not equated.
import { describe, expect, it } from "vitest";
import { checkHC003 } from "@/domain/playbook/hard-constraints";
import { runDecisionEngine } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";

const coreMin = unitySeed.strategy.coreSharesMin as number; // Unity always configures a core range

function targetPositionAt(shares: number) {
  const price = unitySeed.market.executionPriceEur;
  const valueEur = shares * price;
  const output = runDecisionEngine({
    position: {
      shares,
      averageCostEur: 27.76,
      valueEur,
      unrealizedReturnPct: ((price - 27.76) / 27.76) * 100,
      portfolioWeightPct: (valueEur / portfolioSeed.totalValueEur) * 100,
    },
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: price,
    strategy: unitySeed.strategy,
    thesisHealth: "INTACT", // healthy thesis only — B.5.4A scope
    scorecard: unityScorecard,
    actionZoneTemplates: unityActionZones,
  });
  return output.targetPosition;
}

describe("B.5.4A — HC-003 core-breach protection, healthy thesis", () => {
  it("Case A: 650 shares, sell 50 (remaining 600) — allowed, exactly at the core minimum", () => {
    const result = checkHC003(50, 650, coreMin, "INTACT");
    expect(result.triggered).toBe(false);
  });

  it("Case B: 650 shares, sell 51 (remaining 599) — blocked, breaches the core minimum by 1", () => {
    const result = checkHC003(51, 650, coreMin, "INTACT");
    expect(result.triggered).toBe(true);
  });

  it("Case C: 600 shares, sell 1 (remaining 599) — blocked, already at the core minimum", () => {
    const result = checkHC003(1, 600, coreMin, "INTACT");
    expect(result.triggered).toBe(true);
  });

  it("targetPosition.maximumNormalTrim at 650 shares is MORE conservative than HC-003 alone (34 vs. 50) — different layers, not merged", () => {
    // HC-003 only protects the 600-share core floor -> permits selling up
    // to 50 shares from 650. targetPosition.maximumNormalTrim also
    // protects the 40% weight-target floor (616 shares here, which is
    // HIGHER than the 600-share core floor for Unity's configuration) ->
    // only 34 shares. HC-003 allows a sell that exceeds the strategic
    // "normal" capacity — this is an intentional consequence of the
    // approved B.5.1 Resolution formula (maximumNormalTrim is bounded by
    // the stricter of the two floors), not a bug, and not fixed here.
    const capacity = targetPositionAt(650);
    expect(capacity.trimCapacity.maximumNormal).toBe(34);

    const maxHc003AllowsSelling = 650 - coreMin; // 50
    expect(maxHc003AllowsSelling).toBeGreaterThan(capacity.trimCapacity.maximumNormal);
  });

  it("at 600 shares, HC-003 and maximumNormalTrim agree — no further selling in either layer", () => {
    const capacity = targetPositionAt(600);
    expect(capacity.trimCapacity.maximumNormal).toBe(0);

    const maxHc003AllowsSelling = 600 - coreMin; // 0
    expect(maxHc003AllowsSelling).toBe(capacity.trimCapacity.maximumNormal);
  });
});
