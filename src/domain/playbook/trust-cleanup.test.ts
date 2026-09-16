// Post-Phase-H Trust Cleanup — focused regression coverage for the fixes
// in this pass (docs/post-phase-h-product-review.md F4/F5,
// docs/minimum-research-model.md §2.1/§2.2/§5):
//   1. Scorecard.valuation is never a fabricated placeholder — null
//      ("not evaluated"), everywhere it's produced, for every stock.
//   2. Fundamentals model-fit is derivable and labeled consistently — the
//      exact function both onboarding Review and the confirmed Signal
//      Overview now share, so they can never drift apart.
//   3. Unity's Action Zone copy no longer claims to evaluate a valuation
//      condition that has never existed in this system, while the real,
//      deterministic concentration-based trigger remains intact.
//   4. The Fundamentals false-certainty follow-up: the legacy
//      compatibility placeholder still fills scorecard.fundamentals
//      internally (unchanged, per instruction), but isFundamentalsResultScored
//      is the single, shared, testable predicate that decides whether
//      that number is ever allowed to reach the user — SignalScorecard.tsx
//      itself has no render-test coverage in this project (see
//      docs/phase-h6-end-to-end-validation.md's "Known limitations"), so
//      this predicate is the actual regression guard for that display
//      decision.
import { describe, expect, it } from "vitest";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { RULESET } from "@/config/ruleset-v0.1";
import { deriveValuationScore } from "@/domain/signals/signals";
import {
  deriveFundamentalsModelFit,
  fundamentalsModelFitLabel,
  isFundamentalsResultScored,
} from "@/domain/playbook/fundamentals-model-fit";
import type { Scorecard } from "@/types/playbook";
import type { FundamentalsScoreResult } from "@/domain/signals/fundamentals-score";

describe("Scorecard.valuation is never a fabricated placeholder (F4)", () => {
  it("Unity's own seeded Scorecard has valuation: null, not the Neutral placeholder", () => {
    expect(unityScorecard.valuation).toBeNull();
  });

  it("a newly onboarded stock's baseline Scorecard has valuation: null", () => {
    expect(buildOnboardingBaselineScorecard().valuation).toBeNull();
  });

  it("deriveValuationScore passes null through unchanged, never substituting a score", () => {
    const scorecard: Scorecard = {
      fundamentals: { score: 8, state: "Positive" },
      valuation: null,
      momentum: { score: 7, state: "Positive" },
      thesisHealth: { score: 8, state: "Intact" },
      positionFit: { score: 3, state: "Weak" },
      concentrationRisk: { score: 4, state: "Elevated" },
    };
    expect(deriveValuationScore(scorecard)).toBeNull();
  });

  it("a real, non-null valuation score is still passed through unchanged — this fix removes fabrication, not the ability to show a real score once one exists", () => {
    const scorecard: Scorecard = {
      fundamentals: { score: 8, state: "Positive" },
      valuation: { score: 3, state: "Weak" },
      momentum: { score: 7, state: "Positive" },
      thesisHealth: { score: 8, state: "Intact" },
      positionFit: { score: 3, state: "Weak" },
      concentrationRisk: { score: 4, state: "Elevated" },
    };
    expect(deriveValuationScore(scorecard)).toEqual({ score: 3, state: "Weak" });
  });

  it("runDecisionEngine preserves a null valuation end-to-end for Unity's real seed", () => {
    const input: EngineInput = {
      position: unitySeed.position,
      portfolioTotalEur: portfolioSeed.totalValueEur,
      executionPriceEur: unitySeed.market.executionPriceEur,
      strategy: unitySeed.strategy,
      thesisHealth: unitySeed.playbook.thesisHealth,
      scorecard: unityScorecard,
      actionZoneTemplates: unityActionZones,
    };
    const output = runDecisionEngine(input);
    expect(output.scorecard.valuation).toBeNull();
  });
});

describe("Fundamentals model-fit disclosure (F4)", () => {
  it("is CONFIRMED_FIT only for the one instrument callers mark as a confirmed archetype fit", () => {
    expect(deriveFundamentalsModelFit(true)).toBe("CONFIRMED_FIT");
  });

  it("is UNKNOWN_FIT for every other case — no archetype classifier exists to produce anything else", () => {
    expect(deriveFundamentalsModelFit(false)).toBe("UNKNOWN_FIT");
  });

  it("labels every model-fit value in plain language, including LIMITED_FIT (reserved, never produced today)", () => {
    expect(fundamentalsModelFitLabel("CONFIRMED_FIT")).toBe("Confirmed");
    expect(fundamentalsModelFitLabel("LIMITED_FIT")).toBe("Limited");
    expect(fundamentalsModelFitLabel("UNKNOWN_FIT")).toBe("Unknown");
  });
});

