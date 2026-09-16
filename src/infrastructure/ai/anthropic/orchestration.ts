// AI orchestration — Phase H.5. Composes the Anthropic client with the
// pure domain generate functions (src/domain/ai/evidence-brief.ts,
// intent-assist.ts) via dependency injection — mirrors
// twelve-data/orchestration.ts's own shape exactly. Never throws: any
// failure (missing ANTHROPIC_API_KEY, network error, malformed/ungrounded
// AI output) resolves to { status: "UNAVAILABLE" }, the identical
// fail-soft contract every other live-evidence fetch in this codebase
// already uses (fetchLiveMomentumResult/fetchLiveFundamentalsResult).
import { createAnthropicClientConfigFromEnv, requestCompletion } from "./client";
import { generateEvidenceBrief } from "@/domain/ai/evidence-brief";
import { generateIntentAssist } from "@/domain/ai/intent-assist";
import type { EvidenceBriefResult } from "@/domain/ai/evidence-brief";
import type { IntentAssistResult } from "@/domain/ai/intent-assist";
import type { AIResearchContext, IntentAssistQuestion } from "@/types/ai-research";

export async function fetchEvidenceBrief(context: AIResearchContext): Promise<EvidenceBriefResult> {
  try {
    const config = createAnthropicClientConfigFromEnv();
    return await generateEvidenceBrief(context, (system, user) => requestCompletion(config, system, user));
  } catch (err) {
    console.error("[ai] evidence brief unavailable:", err);
    return { status: "UNAVAILABLE" };
  }
}

export async function fetchIntentAssist(
  context: AIResearchContext,
  question: IntentAssistQuestion
): Promise<IntentAssistResult> {
  try {
    const config = createAnthropicClientConfigFromEnv();
    return await generateIntentAssist(context, question, (system, user) => requestCompletion(config, system, user));
  } catch (err) {
    console.error("[ai] intent assist unavailable:", err);
    return { status: "UNAVAILABLE" };
  }
}
