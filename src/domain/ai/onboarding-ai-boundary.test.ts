// Proof that Phase H.5's AI layer cannot influence the deterministic
// Proposal/config pipeline — design doc §2/§9. Two kinds of proof:
//
//   1. RUNTIME: an AI-suggested answer, once the user selects it, is
//      indistinguishable from a hand-typed one — buildProposal and
//      materializeStockPlaybookConfig produce byte-identical output
//      whether or not AI was involved in reaching the same concrete
//      UserIntent. The resulting Strategy numbers are always H.2's rule
//      table, never anything the AI suggestion's `rationale`/`groundedIn`
//      carried.
//   2. COMPILE-TIME: AIEvidenceBrief/AIIntentAssist cannot be assigned
//      anywhere PlaybookProposal/ProposedConfiguration/StockPlaybookConfig
//      expect a value — enforced by the type system itself, not by
//      convention. See assertTypeBoundary() below; it is never called at
//      runtime — its only job is to fail `tsc --noEmit` if the boundary
//      is ever weakened.
import { describe, expect, it } from "vitest";
import { RULESET } from "@/config/ruleset-v0.1";
import { buildProposal } from "@/domain/playbook/proposal";
import { materializeStockPlaybookConfig } from "@/domain/playbook/materialize-config";
import { sanitizeIntentAssist } from "@/domain/ai/validation";
import type {
  GuardrailPreview,
  PlaybookProposal,
  PortfolioContext,
  ProposedConfiguration,
  ResearchEvidence,
  UserIntent,
} from "@/types/playbook-proposal";
import type { Holding, HoldingSnapshot, PortfolioValuation, StockPlaybookConfig } from "@/types/portfolio";
import type { AIEvidenceBrief, AIIntentAssist, AIResearchContext, AIResponseMeta } from "@/types/ai-research";

const NOW = "2026-09-16T12:00:00Z";

const asmlHolding: Holding = {
  id: "h-asml",
  instrument: { id: "ASML", assetType: "STOCK", name: "ASML Holding N.V.", ticker: "ASML", exchange: "AMS", nativeCurrency: "EUR" },
  quantity: 12,
  costBasis: { status: "AVAILABLE", averageCostNative: 680, asOf: NOW },
};

function holdingSnapshot(): HoldingSnapshot {
  return {
    holdingId: "h-asml",
    instrument: asmlHolding.instrument,
    quantity: 12,
    priceNative: { status: "AVAILABLE", value: 700, asOf: NOW },
    valueBase: { status: "AVAILABLE", value: 8400, asOf: NOW },
    costBasisBase: { status: "AVAILABLE", value: 8160, asOf: NOW },
    unrealizedPnlBase: { status: "AVAILABLE", value: 240, asOf: NOW },
    unrealizedReturnPct: { status: "AVAILABLE", value: 2.9, asOf: NOW },
  };
}

const completeValuation: PortfolioValuation = {
  state: "COMPLETE",
  totalValueBase: 84000,
  totalCostBasisBase: { status: "AVAILABLE", value: 1, asOf: NOW },
  totalUnrealizedPnlBase: { status: "AVAILABLE", value: 1, asOf: NOW },
  totalUnrealizedReturnPct: { status: "AVAILABLE", value: 1, asOf: NOW },
};

const emptyEvidence: ResearchEvidence = {
  price: { provenance: "MISSING" },
  momentum: { provenance: "MISSING" },
  fundamentals: { provenance: "MISSING" },
  valuation: { provenance: "MISSING" },
};

function fullUserIntent(role: "LONG_TERM_CORE" | "GROWTH" | "TACTICAL"): UserIntent {
  return {
    investmentRole: { provenance: "USER", value: role },
    confidence: { provenance: "USER", value: "MEDIUM" },
    currentIntention: { provenance: "USER", value: "HOLD" },
    corePortion: role === "LONG_TERM_CORE" ? { status: "PROVIDED", value: { fractionOfCurrentHolding: 0.5 } } : { status: "NOT_APPLICABLE" },
    thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
  };
}

function buildAndMaterialize(userIntent: UserIntent) {
  const portfolioContext: PortfolioContext = { holdingSnapshot: holdingSnapshot(), valuation: completeValuation, currentWeightPct: 5 };
  const proposal = buildProposal({
    subject: { instrumentId: "ASML", holdingId: "h-asml" },
    portfolioContext,
    userIntent,
    researchEvidence: emptyEvidence,
  });
  const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
  return { proposal, result };
}

