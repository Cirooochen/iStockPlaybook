import { describe, expect, it } from "vitest";
import { generateIntentAssist, buildIntentAssistSystemPrompt } from "@/domain/ai/intent-assist";
import { INTENT_QUESTION_VALUES } from "@/domain/ai/enums";
import type { AIResearchContext } from "@/types/ai-research";
import type { PortfolioValuation, HoldingSnapshot } from "@/types/portfolio";

const NOW = "2026-09-16T12:00:00Z";

function context(): AIResearchContext {
  const holdingSnapshot: HoldingSnapshot = {
    holdingId: "h-asml",
    instrument: { id: "ASML", assetType: "STOCK", name: "ASML Holding N.V.", ticker: "ASML", exchange: "AMS", nativeCurrency: "EUR" },
    quantity: 12,
    priceNative: { status: "AVAILABLE", value: 700, asOf: NOW },
    valueBase: { status: "AVAILABLE", value: 8400, asOf: NOW },
    costBasisBase: { status: "AVAILABLE", value: 8160, asOf: NOW },
    unrealizedPnlBase: { status: "AVAILABLE", value: 240, asOf: NOW },
    unrealizedReturnPct: { status: "AVAILABLE", value: 2.9, asOf: NOW },
  };
  const valuation: PortfolioValuation = {
    state: "COMPLETE",
    totalValueBase: 84000,
    totalCostBasisBase: { status: "AVAILABLE", value: 1, asOf: NOW },
    totalUnrealizedPnlBase: { status: "AVAILABLE", value: 1, asOf: NOW },
    totalUnrealizedReturnPct: { status: "AVAILABLE", value: 1, asOf: NOW },
  };
  return {
    instrument: { ticker: "ASML", name: "ASML Holding N.V." },
    portfolioContext: { holdingSnapshot, valuation, currentWeightPct: 10 },
    researchEvidence: {
      price: { provenance: "SYSTEM", value: { nativeAmount: 700, currency: "EUR" } },
      momentum: { provenance: "MISSING" },
      fundamentals: { provenance: "MISSING" },
      valuation: { provenance: "MISSING" },
    },
    userIntentSoFar: {},
  };
}

describe("generateIntentAssist", () => {
  it("returns OK with a sanitized assist on a well-formed response", async () => {
    const raw = JSON.stringify({
      suggestions: [{ value: "MEDIUM", rationale: "Evidence coverage is thin.", groundedIn: [] }],
      clarifyingQuestions: [],
      caveats: ["This is a starting point, not a recommendation."],
    });
    const result = await generateIntentAssist(context(), "CONFIDENCE", async () => ({ text: raw, modelVersion: "test-model" }));
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.assist.question).toBe("CONFIDENCE");
    expect(result.assist.suggestions[0].value).toBe("MEDIUM");
  });

  it("degrades to UNAVAILABLE when the provider call throws", async () => {
    const result = await generateIntentAssist(context(), "CONFIDENCE", async () => {
      throw new Error("timeout");
    });
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE on non-JSON response text", async () => {
    const result = await generateIntentAssist(context(), "CONFIDENCE", async () => ({ text: "nope", modelVersion: "test-model" }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE when every suggestion has a value outside the question's real enum", async () => {
    const raw = JSON.stringify({
      suggestions: [{ value: "SUPER_CONFIDENT", rationale: "x", groundedIn: [] }],
      clarifyingQuestions: [],
      caveats: [],
    });
    const result = await generateIntentAssist(context(), "CONFIDENCE", async () => ({ text: raw, modelVersion: "test-model" }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE when the model suggests a value that belongs to a DIFFERENT question's enum", async () => {
    // "GROWTH" is a real production value — but for INVESTMENT_ROLE, not CONFIDENCE.
    const raw = JSON.stringify({ suggestions: [{ value: "GROWTH", rationale: "x", groundedIn: [] }], clarifyingQuestions: [], caveats: [] });
    const result = await generateIntentAssist(context(), "CONFIDENCE", async () => ({ text: raw, modelVersion: "test-model" }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("accepts clarifyingQuestions-only responses (e.g. Investment Role, evidence can't fully answer it)", async () => {
    const raw = JSON.stringify({
      suggestions: [],
      clarifyingQuestions: ["Do you expect to need this money within 5 years?"],
      caveats: [],
    });
    const result = await generateIntentAssist(context(), "INVESTMENT_ROLE", async () => ({ text: raw, modelVersion: "test-model" }));
    expect(result.status).toBe("OK");
  });

  it("never throws on a rejected provider promise", async () => {
    await expect(
      generateIntentAssist(context(), "THESIS_TRAJECTORY", async () => {
        throw new Error("boom");
      })
    ).resolves.toEqual({ status: "UNAVAILABLE" });
  });
});

describe("buildIntentAssistSystemPrompt", () => {
  it("tells the model exactly the same enum values validation.ts will accept, for every question", () => {
    for (const question of Object.keys(INTENT_QUESTION_VALUES) as (keyof typeof INTENT_QUESTION_VALUES)[]) {
      const prompt = buildIntentAssistSystemPrompt(question);
      for (const value of INTENT_QUESTION_VALUES[question]) {
        expect(prompt).toContain(value);
      }
    }
  });

  it("never mentions a deferral literal as an allowed value", () => {
    for (const question of Object.keys(INTENT_QUESTION_VALUES) as (keyof typeof INTENT_QUESTION_VALUES)[]) {
      const prompt = buildIntentAssistSystemPrompt(question);
      expect(prompt).not.toContain("HELP_ME_ASSESS");
      // "NOT_SURE" itself only ever appears in the prose warning against
      // it, never inside the allowed-values list — checked structurally
      // via INTENT_QUESTION_VALUES never containing it (enums.test.ts).
    }
  });
});
