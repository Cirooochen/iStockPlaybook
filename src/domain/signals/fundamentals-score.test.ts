// Phase E.2 — the generic scoreFundamentals() engine. Deliberately
// exercised with a SYNTHETIC FundamentalsTemplate, not
// GROWTH_SOFTWARE_TEMPLATE, to prove the engine is genuinely
// archetype-agnostic — see growth-software.test.ts for
// GROWTH_SOFTWARE-specific dimension tests.
import { describe, expect, it } from "vitest";
import { scoreFundamentals, deriveFundamentalsEvidenceScoredItem } from "@/domain/signals/fundamentals-score";
import type { FundamentalsComponentScore, FundamentalsScoreResult, FundamentalsTemplate, RawFundamentalsData } from "@/types/fundamentals";

function component(
  key: string,
  weight: number,
  score: (raw: RawFundamentalsData) => FundamentalsComponentScore
) {
  return { key, weight, score };
}

const RAW: RawFundamentalsData = {
  instrumentId: "TEST",
  periodType: "QUARTERLY",
  periods: [],
  guidanceEvidence: { status: "MISSING" },
  checkedAt: "2026-09-10T00:00:00.000Z",
  reportingCurrency: "USD",
  sharesOutstanding: { status: "MISSING" },
  sharesOutstandingByAccession: {},
};

describe("scoreFundamentals — component-level visibility and coverage math", () => {
  it("all components AVAILABLE -> SCORED, with a weighted blend", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [
        component("a", 0.6, () => ({ status: "AVAILABLE", rawValue: 1, score100: 80, asOf: "d1" })),
        component("b", 0.4, () => ({ status: "AVAILABLE", rawValue: 2, score100: 20, asOf: "d2" })),
      ],
    };

    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("SCORED");
    if (result.status === "SCORED") {
      // blended100 = 80*0.6 + 20*0.4 = 56 -> score = round(56/10) = 6, state "Neutral" (4-6 range)
      expect(result.overall).toEqual({ score: 6, state: "Neutral" });
      expect(result.coverage).toEqual({
        totalDefinedWeight: 1,
        applicableWeight: 1,
        availableWeight: 1,
        missingWeight: 0,
        availableWeightShare: 1,
      });
    }
  });

  it("a MISSING component redistributes weight over the remaining AVAILABLE ones, never fabricating a score", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [
        component("a", 0.5, () => ({ status: "AVAILABLE", rawValue: 1, score100: 90, asOf: "d1" })),
        component("b", 0.5, () => ({ status: "MISSING" })),
      ],
    };

    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("SCORED");
    if (result.status === "SCORED") {
      // Only "a" is available; blend renormalizes to 100% of availableWeight -> score100 = 90
      expect(result.overall).toEqual({ score: 9, state: "Positive" });
      expect(result.coverage).toEqual({
        totalDefinedWeight: 1,
        applicableWeight: 1,
        availableWeight: 0.5,
        missingWeight: 0.5,
        availableWeightShare: 0.5,
      });
    }
  });

  it("NOT_APPLICABLE is excluded from applicableWeight entirely, distinct from MISSING", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [
        component("a", 0.7, () => ({ status: "AVAILABLE", rawValue: 1, score100: 70, asOf: "d1" })),
        component("b", 0.3, () => ({ status: "NOT_APPLICABLE" })),
      ],
    };

    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("SCORED");
    if (result.status === "SCORED") {
      expect(result.coverage).toEqual({
        totalDefinedWeight: 1,
        applicableWeight: 0.7, // 1 - notApplicableWeight(0.3)
        availableWeight: 0.7,
        missingWeight: 0,
        availableWeightShare: 1, // fully covered once NOT_APPLICABLE is excluded
      });
    }
  });

  it("below the minimum-evidence gate -> INSUFFICIENT_DATA, never a fabricated low-confidence score", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [
        component("a", 0.2, () => ({ status: "AVAILABLE", rawValue: 1, score100: 50, asOf: "d1" })),
        component("b", 0.8, () => ({ status: "MISSING" })),
      ],
    };

    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    if (result.status === "INSUFFICIENT_DATA") {
      expect(result.coverage.availableWeightShare).toBeCloseTo(0.2, 10);
    }
    expect(result).not.toHaveProperty("overall");
  });

  it("every component carries key and weight on every status, MISSING and NOT_APPLICABLE included", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0,
      components: [
        component("missingOne", 0.3, () => ({ status: "MISSING" })),
        component("notApplicableOne", 0.2, () => ({ status: "NOT_APPLICABLE" })),
        component("availableOne", 0.5, () => ({ status: "AVAILABLE", rawValue: 5, score100: 60, asOf: "d" })),
      ],
    };

    const result = scoreFundamentals(template, RAW);
    expect(result.components).toEqual([
      { key: "missingOne", status: "MISSING", weight: 0.3 },
      { key: "notApplicableOne", status: "NOT_APPLICABLE", weight: 0.2 },
      { key: "availableOne", status: "AVAILABLE", rawValue: 5, score100: 60, weight: 0.5, asOf: "d" },
    ]);
  });

  it("is archetype-agnostic: the engine never references any specific dimension key", () => {
    // A template with dimension keys that look nothing like GROWTH_SOFTWARE's
    // (e.g. bank-flavored names) scores identically — proves the engine
    // itself carries no archetype-specific knowledge.
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE", // the archetype tag itself is just data the engine never inspects
      minimumAvailableWeightShare: 0.5,
      components: [
        component("netInterestMargin", 1.0, () => ({ status: "AVAILABLE", rawValue: 42, score100: 42, asOf: "d" })),
      ],
    };
    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("SCORED");
    if (result.status === "SCORED") {
      expect(result.overall).toEqual({ score: 4, state: "Neutral" });
    }
  });

  it("is deterministic: repeated calls on the same input produce the identical result", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [component("a", 1.0, () => ({ status: "AVAILABLE", rawValue: 1, score100: 55, asOf: "d" }))],
    };
    expect(scoreFundamentals(template, RAW)).toEqual(scoreFundamentals(template, RAW));
  });
});

describe("deriveFundamentalsEvidenceScoredItem — Phase E.3/E.4 (evidence availability separate from signal state)", () => {
  it("SCORED -> { status: 'SCORED', item: result.overall }, lossless", () => {
    const template: FundamentalsTemplate = {
      archetype: "GROWTH_SOFTWARE",
      minimumAvailableWeightShare: 0.5,
      components: [component("a", 1.0, () => ({ status: "AVAILABLE", rawValue: 1, score100: 70, asOf: "d" }))],
    };
    const result = scoreFundamentals(template, RAW);
    expect(result.status).toBe("SCORED");
    if (result.status !== "SCORED") throw new Error("expected SCORED");

    const evidence = deriveFundamentalsEvidenceScoredItem(result);
    expect(evidence).toEqual({ status: "SCORED", item: result.overall });
  });

  it("INSUFFICIENT_DATA -> { status: 'INSUFFICIENT_DATA' } — no `item` key at all, never a fabricated score", () => {
    const result: FundamentalsScoreResult = {
      status: "INSUFFICIENT_DATA",
      components: [],
      coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
    };
    const evidence = deriveFundamentalsEvidenceScoredItem(result);
    expect(evidence).toEqual({ status: "INSUFFICIENT_DATA" });
    expect(evidence).not.toHaveProperty("item");
  });
});
