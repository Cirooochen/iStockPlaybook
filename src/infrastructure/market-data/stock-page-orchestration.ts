// v0.1 Stabilization — consolidated stock-page live data fetch.
//
// Momentum (twelve-data/orchestration.ts's fetchLiveMomentumResult) and
// Valuation (valuation-orchestration.ts's fetchLiveEvRevenueCheckpoints)
// each independently fetched their OWN Twelve Data quote and their OWN
// Twelve Data daily price series for the SAME stock symbol, and Valuation
// additionally re-ran fetchLiveFundamentalsResult a second time (SEC
// EDGAR — already fetched once by the stock page for other purposes).
// Live-confirmed (release-readiness review) that a single ASML page load
// can trip Twelve Data's free-tier per-minute credit cap purely from this
// avoidable duplication, not from rapid navigation. This module is the
// ONE caller (src/app/stocks/[ticker]/page.tsx) that needs both Momentum
// and Valuation at once — it fetches each shared piece exactly once and
// derives both from it, using the exact same pure functions each
// existing orchestrator already used, unchanged:
// deriveTechnicalSignals/deriveTrendSignal/computeRelativeStrength/
// scoreMomentum (momentum.ts/trend.ts/relative-strength.ts/
// momentum-score.ts) and deriveEvRevenueCheckpoints
// (valuation-checkpoints.ts). Only WHICH network calls feed them is
// consolidated — no scoring/derivation logic changed.
//
// fetchLiveMomentumResult and fetchLiveEvRevenueCheckpoints themselves
// are UNTOUCHED — still independently correct, still used by their own
// tests and scripts/validate-live-ev-revenue-checkpoints.ts. This is a
// new, additional entry point, not a replacement of those functions.
//
// Never throws — same "resolves to undefined" contract every existing
// orchestrator already has. Momentum and Valuation fail independently:
// a Twelve Data failure resolves BOTH to undefined (they share the same
// underlying fetch), but a missing/undiscoverable reportingCurrency
// still correctly resolves Valuation to `[]` (not undefined) even if
// fetched successfully, and a SEC EDGAR failure only affects Valuation
// (Momentum has no dependency on it) — the exact same distinctions
// fetchLiveEvRevenueCheckpoints's own contract already makes.
import { createTwelveDataClientConfigFromEnv, fetchDailyTimeSeries, fetchExchangeRate, fetchQuote } from "./twelve-data/client";
import { buildRawMarketData, mapQuoteResponse, mapTimeSeriesResponse } from "./twelve-data/mappers";
import { deriveTechnicalSignals } from "@/domain/signals/momentum";
import { deriveTrendSignal } from "@/domain/signals/trend";
import { computeRelativeStrength } from "@/domain/signals/relative-strength";
import { scoreMomentum, type MomentumScoreResult } from "@/domain/signals/momentum-score";
import { RULESET } from "@/config/ruleset-v0.1";
import { fetchLiveFundamentalsResult, type FundamentalsFetchResult } from "./sec-edgar/orchestration";
import { deriveEvRevenueCheckpoints, MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS, type EvRevenueCheckpoint } from "@/domain/signals/valuation-checkpoints";
import type { OhlcvBar } from "@/types/market-data";

const FX_PAIR = "USD/EUR";
const HISTORY_BARS = RULESET.technical.dma200Period + RULESET.technical.trend.dma200SlopeLookbackDays;
const TRADING_DAYS_PER_YEAR = 252;
const VALUATION_PRICE_HISTORY_DAYS = (MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS + 2) * TRADING_DAYS_PER_YEAR;
// One shared daily-series fetch, sized to Valuation's own longer
// requirement (up to 5 completed fiscal years + buffer, ~7 years) —
// Momentum's own derivation functions (momentum.ts/trend.ts/
// relative-strength.ts) already read only from the array's own tail and
// gate on a MINIMUM length, never an exact one (verified against every
// one of their own call sites before this change), so a longer series
// changes nothing about Momentum's output.
const SHARED_STOCK_HISTORY_DAYS = Math.max(HISTORY_BARS, VALUATION_PRICE_HISTORY_DAYS);

export interface StockPageLiveData {
  momentumResult: MomentumScoreResult | undefined;
  fundamentalsFetch: FundamentalsFetchResult | undefined;
  evRevenueCheckpoints: EvRevenueCheckpoint[] | undefined;
}

interface SharedPriceData {
  priceOhlcv: OhlcvBar[];
  priceCurrency: string;
}