describe("AI involvement never changes the deterministic Proposal/config output (design doc §2, §9)", () => {
  it("a role value reached via a VALIDATED AI suggestion produces the exact same config as the same value typed manually", () => {
    // Step 1: simulate a real Intent Assist round-trip — an AI response
    // suggesting GROWTH, run through the SAME sanitizeIntentAssist the
    // production code path uses.
    const aiContext: AIResearchContext = {
      instrument: { ticker: "ASML", name: "ASML Holding N.V." },
      portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation, currentWeightPct: 5 },
      researchEvidence: emptyEvidence,
      userIntentSoFar: {},
    };
    const meta: AIResponseMeta = { modelVersion: "test", generatedAt: NOW, latencyMs: 1 };
    const assist = sanitizeIntentAssist(
      { suggestions: [{ value: "GROWTH", rationale: "Tentative starting point.", groundedIn: [] }], clarifyingQuestions: [], caveats: [] },
      aiContext,
      "INVESTMENT_ROLE",
      meta
    );
    expect(assist).not.toBeNull();
    const aiSuggestedValue = assist!.suggestions[0].value; // exactly what IntentAssistSuggestions.onSelect would pass through

    // Step 2: this is EXACTLY what the overlay's onSelect handler does
    // regardless of whether the click came from a hand-authored option or
    // an AI suggestion card — always provenance: "USER" (see
    // PlaybookOnboardingOverlay.tsx's onSelect handlers and
    // IntentAssistSuggestions' onSelect prop, which is the SAME function).
    const userIntentViaAI = fullUserIntent(aiSuggestedValue as "GROWTH");
    const userIntentManual = fullUserIntent("GROWTH");

    const viaAI = buildAndMaterialize(userIntentViaAI);
    const manual = buildAndMaterialize(userIntentManual);

    expect(viaAI.result).toEqual(manual.result);
    expect(viaAI.proposal.proposedConfiguration).toEqual(manual.proposal.proposedConfiguration);
  });

  it.each(["LONG_TERM_CORE", "GROWTH", "TACTICAL"] as const)(
    "%s: the materialized Strategy numbers are always H.2's rule table — never anything an AI rationale/groundedIn could carry",
    (role) => {
      const { result } = buildAndMaterialize(fullUserIntent(role));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = RULESET.strategyDefaults.roleTargetAllocation[role];
      expect(result.config.strategy.mediumTermTargetMinPct).toBe(expected.minPct);
      expect(result.config.strategy.mediumTermTargetMaxPct).toBe(expected.maxPct);
      expect(result.config.strategy.shortTermMaxWeightPct).toBe(expected.maxPct + RULESET.strategyDefaults.accumulationCeilingBufferPct);
    }
  );

  it("no AI-response field name (groundedIn/clarifyingQuestions/modelVersion/rationale) ever appears in the persisted StockPlaybookConfig", () => {
    const { result } = buildAndMaterialize(fullUserIntent("GROWTH"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.config);
    for (const aiOnlyField of ["groundedIn", "clarifyingQuestions", "modelVersion", "rationale", "latencyMs"]) {
      expect(serialized).not.toContain(aiOnlyField);
    }
  });

  it("no AI-response field name ever appears in the reviewable PlaybookProposal either", () => {
    const { proposal } = buildAndMaterialize(fullUserIntent("GROWTH"));
    const serialized = JSON.stringify(proposal);
    for (const aiOnlyField of ["groundedIn", "clarifyingQuestions", "modelVersion", "rationale", "latencyMs"]) {
      expect(serialized).not.toContain(aiOnlyField);
    }
  });

  it("materializeStockPlaybookConfig's own signature has no AI-context parameter — verified by calling it with exactly the same 5 positional arguments H.4 always used", () => {
    // If a future change ever threaded AIResearchContext/AIEvidenceBrief
    // into this function, this call site would need a 6th argument and
    // stop compiling — this test's only job is to keep exercising the
    // original 5-argument call shape so that drift is caught by tsc, not
    // silently.
    const portfolioContext: PortfolioContext = { holdingSnapshot: holdingSnapshot(), valuation: completeValuation, currentWeightPct: 5 };
    const proposal: PlaybookProposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-asml" },
      portfolioContext,
      userIntent: fullUserIntent("TACTICAL"),
      researchEvidence: emptyEvidence,
    });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
  });
});

// COMPILE-TIME proof — never invoked. Its only purpose is to make
// `npx tsc --noEmit` fail if AIEvidenceBrief/AIIntentAssist ever become
// assignable into the production Proposal/config schema. Every line below
// must be a genuine type error for this file to compile at all.
function assertTypeBoundary(
  brief: AIEvidenceBrief,
  assist: AIIntentAssist,
  guardrailPreview: GuardrailPreview
): void {
  // @ts-expect-error — an AIEvidenceBrief can never stand in for a
  // ProposedConfiguration field (design doc §9's Model Decision: AI never
  // populates ProposedConfiguration in v0.1).
  const badAllocation: ProposedConfiguration["targetAllocationRange"] = brief;
  // @ts-expect-error — same for AIIntentAssist.
  const badCeiling: ProposedConfiguration["accumulationCeilingPct"] = assist;
  // @ts-expect-error — StockPlaybookConfig carries no provenance slot at
  // all (H.1 §1.2's confirmation boundary) — an AI value cannot be
  // smuggled in as a Strategy.
  const badConfig: StockPlaybookConfig = brief;
  void badAllocation;
  void badCeiling;
  void badConfig;
  void guardrailPreview;
}
void assertTypeBoundary;
