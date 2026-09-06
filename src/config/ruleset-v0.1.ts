// Versioned parameter registry — spec §32
// All thresholds live here. Never scatter magic numbers through application code.
export const RULESET_VERSION = "0.1";

export const RULESET = {
  version: RULESET_VERSION,
  concentration: {
    // §8 — concentration state multipliers relative to target_max
    moderateMultiplier: 1.15, // target × 1.15 → MODERATELY_OVERWEIGHT boundary
    severeMultiplier: 1.30,   // target × 1.30 → SEVERELY_OVERWEIGHT boundary
  },
  trimStaging: {
    // §21 — staging fractions of max tactical trim
    level1Fraction: 0.30,
    level2Fraction: 0.35,
    // level3 = remainder
  },
  positionFit: {
    // §9 — position fit score formula coefficient
    // score = max(0, 100 − penaltyCoefficient × excess_ratio)
    penaltyCoefficient: 200,
  },
  confidence: {
    // §24 — confidence classification thresholds
    mediumThreshold: 0.55,
    highThreshold: 0.80,
  },
} as const;
