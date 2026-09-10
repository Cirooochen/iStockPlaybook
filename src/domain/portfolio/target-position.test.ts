// Target Position & Sizing Model — spec §21A. Covers both prerequisite #2
// (with-core branch) and prerequisite #3 (no-core + preferredTargetWeight).
import { describe, expect, it } from "vitest";
import { deriveTargetPosition, resolveCoreShareRange } from "@/domain/portfolio/target-position";

describe("deriveTargetPosition — Unity baseline", () => {
  it("matches the approved B.5.1 Resolution figures exactly", () => {
    const result = deriveTargetPosition({
      currentShares: 902,
      currentWeightPct: 58.6,
      portfolioTotalEur: 62280,
      priceEur: 40.46,
      targetWeightMinPct: 40,
      targetWeightMaxPct: 45,
      coreShareRange: { min: 600, max: 650 },
    });

    expect(result.weightShareRange).toEqual({ min: 616, max: 692 });
    expect(result.feasibleStrategyRange).toEqual({ min: 616, max: 650 });
    expect(result.strategyAlignment).toBe("ALIGNED");
    expect(result.positionSizingState).toBe("OVERWEIGHT");
    expect(result.preferredTargetShares).toBe(650);
    expect(result.trimCapacity).toEqual({ minimum: 210, preferred: 252, maximumNormal: 286 });
    // Overweight — no add capacity in the current direction.
    expect(result.addCapacity).toEqual({ minimum: 0, preferred: 0, maximumNormal: 0 });
  });
});

describe("deriveTargetPosition — Weight-Share Range rounding", () => {
  it("is inclusive at exactly the target weight boundaries (WITHIN_TARGET)", () => {
    // portfolioTotal=100000, price=10 -> weightShareRange = [2000, 3000] exactly
    const base = {
      portfolioTotalEur: 100000,
      priceEur: 10,
      targetWeightMinPct: 20,
      targetWeightMaxPct: 30,
      coreShareRange: { min: 1900, max: 3100 },
    };

    const atMin = deriveTargetPosition({ ...base, currentShares: 2000, currentWeightPct: 20 });
    expect(atMin.weightShareRange).toEqual({ min: 2000, max: 3000 });
    expect(atMin.positionSizingState).toBe("WITHIN_TARGET");

    const atMax = deriveTargetPosition({ ...base, currentShares: 3000, currentWeightPct: 30 });
    expect(atMax.positionSizingState).toBe("WITHIN_TARGET");
  });

  it("rounds the lower bound UP (ceil) so it never understates the weight floor", () => {
    // 100000 * 0.20 / 7 = 2857.142... -> ceil = 2858 (2857 would round to 19.999%, below target)
    const result = deriveTargetPosition({
      currentShares: 2858,
      currentWeightPct: 20,
      portfolioTotalEur: 100000,
      priceEur: 7,
      targetWeightMinPct: 20,
      targetWeightMaxPct: 30,
      coreShareRange: { min: 2000, max: 4500 },
    });

    expect(result.weightShareRange.min).toBe(2858);
    expect((2858 * 7) / 100000).toBeGreaterThanOrEqual(0.2);
    expect((2857 * 7) / 100000).toBeLessThan(0.2); // confirms floor would have violated the floor
  });

  it("rounds the upper bound DOWN (floor) so it never overstates the weight ceiling", () => {
    // 100000 * 0.30 / 7 = 4285.714... -> floor = 4285 (4286 would round to 30.002%, above target)
    const result = deriveTargetPosition({
      currentShares: 4285,
      currentWeightPct: 30,
      portfolioTotalEur: 100000,
      priceEur: 7,
      targetWeightMinPct: 20,
      targetWeightMaxPct: 30,
      coreShareRange: { min: 2000, max: 4500 },
    });

    expect(result.weightShareRange.max).toBe(4285);
    expect((4285 * 7) / 100000).toBeLessThanOrEqual(0.3);
    expect((4286 * 7) / 100000).toBeGreaterThan(0.3); // confirms ceil would have violated the ceiling
  });
});

