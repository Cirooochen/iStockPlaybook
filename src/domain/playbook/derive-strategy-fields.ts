// InvestmentRole + CorePortion -> Strategy's numeric fields — Phase H.2
// §2/§3 (design: docs/phase-h2-deterministic-strategy-mapping.md). Pure,
// shared by proposal.ts (review-time preview), materialize-config.ts
// (production materialization), and the onboarding overlay's Review
// screen (a hypothetical Engine run) — a single implementation so all
// three can never drift apart on the same formula.
import { RULESET } from "@/config/ruleset-v0.1";
import type { CorePortionInput, InvestmentRole } from "@/types/playbook-proposal";

export interface DerivedStrategyFields {
  mediumTermTargetMinPct: number;
  mediumTermTargetMaxPct: number;
  shortTermMaxWeightPct: number;
  coreSharesMin?: number;
  coreSharesMax?: number;
}

export function deriveStrategyFieldsFromIntent(
  role: Exclude<InvestmentRole, "NOT_SURE">,
  corePortion: CorePortionInput,
  currentSharesAtConfirmation: number
): DerivedStrategyFields {
  const roleDefaults = RULESET.strategyDefaults.roleTargetAllocation[role];
  const shortTermMaxWeightPct = roleDefaults.maxPct + RULESET.strategyDefaults.accumulationCeilingBufferPct;

  let coreSharesMin: number | undefined;
  let coreSharesMax: number | undefined;
  if (role === "LONG_TERM_CORE" && corePortion.status === "PROVIDED") {
    const centerShares = Math.round(corePortion.value.fractionOfCurrentHolding * currentSharesAtConfirmation);
    const half = RULESET.strategyDefaults.coreBandHalfWidthPct;
    coreSharesMin = Math.floor(centerShares * (1 - half));
    coreSharesMax = Math.ceil(centerShares * (1 + half));
  }

  return {
    mediumTermTargetMinPct: roleDefaults.minPct,
    mediumTermTargetMaxPct: roleDefaults.maxPct,
    shortTermMaxWeightPct,
    coreSharesMin,
    coreSharesMax,
  };
}
