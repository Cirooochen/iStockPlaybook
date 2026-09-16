import { describe, expect, it } from "vitest";
import {
  refAllowsStrength,
  sanitizeEvidenceBrief,
  sanitizeEvidencePoint,
  sanitizeIntentAssist,
} from "@/domain/ai/validation";
import type { AIResearchContext, AIResponseMeta } from "@/types/ai-research";
import type { HoldingSnapshot, PortfolioValuation } from "@/types/portfolio";
import type { MomentumScoreResult } from "@/domain/signals/momentum-score";
import type { FundamentalsScoreResult } from "@/domain/signals/fundamentals-score";

const NOW = "2026-09-16T12:00:00Z";

const meta: AIResponseMeta = { modelVersion: "test-model", generatedAt: NOW, latencyMs: 1 };

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

const scoredMomentum: MomentumScoreResult = {
  status: "SCORED",
  overall: { score: 8, state: "Positive" },
  components: [],
  coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
};

const insufficientMomentum: MomentumScoreResult = {
  status: "INSUFFICIENT_DATA",
  components: [],
  coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.2, missingWeight: 0.8, availableWeightShare: 0.2 },
};

const scoredFundamentals: FundamentalsScoreResult = {
  status: "SCORED",
  overall: { score: 7, state: "Positive" },
  components: [],
  coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
};

// A context with SCORED momentum+fundamentals, a COMPLETE portfolio
// valuation, an available price, a known currentWeightPct, and NO
// guardrailPreview (mirrors the "everything present" happy path).
function fullContext(overrides: Partial<AIResearchContext> = {}): AIResearchContext {
  return {
    instrument: { ticker: "ASML", name: "ASML Holding N.V." },
    portfolioContext: { holdingSnapshot: holdingSnapshot(), valuation: completeValuation(), currentWeightPct: 10 },
    researchEvidence: {
      price: { provenance: "SYSTEM", value: { nativeAmount: 700, currency: "EUR" } },
      momentum: { provenance: "DETERMINISTIC", result: scoredMomentum },
      fundamentals: { provenance: "DETERMINISTIC", result: scoredFundamentals, modelFit: "UNKNOWN_FIT" },
      valuation: { provenance: "MISSING" },
    },
    userIntentSoFar: {},
    ...overrides,
  };
}

describe("refAllowsStrength", () => {
  it("allows momentum/fundamentals only when SCORED", () => {
    const ctx = fullContext();
    expect(refAllowsStrength("researchEvidence.momentum", ctx)).toBe(true);
    expect(refAllowsStrength("researchEvidence.fundamentals", ctx)).toBe(true);

    const insufficientCtx = fullContext({
      researchEvidence: { ...ctx.researchEvidence, momentum: { provenance: "DETERMINISTIC", result: insufficientMomentum } },
    });
    expect(refAllowsStrength("researchEvidence.momentum", insufficientCtx)).toBe(false);

    const missingCtx = fullContext({ researchEvidence: { ...ctx.researchEvidence, fundamentals: { provenance: "MISSING" } } });
    expect(refAllowsStrength("researchEvidence.fundamentals", missingCtx)).toBe(false);
  });

  it("never allows modelFit, valuation, or guardrailPreview to ground a strength", () => {
    const ctx = fullContext({ guardrailPreview: { concentrationStateIfConfirmedNow: "WITHIN_TARGET", discrepancies: [] } });
    expect(refAllowsStrength("researchEvidence.fundamentals.modelFit", ctx)).toBe(false);
    expect(refAllowsStrength("researchEvidence.valuation", ctx)).toBe(false);
    expect(refAllowsStrength("guardrailPreview", ctx)).toBe(false);
  });

  it("allows price only when SYSTEM-provenance and available", () => {
    const ctx = fullContext();
    expect(refAllowsStrength("researchEvidence.price", ctx)).toBe(true);
    const missingPrice = fullContext({ researchEvidence: { ...ctx.researchEvidence, price: { provenance: "MISSING" } } });
    expect(refAllowsStrength("researchEvidence.price", missingPrice)).toBe(false);
  });

  it("allows portfolioContext.currentWeightPct only when non-null, and .valuation only when COMPLETE", () => {
    const ctx = fullContext();
    expect(refAllowsStrength("portfolioContext.currentWeightPct", ctx)).toBe(true);
    expect(refAllowsStrength("portfolioContext.valuation", ctx)).toBe(true);

    const partial = fullContext({
      portfolioContext: { ...ctx.portfolioContext, currentWeightPct: null, valuation: { state: "PARTIAL", knownValueBase: 0, excludedHoldingIds: [] } },
    });
    expect(refAllowsStrength("portfolioContext.currentWeightPct", partial)).toBe(false);
    expect(refAllowsStrength("portfolioContext.valuation", partial)).toBe(false);
  });
});

