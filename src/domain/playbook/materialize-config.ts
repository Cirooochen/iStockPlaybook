// Confirmed PlaybookProposal -> production StockPlaybookConfig — Phase
// H.2 (design: docs/phase-h2-deterministic-strategy-mapping.md). The
// ONLY place a Proposal is mapped into production Strategy/Playbook
// shape. Pure function — no React, no I/O, no persistence (the caller
// persists the returned config). Once returned, the config carries no
// provenance at all (H.1 §1.2 confirmation boundary) — a plain
// { instrumentId, strategy, playbook }, indistinguishable from one
// authored any other way.
import { classifyConcentration } from "@/domain/portfolio/concentration";
import { deriveStance } from "@/domain/playbook/stance-rules";
import { DISCREPANCY_SEVERITY } from "@/domain/playbook/onboarding-discrepancies";
import { mapThesisTrajectoryToHealth } from "@/domain/playbook/thesis-trajectory";
import { deriveStrategyFieldsFromIntent } from "@/domain/playbook/derive-strategy-fields";
import { createStockPlaybookConfig } from "@/domain/portfolio/snapshot";
import type { Holding, StockPlaybookConfig } from "@/types/portfolio";
import type { Playbook, Strategy } from "@/types/playbook";
import type {
  ConfidenceLevel,
  InvestmentRole,
  PlaybookProposal,
  ThesisTrajectory,
} from "@/types/playbook-proposal";

export type MaterializeRejectionReason =
  | "UNRESOLVED_ANSWERS"
  | "HARD_DISCREPANCY"
  | "SOFT_DISCREPANCY_NOT_ACKNOWLEDGED"
  | "INVALID_SUBJECT";

export type MaterializeResult =
  | { ok: true; config: StockPlaybookConfig }
  | { ok: false; reason: MaterializeRejectionReason };

const ROLE_LABEL: Record<InvestmentRole, string> = {
  LONG_TERM_CORE: "a long-term core holding",
  GROWTH: "a growth position",
  TACTICAL: "a smaller, tactical position",
  NOT_SURE: "an undecided role",
};

const TRAJECTORY_LABEL: Record<ThesisTrajectory, string> = {
  GETTING_STRONGER: "getting stronger",
  NO_MEANINGFUL_CHANGE: "unchanged",
  SOME_DOUBTS: "showing some doubts",
  GETTING_WEAKER: "getting weaker",
  REASONS_NO_LONGER_HOLD: "no longer valid",
  NOT_SURE: "unresolved",
};

function isDeferredRole(role: InvestmentRole): role is "NOT_SURE" {
  return role === "NOT_SURE";
}
function isDeferredConfidence(c: ConfidenceLevel): c is "HELP_ME_ASSESS" {
  return c === "HELP_ME_ASSESS";
}

// Deterministic, factual template sentence — same discipline as H.2 §9's
// ActionZone templates: live values only, never fabricated analysis.
function buildSummary(
  role: InvestmentRole,
  confidence: ConfidenceLevel,
  trajectory: ThesisTrajectory,
  nowIso: string
): string {
  const date = new Date(nowIso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `Playbook created ${date}. Treated as ${ROLE_LABEL[role]}, ${confidence.toLowerCase()} confidence. Thesis: ${TRAJECTORY_LABEL[trajectory]}.`;
}

export function materializeStockPlaybookConfig(
  proposal: PlaybookProposal,
  holdings: Holding[],
  currentSharesAtConfirmation: number,
  acknowledgedSoftDiscrepancies: boolean,
  nowIso: string
): MaterializeResult {
  const { userIntent, guardrailPreview } = proposal;

  const role =
    userIntent.investmentRole.provenance !== "MISSING" && !isDeferredRole(userIntent.investmentRole.value)
      ? userIntent.investmentRole.value
      : null;
  const confidenceLevel =
    userIntent.confidence.provenance !== "MISSING" && !isDeferredConfidence(userIntent.confidence.value)
      ? userIntent.confidence.value
      : null;
  const trajectory =
    userIntent.thesisTrajectory.provenance !== "MISSING" && userIntent.thesisTrajectory.value !== "NOT_SURE"
      ? userIntent.thesisTrajectory.value
      : null;
  const corePortionResolved = userIntent.corePortion.status !== "MISSING";
  // Current Intention is Proposal-only (H.1 §0 item 5) — it still must be
  // resolved before confirmation (an unanswered/deferred intent is just as
  // "not ready" as any other unresolved field), but its VALUE is never
  // read below; it never feeds Strategy or Playbook.
  const intentionResolved =
    userIntent.currentIntention.provenance !== "MISSING" && userIntent.currentIntention.value !== "NOT_SURE";

  if (!role || !confidenceLevel || !trajectory || !corePortionResolved || !intentionResolved) {
    return { ok: false, reason: "UNRESOLVED_ANSWERS" };
  }

  const thesisHealth = mapThesisTrajectoryToHealth(trajectory);
  if (!thesisHealth) {
    return { ok: false, reason: "UNRESOLVED_ANSWERS" };
  }

  const discrepancies = guardrailPreview.discrepancies;
  if (discrepancies.some((d) => DISCREPANCY_SEVERITY[d.code] === "HARD")) {
    return { ok: false, reason: "HARD_DISCREPANCY" };
  }
  if (discrepancies.some((d) => DISCREPANCY_SEVERITY[d.code] === "SOFT") && !acknowledgedSoftDiscrepancies) {
    return { ok: false, reason: "SOFT_DISCREPANCY_NOT_ACKNOWLEDGED" };
  }

  const fields = deriveStrategyFieldsFromIntent(role, userIntent.corePortion, currentSharesAtConfirmation);

  // Dead fields (H.2 §7) — never read anywhere; any valid value is
  // correct. horizon/tacticalSharesMin/Max are the empty-string/zero
  // placeholders H.2 names explicitly. preferredTargetWeightPct and
  // benchmarkInstrumentId are deliberately left unset (H.2 §2) — the
  // former relies on target-position.ts's existing midpoint fallback,
  // the latter has no benchmark-inference capability in v0.1.
  const strategy: Strategy = {
    horizon: "",
    shortTermMaxWeightPct: fields.shortTermMaxWeightPct,
    mediumTermTargetMinPct: fields.mediumTermTargetMinPct,
    mediumTermTargetMaxPct: fields.mediumTermTargetMaxPct,
    coreSharesMin: fields.coreSharesMin,
    coreSharesMax: fields.coreSharesMax,
    tacticalSharesMin: 0,
    tacticalSharesMax: 0,
  };

  // Playbook.stance is also dead (write-only since G.6 — Portfolio/Stock
  // Detail both live-recompute stance independently). Computed from
  // today's actual weight when known, purely for tidiness — not
  // load-bearing either way.
  const concentrationState =
    proposal.portfolioContext.currentWeightPct !== null
      ? classifyConcentration(proposal.portfolioContext.currentWeightPct, fields.mediumTermTargetMaxPct)
      : "WITHIN_TARGET";
  const stance = deriveStance(concentrationState, thesisHealth);

  const playbook: Playbook = {
    stance,
    confidence: confidenceLevel,
    thesisHealth,
    version: 1,
    updatedAt: nowIso,
    summary: buildSummary(role, confidenceLevel, trajectory, nowIso),
  };

  const config = createStockPlaybookConfig(proposal.subject.instrumentId, holdings, strategy, playbook);
  if (!config) {
    return { ok: false, reason: "INVALID_SUBJECT" };
  }
  return { ok: true, config };
}
