// B.5.2 prerequisite #1 — portfolio-total convention after BUY and SELL.
// Portfolio Total = Securities + Cash (spec §5, §21A). Cash is implicit
// inside portfolioTotalEur — no separate cash ledger during Phase B.5.
// BUY converts cash into stock (Cash → Security); SELL converts stock into
// cash (Security → Cash). Both leave the total unchanged (no fees/slippage
// modeled yet) — during Phase B.5, BUY is assumed funded from existing
// portfolio cash, not external capital.
import { describe, expect, it } from "vitest";
import {
  applyBuy,
  applySell,
  calcPortfolioTotalAfterBuy,
  calcPortfolioTotalAfterSell,
} from "@/domain/portfolio/accounting";
import type { Position } from "@/types/playbook";

describe("calcPortfolioTotalAfterBuy / calcPortfolioTotalAfterSell", () => {
  it("both leave the portfolio total unchanged (cash-inclusive convention)", () => {
    expect(calcPortfolioTotalAfterBuy(62280)).toBe(62280);
    expect(calcPortfolioTotalAfterSell(62280)).toBe(62280);
    expect(calcPortfolioTotalAfterBuy(0)).toBe(0);
    expect(calcPortfolioTotalAfterSell(0)).toBe(0);
  });
});

const unityPosition: Position = {
  shares: 902,
  averageCostEur: 27.76,
  valueEur: 36494.92,
  unrealizedReturnPct: 45.75,
  portfolioWeightPct: 58.6,
};
const portfolioTotalEur = 62280;
const currentPriceEur = 40.46;

describe("applyBuy — Unity baseline, BUY €4,000 of stock (100 shares @ €40)", () => {
  it("increases shares and position value", () => {
    const newPosition = applyBuy(
      unityPosition,
      { shares: 100, priceEur: 40 },
      currentPriceEur,
      portfolioTotalEur
    );

    expect(newPosition.shares).toBe(1002);
    expect(newPosition.valueEur).toBeCloseTo(40540.92, 2);
    expect(newPosition.valueEur).toBeGreaterThan(unityPosition.valueEur);
  });

  it("preserves the portfolio total — cash converts to stock, total unchanged", () => {
    const newPosition = applyBuy(
      unityPosition,
      { shares: 100, priceEur: 40 },
      currentPriceEur,
      portfolioTotalEur
    );

    // Forward-computed from the unchanged total, not back-solved from the
    // already-rounded weight (which would amplify rounding error). If
    // applyBuy grew the total internally, this would fail.
    const expectedWeight = (newPosition.valueEur / calcPortfolioTotalAfterBuy(portfolioTotalEur)) * 100;
    expect(newPosition.portfolioWeightPct).toBeCloseTo(expectedWeight, 2);
  });

  it("computes portfolio weight against the unchanged €62,280 total, not a grown total", () => {
    const newPosition = applyBuy(
      unityPosition,
      { shares: 100, priceEur: 40 },
      currentPriceEur,
      portfolioTotalEur
    );

    // 1,002 shares × €40.46 / €62,280 (unchanged total) ≈ 65.09%
    expect(newPosition.portfolioWeightPct).toBeCloseTo(65.09, 1);
    // Not the old (external-capital) grown-total result (~61.12%).
    expect(newPosition.portfolioWeightPct).not.toBeCloseTo(61.12, 1);
  });

  it("keeps weighted-average-cost accounting correct", () => {
    const newPosition = applyBuy(
      unityPosition,
      { shares: 100, priceEur: 40 },
      currentPriceEur,
      portfolioTotalEur
    );

    // (902×27.76 + 100×40) / 1002 ≈ 28.98
    expect(newPosition.averageCostEur).toBeCloseTo(28.98, 2);
  });
});

describe("applySell — Unity baseline, partial SELL (100 shares)", () => {
  it("decreases shares and position value", () => {
    const { position } = applySell(
      unityPosition,
      { shares: 100, priceEur: currentPriceEur },
      currentPriceEur,
      portfolioTotalEur
    );

    expect(position.shares).toBe(802);
    expect(position.valueEur).toBeCloseTo(32448.92, 2);
    expect(position.valueEur).toBeLessThan(unityPosition.valueEur);
  });

  it("preserves the portfolio total — stock converts to cash, total unchanged", () => {
    const { position } = applySell(
      unityPosition,
      { shares: 100, priceEur: currentPriceEur },
      currentPriceEur,
      portfolioTotalEur
    );

    const expectedWeight = (position.valueEur / calcPortfolioTotalAfterSell(portfolioTotalEur)) * 100;
    expect(position.portfolioWeightPct).toBeCloseTo(expectedWeight, 2);
  });

  it("computes portfolio weight against the unchanged €62,280 total, not a shrunk total", () => {
    const { position } = applySell(
      unityPosition,
      { shares: 100, priceEur: currentPriceEur },
      currentPriceEur,
      portfolioTotalEur
    );

    // 802 shares × €40.46 / €62,280 (unchanged total) ≈ 52.1%
    expect(position.portfolioWeightPct).toBeCloseTo(52.1, 1);
    // Not the old (shrinking-total) result (~55.72%).
    expect(position.portfolioWeightPct).not.toBeCloseTo(55.72, 1);
  });

  it("leaves realized gain and average cost correct", () => {
    const { realizedGainEur, realizedGainPct, position } = applySell(
      unityPosition,
      { shares: 100, priceEur: currentPriceEur },
      currentPriceEur,
      portfolioTotalEur
    );

    expect(realizedGainEur).toBeCloseTo(1270, 2);
    expect(realizedGainPct).toBeCloseTo(45.75, 2);
    expect(position.averageCostEur).toBe(27.76);
  });

  it("a full SELL converts the entire position to cash rather than deleting portfolio value", () => {
    const { position } = applySell(
      unityPosition,
      { shares: 902, priceEur: currentPriceEur },
      currentPriceEur,
      portfolioTotalEur
    );

    expect(position.shares).toBe(0);
    expect(position.valueEur).toBe(0);
    expect(calcPortfolioTotalAfterSell(portfolioTotalEur)).toBe(portfolioTotalEur);
  });
});
