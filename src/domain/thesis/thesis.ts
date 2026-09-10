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

// Spec §22 (Add Logic) thesis-eligibility clause — v0.1 decision (B.5.5,
// 2026-09-09): STRENGTHENING and INTACT are ADD-eligible; MIXED, WEAKENING,
// and BROKEN are not. MIXED and WEAKENING deliberately share this outcome
// for v0.1 — their semantic distinction remains in ThesisHealth/scorecard
// and gains weight once Phase C/D evidence and fundamental logic exist.
// BROKEN is also independently blocked via HC-002/accumulationEnabled; this
// predicate does not special-case it. The other two §22 clauses
// (fundamental_score >= 60, valuation_score >= 60) are Phase C scope and
// are not evaluated here.
const ADD_ELIGIBLE_THESIS_STATES: ReadonlySet<ThesisHealth> = new Set([
  "STRENGTHENING",
  "INTACT",
]);

export function isThesisEligibleForAdd(health: ThesisHealth): boolean {
  return ADD_ELIGIBLE_THESIS_STATES.has(health);
}
