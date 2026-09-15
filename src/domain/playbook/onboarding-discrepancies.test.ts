import { describe, expect, it } from "vitest";
import { DISCREPANCY_SEVERITY, deriveDiscrepancies, hasSeverity } from "@/domain/playbook/onboarding-discrepancies";

describe("deriveDiscrepancies", () => {
  it("returns nothing when current intention is unresolved", () => {
    expect(
      deriveDiscrepancies({
        currentIntention: null,
        thesisHealth: "INTACT",
        currentWeightPct: 10,
        concentrationStateIfConfirmedNow: "WITHIN_TARGET",
        proposedTargetMinPct: 10,
        proposedTargetMaxPct: 18,
        proposedCeilingPct: 23,
      })
    ).toEqual([]);
  });

  it("returns nothing when portfolio valuation isn't COMPLETE (currentWeightPct null)", () => {
    expect(
      deriveDiscrepancies({
        currentIntention: "BUILD",
        thesisHealth: "INTACT",
        currentWeightPct: null,
        concentrationStateIfConfirmedNow: null,
        proposedTargetMinPct: 10,
        proposedTargetMaxPct: 18,
        proposedCeilingPct: 23,
      })
    ).toEqual([]);
  });

  it("flags BUILD_INTENT_THESIS_BROKEN (HARD) when building with a BROKEN thesis", () => {
    const result = deriveDiscrepancies({
      currentIntention: "BUILD",
      thesisHealth: "BROKEN",
      currentWeightPct: 5,
      concentrationStateIfConfirmedNow: "WITHIN_TARGET",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result.map((d) => d.code)).toContain("BUILD_INTENT_THESIS_BROKEN");
    expect(DISCREPANCY_SEVERITY["BUILD_INTENT_THESIS_BROKEN"]).toBe("HARD");
  });

  it("flags BUILD_INTENT_ACCUMULATION_BLOCKED (HARD) when weight already exceeds the proposed ceiling", () => {
    const result = deriveDiscrepancies({
      currentIntention: "BUILD",
      thesisHealth: "INTACT",
      currentWeightPct: 30,
      concentrationStateIfConfirmedNow: "SEVERELY_OVERWEIGHT",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result.map((d) => d.code)).toEqual(["BUILD_INTENT_ACCUMULATION_BLOCKED"]);
    expect(DISCREPANCY_SEVERITY["BUILD_INTENT_ACCUMULATION_BLOCKED"]).toBe("HARD");
  });

  it("flags BUILD_INTENT_ALREADY_OVERWEIGHT (SOFT) when overweight but NOT past the ceiling", () => {
    // maxPct=18, ceiling=23: weight 20% is > maxPct*moderateMultiplier(1.15)=20.7? No —
    // choose a weight clearly OVERWEIGHT by concentration classification but still <= ceiling.
    const result = deriveDiscrepancies({
      currentIntention: "BUILD",
      thesisHealth: "INTACT",
      currentWeightPct: 22,
      concentrationStateIfConfirmedNow: "OVERWEIGHT",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result.map((d) => d.code)).toEqual(["BUILD_INTENT_ALREADY_OVERWEIGHT"]);
    expect(DISCREPANCY_SEVERITY["BUILD_INTENT_ALREADY_OVERWEIGHT"]).toBe("SOFT");
  });

  it("does not flag BUILD_INTENT_ALREADY_OVERWEIGHT when HARD already fired for the same BUILD intent", () => {
    const result = deriveDiscrepancies({
      currentIntention: "BUILD",
      thesisHealth: "INTACT",
      currentWeightPct: 30,
      concentrationStateIfConfirmedNow: "SEVERELY_OVERWEIGHT",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("BUILD_INTENT_ACCUMULATION_BLOCKED");
  });

  it("flags REDUCE_INTENT_WITHIN_TARGET (SOFT) when reducing while already within target", () => {
    const result = deriveDiscrepancies({
      currentIntention: "REDUCE",
      thesisHealth: "INTACT",
      currentWeightPct: 12,
      concentrationStateIfConfirmedNow: "WITHIN_TARGET",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result.map((d) => d.code)).toEqual(["REDUCE_INTENT_WITHIN_TARGET"]);
    expect(DISCREPANCY_SEVERITY["REDUCE_INTENT_WITHIN_TARGET"]).toBe("SOFT");
  });

  it("returns nothing for HOLD intent regardless of concentration state", () => {
    const result = deriveDiscrepancies({
      currentIntention: "HOLD",
      thesisHealth: "INTACT",
      currentWeightPct: 30,
      concentrationStateIfConfirmedNow: "SEVERELY_OVERWEIGHT",
      proposedTargetMinPct: 10,
      proposedTargetMaxPct: 18,
      proposedCeilingPct: 23,
    });
    expect(result).toEqual([]);
  });

  it("hasSeverity finds a HARD/SOFT code among a mixed list", () => {
    const discrepancies = [
      { code: "REDUCE_INTENT_WITHIN_TARGET" as const, message: "x" },
    ];
    expect(hasSeverity(discrepancies, "SOFT")).toBe(true);
    expect(hasSeverity(discrepancies, "HARD")).toBe(false);
  });
});
