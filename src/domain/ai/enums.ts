// Per-question valid Intent Assist suggestion values — Phase H.5 (design
// doc §6, "enum validation"). Deliberately EXCLUDES each question's own
// deferral literal ("NOT_SURE"/"HELP_ME_ASSESS") — a suggestion exists to
// help resolve a deferral, not restate it. This is the single source of
// truth shared by the prompt builders (told exactly this set) and the
// grounding validator (accepts nothing else) — src/domain/ai/validation.ts
// never has its own separate notion of "valid."
import type { IntentAssistQuestion } from "@/types/ai-research";

export const INTENT_QUESTION_VALUES: Record<IntentAssistQuestion, readonly string[]> = {
  INVESTMENT_ROLE: ["LONG_TERM_CORE", "GROWTH", "TACTICAL"],
  CORE_PORTION: ["MOST_OF_IT", "ABOUT_HALF", "A_SMALLER_PART"],
  CONFIDENCE: ["HIGH", "MEDIUM", "LOW"],
  CURRENT_INTENTION: ["BUILD", "HOLD", "REDUCE"],
  THESIS_TRAJECTORY: [
    "GETTING_STRONGER",
    "NO_MEANINGFUL_CHANGE",
    "SOME_DOUBTS",
    "GETTING_WEAKER",
    "REASONS_NO_LONGER_HOLD",
  ],
};

// Plain-language label per question — used by the Intent Assist prompt so
// the model knows what it's being asked to help with, without domain/
// importing any UI copy (src/domain/ never imports components).
export const INTENT_QUESTION_LABEL: Record<IntentAssistQuestion, string> = {
  INVESTMENT_ROLE: "How do you see this position? (long-term core / growth / tactical)",
  CORE_PORTION: "How much of this holding do you consider permanent/protected?",
  CONFIDENCE: "How confident are you in this investment?",
  CURRENT_INTENTION: "What do you want to do with this position right now?",
  THESIS_TRAJECTORY: "Have your reasons for owning this changed?",
};

export function isValidIntentSuggestionValue(question: IntentAssistQuestion, value: string): boolean {
  return INTENT_QUESTION_VALUES[question].includes(value);
}
