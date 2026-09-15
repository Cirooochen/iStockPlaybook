import { describe, expect, it } from "vitest";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { RULESET } from "@/config/ruleset-v0.1";

describe("buildOnboardingBaselineScorecard", () => {
  it("uses the single named compatibility placeholder for every dimension", () => {
    const scorecard = buildOnboardingBaselineScorecard();
    const placeholder = RULESET.compatibilityPlaceholders.scorecardItem;
    expect(scorecard.fundamentals).toEqual(placeholder);
    expect(scorecard.valuation).toEqual(placeholder);
    expect(scorecard.momentum).toEqual(placeholder);
    expect(scorecard.thesisHealth).toEqual(placeholder);
    expect(scorecard.positionFit).toEqual(placeholder);
    expect(scorecard.concentrationRisk).toEqual(placeholder);
  });

  it("never reports a real 'Positive'/'Weak'/'Elevated' state — only the placeholder's own Neutral", () => {
    const scorecard = buildOnboardingBaselineScorecard();
    for (const item of Object.values(scorecard)) {
      expect(item.state).toBe("Neutral");
    }
  });
});
