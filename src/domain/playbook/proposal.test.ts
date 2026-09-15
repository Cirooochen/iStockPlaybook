import { describe, expect, it } from "vitest";
import {
  buildProposal,
  corePortionBucketToFraction,
  corePortionForRole,
  createEmptyUserIntent,
} from "@/domain/playbook/proposal";
import type { PortfolioContext } from "@/types/playbook-proposal";
import type { HoldingSnapshot, PortfolioValuation } from "@/types/portfolio";
import type { UserIntent } from "@/types/playbook-proposal";

function holdingSnapshot(quantity: number): HoldingSnapshot {
  return {
    holdingId: "h-1",
    instrument: { id: "ASML", assetType: "STOCK", name: "ASML Holding N.V.", ticker: "ASML", nativeCurrency: "EUR" },
    quantity,
    priceNative: { status: "AVAILABLE", value: 100, asOf: "2026-09-14T00:00:00Z" },
    valueBase: { status: "AVAILABLE", value: quantity * 100, asOf: "2026-09-14T00:00:00Z" },
    costBasisBase: { status: "AVAILABLE", value: quantity * 80, asOf: "2026-09-14T00:00:00Z" },
    unrealizedPnlBase: { status: "AVAILABLE", value: quantity * 20, asOf: "2026-09-14T00:00:00Z" },
    unrealizedReturnPct: { status: "AVAILABLE", value: 25, asOf: "2026-09-14T00:00:00Z" },
  };
}

const completeValuation: PortfolioValuation = {
  state: "COMPLETE",
  totalValueBase: 100000,
  totalCostBasisBase: { status: "AVAILABLE", value: 80000, asOf: "x" },
  totalUnrealizedPnlBase: { status: "AVAILABLE", value: 20000, asOf: "x" },
  totalUnrealizedReturnPct: { status: "AVAILABLE", value: 25, asOf: "x" },
};

const emptyEvidence = {
  price: { provenance: "MISSING" as const },
  momentum: { provenance: "MISSING" as const },
  fundamentals: { provenance: "MISSING" as const },
  valuation: { provenance: "MISSING" as const },
};

describe("createEmptyUserIntent", () => {
  it("starts every field MISSING/NOT_APPLICABLE — never a silent default", () => {
    const intent = createEmptyUserIntent();
    expect(intent.investmentRole).toEqual({ provenance: "MISSING" });
    expect(intent.confidence).toEqual({ provenance: "MISSING" });
    expect(intent.currentIntention).toEqual({ provenance: "MISSING" });
    expect(intent.corePortion).toEqual({ status: "NOT_APPLICABLE" });
    expect(intent.thesisTrajectory).toEqual({ provenance: "MISSING" });
  });
});

describe("corePortionForRole", () => {
  it("is NOT_APPLICABLE for any non-LONG_TERM_CORE role", () => {
    expect(corePortionForRole("GROWTH", { status: "PROVIDED", value: { fractionOfCurrentHolding: 0.5 } })).toEqual({
      status: "NOT_APPLICABLE",
    });
    expect(corePortionForRole(null, { status: "MISSING" })).toEqual({ status: "NOT_APPLICABLE" });
  });

  it("starts MISSING for LONG_TERM_CORE unless already answered", () => {
    expect(corePortionForRole("LONG_TERM_CORE", { status: "NOT_APPLICABLE" })).toEqual({ status: "MISSING" });
  });

  it("preserves an existing PROVIDED answer when role stays LONG_TERM_CORE", () => {
    const provided = { status: "PROVIDED" as const, value: { fractionOfCurrentHolding: 0.5 } };
    expect(corePortionForRole("LONG_TERM_CORE", provided)).toEqual(provided);
  });
});

describe("corePortionBucketToFraction — H.3 §11 approved mapping", () => {
  it("maps the three buckets to 0.75 / 0.50 / 0.25", () => {
    expect(corePortionBucketToFraction("MOST_OF_IT")).toBe(0.75);
    expect(corePortionBucketToFraction("ABOUT_HALF")).toBe(0.5);
    expect(corePortionBucketToFraction("A_SMALLER_PART")).toBe(0.25);
  });
});

