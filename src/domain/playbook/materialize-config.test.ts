import { describe, expect, it } from "vitest";
import { materializeStockPlaybookConfig } from "@/domain/playbook/materialize-config";
import type { Holding, HoldingSnapshot, PortfolioValuation } from "@/types/portfolio";
import type { PlaybookProposal, PortfolioContext, UserIntent } from "@/types/playbook-proposal";
import { buildProposal } from "@/domain/playbook/proposal";

const NOW = "2026-09-14T12:00:00Z";

const asmlHolding: Holding = {
  id: "h-asml",
  instrument: { id: "ASML", assetType: "STOCK", name: "ASML Holding N.V.", ticker: "ASML", exchange: "AMS", nativeCurrency: "EUR" },
  quantity: 12,
  costBasis: { status: "AVAILABLE", averageCostNative: 680, asOf: NOW },
};

function holdingSnapshot(quantity: number): HoldingSnapshot {
  return {
    holdingId: "h-asml",
    instrument: asmlHolding.instrument,
    quantity,
    priceNative: { status: "AVAILABLE", value: 700, asOf: NOW },
    valueBase: { status: "AVAILABLE", value: quantity * 700, asOf: NOW },
    costBasisBase: { status: "AVAILABLE", value: quantity * 680, asOf: NOW },
    unrealizedPnlBase: { status: "AVAILABLE", value: quantity * 20, asOf: NOW },
    unrealizedReturnPct: { status: "AVAILABLE", value: 2.9, asOf: NOW },
  };
}

const emptyEvidence = {
  price: { provenance: "MISSING" as const },
  momentum: { provenance: "MISSING" as const },
  fundamentals: { provenance: "MISSING" as const },
  valuation: { provenance: "MISSING" as const },
};

function baseUserIntent(overrides: Partial<UserIntent> = {}): UserIntent {
  return {
    investmentRole: { provenance: "USER", value: "GROWTH" },
    confidence: { provenance: "USER", value: "HIGH" },
    currentIntention: { provenance: "USER", value: "HOLD" },
    corePortion: { status: "NOT_APPLICABLE" },
    thesisTrajectory: { provenance: "USER", value: "NO_MEANINGFUL_CHANGE" },
    ...overrides,
  };
}

function buildTestProposal(args: { quantity: number; currentWeightPct: number | null; userIntent: UserIntent }): PlaybookProposal {
  const valuation: PortfolioValuation =
    args.currentWeightPct === null
      ? { state: "PARTIAL", knownValueBase: 0, excludedHoldingIds: ["h-asml"] }
      : {
          state: "COMPLETE",
          totalValueBase: (args.quantity * 700) / (args.currentWeightPct / 100),
          totalCostBasisBase: { status: "AVAILABLE", value: 1, asOf: NOW },
          totalUnrealizedPnlBase: { status: "AVAILABLE", value: 1, asOf: NOW },
          totalUnrealizedReturnPct: { status: "AVAILABLE", value: 1, asOf: NOW },
        };
  const portfolioContext: PortfolioContext = {
    holdingSnapshot: holdingSnapshot(args.quantity),
    valuation,
    currentWeightPct: args.currentWeightPct,
  };
  return buildProposal({
    subject: { instrumentId: "ASML", holdingId: "h-asml" },
    portfolioContext,
    userIntent: args.userIntent,
    researchEvidence: emptyEvidence,
  });
}

describe("materializeStockPlaybookConfig — per-role Strategy mapping (H.2 §2, approved)", () => {
  it.each([
    ["LONG_TERM_CORE" as const, 20, 30, 35],
    ["GROWTH" as const, 10, 18, 23],
    ["TACTICAL" as const, 3, 8, 13],
  ])("%s -> mediumTermTarget %d-%d%%, shortTermMax %d%%", (role, minPct, maxPct, ceilingPct) => {
    const userIntent = baseUserIntent({
      investmentRole: { provenance: "USER", value: role },
      corePortion: role === "LONG_TERM_CORE" ? { status: "PROVIDED", value: { fractionOfCurrentHolding: 0.5 } } : { status: "NOT_APPLICABLE" },
    });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.strategy.mediumTermTargetMinPct).toBe(minPct);
    expect(result.config.strategy.mediumTermTargetMaxPct).toBe(maxPct);
    expect(result.config.strategy.shortTermMaxWeightPct).toBe(ceilingPct);
  });
});

