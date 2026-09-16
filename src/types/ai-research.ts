// AI Research Context & structured AI output types — Phase H.5 (design:
// docs/phase-h5-ai-assisted-research-design.md). AI Interpretation sits
// strictly upstream of UserIntent (design doc §2): these types are NEVER
// merged into PlaybookProposal (src/types/playbook-proposal.ts) — an
// AIEvidenceBrief/AIIntentAssist is ephemeral, request-scoped UI state the
// overlay shows and then discards. No value defined here ever reaches
// materialize-config.ts, and PlaybookProposal itself gains zero fields
// because of this file (design doc §9's Model Decision).
import type {
  ConfidenceLevel,
  CurrentIntention,
  GuardrailPreview,
  InvestmentRole,
  PortfolioContext,
  ResearchEvidence,
  ThesisTrajectory,
} from "@/types/playbook-proposal";

// Design doc §3 — the bounded, explicitly-typed AI input. Built once,
// deterministically, from data the app already has
// (src/domain/ai/context.ts). Never a live web fetch or document upload
// in v0.1 (design doc §8 item 1) — every field here is either reused
// verbatim from PlaybookProposal-adjacent types or a plain instrument
// identity pair.
export interface AIResearchContext {
  instrument: { ticker: string; name: string };
  portfolioContext: PortfolioContext;
  researchEvidence: ResearchEvidence;
  // Whatever the user has already answered, literal enum values only —
  // never inferred, never a deferred ("NOT_SURE"/"HELP_ME_ASSESS") value
  // (src/domain/ai/context.ts strips those before this is built).
  userIntentSoFar: {
    investmentRole?: InvestmentRole;
    confidence?: ConfidenceLevel;
    currentIntention?: CurrentIntention;
    thesisTrajectory?: ThesisTrajectory;
  };
  // Only included once computable — mirrors GuardrailPreview's own
  // dependency on currentWeightPct being non-null (design doc §3).
  guardrailPreview?: GuardrailPreview;
}

// Design doc §6 — every point AI makes must be traceable to a specific
// context field, or explicitly disclosed as a generality not specific to
// this company (an empty groundedIn array). This is a CLOSED union —
// src/domain/ai/validation.ts rejects any string outside this set before
// it ever reaches the UI.
export type EvidenceFieldRef =
  | "researchEvidence.momentum"
  | "researchEvidence.fundamentals"
  | "researchEvidence.fundamentals.modelFit"
  | "researchEvidence.valuation"
  | "researchEvidence.price"
  | "portfolioContext.currentWeightPct"
  | "portfolioContext.valuation"
  | "guardrailPreview";

export const ALL_EVIDENCE_FIELD_REFS: readonly EvidenceFieldRef[] = [
  "researchEvidence.momentum",
  "researchEvidence.fundamentals",
  "researchEvidence.fundamentals.modelFit",
  "researchEvidence.valuation",
  "researchEvidence.price",
  "portfolioContext.currentWeightPct",
  "portfolioContext.valuation",
  "guardrailPreview",
];

export interface EvidencePoint {
  text: string;
  groundedIn: EvidenceFieldRef[];
}

export interface AIResponseMeta {
  modelVersion: string;
  generatedAt: string;
  latencyMs: number;
}

// Design doc §4 — Evidence Brief. Passive, shown to every user on Review.
// "challenge" (the plan's own language) lives in `uncertainties`, not as
// a separate surface — design doc §1.
export interface AIEvidenceBrief {
  summary: string;
  strengths: EvidencePoint[];
  uncertainties: EvidencePoint[];
  meta: AIResponseMeta;
}

// Design doc §5 — Intent Assist. On-demand, one call per unresolved
// question, never automatic. CORE_PORTION is included even though its
// production field (CorePortionInput) isn't a ProposalField<T> like the
// other four — the AI surface still treats it as a fifth question with
// its own three-bucket answer space (src/domain/ai/enums.ts).
export type IntentAssistQuestion =
  | "INVESTMENT_ROLE"
  | "CORE_PORTION"
  | "CONFIDENCE"
  | "CURRENT_INTENTION"
  | "THESIS_TRAJECTORY";

export interface IntentSuggestion {
  // Validated against the question's real production enum before this
  // type is ever constructed (src/domain/ai/validation.ts,
  // src/domain/ai/enums.ts) — kept as `string` here rather than a union
  // typed per-question, since the valid set varies by `question` and is
  // enforced at the validation boundary, not by the TS type alone.
  value: string;
  rationale: string;
  groundedIn: EvidenceFieldRef[];
}

export interface AIIntentAssist {
  question: IntentAssistQuestion;
  // 0-3 suggestions, never a single forced answer (design doc §5).
  // Investment Role/Core Portion may legitimately have none — see
  // clarifyingQuestions instead (design doc §5.1).
  suggestions: IntentSuggestion[];
  clarifyingQuestions: string[];
  caveats: string[];
  meta: AIResponseMeta;
}