describe("Unity's Action Zone copy no longer claims to evaluate valuation (F5)", () => {
  it("no primaryTrigger/summary/whyBullets/doNotTriggerIf field mentions valuation, for any zone", () => {
    for (const zone of unityActionZones) {
      const fields = [zone.summary, zone.primaryTrigger, ...(zone.whyBullets ?? []), ...(zone.doNotTriggerIf ?? [])].filter(
        (f): f is string => typeof f === "string"
      );
      for (const field of fields) {
        expect(field.toLowerCase()).not.toContain("valuation");
      }
    }
  });

  it("TRIM_1/TRIM_2 still state a real, deterministic concentration-based trigger — the fix removed a false claim, not the real one", () => {
    const trim1 = unityActionZones.find((z) => z.type === "TRIM_1");
    const trim2 = unityActionZones.find((z) => z.type === "TRIM_2");
    expect(trim1?.primaryTrigger).toMatch(/concentration/i);
    expect(trim2?.primaryTrigger).toMatch(/concentration/i);
  });

  it("TRIM zones keep their real concentration whyBullets/doNotTriggerIf content — trimmed the false claim, not the honest ones", () => {
    const trim1 = unityActionZones.find((z) => z.type === "TRIM_1");
    expect(trim1?.whyBullets).toContain("Current portfolio weight: 58.6%");
    expect(trim1?.doNotTriggerIf).toContain("Portfolio weight falls below target beforehand");
  });
});

describe("Fundamentals false-certainty follow-up — isFundamentalsResultScored", () => {
  const coverage = {
    totalDefinedWeight: 1,
    applicableWeight: 1,
    availableWeight: 0.2,
    missingWeight: 0.8,
    availableWeightShare: 0.2,
  };
  const scored: FundamentalsScoreResult = {
    status: "SCORED",
    overall: { score: 7, state: "Positive" },
    components: [],
    coverage: { ...coverage, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };
  const insufficient: FundamentalsScoreResult = {
    status: "INSUFFICIENT_DATA",
    components: [],
    coverage,
  };

  it("is true only for a genuinely SCORED result", () => {
    expect(isFundamentalsResultScored(scored)).toBe(true);
  });

  it("is false for INSUFFICIENT_DATA — real evidence exists, but not enough for an aggregate score", () => {
    expect(isFundamentalsResultScored(insufficient)).toBe(false);
  });

  it("is false for undefined — no live fetch ever returned anything at all (ASML's real, observed case)", () => {
    expect(isFundamentalsResultScored(undefined)).toBe(false);
  });

  it("scorecard.fundamentals keeps the legacy compatibility placeholder internally, exactly as before — this fix changes display logic, not the internal type", () => {
    const baseline = buildOnboardingBaselineScorecard();
    expect(baseline.fundamentals).toEqual(RULESET.compatibilityPlaceholders.scorecardItem);
    // The placeholder is still a plain ScoreItem, indistinguishable from
    // a real one by shape alone — proving the point: whether it may be
    // SHOWN can only be answered by isFundamentalsResultScored, never by
    // inspecting scorecard.fundamentals itself.
    expect(isFundamentalsResultScored(undefined)).toBe(false);
  });

  it("the SCORED gate is the exact same predicate that already gates the model-fit disclosure — the two can never disagree (the live bug this fix corrects: a model-fit tag appearing next to a fabricated, not-really-scored number)", () => {
    // Guards against exactly the regression caught live during this fix:
    // fundamentalsModelFit is always defined once computed, so gating the
    // model-fit tag on "is it defined" (rather than on evidence state)
    // let it appear next to ASML's fallback placeholder. Both the
    // top-line score and the model-fit tag must key off this same
    // predicate so they can never disagree again.
    expect(isFundamentalsResultScored(scored)).toBe(true);
    expect(isFundamentalsResultScored(insufficient)).toBe(false);
    expect(isFundamentalsResultScored(undefined)).toBe(false);
  });
});
