// B.5.7 — Generalization Test
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.7-generalization-report.md.
//
// Validates that runDecisionEngine() generalizes beyond Unity, using
// three fully synthetic strategies with no relationship to Unity's
// numbers (40/45/50%, 600/650/902 shares, 40.46/27.76 EUR). Real
// runDecisionEngine() calls throughout — no hand-derived engine output.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { checkHC003 } from "@/domain/playbook/hard-constraints";
import type { ActionZone, ActionZoneType, Position, Scorecard, Strategy } from "@/types/playbook";

// Minimal, generic action-zone templates — only `type` and `state` are
// read/overwritten by the engine; title/summary are irrelevant seed copy,
// so they carry no Unity-specific text here.
const ZONE_TYPES: ActionZoneType[] = ["ADD", "HOLD", "TRIM_1", "TRIM_2", "THESIS_REVIEW"];
function makeZoneTemplates(): ActionZone[] {
  return ZONE_TYPES.map((type) => ({ type, state: "INACTIVE", title: type, summary: "" }));
}

const genericScorecard: Scorecard = {
  fundamentals: { score: 6, state: "Neutral" },
  valuation: { score: 6, state: "Neutral" },
  momentum: { score: 6, state: "Neutral" },
  thesisHealth: { score: 6, state: "Neutral" },
  positionFit: { score: 6, state: "Neutral" },
  concentrationRisk: { score: 6, state: "Neutral" },
};

function zoneState(output: ReturnType<typeof runDecisionEngine>, type: ActionZoneType) {
  return output.actionZones.find((z) => z.type === type)?.state;
}

// ---------------------------------------------------------------------------
// Strategy A — "ZeroCo": brand-new position, weight-only strategy, no core
// range, no explicit preferredTargetWeightPct (exercises the midpoint
// default-policy fallback).
// ---------------------------------------------------------------------------
describe("B.5.7.A — ZeroCo: new position (0 shares), weight-only, no core range", () => {
  const price = 25;
  const portfolioTotalEur = 50_000;
  const strategy: Strategy = {
    horizon: "long-term",
    shortTermMaxWeightPct: 15,
    mediumTermTargetMinPct: 8,
    mediumTermTargetMaxPct: 12,
    tacticalSharesMin: 100,
    tacticalSharesMax: 150,
  };
  const position: Position = {
    shares: 0,
    averageCostEur: 0,
    valueEur: 0,
    unrealizedReturnPct: 0,
    portfolioWeightPct: 0,
  };
  const input: EngineInput = {
    position,
    portfolioTotalEur,
    executionPriceEur: price,
    strategy,
    thesisHealth: "STRENGTHENING",
    scorecard: genericScorecard,
    actionZoneTemplates: makeZoneTemplates(),
  };
  const output = runDecisionEngine(input);

  it("targetPosition: UNDERWEIGHT sizing, midpoint-fallback preferred target, monotonic add capacity", () => {
    expect(output.targetPosition.positionSizingState).toBe("UNDERWEIGHT");
    expect(output.targetPosition.weightShareRange).toEqual({ min: 160, max: 240 });
    expect(output.targetPosition.strategyAlignment).toBe("NOT_APPLICABLE"); // no core range
    expect(output.targetPosition.feasibleStrategyRange).toEqual({ min: 160, max: 240 });
    expect(output.targetPosition.preferredTargetShares).toBe(200); // midpoint(160,240), no preferredTargetWeightPct configured
    expect(output.targetPosition.addCapacity).toEqual({ minimum: 160, preferred: 200, maximumNormal: 240 });
    expect(output.targetPosition.trimCapacity).toEqual({ minimum: 0, preferred: 0, maximumNormal: 0 });
  });

  it("concentration.state is WITHIN_TARGET (0% <= 12% target max) — distinct from positionSizingState's UNDERWEIGHT, per the known two-layer model", () => {
    expect(output.concentration.state).toBe("WITHIN_TARGET");
  });

  it("HC-001/HC-002 clear, accumulation enabled", () => {
    expect(output.constraints.hc001.triggered).toBe(false);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(true);
  });

  it("ADD is ACTIVE — accumulation enabled, WITHIN_TARGET concentration, STRENGTHENING is thesis-eligible", () => {
    expect(zoneState(output, "ADD")).toBe("ACTIVE");
  });

  it("stance is HOLD, TRIM zones are INACTIVE, THESIS_REVIEW is CONDITIONAL — a zero-share new position does not crash or misclassify", () => {
    expect(output.stance).toBe("HOLD");
    expect(zoneState(output, "TRIM_1")).toBe("INACTIVE");
    expect(zoneState(output, "TRIM_2")).toBe("INACTIVE");
    expect(zoneState(output, "THESIS_REVIEW")).toBe("CONDITIONAL");
  });
});

