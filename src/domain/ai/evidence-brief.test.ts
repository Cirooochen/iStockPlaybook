import { describe, expect, it } from "vitest";
import { generateEvidenceBrief } from "@/domain/ai/evidence-brief";
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
      momentum: {
        provenance: "DETERMINISTIC",
        result: {
          status: "SCORED",
          overall: { score: 8, state: "Positive" },
          components: [],
          coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
        },
      },
      fundamentals: { provenance: "MISSING" },
      valuation: { provenance: "MISSING" },
    },
    userIntentSoFar: {},
  };
}

const VALID_RAW = JSON.stringify({
  summary: "Momentum is constructive; fundamentals evidence is not available.",
  strengths: [{ text: "Momentum is scored positive.", groundedIn: ["researchEvidence.momentum"] }],
  uncertainties: [{ text: "No fundamentals evidence is available for this stock yet.", groundedIn: ["researchEvidence.fundamentals"] }],
});

describe("generateEvidenceBrief", () => {
  it("returns OK with a sanitized brief on a well-formed response", async () => {
    const result = await generateEvidenceBrief(context(), async () => ({ text: VALID_RAW, modelVersion: "test-model" }));
    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result.brief.summary).toContain("Momentum");
    expect(result.brief.meta.modelVersion).toBe("test-model");
  });

  it("strips a markdown code fence before parsing", async () => {
    const fenced = "```json\n" + VALID_RAW + "\n```";
    const result = await generateEvidenceBrief(context(), async () => ({ text: fenced, modelVersion: "test-model" }));
    expect(result.status).toBe("OK");
  });

  it("degrades to UNAVAILABLE when the provider call throws (network failure)", async () => {
    const result = await generateEvidenceBrief(context(), async () => {
      throw new Error("network down");
    });
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE on non-JSON response text", async () => {
    const result = await generateEvidenceBrief(context(), async () => ({ text: "not json at all", modelVersion: "test-model" }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE when the parsed JSON fails grounding validation (e.g. hallucinated citation)", async () => {
    const bad = JSON.stringify({
      summary: "x",
      strengths: [{ text: "Fabricated fact about the company.", groundedIn: ["researchEvidence.somethingMadeUp"] }],
      uncertainties: [],
    });
    const result = await generateEvidenceBrief(context(), async () => ({ text: bad, modelVersion: "test-model" }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("degrades to UNAVAILABLE when the response is valid JSON but not the expected shape at all", async () => {
    const result = await generateEvidenceBrief(context(), async () => ({
      text: JSON.stringify({ unrelated: "shape" }),
      modelVersion: "test-model",
    }));
    expect(result).toEqual({ status: "UNAVAILABLE" });
  });

  it("never throws, even when the provider call rejects with a non-Error value", async () => {
    await expect(
      generateEvidenceBrief(context(), async () => {
        throw "a plain string rejection";
      })
    ).resolves.toEqual({ status: "UNAVAILABLE" });
  });
});