describe("deriveTargetPosition — Strategy Alignment", () => {
  // weightShareRange = [400, 600] throughout (portfolioTotal=100000, price=20, target 8-12%)
  const weightRangeInput = {
    portfolioTotalEur: 100000,
    priceEur: 20,
    targetWeightMinPct: 8,
    targetWeightMaxPct: 12,
  };

  it("ALIGNED when the weight and core ranges intersect", () => {
    const result = deriveTargetPosition({
      ...weightRangeInput,
      currentShares: 900,
      currentWeightPct: 18,
      coreShareRange: { min: 500, max: 700 },
    });

    expect(result.feasibleStrategyRange).toEqual({ min: 500, max: 600 });
    expect(result.strategyAlignment).toBe("ALIGNED");
    expect(result.preferredTargetShares).not.toBeNull();
  });

  it("CONFLICTING when the ranges do not intersect — no preferred target is invented", () => {
    const result = deriveTargetPosition({
      ...weightRangeInput,
      currentShares: 900,
      currentWeightPct: 18,
      coreShareRange: { min: 700, max: 800 }, // entirely above weightShareRange.max (600)
    });

    expect(result.strategyAlignment).toBe("CONFLICTING");
    expect(result.preferredTargetShares).toBeNull();
    expect(result.trimCapacity.preferred).toBeNull();
    // Minimum/Maximum still compute — they don't depend on alignment.
    expect(result.trimCapacity.minimum).toBe(300); // 900 - 600
    expect(() => result.trimCapacity.maximumNormal).not.toThrow();
  });
});

describe("deriveTargetPosition — OVERWEIGHT capacity (non-Unity, generic)", () => {
  it("produces distinct, monotonic minimum/preferred/maximumNormal trim tiers", () => {
    // weightShareRange = [400, 600]; coreShareRange = [500, 550] (core is the
    // tighter upper constraint here, unlike Unity where it's also tighter —
    // chosen to prove the model isn't hardcoded to Unity's specific ratios).
    const result = deriveTargetPosition({
      currentShares: 900,
      currentWeightPct: 18,
      portfolioTotalEur: 100000,
      priceEur: 20,
      targetWeightMinPct: 8,
      targetWeightMaxPct: 12,
      coreShareRange: { min: 500, max: 550 },
    });

    expect(result.positionSizingState).toBe("OVERWEIGHT");
    expect(result.feasibleStrategyRange).toEqual({ min: 500, max: 550 });
    expect(result.preferredTargetShares).toBe(550);
    expect(result.trimCapacity).toEqual({ minimum: 300, preferred: 350, maximumNormal: 400 });
    expect(result.trimCapacity.minimum).toBeLessThanOrEqual(result.trimCapacity.preferred!);
    expect(result.trimCapacity.preferred).toBeLessThanOrEqual(result.trimCapacity.maximumNormal);
  });
});

describe("deriveTargetPosition — UNDERWEIGHT capacity, preferred target deterministically available", () => {
  it("produces distinct, monotonic minimum/preferred/maximumNormal add tiers", () => {
    const result = deriveTargetPosition({
      currentShares: 300,
      currentWeightPct: 6,
      portfolioTotalEur: 100000,
      priceEur: 20,
      targetWeightMinPct: 8,
      targetWeightMaxPct: 12,
      coreShareRange: { min: 500, max: 550 },
    });

    expect(result.positionSizingState).toBe("UNDERWEIGHT");
    expect(result.strategyAlignment).toBe("ALIGNED");
    expect(result.preferredTargetShares).toBe(500); // clamps UP into the feasible range
    expect(result.addCapacity).toEqual({ minimum: 100, preferred: 200, maximumNormal: 250 });
    expect(result.addCapacity.minimum).toBeLessThanOrEqual(result.addCapacity.preferred!);
    expect(result.addCapacity.preferred).toBeLessThanOrEqual(result.addCapacity.maximumNormal);
  });
});

describe("deriveTargetPosition — WITHIN_TARGET behavior", () => {
  it("reports no mandatory minimum/preferred adjustment, but still exposes headroom", () => {
    // currentShares=520 sits inside both weightShareRange [400,600] and
    // feasibleStrategyRange [500,550] -> already "preferred", nothing to do,
    // but maximumNormal still reports real headroom in both directions.
    const result = deriveTargetPosition({
      currentShares: 520,
      currentWeightPct: 10.4,
      portfolioTotalEur: 100000,
      priceEur: 20,
      targetWeightMinPct: 8,
      targetWeightMaxPct: 12,
      coreShareRange: { min: 500, max: 550 },
    });

    expect(result.positionSizingState).toBe("WITHIN_TARGET");
    expect(result.preferredTargetShares).toBe(520); // clamp is a no-op — already inside feasible range
    expect(result.trimCapacity).toEqual({ minimum: 0, preferred: 0, maximumNormal: 20 });
    expect(result.addCapacity).toEqual({ minimum: 0, preferred: 0, maximumNormal: 30 });
  });
});

