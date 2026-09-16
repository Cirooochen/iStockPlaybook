// The injected AI-provider call — Phase H.5. src/domain/ai/*.ts never
// imports src/infrastructure/ (same rule twelve-data/mappers.ts documents
// for market data: "src/domain/ ... has never imported from
// src/infrastructure/ and never will"), so evidence-brief.ts and
// intent-assist.ts receive the actual HTTP call as a parameter instead —
// the real implementation is wired at src/infrastructure/ai/anthropic/
// orchestration.ts. This is also what makes both files testable with a
// mock completion, no network, no API key.
export type CompleteFn = (systemPrompt: string, userPrompt: string) => Promise<{ text: string; modelVersion: string }>;
