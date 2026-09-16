// AIResearchContext builder — Phase H.5 (design doc §3, §10). Pure,
// deterministic — the ONLY function that decides what AI is allowed to
// see. Never fetches anything itself; reuses exactly the
// PortfolioContext/ResearchEvidence shapes already flowing into
// buildProposal (src/domain/playbook/proposal.ts) — no second, divergent
// evidence-gathering path. Reduces the full ProposalField-wrapped
// UserIntent down to literal, CONCRETE answers only (never a deferred
// "NOT_SURE"/"HELP_ME_ASSESS" value) — the server does this reduction
// itself rather than trusting a client-supplied summary (design doc §10).
import type { GuardrailPreview, PortfolioContext, ResearchEvidence, UserIntent } from "@/types/playbook-proposal";
import type { AIResearchContext } from "@/types/ai-research";

export function buildAIResearchContext(args: {
  instrument: { ticker: string; name: string };
  portfolioContext: PortfolioContext;
  researchEvidence: ResearchEvidence;
  userIntent: UserIntent;
  guardrailPreview: GuardrailPreview;
}): AIResearchContext {
  const { instrument, portfolioContext, researchEvidence, userIntent, guardrailPreview } = args;

  const userIntentSoFar: AIResearchContext["userIntentSoFar"] = {};
  if (userIntent.investmentRole.provenance !== "MISSING" && userIntent.investmentRole.value !== "NOT_SURE") {
    userIntentSoFar.investmentRole = userIntent.investmentRole.value;
  }
  if (userIntent.confidence.provenance !== "MISSING" && userIntent.confidence.value !== "HELP_ME_ASSESS") {
    userIntentSoFar.confidence = userIntent.confidence.value;
  }
  if (userIntent.currentIntention.provenance !== "MISSING" && userIntent.currentIntention.value !== "NOT_SURE") {
    userIntentSoFar.currentIntention = userIntent.currentIntention.value;
  }
  if (userIntent.thesisTrajectory.provenance !== "MISSING" && userIntent.thesisTrajectory.value !== "NOT_SURE") {
    userIntentSoFar.thesisTrajectory = userIntent.thesisTrajectory.value;
  }

  return {
    instrument,
    portfolioContext,
    researchEvidence,
    userIntentSoFar,
    // Design doc §3 — only included once computable, mirroring
    // GuardrailPreview's own dependency on currentWeightPct being
    // non-null (src/domain/playbook/proposal.ts already leaves
    // concentrationStateIfConfirmedNow null in exactly this case).
    ...(guardrailPreview.concentrationStateIfConfirmedNow !== null ? { guardrailPreview } : {}),
  };
}
