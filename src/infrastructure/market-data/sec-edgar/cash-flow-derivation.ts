// EDGAR quarterly cash-flow derivation — Phase E.7D. Spec:
// docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md (source
// of truth for every rule below).
//
// Pure function: takes already-extracted, already-deduped fact arrays
// (parsing.ts's extractDurationFacts/extractSixMonthCumulativeFacts/
// extractNineMonthCumulativeFacts/extractFiscalYearCumulativeFacts) for
// ONE field (operating cash flow OR capex — the two fields this
// checkpoint scopes to, design doc §9) and returns a Map of DERIVED
// facts only, keyed by `end`. Never includes an `end` that already has
// a directly-reported single-quarter fact — design doc §2/item 8:
// "direct fact always overrides a derived value for the same quarter."
// mappers.ts is responsible for merging this map's entries into the
// existing direct-fact map, with direct entries never overwritten.
import type { SecEdgarXbrlFact } from "./types";
import { MAX_QUARTER_DURATION_DAYS, MIN_QUARTER_DURATION_DAYS } from "./parsing";

function groupByStart(facts: SecEdgarXbrlFact[]): Map<string, SecEdgarXbrlFact[]> {
  const map = new Map<string, SecEdgarXbrlFact[]>();
  for (const fact of facts) {
    const start = fact.start as string;
    const group = map.get(start) ?? [];
    group.push(fact);
    map.set(start, group);
  }
  return map;
}

// design doc §5.2 — "more than one candidate in the same tier for the
// same fiscal-year start" is an unresolvable ambiguity, not something
// to guess at: only an exactly-one-candidate group is usable.
function resolveUnambiguous(group: SecEdgarXbrlFact[] | undefined): SecEdgarXbrlFact | undefined {
  return group !== undefined && group.length === 1 ? group[0] : undefined;
}

// design doc §3 — the one alignment-safety gate, shared by Q2/Q3/Q4:
// matching fiscal-year `start`, and the resulting gap between the two
// cumulative facts' `end`s falling in the SAME single-quarter tolerance
// window extractDurationFacts already uses (never a second, invented
// tolerance). Returns the derived fact (design doc §4's asOf rule
// applied) or `undefined` if the gate isn't satisfied.
function deriveOneQuarter(
  cur: SecEdgarXbrlFact | undefined,
  prev: SecEdgarXbrlFact | undefined
): SecEdgarXbrlFact | undefined {
  if (cur === undefined || prev === undefined) return undefined; // §5.2 — missing predecessor
  if (cur.start !== prev.start) return undefined; // §3/§5.3/§5.6 — fiscal-year-start mismatch
  const gapDays = (Date.parse(cur.end as string) - Date.parse(prev.end as string)) / 86_400_000;
  if (Number.isNaN(gapDays) || gapDays < MIN_QUARTER_DURATION_DAYS || gapDays > MAX_QUARTER_DURATION_DAYS) {
    return undefined; // §3/§5.3/§5.4/§5.6 — result-period gap outside the single-quarter window
  }

  // design doc §4 — asOf must reflect when BOTH contributing facts
  // became knowable: the later of the two `filed` dates, never the
  // earlier one.
  const filedCandidates = [cur.filed, prev.filed].filter((f): f is string => typeof f === "string");
  const filed = filedCandidates.length > 0 ? filedCandidates.sort().at(-1) : undefined;

  return {
    // The derived quarter's own natural span: from the predecessor
    // cumulative fact's end (= this quarter's start) to the current
    // cumulative fact's end. fy/fp are inherited from `cur` — the
    // filing that reported this cumulative figure already carries the
    // correct fiscal identity for this quarter in the ordinary case;
    // no quarter number is hardcoded here (design doc §6 — "no
    // Unity-specific logic", generalized to "no quarter-specific
    // logic" either).
    start: prev.end,
    end: cur.end,
    val: (cur.val as number) - (prev.val as number), // design doc §5.5 — unclamped; a negative result is preserved as-is
    fy: cur.fy,
    fp: cur.fp,
    filed,
  };
}

// design doc §1/§2/§3 — resolves every derivable quarter (Q2 = 6M - Q1,
// Q3 = 9M - 6M, Q4 = FY - 9M) across every fiscal-year `start` present
// in ANY of the four tiers. `directFacts` (tier 1) is used only to
// determine which `end`s already have a directly-reported value —
// design doc item 8's precedence rule — this function never derives an
// `end` directFacts already covers.
export function deriveQuarterlyCashFlowFacts(
  directFacts: SecEdgarXbrlFact[],
  sixMonthFacts: SecEdgarXbrlFact[],
  nineMonthFacts: SecEdgarXbrlFact[],
  fiscalYearFacts: SecEdgarXbrlFact[]
): Map<string, SecEdgarXbrlFact> {
  const directEnds = new Set(directFacts.map((fact) => fact.end as string));

  const tier1ByStart = groupByStart(directFacts);
  const tier2ByStart = groupByStart(sixMonthFacts);
  const tier3ByStart = groupByStart(nineMonthFacts);
  const tier4ByStart = groupByStart(fiscalYearFacts);

  const allStarts = new Set<string>([
    ...tier1ByStart.keys(),
    ...tier2ByStart.keys(),
    ...tier3ByStart.keys(),
    ...tier4ByStart.keys(),
  ]);

  const derived = new Map<string, SecEdgarXbrlFact>();
  for (const start of allStarts) {
    const q1 = resolveUnambiguous(tier1ByStart.get(start));
    const sixMonth = resolveUnambiguous(tier2ByStart.get(start));
    const nineMonth = resolveUnambiguous(tier3ByStart.get(start));
    const fiscalYear = resolveUnambiguous(tier4ByStart.get(start));

    const q2 = deriveOneQuarter(sixMonth, q1);
    if (q2 !== undefined && !directEnds.has(q2.end as string)) derived.set(q2.end as string, q2);

    const q3 = deriveOneQuarter(nineMonth, sixMonth);
    if (q3 !== undefined && !directEnds.has(q3.end as string)) derived.set(q3.end as string, q3);

    const q4 = deriveOneQuarter(fiscalYear, nineMonth);
    if (q4 !== undefined && !directEnds.has(q4.end as string)) derived.set(q4.end as string, q4);
  }

  return derived;
}
