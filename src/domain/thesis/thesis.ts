// Thesis seam — spec §37 domain/thesis/
// Phase D (AI evidence / thesis classification) will replace deriveThesisHealth's
// pass-through with real thesis derivation. For now it returns the seed value
// unchanged — no new thesis logic, just a stable boundary for downstream consumers.
import type { ScoreItem, ThesisHealth } from "@/types/playbook";

export function deriveThesisHealth(seedThesisHealth: ThesisHealth): ThesisHealth {
  return seedThesisHealth;
}

// Mechanical relabeling of ThesisHealth into the Scorecard's ScoreItem shape —
// the same pattern already used for concentrationRisk (scoring.ts). This is
// the ONLY place a thesis ScoreItem may be produced: it exists so
// scorecard.thesisHealth can never independently drift from thesis.health.
// Not a scoring model — Phase C/D may replace these placeholder numbers.
const THESIS_SCORE_MAP: Record<ThesisHealth, ScoreItem> = {
  STRENGTHENING: { score: 9, state: "Positive" },
  INTACT: { score: 8, state: "Intact" },
  MIXED: { score: 5, state: "Neutral" },
  WEAKENING: { score: 3, state: "Weak" },
  BROKEN: { score: 1, state: "Elevated" },
};

export function deriveThesisScoreItem(health: ThesisHealth): ScoreItem {
  return THESIS_SCORE_MAP[health];
}
