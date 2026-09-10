// B.5.4B — Core Protection under Thesis Deterioration
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.4b-thesis-core-protection-report.md.
//
// Exercises the real checkHC003() function and the real
// runDecisionEngine() across all three thesis states for the same
// proposed transaction (650 shares, sell 100, remaining 550 — breaches
// both the 600-share core minimum and the 616-share
// weight-target-implied minimum).
//
// Approved rule (2026-09-09): HC-003 distinguishes WEAKENING from
// BROKEN. Core protection stays active under WEAKENING (thesis is under
// concern but not yet invalidated) and is removed only under BROKEN
// (the thesis supporting the core commitment is no longer valid).
import { describe, expect, it } from "vitest";
import { checkHC003 } from "@/domain/playbook/hard-constraints";
import { runDecisionEngine } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { ThesisHealth } from "@/types/playbook";

const coreMin = unitySeed.strategy.coreSharesMin as number; // Unity always configures a core range

function engineAt650(thesisHealth: ThesisHealth) {
  const price = unitySeed.market.executionPriceEur;
  const shares = 650;
  const valueEur = shares * price;
  return runDecisionEngine({
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
    thesisHealth,
    scorecard: unityScorecard,
    actionZoneTemplates: unityActionZones,
  });
}

describe("B.5.4B — HC-003 across thesis states (650 shares, sell 100, remaining 550)", () => {
  it("INTACT: HC-003 triggers — the sell is blocked", () => {
    const result = checkHC003(100, 650, coreMin, "INTACT");
    expect(result.triggered).toBe(true);
  });

  it("WEAKENING: HC-003 triggers — core protection remains active, same as INTACT", () => {
    const result = checkHC003(100, 650, coreMin, "WEAKENING");
    expect(result.triggered).toBe(true);
  });

  it("BROKEN: HC-003 does not trigger — the sell is allowed (thesis supporting the core is invalidated)", () => {
    const result = checkHC003(100, 650, coreMin, "BROKEN");
    expect(result.triggered).toBe(false);
  });
});

describe("B.5.4B — targetPosition is thesis-independent (does not silently change)", () => {
  it("maximumNormalTrim, positionSizingState, and concentration.state are identical across all three thesis states", () => {
    const intact = engineAt650("INTACT");
    const weakening = engineAt650("WEAKENING");
    const broken = engineAt650("BROKEN");

    for (const output of [intact, weakening, broken]) {
      expect(output.concentration.state).toBe("WITHIN_TARGET");
      expect(output.targetPosition.positionSizingState).toBe("WITHIN_TARGET");
      expect(output.targetPosition.trimCapacity.maximumNormal).toBe(34);
    }
  });
});

describe("B.5.4B — stance and action zones (unaffected by the HC-003 change — neither reads checkHC003)", () => {
  it("WEAKENING produces the SAME stance as INTACT here (HOLD) — the REDUCE_RISK rule only fires when also overweight", () => {
    expect(engineAt650("INTACT").stance).toBe("HOLD");
    expect(engineAt650("WEAKENING").stance).toBe("HOLD");
  });

  it("BROKEN escalates stance to THESIS_REVIEW, unlike WEAKENING", () => {
    expect(engineAt650("BROKEN").stance).toBe("THESIS_REVIEW");
  });

  it("ADD zone is INACTIVE under WEAKENING (spec §22 thesis-eligibility gate, implemented in B.5.5) and under BROKEN (HC-002)", () => {
    const zoneState = (output: ReturnType<typeof engineAt650>, type: string) =>
      output.actionZones.find((z) => z.type === type)?.state;

    // Superseded 2026-09-09 (B.5.5): before the spec §22 thesis-eligibility
    // gate was implemented, WEAKENING produced ADD = ACTIVE here because
    // only accumulationEnabled (HC-001/HC-002) was checked. WEAKENING now
    // fails the separate thesisEligible gate, independent of HC-002 (which
    // remains BROKEN-only). See docs/validation/b5.5-thesis-validation-report.md.
    expect(zoneState(engineAt650("WEAKENING"), "ADD")).toBe("INACTIVE");
    expect(zoneState(engineAt650("BROKEN"), "ADD")).toBe("INACTIVE");
  });

  it("THESIS_REVIEW action zone stays CONDITIONAL even when thesis is BROKEN and stance has already escalated — deriveActionZoneState takes no thesis input at all", () => {
    for (const thesis of ["INTACT", "WEAKENING", "BROKEN"] as ThesisHealth[]) {
      const output = engineAt650(thesis);
      expect(output.actionZones.find((z) => z.type === "THESIS_REVIEW")?.state).toBe("CONDITIONAL");
    }
  });
});
