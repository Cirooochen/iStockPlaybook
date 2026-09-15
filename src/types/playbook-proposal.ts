// Playbook Proposal model — Phase H.1 (design:
// docs/phase-h1-playbook-proposal-model.md). The structured, reviewable
// object between User Intent + Portfolio Context + Research Evidence and
// a production StockPlaybookConfig. Deliberately modeled around product
// meaning, not legacy Strategy/Playbook shape (H.1 §1) — H.2's
// materialize-config.ts is the only place this gets mapped into
// production types.
import type { ThesisHealth } from "@/types/playbook";
import type { HoldingSnapshot, PortfolioValuation } from "@/types/portfolio";
import type { MomentumScoreResult } from "@/domain/signals/momentum-score";
import type { FundamentalsScoreResult } from "@/domain/signals/fundamentals-score";
import type { ConcentrationState } from "@/domain/portfolio/concentration";

// §1.1 — the provenance primitive. SYSTEM (observed fact) and
// DETERMINISTIC (a rule applied to facts) are deliberately distinct.
export type Provenance = "USER" | "SYSTEM" | "AI" | "DETERMINISTIC" | "MISSING";

export type ProposalField<T> =
  | { provenance: "USER"; value: T }
  | { provenance: "SYSTEM"; value: T }
  | { provenance: "AI"; value: T }
  | { provenance: "DETERMINISTIC"; value: T }
  | { provenance: "MISSING" };

// §2.1
export interface ProposalSubject {
  instrumentId: string;
  holdingId: string;
}

// §2.2 — read-only, reused from the existing Portfolio model, never
// re-derived (guardrail #10).
export interface PortfolioContext {
  holdingSnapshot: HoldingSnapshot;
  valuation: PortfolioValuation;
  currentWeightPct: number | null;
}

// §2.3
export type InvestmentRole = "LONG_TERM_CORE" | "GROWTH" | "TACTICAL" | "NOT_SURE";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "HELP_ME_ASSESS";
export type CurrentIntention = "BUILD" | "HOLD" | "REDUCE" | "NOT_SURE";

// Beginner-facing, distinct from the production ThesisHealth enum — H.2
// owns the deterministic 1:1 mapping (materialize-config.ts).
export type ThesisTrajectory =
  | "GETTING_STRONGER"
  | "NO_MEANINGFUL_CHANGE"
  | "SOME_DOUBTS"
  | "GETTING_WEAKER"
  | "REASONS_NO_LONGER_HOLD"
  | "NOT_SURE";

// H.3 §3, Q1a — three coarse buckets ("All of it" deliberately removed,
// H.3 §11). The fraction each bucket maps to lives in
// RULESET.strategyDefaults.corePortionBuckets, not here.
export type CorePortionBucket = "MOST_OF_IT" | "ABOUT_HALF" | "A_SMALLER_PART";

export interface CorePortionValue {
  fractionOfCurrentHolding: number; // 0 < x <= 1
}

export type CorePortionInput =
  | { status: "NOT_APPLICABLE" }
  | { status: "MISSING" }
  | { status: "PROVIDED"; value: CorePortionValue };

export interface UserIntent {
  investmentRole: ProposalField<InvestmentRole>;
  confidence: ProposalField<ConfidenceLevel>;
  // Proposal-only (H.0 resolution #5) — never persists into Strategy or
  // Playbook.stance, and has no ProposedConfiguration/H.2 output field.
  currentIntention: ProposalField<CurrentIntention>;
  corePortion: CorePortionInput;
  thesisTrajectory: ProposalField<ThesisTrajectory>;
}

// §2.4
export interface ResearchEvidence {
  price: { provenance: "SYSTEM"; value: { nativeAmount: number; currency: string } } | { provenance: "MISSING" };
  momentum: { provenance: "DETERMINISTIC"; result: MomentumScoreResult } | { provenance: "MISSING" };
  fundamentals:
    | {
        provenance: "DETERMINISTIC";
        result: FundamentalsScoreResult;
        modelFit: "CONFIRMED_FIT" | "LIMITED_FIT" | "UNKNOWN_FIT";
      }
    | { provenance: "MISSING" };
  valuation: { provenance: "MISSING" };
}

// §2.5
export type DiscrepancyCode =
  | "BUILD_INTENT_THESIS_BROKEN"
  | "BUILD_INTENT_ACCUMULATION_BLOCKED"
  | "BUILD_INTENT_ALREADY_OVERWEIGHT"
  | "REDUCE_INTENT_WITHIN_TARGET";

export interface IntentDiscrepancy {
  code: DiscrepancyCode;
  message: string;
}

export interface GuardrailPreview {
  concentrationStateIfConfirmedNow: ConcentrationState | null;
  discrepancies: IntentDiscrepancy[];
}

// §2.6
export interface ProposedConfiguration {
  targetAllocationRange: ProposalField<{ minPct: number; maxPct: number }>;
  accumulationCeilingPct: ProposalField<number>;
  corePosition?: ProposalField<{ minShares: number; maxShares: number }>;
  preferredTargetPct?: ProposalField<number>;
  relativeStrengthBenchmark?: ProposalField<string>;
  thesisHealthPreview?: ProposalField<ThesisHealth>;
}

// §2.7
export type ProposalStatus = "GATHERING_INTENT" | "READY_FOR_REVIEW" | "CONFIRMED" | "DISCARDED";

// §2
export interface PlaybookProposal {
  subject: ProposalSubject;
  portfolioContext: PortfolioContext;
  userIntent: UserIntent;
  researchEvidence: ResearchEvidence;
  guardrailPreview: GuardrailPreview;
  proposedConfiguration: ProposedConfiguration;
  status: ProposalStatus;
}
