// Real Portfolio holdings seed — Phase G.1 migration of portfolio-seed.ts's
// holdings array into the new Holding[] shape (design §3, step 3).
// Additive: portfolio-seed.ts/unity-seed.ts are unchanged and still power
// the current Portfolio/Playbook pages; this is the new model's seed,
// consumed by derivePortfolioSnapshot.
//
// Field-for-field migration from portfolio-seed.ts, except the "Other
// positions" row (shares: 0, executionPriceEur: 0, averageCostEur: 0 — a
// live MISSING != 0 violation, see docs/phase-g0-real-portfolio-data-model.md
// §0) which becomes a real, explicit CASH holding of the same value.
//
// nativeCurrency note: the old Security.marketCurrency (USD for Unity/
// VWRL/Bitcoin) was display-only — every actual number in this app
// (averageCostEur, executionPriceEur, valueEur) has only ever been
// EUR-denominated; there is no FX rate anywhere to convert from it. Setting
// nativeCurrency to the old marketCurrency here would make these holdings'
// costBasisBase MISSING (no FX supplied), a real regression versus today's
// behavior. nativeCurrency is set to "EUR" instead, matching the currency
// the existing numbers are actually in — not a new FX decision, just an
// honest label for already-EUR-only data. Revisit once live quotes/FX are
// wired (out of scope for G.1 — brief §8/§9).
import type { Holding } from "@/types/portfolio";

const updatedAt = "2026-09-04T16:15:00+02:00";

export const holdingsSeed: Holding[] = [
  {
    id: "h-unity",
    instrument: {
      id: "U",
      assetType: "STOCK",
      name: "Unity Software Inc.",
      ticker: "U",
      exchange: "NYSE",
      isin: "US91332U1016",
      nativeCurrency: "EUR",
    },
    quantity: 902,
    costBasis: { status: "AVAILABLE", averageCostNative: 27.76, asOf: updatedAt },
  },
  {
    id: "h-asml",
    instrument: {
      id: "ASML",
      assetType: "STOCK",
      name: "ASML Holding N.V.",
      ticker: "ASML",
      exchange: "AMS",
      nativeCurrency: "EUR",
    },
    quantity: 12,
    costBasis: { status: "AVAILABLE", averageCostNative: 680.0, asOf: updatedAt },
  },
  {
    id: "h-vwrl",
    instrument: {
      id: "VWRL",
      assetType: "ETF",
      name: "Vanguard FTSE World ETF",
      ticker: "VWRL",
      exchange: "LSE",
      nativeCurrency: "EUR",
    },
    quantity: 75,
    costBasis: { status: "AVAILABLE", averageCostNative: 95.0, asOf: updatedAt },
  },
  {
    id: "h-btc",
    instrument: {
      id: "BTC",
      assetType: "CRYPTO",
      name: "Bitcoin",
      ticker: "BTC",
      nativeCurrency: "EUR",
    },
    quantity: 0.087,
    costBasis: { status: "AVAILABLE", averageCostNative: 38000.0, asOf: updatedAt },
  },
  {
    id: "h-cash-eur",
    instrument: {
      id: "CASH-EUR",
      assetType: "CASH",
      name: "Cash (EUR)",
      nativeCurrency: "EUR",
    },
    // Replaces portfolio-seed.ts's zeroed-out "Other positions" row
    // (valueEur: 3768.68) with an explicit cash amount — same value,
    // honestly modeled instead of a shares:0/averageCostEur:0 stock shape.
    quantity: 3768.68,
    costBasis: { status: "NOT_APPLICABLE" },
  },
];
