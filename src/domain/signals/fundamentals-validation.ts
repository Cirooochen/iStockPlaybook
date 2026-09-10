// Structural validation + asOf-derivation helpers for the fundamentals
// period-metadata contract — Phase E.6A.
// docs/phase-e5-fundamentals-live-evidence-strategy.md §3/§4/§6.
//
// Purely structural, mirroring src/domain/market-data/validation.ts's
// own scope exactly: these check that a value is internally well-formed,
// not that data is complete or fresh (MISSING is a valid DataField
// state, unaffected by anything here). No provider-specific rules.
//
// Deliberately NOT wired into any derivation function in
// src/domain/signals/fundamentals.ts — same precedent
// src/domain/market-data/validation.ts already set for momentum: a
// separate, standalone validation layer, not embedded in the derivation
// hot path. Preserves E.1A–E.4 derivation/scoring behavior unchanged.
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";

// design doc §3 — QUARTERLY periods must carry a valid fiscalQuarter
// (1-4); ANNUAL periods are never required to (present or absent, both
// pass — "annual periods not requiring fiscalQuarter" means optional,
// not forbidden).
export function hasRequiredFiscalQuarter(
  period: RawFundamentalsPeriod,
  periodType: FundamentalsPeriodType
): boolean {
  if (periodType === "ANNUAL") return true;
  return (
    period.fiscalQuarter !== undefined &&
    Number.isInteger(period.fiscalQuarter) &&
    period.fiscalQuarter >= 1 &&
    period.fiscalQuarter <= 4
  );
}

// A calendar date, not a full timestamp — still just needs to parse to
// a real date. Same shape as market-data validation.ts's
// isValidOhlcvDate.
export function isValidPeriodEndDate(periodEndDate: string): boolean {
  return !Number.isNaN(Date.parse(periodEndDate));
}

// filingDate is optional — absence is valid (design doc §3); when
// present, it must parse to a real date.
export function isValidFilingDate(filingDate: string | undefined): boolean {
  return filingDate === undefined || !Number.isNaN(Date.parse(filingDate));
}

// design doc §4/§5 — RawFundamentalsData.periods is assumed sorted
// ascending by periodEndDate (oldest first), the same convention every
// derivation function in fundamentals.ts already relies on. Strictly
// non-decreasing (equal periodEndDate values are tolerated, not
// flagged) — this checks ordering only, not fiscal-identity uniqueness.
export function isSortedOldestToNewest(periods: readonly RawFundamentalsPeriod[]): boolean {
  for (let i = 1; i < periods.length; i++) {
    if (Date.parse(periods[i].periodEndDate) < Date.parse(periods[i - 1].periodEndDate)) {
      return false;
    }
  }
  return true;
}

// design doc §6 — the resolved asOf semantics: filingDate (when the
// fact actually became knowable) is preferred whenever present;
// periodEndDate (when the underlying business activity happened) is
// the fallback, explicitly less correct but never left unset. Whoever
// constructs a RawFundamentalsPeriod's individual DataFields should
// source each field's own `asOf` from this function, not invent a
// separate convention per field.
export function deriveFundamentalsFieldAsOf(period: RawFundamentalsPeriod): string {
  return period.filingDate ?? period.periodEndDate;
}
