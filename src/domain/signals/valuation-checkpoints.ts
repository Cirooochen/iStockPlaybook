// EV/Revenue Checkpoints — Phase I.4A Valuation Data Foundation.
// Spec: docs/phase-i-minimum-research-evidence.md's 0.30.0 feasibility
// spike (product/model decisions resolved there, restated in this file's
// comments where they drive a specific rule) and §7/§9 (EV/Revenue as the
// single Phase I valuation ratio, the currency-integrity boundary this
// module is the first real caller of).
//
// ── Scope of this file — evidence, not classification ───────────────────
// Produces per-fiscal-year EV/Revenue OBSERVATIONS only — a checkpoint's
// own enterprise value, trailing-twelve-month revenue, and their ratio.
// No above/within/below-history classification, no percentile, no score,
// no UI. That is future Valuation Context work this file does not
// implement (docs/phase-i-minimum-research-evidence.md §2.2/§9.5).
//
// ── Checkpoint model (0.30.0, resolved) ──────────────────────────────────
// - Current + up to MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS completed fiscal
//   years, anchored to periods already in RawFundamentalsData.periods —
//   never a dense independent grid, never synthesized/interpolated.
// - "Completed fiscal year" = an ANNUAL period (every ANNUAL period IS one
//   fiscal year) or a QUARTERLY period whose fiscalQuarter is 4 (the one
//   quarter whose trailing-twelve-month window is that fiscal year).
// - Each checkpoint's date is its period's OWN filingDate (the
//   filing/knowledge date, not periodEndDate) — the date used to select
//   both the historical price and, when needed, the historical FX rate.
// - Historical price = the latest trading-day bar on or before that date
//   — never a future bar, never interpolated between bars.
// - Historical shares outstanding join fundamentals by SEC accession
//   number (RawFundamentalsPeriod.accn <->
//   RawFundamentalsData.sharesOutstandingByAccession) — the one
//   non-arbitrary alignment key verified live for both reference filers.
// - Historical FX is only needed (and only fetched, by this module's
//   caller) when priceCurrency !== reportingCurrency; when needed, it
//   too is resolved to the latest FX bar on or before the checkpoint
//   date — never today's rate applied retroactively.
// - Any required evidence missing for a given checkpoint DROPS that
//   checkpoint entirely — no interpolation, no backfill, no partial
//   observation. A dropped checkpoint simply does not appear in the
//   returned array.
//
// Formula (0.30.0, resolved):
//   MarketCap = price * sharesOutstanding                    (priceCurrency)
//   EV        = normalizedMarketCap + totalDebt - cash        (reportingCurrency)
//   EV/Revenue = EV / trailingTwelveMonthRevenue
// `totalDebt`/`cashAndEquivalents` are already in reportingCurrency
// (RawFundamentalsData.reportingCurrency's own doc comment); only
// MarketCap ever needs normalizing, via resolveCurrencyIntegrity — never
// combined with totalDebt/cash directly.
import type { DataField, FxRate, OhlcvBar } from "@/types/market-data";
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";
import { resolveCurrencyIntegrity, type CurrencyIntegrityResult } from "@/domain/market-data/currency-integrity";
import { computeTrailingTwelveMonthRevenue } from "./fundamentals";

// 0.30.0 — "current + up to 5 completed fiscal-year checkpoints."
export const MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS = 5;

export interface EvRevenueCheckpointInput {
  periods: RawFundamentalsPeriod[]; // oldest -> newest, RawFundamentalsData's own convention
  periodType: FundamentalsPeriodType;
  reportingCurrency: string | undefined; // RawFundamentalsData.reportingCurrency
  sharesOutstandingByAccession: Record<string, DataField<number>>; // RawFundamentalsData.sharesOutstandingByAccession
  priceOhlcv: OhlcvBar[]; // oldest -> newest, the instrument's own price listing
  priceCurrency: string; // that listing's currency (e.g. RawQuote.currency)
  // oldest -> newest bars of the priceCurrency/reportingCurrency pair
  // (i.e. one unit of priceCurrency expressed in reportingCurrency).
  // Omit entirely when priceCurrency === reportingCurrency — no FX is
  // ever needed or consulted in that case, regardless of whether a
  // caller supplies this.
  fxOhlcv?: OhlcvBar[];
}

