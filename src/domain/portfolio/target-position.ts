// Target Position & Sizing Model — spec §21A (v0.2, approved 2026-09-08)
// Generic, stock-agnostic. Produces CAPACITY, not a recommendation: how
// much room exists to add or trim, not whether/when to act. No entry,
// valuation, or technical timing logic belongs here.
//
// Supports both strategy shapes: (A) weight target + core range, and
// (B) weight target only. When no core range is configured, the preferred
// target falls back to an explicit preferredTargetWeightPct if set,
// otherwise a labeled default-policy midpoint heuristic — never an
// arbitrary invented value.

export type PositionSizingState = "UNDERWEIGHT" | "WITHIN_TARGET" | "OVERWEIGHT";
export type StrategyAlignment = "ALIGNED" | "CONFLICTING" | "NOT_APPLICABLE";

export interface ShareRange {
  min: number;
  max: number;
}

export interface TrimCapacity {
  minimum: number;
  preferred: number | null; // null only when the ranges are CONFLICTING
  maximumNormal: number;
}

export interface AddCapacity {
  minimum: number;
  preferred: number | null; // null only when the ranges are CONFLICTING
  maximumNormal: number;
}

export interface TargetPositionInput {
  currentShares: number;
  currentWeightPct: number; // 0-100, e.g. 58.6 — same convention as Position.portfolioWeightPct
  portfolioTotalEur: number;
  priceEur: number;
  targetWeightMinPct: number; // 0-100, e.g. 40 — same convention as Strategy.mediumTermTargetMinPct
  targetWeightMaxPct: number; // 0-100, e.g. 45
  coreShareRange?: ShareRange; // absent = weight-target-only strategy
  // Explicit preferred position size, as a weight %. Only consulted when no
  // core range is configured. Must lie within [targetWeightMinPct,
  // targetWeightMaxPct] (inclusive) — validated, not silently clamped.
  preferredTargetWeightPct?: number;
}

