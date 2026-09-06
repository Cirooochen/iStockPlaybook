// Hard constraint rules — spec §16
// Rules are evaluated before any weighted recommendations.
// Each constraint returns its triggered state and a human-readable description.
import type { ThesisHealth } from "@/types/playbook";

export interface HardConstraintResult {
  code: string;
  triggered: boolean;
  description: string;
}

// HC-001: accumulation disabled when portfolio weight exceeds the limit
export function checkHC001(
  weightPct: number,
  accumulationMaxWeightPct: number
): HardConstraintResult {
  const triggered = weightPct > accumulationMaxWeightPct;
  return {
    code: "HC-001",
    triggered,
    description: triggered
      ? `Weight ${weightPct.toFixed(1)}% exceeds accumulation limit (${accumulationMaxWeightPct}%). ADD is disabled.`
      : `Weight within accumulation limit.`,
  };
}

// HC-002: accumulation disabled and THESIS_REVIEW triggered when thesis is BROKEN
export function checkHC002(thesisHealth: ThesisHealth): HardConstraintResult {
  const triggered = thesisHealth === "BROKEN";
  return {
    code: "HC-002",
    triggered,
    description: triggered
      ? "Thesis is BROKEN. Accumulation disabled. THESIS_REVIEW activated."
      : "Thesis health does not block accumulation.",
  };
}

// HC-003: tactical sell cannot breach core_min unless thesis is deteriorating
export function checkHC003(
  soldShares: number,
  currentShares: number,
  coreMin: number,
  thesisHealth: ThesisHealth
): HardConstraintResult {
  const remaining = currentShares - soldShares;
  const wouldBreachCore = remaining < coreMin;
  const thesisDeteriorating =
    thesisHealth === "WEAKENING" || thesisHealth === "BROKEN";
  const triggered = wouldBreachCore && !thesisDeteriorating;
  return {
    code: "HC-003",
    triggered,
    description: triggered
      ? `Selling ${soldShares} shares would leave ${remaining} shares — below the ${coreMin}-share core minimum. Maximum tactical sell: ${Math.max(0, currentShares - coreMin)} shares.`
      : "Sell does not breach the core minimum.",
  };
}

export function isAccumulationEnabled(
  hc001: HardConstraintResult,
  hc002: HardConstraintResult
): boolean {
  return !hc001.triggered && !hc002.triggered;
}
