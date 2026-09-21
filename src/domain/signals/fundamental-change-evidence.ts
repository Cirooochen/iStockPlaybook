// Fundamental Change Evidence — Phase I.4 spike, corrected before coding
// (docs/phase-i-minimum-research-evidence.md's Recent Material Changes
// spike, since renamed): the spike found Phase I cannot honestly
// determine general MAGNITUDE materiality without an invented threshold
// (no existing ruleset/spec defines one — RULESET.fundamentals's anchor
// curves calibrate a 0-100 score, not a significance boundary). What
// this module actually, honestly knows is narrower: the before/after
// values of revenue growth and operating margin between the two most
// recently reported periods, their signs, and whether the sign reversed
// — never a "material" classification, never a threshold.
//
// Deliberately NOT named "RecentMaterialChanges" for the same reason.
// Deliberately does NOT depend on FundamentalsScoreResult, scoreFundamentals,
// or GROWTH_SOFTWARE_TEMPLATE — this reads RawFundamentalsData.periods
// directly, one layer below where deriveBusinessTrajectory sits (which
// depends on the scoring layer's already-computed growthTrend/marginTrend
// deltas). This module needs the two underlying VALUES a delta is made
// of, not the delta itself — growthTrend/marginTrend discard both
// operands and keep only their difference, which cannot answer "did the
// underlying rate's own sign flip" (a materially different question from
// "did the trend/delta's sign flip," which is what Business Trajectory
// already answers). Does not modify Business Trajectory in any way.
//
// Stateless by construction, matching Phase I's own non-goal (no
// evidence/thesis history, no persistence, recomputed every call): both
// "before" and "after" come from the SAME `periods` array (one cutoff
// apart, via `.slice(0, -1)`, the same technique computeGrowthTrend/
// computeMarginTrend already use internally), never from a previous
// fetch. This also makes cross-cadence comparison structurally
// impossible here, not just avoided — `periods` is always one cadence
// (Phase I.2/I.3.1's own guarantee), so "before" and "after" are always
// evaluated under the identical periodType.
//
// "INSUFFICIENT_HISTORY", not "NEWLY_AVAILABLE": when `after` resolves
// but `before` does not, all this module knows is that the current
// dataset lacks a comparable prior value — never that the evidence
// newly became available, which would require comparing against a
// previous fetch or persisted state, neither of which exists here.
import type { DataField } from "@/types/market-data";
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";
import { computeOperatingMargin, computeRevenueGrowth } from "./fundamentals";

export type FundamentalChangeSign = "POSITIVE" | "NEGATIVE" | "ZERO";

export type FundamentalChangeEvidenceLine =
  | {
      status: "AVAILABLE";
      before: number;
      beforeSign: FundamentalChangeSign;
      after: number;
      afterSign: FundamentalChangeSign;
      reversed: boolean;
      asOf: string;
    }
  | { status: "INSUFFICIENT_HISTORY"; after: number; afterSign: FundamentalChangeSign; asOf: string }
  | { status: "MISSING" };

export interface FundamentalChangeEvidence {
  revenue: FundamentalChangeEvidenceLine;
  profitability: FundamentalChangeEvidenceLine;
}

function signOf(value: number): FundamentalChangeSign {
  if (value > 0) return "POSITIVE";
  if (value < 0) return "NEGATIVE";
  return "ZERO";
}

// Strict sign reversal only — POSITIVE<->NEGATIVE. A move through ZERO
// on either side (POSITIVE->ZERO, ZERO->NEGATIVE) is real and shown
// honestly in before/after, but is not "reversed": that would require
// deciding how close to zero still counts as a reversal, exactly the
// kind of threshold this module does not introduce.
function isReversal(before: FundamentalChangeSign, after: FundamentalChangeSign): boolean {
  return (before === "POSITIVE" && after === "NEGATIVE") || (before === "NEGATIVE" && after === "POSITIVE");
}

// Shared shape for both lines: evaluate `compute` at the current cutoff
// (`periods`) for "after", and one period earlier (`periods.slice(0, -1)`)
// for "before" — the identical two-cutoff technique
// computeGrowthTrend/computeMarginTrend already use, just keeping both
// operands instead of only their difference.
function buildLine(
  compute: (periods: RawFundamentalsPeriod[]) => DataField<number>,
  periods: RawFundamentalsPeriod[]
): FundamentalChangeEvidenceLine {
  const after = compute(periods);
  if (after.status === "MISSING") return { status: "MISSING" };

  const afterSign = signOf(after.value);
  const before = compute(periods.slice(0, -1));
  if (before.status === "MISSING") {
    return { status: "INSUFFICIENT_HISTORY", after: after.value, afterSign, asOf: after.asOf };
  }

  const beforeSign = signOf(before.value);
  return {
    status: "AVAILABLE",
    before: before.value,
    beforeSign,
    after: after.value,
    afterSign,
    reversed: isReversal(beforeSign, afterSign),
    asOf: after.asOf,
  };
}

// `periodType` is threaded only into the revenue line — computeRevenueGrowth's
// "same period prior year" offset depends on cadence (Phase I.2); computeOperatingMargin
// is cadence-agnostic (single most-recent-period ratio) and takes no periodType,
// exactly mirroring how growth-software.ts's own component definitions
// thread `raw.periodType` selectively (revenueGrowth/growthTrend/balanceSheet
// only, never operatingMargin/marginTrend/fcfMargin).
export function deriveFundamentalChangeEvidence(
  periods: RawFundamentalsPeriod[],
  periodType: FundamentalsPeriodType
): FundamentalChangeEvidence {
  return {
    revenue: buildLine((p) => computeRevenueGrowth(p, periodType), periods),
    profitability: buildLine((p) => computeOperatingMargin(p), periods),
  };
}
