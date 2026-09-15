// Deterministic, parameterized ActionZone templates for a newly onboarded
// stock — Phase H.2 §9 / H.3 §8. Body text (title/summary/primaryTrigger/
// whyBullets/doNotTriggerIf) is built ONLY from generic boilerplate and
// live numeric facts already computed elsewhere in this domain layer
// (concentration/target-position) — never a hand-typed per-stock
// sentence, never a fabricated analytical judgment (e.g. valuation
// commentary) about the company itself. `state` on each returned zone is
// a placeholder — runDecisionEngine's actionZoneTemplates.map() always
// overwrites it via deriveActionZoneState (src/domain/engine.ts), exactly
// as it already does for Unity's hand-typed zones.
import {
  calcTacticalInventory,
  calcTargetShares,
  calcTrimSizing,
} from "@/domain/portfolio/concentration";
import { resolveCoreShareRange } from "@/domain/portfolio/target-position";
import type { ActionZone, Strategy } from "@/types/playbook";

export interface OnboardedActionZoneInputs {
  strategy: Strategy;
  currentShares: number;
  weightPct: number;
  portfolioTotalEur: number;
  executionPriceEur: number;
}

export function buildOnboardedActionZoneTemplates(input: OnboardedActionZoneInputs): ActionZone[] {
  const { strategy, currentShares, weightPct, portfolioTotalEur, executionPriceEur } = input;

  const targetMinPct = strategy.mediumTermTargetMinPct;
  const targetMaxPct = strategy.mediumTermTargetMaxPct;
  const ceilingPct = strategy.shortTermMaxWeightPct;

  const targetShares = calcTargetShares(portfolioTotalEur, targetMaxPct, executionPriceEur);
  const coreShareRange = resolveCoreShareRange(strategy.coreSharesMin, strategy.coreSharesMax);
  const tacticalInventory = coreShareRange
    ? calcTacticalInventory(currentShares, coreShareRange.max, coreShareRange.min)
    : { aboveCoreMax: 0, maxSellToCore: currentShares };
  const trimSizing = calcTrimSizing(tacticalInventory.aboveCoreMax);

  const weightLabel = `${weightPct.toFixed(1)}%`;

  return [
    {
      type: "ADD",
      state: "INACTIVE",
      title: "Add to position",
      summary: `Buying more would move you toward your ${targetMinPct}–${targetMaxPct}% target allocation (currently ${weightLabel}).`,
      primaryTrigger: `Available while your position stays within your ${ceilingPct}% accumulation ceiling and your thesis remains intact.`,
      whyBullets: [
        `Your position is currently ${weightLabel} of your portfolio.`,
        `Your target range is ${targetMinPct}–${targetMaxPct}%.`,
      ],
      doNotTriggerIf: [
        "Your thesis becomes broken.",
        `Your position already exceeds the ${ceilingPct}% ceiling.`,
      ],
    },
    {
      type: "HOLD",
      state: "INACTIVE",
      title: "Hold",
      summary: `No action needed right now — your position sits at ${weightLabel} of your portfolio, within your ${targetMinPct}–${targetMaxPct}% target range.`,
    },
    {
      type: "TRIM_1",
      state: "INACTIVE",
      title: "Trim — Level 1",
      summary: `Selling shares would bring you back toward your ${targetMaxPct}% target.`,
      suggestedShares: trimSizing.level1 > 0 ? `${trimSizing.level1}` : undefined,
      primaryTrigger: `Weight exceeds ${targetMaxPct}% (Overweight).`,
      whyBullets: [`Current weight: ${weightLabel}.`, `Target shares at ${targetMaxPct}%: ${targetShares}.`],
      doNotTriggerIf: ["Your position is already within target."],
    },
    {
      type: "TRIM_2",
      state: "INACTIVE",
      title: "Trim — Level 2",
      summary: `A larger trim would bring you back toward your ${targetMaxPct}% target faster.`,
      suggestedShares: trimSizing.level2 > 0 ? `${trimSizing.level2}` : undefined,
      primaryTrigger: `Weight significantly exceeds ${targetMaxPct}% (Severely overweight).`,
      whyBullets: [`Current weight: ${weightLabel}.`, `Target shares at ${targetMaxPct}%: ${targetShares}.`],
      doNotTriggerIf: ["Your position is already within target."],
    },
    {
      type: "THESIS_REVIEW",
      state: "INACTIVE",
      title: "Thesis review",
      summary: "Your thesis needs a fresh look before any other action makes sense.",
      primaryTrigger: "Triggered when your thesis becomes broken.",
    },
  ];
}
