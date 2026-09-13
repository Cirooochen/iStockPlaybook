// Phase E.7B — SEC EDGAR Structured Fundamentals Live Validation.
//
// A developer-only, ad hoc validation path — NOT production
// orchestration, NOT a unit test, NOT wired into the app (no
// Scorecard/engine/app wiring, per instruction). Run manually:
//
//   npm run validate:live-sec-edgar-fundamentals
//
// Requires SEC_EDGAR_USER_AGENT in the environment (.env.local — see
// .env.local.example) identifying this application per SEC's fair-access
// policy. No API key exists for this provider.
//
// Pipeline: SEC EDGAR (bulk ticker list + companyfacts) ->
// src/infrastructure/market-data/sec-edgar (Phase E.7B,
// provider-independent RawFundamentalsData) -> scoreFundamentals (Phase
// E.2, all seven GROWTH_SOFTWARE dimensions). Nothing here touches
// Scorecard, stance, action zones, caching, or Guidance/AI extraction —
// this is a single instrument, single run, print-and-exit script.
//
// A request/mapping failure is reported explicitly and stops execution
// rather than proceeding to scoring with partial or invented data. A
// per-field/per-component MISSING is a different, legitimate outcome,
// left to the existing MISSING/NOT_APPLICABLE machinery once the fetch
// and mapping steps have genuinely succeeded.
import {
  createSecEdgarClientConfigFromEnv,
  fetchCompanyFacts,
  fetchCompanyTickers,
} from "../src/infrastructure/market-data/sec-edgar/client";
import { SecEdgarHttpError, SecEdgarMappingError, SecEdgarNetworkError } from "../src/infrastructure/market-data/sec-edgar/errors";
import { mapEdgarCompanyFacts } from "../src/infrastructure/market-data/sec-edgar/mappers";
import { resolveCikForTicker } from "../src/infrastructure/market-data/sec-edgar/ticker-resolver";
import { loadDotEnvLocalIfPresent } from "../src/infrastructure/market-data/twelve-data/env";
import { isSortedOldestToNewest } from "../src/domain/signals/fundamentals-validation";
import { scoreFundamentals, type FundamentalsScoreResult } from "../src/domain/signals/fundamentals-score";
import { GROWTH_SOFTWARE_TEMPLATE } from "../src/domain/signals/fundamentals-templates/growth-software";
import { unitySeed } from "../src/data/unity-seed";
import type { RawFundamentalsData, RawFundamentalsPeriod, FundamentalsComponentResult } from "../src/types/fundamentals";
import type { DataField } from "../src/types/market-data";

const STOCK_SYMBOL = unitySeed.security.ticker;
// computeGrowthTrend/computeRevenueGrowth's own minimum (6 trailing
// quarters) — see src/domain/signals/fundamentals.ts. Reused here only
// to LABEL the live result ("sufficient" / "insufficient"), never to
// gate or truncate what's fetched or scored.
const MIN_QUARTERS_FOR_GROWTH_TREND = 6;

const STRUCTURED_FIELD_KEYS = [
  "revenue",
  "operatingIncome",
  "operatingCashFlow",
  "capitalExpenditures",
  "cashAndEquivalents",
  "totalDebt",
] as const satisfies readonly (keyof RawFundamentalsPeriod)[];

function describeField(field: DataField<number>): string {
  return field.status === "MISSING" ? "MISSING" : `${field.value} (asOf ${field.asOf})`;
}

function describeComponent(c: FundamentalsComponentResult): string {
  if (c.status === "AVAILABLE") {
    const raw = typeof c.rawValue === "number" ? c.rawValue.toFixed(4) : JSON.stringify(c.rawValue);
    return `${c.key.padEnd(15)} AVAILABLE      raw=${raw}  score100=${c.score100.toFixed(1)}  weight=${c.weight}`;
  }
  return `${c.key.padEnd(15)} ${c.status.padEnd(14)} weight=${c.weight}`;
}

