// Twelve Data credential loading — Phase C.8B. Isolated from domain code
// by construction: nothing under src/domain/ imports from
// src/infrastructure/ (see mappers.ts's top-of-file note), and this is
// the ONLY file in this codebase that reads TWELVE_DATA_API_KEY.
//
// The key is never hardcoded, never has a default, and is never logged —
// callers receive it as a plain string to pass to the client and are
// responsible for not printing it (see scripts/validate-live-market-data.ts).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Minimal, dependency-free .env.local loader — mirrors Next.js's own
// convention (this project's .gitignore already excludes `.env*`, so
// .env.local is never committed) without adding a dotenv dependency for
// one developer-only script. Never overwrites a variable already present
// in process.env — an explicit shell/CI-provided value always wins over
// the file.
export function loadDotEnvLocalIfPresent(rootDir: string = process.cwd()): void {
  const envPath = path.join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key !== "" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadTwelveDataApiKeyFromEnv(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (key === undefined || key.trim() === "") {
    throw new Error(
      "TWELVE_DATA_API_KEY is not set. Add it to .env.local (see .env.local.example — never commit the real key) " +
        "before running live market-data validation."
    );
  }
  return key;
}
