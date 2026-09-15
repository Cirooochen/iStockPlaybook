// Phase G.2 — Portfolio-page concentration view for STOCK holdings.
// G.6 extends this with a live-derived stance.
import { describe, expect, it } from "vitest";
import { derivePortfolioSnapshot } from "@/domain/portfolio/snapshot";
import { deriveStockConcentrationView } from "@/domain/portfolio/stock-concentration-view";
import { holdingsSeed } from "@/data/holdings-seed";
import { stockPlaybookConfigsSeed } from "@/data/stock-playbook-seed";
import { quotesSeed, fxRatesSeed } from "@/data/market-data-seed";
import type { Holding } from "@/types/portfolio";

const asOf = "2026-09-14T12:00:00+02:00";

describe("deriveStockConcentrationView", () => {
  it("classifies Unity as overweight against its configured target, matching the existing seed", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, quotesSeed, fxRatesSeed, "EUR", asOf);
    const unity = snapshot.holdings.find((h) => h.holdingId === "h-unity")!;
    const config = stockPlaybookConfigsSeed.find((c) => c.instrumentId === "U");

    const view = deriveStockConcentrationView(unity, snapshot.valuation, config);

    expect(view).not.toBeNull();
    expect(view!.weightPct).toBeCloseTo(58.6, 1);
    expect(view!.targetMaxPct).toBe(45);
    expect(view!.state).toBe("SEVERELY_OVERWEIGHT");
    // Matches the stored seed stance here — but only because the seed's
    // weight and its last-recorded stance happen to agree, not because
    // this is read from config.playbook.stance (see the next test, where
    // a changed weight makes the two diverge).
    expect(view!.stance).toBe("HOLD_GRADUALLY_TRIM");
  });

  it("derives a live stance that diverges from the stale stored config.playbook.stance once weight changes", () => {
    // Same portfolio, but Unity's quantity is edited down (as it would be
    // after a Portfolio-page edit or a SELL) so its weight moves from
    // SEVERELY_OVERWEIGHT into WITHIN_TARGET.
    const editedHoldings: Holding[] = holdingsSeed.map((h) =>
      h.instrument.id === "U" ? { ...h, quantity: 500 } : h
    );
    const snapshot = derivePortfolioSnapshot(editedHoldings, quotesSeed, fxRatesSeed, "EUR", asOf);
    const unity = snapshot.holdings.find((h) => h.instrument.id === "U")!;
    const config = stockPlaybookConfigsSeed.find((c) => c.instrumentId === "U")!;

    const view = deriveStockConcentrationView(unity, snapshot.valuation, config);

    expect(view).not.toBeNull();
    expect(view!.state).toBe("WITHIN_TARGET");
    // The stored config still says HOLD_GRADUALLY_TRIM (seed data, never
    // mutated by this test) — the live view must NOT echo it.
    expect(config.playbook.stance).toBe("HOLD_GRADUALLY_TRIM");
    expect(view!.stance).toBe("HOLD");
    expect(view!.stance).not.toBe(config.playbook.stance);
  });

  it("is null for a STOCK holding with no linked config (e.g. ASML)", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, quotesSeed, fxRatesSeed, "EUR", asOf);
    const asml = snapshot.holdings.find((h) => h.holdingId === "h-asml")!;
    const view = deriveStockConcentrationView(asml, snapshot.valuation, undefined);
    expect(view).toBeNull();
  });

  it("is null for a non-STOCK holding even if (hypothetically) a config were passed", () => {
    const snapshot = derivePortfolioSnapshot(holdingsSeed, quotesSeed, fxRatesSeed, "EUR", asOf);
    const cash = snapshot.holdings.find((h) => h.holdingId === "h-cash-eur")!;
    const config = stockPlaybookConfigsSeed[0];
    const view = deriveStockConcentrationView(cash, snapshot.valuation, config);
    expect(view).toBeNull();
  });

  it("is null when the portfolio valuation is not COMPLETE, even for a holding priced fine on its own", () => {
    const partialQuotes = new Map(quotesSeed);
    partialQuotes.delete("BTC");
    const snapshot = derivePortfolioSnapshot(holdingsSeed, partialQuotes, fxRatesSeed, "EUR", asOf);
    const unity = snapshot.holdings.find((h) => h.holdingId === "h-unity")!;
    const config = stockPlaybookConfigsSeed.find((c) => c.instrumentId === "U");

    expect(snapshot.valuation.state).toBe("PARTIAL");
    expect(deriveStockConcentrationView(unity, snapshot.valuation, config)).toBeNull();
  });
});
