// Manual price overrides — Phase G.3/G.4. Merges the seed/default quotes
// with user-entered manual prices (src/lib/portfolio-storage.ts) into the
// `quotes` map derivePortfolioSnapshot takes as pure input.
//
// A manualPrices entry has three possible states, and they must NOT
// collapse to two: a present value overrides the seed quote; `null` is an
// explicit "the user cleared this price," which must override the seed
// quote too (to MISSING) rather than silently falling back to it; an
// absent key means "no opinion," which does fall back to the seed quote.
// (G.4 found this collapsed to "override or fall back" — clearing a
// seeded holding's price silently kept showing the seed price.)
import type { RawQuote } from "@/types/market-data";
import type { ManualPriceEntry } from "@/lib/portfolio-storage";

export function mergeManualPrices(
  seedQuotes: Map<string, RawQuote>,
  manualPrices: Record<string, ManualPriceEntry | null>,
  baseCurrency: string
): Map<string, RawQuote> {
  const merged = new Map<string, RawQuote>(seedQuotes);
  for (const [instrumentId, entry] of Object.entries(manualPrices)) {
    if (entry === null) {
      merged.delete(instrumentId);
    } else {
      merged.set(instrumentId, {
        price: { status: "AVAILABLE", value: entry.priceNative, asOf: entry.asOf },
        currency: baseCurrency,
      });
    }
  }
  return merged;
}
