// Portfolio Snapshot derivation — Phase G.1. Design:
// docs/phase-g0-real-portfolio-data-model.md §1.4/§1.5, §2.
import { describe, expect, it } from "vitest";
import {
  derivePortfolioSnapshot,
  holdingWeightPct,
  toStockEngineInputs,
  createStockPlaybookConfig,
} from "@/domain/portfolio/snapshot";
import { holdingsSeed } from "@/data/holdings-seed";
import { stockPlaybookConfigsSeed } from "@/data/stock-playbook-seed";
import { quotesSeed, fxRatesSeed } from "@/data/market-data-seed";
import type { Holding } from "@/types/portfolio";
import type { FxRate } from "@/types/market-data";

const asOf = "2026-09-14T12:00:00+02:00";

// The same seed quotes the Portfolio page uses (src/data/market-data-seed.ts)
// — single source of truth for these test-fixture prices, already
// EUR-denominated (see holdings-seed.ts's nativeCurrency note), so
// baseCurrency "EUR" requires no FX for any of these.
const fullQuotes = quotesSeed;
const noFx = fxRatesSeed;

describe("derivePortfolioSnapshot — empty portfolio", () => {
  it("is COMPLETE with totalValueBase 0, not UNAVAILABLE", () => {
    const snapshot = derivePortfolioSnapshot([], fullQuotes, noFx, "EUR", asOf);
    expect(snapshot.valuation).toEqual({
      state: "COMPLETE",
      totalValueBase: 0,
      totalCostBasisBase: { status: "AVAILABLE", value: 0, asOf },
      totalUnrealizedPnlBase: { status: "AVAILABLE", value: 0, asOf },
      totalUnrealizedReturnPct: { status: "MISSING" },
    });
  });
});

describe("derivePortfolioSnapshot — full holdings-seed, all priced (COMPLETE)", () => {
  const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);

  it("reproduces portfolio-seed.ts's €62,280 total exactly", () => {
    expect(snapshot.valuation.state).toBe("COMPLETE");
    if (snapshot.valuation.state !== "COMPLETE") return;
    expect(snapshot.valuation.totalValueBase).toBeCloseTo(62280, 2);
  });

  it("computes Unity's holding value matching the existing seed (€36,494.92)", () => {
    const unity = snapshot.holdings.find((h) => h.holdingId === "h-unity")!;
    expect(unity.valueBase).toEqual({ status: "AVAILABLE", value: 36494.92, asOf });
    expect(unity.costBasisBase).toEqual({ status: "AVAILABLE", value: 25039.52, asOf });
    expect(unity.unrealizedPnlBase.status).toBe("AVAILABLE");
    if (unity.unrealizedPnlBase.status === "AVAILABLE") {
      expect(unity.unrealizedPnlBase.value).toBeCloseTo(11455.4, 2);
    }
    if (unity.unrealizedReturnPct.status === "AVAILABLE") {
      expect(unity.unrealizedReturnPct.value).toBeCloseTo(45.75, 1);
    } else {
      throw new Error("expected unrealizedReturnPct to be AVAILABLE");
    }
  });

  it("gives CASH a trivial priceNative of 1 and no cost-basis/P&L concept", () => {
    const cash = snapshot.holdings.find((h) => h.holdingId === "h-cash-eur")!;
    expect(cash.priceNative).toEqual({ status: "AVAILABLE", value: 1, asOf });
    expect(cash.valueBase).toEqual({ status: "AVAILABLE", value: 3768.68, asOf });
    expect(cash.costBasisBase).toEqual({ status: "NOT_APPLICABLE" });
    expect(cash.unrealizedPnlBase).toEqual({ status: "NOT_APPLICABLE" });
    expect(cash.unrealizedReturnPct).toEqual({ status: "NOT_APPLICABLE" });
  });
});