// ---------------------------------------------------------------------------
// Strategy B — "Beta Corp": existing small UNDERWEIGHT position, a
// different portfolio size and price from both Unity and Strategy A,
// weight-only strategy, explicit preferredTargetWeightPct.
// ---------------------------------------------------------------------------
describe("B.5.7.B — Beta Corp: small UNDERWEIGHT position, weight-only, explicit preferredTargetWeightPct", () => {
  const price = 120;
  const portfolioTotalEur = 200_000;
  const strategy: Strategy = {
    horizon: "3 years",
    shortTermMaxWeightPct: 10,
    mediumTermTargetMinPct: 5,
    mediumTermTargetMaxPct: 8,
    tacticalSharesMin: 20,
    tacticalSharesMax: 30,
    preferredTargetWeightPct: 6,
  };
  const position: Position = {
    shares: 50,
    averageCostEur: 100,
    valueEur: 6_000,
    unrealizedReturnPct: 20,
    portfolioWeightPct: 3, // < 5% target min → UNDERWEIGHT
  };
  const input: EngineInput = {
    position,
    portfolioTotalEur,
    executionPriceEur: price,
    strategy,
    thesisHealth: "INTACT",
    scorecard: genericScorecard,
    actionZoneTemplates: makeZoneTemplates(),
  };
  const output = runDecisionEngine(input);

  it("targetPosition: UNDERWEIGHT sizing, explicit preferredTargetWeightPct correctly scaled to this price/portfolio, monotonic add capacity", () => {
    expect(output.targetPosition.positionSizingState).toBe("UNDERWEIGHT");
    expect(output.targetPosition.weightShareRange).toEqual({ min: 84, max: 133 });
    expect(output.targetPosition.strategyAlignment).toBe("NOT_APPLICABLE");
    // 6% of €200,000 / €120 = 100 shares — not Unity's 40.46/27.76 price/cost scale.
    expect(output.targetPosition.preferredTargetShares).toBe(100);
    expect(output.targetPosition.addCapacity).toEqual({ minimum: 34, preferred: 50, maximumNormal: 83 });
  });

  it("concentration.state is WITHIN_TARGET, HC-001/002 clear, accumulation enabled", () => {
    expect(output.concentration.state).toBe("WITHIN_TARGET");
    expect(output.constraints.hc001.triggered).toBe(false);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(true);
  });

  it("ADD is ACTIVE — INTACT is thesis-eligible and concentration is WITHIN_TARGET", () => {
    expect(zoneState(output, "ADD")).toBe("ACTIVE");
  });

  it("stance is HOLD, TRIM zones INACTIVE", () => {
    expect(output.stance).toBe("HOLD");
    expect(zoneState(output, "TRIM_1")).toBe("INACTIVE");
    expect(zoneState(output, "TRIM_2")).toBe("INACTIVE");
  });
});

