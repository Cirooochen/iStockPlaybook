// Scoring functions — spec §9, §10
// Convention: 0–100 internally, displayed as 0–10 in existing UI.
// Never reverse score meaning: higher = more attractive / healthier.
import type { Scorecard, SignalState } from "@/types/playbook";
import type { ConcentrationState } from "@/domain/portfolio/concentration";
import { RULESET } from "@/config/ruleset-v0.1";

// §9 — position fit: formula-based, not a lookup table
export function calcPositionFitScore(
  weightPct: number,
  targetMaxPct: number
): { score: number; state: SignalState } {
  let score100: number;
  if (weightPct <= targetMaxPct) {
    score100 = 100;
  } else {
    const excessRatio = (weightPct - targetMaxPct) / targetMaxPct;
    score100 = Math.max(
      0,
      100 - RULESET.positionFit.penaltyCoefficient * excessRatio
    );
  }
  const score = Math.max(1, Math.round(score100 / 10));
  const state: SignalState =
    score >= 7 ? "Positive" : score >= 4 ? "Neutral" : "Weak";
  return { score, state };
}

// Concentration risk: tied to named concentration state
export function calcConcentrationRiskScore(
  concentrationState: ConcentrationState
): { score: number; state: SignalState } {
  const map: Record<ConcentrationState, { score: number; state: SignalState }> =
    {
      WITHIN_TARGET: { score: 8, state: "Positive" },
      MODERATELY_OVERWEIGHT: { score: 5, state: "Neutral" },
      OVERWEIGHT: { score: 3, state: "Elevated" },
      SEVERELY_OVERWEIGHT: { score: 2, state: "Elevated" },
    };
  return map[concentrationState];
}

// Only positionFit and concentrationRisk update from transaction math.
// All other dimensions (fundamentals, valuation, momentum, thesisHealth)
// require Phase C signal engine — kept unchanged.
export function recalculateScorecard(
  scorecard: Scorecard,
  weightPct: number,
  targetMaxPct: number,
  concentrationState: ConcentrationState
): Scorecard {
  return {
    ...scorecard,
    positionFit: calcPositionFitScore(weightPct, targetMaxPct),
    concentrationRisk: calcConcentrationRiskScore(concentrationState),
  };
}
