import type { Portfolio } from "@/types/playbook";

export const portfolioSeed: Portfolio = {
  totalValueEur: 62280,
  unrealizedReturnEur: 9420,
  unrealizedReturnPct: 17.8,
  updatedAt: "2026-09-04T16:15:00+02:00",
  holdings: [
    {
      security: {
        name: "Unity Software Inc.",
        ticker: "U",
        exchange: "NYSE",
        marketCurrency: "USD",
      },
      market: {
        executionPriceEur: 40.46,
        primaryPriceUsd: 47.20,
        dailyChangePct: 2.1,
        updatedAt: "2026-09-04T16:15:00+02:00",
      },
      position: {
        shares: 902,
        averageCostEur: 27.76,
        valueEur: 36494.92,
        unrealizedReturnPct: 45.75,
        portfolioWeightPct: 58.6,
      },
      playbookStance: "HOLD_GRADUALLY_TRIM",
      playbookReason: "Concentration remains above target",
      attentionState: "WATCH",
    },
    {
      security: {
        name: "ASML Holding N.V.",
        ticker: "ASML",
        exchange: "AMS",
        marketCurrency: "EUR",
      },
      market: {
        executionPriceEur: 742.50,
        primaryPriceUsd: 742.50,
        dailyChangePct: -0.4,
        updatedAt: "2026-09-04T16:15:00+02:00",
      },
      position: {
        shares: 12,
        averageCostEur: 680.0,
        valueEur: 8910.0,
        unrealizedReturnPct: 9.19,
        portfolioWeightPct: 14.3,
      },
      playbookStance: "HOLD",
      playbookReason: "Within target range. Thesis intact.",
      attentionState: "STABLE",
    },
    {
      security: {
        name: "Vanguard FTSE World ETF",
        ticker: "VWRL",
        exchange: "LSE",
        marketCurrency: "USD",
      },
      market: {
        executionPriceEur: 108.40,
        primaryPriceUsd: 118.60,
        dailyChangePct: 0.3,
        updatedAt: "2026-09-04T16:15:00+02:00",
      },
      position: {
        shares: 75,
        averageCostEur: 95.0,
        valueEur: 8130.0,
        unrealizedReturnPct: 14.1,
        portfolioWeightPct: 13.1,
      },
      playbookStance: "HOLD",
      playbookReason: "Core passive allocation. No action required.",
      attentionState: "STABLE",
    },
    {
      security: {
        name: "Bitcoin",
        ticker: "BTC",
        exchange: "—",
        marketCurrency: "USD",
      },
      market: {
        executionPriceEur: 57200.0,
        primaryPriceUsd: 62500.0,
        dailyChangePct: 1.2,
        updatedAt: "2026-09-04T16:15:00+02:00",
      },
      position: {
        shares: 0.087,
        averageCostEur: 38000.0,
        valueEur: 4976.4,
        unrealizedReturnPct: 50.5,
        portfolioWeightPct: 8.0,
      },
      playbookStance: "HOLD",
      playbookReason: "Strategic allocation within target.",
      attentionState: "STABLE",
    },
    {
      security: {
        name: "Other positions",
        ticker: "—",
        exchange: "—",
        marketCurrency: "EUR",
      },
      market: {
        executionPriceEur: 0,
        primaryPriceUsd: 0,
        dailyChangePct: 0,
        updatedAt: "2026-09-04T16:15:00+02:00",
      },
      position: {
        shares: 0,
        averageCostEur: 0,
        valueEur: 3768.68,
        unrealizedReturnPct: 0,
        portfolioWeightPct: 6.0,
      },
      playbookStance: "HOLD",
      playbookReason: "Miscellaneous smaller positions.",
      attentionState: "STABLE",
    },
  ],
};

export const concentrationData = [
  { label: "Unity Software", ticker: "U", weightPct: 58.6, isAlert: true },
  { label: "ASML", ticker: "ASML", weightPct: 14.3, isAlert: false },
  { label: "ETF", ticker: "VWRL", weightPct: 13.1, isAlert: false },
  { label: "Bitcoin", ticker: "BTC", weightPct: 8.0, isAlert: false },
  { label: "Other", ticker: "—", weightPct: 6.0, isAlert: false },
];