// ---------------------------------------------------------------------------
// Strategy C — "Gamma Semi": existing OVERWEIGHT position, a target range,
// concentration ceiling, and core range all different from Unity's, thesis
// WEAKENING (exercises the REDUCE_RISK stance branch and HC-003 generically).
// ---------------------------------------------------------------------------
describe("B.5.7.C — Gamma Semi: OVERWEIGHT position, own target/core range, thesis WEAKENING", () => {
  const price = 10;
  const portfolioTotalEur = 500_000;
  const strategy: Strategy = {
    horizon: "5+ years",
    shortTermMaxWeightPct: 35, // deliberately decoupled from the 25% target max
    mediumTermTargetMinPct: 18,
    mediumTermTargetMaxPct: 25,
    coreSharesMin: 9_500,
    coreSharesMax: 10_500,
    tacticalSharesMin: 8_000,
    tacticalSharesMax: 9_000,
  };
  const position: Position = {
    shares: 15_000,
    averageCostEur: 8,
    valueEur: 150_000,
    unrealizedReturnPct: 25,
    portfolioWeightPct: 30, // > 28.75% (25 * moderateMultiplier) and <= 32.5% (25 * severeMultiplier) → OVERWEIGHT
  };
  const input: EngineInput = {
    position,
    portfolioTotalEur,
    executionPriceEur: price,
    strategy,
    thesisHealth: "WEAKENING",
    scorecard: genericScorecard,
    actionZoneTemplates: makeZoneTemplates(),
  };
  const output = runDecisionEngine(input);

  it("targetPosition: OVERWEIGHT sizing, ALIGNED with this strategy's own core range, monotonic trim capacity", () => {
    expect(output.targetPosition.positionSizingState).toBe("OVERWEIGHT");
    expect(output.targetPosition.weightShareRange).toEqual({ min: 9_000, max: 12_500 });
    expect(output.targetPosition.feasibleStrategyRange).toEqual({ min: 9_500, max: 10_500 });
    expect(output.targetPosition.strategyAlignment).toBe("ALIGNED");
    expect(output.targetPosition.preferredTargetShares).toBe(10_500);
    expect(output.targetPosition.trimCapacity).toEqual({ minimum: 2_500, preferred: 4_500, maximumNormal: 5_500 });
  });

  it("concentration.state is OVERWEIGHT, derived from this strategy's own 25% target max — not Unity's 45%", () => {
    expect(output.concentration.state).toBe("OVERWEIGHT");
  });

  it("HC-001 does NOT fire even though OVERWEIGHT — this strategy's 35% short-term ceiling is decoupled from its 25% target max (unlike Unity, where they always co-occur; see B.5.6)", () => {
    expect(output.constraints.hc001.triggered).toBe(false);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(true);
  });

  it("ADD is INACTIVE for two independent reasons — OVERWEIGHT concentration AND WEAKENING is thesis-ineligible — even though accumulation itself is enabled", () => {
    expect(zoneState(output, "ADD")).toBe("INACTIVE");
  });

  it("stance is REDUCE_RISK — WEAKENING + OVERWEIGHT, generalized to this strategy's own thresholds", () => {
    expect(output.stance).toBe("REDUCE_RISK");
  });

  it("TRIM_1 is WATCH, TRIM_2 is INACTIVE (OVERWEIGHT, not SEVERELY_OVERWEIGHT)", () => {
    expect(zoneState(output, "TRIM_1")).toBe("WATCH");
    expect(zoneState(output, "TRIM_2")).toBe("INACTIVE");
  });

  it("HC-003 protects this strategy's own 9,500-share core minimum under WEAKENING, using its own core range — not Unity's 600", () => {
    expect(checkHC003(5_500, 15_000, 9_500, "WEAKENING").triggered).toBe(false); // remaining 9,500 — exactly at the core floor
    expect(checkHC003(5_501, 15_000, 9_500, "WEAKENING").triggered).toBe(true); // remaining 8,999 — breaches it
  });
});

// ---------------------------------------------------------------------------
// Structural check — no hidden Unity-specific numbers in generic domain code
// ---------------------------------------------------------------------------
describe("B.5.7 — no hidden Unity-specific numbers in decision/rule logic", () => {
  const domainFiles = [
    "src/domain/engine.ts",
    "src/domain/portfolio/concentration.ts",
    "src/domain/portfolio/target-position.ts",
    "src/domain/playbook/hard-constraints.ts",
    "src/domain/playbook/stance-rules.ts",
    "src/domain/playbook/action-zones.ts",
    "src/domain/playbook/scoring.ts",
    "src/domain/thesis/thesis.ts",
    "src/domain/signals/signals.ts",
    "src/config/ruleset-v0.1.ts",
  ];
  // Unity's own position figures (§33 Unity Baseline: 902 shares, €27.76
  // average cost, €40.46 execution price) never legitimately appear in
  // generic domain/config code — unlike ratios (1.15, 200, 0.55) which are
  // genuinely generic and would produce false positives if grepped for.
  const unityOnlyFigures = ["902", "27.76", "40.46"];

  it.each(domainFiles)("%s contains none of Unity's specific position numbers", (file) => {
    const source = readFileSync(path.resolve(process.cwd(), file), "utf-8");
    for (const figure of unityOnlyFigures) {
      expect(source).not.toContain(figure);
    }
  });
});
