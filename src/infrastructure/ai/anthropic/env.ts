// Anthropic credential loading — Phase H.5. Isolated from domain code by
// construction: nothing under src/domain/ imports from src/infrastructure/
// (see twelve-data/env.ts's own note, which established this rule first),
// and this is the ONLY file in this codebase that reads ANTHROPIC_API_KEY.
// Never hardcoded, never defaulted, never logged.
export function loadAnthropicApiKeyFromEnv(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key === undefined || key.trim() === "") {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.local.example) to enable AI-assisted " +
        "research. The onboarding flow works fully without it — Evidence Brief/Intent Assist simply degrade " +
        "to their 'unavailable' state (design doc §7); nothing in the deterministic flow depends on this key."
    );
  }
  return key;
}