async function main(): Promise<void> {
  loadDotEnvLocalIfPresent();

  let config;
  try {
    config = createSecEdgarClientConfigFromEnv();
  } catch (err) {
    console.log("=== Phase E.7B — SEC EDGAR Structured Fundamentals Live Validation ===");
    console.log("Result: PENDING — live verification not performed.");
    console.log((err as Error).message);
    console.log(
      "The SEC EDGAR adapter and this validation path ARE implemented (Phase E.7B); " +
        "no live response was invented in place of a configured requester identity."
    );
    process.exitCode = 1;
    return;
  }

  const checkedAt = new Date().toISOString();

  console.log("=== Phase E.7B — SEC EDGAR Structured Fundamentals Live Validation ===");
  console.log(`Resolving CIK for ticker ${STOCK_SYMBOL} via SEC's bulk company_tickers.json...`);

  let tickersPayload: unknown;
  try {
    tickersPayload = await fetchCompanyTickers(config);
  } catch (err) {
    reportFetchFailure(err);
    process.exitCode = 1;
    return;
  }

  const cik = resolveCikForTicker(tickersPayload, STOCK_SYMBOL);
  if (cik === null) {
    console.log(`Result: TICKER NOT FOUND — "${STOCK_SYMBOL}" is not present in SEC's company_tickers.json.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Resolved CIK: ${cik}`);

  console.log(`Fetching companyfacts for CIK${cik}...`);
  let companyFactsPayload: unknown;
  try {
    companyFactsPayload = await fetchCompanyFacts(config, cik);
  } catch (err) {
    reportFetchFailure(err);
    process.exitCode = 1;
    return;
  }

  let raw: RawFundamentalsData;
  try {
    raw = mapEdgarCompanyFacts(companyFactsPayload, checkedAt);
  } catch (err) {
    console.log("Result: MAPPING FAILURE");
    if (err instanceof SecEdgarMappingError) {
      console.log(`SEC EDGAR mapping error: ${err.message}`);
    } else {
      console.log(`Unexpected mapping failure: ${(err as Error).message}`);
    }
    console.log("Not proceeding to fundamentals scoring.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(`Instrument:      ${raw.instrumentId} (periodType ${raw.periodType})`);
  console.log(`Periods fetched: ${raw.periods.length}`);
  console.log(
    raw.periods.length >= MIN_QUARTERS_FOR_GROWTH_TREND
      ? `Quarterly history: SUFFICIENT (>= ${MIN_QUARTERS_FOR_GROWTH_TREND} quarters needed for computeGrowthTrend)`
      : `Quarterly history: INSUFFICIENT (< ${MIN_QUARTERS_FOR_GROWTH_TREND} quarters — computeGrowthTrend/computeRevenueGrowth will be MISSING)`
  );
  console.log(`Period ordering (oldest->newest): ${isSortedOldestToNewest(raw.periods) ? "OK" : "VIOLATED"}`);

  const first = raw.periods[0];
  const last = raw.periods[raw.periods.length - 1];
  if (first && last) {
    console.log(`Range:           ${first.periodId} (${first.periodEndDate}) .. ${last.periodId} (${last.periodEndDate})`);
  }
  console.log(`guidanceEvidence: ${raw.guidanceEvidence.status} (Path B / AI extraction not implemented in this checkpoint)`);

  console.log("");
  console.log("Periods (oldest -> newest):");
  for (const period of raw.periods) {
    console.log(
      `  ${period.periodId.padEnd(9)} end=${period.periodEndDate}  filed=${period.filingDate ?? "MISSING"}  ` +
        STRUCTURED_FIELD_KEYS.map((key) => `${key}=${describeField(period[key])}`).join("  ")
    );
  }

  console.log("");
  console.log("Missing structured fields, by field (count across all periods):");
  for (const key of STRUCTURED_FIELD_KEYS) {
    const missingCount = raw.periods.filter((p) => p[key].status === "MISSING").length;
    console.log(`  ${key.padEnd(20)} ${missingCount}/${raw.periods.length} MISSING`);
  }

  const fundamentals: FundamentalsScoreResult = scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, raw);

  console.log("");
  console.log("Fundamentals components:");
  for (const c of fundamentals.components) {
    console.log(`  ${describeComponent(c)}`);
  }

  console.log("");
  console.log(`Fundamentals result: ${fundamentals.status}`);
  if (fundamentals.status === "SCORED") {
    console.log(`  overall: score=${fundamentals.overall.score}/10  state=${fundamentals.overall.state}`);
  }

  const { coverage } = fundamentals;
  console.log("");
  console.log("Evidence coverage:");
  console.log(`  totalDefinedWeight   = ${coverage.totalDefinedWeight.toFixed(2)}`);
  console.log(`  applicableWeight     = ${coverage.applicableWeight.toFixed(2)}`);
  console.log(`  availableWeight      = ${coverage.availableWeight.toFixed(2)}`);
  console.log(`  missingWeight        = ${coverage.missingWeight.toFixed(2)}`);
  console.log(`  availableWeightShare = ${(coverage.availableWeightShare * 100).toFixed(1)}%`);

  const notApplicable = fundamentals.components.filter((c) => c.status === "NOT_APPLICABLE").map((c) => c.key);
  const missing = fundamentals.components.filter((c) => c.status === "MISSING").map((c) => c.key);
  console.log("");
  console.log(`NOT_APPLICABLE: ${notApplicable.length ? notApplicable.join(", ") : "none"}`);
  console.log(`MISSING:        ${missing.length ? missing.join(", ") : "none"}`);
}

function reportFetchFailure(err: unknown): void {
  console.log("Result: PROVIDER REQUEST FAILURE");
  if (err instanceof SecEdgarNetworkError) {
    console.log(`Network error: ${err.message}`);
  } else if (err instanceof SecEdgarHttpError) {
    console.log(`HTTP error: ${err.message}`);
  } else {
    console.log(`Unexpected failure: ${(err as Error).message}`);
  }
  console.log("Not proceeding to fundamentals scoring — a request failure is not substituted with missing-data semantics.");
}

main().catch((err) => {
  console.error("Unexpected error during live validation:", err);
  process.exitCode = 1;
});
