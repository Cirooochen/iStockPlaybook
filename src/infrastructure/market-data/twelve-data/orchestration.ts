// Live momentum orchestration — Phase D.2
// (docs/phase-d2-live-momentum-engine-orchestration-design.md).
//
// Composes the already-validated C.8A/C.8B pipeline (client -> mappers ->
// domain signals -> scoreMomentum) into one function, for use from a
// Next.js Server Component (never from a "use client" file — see the
// design doc §1: this keeps TWELVE_DATA_API_KEY server-only by
// construction, since nothing that imports this module ships to the
// browser). Calls only already-existing, unmodified exports — no Twelve
// Data adapter or Decision Engine logic is redesigned here.
//
// Never throws: every failure mode (missing credentials, network error,
// a Twelve Data API error, a mapping error) is caught internally and
// logged server-side, resolving to `undefined` — the IDENTICAL "absent"
// path EngineInput.momentumResult already has (Phase D.0/D.1). This is
// what makes "preserve existing fallback behavior" free: there is no new
// fallback logic here, only the already-tested one, reused.
import {
  createTwelveDataClientConfigFromEnv,
  fetchDailyTimeSeries,
  fetchExchangeRate,
  fetchQuote,
} from "./client";
import { buildRawMarketData, mapTimeSeriesResponse } from "./mappers";
import { deriveTechnicalSignals } from "@/domain/signals/momentum";
import { deriveTrendSignal } from "@/domain/signals/trend";
import { computeRelativeStrength } from "@/domain/signals/relative-strength";
import { scoreMomentum, type MomentumScoreResult } from "@/domain/signals/momentum-score";
import { RULESET } from "@/config/ruleset-v0.1";

const FX_PAIR = "USD/EUR";
// Covers every current lookback (Primary Trend's dma200Period +
// dma200SlopeLookbackDays is the longest — see scripts/validate-live-market-data.ts,
// same figure, not duplicated logic beyond this one config expression).
const HISTORY_BARS = RULESET.technical.dma200Period + RULESET.technical.trend.dma200SlopeLookbackDays;

export async function fetchLiveMomentumResult(
  stockSymbol: string,
  benchmarkInstrumentId: string | undefined,
  checkedAt: string
): Promise<MomentumScoreResult | undefined> {
  try {
    const config = createTwelveDataClientConfigFromEnv();

    const [quotePayload, stockSeriesPayload, benchmarkSeriesPayload, fxPayload] = await Promise.all([
      fetchQuote(config, stockSymbol),
      fetchDailyTimeSeries(config, stockSymbol, HISTORY_BARS),
      benchmarkInstrumentId
        ? fetchDailyTimeSeries(config, benchmarkInstrumentId, HISTORY_BARS)
        : Promise.resolve(undefined),
      fetchExchangeRate(config, FX_PAIR),
    ]);

    const rawMarketData = buildRawMarketData({
      instrumentId: stockSymbol,
      quotePayload,
      timeSeriesPayload: stockSeriesPayload,
      fxPayload,
      checkedAt,
    });
    const benchmarkOhlcv = benchmarkSeriesPayload !== undefined ? mapTimeSeriesResponse(benchmarkSeriesPayload) : [];

    const technicalSignals = deriveTechnicalSignals(rawMarketData.ohlcv);
    const trendSignal = deriveTrendSignal(rawMarketData.ohlcv);
    const relativeStrength = computeRelativeStrength(rawMarketData.ohlcv, benchmarkInstrumentId, benchmarkOhlcv);

    return scoreMomentum(technicalSignals, rawMarketData.quote.price, trendSignal, relativeStrength);
  } catch (err) {
    // Server-log only — never rethrown, never a user-facing error. The
    // distinction between failure kinds (network vs. provider vs. missing
    // credentials) still exists inside the functions this calls; this
    // boundary deliberately stops propagating it further (design doc §4).
    console.error("[twelve-data] live momentum fetch failed, falling back to existing Scorecard behavior:", err);
    return undefined;
  }
}