describe("derivePortfolioSnapshot — one holding unpriced (PARTIAL)", () => {
  it("excludes only the unpriced holding, and never labels knownValueBase as a total", () => {
    const partialQuotes = new Map(fullQuotes);
    partialQuotes.delete("BTC"); // BTC's quote MISSING

    const snapshot = derivePortfolioSnapshot(holdingsSeed, partialQuotes, noFx, "EUR", asOf);

    expect(snapshot.valuation.state).toBe("PARTIAL");
    if (snapshot.valuation.state !== "PARTIAL") return;
    expect(snapshot.valuation.excludedHoldingIds).toEqual(["h-btc"]);
    // 62280 total minus BTC's known 4976.4 contribution.
    expect(snapshot.valuation.knownValueBase).toBeCloseTo(62280 - 4976.4, 2);
  });
});

describe("derivePortfolioSnapshot — every holding unpriced (UNAVAILABLE)", () => {
  it("reports UNAVAILABLE, not a fabricated zero total", () => {
    // Excludes the CASH holding — cash always resolves from quantity alone
    // (no quote needed), so a mix including cash would be PARTIAL, not
    // UNAVAILABLE. This isolates the all-non-cash-unpriced case.
    const nonCashHoldings = holdingsSeed.filter((h) => h.instrument.assetType !== "CASH");
    const snapshot = derivePortfolioSnapshot(nonCashHoldings, new Map(), noFx, "EUR", asOf);
    expect(snapshot.valuation).toEqual({ state: "UNAVAILABLE" });
  });
});

describe("derivePortfolioSnapshot — MISSING != 0 (missing FX never falls back to 1:1)", () => {
  const usdCash: Holding = {
    id: "h-usd-cash",
    instrument: { id: "CASH-USD", assetType: "CASH", name: "Cash (USD)", nativeCurrency: "USD" },
    quantity: 1000,
    costBasis: { status: "NOT_APPLICABLE" },
  };

  it("a CASH holding in a non-base currency with no FX rate is MISSING, never 0 or 1:1", () => {
    const snapshot = derivePortfolioSnapshot([usdCash], new Map(), noFx, "EUR", asOf);
    const holding = snapshot.holdings[0];
    expect(holding.valueBase).toEqual({ status: "MISSING" });
    expect(snapshot.valuation).toEqual({ state: "UNAVAILABLE" });
  });

  it("resolves once a real FX rate is supplied", () => {
    const fx = new Map<string, FxRate>([
      ["USD->EUR", { from: "USD", to: "EUR", rate: { status: "AVAILABLE", value: 0.9, asOf } }],
    ]);
    const snapshot = derivePortfolioSnapshot([usdCash], new Map(), fx, "EUR", asOf);
    expect(snapshot.holdings[0].valueBase).toEqual({ status: "AVAILABLE", value: 900, asOf });
  });
});

describe("holdingWeightPct", () => {
  const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);
  const unity = snapshot.holdings.find((h) => h.holdingId === "h-unity")!;

  it("matches the existing seed's 58.6% weight when COMPLETE", () => {
    expect(holdingWeightPct(unity, snapshot.valuation)).toBeCloseTo(58.6, 1);
  });

  it("is null outside COMPLETE, even for a holding that priced fine on its own", () => {
    const partialQuotes = new Map(fullQuotes);
    partialQuotes.delete("BTC");
    const partial = derivePortfolioSnapshot(holdingsSeed, partialQuotes, noFx, "EUR", asOf);
    const unityPartial = partial.holdings.find((h) => h.holdingId === "h-unity")!;
    expect(holdingWeightPct(unityPartial, partial.valuation)).toBeNull();
  });

  it("is null for a holding whose own value is unavailable", () => {
    const partialQuotes = new Map(fullQuotes);
    partialQuotes.delete("BTC");
    const partial = derivePortfolioSnapshot(holdingsSeed, partialQuotes, noFx, "EUR", asOf);
    const btc = partial.holdings.find((h) => h.holdingId === "h-btc")!;
    expect(holdingWeightPct(btc, partial.valuation)).toBeNull();
  });
});

