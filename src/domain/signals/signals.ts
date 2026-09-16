// Signal seam — spec §37 domain/signals/
// Phase C will replace these pass-throughs with real fundamentals/valuation/
// technical computation. For now every function returns the static seed
// value unchanged — no new formulas, just a stable boundary for Phase C/D.
import type { Scorecard, ScoreItem } from "@/types/playbook";

export function deriveFundamentalsScore(scorecard: Scorecard): ScoreItem {
  return scorecard.fundamentals;
}

// Post-Phase-H Trust Cleanup — `null` passes through unchanged, same as
// every other field here; this function still fabricates nothing, it
// just no longer has a non-null value to pass through for valuation
// until a real pipeline exists (docs/post-phase-h-product-review.md F4).
export function deriveValuationScore(scorecard: Scorecard): ScoreItem | null {
  return scorecard.valuation;
}

// "Technical" layer — currently backed by the scorecard's `momentum` field.
export function deriveTechnicalScore(scorecard: Scorecard): ScoreItem {
  return scorecard.momentum;
}

export interface Signals {
  fundamentals: ScoreItem;
  valuation: ScoreItem | null;
  momentum: ScoreItem;
}

export function deriveSignals(scorecard: Scorecard): Signals {
  return {
    fundamentals: deriveFundamentalsScore(scorecard),
    valuation: deriveValuationScore(scorecard),
    momentum: deriveTechnicalScore(scorecard),
  };
}