export interface EvRevenueCheckpoint {
  fiscalYear: number;
  periodId: string;
  checkpointDate: string; // the period's own filingDate — used to select price/FX
  price: number;
  priceCurrency: string;
  sharesOutstanding: number;
  marketCap: number; // priceCurrency
  // SAME_CURRENCY or CONVERTED only — a MISSING integrity result drops
  // this checkpoint instead of ever appearing here.
  currencyIntegrity: CurrencyIntegrityResult;
  normalizedMarketCap: number; // reportingCurrency
  totalDebt: number; // reportingCurrency
  cashAndEquivalents: number; // reportingCurrency
  enterpriseValue: number; // reportingCurrency
  trailingTwelveMonthRevenue: number; // reportingCurrency
  evToRevenue: number;
}

function isCompletedFiscalYearPeriod(period: RawFundamentalsPeriod, periodType: FundamentalsPeriodType): boolean {
  return periodType === "ANNUAL" ? true : period.fiscalQuarter === 4;
}

// The most recent period is always "current," whatever quarter it is (its
// own trailing-twelve-month window is still a genuine, real TTM figure).
// Completed fiscal years are sampled separately, most-recent-first, from
// every OTHER period that is itself a full fiscal year — never a
// synthesized point between two real periods.
//
// Deliberately orders/selects by the array's own already-guaranteed
// periodEndDate-ascending position (RawFundamentalsData's own contract,
// enforced by the mapper's isSortedOldestToNewest check) — NEVER by
// re-sorting on `period.fiscalYear` itself. Live-verified against ASML's
// real SEC data: its `fy` tag is per-FILING, not per-fact — a later
// filing's own comparative disclosure of an OLDER fiscal year's figures
// (a 20-F's multi-year income statement) carries THAT LATER filing's own
// `fy` label, not the label of the year it actually describes. Combined
// with §4.4's own "latest-filed wins" dedup (correct for restated VALUES,
// but not the fy/accn IDENTITY riding along with it), multiple genuinely
// distinct periods (different periodEndDate) can end up sharing the same
// mislabeled `fiscalYear`. `periods` itself has no such defect — it is
// already deduped to one entry per distinct periodEndDate — so sampling
// by array position is immune to this even though the label is not; see
// docs/phase-i-minimum-research-evidence.md's Phase I.4A section for the
// full finding.
function selectCheckpointPeriods(
  periods: RawFundamentalsPeriod[],
  periodType: FundamentalsPeriodType,
  maxCompleted: number
): RawFundamentalsPeriod[] {
  if (periods.length === 0) return [];
  const current = periods[periods.length - 1];
  const completedFiscalYears = periods
    .slice(0, -1)
    .filter((period) => isCompletedFiscalYearPeriod(period, periodType))
    .slice(-maxCompleted)
    .reverse();
  return [current, ...completedFiscalYears];
}

// "Historical price = latest trading-day price on or before filing date" —
// never a future bar. Assumes `bars` is sorted oldest-to-newest, same
// input contract every other derivation function in this codebase already
// assumes of its own ordered array (fundamentals.ts's own top-of-file
// comment). If the latest QUALIFYING bar's own close is itself MISSING,
// this returns MISSING rather than searching further back for a
// substitute — that would be a form of backfill this module never does.
function findLatestBarCloseOnOrBefore(bars: OhlcvBar[], date: string): DataField<number> {
  let candidate: OhlcvBar | undefined;
  for (const bar of bars) {
    if (bar.date > date) break; // ascending order — nothing from here on can qualify
    candidate = bar;
  }
  return candidate?.close ?? { status: "MISSING" };
}

