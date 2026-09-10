// Twelve Data HTTP client — Phase C.8B. Fetches raw JSON only; returns
// `unknown` in every case, including a Twelve Data error body
// (`{code, message, status:"error"}`) — this module does NOT detect or
// throw on that shape itself (errors.ts/mappers.ts already own that
// detection, via `throwIfTwelveDataError`). This file only distinguishes
// failures it alone can see: the network call itself failing, or the
// response body not being valid JSON at all.
//
// One request per call, no retry, no substitution — "do not silently
// retry or substitute data." A caller that wants a retry policy
// implements it explicitly at a higher layer; this client never hides a
// transient failure behind a second attempt.
//
// No provider DTO leaks past this file either: every exported function
// returns `unknown` (the caller — mappers.ts — is responsible for
// interpreting it), never a typed Twelve Data shape re-exported for
// domain code to consume directly.
import { loadTwelveDataApiKeyFromEnv } from "./env";

const DEFAULT_BASE_URL = "https://api.twelvedata.com";

export interface TwelveDataClientConfig {
  apiKey: string;
  baseUrl?: string; // overridable for tests only — defaults to the real API
}

export function createTwelveDataClientConfigFromEnv(): TwelveDataClientConfig {
  return { apiKey: loadTwelveDataApiKeyFromEnv() };
}

export class TwelveDataNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TwelveDataNetworkError";
    if (cause !== undefined) this.cause = cause;
  }
}

function buildUrl(config: TwelveDataClientConfig, path: string, params: Record<string, string>): string {
  const url = new URL(path, config.baseUrl ?? DEFAULT_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", config.apiKey);
  return url.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new TwelveDataNetworkError(`Twelve Data request failed (network error): ${redactApiKey(url)}`, err);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new TwelveDataNetworkError(
      `Twelve Data response was not valid JSON (HTTP ${response.status}): ${redactApiKey(url)}`,
      err
    );
  }
}

// Never let the API key reach a log line or error message, even
// indirectly via a URL embedded in a thrown error's text.
function redactApiKey(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("apikey")) {
      parsed.searchParams.set("apikey", "***");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function fetchQuote(config: TwelveDataClientConfig, symbol: string): Promise<unknown> {
  return fetchJson(buildUrl(config, "/quote", { symbol }));
}

// Always requests ascending, oldest-first bars explicitly (`order=asc`)
// — "do not rely on Twelve Data's default newest-first ordering." The
// mapper (mapTimeSeriesResponse) additionally re-sorts defensively, so
// this is belt-and-suspenders, not the only safeguard.
export async function fetchDailyTimeSeries(
  config: TwelveDataClientConfig,
  symbol: string,
  outputsize: number
): Promise<unknown> {
  return fetchJson(
    buildUrl(config, "/time_series", {
      symbol,
      interval: "1day",
      outputsize: String(outputsize),
      order: "asc",
    })
  );
}

export async function fetchExchangeRate(config: TwelveDataClientConfig, pair: string): Promise<unknown> {
  return fetchJson(buildUrl(config, "/exchange_rate", { symbol: pair }));
}
