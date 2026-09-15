// ThesisTrajectory -> ThesisHealth — Phase H.2 §4 (fully resolved, fixed
// 1:1 lookup, no numbers to tune). Shared by proposal.ts (review-time
// preview) and materialize-config.ts (production mapping) so the two
// can never drift apart. "NOT_SURE" deliberately has no entry — it must
// never default to INTACT (H.1 §6 item 1); callers get `null` and must
// treat that as genuinely unresolved.
import type { ThesisHealth } from "@/types/playbook";
import type { ThesisTrajectory } from "@/types/playbook-proposal";

const THESIS_TRAJECTORY_MAP: Record<Exclude<ThesisTrajectory, "NOT_SURE">, ThesisHealth> = {
  GETTING_STRONGER: "STRENGTHENING",
  NO_MEANINGFUL_CHANGE: "INTACT",
  SOME_DOUBTS: "MIXED",
  GETTING_WEAKER: "WEAKENING",
  REASONS_NO_LONGER_HOLD: "BROKEN",
};

export function mapThesisTrajectoryToHealth(trajectory: ThesisTrajectory): ThesisHealth | null {
  if (trajectory === "NOT_SURE") return null;
  return THESIS_TRAJECTORY_MAP[trajectory];
}
