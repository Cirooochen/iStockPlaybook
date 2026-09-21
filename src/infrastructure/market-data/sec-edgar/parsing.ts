// XBRL fact filtering/deduplication helpers — Phase E.7B, design doc §4.
// Pure, defensive helpers consumed by mappers.ts. Every function treats
// SecEdgarXbrlFact fields as potentially absent/malformed (they describe
// what a well-formed fact SHOULD contain, not a guarantee — types.ts's
// own doc comment) and never throws; a fact that fails a check is simply
// excluded, never coerced into a fabricated value.
import type { SecEdgarXbrlFact } from "./types";

// design doc §4.1 — the tolerant single-quarter window: 80-100 days.
// Rejects ~180-day (half-year), ~270-day (three-quarter), and ~365-day
// (annual) cumulative facts by construction; the same concept can return
// both a single-quarter fact and a year-to-date cumulative fact sharing
// the same `fp`, so duration — not `fp` — is the authoritative filter
// for that ambiguity. Exported (Phase E.7D,
// docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md §3/§4) so
// cash-flow-derivation.ts's alignment gate reuses this SAME tolerance
// for the gap between two cumulative facts — never a second, invented
// tolerance.
export const MIN_QUARTER_DURATION_DAYS = 80;
export const MAX_QUARTER_DURATION_DAYS = 100;

// design doc (E.7C) §1 — the two wider cumulative-YTD tiers: 6-month and
// 9-month. A filer's cash-flow-statement facts commonly appear ONLY at
// these durations for Q2/Q3 (never a genuine single-quarter fact) —
// live-confirmed for Unity's operating cash flow/capex this session.
const SIX_MONTH_MIN_DAYS = 170;
const SIX_MONTH_MAX_DAYS = 190;
const NINE_MONTH_MIN_DAYS = 260;
const NINE_MONTH_MAX_DAYS = 285;
// design doc §1 — the annual tier additionally requires `fp === "FY"`,
// not duration alone: duration alone could also match a fiscal year
// shortened by a fiscal-year-end change: that case is rejected on
// `fp`, not shoehorned into the same day-count window as a genuine
// full year (every annual fact sampled across E.7A/E.7B/E.7C carries
// `fp:"FY"`).
const FISCAL_YEAR_MIN_DAYS = 355;
const FISCAL_YEAR_MAX_DAYS = 375;

function durationDays(start: string, end: string): number | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return (endMs - startMs) / 86_400_000;
}

function isSingleQuarterDuration(start: string, end: string): boolean {
  const days = durationDays(start, end);
  return days !== null && days >= MIN_QUARTER_DURATION_DAYS && days <= MAX_QUARTER_DURATION_DAYS;
}

function isUsableFact(fact: SecEdgarXbrlFact): boolean {
  return (
    typeof fact.end === "string" &&
    typeof fact.val === "number" &&
    Number.isFinite(fact.val) &&
    typeof fact.fy === "number" &&
    typeof fact.fp === "string"
  );
}

// design doc §4.4 — group by canonical period key, keep the fact with
// the latest `filed` date. Handles both today's live-observed duplicate
// (two filings reporting the identical value for the same period) and a
// genuine amendment/restatement (a later filing reporting a DIFFERENT
// value for the same period) with one rule. A fact with no `filed` at
// all sorts as the earliest possible ("") — any fact that does carry a
// `filed` date always wins over one that doesn't.
function dedupeByLatestFiled(facts: SecEdgarXbrlFact[], keyOf: (fact: SecEdgarXbrlFact) => string): SecEdgarXbrlFact[] {
  const latestByKey = new Map<string, SecEdgarXbrlFact>();
  for (const fact of facts) {
    const key = keyOf(fact);
    const existing = latestByKey.get(key);
    if (existing === undefined || (fact.filed ?? "") >= (existing.filed ?? "")) {
      latestByKey.set(key, fact);
    }
  }
  return [...latestByKey.values()];
}

// design doc §4.1/§4.3 — the filter half of extractDurationFacts, kept as
// its own function (Phase I.4A.1,
// docs/phase-i-minimum-research-evidence.md §16.6) so mappers.ts's
// identity resolution can dedupe this SAME filtered-but-undeduped set by
// EARLIEST filed instead of extractDurationFacts's own latest-filed rule
// below — see mappers.ts's toEarliestByEnd for why a period's IDENTITY
// (filingDate/accn) needs the opposite dedup rule from its reported
// VALUE. Exported for that reason alone; behaves identically to before
// as an internal step of extractDurationFacts.
export function filterDurationFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return units.filter(
    (fact) => isUsableFact(fact) && fact.fp !== "FY" && typeof fact.start === "string" && isSingleQuarterDuration(fact.start, fact.end as string)
  );
}

// design doc §4.1/§4.3/§4.4 — for duration-type concepts (revenue,
// operating income, operating cash flow, capex): discard non-`fp`-Q
// facts (§4.3's FY exclusion), discard facts without a valid
// single-quarter duration (§4.1's cumulative-vs-quarter filter), then
// dedupe by (start, end) keeping the latest-filed (§4.4).
export function extractDurationFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return dedupeByLatestFiled(filterDurationFacts(units), (fact) => `${fact.start}|${fact.end}`);
}

