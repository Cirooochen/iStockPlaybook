// Baseline Scorecard for a newly onboarded stock — Phase H.2 §8.1. Not
// persisted (H.1 §3 — a Scorecard is assembled at read/render time, same
// as Unity today), and every dimension starts at the SAME named,
// versioned compatibility placeholder (RULESET.compatibilityPlaceholders
// .scorecardItem) — never a per-stock guess. `fundamentals`/`momentum`
// are overwritten by runDecisionEngine whenever live evidence is SCORED
// (src/domain/engine.ts); `valuation`/`positionFit`/`concentrationRisk`/
// `thesisHealth` are always overwritten by the engine regardless. This
// placeholder is therefore only ever actually seen for `valuation` (no
// live pipeline exists at all) and for `fundamentals`/`momentum` when
// live evidence is missing or insufficient — exactly H.2's intent.
import { RULESET } from "@/config/ruleset-v0.1";
import type { Scorecard } from "@/types/playbook";

export function buildOnboardingBaselineScorecard(): Scorecard {
  const placeholder = RULESET.compatibilityPlaceholders.scorecardItem;
  return {
    fundamentals: placeholder,
    valuation: placeholder,
    momentum: placeholder,
    thesisHealth: placeholder,
    positionFit: placeholder,
    concentrationRisk: placeholder,
  };
}