describe("buildProposal — status transitions", () => {
  it("is GATHERING_INTENT while any field is unanswered", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 10,
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent: createEmptyUserIntent(),
      researchEvidence: emptyEvidence,
    });
    expect(proposal.status).toBe("GATHERING_INTENT");
  });

  it("is GATHERING_INTENT while any field is deferred (NOT_SURE/HELP_ME_ASSESS), never silently ready", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 10,
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: "GROWTH" },
      confidence: { provenance: "USER", value: "HIGH" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: { status: "NOT_APPLICABLE" },
      thesisTrajectory: { provenance: "USER", value: "NOT_SURE" },
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent,
      researchEvidence: emptyEvidence,
    });
    expect(proposal.status).toBe("GATHERING_INTENT");
    expect(proposal.proposedConfiguration.thesisHealthPreview).toBeUndefined();
  });

  it("is READY_FOR_REVIEW once every field is concretely answered", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 10,
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: "GROWTH" },
      confidence: { provenance: "USER", value: "HIGH" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: { status: "NOT_APPLICABLE" },
      thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent,
      researchEvidence: emptyEvidence,
    });
    expect(proposal.status).toBe("READY_FOR_REVIEW");
    expect(proposal.proposedConfiguration.thesisHealthPreview).toEqual({ provenance: "DETERMINISTIC", value: "INTACT" });
  });

  it("requires corePortion to be resolved (not MISSING) for LONG_TERM_CORE before READY_FOR_REVIEW", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 10,
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: "LONG_TERM_CORE" },
      confidence: { provenance: "USER", value: "HIGH" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: { status: "MISSING" },
      thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent,
      researchEvidence: emptyEvidence,
    });
    expect(proposal.status).toBe("GATHERING_INTENT");
  });
});

describe("buildProposal — per-role numeric mapping (H.2 §2, approved)", () => {
  it.each([
    ["LONG_TERM_CORE", 20, 30, 35],
    ["GROWTH", 10, 18, 23],
    ["TACTICAL", 3, 8, 13],
  ] as const)("%s -> target %d-%d%%, ceiling %d%%", (role, minPct, maxPct, ceilingPct) => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 5,
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: role },
      confidence: { provenance: "USER", value: "HIGH" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: role === "LONG_TERM_CORE" ? { status: "PROVIDED", value: { fractionOfCurrentHolding: 0.5 } } : { status: "NOT_APPLICABLE" },
      thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent,
      researchEvidence: emptyEvidence,
    });
    const range = proposal.proposedConfiguration.targetAllocationRange;
    const ceiling = proposal.proposedConfiguration.accumulationCeilingPct;
    expect(range.provenance).toBe("DETERMINISTIC");
    expect(ceiling.provenance).toBe("DETERMINISTIC");
    if (range.provenance === "DETERMINISTIC" && ceiling.provenance === "DETERMINISTIC") {
      expect(range.value).toEqual({ minPct, maxPct });
      expect(ceiling.value).toBe(ceilingPct);
    }
  });
});

describe("buildProposal — ±8% core materialization preview (H.2 §3, approved)", () => {
  it("bands coreCenterShares by ±8%, floor/ceil respectively", () => {
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: holdingSnapshot(1000),
      valuation: completeValuation,
      currentWeightPct: 25,
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: "LONG_TERM_CORE" },
      confidence: { provenance: "USER", value: "HIGH" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: { status: "PROVIDED", value: { fractionOfCurrentHolding: 0.5 } }, // ABOUT_HALF
      thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    };
    const proposal = buildProposal({
      subject: { instrumentId: "ASML", holdingId: "h-1" },
      portfolioContext,
      userIntent,
      researchEvidence: emptyEvidence,
    });
    // center = 0.5 * 1000 = 500; band = floor(500*0.92)=460..ceil(500*1.08)=540
    expect(proposal.proposedConfiguration.corePosition).toEqual({
      provenance: "DETERMINISTIC",
      value: { minShares: 460, maxShares: 540 },
    });
  });
});
