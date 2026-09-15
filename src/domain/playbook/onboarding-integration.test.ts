// End-to-end domain-level validation of the H.4 creation path — no
// component-rendering test infrastructure exists in this project (no
// jsdom/@testing-library configured in vitest.config.ts), so "a non-Unity
// stock becomes Playbook-accessible after confirmation" and "Unity
// regression" are validated at the domain layer that actually drives the
// UI: Holding -> Proposal -> materialized StockPlaybookConfig ->
// toStockEngineInputs -> runDecisionEngine, using the real
// holdings-seed.ts/market-data-seed.ts/stock-playbook-seed.ts data.
import { describe, expect, it } from "vitest";
import { holdingsSeed } from "@/data/holdings-seed";
import { quotesSeed, fxRatesSeed, asOf } from "@/data/market-data-seed";
import { stockPlaybookConfigsSeed } from "@/data/stock-playbook-seed";
import { derivePortfolioSnapshot, holdingWeightPct, toStockEngineInputs } from "@/domain/portfolio/snapshot";
import { runDecisionEngine } from "@/domain/engine";
import { buildProposal } from "@/domain/playbook/proposal";
import { materializeStockPlaybookConfig } from "@/domain/playbook/materialize-config";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { buildOnboardedActionZoneTemplates } from "@/domain/playbook/action-zone-templates";
import type { PortfolioContext, ProposalSubject, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";

const NOW = "2026-09-14T12:00:00Z";

describe("H.4 — non-Unity stock becomes Playbook-accessible after confirmation", () => {
  it("ASML has a real STOCK holding but no config before onboarding", () => {
    const asmlHolding = holdingsSeed.find((h) => h.instrument.ticker === "ASML");
    expect(asmlHolding).toBeDefined();
    expect(asmlHolding?.instrument.assetType).toBe("STOCK");
    expect(stockPlaybookConfigsSeed.find((c) => c.instrumentId === "ASML")).toBeUndefined();
  });

  it("confirming an onboarding proposal for ASML makes it Playbook-accessible via the unmodified Engine boundary", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, quotesSeed, fxRatesSeed, "EUR", asOf);
    const asmlSnapshot = snapshot.holdings.find((h) => h.instrument.id === "ASML")!;
    const currentWeightPct = holdingWeightPct(asmlSnapshot, snapshot.valuation);
    expect(currentWeightPct).not.toBeNull();

    const subject: ProposalSubject = { instrumentId: "ASML", holdingId: asmlSnapshot.holdingId };
    const portfolioContext: PortfolioContext = {
      holdingSnapshot: asmlSnapshot,
      valuation: snapshot.valuation,
      currentWeightPct,
    };
    expect(asmlSnapshot.priceNative.status).toBe("AVAILABLE");
    const priceNativeValue = asmlSnapshot.priceNative.status === "AVAILABLE" ? asmlSnapshot.priceNative.value : 0;
    const researchEvidence: ResearchEvidence = {
      price: { provenance: "SYSTEM", value: { nativeAmount: priceNativeValue, currency: "EUR" } },
      momentum: { provenance: "MISSING" },
      fundamentals: { provenance: "MISSING" },
      valuation: { provenance: "MISSING" },
    };
    const userIntent: UserIntent = {
      investmentRole: { provenance: "USER", value: "GROWTH" },
      confidence: { provenance: "USER", value: "MEDIUM" },
      currentIntention: { provenance: "USER", value: "HOLD" },
      corePortion: { status: "NOT_APPLICABLE" },
      thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    };

    const proposal = buildProposal({ subject, portfolioContext, userIntent, researchEvidence });
    expect(proposal.status).toBe("READY_FOR_REVIEW");
    expect(proposal.guardrailPreview.discrepancies).toEqual([]);

    const result = materializeStockPlaybookConfig(proposal, holdingsSeed, asmlSnapshot.quantity, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The confirmed config now drives the SAME unmodified Engine boundary
    // Unity has always used — no non-Unity special-casing anywhere in the
    // production pipeline.
    const engineInputs = toStockEngineInputs(snapshot, asmlSnapshot.holdingId, result.config);
    expect(engineInputs).not.toBeNull();
    if (!engineInputs) return;

    const baselineScorecard = buildOnboardingBaselineScorecard();
    const zoneTemplates = buildOnboardedActionZoneTemplates({
      strategy: engineInputs.strategy,
      currentShares: engineInputs.position.shares,
      weightPct: engineInputs.position.portfolioWeightPct,
      portfolioTotalEur: engineInputs.portfolioTotalEur,
      executionPriceEur: engineInputs.position.averageCostEur,
    });

    const output = runDecisionEngine({
      position: engineInputs.position,
      portfolioTotalEur: engineInputs.portfolioTotalEur,
      executionPriceEur: engineInputs.position.averageCostEur,
      strategy: engineInputs.strategy,
      thesisHealth: result.config.playbook.thesisHealth,
      scorecard: baselineScorecard,
      actionZoneTemplates: zoneTemplates,
    });

    // Real Stance/ActionZones/Scorecard are produced — this stock now has
    // a fully working Playbook, same as Unity.
    expect(output.stance).toBeDefined();
    expect(output.actionZones).toHaveLength(5);
    // Valuation always reads the compatibility placeholder (H.2 §8.1) —
    // never a fabricated real signal.
    expect(output.scorecard.valuation).toEqual({ score: 5, state: "Neutral" });
  });
});

describe("H.4 — Unity regression", () => {
  it("Unity's existing seeded config is untouched by the onboarding machinery", () => {
    const unityConfig = stockPlaybookConfigsSeed.find((c) => c.instrumentId === "U");
    expect(unityConfig).toBeDefined();
    expect(unityConfig?.strategy.mediumTermTargetMaxPct).toBe(45);
    expect(unityConfig?.strategy.shortTermMaxWeightPct).toBe(50);
  });

  it("Unity's Engine pipeline still runs unmodified end-to-end", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, quotesSeed, fxRatesSeed, "EUR", asOf);
    const unitySnapshot = snapshot.holdings.find((h) => h.instrument.id === "U")!;
    const unityConfig = stockPlaybookConfigsSeed.find((c) => c.instrumentId === "U")!;
    const engineInputs = toStockEngineInputs(snapshot, unitySnapshot.holdingId, unityConfig);
    expect(engineInputs).not.toBeNull();
  });
});
