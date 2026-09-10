// Evidence-derived scoring — spec: docs/phase-d0-momentum-scorecard-integration-design.md
// §2.3/§5. General, not momentum-specific: any evidence-derived dimension
// (momentum today; fundamentals/valuation potentially later) that may or
// may not have enough evidence to produce a real score can use this
// shape. Deliberately NOT added to types/playbook.ts — zero diff to that
// shared file; ScoreItem/Scorecard/SignalState are untouched.
//
// Evidence availability and signal state are separate concepts:
// `EvidenceScoredItem` answers "do we have a score" (SCORED vs.
// INSUFFICIENT_DATA); `ScoreItem` (inside the SCORED branch) answers
// "what does it say." Never fabricate a SCORED-shaped result when there
// isn't one — see deriveMomentumEvidenceScoredItem
// (src/domain/signals/momentum-score.ts) for the one function permitted
// to produce this for momentum.
import type { ScoreItem } from "@/types/playbook";

export type EvidenceScoredItem =
  | { status: "SCORED"; item: ScoreItem }
  | { status: "INSUFFICIENT_DATA" };