describe("materializeStockPlaybookConfig — Core Protection 25/50/75 + ±8% band (H.2 §3 / H.3 §11, approved)", () => {
  it.each([
    [0.25, 200, 46, 54], // center = round(0.25*200)=50 -> floor(50*0.92)=46, ceil(50*1.08)=54
    [0.5, 200, 92, 108], // center=100 -> floor(92)=92, ceil(108)=108
    [0.75, 200, 138, 162], // center=150 -> floor(138)=138, ceil(162)=162
  ])("fraction %f of %d shares at confirmation -> core %d-%d", (fraction, quantity, expectedMin, expectedMax) => {
    const userIntent = baseUserIntent({
      investmentRole: { provenance: "USER", value: "LONG_TERM_CORE" },
      corePortion: { status: "PROVIDED", value: { fractionOfCurrentHolding: fraction } },
    });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    // currentSharesAtConfirmation is passed independently of the proposal's
    // frozen holdingSnapshot.quantity — materialization uses shares AT
    // CONFIRMATION TIME, not whatever quantity the proposal preview saw.
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], quantity, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.strategy.coreSharesMin).toBe(expectedMin);
    expect(result.config.strategy.coreSharesMax).toBe(expectedMax);
  });
});

describe("materializeStockPlaybookConfig — ThesisTrajectory -> ThesisHealth mapping (H.2 §4)", () => {
  it.each([
    ["GETTING_STRONGER" as const, "STRENGTHENING" as const],
    ["NO_MEANINGFUL_CHANGE" as const, "INTACT" as const],
    ["SOME_DOUBTS" as const, "MIXED" as const],
    ["GETTING_WEAKER" as const, "WEAKENING" as const],
    ["REASONS_NO_LONGER_HOLD" as const, "BROKEN" as const],
  ])("%s -> %s", (trajectory, expectedHealth) => {
    const userIntent = baseUserIntent({ thesisTrajectory: { provenance: "USER", value: trajectory } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.playbook.thesisHealth).toBe(expectedHealth);
  });

  it("rejects confirmation when thesis trajectory is NOT_SURE — never defaults to INTACT", () => {
    const userIntent = baseUserIntent({ thesisTrajectory: { provenance: "USER", value: "NOT_SURE" } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result).toEqual({ ok: false, reason: "UNRESOLVED_ANSWERS" });
  });
});

describe("materializeStockPlaybookConfig — unresolved input rejection", () => {
  it("rejects when investment role is unanswered", () => {
    const userIntent = baseUserIntent({ investmentRole: { provenance: "MISSING" } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "UNRESOLVED_ANSWERS",
    });
  });

  it("rejects when investment role is deferred (NOT_SURE)", () => {
    const userIntent = baseUserIntent({ investmentRole: { provenance: "USER", value: "NOT_SURE" } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "UNRESOLVED_ANSWERS",
    });
  });

  it("rejects when confidence is deferred (HELP_ME_ASSESS)", () => {
    const userIntent = baseUserIntent({ confidence: { provenance: "USER", value: "HELP_ME_ASSESS" } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "UNRESOLVED_ANSWERS",
    });
  });

  it("rejects when current intention is deferred (NOT_SURE), even though it's Proposal-only", () => {
    const userIntent = baseUserIntent({ currentIntention: { provenance: "USER", value: "NOT_SURE" } });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "UNRESOLVED_ANSWERS",
    });
  });

  it("rejects when core protection is applicable (LONG_TERM_CORE) but still MISSING", () => {
    const userIntent = baseUserIntent({
      investmentRole: { provenance: "USER", value: "LONG_TERM_CORE" },
      corePortion: { status: "MISSING" },
    });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "UNRESOLVED_ANSWERS",
    });
  });
});

