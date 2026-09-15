// Phase G.6 — applies a confirmed BUY/SELL to the real Holding + Cash
// portfolio state. Reuses applyBuy/applySell (accounting.ts) verbatim for
// the weighted-average-cost/share-count math — deterministic accounting
// preserved; only WHERE the result is stored changes (a real, persisted
// Holding instead of PlaybookClientShell's old ephemeral Position state).
//
// Portfolio Total = Securities + Cash (brief §4): a BUY debits the Cash
// holding by exactly what was paid; a SELL credits it by exactly what was
// received. Unlike the old implicit/untracked-cash assumption, this can
// now genuinely fail — insufficient cash, or no Cash holding at all — and
// those cases are rejected rather than fabricating negative cash.
import type { Position } from "@/types/playbook";
import type { Holding } from "@/types/portfolio";
import { applyBuy, applySell } from "@/domain/portfolio/accounting";

export interface ApplyTransactionInput {
  holdings: Holding[];
  stockHoldingId: string;
  type: "BUY" | "SELL";
  shares: number;
  priceEur: number; // the executed transaction price
  position: Position; // current engine-derived Position for this holding
  portfolioTotalEur: number;
  executionPriceEur: number; // current market price — feeds applyBuy/applySell's revaluation, same as before
  asOf: string;
}

export type ApplyTransactionResult =
  | { ok: true; holdings: Holding[] }
  | { ok: false; reason: "HOLDING_NOT_FOUND" | "NO_CASH_HOLDING" | "INSUFFICIENT_CASH" | "OVERSELL" };

export function applyTransactionToHoldings(input: ApplyTransactionInput): ApplyTransactionResult {
  const { holdings, stockHoldingId, type, shares, priceEur, position, portfolioTotalEur, executionPriceEur, asOf } =
    input;

  const stockHolding = holdings.find((h) => h.id === stockHoldingId);
  if (!stockHolding) return { ok: false, reason: "HOLDING_NOT_FOUND" };

  const cashHolding = holdings.find((h) => h.instrument.assetType === "CASH");
  if (!cashHolding) return { ok: false, reason: "NO_CASH_HOLDING" };

  if (type === "BUY") {
    const cost = shares * priceEur;
    if (cost > cashHolding.quantity) return { ok: false, reason: "INSUFFICIENT_CASH" };

    const newPos = applyBuy(position, { shares, priceEur }, executionPriceEur, portfolioTotalEur);
    const updatedStock: Holding = {
      ...stockHolding,
      quantity: newPos.shares,
      costBasis: { status: "AVAILABLE", averageCostNative: newPos.averageCostEur, asOf },
    };
    const updatedCash: Holding = { ...cashHolding, quantity: cashHolding.quantity - cost };
    return { ok: true, holdings: replaceTwo(holdings, updatedStock, updatedCash) };
  }

  if (shares > stockHolding.quantity) return { ok: false, reason: "OVERSELL" };
  const proceeds = shares * priceEur;

  const { position: newPos } = applySell(position, { shares, priceEur }, executionPriceEur, portfolioTotalEur);
  // costBasis is intentionally left untouched — applySell's average cost
  // is unchanged by a SELL (weighted-average accounting), so the existing
  // costBasis is still correct as-is.
  const updatedStock: Holding = { ...stockHolding, quantity: newPos.shares };
  const updatedCash: Holding = { ...cashHolding, quantity: cashHolding.quantity + proceeds };
  return { ok: true, holdings: replaceTwo(holdings, updatedStock, updatedCash) };
}

function replaceTwo(holdings: Holding[], a: Holding, b: Holding): Holding[] {
  return holdings.map((h) => (h.id === a.id ? a : h.id === b.id ? b : h));
}
