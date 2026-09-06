// Concentration classification and derived position metrics — spec §6, §7, §8, §21
import { RULESET } from "@/config/ruleset-v0.1";

export type ConcentrationState =
  | "WITHIN_TARGET"
  | "MODERATELY_OVERWEIGHT"
  | "OVERWEIGHT"
  | "SEVERELY_OVERWEIGHT";

export interface TacticalInventory {
  aboveCoreMax: number;    // shares available to trim before touching the core
  maxSellToCore: number;   // max shares that can be sold without breaching core_min
}

export interface TrimSizing {
  level1: number;
  level2: number;
  level3: number;
  maxTacticalTrim: number;
}

// §8 — classify weight relative to target using ratio thresholds from ruleset
export function classifyConcentration(
  weightPct: number,
  targetMaxPct: number
): ConcentrationState {
  const { moderateMultiplier, severeMultiplier } = RULESET.concentration;
  if (weightPct <= targetMaxPct) return "WITHIN_TARGET";
  if (weightPct <= targetMaxPct * moderateMultiplier) return "MODERATELY_OVERWEIGHT";
  if (weightPct <= targetMaxPct * severeMultiplier) return "OVERWEIGHT";
  return "SEVERELY_OVERWEIGHT";
}

// §6 — shares needed to reach target weight at current price
export function calcTargetShares(
  portfolioValueEur: number,
  targetWeightPct: number,
  currentPriceEur: number
): number {
  const targetPositionValue = portfolioValueEur * (targetWeightPct / 100);
  return Math.floor(targetPositionValue / currentPriceEur);
}

// §7 — core/tactical inventory breakdown
export function calcTacticalInventory(
  currentShares: number,
  coreMax: number,
  coreMin: number
): TacticalInventory {
  return {
    aboveCoreMax: Math.max(0, currentShares - coreMax),
    maxSellToCore: Math.max(0, currentShares - coreMin),
  };
}

// §21 — staged trim sizing derived from tactical inventory
export function calcTrimSizing(maxTacticalTrim: number): TrimSizing {
  const { level1Fraction, level2Fraction } = RULESET.trimStaging;
  const level1 = Math.round(maxTacticalTrim * level1Fraction);
  const level2 = Math.round(maxTacticalTrim * level2Fraction);
  const level3 = Math.max(0, maxTacticalTrim - level1 - level2);
  return { level1, level2, level3, maxTacticalTrim };
}

export const concentrationLabel: Record<ConcentrationState, string> = {
  WITHIN_TARGET: "Within target",
  MODERATELY_OVERWEIGHT: "Moderately overweight",
  OVERWEIGHT: "Overweight",
  SEVERELY_OVERWEIGHT: "Severely overweight",
};

export const concentrationStyle: Record<
  ConcentrationState,
  { text: string; bg: string; border: string }
> = {
  WITHIN_TARGET: {
    text: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  MODERATELY_OVERWEIGHT: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  OVERWEIGHT: {
    text: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  SEVERELY_OVERWEIGHT: {
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  },
};
