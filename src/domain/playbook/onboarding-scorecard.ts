// Baseline Scorecard for a newly onboarded stock — Phase H.2 §8.1. Not
// persisted (H.1 §3 — a Scorecard is assembled at read/render time, same
// as Unity today), and every dimension starts at the SAME named,
// versioned compatibility placeholder (RULESET.compatibilityPlaceholders
// .scorecardItem) — never a per-stock guess. `fundamentals`/`momentum`
// are overwritten by runDecisionEngine whenever live evidence is SCORED
// (src/domain/engine.ts); `positionFit`/`concentrationRisk`/
// `thesisHealth` are always overwritten by the engine regardless. This
// placeholder is therefore only ever actually seen for `fundamentals`/
// `momentum` when live evidence is missing or insufficient — exactly
// H.2's intent.
//
// `valuation` is the one exception — Post-Phase-H Trust Cleanup
// (docs/post-phase-h-product-review.md F4): no live Valuation pipeline
// exists at all, for any stock, so it is `null` ("not evaluated"), never
// the compatibility placeholder. The placeholder exists solely to
// satisfy the legacy ScoreItem shape when real evidence is temporarily
// absent but a pipeline genuinely exists (fundamentals/momentum); it was
// never an honest representation for a dimension with no pipeline at
// all, and using it there was the exact "missing evidence became false
// certainty" failure this file's own H.2 design otherwise avoids.
import { RULESET } from "@/config/ruleset-v0.1";
import type { Scorecard } from "@/types/playbook";

export function buildOnboardingBaselineScorecard(): Scorecard {
  const placeholder = RULESET.compatibilityPlaceholders.scorecardItem;
  return {
    fundamentals: placeholder,
    valuation: null,
    momentum: placeholder,
    thesisHealth: placeholder,
    positionFit: placeholder,
    concentrationRisk: placeholder,
  };
}
