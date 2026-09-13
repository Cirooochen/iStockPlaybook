// SEC EDGAR HTTP client — Phase E.7B. Fetches raw JSON only; returns
// `unknown` in every case — mirrors twelve-data/client.ts's thin-fetch
// convention exactly: one request per call, no retry, no substitution,
// no provider DTO leaking past this file (the caller — mappers.ts /
// ticker-resolver.ts — interprets the `unknown` payload).
//
// No API key. Every request carries a `User-Agent` identifying the
// requester, per SEC's fair-access policy (env.ts) — the only
// credential-like value this provider needs.
import { loadSecEdgarUserAgentFromEnv } from "./env";
import { SecEdgarHttpError, SecEdgarNetworkError } from "./errors";

const DEFAULT_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DEFAULT_COMPANY_FACTS_BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts";

export interface SecEdgarClientConfig {
  userAgent: string;
  tickersUrl?: string; // overridable for tests only — defaults to the real endpoint
  companyFactsBaseUrl?: string; // overridable for tests only — defaults to the real endpoint
}

export function createSecEdgarClientConfigFromEnv(): SecEdgarClientConfig {
  return { userAgent: loadSecEdgarUserAgentFromEnv() };
}

async function fetchJson(url: string, userAgent: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  } catch (err) {
    throw new SecEdgarNetworkError(`SEC EDGAR request failed (network error): ${url}`, err);
  }

  if (!response.ok) {
    throw new SecEdgarHttpError(response.status, url);
  }

  try {
    return await response.json();
  } catch (err) {
    throw new SecEdgarNetworkError(`SEC EDGAR response was not valid JSON (HTTP ${response.status}): ${url}`, err);
  }
}

// GET https://www.sec.gov/files/company_tickers.json — the bulk,
// free, exact ticker->CIK mapping (design doc §1/§0.1). Meant to be
// fetched once per process and cached by the caller (~1-2MB, updated
// periodically by SEC, not per-instrument) — this function itself does
// no caching, matching every other client function's "one request per
// call" convention.
export async function fetchCompanyTickers(config: SecEdgarClientConfig): Promise<unknown> {
  return fetchJson(config.tickersUrl ?? DEFAULT_TICKERS_URL, config.userAgent);
}

// GET https://data.sec.gov/api/xbrl/companyfacts/CIK{10-digit}.json —
// every XBRL concept SEC has for this filer, in one call (design doc
// §2). `cik` must already be the zero-padded 10-digit string (e.g.
// "0001810806") — see ticker-resolver.ts's resolveCikForTicker, which
// returns exactly that form.
export async function fetchCompanyFacts(config: SecEdgarClientConfig, cik: string): Promise<unknown> {
  const base = config.companyFactsBaseUrl ?? DEFAULT_COMPANY_FACTS_BASE_URL;
  return fetchJson(`${base}/CIK${cik}.json`, config.userAgent);
}