describe("sanitizeEvidencePoint — strength bucket", () => {
  it("accepts a strength citing genuinely SCORED evidence", () => {
    const ctx = fullContext();
    const point = sanitizeEvidencePoint(
      { text: "Momentum looks constructive.", groundedIn: ["researchEvidence.momentum"] },
      ctx,
      "strength"
    );
    expect(point).toEqual({ text: "Momentum looks constructive.", groundedIn: ["researchEvidence.momentum"] });
  });

  it("REJECTS a strength with no citation at all", () => {
    const ctx = fullContext();
    expect(sanitizeEvidencePoint({ text: "Looks great!", groundedIn: [] }, ctx, "strength")).toBeNull();
  });

  it("REJECTS a strength citing MISSING/INSUFFICIENT_DATA evidence — the core missing-evidence-consistency rule", () => {
    const ctx = fullContext({
      researchEvidence: { ...fullContext().researchEvidence, momentum: { provenance: "DETERMINISTIC", result: insufficientMomentum } },
    });
    expect(
      sanitizeEvidencePoint({ text: "Momentum is strong.", groundedIn: ["researchEvidence.momentum"] }, ctx, "strength")
    ).toBeNull();
  });

  it("REJECTS a strength that mixes one real citation with one that fails refAllowsStrength — dropped WHOLE, not stripped to its valid half", () => {
    const ctx = fullContext();
    const point = sanitizeEvidencePoint(
      {
        text: "Momentum is strong and the model fit is confirmed.",
        groundedIn: ["researchEvidence.momentum", "researchEvidence.fundamentals.modelFit"],
      },
      ctx,
      "strength"
    );
    expect(point).toBeNull();
  });

  it("REJECTS a citation string outside the closed EvidenceFieldRef set (hallucinated field)", () => {
    const ctx = fullContext();
    expect(
      sanitizeEvidencePoint({ text: "x", groundedIn: ["researchEvidence.somethingMadeUp"] }, ctx, "strength")
    ).toBeNull();
  });

  it("REJECTS a citation of guardrailPreview when it wasn't included in the context sent", () => {
    const ctx = fullContext(); // no guardrailPreview
    expect(sanitizeEvidencePoint({ text: "x", groundedIn: ["guardrailPreview"] }, ctx, "uncertainty")).toBeNull();
  });
});

