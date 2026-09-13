// SEC EDGAR companyfacts -> RawFundamentalsData — Phase E.7B, extended
// by Phase E.7D for operatingCashFlow/capitalExpenditures derivation.
// Spec: docs/phase-e7a-sec-edgar-structured-fundamentals-adapter-design.md
// (source of truth for every direct field mapping/rule below),
// docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md (source
// of truth for the cash-flow derivation applied to
// operatingCashFlow/capitalExpenditures only), and
// docs/phase-e5-fundamentals-live-evidence-strategy.md /
// docs/phase-e0-fundamentals-evidence-contract-design.md (the contract
// itself, unchanged).
//
// Pure function, mirroring twelve-data/mappers.ts's mapQuoteResponse
// (C.8A): takes an already-fetched JSON payload plus a caller-supplied
// `checkedAt`, returns the contract type, makes no network call itself,
// and is deterministic (no ambient clock reads).
//
// Whole-payload failure vs. per-field MISSING (design doc §8): if the
// payload isn't shaped like a companyfacts response at all, this throws
// SecEdgarMappingError (a provider-level failure). A single field's
// every-candidate-tag-absent, or a single period's fact simply missing
// for one field, is MISSING on that field — never a thrown error, never
// a fabricated value.
import type { RawFundamentalsData, RawFundamentalsPeriod } from "@/types/fundamentals";
import type { DataField } from "@/types/market-data";
import {
  hasRequiredFiscalQuarter,
  isValidFilingDate,
  isValidPeriodEndDate,
  isSortedOldestToNewest,
} from "@/domain/signals/fundamentals-validation";
import { deriveQuarterlyCashFlowFacts } from "./cash-flow-derivation";
import { SecEdgarMappingError } from "./errors";
import {
  extractDurationFacts,
  extractFiscalYearCumulativeFacts,
  extractInstantFacts,
  extractNineMonthCumulativeFacts,
  extractSixMonthCumulativeFacts,
  parseFiscalQuarter,
} from "./parsing";
import type { SecEdgarCompanyFactsResponse, SecEdgarXbrlConcept, SecEdgarXbrlFact } from "./types";
import { zeroPadCik } from "./ticker-resolver";

// design doc §3 — ordered fallback lists; try each candidate tag in
// order, the first one present (with usable USD facts) is used. Never
// summed except totalDebt's two sub-components below, which the
// contract itself (E.1A) already defines as a sum.
const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
];
const OPERATING_INCOME_TAGS = ["OperatingIncomeLoss"];
const OPERATING_CASH_FLOW_TAGS = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
];
const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsForCapitalImprovements",
  "PaymentsToAcquireProductiveAssets",
];
const CASH_TAGS = [
  "CashAndCashEquivalentsAtCarryingValue",
  "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
];
// design doc §3.6 — totalDebt = sum of whichever of these resolve.
const DEBT_SHORT_TAGS = ["DebtCurrent", "ShortTermBorrowings", "LongTermDebtCurrent"];
const DEBT_LONG_TAGS = ["LongTermDebtNoncurrent", "LongTermDebt"];

type UsGaapFacts = Record<string, SecEdgarXbrlConcept | undefined>;

// design doc §6 — explicit "USD" unit-key selection, never "the first
// key present" (some concepts elsewhere in the same payload, e.g. share
// counts, use a "shares" unit instead).
function resolveUsdUnits(facts: UsGaapFacts, candidates: readonly string[]): SecEdgarXbrlFact[] {
  for (const tag of candidates) {
    const units = facts[tag]?.units?.USD;
    if (Array.isArray(units) && units.length > 0) return units;
  }
  return [];
}

// Merges a field's already-filtered/deduped facts into a lookup by
// `end` date, resolving any residual same-`end` collision by latest
// `filed` too — cheap extra insurance on top of parsing.ts's own
// dedupe, not a new rule.
function toMapByEnd(facts: SecEdgarXbrlFact[]): Map<string, SecEdgarXbrlFact> {
  const map = new Map<string, SecEdgarXbrlFact>();
  for (const fact of facts) {
    const end = fact.end as string;
    const existing = map.get(end);
    if (existing === undefined || (fact.filed ?? "") >= (existing.filed ?? "")) {
      map.set(end, fact);
    }
  }
  return map;
}

