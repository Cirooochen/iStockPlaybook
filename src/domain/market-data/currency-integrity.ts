// Currency-integrity boundary — Phase I.1 Data Foundation.
// Spec: docs/phase-i-minimum-research-evidence.md.
//
// A future valuation calculation (EV/Revenue — not implemented yet) will
// need to combine a currency-denominated fundamentals figure (see
// RawFundamentalsData.reportingCurrency) with a currency-denominated
// price (RawQuote.currency). This module does not compute or convert
// anything itself — it only decides whether combining two such figures
// is safe, and, when a verified FX rate is supplied, what factor a caller
// should apply. The rule (docs/phase-i-minimum-research-evidence.md):
//   - same currency                              -> allowed, as-is
//   - different currencies + a verified FX rate  -> allowed, normalize
//   - otherwise                                   -> MISSING, never guess
//
// A future valuation module MUST call this before combining any two
// currency-denominated figures — never combine them directly.
import type { FxRate } from "@/types/market-data";
import { isValidCurrency, isValidFxPair } from "./validation";

export type CurrencyIntegrityResult =
  | { status: "SAME_CURRENCY"; currency: string }
  | { status: "CONVERTED"; from: string; to: string; rate: number }
  | { status: "MISSING" };

// `valueCurrency` is the currency of the figure being checked (e.g. a
// fundamentals reportingCurrency); `targetCurrency` is the currency
// everything should end up expressed in (e.g. a price's currency). `fx`,
// if supplied, is trusted ONLY when it is exactly the (valueCurrency ->
// targetCurrency) pair with an AVAILABLE rate — never inverted, never
// substituted for a different pair, never assumed from a same-currency
// default.
export function resolveCurrencyIntegrity(
  valueCurrency: string,
  targetCurrency: string,
  fx?: FxRate
): CurrencyIntegrityResult {
  if (!isValidCurrency(valueCurrency) || !isValidCurrency(targetCurrency)) {
    return { status: "MISSING" };
  }
  if (valueCurrency === targetCurrency) {
    return { status: "SAME_CURRENCY", currency: valueCurrency };
  }
  if (fx === undefined) return { status: "MISSING" };
  if (!isValidFxPair(fx.from, fx.to)) return { status: "MISSING" };
  if (fx.from !== valueCurrency || fx.to !== targetCurrency) return { status: "MISSING" };
  if (fx.rate.status !== "AVAILABLE") return { status: "MISSING" };
  return { status: "CONVERTED", from: fx.from, to: fx.to, rate: fx.rate.value };
}