describe("sanitizeEvidencePoint — uncertainty bucket", () => {
  it("accepts an uncertainty citing MISSING/INSUFFICIENT_DATA evidence — this is the whole point", () => {
    const ctx = fullContext({ researchEvidence: { ...fullContext().researchEvidence, valuation: { provenance: "MISSING" } } });
    const point = sanitizeEvidencePoint(
      { text: "No valuation evidence exists for this stock yet.", groundedIn: ["researchEvidence.valuation"] },
      ctx,
      "uncertainty"
    );
    expect(point).not.toBeNull();
  });

  it("accepts an empty groundedIn array (a disclosed generality)", () => {
    const ctx = fullContext();
    const point = sanitizeEvidencePoint(
      { text: "Growth-stage companies often show mixed guidance in early quarters.", groundedIn: [] },
      ctx,
      "uncertainty"
    );
    expect(point).toEqual({ text: "Growth-stage companies often show mixed guidance in early quarters.", groundedIn: [] });
  });

  it("still rejects malformed shapes: missing text, non-array groundedIn, non-string entries", () => {
    const ctx = fullContext();
    expect(sanitizeEvidencePoint({ groundedIn: [] }, ctx, "uncertainty")).toBeNull();
    expect(sanitizeEvidencePoint({ text: "x", groundedIn: "not-an-array" }, ctx, "uncertainty")).toBeNull();
    expect(sanitizeEvidencePoint({ text: "x", groundedIn: [42] }, ctx, "uncertainty")).toBeNull();
    expect(sanitizeEvidencePoint("just a string", ctx, "uncertainty")).toBeNull();
    expect(sanitizeEvidencePoint({ text: "   ", groundedIn: [] }, ctx, "uncertainty")).toBeNull();
  });
});

describe("sanitizeEvidenceBrief", () => {
  it("accepts a well-formed brief and drops nothing valid", () => {
    const ctx = fullContext();
    const raw = {
      summary: "ASML shows constructive momentum; fundamentals model fit is unknown.",
      strengths: [{ text: "Momentum is scored positive.", groundedIn: ["researchEvidence.momentum"] }],
      uncertainties: [{ text: "Model fit for this archetype is unknown.", groundedIn: ["researchEvidence.fundamentals.modelFit"] }],
    };
    const brief = sanitizeEvidenceBrief(raw, ctx, meta);
    expect(brief).not.toBeNull();
    expect(brief?.strengths).toHaveLength(1);
    expect(brief?.uncertainties).toHaveLength(1);
    expect(brief?.meta).toBe(meta);
  });

  it("drops individual bad points but keeps the response if something valid survives", () => {
    const ctx = fullContext();
    const raw = {
      summary: "Mixed picture.",
      strengths: [
        { text: "Valid.", groundedIn: ["researchEvidence.momentum"] },
        { text: "Invalid — cites missing evidence as a strength.", groundedIn: ["researchEvidence.valuation"] },
      ],
      uncertainties: [],
    };
    const brief = sanitizeEvidenceBrief(raw, ctx, meta);
    expect(brief?.strengths).toHaveLength(1);
    expect(brief?.strengths[0].text).toBe("Valid.");
  });

  it("REJECTS the whole response when nothing survives — never a bare summary with zero grounding", () => {
    const ctx = fullContext();
    const raw = {
      summary: "Looks good.",
      strengths: [{ text: "Ungrounded claim.", groundedIn: [] }], // empty groundedIn illegal for a strength
      uncertainties: [{ text: "x", groundedIn: ["not.a.real.ref"] }],
    };
    expect(sanitizeEvidenceBrief(raw, ctx, meta)).toBeNull();
  });

  it("REJECTS malformed top-level shapes", () => {
    const ctx = fullContext();
    expect(sanitizeEvidenceBrief(null, ctx, meta)).toBeNull();
    expect(sanitizeEvidenceBrief("a string", ctx, meta)).toBeNull();
    expect(sanitizeEvidenceBrief({ summary: "x" }, ctx, meta)).toBeNull(); // missing strengths/uncertainties arrays
    expect(sanitizeEvidenceBrief({ summary: "", strengths: [], uncertainties: [] }, ctx, meta)).toBeNull(); // empty summary
  });
});