describe("materializeStockPlaybookConfig — discrepancy gating (H.2 §6, approved)", () => {
  it("rejects with HARD_DISCREPANCY when BUILD intent conflicts with a BROKEN thesis (HC-002)", () => {
    const userIntent = baseUserIntent({
      currentIntention: { provenance: "USER", value: "BUILD" },
      thesisTrajectory: { provenance: "USER", value: "REASONS_NO_LONGER_HOLD" },
    });
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "HARD_DISCREPANCY",
    });
  });

  it("rejects with HARD_DISCREPANCY when BUILD intent is already blocked by the proposed ceiling (HC-001)", () => {
    const userIntent = baseUserIntent({ currentIntention: { provenance: "USER", value: "BUILD" } });
    // GROWTH ceiling = 23%; weight already at 30% -> HC-001 fires.
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 30, userIntent });
    expect(materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW)).toEqual({
      ok: false,
      reason: "HARD_DISCREPANCY",
    });
  });

  it("rejects with SOFT_DISCREPANCY_NOT_ACKNOWLEDGED until acknowledged, then succeeds", () => {
    const userIntent = baseUserIntent({ currentIntention: { provenance: "USER", value: "REDUCE" } });
    // GROWTH target 10-18%; weight 12% is WITHIN_TARGET -> SOFT discrepancy.
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 12, userIntent });

    const notAcknowledged = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(notAcknowledged).toEqual({ ok: false, reason: "SOFT_DISCREPANCY_NOT_ACKNOWLEDGED" });

    const acknowledged = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, true, NOW);
    expect(acknowledged.ok).toBe(true);
  });
});

describe("materializeStockPlaybookConfig — successful creation", () => {
  it("produces a valid StockPlaybookConfig for a non-Unity stock (ASML)", () => {
    const userIntent = baseUserIntent();
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.instrumentId).toBe("ASML");
    expect(result.config.playbook.confidence).toBe("HIGH");
    expect(result.config.playbook.version).toBe(1);
    expect(result.config.playbook.updatedAt).toBe(NOW);
    expect(result.config.playbook.summary.length).toBeGreaterThan(0);
    // Dead fields (H.2 §7) — present with the documented placeholder values.
    expect(result.config.strategy.horizon).toBe("");
    expect(result.config.strategy.tacticalSharesMin).toBe(0);
    expect(result.config.strategy.tacticalSharesMax).toBe(0);
    expect(result.config.strategy.preferredTargetWeightPct).toBeUndefined();
    expect(result.config.strategy.benchmarkInstrumentId).toBeUndefined();
  });

  it("rejects when the subject instrument isn't a STOCK holding (INVALID_SUBJECT)", () => {
    const userIntent = baseUserIntent();
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const nonStockHolding: Holding = {
      ...asmlHolding,
      instrument: { ...asmlHolding.instrument, assetType: "ETF" },
    };
    const result = materializeStockPlaybookConfig(proposal, [nonStockHolding], 12, false, NOW);
    expect(result).toEqual({ ok: false, reason: "INVALID_SUBJECT" });
  });
});

describe("materializeStockPlaybookConfig — Portfolio/Engine source-of-truth invariants", () => {
  it("never mutates the holdings array passed in", () => {
    const userIntent = baseUserIntent();
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const holdingsBefore = [asmlHolding];
    const snapshot = JSON.parse(JSON.stringify(holdingsBefore));
    materializeStockPlaybookConfig(proposal, holdingsBefore, 12, false, NOW);
    expect(holdingsBefore).toEqual(snapshot);
  });

  it("never embeds portfolio-derived values (shares/value/weight) into the produced Strategy/Playbook", () => {
    const userIntent = baseUserIntent();
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const strategyKeys = Object.keys(result.config.strategy);
    const playbookKeys = Object.keys(result.config.playbook);
    for (const forbidden of ["shares", "quantity", "weight", "portfolioWeightPct", "valueEur", "valueBase"]) {
      expect(strategyKeys).not.toContain(forbidden);
      expect(playbookKeys).not.toContain(forbidden);
    }
  });

  it("returns a config with no provenance metadata at all — the confirmation boundary (H.1 §1.2)", () => {
    const userIntent = baseUserIntent();
    const proposal = buildTestProposal({ quantity: 12, currentWeightPct: 5, userIntent });
    const result = materializeStockPlaybookConfig(proposal, [asmlHolding], 12, false, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.config)).not.toContain("provenance");
  });
});
