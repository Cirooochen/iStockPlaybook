// Intent Assist generation — Phase H.5 (design doc §5). Same pure-domain,
// injected-`complete`, never-throws shape as evidence-brief.ts. One call
// per unresolved question, triggered only by an explicit user action
// (never automatic) — see the client hook, src/lib/use-ai-assist.ts.
//
// Not all five questions are equally "answerable" from evidence (design
// doc §5.1): Investment Role and Core Portion are personal-preference
// questions no amount of evidence fully resolves, so their prompt
// guidance leans on clarifying questions over assertive suggestions.
// Confidence and Current Intention sit in between. Thesis Trajectory
// reuses the reasoning shape of the original decision-engine spec's §15
// Thesis Engine contract (supporting/contradicting evidence, unknowns) —
// folded into this question's guidance text and reflected in its
// rationale/caveats, rather than a second internal type, since the
// output schema stays uniform across all five questions (design doc §5.4).
import { INTENT_QUESTION_LABEL, INTENT_QUESTION_VALUES } from "@/domain/ai/enums";
import { extractJsonText } from "@/domain/ai/parse-json";
import { sanitizeIntentAssist } from "@/domain/ai/validation";
import { ALL_EVIDENCE_FIELD_REFS } from "@/types/ai-research";
import type { CompleteFn } from "@/domain/ai/complete-fn";
import type { AIIntentAssist, AIResearchContext, IntentAssistQuestion } from "@/types/ai-research";

export type IntentAssistResult = { status: "OK"; assist: AIIntentAssist } | { status: "UNAVAILABLE" };

const QUESTION_GUIDANCE: Record<IntentAssistQuestion, string> = {
  INVESTMENT_ROLE:
    "This question is about how large and permanent a role this stock should play in the user's OWN portfolio — a personal preference, not something the evidence alone can answer. Prefer 1-2 clarifying questions (e.g. about time horizon, or how this compares to their other holdings) over asserting a role. Any suggestion offered must be framed as a tentative starting point tied to observable portfolio facts (e.g. current weight), never as a confident recommendation.",
  CORE_PORTION:
    "This question is about how much of the CURRENT holding the user wants to treat as permanent/protected — also a personal preference. Prefer clarifying questions over an assertive suggestion. Any suggestion must be one of the three coarse buckets, framed as a starting point, never a precise calculation.",
  CONFIDENCE:
    "This question can genuinely be informed by evidence: consider evidence coverage, the fundamentals/momentum scores, and fundamentals model fit. A well-grounded suggestion is appropriate here when the evidence actually supports one.",
  CURRENT_INTENTION:
    "You may reference a live guardrail tension (a discrepancy) in the context if present, to help the user notice it — but never assert what the user wants to do. This is about the user's own plan, not a recommendation to act.",
  THESIS_TRAJECTORY:
    "This question can genuinely be informed by evidence. Reason explicitly about what in the evidence would SUPPORT the original thesis holding up, what would CONTRADICT or weaken it, and what remains genuinely unknown given missing evidence — then choose a suggested trajectory value consistent with that reasoning, and reflect the supporting/contradicting/unknown reasoning in your rationale.",
};

export function buildIntentAssistSystemPrompt(question: IntentAssistQuestion): string {
  return `You are helping a beginner investor answer one specific question in a stock Playbook questionnaire. You NEVER decide the answer for them and NEVER invent facts about the company. You may suggest options and ask clarifying questions; the user always makes the final choice themselves.

The question is: ${INTENT_QUESTION_LABEL[question]}
${QUESTION_GUIDANCE[question]}

Respond with ONLY a single JSON object, no prose outside it, matching exactly this shape:
{
  "suggestions": [{ "value": string, "rationale": string, "groundedIn": string[] }],
  "clarifyingQuestions": string[],
  "caveats": string[]
}

Rules:
- Each "value" MUST be exactly one of: ${INTENT_QUESTION_VALUES[question].join(", ")}. Never any other value, and never a "not sure"/"help me assess" style value — your job is to help resolve the deferral, not restate it.
- Offer 0-3 suggestions, not a single forced answer. It is fine to offer zero suggestions and lean entirely on clarifyingQuestions when the evidence genuinely can't inform this question.
- Every "groundedIn" entry must be exactly one of these values: ${ALL_EVIDENCE_FIELD_REFS.join(", ")}, or an empty array for a suggestion based on general reasoning rather than this company's specific evidence — in that case say so plainly in the rationale.
- Never state a fact about this specific company that is not grounded in the evidence provided in the context below.
- Do not set or imply a target allocation, ceiling, or share count — that is not your job here.`;
}

export function buildIntentAssistUserPrompt(context: AIResearchContext, question: IntentAssistQuestion): string {
  return `Instrument: ${context.instrument.name} (${context.instrument.ticker})\nQuestion to help with: ${INTENT_QUESTION_LABEL[question]}\n\nContext (JSON):\n${JSON.stringify(context, null, 2)}`;
}

export async function generateIntentAssist(
  context: AIResearchContext,
  question: IntentAssistQuestion,
  complete: CompleteFn,
  now: () => string = () => new Date().toISOString()
): Promise<IntentAssistResult> {
  const startedAt = Date.now();

  let response: { text: string; modelVersion: string };
  try {
    response = await complete(buildIntentAssistSystemPrompt(question), buildIntentAssistUserPrompt(context, question));
  } catch {
    return { status: "UNAVAILABLE" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonText(response.text));
  } catch {
    return { status: "UNAVAILABLE" };
  }

  const meta = { modelVersion: response.modelVersion, generatedAt: now(), latencyMs: Date.now() - startedAt };
  const assist = sanitizeIntentAssist(parsed, context, question, meta);
  if (!assist) return { status: "UNAVAILABLE" };
  return { status: "OK", assist };
}
