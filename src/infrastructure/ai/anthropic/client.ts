// Anthropic Messages API client — Phase H.5. Thin fetch wrapper, no SDK
// dependency (mirrors twelve-data/client.ts's own no-dependency choice for
// a single provider integration). Returns { text, modelVersion } on
// success; throws AnthropicNetworkError on any failure — callers
// (src/domain/ai/*.ts, via the injected CompleteFn) are responsible for
// catching this and degrading to UNAVAILABLE, never surfacing it to the
// user directly. One request per call, no retry, no substitution — same
// "do not silently retry or substitute data" convention as
// twelve-data/client.ts.
import { loadAnthropicApiKeyFromEnv } from "./env";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

export interface AnthropicClientConfig {
  apiKey: string;
  baseUrl?: string; // overridable for tests only — defaults to the real API
  model?: string;
}

export function createAnthropicClientConfigFromEnv(): AnthropicClientConfig {
  return { apiKey: loadAnthropicApiKeyFromEnv() };
}

export class AnthropicNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AnthropicNetworkError";
    if (cause !== undefined) this.cause = cause;
  }
}

function extractTextFromResponse(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const content = (body as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") return b.text;
  }
  return null;
}

export async function requestCompletion(
  config: AnthropicClientConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; modelVersion: string }> {
  const model = config.model ?? DEFAULT_MODEL;
  const url = new URL("/v1/messages", config.baseUrl ?? DEFAULT_BASE_URL).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    throw new AnthropicNetworkError("Anthropic request failed (network error)", err);
  }

  if (!response.ok) {
    throw new AnthropicNetworkError(`Anthropic request failed (HTTP ${response.status})`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new AnthropicNetworkError("Anthropic response was not valid JSON", err);
  }

  const text = extractTextFromResponse(body);
  if (text === null) {
    throw new AnthropicNetworkError("Anthropic response had no usable text content");
  }
  return { text, modelVersion: model };
}
