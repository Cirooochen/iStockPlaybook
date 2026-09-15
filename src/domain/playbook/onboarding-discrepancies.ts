// Playbook Onboarding — discrepancy catalog. Design:
// docs/phase-h2-deterministic-strategy-mapping.md §6 (resolved,
// 2026-09-15). A small, enumerable, deterministic table — no AI
// classification, no free-text severity judgment. HARD is reserved for
// discrepancies that conflict with an actual production hard-constraint/
// eligibility rule (HC-001/HC-002); a concentration classification alone
// is never promoted to HARD, since that would invent a prohibition the
// Engine itself doesn't enforce.
import type { ConcentrationState } from "@/domain/portfolio/concentration";
import { checkHC001 } from "@/domain/playbook/hard-constraints";
import type { ThesisHealth } from "@/types/playbook";
import type { CurrentIntention, DiscrepancyCode, IntentDiscrepancy } from "@/types/playbook-proposal";

export type DiscrepancySeverity = "HARD" | "SOFT";

export const DISCREPANCY_SEVERITY: Record<DiscrepancyCode, DiscrepancySeverity> = {
  BUILD_INTENT_THESIS_BROKEN: "HARD",
  BUILD_INTENT_ACCUMULATION_BLOCKED: "HARD",
  BUILD_INTENT_ALREADY_OVERWEIGHT: "SOFT",
  REDUCE_INTENT_WITHIN_TARGET: "SOFT",
};

export interface DeriveDiscrepanciesInput {
  currentIntention: CurrentIntention | null; // null = deferred/unresolved, no check possible yet
  thesisHealth: ThesisHealth | null; // null = deferred/unresolved
  currentWeightPct: number | null; // null when portfolio valuation isn't COMPLETE
  concentrationStateIfConfirmedNow: ConcentrationState | null;
  proposedTargetMinPct: number;
  proposedTargetMaxPct: number;
  proposedCeilingPct: number;
}

// Deterministically templated from live values (H.1 §2.5) — never
// freeform, never AI-generated. One fixed template per code.
export function deriveDiscrepancies(input: DeriveDiscrepanciesInput): IntentDiscrepancy[] {
  const {
    currentIntention,
    thesisHealth,
    currentWeightPct,
    concentrationStateIfConfirmedNow,
    proposedTargetMinPct,
    proposedTargetMaxPct,
    proposedCeilingPct,
  } = input;

  if (currentIntention === null || currentWeightPct === null || concentrationStateIfConfirmedNow === null) {
    // Either the user hasn't answered current intention yet, or the
    // portfolio's valuation isn't COMPLETE — no discrepancy can be
    // honestly evaluated (fail-safe, not fail-soft: never guess).
    return [];
  }

  const discrepancies: IntentDiscrepancy[] = [];

  if (currentIntention === "BUILD") {
    if (thesisHealth === "BROKEN") {
      discrepancies.push({
        code: "BUILD_INTENT_THESIS_BROKEN",
        message:
          "You said you want to build this position, but your thesis answer means accumulation is disabled until that's resolved.",
      });
    }

    const hc001 = checkHC001(currentWeightPct, proposedCeilingPct);
    if (hc001.triggered) {
      discrepancies.push({
        code: "BUILD_INTENT_ACCUMULATION_BLOCKED",
        message: `You said you want to build this position, but it's already at ${currentWeightPct.toFixed(1)}%, above the ${proposedCeilingPct}% ceiling your proposed strategy would allow buying more at.`,
      });
    } else if (
      concentrationStateIfConfirmedNow === "OVERWEIGHT" ||
      concentrationStateIfConfirmedNow === "SEVERELY_OVERWEIGHT"
    ) {
      discrepancies.push({
        code: "BUILD_INTENT_ALREADY_OVERWEIGHT",
        message: `You said you want to build this position, but it's already above your proposed ${proposedTargetMaxPct}% target range.`,
      });
    }
  }

  if (currentIntention === "REDUCE" && concentrationStateIfConfirmedNow === "WITHIN_TARGET") {
    discrepancies.push({
      code: "REDUCE_INTENT_WITHIN_TARGET",
      message: `You said you want to gradually reduce this position, but it's currently within your proposed ${proposedTargetMinPct}–${proposedTargetMaxPct}% target range.`,
    });
  }

  return discrepancies;
}

export function hasSeverity(discrepancies: IntentDiscrepancy[], severity: DiscrepancySeverity): boolean {
  return discrepancies.some((d) => DISCREPANCY_SEVERITY[d.code] === severity);
}