describe("createStockPlaybookConfig", () => {
  it("builds a config for a real STOCK instrument", () => {
    const config = createStockPlaybookConfig(
      "U",
      holdingsSeed,
      stockPlaybookConfigsSeed[0].strategy,
      stockPlaybookConfigsSeed[0].playbook
    );
    expect(config).toEqual({
      instrumentId: "U",
      strategy: stockPlaybookConfigsSeed[0].strategy,
      playbook: stockPlaybookConfigsSeed[0].playbook,
    });
  });

  it("rejects a non-STOCK instrument (only STOCK supports the Playbook)", () => {
    const config = createStockPlaybookConfig(
      "VWRL", // an ETF holding
      holdingsSeed,
      stockPlaybookConfigsSeed[0].strategy,
      stockPlaybookConfigsSeed[0].playbook
    );
    expect(config).toBeNull();
  });

  it("rejects an unknown instrument id", () => {
    const config = createStockPlaybookConfig(
      "NOPE",
      holdingsSeed,
      stockPlaybookConfigsSeed[0].strategy,
      stockPlaybookConfigsSeed[0].playbook
    );
    expect(config).toBeNull();
  });
});

describe("toStockEngineInputs — the fail-safe boundary to the Stock Position Engine", () => {
  it("reproduces today's Unity Position when the whole portfolio is COMPLETE", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);
    const result = toStockEngineInputs(snapshot, "h-unity", stockPlaybookConfigsSeed[0]);

    expect(result).not.toBeNull();
    expect(result!.position.shares).toBe(902);
    expect(result!.position.averageCostEur).toBeCloseTo(27.76, 2);
    expect(result!.position.valueEur).toBeCloseTo(36494.92, 2);
    expect(result!.position.unrealizedReturnPct).toBeCloseTo(45.75, 1);
    expect(result!.position.portfolioWeightPct).toBeCloseTo(58.6, 1);
    expect(result!.portfolioTotalEur).toBeCloseTo(62280, 2);
    expect(result!.strategy).toBe(stockPlaybookConfigsSeed[0].strategy);
  });

  it("returns null when the portfolio valuation is PARTIAL — even though Unity itself priced fine", () => {
    // An unrelated holding (BTC) is unpriced. The denominator (portfolio
    // total) is compromised, so the Playbook must not receive any inputs —
    // not even for a STOCK holding whose own value is known.
    const partialQuotes = new Map(fullQuotes);
    partialQuotes.delete("BTC");
    const snapshot = derivePortfolioSnapshot(holdingsSeed, partialQuotes, noFx, "EUR", asOf);

    expect(snapshot.valuation.state).toBe("PARTIAL");
    const result = toStockEngineInputs(snapshot, "h-unity", stockPlaybookConfigsSeed[0]);
    expect(result).toBeNull();
  });

  it("returns null when the portfolio valuation is UNAVAILABLE", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, new Map(), noFx, "EUR", asOf);
    const result = toStockEngineInputs(snapshot, "h-unity", stockPlaybookConfigsSeed[0]);
    expect(result).toBeNull();
  });

  it("returns null for a holding that isn't STOCK", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);
    const result = toStockEngineInputs(snapshot, "h-vwrl", stockPlaybookConfigsSeed[0]);
    expect(result).toBeNull();
  });

  it("returns null when the config's instrumentId doesn't match the resolved holding", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);
    const mismatchedConfig = { ...stockPlaybookConfigsSeed[0], instrumentId: "ASML" };
    const result = toStockEngineInputs(snapshot, "h-unity", mismatchedConfig);
    expect(result).toBeNull();
  });

  it("returns null for an unknown holding id", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, fullQuotes, noFx, "EUR", asOf);
    const result = toStockEngineInputs(snapshot, "h-does-not-exist", stockPlaybookConfigsSeed[0]);
    expect(result).toBeNull();
  });
});
