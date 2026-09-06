// Action zone state derivation — spec §19, §20
// Zone states are driven by concentration state and hard constraints.
// Phase C will layer in valuation and technical signals.
import type { ActionZoneType, ActionZoneState } from "@/types/playbook";
import type { ConcentrationState } from "@/domain/portfolio/concentration";

export function deriveActionZoneState(
  type: ActionZoneType,
  concentrationState: ConcentrationState,
  accumulationEnabled: boolean
): ActionZoneState {
  switch (type) {
    case "ADD":
      if (!accumulationEnabled) return "INACTIVE"; // HC-001 or HC-002
      if (concentrationState === "WITHIN_TARGET") return "ACTIVE";
      if (concentrationState === "MODERATELY_OVERWEIGHT") return "WATCH";
      return "INACTIVE";

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