describe("deriveTargetPosition — no Core Share Range provided", () => {
  // weightShareRange = [400, 600] throughout (portfolioTotal=100000, price=20, target 8-12%)
  const noCoreInput = {
    portfolioTotalEur: 100000,
    priceEur: 20,
    targetWeightMinPct: 8,
    targetWeightMaxPct: 12,
  };

  it("reports NOT_APPLICABLE alignment and defaults the feasible range to the weight range", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
      // no coreShareRange
    });

    expect(result.strategyAlignment).toBe("NOT_APPLICABLE");
    expect(result.feasibleStrategyRange).toEqual(result.weightShareRange);
  });

  it("uses the explicit preferredTargetWeightPct when configured", () => {
    // 100000 * 0.09 / 20 = 450 (distinct from the 500 midpoint, to prove
    // the explicit value is actually used, not the fallback)
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
      preferredTargetWeightPct: 9,
    });

    expect(result.preferredTargetShares).toBe(450);
    expect(result.trimCapacity.preferred).toBe(450); // 900 - 450
  });

  it("falls back to the midpoint of the target weight range when no preference is configured", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
      // no preferredTargetWeightPct
    });

    // midpoint(400, 600) = 500
    expect(result.preferredTargetShares).toBe(500);
  });

  it("accepts a preferred target exactly at the lower target-weight bound", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
      preferredTargetWeightPct: 8, // === targetWeightMinPct
    });

    expect(result.preferredTargetShares).toBe(result.weightShareRange.min);
  });

  it("accepts a preferred target exactly at the upper target-weight bound", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
      preferredTargetWeightPct: 12, // === targetWeightMaxPct
    });

    expect(result.preferredTargetShares).toBe(result.weightShareRange.max);
  });

  it("rejects a preferred target outside the target weight range rather than silently clamping", () => {
    expect(() =>
      deriveTargetPosition({
        ...noCoreInput,
        currentShares: 900,
        currentWeightPct: 18,
        preferredTargetWeightPct: 15, // above targetWeightMaxPct (12)
      })
    ).toThrow(/preferredTargetWeightPct/);

    expect(() =>
      deriveTargetPosition({
        ...noCoreInput,
        currentShares: 300,
        currentWeightPct: 6,
        preferredTargetWeightPct: 5, // below targetWeightMinPct (8)
      })
    ).toThrow(/preferredTargetWeightPct/);
  });

  it("generic OVERWEIGHT example: distinct, monotonic trim tiers, midpoint fallback", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 900,
      currentWeightPct: 18,
    });

    expect(result.positionSizingState).toBe("OVERWEIGHT");
    expect(result.trimCapacity).toEqual({ minimum: 300, preferred: 400, maximumNormal: 500 });
    expect(result.trimCapacity.minimum).toBeLessThanOrEqual(result.trimCapacity.preferred!);
    expect(result.trimCapacity.preferred).toBeLessThanOrEqual(result.trimCapacity.maximumNormal);
  });

  it("generic UNDERWEIGHT example: distinct, monotonic add tiers, midpoint fallback", () => {
    const result = deriveTargetPosition({
      ...noCoreInput,
      currentShares: 300,
      currentWeightPct: 6,
    });

    expect(result.positionSizingState).toBe("UNDERWEIGHT");
    expect(result.addCapacity).toEqual({ minimum: 100, preferred: 200, maximumNormal: 300 });
    expect(result.addCapacity.minimum).toBeLessThanOrEqual(result.addCapacity.preferred!);
    expect(result.addCapacity.preferred).toBeLessThanOrEqual(result.addCapacity.maximumNormal);
  });
});

describe("resolveCoreShareRange — core range must be a pair, not invented", () => {
  it("both absent -> valid no-core strategy (undefined)", () => {
    expect(resolveCoreShareRange(undefined, undefined)).toBeUndefined();
  });

  it("both present -> valid core range", () => {
    expect(resolveCoreShareRange(600, 650)).toEqual({ min: 600, max: 650 });
  });

  it("only coreSharesMin present -> invalid configuration, rejected", () => {
    expect(() => resolveCoreShareRange(600, undefined)).toThrow(
      /coreSharesMin and coreSharesMax must both be present or both be absent/
    );
  });

  it("only coreSharesMax present -> invalid configuration, rejected", () => {
    expect(() => resolveCoreShareRange(undefined, 650)).toThrow(
      /coreSharesMin and coreSharesMax must both be present or both be absent/
    );
  });
});