describe("sanitizeIntentAssist", () => {
  it("accepts a valid suggestion whose value matches the question's real enum", () => {
    const ctx = fullContext();
    const raw = {
      suggestions: [{ value: "MEDIUM", rationale: "Evidence coverage is partial.", groundedIn: ["researchEvidence.momentum"] }],
      clarifyingQuestions: [],
      caveats: [],
    };
    const assist = sanitizeIntentAssist(raw, ctx, "CONFIDENCE", meta);
    expect(assist?.suggestions).toEqual([
      { value: "MEDIUM", rationale: "Evidence coverage is partial.", groundedIn: ["researchEvidence.momentum"] },
    ]);
  });

  it("DROPS a suggestion whose value is not a member of the question's production enum", () => {
    const ctx = fullContext();
    const raw = {
      suggestions: [{ value: "SUPER_HIGH", rationale: "x", groundedIn: [] }],
      clarifyingQuestions: [],
      caveats: [],
    };
    expect(sanitizeIntentAssist(raw, ctx, "CONFIDENCE", meta)).toBeNull(); // nothing else survives
  });

  it("DROPS a suggestion whose value is the question's own deferral literal — a suggestion cannot just restate 'not sure'", () => {
    const ctx = fullContext();
    const raw = {
      suggestions: [{ value: "HELP_ME_ASSESS", rationale: "x", groundedIn: [] }],
      clarifyingQuestions: [],
      caveats: [],
    };
    expect(sanitizeIntentAssist(raw, ctx, "CONFIDENCE", meta)).toBeNull();
  });

  it("REJECTS a suggestion for an unrelated question's enum value (e.g. a Role value under CONFIDENCE)", () => {
    const ctx = fullContext();
    const raw = { suggestions: [{ value: "GROWTH", rationale: "x", groundedIn: [] }], clarifyingQuestions: [], caveats: [] };
    expect(sanitizeIntentAssist(raw, ctx, "CONFIDENCE", meta)).toBeNull();
  });

  it("caps suggestions at 3", () => {
    const ctx = fullContext();
    const raw = {
      suggestions: [
        { value: "LONG_TERM_CORE", rationale: "a", groundedIn: [] },
        { value: "GROWTH", rationale: "b", groundedIn: [] },
        { value: "TACTICAL", rationale: "c", groundedIn: [] },
        { value: "GROWTH", rationale: "d (duplicate value, still counts)", groundedIn: [] },
      ],
      clarifyingQuestions: [],
      caveats: [],
    };
    const assist = sanitizeIntentAssist(raw, ctx, "INVESTMENT_ROLE", meta);
    expect(assist?.suggestions).toHaveLength(3);
  });

  it("allows an empty groundedIn on a suggestion — personal-preference questions may lean on general reasoning", () => {
    const ctx = fullContext();
    const raw = { suggestions: [{ value: "GROWTH", rationale: "A tentative starting point.", groundedIn: [] }], clarifyingQuestions: [], caveats: [] };
    expect(sanitizeIntentAssist(raw, ctx, "INVESTMENT_ROLE", meta)?.suggestions).toHaveLength(1);
  });

  it("accepts zero suggestions when clarifyingQuestions carry the response instead", () => {
    const ctx = fullContext();
    const raw = { suggestions: [], clarifyingQuestions: ["Do you expect to need this money within 5 years?"], caveats: [] };
    const assist = sanitizeIntentAssist(raw, ctx, "INVESTMENT_ROLE", meta);
    expect(assist).not.toBeNull();
    expect(assist?.suggestions).toEqual([]);
  });

  it("REJECTS when there is truly nothing usable: no suggestions and no clarifying questions", () => {
    const ctx = fullContext();
    const raw = { suggestions: [], clarifyingQuestions: [], caveats: ["some caveat"] };
    expect(sanitizeIntentAssist(raw, ctx, "INVESTMENT_ROLE", meta)).toBeNull();
  });

  it("REJECTS malformed top-level shapes", () => {
    const ctx = fullContext();
    expect(sanitizeIntentAssist(null, ctx, "CONFIDENCE", meta)).toBeNull();
    expect(sanitizeIntentAssist({ suggestions: "not-an-array" }, ctx, "CONFIDENCE", meta)).toBeNull();
  });
});