// Resolves the SAME_CURRENCY/CONVERTED/MISSING boundary for one
// checkpoint's own date — "historical FX must be dated to the checkpoint;
// never use today's FX." Only consults `fxOhlcv` at all when the two
// currencies actually differ; a same-currency checkpoint never looks at
// FX, even if a caller supplied it.
function resolveCheckpointCurrencyIntegrity(
  priceCurrency: string,
  reportingCurrency: string,
  fxOhlcv: OhlcvBar[] | undefined,
  checkpointDate: string
): CurrencyIntegrityResult {
  if (priceCurrency === reportingCurrency) {
    return resolveCurrencyIntegrity(priceCurrency, reportingCurrency);
  }
  const fxField = findLatestBarCloseOnOrBefore(fxOhlcv ?? [], checkpointDate);
  const fx: FxRate | undefined =
    fxField.status === "AVAILABLE" ? { from: priceCurrency, to: reportingCurrency, rate: fxField } : undefined;
  return resolveCurrencyIntegrity(priceCurrency, reportingCurrency, fx);
}

function computeCheckpoint(
  period: RawFundamentalsPeriod,
  windowPeriods: RawFundamentalsPeriod[],
  periodType: FundamentalsPeriodType,
  input: EvRevenueCheckpointInput,
  reportingCurrency: string
): EvRevenueCheckpoint | undefined {
  if (period.filingDate === undefined) return undefined;
  const checkpointDate = period.filingDate;

  const ttmRevenue = computeTrailingTwelveMonthRevenue(windowPeriods, periodType);
  if (ttmRevenue.status === "MISSING" || ttmRevenue.value === 0) return undefined;

  // "Missing debt remains MISSING; never infer zero debt" — already the
  // mapper's own rule (toTotalDebtField); restated here as this
  // formula's own required-evidence gate, not a new rule.
  if (period.totalDebt.status === "MISSING" || period.cashAndEquivalents.status === "MISSING") return undefined;

  if (period.accn === undefined) return undefined;
  const shares = input.sharesOutstandingByAccession[period.accn];
  if (shares === undefined || shares.status === "MISSING") return undefined;

  const priceField = findLatestBarCloseOnOrBefore(input.priceOhlcv, checkpointDate);
  if (priceField.status === "MISSING") return undefined;

  const currencyIntegrity = resolveCheckpointCurrencyIntegrity(input.priceCurrency, reportingCurrency, input.fxOhlcv, checkpointDate);
  if (currencyIntegrity.status === "MISSING") return undefined;

  const marketCap = priceField.value * shares.value;
  const normalizedMarketCap = currencyIntegrity.status === "SAME_CURRENCY" ? marketCap : marketCap * currencyIntegrity.rate;
  const enterpriseValue = normalizedMarketCap + period.totalDebt.value - period.cashAndEquivalents.value;

  return {
    fiscalYear: period.fiscalYear,
    periodId: period.periodId,
    checkpointDate,
    price: priceField.value,
    priceCurrency: input.priceCurrency,
    sharesOutstanding: shares.value,
    marketCap,
    currencyIntegrity,
    normalizedMarketCap,
    totalDebt: period.totalDebt.value,
    cashAndEquivalents: period.cashAndEquivalents.value,
    enterpriseValue,
    trailingTwelveMonthRevenue: ttmRevenue.value,
    evToRevenue: enterpriseValue / ttmRevenue.value,
  };
}

// Current + up to MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS completed fiscal
// years, current first — see selectCheckpointPeriods. Every checkpoint
// with any required evidence missing is silently dropped from the
// returned array (no MISSING placeholder entry) — an empty result is a
// legitimate, honest outcome (e.g. a filer whose debt never resolves any
// tag at all, at every checkpoint), not a bug.
export function deriveEvRevenueCheckpoints(input: EvRevenueCheckpointInput): EvRevenueCheckpoint[] {
  if (input.reportingCurrency === undefined) return [];
  const reportingCurrency = input.reportingCurrency;

  const checkpointPeriods = selectCheckpointPeriods(input.periods, input.periodType, MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS);

  const results: EvRevenueCheckpoint[] = [];
  for (const period of checkpointPeriods) {
    const index = input.periods.indexOf(period);
    const windowPeriods = input.periods.slice(0, index + 1);
    const checkpoint = computeCheckpoint(period, windowPeriods, input.periodType, input, reportingCurrency);
    if (checkpoint !== undefined) results.push(checkpoint);
  }
  return results;
}
