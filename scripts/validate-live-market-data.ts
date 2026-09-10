// Phase C.8B — First Live Market-Data Vertical Slice.
//
// A developer-only, ad hoc validation path — NOT production
// orchestration, NOT a unit test, NOT wired into the app. Run manually:
//
//   npm run validate:live-market-data
//
// Requires TWELVE_DATA_API_KEY in the environment (.env.local — see
// .env.local.example — or the shell environment). The key is loaded, used
// to build request URLs, and never printed or logged by this script.
//
// Pipeline: Twelve Data (stock quote + stock OHLCV + benchmark OHLCV +
// USD/EUR FX) -> src/infrastructure/market-data/twelve-data mappers
// (Phase C.8A, provider-independent RawQuote/OhlcvBar[]/FxRate) ->
// src/domain/signals (deriveTechnicalSignals / deriveTrendSignal /
// computeRelativeStrength, Phase C.3/C.5) -> scoreMomentum (Phase C.4/C.6,
// all six spec §14 dimensions). Nothing here touches Scorecard, stance,
// action zones, caching, or portfolio-wide refresh — this is a single
// instrument, single run, print-and-exit script.
//
// Request/data failures are never silently retried or substituted: if any
// of the four fetches or the mapping step fails, this script reports the
// failure explicitly and stops — it does not proceed to momentum scoring
// with partial or invented data. A per-field MISSING (e.g. one date
// failing to align for Relative Strength) is a different, legitimate
// outcome, handled by the existing MISSING/NOT_APPLICABLE machinery once
// all four requests have genuinely succeeded.
import {
  createTwelveDataClientConfigFromEnv,
  fetchDailyTimeSeries,
  fetchExchangeRate,
  fetchQuote,
  TwelveDataNetworkError,
} from "../src/infrastructure/market-data/twelve-data/client";
import { loadDotEnvLocalIfPresent } from "../src/infrastructure/market-data/twelve-data/env";
import { buildRawMarketData, mapTimeSeriesResponse } from "../src/infrastructure/market-data/twelve-data/mappers";
import { TwelveDataApiError } from "../src/infrastructure/market-data/twelve-data/errors";
import { deriveTechnicalSignals } from "../src/domain/signals/momentum";
import { deriveTrendSignal } from "../src/domain/signals/trend";
import { computeRelativeStrength } from "../src/domain/signals/relative-strength";
import { scoreMomentum, type MomentumComponentResult } from "../src/domain/signals/momentum-score";
import { RULESET } from "../src/config/ruleset-v0.1";
import { unitySeed } from "../src/data/unity-seed";
import type { DataField } from "../src/types/market-data";

const STOCK_SYMBOL = unitySeed.security.ticker;
const BENCHMARK_SYMBOL = unitySeed.strategy.benchmarkInstrumentId;
const FX_PAIR = "USD/EUR";
// Covers every current lookback: Primary Trend's dma200Period +
// dma200SlopeLookbackDays (the longest), which already exceeds Relative
// Strength's comparisonWindowTradingDays, RSI's rsiPeriod, and
// relativeVolumeWindow.
const HISTORY_BARS = RULESET.technical.dma200Period + RULESET.technical.trend.dma200SlopeLookbackDays;

function describeField(field: DataField<number>): string {
  return field.status === "MISSING" ? "MISSING" : `${field.value} (asOf ${field.asOf})`;
}

function describeComponent(c: MomentumComponentResult): string {
  if (c.status === "AVAILABLE") {
    const raw = typeof c.rawValue === "number" ? c.rawValue.toFixed(4) : c.rawValue;
    return `${c.key.padEnd(15)} AVAILABLE      raw=${raw}  score100=${c.score100.toFixed(1)}  weight=${c.weight}`;
  }
  return `${c.key.padEnd(15)} ${c.status.padEnd(14)} weight=${c.weight}`;
}

