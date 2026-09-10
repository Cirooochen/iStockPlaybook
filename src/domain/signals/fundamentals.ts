// Fundamentals — deterministic raw-evidence derivation. Phase E.1A
// (Revenue Growth/Operating Margin/FCF/TTM revenue/netCashToRevenue/
// Guidance mapping) + Phase E.1B (Growth Trend/Margin Trend) + Phase E.2
// (FCF Margin). docs/phase-e0-fundamentals-evidence-contract-design.md
// §3/§3.1/§3.3, docs/phase-e1b-fundamentals-trend-methodology-design.md
// §4, docs/phase-e1c-fundamentals-normalization-design.md §4, spec
// §11/§12.
//
// ── Scope of this file — evidence, not scoring ───────────────────────────
// Every function below computes a RAW derived VALUE (a ratio, a sum, a
// dollar figure) from RawFundamentalsData — never a 0-100 normalized
// score. This mirrors the RawMarketData -> DerivedTechnicalSignals split
// (src/domain/signals/momentum.ts): "how do I compute this dimension's
// raw evidence" is answered here; the 0-100 normalization step lives in
// src/domain/signals/fundamentals-templates/growth-software.ts (Phase
// E.2), exactly like momentum.ts's raw computations vs.
// momentum-score.ts's anchors. The one exception remains
// mapGuidanceEvidenceToScore below — spec §12 gives Guidance's full
// evidence-to-score mapping table verbatim (a discrete lookup, not an
// anchor curve), so it has always lived here as evidence-plus-mapping in
// one step.
//
// ── Input contract (must hold for every function in this file) ──────────
// `periods` is assumed sorted ASCENDING by period (oldest first),
// mirroring RawMarketData.ohlcv's convention (RawFundamentalsData's own
// doc comment). Absent any periodType/cadence field on
// RawFundamentalsPeriod, every function here assumes QUARTERLY reporting
// — "same period prior year" = 4 entries back, "trailing twelve months"
// = the most recent 4 entries. This is a raw-data-shape assumption, not
// a model choice — design doc §3.3 already named this as the primary
// case and pushed annual-cadence support to "a data-provider question,"
// not resolved here.
// No partial computation: if any single required field across the
// required periods is MISSING, the whole result is MISSING — no
// skipping, no backfilling, matching momentum.ts's own established
// convention.
import type { DataField } from "@/types/market-data";
import type { RawFundamentalsPeriod, GuidanceEvidence } from "@/types/fundamentals";

const QUARTERS_PER_YEAR = 4;

// Revenue Growth — design doc §3 table: "current-period revenue,
// same-period-prior-year revenue." A base of exactly 0 has no meaningful
// growth rate (division by zero) and is reported MISSING, not +/-Infinity
// or a fabricated number.
export function computeRevenueGrowth(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < QUARTERS_PER_YEAR + 1) return { status: "MISSING" };

  const current = periods[periods.length - 1];
  const priorYear = periods[periods.length - 1 - QUARTERS_PER_YEAR];
  if (current.revenue.status === "MISSING" || priorYear.revenue.status === "MISSING") {
    return { status: "MISSING" };
  }
  if (priorYear.revenue.value === 0) return { status: "MISSING" };

  return {
    status: "AVAILABLE",
    value: (current.revenue.value - priorYear.revenue.value) / priorYear.revenue.value,
    asOf: current.revenue.asOf,
  };
}

// Operating Margin — design doc §3 table: "operating income, revenue
// (current period)." Zero revenue has no meaningful margin and is
// reported MISSING.
export function computeOperatingMargin(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < 1) return { status: "MISSING" };

  const current = periods[periods.length - 1];
  if (current.operatingIncome.status === "MISSING" || current.revenue.status === "MISSING") {
    return { status: "MISSING" };
  }
  if (current.revenue.value === 0) return { status: "MISSING" };

  return {
    status: "AVAILABLE",
    value: current.operatingIncome.value / current.revenue.value,
    asOf: current.revenue.asOf,
  };
}

// Free Cash Flow — design doc §3 table: "operating cash flow, capital
// expenditures (current period)... computed from two raw fields." A raw
// dollar figure, not a margin/ratio (unlike Revenue Growth/Operating
// Margin) — this is what the already-approved E.0 table specifies, not a
// choice made here. `capitalExpenditures` is stored as a positive outflow
// figure (per RawFundamentalsPeriod's doc comment), so FCF is a plain
// subtraction — no division, so no zero-denominator edge case exists for
// this one.
export function computeFreeCashFlow(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < 1) return { status: "MISSING" };

  const current = periods[periods.length - 1];
  if (current.operatingCashFlow.status === "MISSING" || current.capitalExpenditures.status === "MISSING") {
    return { status: "MISSING" };
  }

  return {
    status: "AVAILABLE",
    value: current.operatingCashFlow.value - current.capitalExpenditures.value,
    asOf: current.operatingCashFlow.asOf,
  };
}

