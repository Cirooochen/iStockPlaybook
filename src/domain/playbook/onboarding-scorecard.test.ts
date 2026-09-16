import { describe, expect, it } from "vitest";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { RULESET } from "@/config/ruleset-v0.1";

describe("buildOnboardingBaselineScorecard", () => {
  it("uses the single named compatibility placeholder for every dimension EXCEPT valuation", () => {
    const scorecard = buildOnboardingBaselineScorecard();
    const placeholder = RULESET.compatibilityPlaceholders.scorecardItem;
    expect(scorecard.fundamentals).toEqual(placeholder);
    expect(scorecard.momentum).toEqual(placeholder);
    expect(scorecard.thesisHealth).toEqual(placeholder);
    expect(scorecard.positionFit).toEqual(placeholder);
    expect(scorecard.concentrationRisk).toEqual(placeholder);
  });

  // Post-Phase-H Trust Cleanup (docs/post-phase-h-product-review.md F4) —
  // valuation is the one dimension with no live pipeline at all, for any
  // stock, ever. It must be null ("not evaluated"), never the
  // compatibility placeholder — a fabricated "5/10 Neutral" here is
  // exactly the "missing evidence became false certainty" failure this
  // placeholder mechanism otherwise avoids.
  it("never gives valuation a fabricated placeholder score — null, not Neutral", () => {
    const scorecard = buildOnboardingBaselineScorecard();
    expect(scorecard.valuation).toBeNull();
  });

  it("never reports a real 'Positive'/'Weak'/'Elevated' state — only the placeholder's own Neutral (or valuation's honest null)", () => {
    const scorecard = buildOnboardingBaselineScorecard();
    for (const [key, item] of Object.entries(scorecard)) {
      if (key === "valuation") {
        expect(item).toBeNull();
        continue;
      }
      expect(item?.state).toBe("Neutral");
    }
  });
});
