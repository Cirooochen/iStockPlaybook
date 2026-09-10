// Portfolio accounting — spec §3, §5
// Pure functions. No React. Same inputs → same outputs.
import type { Position } from "@/types/playbook";

export interface TransactionInput {
  shares: number;
  priceEur: number;
}

export interface SellResult {
  position: Position;
  realizedGainEur: number;
  realizedGainPct: number;
}

// Portfolio Total = Securities + Cash (spec §5). Cash is implicit inside
// portfolioTotalEur — there is no separate cash ledger during Phase B.5.
// BUY converts cash into stock (Cash → Security); SELL converts stock into
// cash (Security → Cash). Both leave the total unchanged (no fees/slippage
// modeled yet); only the split between the security's value and the
// (untracked) remainder of the total shifts. During Phase B.5, BUY
// transactions are assumed to be funded from existing portfolio cash —
// deposits/withdrawals (external capital flows) are a later phase, not
// modeled here. Single source of truth so this convention can't drift
// between accounting.ts, the shell, and the modal preview.
export function calcPortfolioTotalAfterBuy(oldTotalPortfolioEur: number): number {
  return oldTotalPortfolioEur;
}

export function calcPortfolioTotalAfterSell(oldTotalPortfolioEur: number): number {
  return oldTotalPortfolioEur;
}

// §3 BUY: weighted average cost recalculates; value at current market price
export function applyBuy(
  old: Position,
  input: TransactionInput,
  currentPriceEur: number,
  oldTotalPortfolioEur: number
): Position {
  const newShares = old.shares + input.shares;
  const newAvgCost =
    (old.shares * old.averageCostEur + input.shares * input.priceEur) /
    newShares;
  const newValue = newShares * currentPriceEur;
  const newTotalPortfolio = calcPortfolioTotalAfterBuy(oldTotalPortfolioEur);
  const newWeight = (newValue / newTotalPortfolio) * 100;
  const newReturn = ((currentPriceEur - newAvgCost) / newAvgCost) * 100;

  return {
    shares: newShares,
    averageCostEur: r2(newAvgCost),
    valueEur: r2(newValue),
    unrealizedReturnPct: r2(newReturn),
    portfolioWeightPct: r2(newWeight),
  };
}

// §3 SELL: average cost unchanged (weighted-average accounting, not tax-lot)
export function applySell(
  old: Position,
  input: TransactionInput,
  currentPriceEur: number,
  oldTotalPortfolioEur: number
): SellResult {
  if (input.shares > old.shares) {
    throw new Error(
      `Cannot sell ${input.shares} shares — only ${old.shares} held.`
    );
  }
  const newShares = old.shares - input.shares;
  const newAvgCost = old.averageCostEur; // unchanged
  const newValue = newShares * currentPriceEur;
  const newTotalPortfolio = calcPortfolioTotalAfterSell(oldTotalPortfolioEur);
  const newWeight =
    newShares > 0 ? (newValue / newTotalPortfolio) * 100 : 0;
  const newReturn =
    newShares > 0
      ? ((currentPriceEur - newAvgCost) / newAvgCost) * 100
      : 0;

  const realizedGainEur =
    (input.priceEur - old.averageCostEur) * input.shares;
  const realizedGainPct =
    ((input.priceEur - old.averageCostEur) / old.averageCostEur) * 100;

  return {
    position: {
      shares: newShares,
      averageCostEur: r2(newAvgCost),
      valueEur: r2(newValue),
      unrealizedReturnPct: r2(newReturn),
      portfolioWeightPct: r2(newWeight),
    },
    realizedGainEur: r2(realizedGainEur),
    realizedGainPct: r2(realizedGainPct),
  };
}

// Preview-only: run transaction math without side effects (used in modal)
export function previewBuy(
  old: Position,
  input: TransactionInput,
  currentPriceEur: number,
  oldTotalPortfolioEur: number
): Position {
  return applyBuy(old, input, currentPriceEur, oldTotalPortfolioEur);
}

export function previewSell(
  old: Position,
  input: TransactionInput,
  currentPriceEur: number,
  oldTotalPortfolioEur: number
): SellResult {
  if (input.shares > old.shares) {
    return {
      position: old,
      realizedGainEur: 0,
      realizedGainPct: 0,
    };
  }
  return applySell(old, input, currentPriceEur, oldTotalPortfolioEur);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
