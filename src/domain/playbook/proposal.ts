// Playbook Proposal derivation — Phase H.2 (design:
// docs/phase-h2-deterministic-strategy-mapping.md). Pure functions only —
// no React, no I/O. Builds the reviewable PlaybookProposal (H.1) from
// User Intent + Portfolio Context + Research Evidence, deriving
// ProposedConfiguration and GuardrailPreview deterministically. Confirming
// a proposal (materializing a StockPlaybookConfig) is a separate step —
// see materialize-config.ts.
import { RULESET } from "@/config/ruleset-v0.1";
import { classifyConcentration } from "@/domain/portfolio/concentration";
import { deriveDiscrepancies } from "@/domain/playbook/onboarding-discrepancies";
import { mapThesisTrajectoryToHealth } from "@/domain/playbook/thesis-trajectory";
import { deriveStrategyFieldsFromIntent } from "@/domain/playbook/derive-strategy-fields";
import type {
  CorePortionBucket,
  CorePortionInput,
  InvestmentRole,
  PlaybookProposal,
  PortfolioContext,
  ProposalField,
  ProposalSubject,
  ProposalStatus,
  ProposedConfiguration,
  ResearchEvidence,
  UserIntent,
} from "@/types/playbook-proposal";

export function createEmptyUserIntent(): UserIntent {
  return {
    investmentRole: { provenance: "MISSING" },
    confidence: { provenance: "MISSING" },
    currentIntention: { provenance: "MISSING" },
    corePortion: { status: "NOT_APPLICABLE" },
    thesisTrajectory: { provenance: "MISSING" },
  };
}

// H.3 §3.1 — Core Protection is only meaningful for LONG_TERM_CORE.
// Switching role away from it resets an in-progress/answered core
// portion back to NOT_APPLICABLE (never left dangling from a prior
// answer); switching into it starts the follow-up as MISSING unless
// already answered.
export function corePortionForRole(
  role: InvestmentRole | null,
  previous: CorePortionInput
): CorePortionInput {
  if (role !== "LONG_TERM_CORE") return { status: "NOT_APPLICABLE" };
  if (previous.status === "PROVIDED") return previous;
  return { status: "MISSING" };
}

// H.3 §11 (resolved) — the Core Protection bucket -> fraction mapping.
export function corePortionBucketToFraction(bucket: CorePortionBucket): number {
  return RULESET.strategyDefaults.corePortionBuckets[bucket];
}

// A deferred answer ("NOT_SURE"/"HELP_ME_ASSESS") is itself information,
// distinct from MISSING (not yet answered) — but for the purposes of
// "is this ready to act on," both mean the same thing: no concrete value
// exists yet (H.1 §2.3/§6 item 3).
function resolvedValue<T, D extends T>(field: ProposalField<T>, deferredValues: readonly D[]): Exclude<T, D> | null {
  if (field.provenance === "MISSING") return null;
  if ((deferredValues as readonly T[]).includes(field.value)) return null;
  return field.value as Exclude<T, D>;
}

export function buildProposal(args: {
  subject: ProposalSubject;
  portfolioContext: PortfolioContext;
  userIntent: UserIntent;
  researchEvidence: ResearchEvidence;
}): PlaybookProposal {
  const { subject, portfolioContext, userIntent, researchEvidence } = args;

  const role = resolvedValue(userIntent.investmentRole, ["NOT_SURE"] as const);
  const confidence = resolvedValue(userIntent.confidence, ["HELP_ME_ASSESS"] as const);
  const intention = resolvedValue(userIntent.currentIntention, ["NOT_SURE"] as const);
  const trajectory = resolvedValue(userIntent.thesisTrajectory, ["NOT_SURE"] as const);
  const corePortionAnswered = userIntent.corePortion.status !== "MISSING";

  const thesisHealthPreviewValue = trajectory ? mapThesisTrajectoryToHealth(trajectory) : null;

  let proposedConfiguration: ProposedConfiguration = {
    targetAllocationRange: { provenance: "MISSING" },
    accumulationCeilingPct: { provenance: "MISSING" },
  };
  let concentrationStateIfConfirmedNow: PlaybookProposal["guardrailPreview"]["concentrationStateIfConfirmedNow"] = null;
  let discrepancies: PlaybookProposal["guardrailPreview"]["discrepancies"] = [];

  if (role) {
    const fields = deriveStrategyFieldsFromIntent(
      role,
      userIntent.corePortion,
      portfolioContext.holdingSnapshot.quantity
    );

    const corePosition: ProposedConfiguration["corePosition"] =
      fields.coreSharesMin !== undefined && fields.coreSharesMax !== undefined
        ? {
            provenance: "DETERMINISTIC",
            value: { minShares: fields.coreSharesMin, maxShares: fields.coreSharesMax },
          }
        : undefined;

    proposedConfiguration = {
      targetAllocationRange: {
        provenance: "DETERMINISTIC",
        value: { minPct: fields.mediumTermTargetMinPct, maxPct: fields.mediumTermTargetMaxPct },
      },
      accumulationCeilingPct: { provenance: "DETERMINISTIC", value: fields.shortTermMaxWeightPct },
      ...(corePosition ? { corePosition } : {}),
      ...(thesisHealthPreviewValue
        ? { thesisHealthPreview: { provenance: "DETERMINISTIC", value: thesisHealthPreviewValue } }
        : {}),
    };

    if (portfolioContext.currentWeightPct !== null) {
      concentrationStateIfConfirmedNow = classifyConcentration(
        portfolioContext.currentWeightPct,
        fields.mediumTermTargetMaxPct
      );
      discrepancies = deriveDiscrepancies({
        currentIntention: intention,
        thesisHealth: thesisHealthPreviewValue,
        currentWeightPct: portfolioContext.currentWeightPct,
        concentrationStateIfConfirmedNow,
        proposedTargetMinPct: fields.mediumTermTargetMinPct,
        proposedTargetMaxPct: fields.mediumTermTargetMaxPct,
        proposedCeilingPct: fields.shortTermMaxWeightPct,
      });
    }
  } else if (thesisHealthPreviewValue) {
    // Role unresolved but thesis already answered — still surface the
    // preview; nothing else in ProposedConfiguration can be computed yet.
    proposedConfiguration = {
      ...proposedConfiguration,
      thesisHealthPreview: { provenance: "DETERMINISTIC", value: thesisHealthPreviewValue },
    };
  }

  const allAnswered =
    role !== null && confidence !== null && intention !== null && trajectory !== null && corePortionAnswered;

  const status: ProposalStatus = allAnswered ? "READY_FOR_REVIEW" : "GATHERING_INTENT";

  return {
    subject,
    portfolioContext,
    userIntent,
    researchEvidence,
    guardrailPreview: { concentrationStateIfConfirmedNow, discrepancies },
    proposedConfiguration,
    status,
  };
}