// Trailing Twelve Month Revenue — design doc §3.3: sum of the trailing
// four quarterly revenue values. No partial sum: if any one of the four
// is MISSING, the whole result is MISSING — a 3-quarter sum is not a
// meaningful stand-in for a 4-quarter one, matching momentum.ts's own
// "no shrinking the divisor" convention for insufficient history.
export function computeTrailingTwelveMonthRevenue(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < QUARTERS_PER_YEAR) return { status: "MISSING" };

  const window = periods.slice(-QUARTERS_PER_YEAR);
  let sum = 0;
  let asOf = "";
  for (const period of window) {
    if (period.revenue.status === "MISSING") return { status: "MISSING" };
    sum += period.revenue.value;
    asOf = period.revenue.asOf;
  }

  return { status: "AVAILABLE", value: sum, asOf };
}

// netCashToRevenue — design doc §3.3 (approved 2026-09-10):
//   netCashToRevenue = (cashAndEquivalents - totalDebt) / trailingTwelveMonthRevenue
// Raw evidence + formula only — the 0-100 normalization curve for this
// value is NOT implemented anywhere in this codebase (see this file's
// top-of-file doc comment): spec gives no anchors for it.
export function computeNetCashToRevenue(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < 1) return { status: "MISSING" };

  const current = periods[periods.length - 1];
  if (current.cashAndEquivalents.status === "MISSING" || current.totalDebt.status === "MISSING") {
    return { status: "MISSING" };
  }

  const ttmRevenue = computeTrailingTwelveMonthRevenue(periods);
  if (ttmRevenue.status === "MISSING") return { status: "MISSING" };
  if (ttmRevenue.value === 0) return { status: "MISSING" };

  return {
    status: "AVAILABLE",
    value: (current.cashAndEquivalents.value - current.totalDebt.value) / ttmRevenue.value,
    asOf: current.cashAndEquivalents.asOf,
  };
}

// Growth Trend — approved E.1B §4: a two-point delta of the already-
// derived Revenue Growth rate, one quarter apart. Pure composition of
// computeRevenueGrowth evaluated at two adjacent array cutoffs — the
// same technique src/domain/signals/trend.ts already established for
// computeDma200Slope (simpleMovingAverage called at two different
// cutoffs). MISSING propagates automatically from either evaluation; no
// new missing-data mechanism. Needs 6 periods minimum (computeRevenueGrowth
// needs 5; evaluating it a second time on periods.slice(0, -1) needs that
// slice to itself have 5).
export function computeGrowthTrend(periods: RawFundamentalsPeriod[]): DataField<number> {
  const current = computeRevenueGrowth(periods);
  const previous = computeRevenueGrowth(periods.slice(0, -1));
  if (current.status === "MISSING" || previous.status === "MISSING") {
    return { status: "MISSING" };
  }
  return { status: "AVAILABLE", value: current.value - previous.value, asOf: current.asOf };
}

// Margin Trend — approved E.1B §4: a two-point delta of the already-
// derived Operating Margin, one quarter apart. Same technique as
// computeGrowthTrend above. Needs 2 periods minimum (computeOperatingMargin
// needs 1; evaluating it a second time on periods.slice(0, -1) needs that
// slice to itself have 1).
export function computeMarginTrend(periods: RawFundamentalsPeriod[]): DataField<number> {
  const current = computeOperatingMargin(periods);
  const previous = computeOperatingMargin(periods.slice(0, -1));
  if (current.status === "MISSING" || previous.status === "MISSING") {
    return { status: "MISSING" };
  }
  return { status: "AVAILABLE", value: current.value - previous.value, asOf: current.asOf };
}

// FCF Margin — approved E.1C §4.1: the metric actually scored for the
// Free Cash Flow dimension (absolute dollar FCF, computeFreeCashFlow
// above, fails company-size independence and is not itself scoreable —
// see the E.1C design doc). FCF Margin = computeFreeCashFlow(periods) /
// current period's revenue — one small ratio on top of the already-
// implemented dollar figure, not a replacement for it.
export function computeFcfMargin(periods: RawFundamentalsPeriod[]): DataField<number> {
  if (periods.length < 1) return { status: "MISSING" };

  const current = periods[periods.length - 1];
  if (current.revenue.status === "MISSING") return { status: "MISSING" };
  if (current.revenue.value === 0) return { status: "MISSING" };

  const fcf = computeFreeCashFlow(periods);
  if (fcf.status === "MISSING") return { status: "MISSING" };

  return { status: "AVAILABLE", value: fcf.value / current.revenue.value, asOf: fcf.asOf };
}

// Guidance — spec §12's mapping table, cited verbatim, not invented. This
// is the ONE dimension whose full evidence-to-score mapping is spec-given
// end to end. Pure and total over every value GuidanceEvidence's own type
// can hold — REITERATED/MIXED ignore `magnitude` entirely, exactly as
// spec's table has no magnitude branch for those two directions. The
// caller is responsible for checking `RawFundamentalsData.guidanceEvidence
// .status` before calling this — it takes an already-AVAILABLE
// GuidanceEvidence, not a DataField, and never itself represents
// "missing."
export function mapGuidanceEvidenceToScore(evidence: GuidanceEvidence): number {
  switch (evidence.direction) {
    case "RAISED":
      return evidence.magnitude === "MATERIAL" ? 90 : 75;
    case "REITERATED":
      return 55;
    case "MIXED":
      return 45;
    case "LOWERED":
      return evidence.magnitude === "MATERIAL" ? 10 : 30;
  }
}