// Phase E.7D — resolves a cash-flow-statement field's (operating cash
// flow / capex only, per docs/phase-e7c-.../design.md §9's scope) `end`
// lookup: direct single-quarter facts, extended by cumulative-YTD
// derivation ONLY for `end`s no direct fact already covers (design doc
// item 8's precedence — direct always wins). Every other field
// (revenue, operating income, cash, debt) is unaffected — it keeps the
// plain extractDurationFacts/extractInstantFacts + toMapByEnd path
// above, unchanged since E.7B.
function resolveCashFlowFieldByEnd(usGaap: UsGaapFacts, tags: readonly string[]): Map<string, SecEdgarXbrlFact> {
  const units = resolveUsdUnits(usGaap, tags);
  const direct = extractDurationFacts(units);
  const derived = deriveQuarterlyCashFlowFacts(
    direct,
    extractSixMonthCumulativeFacts(units),
    extractNineMonthCumulativeFacts(units),
    extractFiscalYearCumulativeFacts(units)
  );

  const byEnd = toMapByEnd(direct);
  for (const [end, fact] of derived) {
    if (!byEnd.has(end)) byEnd.set(end, fact); // direct fact always overrides a derived one — never reached when it already exists, restated here defensively
  }
  return byEnd;
}

// design doc §5 — every numeric DataField's own asOf is `filed` from
// THAT field's own resolved fact, falling back to `end` only if absent
// — deriveFundamentalsFieldAsOf's `filingDate ?? periodEndDate` rule,
// applied at the individual-fact level (this mapper's first real
// application of that already-approved rule).
function toDataField(fact: SecEdgarXbrlFact | undefined): DataField<number> {
  if (fact === undefined || typeof fact.val !== "number") return { status: "MISSING" };
  return { status: "AVAILABLE", value: fact.val, asOf: fact.filed ?? (fact.end as string) };
}

// design doc §3.6/§7 — totalDebt is the one summed field. Per period:
// if NEITHER sub-component has a resolved fact, the field is MISSING
// (never $0 — absence of every candidate tag cannot be distinguished
// from "not disclosed this way" vs. "genuinely zero"). If at least one
// resolves, the other's absence (whether because its tag never
// resolved for this instrument at all, or just has no fact for this
// specific period) contributes a genuine $0 to the sum — a filer with
// zero short-term debt commonly omits that tag entirely rather than
// reporting an explicit zero.
function toTotalDebtField(shortFact: SecEdgarXbrlFact | undefined, longFact: SecEdgarXbrlFact | undefined, end: string): DataField<number> {
  if (shortFact === undefined && longFact === undefined) return { status: "MISSING" };
  const shortVal = typeof shortFact?.val === "number" ? shortFact.val : 0;
  const longVal = typeof longFact?.val === "number" ? longFact.val : 0;
  const filedDates = [shortFact?.filed, longFact?.filed].filter((f): f is string => typeof f === "string");
  const asOf = filedDates.length > 0 ? filedDates.sort().at(-1)! : end;
  return { status: "AVAILABLE", value: shortVal + longVal, asOf };
}