async function main(): Promise<void> {
  loadDotEnvLocalIfPresent();

  let config;
  try {
    config = createTwelveDataClientConfigFromEnv();
  } catch (err) {
    console.log("=== Phase C.8B — Live Market-Data Vertical Slice ===");
    console.log("Result: PENDING — live verification not performed.");
    console.log((err as Error).message);
    console.log(
      "The Twelve Data client and this validation path ARE implemented (Phase C.8B); " +
        "no live response was invented in place of credentials."
    );
    process.exitCode = 1;
    return;
  }

  if (!BENCHMARK_SYMBOL) {
    console.log("Result: CONFIG ERROR — unitySeed.strategy.benchmarkInstrumentId is not set.");
    process.exitCode = 1;
    return;
  }

  const checkedAt = new Date().toISOString();

  console.log("=== Phase C.8B — Live Market-Data Vertical Slice ===");
  console.log(`Fetching ${STOCK_SYMBOL} (+ benchmark ${BENCHMARK_SYMBOL}, + ${FX_PAIR}) from Twelve Data...`);

  let quotePayload: unknown;
  let stockSeriesPayload: unknown;
  let benchmarkSeriesPayload: unknown;
  let fxPayload: unknown;
  try {
    [quotePayload, stockSeriesPayload, benchmarkSeriesPayload, fxPayload] = await Promise.all([
      fetchQuote(config, STOCK_SYMBOL),
      fetchDailyTimeSeries(config, STOCK_SYMBOL, HISTORY_BARS),
      fetchDailyTimeSeries(config, BENCHMARK_SYMBOL, HISTORY_BARS),
      fetchExchangeRate(config, FX_PAIR),
    ]);
  } catch (err) {
    console.log("Result: PROVIDER REQUEST FAILURE");
    if (err instanceof TwelveDataNetworkError) {
      console.log(`Network error: ${err.message}`);
    } else {
      console.log(`Unexpected failure: ${(err as Error).message}`);
    }
    console.log("Not proceeding to momentum scoring — a request failure is not substituted with missing-data semantics.");
    process.exitCode = 1;
    return;
  }

  let rawMarketData;
  let benchmarkOhlcv;
  try {
    rawMarketData = buildRawMarketData({
      instrumentId: STOCK_SYMBOL,
      quotePayload,
      timeSeriesPayload: stockSeriesPayload,
      fxPayload,
      checkedAt,
    });
    benchmarkOhlcv = mapTimeSeriesResponse(benchmarkSeriesPayload);
  } catch (err) {
    console.log("Result: PROVIDER API ERROR");
    if (err instanceof TwelveDataApiError) {
      console.log(`Twelve Data error ${err.code}: ${err.message}`);
    } else {
      console.log(`Unexpected mapping failure: ${(err as Error).message}`);
    }
    console.log("Not proceeding to momentum scoring.");
    process.exitCode = 1;
    return;
  }

  const technicalSignals = deriveTechnicalSignals(rawMarketData.ohlcv);
  const trendSignal = deriveTrendSignal(rawMarketData.ohlcv);
  const relativeStrength = computeRelativeStrength(rawMarketData.ohlcv, BENCHMARK_SYMBOL, benchmarkOhlcv);
  const momentum = scoreMomentum(technicalSignals, rawMarketData.quote.price, trendSignal, relativeStrength);

  const firstBar = rawMarketData.ohlcv[0];
  const lastBar = rawMarketData.ohlcv[rawMarketData.ohlcv.length - 1];

  console.log("");
  console.log(`Instrument:      ${rawMarketData.instrumentId} (${rawMarketData.quote.currency || "unknown currency"})`);
  console.log(`Quote:           ${describeField(rawMarketData.quote.price)}`);
  console.log(
    `History:         ${rawMarketData.ohlcv.length} bars` +
      (firstBar && lastBar ? `, ${firstBar.date} .. ${lastBar.date}` : "")
  );
  console.log(`Benchmark:       ${BENCHMARK_SYMBOL} (${benchmarkOhlcv.length} bars)`);
  console.log(
    `FX ${rawMarketData.fx?.from ?? "?"}/${rawMarketData.fx?.to ?? "?"}:       ` +
      (rawMarketData.fx ? describeField(rawMarketData.fx.rate) : "not requested")
  );

  console.log("");
  console.log("Momentum components:");
  for (const c of momentum.components) {
    console.log(`  ${describeComponent(c)}`);
  }

  console.log("");
  console.log(`Momentum result: ${momentum.status}`);
  if (momentum.status === "SCORED") {
    console.log(`  overall: score=${momentum.overall.score}/10  state=${momentum.overall.state}`);
  }

  const { coverage } = momentum;
  console.log("");
  console.log("Evidence coverage:");
  console.log(`  totalDefinedWeight   = ${coverage.totalDefinedWeight.toFixed(2)}`);
  console.log(`  applicableWeight     = ${coverage.applicableWeight.toFixed(2)}`);
  console.log(`  availableWeight      = ${coverage.availableWeight.toFixed(2)}`);
  console.log(`  missingWeight        = ${coverage.missingWeight.toFixed(2)}`);
  console.log(`  availableWeightShare = ${(coverage.availableWeightShare * 100).toFixed(1)}%`);

  const notApplicable = momentum.components.filter((c) => c.status === "NOT_APPLICABLE").map((c) => c.key);
  const missing = momentum.components.filter((c) => c.status === "MISSING").map((c) => c.key);
  console.log("");
  console.log(`NOT_APPLICABLE: ${notApplicable.length ? notApplicable.join(", ") : "none"}`);
  console.log(`MISSING:        ${missing.length ? missing.join(", ") : "none"}`);
}

main().catch((err) => {
  console.error("Unexpected error during live validation:", err);
  process.exitCode = 1;
});
