// Phase G.6 — BUY/SELL must update the real Holding + Cash portfolio
// state, funded from/returned to a real Cash holding, using the exact
// same accounting.ts formulas as before (deterministic accounting).
import { describe, expect, it } from "vitest";
import { applyTransactionToHoldings } from "@/domain/portfolio/apply-transaction";
import type { Holding } from "@/types/portfolio";
import type { Position } from "@/types/playbook";

const asOf = "2026-09-14T12:00:00+02:00";

const unityHolding: Holding = {
  id: "h-unity",
  instrument: { id: "U", assetType: "STOCK", name: "Unity Software Inc.", ticker: "U", nativeCurrency: "EUR" },
  quantity: 902,
  costBasis: { status: "AVAILABLE", averageCostNative: 27.76, asOf: "2026-01-01T00:00:00Z" },
};

const cashHolding: Holding = {
  id: "h-cash",
  instrument: { id: "CASH-EUR", assetType: "CASH", name: "Cash (EUR)", nativeCurrency: "EUR" },
  quantity: 10000,
  costBasis: { status: "NOT_APPLICABLE" },
};

const unityPosition: Position = {
  shares: 902,
  averageCostEur: 27.76,
  valueEur: 36494.92,
  unrealizedReturnPct: 45.75,
  portfolioWeightPct: 58.6,
};

function baseInput(overrides: Partial<Parameters<typeof applyTransactionToHoldings>[0]> = {}) {
  return {
    holdings: [unityHolding, cashHolding],
    stockHoldingId: "h-unity",
    type: "BUY" as const,
    shares: 100,
    priceEur: 40,
    position: unityPosition,
    portfolioTotalEur: 62280,
    executionPriceEur: 40.46,
    asOf,
    ...overrides,
  };
}

describe("applyTransactionToHoldings — BUY", () => {
  it("increases stock quantity, updates weighted-average cost, and debits cash by exactly the cost", () => {
    const result = applyTransactionToHoldings(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stock = result.holdings.find((h) => h.id === "h-unity")!;
    const cash = result.holdings.find((h) => h.id === "h-cash")!;

    expect(stock.quantity).toBe(1002);
    // (902*27.76 + 100*40) / 1002 — same formula as accounting.test.ts's BUY case.
    expect(stock.costBasis).toEqual({ status: "AVAILABLE", averageCostNative: 28.98, asOf });
    expect(cash.quantity).toBe(10000 - 100 * 40);
  });

  it("leaves total portfolio value unchanged when bought at the current market price (cash lost == stock value gained)", () => {
    const input = baseInput({ shares: 100, priceEur: 40.46, executionPriceEur: 40.46 });
    const result = applyTransactionToHoldings(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stock = result.holdings.find((h) => h.id === "h-unity")!;
    const cash = result.holdings.find((h) => h.id === "h-cash")!;
    const stockValueDelta = 100 * 40.46; // newShares priced at the same execution price
    const cashDelta = -(100 * 40.46);
    expect(stock.quantity * 40.46 - unityPosition.shares * 40.46).toBeCloseTo(stockValueDelta, 2);
    expect(cash.quantity - cashHolding.quantity).toBeCloseTo(cashDelta, 2);
  });

  it("rejects a purchase that costs more than the available cash — never fabricates negative cash", () => {
    const result = applyTransactionToHoldings(baseInput({ shares: 1000, priceEur: 40 })); // costs 40,000 > 10,000 cash
    expect(result).toEqual({ ok: false, reason: "INSUFFICIENT_CASH" });
  });

  it("rejects when there is no Cash holding at all", () => {
    const result = applyTransactionToHoldings(
      baseInput({ holdings: [unityHolding] })
    );
    expect(result).toEqual({ ok: false, reason: "NO_CASH_HOLDING" });
  });

  it("rejects when the stock holding can't be found", () => {
    const result = applyTransactionToHoldings(baseInput({ stockHoldingId: "does-not-exist" }));
    expect(result).toEqual({ ok: false, reason: "HOLDING_NOT_FOUND" });
  });
});

describe("applyTransactionToHoldings — SELL", () => {
  it("decreases stock quantity, leaves average cost unchanged, and credits cash by exactly the proceeds", () => {
    const result = applyTransactionToHoldings(
      baseInput({ type: "SELL", shares: 100, priceEur: 40.46 })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stock = result.holdings.find((h) => h.id === "h-unity")!;
    const cash = result.holdings.find((h) => h.id === "h-cash")!;

    expect(stock.quantity).toBe(802);
    // Unchanged — same costBasis object contents as before (weighted-average
    // accounting: SELL never touches average cost).
    expect(stock.costBasis).toEqual(unityHolding.costBasis);
    expect(cash.quantity).toBe(10000 + 100 * 40.46);
  });

  it("rejects selling more shares than are held", () => {
    const result = applyTransactionToHoldings(
      baseInput({ type: "SELL", shares: 903, priceEur: 40.46 })
    );
    expect(result).toEqual({ ok: false, reason: "OVERSELL" });
  });

  it("allows selling the entire position down to zero shares", () => {
    const result = applyTransactionToHoldings(
      baseInput({ type: "SELL", shares: 902, priceEur: 40.46 })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stock = result.holdings.find((h) => h.id === "h-unity")!;
    expect(stock.quantity).toBe(0);
  });

  it("rejects when there is no Cash holding to receive the proceeds", () => {
    const result = applyTransactionToHoldings(
      baseInput({ type: "SELL", shares: 100, priceEur: 40.46, holdings: [unityHolding] })
    );
    expect(result).toEqual({ ok: false, reason: "NO_CASH_HOLDING" });
  });
});
