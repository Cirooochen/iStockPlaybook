import { describe, expect, it } from "vitest";
import { buildAIResearchContext } from "@/domain/ai/context";
import type { GuardrailPreview, PortfolioContext, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";
import type { HoldingSnapshot, PortfolioValuation } from "@/types/portfolio";

const NOW = "2026-09-16T12:00:00Z";

function holdingSnapshot(): HoldingSnapshot {
  return {
    holdingId: "h-asml",
    instrument: { id: "ASML", assetType: "STOCK", name: "ASML Holding N.V.", ticker: "ASML", exchange: "AMS", nativeCurrency: "EUR" },
    quantity: 12,
    priceNative: { status: "AVAILABLE", value: 700, asOf: NOW },
    valueBase: { status: "AVAILABLE", value: 8400, asOf: NOW },
    costBasisBase: { status: "AVAILABLE", value: 8160, asOf: NOW },
    unrealizedPnlBase: { status: "AVAILABLE", value: 240, asOf: NOW },
    unrealizedReturnPct: { status: "AVAILABLE", value: 2.9, asOf: NOW },
  };
}

function completeValuation(): PortfolioValuation {
  return {
    state: "COMPLETE",
    totalValueBase: 84000,
    totalCostBasisBase: { status: "AVAILABLE", value: 1, asOf: NOW },
    totalUnrealizedPnlBase: { status: "AVAILABLE", value: 1, asOf: NOW },
    totalUnrealizedReturnPct: { status: "AVAILABLE", value: 1, asOf: NOW },
  };
}

const emptyEvidence: ResearchEvidence = {
  price: { provenance: "MISSING" },
  momentum: { provenance: "MISSING" },
  fundamentals: { provenance: "MISSING" },
  valuation: { provenance: "MISSING" },
};

function baseUserIntent(overrides: Partial<UserIntent> = {}): UserIntent {
  return {
    investmentRole: { provenance: "MISSING" },
    confidence: { provenance: "MISSING" },
    currentIntention: { provenance: "MISSING" },
    corePortion: { status: "NOT_APPLICABLE" },
    thesisTrajectory: { provenance: "MISSING" },
    ...overrides,
  };
}

const emptyGuardrailPreview: GuardrailPreview = { concentrationStateIfConfirmedNow: null, discrepancies: [] };

describe("buildAIResearchContext", () => {
  it("carries instrument/portfolioContext/researchEvidence through unchanged", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(),
      valuation: completeValuation(),
      currentWeightPct: 10,
    };
    const ctx = buildAIResearchContext({
      instrument: { ticker: "ASML", name: "ASML Holding N.V." },
      portfolioContext,
      researchEvidence: emptyEvidence,
      userIntent: baseUserIntent(),
      guardrailPreview: emptyGuardrailPreview,
    });
    expect(ctx.instrument).toEqual({ ticker: "ASML", name: "ASML Holding N.V." });
    expect(ctx.portfolioContext).toBe(portfolioContext);
    expect(ctx.researchEvidence).toBe(emptyEvidence);
  });

  it("omits guardrailPreview when concentrationStateIfConfirmedNow is null", () => {
    const ctx = buildAIResearchContext({
      instrument: { ticker: "ASML", name: "ASML" },
      portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation(), currentWeightPct: null },
      researchEvidence: emptyEvidence,
      userIntent: baseUserIntent(),
      guardrailPreview: emptyGuardrailPreview,
    });
    expect(ctx.guardrailPreview).toBeUndefined();
  });

  it("includes guardrailPreview once concentrationStateIfConfirmedNow is computable", () => {
    const preview: GuardrailPreview = { concentrationStateIfConfirmedNow: "WITHIN_TARGET", discrepancies: [] };
    const ctx = buildAIResearchContext({
      instrument: { ticker: "ASML", name: "ASML" },
      portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation(), currentWeightPct: 10 },
      researchEvidence: emptyEvidence,
      userIntent: baseUserIntent(),
      guardrailPreview: preview,
    });
    expect(ctx.guardrailPreview).toEqual(preview);
  });

  it("reduces UserIntent to only concrete (non-MISSING, non-deferred) answers", () => {
    const ctx = buildAIResearchContext({
      instrument: { ticker: "ASML", name: "ASML" },
      portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation(), currentWeightPct: 10 },
      researchEvidence: emptyEvidence,
      userIntent: baseUserIntent({
        investmentRole: { provenance: "USER", value: "GROWTH" },
        confidence: { provenance: "USER", value: "HELP_ME_ASSESS" }, // deferred — must be dropped
        currentIntention: { provenance: "MISSING" }, // unanswered — must be dropped
        thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
      }),
      guardrailPreview: emptyGuardrailPreview,
    });
    expect(ctx.userIntentSoFar).toEqual({
      investmentRole: "GROWTH",
      thesisTrajectory: "NO_MEANINGFUL_CHANGE",
    });
  });

  it("drops a deferred investmentRole/currentIntention/thesisTrajectory (NOT_SURE) from userIntentSoFar", () => {
    const ctx = buildAIResearchContext({
      instrument: { ticker: "ASML", name: "ASML" },
      portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation(), currentWeightPct: 10 },
      researchEvidence: emptyEvidence,
      userIntent: baseUserIntent({
        investmentRole: { provenance: "USER", value: "NOT_SURE" },
        currentIntention: { provenance: "USER", value: "NOT_SURE" },
        thesisTrajectory: { provenance: "USER", value: "NOT_SURE" },
      }),
      guardrailPreview: emptyGuardrailPreview,
    });
    expect(ctx.userIntentSoFar).toEqual({});
  });
});
