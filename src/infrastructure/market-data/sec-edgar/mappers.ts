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
import type { FundamentalsPeriodType, RawFundamentalsData, RawFundamentalsPeriod } from "@/types/fundamentals";
import type { DataField } from "@/types/market-data";
import { isValidCurrency } from "@/domain/market-data/validation";
import {
  hasRequiredFiscalQuarter,
  isValidFilingDate,
  isValidPeriodEndDate,
  isSortedOldestToNewest,
} from "@/domain/signals/fundamentals-validation";
import { deriveQuarterlyCashFlowFacts } from "./cash-flow-derivation";
import { SecEdgarMappingError } from "./errors";
import {
  extractAnnualInstantFacts,
  extractDurationFacts,
  extractFiscalYearCumulativeFacts,
  extractInstantFacts,
  extractNineMonthCumulativeFacts,
  extractSixMonthCumulativeFacts,
  filterAnnualInstantFacts,
  filterDurationFacts,
  filterFiscalYearCumulativeFacts,
  filterInstantFacts,
  parseFiscalQuarter,
} from "./parsing";
import type { SecEdgarCompanyFactsResponse, SecEdgarXbrlConcept, SecEdgarXbrlFact } from "./types";
import { zeroPadCik } from "./ticker-resolver";

// design doc §3 — ordered fallback lists; try each candidate tag in
// order, the first one present (with usable facts in the payload's own
// discovered reporting currency — Phase I.3.1) is used. Never summed
// except totalDebt's two sub-components below, which the contract itself
// (E.1A) already defines as a sum.
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
// Phase I.1 — "dei" (Document and Entity Information), not "us-gaap":
// mandatory for every SEC XBRL filer regardless of accounting standard
// or reporting currency, unlike the financial-statement tags above.
// Confirmed live for both reference filers (Unity, ASML).
const SHARES_OUTSTANDING_TAGS = ["EntityCommonStockSharesOutstanding"];

type XbrlNamespaceFacts = Record<string, SecEdgarXbrlConcept | undefined>;

