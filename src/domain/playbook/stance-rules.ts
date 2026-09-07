// Stance derivation — spec §18
// Priority: thesis-break → portfolio constraints → (Phase C: fundamentals/valuation)
import type { Stance, ThesisHealth } from "@/types/playbook";
import type { ConcentrationState } from "@/domain/portfolio/concentration";

export function deriveStance(
  concentrationState: ConcentrationState,
  thesisHealth: ThesisHealth
): Stance {
  // Priority 1 — thesis break (overrides everything)
  if (thesisHealth === "BROKEN") return "THESIS_REVIEW";

  // Priority 2 — weakening thesis + overweight → reduce risk
  if (
    thesisHealth === "WEAKENING" &&
    (concentrationState === "OVERWEIGHT" ||
      concentrationState === "SEVERELY_OVERWEIGHT")
  ) {
    return "REDUCE_RISK";
  }

  // Priority 3 — portfolio concentration constraints (spec §18)
  if (concentrationState === "SEVERELY_OVERWEIGHT") return "HOLD_GRADUALLY_TRIM";
  if (concentrationState === "OVERWEIGHT") return "HOLD_TRIM";
  if (concentrationState === "MODERATELY_OVERWEIGHT") return "HOLD";

  // WITHIN_TARGET — Phase C will refine with valuation/fundamentals signals
  return "HOLD";
}

export const stanceDisplayLabel: Record<Stance, string> = {
  HOLD_GRADUALLY_TRIM: "HOLD / GRADUALLY TRIM",
  HOLD_TRIM: "HOLD / TRIM",
  HOLD: "HOLD",
  BUILD: "BUILD",
  ADD: "ADD",
  REDUCE_RISK: "REDUCE RISK",
  THESIS_REVIEW: "THESIS REVIEW",
  EXIT: "EXIT",
};
