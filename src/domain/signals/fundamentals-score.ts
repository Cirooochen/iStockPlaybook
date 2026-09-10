// Fundamentals — generic scoring engine. Phase E.2.
// docs/phase-e0-fundamentals-evidence-contract-design.md §5.1/§6.
//
// Archetype-agnostic by construction: this file never names a specific
// GROWTH_SOFTWARE dimension key, weight, or anchor — it only iterates
// whatever FundamentalsTemplate it is given.
// src/domain/signals/fundamentals-templates/growth-software.ts owns the
// one v0.1 archetype's specifics; a future archetype is a second
// template value, zero changes here.
//
// Mirrors src/domain/signals/momentum-score.ts's scoreMomentum shape
// exactly: component-level visibility on every status (weight carried
// even when MISSING/NOT_APPLICABLE), MISSING != 0 (no fabricated
// placeholder score, weight redistributed over AVAILABLE components
// only), an applicable/available/missing weight coverage split, and a
// minimum-evidence gate producing INSUFFICIENT_DATA rather than a thin,
// low-evidence number.
import type {
  FundamentalsComponentResult,
  FundamentalsEvidenceCoverage,
  FundamentalsScoreResult,
  FundamentalsTemplate,
  RawFundamentalsData,
} from "@/types/fundamentals";
import type { EvidenceScoredItem } from "@/types/evidence-scoring";
import type { ScoreItem, SignalState } from "@/types/playbook";
// Re-exported so callers (src/domain/engine.ts) can import both the
// function and its result type from this one module — the same
// convenience src/domain/signals/momentum-score.ts provides natively
// for MomentumScoreResult (defined there directly; FundamentalsScoreResult
// lives in @/types/fundamentals instead, per E.1A's types/functions
// split, so it needs an explicit re-export here to match).
export type { FundamentalsScoreResult };

// Converts an internal 0-100 score to this codebase's existing ScoreItem
// display convention — 1-10 (rounded), min 1. Matches
// momentum-score.ts's toScoreItem exactly, restated locally rather than
// imported/shared — the established precedent for this tiny function
// (see momentum-score.ts's own comment on why it isn't shared either).
function toScoreItem(score100: number): ScoreItem {
  const score = Math.max(1, Math.round(score100 / 10));
  const state: SignalState = score >= 7 ? "Positive" : score >= 4 ? "Neutral" : "Weak";
  return { score, state };
}

export function scoreFundamentals(
  template: FundamentalsTemplate,
  raw: RawFundamentalsData
): FundamentalsScoreResult {
  const components: FundamentalsComponentResult[] = template.components.map((def) => ({
    ...def.score(raw),
    key: def.key,
    weight: def.weight,
  }));

  const totalDefinedWeight = template.components.reduce((sum, def) => sum + def.weight, 0);

  const notApplicableWeight = components
    .filter((c) => c.status === "NOT_APPLICABLE")
    .reduce((sum, c) => sum + c.weight, 0);
  const applicableWeight = totalDefinedWeight - notApplicableWeight;

  const availableComponents = components.filter(
    (c): c is Extract<FundamentalsComponentResult, { status: "AVAILABLE" }> => c.status === "AVAILABLE"
  );
  const availableWeight = availableComponents.reduce((sum, c) => sum + c.weight, 0);
  const missingWeight = applicableWeight - availableWeight;
  const availableWeightShare = applicableWeight > 0 ? availableWeight / applicableWeight : 0;

  const coverage: FundamentalsEvidenceCoverage = {
    totalDefinedWeight,
    applicableWeight,
    availableWeight,
    missingWeight,
    availableWeightShare,
  };

  if (availableWeightShare < template.minimumAvailableWeightShare) {
    return { status: "INSUFFICIENT_DATA", components, coverage };
  }

  const blended100 = availableComponents.reduce(
    (sum, c) => sum + c.score100 * (c.weight / availableWeight),
    0
  );

  return { status: "SCORED", overall: toScoreItem(blended100), components, coverage };
}

// Phase E.3/E.4 — the only place a fundamentals EvidenceScoredItem may
// be produced, mirroring deriveMomentumEvidenceScoredItem
// (src/domain/signals/momentum-score.ts) exactly — reuses the same
// general-purpose EvidenceScoredItem type unchanged (design doc §1.1).
// Never fabricates a SCORED-shaped result for INSUFFICIENT_DATA. What a
// legacy ScoreItem-only consumer does when this returns
// INSUFFICIENT_DATA is that consumer's decision, not this function's
// (see runDecisionEngine's transitional handling,
// docs/phase-e3-fundamentals-scorecard-integration-design.md §1.3/§1.4).
export function deriveFundamentalsEvidenceScoredItem(result: FundamentalsScoreResult): EvidenceScoredItem {
  if (result.status === "SCORED") {
    return { status: "SCORED", item: result.overall };
  }
  return { status: "INSUFFICIENT_DATA" };
}