export function mapEdgarCompanyFacts(payload: unknown, checkedAt: string): RawFundamentalsData {
  if (typeof payload !== "object" || payload === null) {
    throw new SecEdgarMappingError("SEC EDGAR companyfacts payload is not an object");
  }
  const response = payload as SecEdgarCompanyFactsResponse;
  if (typeof response.cik !== "number" || !Number.isFinite(response.cik)) {
    throw new SecEdgarMappingError("SEC EDGAR companyfacts payload is missing a valid `cik`");
  }

  const usGaap: UsGaapFacts = response.facts?.["us-gaap"] ?? {};

  const revenueByEnd = toMapByEnd(extractDurationFacts(resolveUsdUnits(usGaap, REVENUE_TAGS)));
  const operatingIncomeByEnd = toMapByEnd(extractDurationFacts(resolveUsdUnits(usGaap, OPERATING_INCOME_TAGS)));
  const operatingCashFlowByEnd = resolveCashFlowFieldByEnd(usGaap, OPERATING_CASH_FLOW_TAGS);
  const capexByEnd = resolveCashFlowFieldByEnd(usGaap, CAPEX_TAGS);
  const cashByEnd = toMapByEnd(extractInstantFacts(resolveUsdUnits(usGaap, CASH_TAGS)));
  const debtShortByEnd = toMapByEnd(extractInstantFacts(resolveUsdUnits(usGaap, DEBT_SHORT_TAGS)));
  const debtLongByEnd = toMapByEnd(extractInstantFacts(resolveUsdUnits(usGaap, DEBT_LONG_TAGS)));

  // design doc §5 — the row-level period identity (fiscalYear/
  // fiscalQuarter/filingDate) is taken from whichever field has a fact
  // at this `end` date first, in this fixed priority order — every
  // field's fact for the same real-world quarter should agree on
  // fy/fp/filed in the common case; this only matters when they don't.
  const priorityMaps = [
    revenueByEnd,
    operatingIncomeByEnd,
    operatingCashFlowByEnd,
    capexByEnd,
    cashByEnd,
    debtShortByEnd,
    debtLongByEnd,
  ];

  const allEnds = new Set<string>();
  for (const map of priorityMaps) {
    for (const end of map.keys()) allEnds.add(end);
  }

  const periods: RawFundamentalsPeriod[] = [];
  for (const end of allEnds) {
    let representative: SecEdgarXbrlFact | undefined;
    for (const map of priorityMaps) {
      const candidate = map.get(end);
      if (candidate !== undefined && typeof candidate.fy === "number" && parseFiscalQuarter(candidate.fp as string) !== null) {
        representative = candidate;
        break;
      }
    }
    // Defensive skip, not expected to trigger: every fact reaching this
    // point already passed extractDurationFacts/extractInstantFacts'
    // isUsableFact check (fy/fp present), so a representative should
    // always be found. Dropping rather than fabricating a fiscal
    // year/quarter is the safer failure mode if it ever doesn't.
    if (representative === undefined) continue;

    const fiscalQuarter = parseFiscalQuarter(representative.fp as string) as 1 | 2 | 3 | 4;
    const fiscalYear = representative.fy as number;

    periods.push({
      periodId: `${fiscalYear}-Q${fiscalQuarter}`,
      fiscalYear,
      fiscalQuarter,
      periodEndDate: end,
      filingDate: representative.filed,
      revenue: toDataField(revenueByEnd.get(end)),
      operatingIncome: toDataField(operatingIncomeByEnd.get(end)),
      operatingCashFlow: toDataField(operatingCashFlowByEnd.get(end)),
      capitalExpenditures: toDataField(capexByEnd.get(end)),
      cashAndEquivalents: toDataField(cashByEnd.get(end)),
      totalDebt: toTotalDebtField(debtShortByEnd.get(end), debtLongByEnd.get(end), end),
    });
  }

  // design doc §4.5 — never trust any implicit ordering, sort
  // explicitly ourselves (mirrors mapTimeSeriesResponse's own
  // precedent, C.8A).
  periods.sort((a, b) => Date.parse(a.periodEndDate) - Date.parse(b.periodEndDate));

  const result: RawFundamentalsData = {
    instrumentId: zeroPadCik(response.cik),
    periodType: "QUARTERLY",
    periods,
    guidanceEvidence: { status: "MISSING" }, // Path B (AI extraction) is a separate, later checkpoint
    checkedAt,
  };

  validateMapperOutput(result);
  return result;
}

// design doc §8 — self-validates before returning, reusing E.6A's
// existing structural validation helpers rather than inventing new
// logic. Every check here is an invariant this mapper's own
// construction should already guarantee; a violation means the mapper
// itself is broken, not that the provider returned sparse data — hence
// a thrown SecEdgarMappingError, not a per-field MISSING.
function validateMapperOutput(result: RawFundamentalsData): void {
  for (const period of result.periods) {
    if (!hasRequiredFiscalQuarter(period, result.periodType)) {
      throw new SecEdgarMappingError(`mapped period ${period.periodId} is missing a valid fiscalQuarter`);
    }
    if (!isValidPeriodEndDate(period.periodEndDate)) {
      throw new SecEdgarMappingError(`mapped period ${period.periodId} has an invalid periodEndDate`);
    }
    if (!isValidFilingDate(period.filingDate)) {
      throw new SecEdgarMappingError(`mapped period ${period.periodId} has an invalid filingDate`);
    }
  }
  if (!isSortedOldestToNewest(result.periods)) {
    throw new SecEdgarMappingError("mapped periods are not sorted oldest-to-newest");
  }
}
