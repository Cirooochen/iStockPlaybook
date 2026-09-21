// Live EV/Revenue checkpoint orchestration — Phase I.4A Valuation Data
// Foundation. Composes the already-validated SEC EDGAR pipeline
// (fetchLiveFundamentalsResult, Phase I.4A-extended) with Twelve Data's
// historical price/FX endpoints into
// src/domain/signals/valuation-checkpoints.ts's pure
// deriveEvRevenueCheckpoints — the first real caller of that primitive.
// Not wired into any page/UI yet (same "built, not yet called from
// anywhere" posture Phase I.1's currency-integrity boundary had before
// this phase used it) — no Valuation Context classification/UI exists.
//
// Never throws: every failure mode (missing credentials, network error, a
// provider API error, a mapping error) is caught internally and logged
// server-side, resolving to `undefined` — the same "absent" convention
// fetchLiveFundamentalsResult/fetchLiveMomentumResult already establish.
// An empty (but defined) array is a different, legitimate outcome — every
// candidate checkpoint's own required evidence was genuinely missing
// (e.g. Unity's debt, docs/phase-i-minimum-research-evidence.md's 0.30.0
// finding) — never conflated with a fetch failure.
import { fetchLiveFundamentalsResult } from "./sec-edgar/orchestration";
import { createTwelveDataClientConfigFromEnv, fetchDailyTimeSeries, fetchQuote } from "./twelve-data/client";
import { mapQuoteResponse, mapTimeSeriesResponse } from "./twelve-data/mappers";
import { deriveEvRevenueCheckpoints, MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS, type EvRevenueCheckpoint } from "@/domain/signals/valuation-checkpoints";

// Enough daily bars to reach every completed-fiscal-year checkpoint's own
// filing date, plus a buffer for weekends/holidays/thin trading around
// each fiscal year end — not a precise figure, since the exact number of
// trading days per year varies; generous rather than exact, since
// requesting extra history the derivation doesn't end up using is free
// (deriveEvRevenueCheckpoints only ever reads the bars on or before each
// checkpoint's own date).
const TRADING_DAYS_PER_YEAR = 252;
const PRICE_HISTORY_DAYS = (MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS + 2) * TRADING_DAYS_PER_YEAR;

export async function fetchLiveEvRevenueCheckpoints(stockSymbol: string, checkedAt: string): Promise<EvRevenueCheckpoint[] | undefined> {
  try {
    const fundamentals = await fetchLiveFundamentalsResult(stockSymbol, checkedAt);
    if (fundamentals === undefined) return undefined;
    if (fundamentals.reportingCurrency === undefined) return [];

    const config = createTwelveDataClientConfigFromEnv();
    const [quotePayload, priceSeriesPayload] = await Promise.all([
      fetchQuote(config, stockSymbol),
      fetchDailyTimeSeries(config, stockSymbol, PRICE_HISTORY_DAYS),
    ]);

    const priceCurrency = mapQuoteResponse(quotePayload).currency;
    const priceOhlcv = mapTimeSeriesResponse(priceSeriesPayload);

    // "Fetch historical FX only when priceCurrency !== reportingCurrency"
    // (0.30.0, resolved) — the forex pair is requested via the SAME
    // generic /time_series endpoint as a stock symbol (confirmed feasible
    // during the 0.30.0 feasibility spike), never Twelve Data's
    // current-only /exchange_rate.
    const fxOhlcv =
      priceCurrency !== fundamentals.reportingCurrency
        ? mapTimeSeriesResponse(await fetchDailyTimeSeries(config, `${priceCurrency}/${fundamentals.reportingCurrency}`, PRICE_HISTORY_DAYS))
        : undefined;

    return deriveEvRevenueCheckpoints({
      periods: fundamentals.periods,
      periodType: fundamentals.periodType,
      reportingCurrency: fundamentals.reportingCurrency,
      sharesOutstandingByAccession: fundamentals.sharesOutstandingByAccession,
      priceOhlcv,
      priceCurrency,
      fxOhlcv,
    });
  } catch (err) {
    console.error("[valuation] live EV/Revenue checkpoint fetch failed, resolving to undefined:", err);
    return undefined;
  }
}
