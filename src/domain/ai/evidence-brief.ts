// Evidence Brief generation — Phase H.5 (design doc §4). Pure domain
// orchestration: no network import, no React — `complete` is injected
// (src/domain/ai/complete-fn.ts) so this file never imports
// src/infrastructure/. The real HTTP call is wired at the infra layer
// (src/infrastructure/ai/anthropic/orchestration.ts).
//
// Never throws: any failure in `complete`, a non-JSON response, or a
// response that fails grounding validation (validation.ts) all resolve to
// { status: "UNAVAILABLE" } — the identical fail-soft contract
// fetchLiveMomentumResult/fetchLiveFundamentalsResult already establish
// for the deterministic evidence pipeline. Confirm Playbook has no
// precondition on this succeeding (design doc §7).
import { extractJsonText } from "@/domain/ai/parse-json";
import { sanitizeEvidenceBrief } from "@/domain/ai/validation";
import { ALL_EVIDENCE_FIELD_REFS } from "@/types/ai-research";
import type { CompleteFn } from "@/domain/ai/complete-fn";
import type { AIEvidenceBrief, AIResearchContext } from "@/types/ai-research";

export type EvidenceBriefResult = { status: "OK"; brief: AIEvidenceBrief } | { status: "UNAVAILABLE" };

export const EVIDENCE_BRIEF_SYSTEM_PROMPT = `You are an evidence interpreter inside a personal stock investing tool for beginners. You NEVER decide what the user should do, NEVER invent facts, and NEVER state a company-specific claim that is not grounded in the evidence given to you below.

Respond with ONLY a single JSON object, no prose outside it, matching exactly this shape:
{
  "summary": string (2-4 plain-language sentences),
  "strengths": [{ "text": string, "groundedIn": string[] }],
  "uncertainties": [{ "text": string, "groundedIn": string[] }]
}

Rules:
- Every "groundedIn" entry must be exactly one of these values: ${ALL_EVIDENCE_FIELD_REFS.join(", ")}. Use an empty array only for a clearly general, non-company-specific point.
- A "strengths" point must cite evidence that is actually scored/available in the context — never cite missing, insufficient, or unknown-fit evidence as a strength.
- If evidence is missing, insufficient, or has unknown model fit, put that in "uncertainties" instead, citing the relevant field, and explain plainly what its absence means for how much to trust the picture.
- Put genuine counterpoints or risks in "uncertainties" too, even where the evidence looks positive — this is meant to help a beginner see what could go wrong, not just what looks good.
- Never state a fact about this specific company that is not grounded in the evidence provided below. General, clearly-labeled industry reasoning is fine with an empty groundedIn array, but never disguise it as a specific fact about this company.
- Do not recommend an action, a stance, or a target allocation. That is not your job here.`;

export function buildEvidenceBriefUserPrompt(context: AIResearchContext): string {
  return `Instrument: ${context.instrument.name} (${context.instrument.ticker})\n\nContext (JSON):\n${JSON.stringify(context, null, 2)}`;
}

export async function generateEvidenceBrief(
  context: AIResearchContext,
  complete: CompleteFn,
  now: () => string = () => new Date().toISOString()
): Promise<EvidenceBriefResult> {
  const startedAt = Date.now();

  let response: { text: string; modelVersion: string };
  try {
    response = await complete(EVIDENCE_BRIEF_SYSTEM_PROMPT, buildEvidenceBriefUserPrompt(context));
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
  const brief = sanitizeEvidenceBrief(parsed, context, meta);
  if (!brief) return { status: "UNAVAILABLE" };
  return { status: "OK", brief };
}
