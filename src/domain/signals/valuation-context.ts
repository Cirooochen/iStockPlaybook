// EV/Revenue Valuation Context — Phase I.4B Minimum Valuation Context.
// Spec: docs/phase-i-minimum-research-evidence.md §16.8. Reads Phase
// I.4A's already-historically-correct `EvRevenueCheckpoint[]`
// (src/domain/signals/valuation-checkpoints.ts, untouched by this file —
// I.4A is frozen) and answers exactly one descriptive question: is the
// current EV/Revenue higher, lower, or in line with its own recent
// history? Deliberately NOT a verdict: no cheap/expensive language, no
// over/undervalued judgment, no score, no percentile, no threshold beyond
// the plain three-way sign comparison the product spec itself specifies.
//
// "Current" convention — a known, documented limitation, not a general
// solution. deriveEvRevenueCheckpoints (I.4A) always places the current
// period's own checkpoint FIRST when that checkpoint survives, followed
// by completed fiscal years most-recent-first (selectCheckpointPeriods's
// own ordering, preserved exactly since checkpoints are only ever
// filtered, never reordered). This module reads checkpoints[0] as
// "current" and the rest as "historical" on that basis — correct for
// every case this phase actually validates (Unity, ASML), but not a
// provable general rule: if a real filer's OWN current-period checkpoint
// were the one dropped for missing evidence while its completed years
// all survived, checkpoints[0] would silently become the most recent
// completed year instead. Fixing this generally would mean threading an
// explicit `isCurrent` flag through I.4A's own checkpoint type — out of
// this phase's "do not change the valuation data pipeline" boundary.
import type { EvRevenueCheckpoint } from "./valuation-checkpoints";

// Product spec (Phase I.4B) — "at least 3 historical checkpoints
// required." Below this, there isn't enough of a "recent history" to
// describe a current reading against, so the whole context is MISSING —
// never a comparison against 1-2 points passed off as "history."
export const MIN_HISTORICAL_CHECKPOINTS = 3;

export type ValuationContextComparison = "HIGHER" | "LOWER" | "IN_LINE";

export interface ValuationContextAvailable {
  status: "AVAILABLE";
  currentEvToRevenue: number;
  historicalMedianEvToRevenue: number;
  // 3, 4, or 5 — however many completed-fiscal-year checkpoints I.4A's
  // own MAX_COMPLETED_FISCAL_YEAR_CHECKPOINTS/missing-evidence dropping
  // actually left, never padded or assumed to be 5.
  historicalCheckpointCount: number;
  comparison: ValuationContextComparison;
}

export interface ValuationContextMissing {
  status: "MISSING";
}

export type ValuationContext = ValuationContextAvailable | ValuationContextMissing;

// Plain middle value, no interpolation between the two middle points
// beyond the standard even-count average — the same "no synthesized
// data" spirit I.4A's own checkpoint dropping already applies, restated
// here for the one new derived number this phase introduces.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Product spec (Phase I.4B) — the entire comparison is this one
// three-way exact sign check against the historical median, nothing
// more: no tolerance band, no percentage-distance threshold, no
// percentile rank. `IN_LINE` requires exact numeric equality — expected
// to be rare in practice with real floating-point ratios, and that
// rarity is the honest, correct behavior for a threshold-free comparison,
// not a gap to paper over with an invented tolerance.
export function deriveValuationContext(checkpoints: EvRevenueCheckpoint[]): ValuationContext {
  if (checkpoints.length === 0) return { status: "MISSING" };

  const [current, ...historical] = checkpoints;
  if (historical.length < MIN_HISTORICAL_CHECKPOINTS) return { status: "MISSING" };

  const historicalMedianEvToRevenue = median(historical.map((checkpoint) => checkpoint.evToRevenue));
  const comparison: ValuationContextComparison =
    current.evToRevenue > historicalMedianEvToRevenue ? "HIGHER" : current.evToRevenue < historicalMedianEvToRevenue ? "LOWER" : "IN_LINE";

  return {
    status: "AVAILABLE",
    currentEvToRevenue: current.evToRevenue,
    historicalMedianEvToRevenue,
    historicalCheckpointCount: historical.length,
    comparison,
  };
}
