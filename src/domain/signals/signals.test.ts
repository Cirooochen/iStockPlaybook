import { describe, expect, it } from "vitest";
import {
  deriveFundamentalsScore,
  deriveValuationScore,
  deriveTechnicalScore,
  deriveSignals,
} from "@/domain/signals/signals";
import type { Scorecard } from "@/types/playbook";

const scorecard: Scorecard = {
  fundamentals: { score: 8, state: "Positive" },
  valuation: { score: 5, state: "Neutral" },
  momentum: { score: 7, state: "Positive" },
  thesisHealth: { score: 8, state: "Intact" },
  positionFit: { score: 3, state: "Weak" },
  concentrationRisk: { score: 4, state: "Elevated" },
};

describe("signal seam", () => {
  it("passes fundamentals through unchanged", () => {
    expect(deriveFundamentalsScore(scorecard)).toEqual(scorecard.fundamentals);
  });

  it("passes valuation through unchanged", () => {
    expect(deriveValuationScore(scorecard)).toEqual(scorecard.valuation);
  });

  it("passes technical (momentum) through unchanged", () => {
    expect(deriveTechnicalScore(scorecard)).toEqual(scorecard.momentum);
  });

  it("deriveSignals bundles all three pass-throughs", () => {
    expect(deriveSignals(scorecard)).toEqual({
      fundamentals: scorecard.fundamentals,
      valuation: scorecard.valuation,
      momentum: scorecard.momentum,
    });
  });
});