export interface TargetPositionResult {
  positionSizingState: PositionSizingState;
  weightShareRange: ShareRange;
  feasibleStrategyRange: ShareRange;
  strategyAlignment: StrategyAlignment;
  // null only when a core range exists but is CONFLICTING with the weight
  // range (no single point satisfies both, and no resolution rule is
  // defined here). With a core range that's ALIGNED, or with no core range
  // at all, a preferred target is always derivable.
  preferredTargetShares: number | null;
  trimCapacity: TrimCapacity;
  addCapacity: AddCapacity;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Resolves Strategy's raw (optional-as-a-pair) coreSharesMin/coreSharesMax
// into a ShareRange for deriveTargetPosition. Both present -> a core range.
// Both absent -> undefined (no-core strategy). Only one present is an
// invalid configuration and is rejected, not silently coerced.
export function resolveCoreShareRange(
  coreSharesMin: number | undefined,
  coreSharesMax: number | undefined
): ShareRange | undefined {
  if (coreSharesMin === undefined && coreSharesMax === undefined) {
    return undefined;
  }
  if (coreSharesMin === undefined || coreSharesMax === undefined) {
    throw new Error(
      "Invalid strategy configuration: coreSharesMin and coreSharesMax must both be present or both be absent."
    );
  }
  return { min: coreSharesMin, max: coreSharesMax };
}

export function deriveTargetPosition(input: TargetPositionInput): TargetPositionResult {
  const {
    currentShares,
    currentWeightPct,
    portfolioTotalEur,
    priceEur,
    targetWeightMinPct,
    targetWeightMaxPct,
    coreShareRange,
    preferredTargetWeightPct,
  } = input;

  if (
    preferredTargetWeightPct !== undefined &&
    (preferredTargetWeightPct < targetWeightMinPct || preferredTargetWeightPct > targetWeightMaxPct)
  ) {
    throw new Error(
      `preferredTargetWeightPct (${preferredTargetWeightPct}%) must lie within the target weight range [${targetWeightMinPct}%, ${targetWeightMaxPct}%].`
    );
  }

  const weightShareRange: ShareRange = {
    min: Math.ceil((portfolioTotalEur * (targetWeightMinPct / 100)) / priceEur),
    max: Math.floor((portfolioTotalEur * (targetWeightMaxPct / 100)) / priceEur),
  };

  const feasibleStrategyRange: ShareRange = coreShareRange
    ? {
        min: Math.max(weightShareRange.min, coreShareRange.min),
        max: Math.min(weightShareRange.max, coreShareRange.max),
      }
    : weightShareRange;

  const strategyAlignment: StrategyAlignment = !coreShareRange
    ? "NOT_APPLICABLE"
    : feasibleStrategyRange.min <= feasibleStrategyRange.max
    ? "ALIGNED"
    : "CONFLICTING";

  const positionSizingState: PositionSizingState =
    currentWeightPct < targetWeightMinPct
      ? "UNDERWEIGHT"
      : currentWeightPct > targetWeightMaxPct
      ? "OVERWEIGHT"
      : "WITHIN_TARGET";

  const preferredTargetShares = resolvePreferredTargetShares({
    currentShares,
    portfolioTotalEur,
    priceEur,
    weightShareRange,
    feasibleStrategyRange,
    strategyAlignment,
    preferredTargetWeightPct,
  });

  // Minimum tiers: driven ONLY by the Target Weight Range, never by core.
  const minimumTrim = Math.max(0, currentShares - weightShareRange.max);
  const minimumAdd = Math.max(0, weightShareRange.min - currentShares);

  // Maximum Normal tiers: bounded by the Feasible Strategy Range (both
  // constraints together; defaults to the weight range alone if no core).
  const maximumNormalTrim = Math.max(0, currentShares - feasibleStrategyRange.min);
  const maximumNormalAdd = Math.max(0, feasibleStrategyRange.max - currentShares);

  const preferredTrim =
    preferredTargetShares === null ? null : Math.max(0, currentShares - preferredTargetShares);
  const preferredAdd =
    preferredTargetShares === null ? null : Math.max(0, preferredTargetShares - currentShares);

  return {
    positionSizingState,
    weightShareRange,
    feasibleStrategyRange,
    strategyAlignment,
    preferredTargetShares,
    trimCapacity: { minimum: minimumTrim, preferred: preferredTrim, maximumNormal: maximumNormalTrim },
    addCapacity: { minimum: minimumAdd, preferred: preferredAdd, maximumNormal: maximumNormalAdd },
  };
}

function resolvePreferredTargetShares(args: {
  currentShares: number;
  portfolioTotalEur: number;
  priceEur: number;
  weightShareRange: ShareRange;
  feasibleStrategyRange: ShareRange;
  strategyAlignment: StrategyAlignment;
  preferredTargetWeightPct: number | undefined;
}): number | null {
  const {
    currentShares,
    portfolioTotalEur,
    priceEur,
    weightShareRange,
    feasibleStrategyRange,
    strategyAlignment,
    preferredTargetWeightPct,
  } = args;

  // With a core range: nearest point in the Feasible Strategy Range to the
  // current position — the least adjustment that satisfies both
  // constraints. Already-approved behavior, unchanged.
  if (strategyAlignment === "ALIGNED") {
    return clamp(currentShares, feasibleStrategyRange.min, feasibleStrategyRange.max);
  }
  if (strategyAlignment === "CONFLICTING") {
    // No single point satisfies both constraints, and no resolution rule
    // is defined here — not invented.
    return null;
  }

  // No core range (NOT_APPLICABLE): explicit preferred weight if
  // configured, otherwise the midpoint of the target weight range as a
  // labeled DEFAULT POLICY heuristic — not a derived or scientifically
  // optimal value. Either way, clamped into weightShareRange so the result
  // always lies inside the target weight range regardless of independent
  // rounding.
  if (preferredTargetWeightPct !== undefined) {
    const raw = Math.round((portfolioTotalEur * (preferredTargetWeightPct / 100)) / priceEur);
    return clamp(raw, weightShareRange.min, weightShareRange.max);
  }
  const midpoint = Math.round((weightShareRange.min + weightShareRange.max) / 2);
  return clamp(midpoint, weightShareRange.min, weightShareRange.max);
}