// design doc §6 (Phase I.1: generalized from a hardcoded "USD"; Phase
// I.3.1: `unitKey` is now the mapper's own discovered currency, never
// caller-supplied) — explicit, single unit-key selection, never "the
// first key present": a concept may carry facts in more than one unit
// (e.g. a share count alongside a currency figure, or the SAME financial
// concept in more than one currency across different filers). Reading
// any unit key other than the one currency discoverReportingCurrency
// established for this payload would silently mix currencies; see
// src/domain/market-data/currency-integrity.ts for why that boundary
// matters once these figures reach a future valuation calculation.
function resolveUnitFacts(facts: XbrlNamespaceFacts, candidates: readonly string[], unitKey: string): SecEdgarXbrlFact[] {
  for (const tag of candidates) {
    const units = facts[tag]?.units?.[unitKey];
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
// above, unchanged since E.7B. QUARTERLY-cadence only (Phase I.2) — an
// annual filer's own FY duration fact already covers its whole period
// directly; there is nothing to derive it FROM (no synthetic/
// interpolated quarters), so resolveAnnualFields below never calls this.
function resolveCashFlowFieldByEnd(usGaap: XbrlNamespaceFacts, tags: readonly string[], reportingCurrency: string): Map<string, SecEdgarXbrlFact> {
  const units = resolveUnitFacts(usGaap, tags, reportingCurrency);
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

// Phase I.2 — the seven per-period fields, resolved to an `end`-keyed
// lookup each, for ONE cadence. Shared shape between
// resolveQuarterlyFields and resolveAnnualFields below so
// buildPeriodsFromFields can merge either one identically — the two
// resolvers differ only in which parsing.ts extraction each field uses,
// never in structure.
interface FieldsByEnd {
  revenue: Map<string, SecEdgarXbrlFact>;
  operatingIncome: Map<string, SecEdgarXbrlFact>;
  operatingCashFlow: Map<string, SecEdgarXbrlFact>;
  capex: Map<string, SecEdgarXbrlFact>;
  cash: Map<string, SecEdgarXbrlFact>;
  debtShort: Map<string, SecEdgarXbrlFact>;
  debtLong: Map<string, SecEdgarXbrlFact>;
}

// Phase I.4A.1 — a cadence resolver now produces TWO parallel FieldsByEnd
// maps, not one: `values` (unchanged — latest-`filed` wins, the correct
// rule for a reported FIGURE, which should reflect the latest-known/
// restated number) and `identity` (new — earliest-`filed` wins, for a
// period's own IDENTITY: fiscalYear/fiscalQuarter/filingDate/accn). See
// toEarliestByEnd's own comment for why these must never be the same
// selection. buildPeriodsFromFields below reads VALUES from `values` and
// the `representative` fact (which supplies identity) from `identity`.
interface ResolvedFields {
  values: FieldsByEnd;
  identity: FieldsByEnd;
}

// Phase I.4A.1 root-cause fix (docs/phase-i-minimum-research-evidence.md
// §16.3/§16.6) — mirrors toMapByEnd exactly except it keeps the EARLIEST
// `filed` fact per `end` instead of the latest. Live-verified against
// ASML's real SEC data: a filing's primary financial statements disclose
// not just its own current fiscal year but also 1-2 prior years as
// comparatives, and those comparative facts carry THAT LATER filing's own
// `filed`/`accn` — not the year they actually describe. toMapByEnd's
// "latest wins" is the *correct* rule for a field's reported VALUE (a
// restated/most-recently-confirmed figure is the right number to show),
// but using that same "latest wins" fact to also supply a period's
// filingDate/accn means every historical period's price/shares/FX
// selection point-in-time key silently drifts forward to whatever later
// filing happened to restate it — up to ~2 years later, confirmed live.
// The EARLIEST-filed fact at a given `end` is, by construction, that
// period's own first-ever disclosure — the genuine filing/knowledge date
// this period's own facts (and nothing checkpointed off of them) were
// actually known — and a later filing merely repeating the same `end` as
// comparative data can never win here, regardless of how much fresher it
// is in the raw fact array.
//
// MUST be fed the FILTERED-BUT-UNDEDUPED fact array (parsing.ts's new
// filterDurationFacts/filterInstantFacts/filterAnnualInstantFacts/
// filterFiscalYearCumulativeFacts) — never the corresponding extract*
// function's own output. Every extract* function already calls
// dedupeByLatestFiled internally (parsing.ts §4.4), which collapses each
// `end` down to its OWN latest-filed fact before this function would ever
// see more than one candidate — silently defeating "earliest wins" by
// construction. This was this fix's actual first attempt, and it visibly
// failed live validation (checkpoint dates were unchanged) until traced
// back to this upstream dedup — restated here so the same mistake isn't
// repeated.
function toEarliestByEnd(facts: SecEdgarXbrlFact[]): Map<string, SecEdgarXbrlFact> {
  const map = new Map<string, SecEdgarXbrlFact>();
  for (const fact of facts) {
    const end = fact.end as string;
    const existing = map.get(end);
    if (existing === undefined || (fact.filed ?? "") < (existing.filed ?? "")) {
      map.set(end, fact);
    }
  }
  return map;
}

// Today's exact E.7B/E.7D behavior for VALUES, unchanged byte-for-byte in
// effect — only extracted into its own function so mapEdgarCompanyFacts
// can try this first and fall back to resolveAnnualFields below only
// when this produces nothing. Phase I.4A.1 adds the parallel `identity`
// maps (see ResolvedFields/toEarliestByEnd above), built from parsing.ts's
// filter*Facts (undeduped) rather than extract*Facts (already
// latest-deduped), for revenue/operatingIncome/cash/debtShort/debtLong —
// the same five fields buildPeriodsFromFields's priority order can
// realistically ever draw a `representative` from for a real filer
// (revenue or operatingIncome resolves for every genuinely reported
// period). operatingCashFlow/capex deliberately keep their EXISTING
// (latest-filed) map doing double duty as both values and identity here:
// Phase E.7D's cumulative-YTD derivation already synthesizes some of
// these facts from OTHER periods' cumulative figures, so there is no
// single well-defined "this fact's own earliest filing" to select
// without reworking that derivation — out of this fix's scope. In
// practice this narrows to no real effect: these two fields sit last in
// buildPeriodsFromFields's priority order, behind revenue and
// operatingIncome, which resolve for every period this mapper has ever
// been validated against (Unity, ASML).
function resolveQuarterlyFields(usGaap: XbrlNamespaceFacts, reportingCurrency: string): ResolvedFields {
  const revenueUnits = resolveUnitFacts(usGaap, REVENUE_TAGS, reportingCurrency);
  const operatingIncomeUnits = resolveUnitFacts(usGaap, OPERATING_INCOME_TAGS, reportingCurrency);
  const cashUnits = resolveUnitFacts(usGaap, CASH_TAGS, reportingCurrency);
  const debtShortUnits = resolveUnitFacts(usGaap, DEBT_SHORT_TAGS, reportingCurrency);
  const debtLongUnits = resolveUnitFacts(usGaap, DEBT_LONG_TAGS, reportingCurrency);
  const operatingCashFlow = resolveCashFlowFieldByEnd(usGaap, OPERATING_CASH_FLOW_TAGS, reportingCurrency);
  const capex = resolveCashFlowFieldByEnd(usGaap, CAPEX_TAGS, reportingCurrency);

  return {
    values: {
      revenue: toMapByEnd(extractDurationFacts(revenueUnits)),
      operatingIncome: toMapByEnd(extractDurationFacts(operatingIncomeUnits)),
      operatingCashFlow,
      capex,
      cash: toMapByEnd(extractInstantFacts(cashUnits)),
      debtShort: toMapByEnd(extractInstantFacts(debtShortUnits)),
      debtLong: toMapByEnd(extractInstantFacts(debtLongUnits)),
    },
    identity: {
      revenue: toEarliestByEnd(filterDurationFacts(revenueUnits)),
      operatingIncome: toEarliestByEnd(filterDurationFacts(operatingIncomeUnits)),
      operatingCashFlow,
      capex,
      cash: toEarliestByEnd(filterInstantFacts(cashUnits)),
      debtShort: toEarliestByEnd(filterInstantFacts(debtShortUnits)),
      debtLong: toEarliestByEnd(filterInstantFacts(debtLongUnits)),
    },
  };
}

// Phase I.2 — a 20-F-only filer (no 10-Q equivalent — e.g. ASML) has no
// quarterly-cadence facts at all; its genuine per-period data is the
// direct annual (`fp: "FY"`, ~355-375 day) duration/instant facts
// themselves. No cumulative-YTD derivation here (unlike
// resolveQuarterlyFields's cash-flow fields above) — an annual fact
// already covers its whole period; there is nothing to derive it from,
// and doing so would mean synthesizing a quarter that was never
// reported, which this phase explicitly does not do. Phase I.4A.1: since
// nothing here is derived (unlike the quarterly cash-flow fields), every
// one of the seven fields gets a genuine earliest-filed `identity` map —
// no narrowing exception needed, unlike resolveQuarterlyFields above.
// This is the resolver ASML (this fix's live-verified case) actually
// uses.
function resolveAnnualFields(usGaap: XbrlNamespaceFacts, reportingCurrency: string): ResolvedFields {
  const revenueUnits = resolveUnitFacts(usGaap, REVENUE_TAGS, reportingCurrency);
  const operatingIncomeUnits = resolveUnitFacts(usGaap, OPERATING_INCOME_TAGS, reportingCurrency);
  const operatingCashFlowUnits = resolveUnitFacts(usGaap, OPERATING_CASH_FLOW_TAGS, reportingCurrency);
  const capexUnits = resolveUnitFacts(usGaap, CAPEX_TAGS, reportingCurrency);
  const cashUnits = resolveUnitFacts(usGaap, CASH_TAGS, reportingCurrency);
  const debtShortUnits = resolveUnitFacts(usGaap, DEBT_SHORT_TAGS, reportingCurrency);
  const debtLongUnits = resolveUnitFacts(usGaap, DEBT_LONG_TAGS, reportingCurrency);

  return {
    values: {
      revenue: toMapByEnd(extractFiscalYearCumulativeFacts(revenueUnits)),
      operatingIncome: toMapByEnd(extractFiscalYearCumulativeFacts(operatingIncomeUnits)),
      operatingCashFlow: toMapByEnd(extractFiscalYearCumulativeFacts(operatingCashFlowUnits)),
      capex: toMapByEnd(extractFiscalYearCumulativeFacts(capexUnits)),
      cash: toMapByEnd(extractAnnualInstantFacts(cashUnits)),
      debtShort: toMapByEnd(extractAnnualInstantFacts(debtShortUnits)),
      debtLong: toMapByEnd(extractAnnualInstantFacts(debtLongUnits)),
    },
    identity: {
      revenue: toEarliestByEnd(filterFiscalYearCumulativeFacts(revenueUnits)),
      operatingIncome: toEarliestByEnd(filterFiscalYearCumulativeFacts(operatingIncomeUnits)),
      operatingCashFlow: toEarliestByEnd(filterFiscalYearCumulativeFacts(operatingCashFlowUnits)),
      capex: toEarliestByEnd(filterFiscalYearCumulativeFacts(capexUnits)),
      cash: toEarliestByEnd(filterAnnualInstantFacts(cashUnits)),
      debtShort: toEarliestByEnd(filterAnnualInstantFacts(debtShortUnits)),
      debtLong: toEarliestByEnd(filterAnnualInstantFacts(debtLongUnits)),
    },
  };
}

// Phase I.3.1 — how each target field's raw facts are cadence-filtered,
// mirroring resolveQuarterlyFields/resolveAnnualFields above exactly (not
// a new rule, just named so discoverReportingCurrency below can ask "does
// this currency have any evidence for this field, this cadence" without
// duplicating either resolver's own logic).
type FieldKind = "DURATION" | "DURATION_CASHFLOW" | "INSTANT";

const TARGET_FIELDS: ReadonlyArray<{ tags: readonly string[]; kind: FieldKind }> = [
  { tags: REVENUE_TAGS, kind: "DURATION" },
  { tags: OPERATING_INCOME_TAGS, kind: "DURATION" },
  { tags: OPERATING_CASH_FLOW_TAGS, kind: "DURATION_CASHFLOW" },
  { tags: CAPEX_TAGS, kind: "DURATION_CASHFLOW" },
  { tags: CASH_TAGS, kind: "INSTANT" },
  { tags: DEBT_SHORT_TAGS, kind: "INSTANT" },
  { tags: DEBT_LONG_TAGS, kind: "INSTANT" },
];

// True iff `units` (one tag's raw facts, already known to be under ONE
// currency unit key) contains at least one fact this field's own
// cadence-appropriate extraction would actually use for VALUES —
// DURATION_CASHFLOW additionally counts the 6/9-month/FY cumulative
// tiers under QUARTERLY, since resolveCashFlowFieldByEnd derives
// operatingCashFlow/capex from those too (E.7D) — a currency present
// only in that shape still counts as real evidence for this field.
function hasCadenceUsableFacts(units: SecEdgarXbrlFact[], kind: FieldKind, cadence: FundamentalsPeriodType): boolean {
  if (cadence === "ANNUAL") {
    return kind === "INSTANT" ? extractAnnualInstantFacts(units).length > 0 : extractFiscalYearCumulativeFacts(units).length > 0;
  }
  if (kind === "INSTANT") return extractInstantFacts(units).length > 0;
  if (kind === "DURATION_CASHFLOW") {
    return (
      extractDurationFacts(units).length > 0 ||
      extractSixMonthCumulativeFacts(units).length > 0 ||
      extractNineMonthCumulativeFacts(units).length > 0 ||
      extractFiscalYearCumulativeFacts(units).length > 0
    );
  }
  return extractDurationFacts(units).length > 0;
}

// Phase I.3.1 — discovers the single currency this payload's own target
// financial concepts (revenue/operatingIncome/operatingCashFlow/capex/
// cash/debt — the SAME seven fields resolveQuarterlyFields/
// resolveAnnualFields already read, never anything else) are consistently
// denominated in, for ONE cadence. Deliberately scoped to only these
// concepts: a real filer's companyfacts payload can and does carry
// unrelated disclosure-only facts in other currencies elsewhere (e.g.
// ASML's foreign-currency-derivative notional amounts, tagged in JPY/USD
// even though its actual financials are EUR) — scanning the whole
// payload would wrongly read those as reporting-currency candidates;
// scanning only these target concepts does not (docs/phase-i-minimum-
// research-evidence.md §13, verified against ASML's real payload).
//
// A currency counts only when it has at least one fact usable for that
// SPECIFIC field's cadence-appropriate shape (hasCadenceUsableFacts) —
// merely appearing as a unit key on a target concept isn't enough if
// none of its facts would ever be used. Returns the one currency found
// across every target field/tag, or `undefined` when zero currencies
// qualify (nothing to derive from) or more than one distinct currency
// qualifies (the payload is internally inconsistent for this cadence) —
// never chosen by a fixed candidate order, a majority, or the ticker.
function discoverReportingCurrency(usGaap: XbrlNamespaceFacts, cadence: FundamentalsPeriodType): string | undefined {
  const found = new Set<string>();
  for (const { tags, kind } of TARGET_FIELDS) {
    for (const tag of tags) {
      const units = usGaap[tag]?.units;
      if (units === undefined) continue;
      for (const [unitKey, facts] of Object.entries(units)) {
        if (!isValidCurrency(unitKey) || !Array.isArray(facts)) continue;
        if (hasCadenceUsableFacts(facts, kind, cadence)) found.add(unitKey);
      }
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

// A candidate fact's `fp` is only acceptable as a period-identity
// representative (see buildPeriodsFromFields below) when it actually
// matches the cadence being built — `parseFiscalQuarter("FY")` is `null`,
// so without this a quarterly build already correctly rejects an FY
// fact; the ANNUAL branch is this function's actual new behavior,
// requiring `fp === "FY"` exactly (every fact reaching this point already
// passed resolveAnnualFields' own FY-only extraction, so this is a
// belt-and-suspenders restatement, not a new filter).
function isAcceptableFiscalPeriod(fp: unknown, cadence: FundamentalsPeriodType): boolean {
  if (typeof fp !== "string") return false;
  return cadence === "QUARTERLY" ? parseFiscalQuarter(fp) !== null : fp === "FY";
}

// design doc §5 (E.7B) — the row-level period identity (fiscalYear/
// fiscalQuarter/filingDate) is taken from whichever field has a fact at
// this `end` date first, in this fixed priority order. Phase I.2:
// genuinely shared between both cadences — the only cadence-specific
// pieces are isAcceptableFiscalPeriod's own check and whether
// fiscalQuarter/periodId include a quarter number at all. Phase I.4A.1:
// `representative` (and therefore fiscalYear/fiscalQuarter/filingDate/
// accn) is now selected from `resolved.identity`'s priority chain, NOT
// `resolved.values`'s — the earliest-filed fact at this `end`, never a
// later filing that merely repeats it as comparative data. Each field's
// own reported VALUE (`toDataField(fields.X.get(end))` below) is
// untouched and still reads from `resolved.values` (latest-filed wins) —
// this split is the entire fix; nothing about which VALUE ends up on a
// period changes, only which fact supplies that period's own identity.
function buildPeriodsFromFields(resolved: ResolvedFields, cadence: FundamentalsPeriodType): RawFundamentalsPeriod[] {
  const { values: fields, identity } = resolved;
  const valuePriorityMaps = [fields.revenue, fields.operatingIncome, fields.operatingCashFlow, fields.capex, fields.cash, fields.debtShort, fields.debtLong];
  const identityPriorityMaps = [
    identity.revenue,
    identity.operatingIncome,
    identity.operatingCashFlow,
    identity.capex,
    identity.cash,
    identity.debtShort,
    identity.debtLong,
  ];

  const allEnds = new Set<string>();
  for (const map of valuePriorityMaps) {
    for (const end of map.keys()) allEnds.add(end);
  }

  const periods: RawFundamentalsPeriod[] = [];
  for (const end of allEnds) {
    let representative: SecEdgarXbrlFact | undefined;
    for (const map of identityPriorityMaps) {
      const candidate = map.get(end);
      if (candidate !== undefined && typeof candidate.fy === "number" && isAcceptableFiscalPeriod(candidate.fp, cadence)) {
        representative = candidate;
        break;
      }
    }
    // Defensive skip, not expected to trigger: every fact reaching this
    // point already passed the cadence-matched extraction's own
    // isUsableFact check (fy/fp present). Dropping rather than
    // fabricating a fiscal year/quarter is the safer failure mode if it
    // ever doesn't.
    if (representative === undefined) continue;

    const fiscalYear = representative.fy as number;
    const fiscalQuarter = cadence === "QUARTERLY" ? (parseFiscalQuarter(representative.fp as string) as 1 | 2 | 3 | 4) : undefined;
    const periodId = cadence === "QUARTERLY" ? `${fiscalYear}-Q${fiscalQuarter}` : `${fiscalYear}-FY`;

    periods.push({
      periodId,
      fiscalYear,
      fiscalQuarter,
      periodEndDate: end,
      filingDate: representative.filed,
      accn: representative.accn,
      revenue: toDataField(fields.revenue.get(end)),
      operatingIncome: toDataField(fields.operatingIncome.get(end)),
      operatingCashFlow: toDataField(fields.operatingCashFlow.get(end)),
      capitalExpenditures: toDataField(fields.capex.get(end)),
      cashAndEquivalents: toDataField(fields.cash.get(end)),
      totalDebt: toTotalDebtField(fields.debtShort.get(end), fields.debtLong.get(end), end),
    });
  }

  // design doc §4.5 — never trust any implicit ordering, sort
  // explicitly ourselves (mirrors mapTimeSeriesResponse's own
  // precedent, C.8A).
  periods.sort((a, b) => Date.parse(a.periodEndDate) - Date.parse(b.periodEndDate));
  return periods;
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

// Phase I.1 — RawFundamentalsData.sharesOutstanding is a single "latest
// known" fact, not per-period (see that field's own doc comment for why).
// `end` dates sort correctly as plain strings (ISO 8601, YYYY-MM-DD).
function toLatestDataField(byEnd: Map<string, SecEdgarXbrlFact>): DataField<number> {
  if (byEnd.size === 0) return { status: "MISSING" };
  const latestEnd = [...byEnd.keys()].sort().at(-1) as string;
  return toDataField(byEnd.get(latestEnd));
}

// Phase I.4A — the same shares-outstanding facts toLatestDataField above
// collapses to one value, instead keyed by each fact's own filing accession
// number (`accn`) — the join key a future Valuation Context checkpoint uses
// to align a historical period's own shares-outstanding fact (see
// RawFundamentalsData.sharesOutstandingByAccession's doc comment). A fact
// with no `accn` at all cannot be joined to anything and is skipped, never
// keyed under a fabricated placeholder. Collisions (more than one fact
// sharing an accn — not expected in practice) resolve to the latest `filed`,
// same tie-break as toMapByEnd.
function toAccessionMap(facts: SecEdgarXbrlFact[]): Record<string, DataField<number>> {
  const byAccn = new Map<string, SecEdgarXbrlFact>();
  for (const fact of facts) {
    if (typeof fact.accn !== "string") continue;
    const existing = byAccn.get(fact.accn);
    if (existing === undefined || (fact.filed ?? "") >= (existing.filed ?? "")) {
      byAccn.set(fact.accn, fact);
    }
  }
  const result: Record<string, DataField<number>> = {};
  for (const [accn, fact] of byAccn) {
    result[accn] = toDataField(fact);
  }
  return result;
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

// Phase I.3.1 — `reportingCurrency` is no longer a caller-supplied
// argument (Phase I.1's own design here was wrong — see
// docs/phase-i-minimum-research-evidence.md §12/§13): the mapper now
// discovers it itself, per cadence, from the currency units actually
// present on the target financial concepts it already reads
// (discoverReportingCurrency above). No caller anywhere needs to know a
// filer's reporting currency in advance.
export function mapEdgarCompanyFacts(payload: unknown, checkedAt: string): RawFundamentalsData {
  if (typeof payload !== "object" || payload === null) {
    throw new SecEdgarMappingError("SEC EDGAR companyfacts payload is not an object");
  }
  const response = payload as SecEdgarCompanyFactsResponse;
  if (typeof response.cik !== "number" || !Number.isFinite(response.cik)) {
    throw new SecEdgarMappingError("SEC EDGAR companyfacts payload is missing a valid `cik`");
  }

  const usGaap: XbrlNamespaceFacts = response.facts?.["us-gaap"] ?? {};
  const dei: XbrlNamespaceFacts = response.facts?.["dei"] ?? {};

  // Phase I.2 cadence selection (docs/phase-i-minimum-research-evidence.md
  // §9's resolved rule): try quarterly first — unchanged for every filer
  // this adapter has ever supported. Only if that produces ZERO periods
  // is annual FY extraction attempted, and only its result is used —
  // quarterly and annual periods are never combined into one
  // RawFundamentalsData. A filer with a few stray quarterly facts
  // alongside otherwise-annual data stays QUARTERLY (a known, accepted
  // limitation — no partial-filer heuristic is added here). Phase I.3.1:
  // each attempt first discovers its own cadence-scoped currency; an
  // undiscoverable currency (zero or ambiguous target evidence) means
  // that cadence produces no periods at all, same as "no data" — never a
  // guessed currency applied to real values.
  const quarterlyCurrency = discoverReportingCurrency(usGaap, "QUARTERLY");
  const quarterlyPeriods =
    quarterlyCurrency !== undefined ? buildPeriodsFromFields(resolveQuarterlyFields(usGaap, quarterlyCurrency), "QUARTERLY") : [];

  let periods: RawFundamentalsPeriod[] = quarterlyPeriods;
  let periodType: FundamentalsPeriodType = "QUARTERLY";
  let reportingCurrency: string | undefined = quarterlyPeriods.length > 0 ? quarterlyCurrency : undefined;

  if (quarterlyPeriods.length === 0) {
    const annualCurrency = discoverReportingCurrency(usGaap, "ANNUAL");
    const annualPeriods =
      annualCurrency !== undefined ? buildPeriodsFromFields(resolveAnnualFields(usGaap, annualCurrency), "ANNUAL") : [];
    if (annualPeriods.length > 0) {
      periods = annualPeriods;
      periodType = "ANNUAL";
      reportingCurrency = annualCurrency;
    }
    // else: neither cadence produced anything — periods/periodType stay
    // at their zero-data default (empty periods, QUARTERLY), unchanged
    // from pre-Phase-I.2 behavior; reportingCurrency stays undefined.
  }

  // Not currency-denominated (unit is "shares") — reportingCurrency does
  // not apply here; deliberately kept OUT of priorityMaps/allEnds above
  // (see sharesOutstanding's own field comment: a single latest-known
  // fact, not joined onto the fiscal-period date grid). Which extraction
  // to use follows the SAME cadence decision as the periods above — an
  // annual-only filer's shares-outstanding fact is `fp: "FY"` too, same
  // root cause as every other field.
  const sharesOutstandingFacts =
    periodType === "ANNUAL"
      ? extractAnnualInstantFacts(resolveUnitFacts(dei, SHARES_OUTSTANDING_TAGS, "shares"))
      : extractInstantFacts(resolveUnitFacts(dei, SHARES_OUTSTANDING_TAGS, "shares"));

  const result: RawFundamentalsData = {
    instrumentId: zeroPadCik(response.cik),
    periodType,
    periods,
    guidanceEvidence: { status: "MISSING" }, // Path B (AI extraction) is a separate, later checkpoint
    checkedAt,
    reportingCurrency,
    sharesOutstanding: toLatestDataField(toMapByEnd(sharesOutstandingFacts)),
    sharesOutstandingByAccession: toAccessionMap(sharesOutstandingFacts),
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