export async function fetchStockPageLiveData(
  stockSymbol: string,
  benchmarkInstrumentId: string | undefined,
  checkedAt: string
): Promise<StockPageLiveData> {
  const fundamentalsFetch = await fetchLiveFundamentalsResult(stockSymbol, checkedAt);

  let momentumResult: MomentumScoreResult | undefined;
  let sharedPriceData: SharedPriceData | undefined;

  try {
    const config = createTwelveDataClientConfigFromEnv();

    const [quotePayload, stockSeriesPayload, benchmarkSeriesPayload, currentFxPayload] = await Promise.all([
      fetchQuote(config, stockSymbol),
      fetchDailyTimeSeries(config, stockSymbol, SHARED_STOCK_HISTORY_DAYS),
      benchmarkInstrumentId ? fetchDailyTimeSeries(config, benchmarkInstrumentId, HISTORY_BARS) : Promise.resolve(undefined),
      fetchExchangeRate(config, FX_PAIR),
    ]);

    const rawMarketData = buildRawMarketData({
      instrumentId: stockSymbol,
      quotePayload,
      timeSeriesPayload: stockSeriesPayload,
      fxPayload: currentFxPayload,
      checkedAt,
    });
    const benchmarkOhlcv = benchmarkSeriesPayload !== undefined ? mapTimeSeriesResponse(benchmarkSeriesPayload) : [];

    const technicalSignals = deriveTechnicalSignals(rawMarketData.ohlcv);
    const trendSignal = deriveTrendSignal(rawMarketData.ohlcv);
    const relativeStrength = computeRelativeStrength(rawMarketData.ohlcv, benchmarkInstrumentId, benchmarkOhlcv);
    momentumResult = scoreMomentum(technicalSignals, rawMarketData.quote.price, trendSignal, relativeStrength);

    // The shared series is already the FULL depth Valuation needs — its
    // own price/shares/checkpoint-date selection reads bars on or before
    // a given date, so a longer array than Momentum uses is exactly what
    // Valuation wants, not a mismatch to reconcile.
    sharedPriceData = { priceOhlcv: rawMarketData.ohlcv, priceCurrency: mapQuoteResponse(quotePayload).currency };
  } catch (err) {
    console.error("[stock-page] shared Twelve Data fetch failed, Momentum resolving to undefined:", err);
    momentumResult = undefined;
  }

  const evRevenueCheckpoints = await deriveEvRevenueCheckpointsFromSharedData(fundamentalsFetch, sharedPriceData);

  return { momentumResult, fundamentalsFetch, evRevenueCheckpoints };
}

// Mirrors fetchLiveEvRevenueCheckpoints's own three-way outcome exactly
// (undefined = fetch failure, [] = genuinely no evidence, an array =
// computed) — just sourced from the shared fundamentals/price data above
// instead of fetching either a second time.
async function deriveEvRevenueCheckpointsFromSharedData(
  fundamentalsFetch: FundamentalsFetchResult | undefined,
  sharedPriceData: SharedPriceData | undefined
): Promise<EvRevenueCheckpoint[] | undefined> {
  if (fundamentalsFetch === undefined) return undefined;
  if (fundamentalsFetch.reportingCurrency === undefined) return [];
  // The shared Twelve Data fetch failed — Valuation cannot compute
  // without a price, same as Momentum resolving to undefined above.
  if (sharedPriceData === undefined) return undefined;

  try {
    const config = createTwelveDataClientConfigFromEnv();
    const { priceOhlcv, priceCurrency } = sharedPriceData;
    const reportingCurrency = fundamentalsFetch.reportingCurrency;

    const fxOhlcv =
      priceCurrency !== reportingCurrency
        ? mapTimeSeriesResponse(await fetchDailyTimeSeries(config, `${priceCurrency}/${reportingCurrency}`, SHARED_STOCK_HISTORY_DAYS))
        : undefined;

    return deriveEvRevenueCheckpoints({
      periods: fundamentalsFetch.periods,
      periodType: fundamentalsFetch.periodType,
      reportingCurrency,
      sharesOutstandingByAccession: fundamentalsFetch.sharesOutstandingByAccession,
      priceOhlcv,
      priceCurrency,
      fxOhlcv,
    });
  } catch (err) {
    console.error("[stock-page] valuation FX fetch/derivation failed, resolving to undefined:", err);
    return undefined;
  }
}