// Phase I.4A.1 — the filter half of extractInstantFacts, exported for the
// same reason as filterDurationFacts above.
export function filterInstantFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return units.filter((fact) => isUsableFact(fact) && fact.fp !== "FY");
}

// design doc §4.2/§4.3/§4.4 — for instant/balance-sheet concepts (cash,
// debt components): no duration filtering (instant facts carry no
// `start` at all — there is no cumulative-vs-single-period ambiguity),
// just FY exclusion (§4.3) then dedupe by `end` keeping the latest-filed
// (§4.4) — the live-confirmed duplicate case (design doc §0.2: the same
// balance appearing once as its own quarter's figure and again as a
// later quarter's comparative prior-period figure).
export function extractInstantFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return dedupeByLatestFiled(filterInstantFacts(units), (fact) => fact.end as string);
}

// Phase I.4A.1 — the filter half of extractAnnualInstantFacts, exported
// for the same reason as filterDurationFacts above.
export function filterAnnualInstantFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return units.filter((fact) => isUsableFact(fact) && fact.fp === "FY");
}

// Phase I.2 — the annual-cadence counterpart to extractInstantFacts
// above: requires `fp === "FY"` instead of excluding it. Used only when
// quarterly extraction found zero periods at all (mappers.ts) — a 20-F
// filer with no 10-Q equivalent has no other `fp` value for its
// instant/balance-sheet facts, so extractInstantFacts's own FY-exclusion
// (there, to disambiguate a *quarterly* filer's comparative-figure
// duplicates) would otherwise reject every one of them.
export function extractAnnualInstantFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return dedupeByLatestFiled(filterAnnualInstantFacts(units), (fact) => fact.end as string);
}

// design doc (E.7C) §1/§4.4 — the 6-month cumulative-YTD tier: retained
// as a derivation INPUT (Q2 = 6M - Q1), never itself emitted as a
// period (§1's "output is unchanged, only which raw facts the mapper
// may read is extended"). Same FY-exclusion + latest-filed dedupe as
// extractDurationFacts, just a different duration window.
export function extractSixMonthCumulativeFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  const filtered = units.filter(
    (fact) =>
      isUsableFact(fact) &&
      fact.fp !== "FY" &&
      typeof fact.start === "string" &&
      isInRange(durationDays(fact.start, fact.end as string), SIX_MONTH_MIN_DAYS, SIX_MONTH_MAX_DAYS)
  );
  return dedupeByLatestFiled(filtered, (fact) => `${fact.start}|${fact.end}`);
}

// design doc (E.7C) §1/§4.4 — the 9-month cumulative-YTD tier: retained
// as a derivation input (Q3 = 9M - 6M).
export function extractNineMonthCumulativeFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  const filtered = units.filter(
    (fact) =>
      isUsableFact(fact) &&
      fact.fp !== "FY" &&
      typeof fact.start === "string" &&
      isInRange(durationDays(fact.start, fact.end as string), NINE_MONTH_MIN_DAYS, NINE_MONTH_MAX_DAYS)
  );
  return dedupeByLatestFiled(filtered, (fact) => `${fact.start}|${fact.end}`);
}

// Phase I.4A.1 — the filter half of extractFiscalYearCumulativeFacts,
// exported for the same reason as filterDurationFacts above. This is the
// annual field ASML (this fix's live-verified case) actually uses for
// revenue/operatingIncome/cash/debt identity.
export function filterFiscalYearCumulativeFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return units.filter(
    (fact) =>
      isUsableFact(fact) &&
      fact.fp === "FY" &&
      typeof fact.start === "string" &&
      isInRange(durationDays(fact.start, fact.end as string), FISCAL_YEAR_MIN_DAYS, FISCAL_YEAR_MAX_DAYS)
  );
}

// design doc (E.7C) §1/§4.4 — the annual (FY) cumulative tier: retained
// as a derivation input (Q4 = FY - 9M), never itself emitted as a
// period. Requires `fp === "FY"` in addition to the duration window
// (see the constant's own comment above) — the one tier where duration
// alone isn't the sole signal.
export function extractFiscalYearCumulativeFacts(units: SecEdgarXbrlFact[]): SecEdgarXbrlFact[] {
  return dedupeByLatestFiled(filterFiscalYearCumulativeFacts(units), (fact) => `${fact.start}|${fact.end}`);
}

function isInRange(days: number | null, min: number, max: number): boolean {
  return days !== null && days >= min && days <= max;
}

// design doc §5 — `"Q1"` -> `1`, ..., `"Q4"` -> `4`. FY/absent facts are
// already excluded before this runs (§4.3), so a non-Qn `fp` reaching
// here is unexpected; returns `null` rather than fabricating a quarter.
export function parseFiscalQuarter(fp: string): 1 | 2 | 3 | 4 | null {
  switch (fp) {
    case "Q1":
      return 1;
    case "Q2":
      return 2;
    case "Q3":
      return 3;
    case "Q4":
      return 4;
    default:
      return null;
  }
}
