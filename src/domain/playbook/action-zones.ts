// Action zone state derivation — spec §19, §20, §22
// Zone states are driven by concentration state, hard constraints, and (for
// ADD) the spec §22 eligibility gates. Phase C will add fundamentals/
// valuation gates to AddEligibility below — the ADD case ANDs every gate
// together, so new conditions plug in without restructuring this function.
import type { ActionZoneType, ActionZoneState } from "@/types/playbook";
import type { ConcentrationState } from "@/domain/portfolio/concentration";

export interface AddEligibility {
  /** HC-001 (weight limit) / HC-002 (BROKEN thesis) — see hard-constraints.ts */
  accumulationEnabled: boolean;
  /** Spec §22 thesis clause — see thesis.ts's isThesisEligibleForAdd */
  thesisEligible: boolean;
  /**
   * Phase D.5 (docs/phase-d4-momentum-decision-influence-design.md §8)
   * — a defensive-only timing gate: see
   * deriveMomentumEligibility (momentum-score.ts). Can only remove ADD
   * eligibility, never grant it — positive momentum is never required
   * for ADD to be active.
   */
  momentumEligible: boolean;
  // Phase C will add fundamentalsEligible / valuationEligible gates here.
}

export function deriveActionZoneState(
  type: ActionZoneType,
  concentrationState: ConcentrationState,
  addEligibility: AddEligibility
): ActionZoneState {
  switch (type) {
    case "ADD": {
      const eligible =
        addEligibility.accumulationEnabled &&
        addEligibility.thesisEligible &&
        addEligibility.momentumEligible;
      if (!eligible) return "INACTIVE";
      if (concentrationState === "WITHIN_TARGET") return "ACTIVE";
      if (concentrationState === "MODERATELY_OVERWEIGHT") return "WATCH";
      return "INACTIVE";
    }

    case "HOLD":
      return "ACTIVE"; // always active — thesis-based, not weight-based

    case "TRIM_1":
      if (
        concentrationState === "WITHIN_TARGET" ||
        concentrationState === "MODERATELY_OVERWEIGHT"
      )
        return "INACTIVE";
      if (concentrationState === "OVERWEIGHT") return "WATCH";
      return "ACTIVE"; // SEVERELY_OVERWEIGHT

    case "TRIM_2":
      if (
        concentrationState === "WITHIN_TARGET" ||
        concentrationState === "MODERATELY_OVERWEIGHT" ||
        concentrationState === "OVERWEIGHT"
      )
        return "INACTIVE";
      return "WATCH"; // SEVERELY_OVERWEIGHT

    case "THESIS_REVIEW":
      return "CONDITIONAL"; // thesis-driven only — not weight-driven
  }
}
