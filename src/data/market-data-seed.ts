// v0.1 real-data cleanup — no longer reachable from production runtime
// (use-portfolio-state.ts merges manualPrices over an empty quotes map,
// never this file). Kept as a test-only fixture — do not re-wire this
// into any production path; the Portfolio page's real v0.1 price source
// is manualPrices only (src/domain/portfolio/manual-prices.ts), and a
// holding with no manual price is honestly MISSING, never a fabricated
// quote.
//
// Seed quotes/FX for the Real Portfolio Snapshot — Phase G.2.
// derivePortfolioSnapshot (src/domain/portfolio/snapshot.ts) takes
// quotes/FX as pure caller-supplied input; no live quote/FX provider is
// wired for the Portfolio page (that orchestration layer is explicitly
// out of scope — brief §9). These are the same literal prices
// portfolio-seed.ts previously hardcoded per holding, now supplied as
// derivePortfolioSnapshot's input instead of being pre-baked into a
// Position's valueEur.
import type { RawQuote, FxRate } from "@/types/market-data";

// Also used as the Portfolio page's snapshot derivation timestamp — the
// same fixed instant portfolio-seed.ts's updatedAt previously hardcoded,
// kept as one shared constant instead of a second hand-typed literal.
export const asOf = "2026-09-04T16:15:00+02:00";

export const quotesSeed = new Map<string, RawQuote>([
  ["U", { price: { status: "AVAILABLE", value: 40.46, asOf }, currency: "EUR" }],
  ["ASML", { price: { status: "AVAILABLE", value: 742.5, asOf }, currency: "EUR" }],
  ["VWRL", { price: { status: "AVAILABLE", value: 108.4, asOf }, currency: "EUR" }],
  ["BTC", { price: { status: "AVAILABLE", value: 57200.0, asOf }, currency: "EUR" }],
]);

// No FX needed — every holdings-seed.ts instrument's nativeCurrency is EUR
// already (see that file's nativeCurrency note).
export const fxRatesSeed = new Map<string, FxRate>();
