// Live fundamentals orchestration — Phase E.8
// (docs/phase-e5-fundamentals-live-evidence-strategy.md §11, the exact
// signature proposed there). Composes the already-validated E.7A-E.7D
// pipeline (client -> ticker resolution -> mapper -> GROWTH_SOFTWARE_
// TEMPLATE -> scoreFundamentals) into one function, for use from a
// Next.js Server Component (never from a "use client" file — mirrors
// twelve-data/orchestration.ts's own D.2 precedent exactly: this keeps
// SEC_EDGAR_USER_AGENT server-only by construction, since nothing that
// imports this module ships to the browser). Calls only already-
// existing, unmodified exports — no SEC EDGAR adapter or Decision
// Engine logic is redesigned here.
//
// Never throws: every failure mode (missing requester identity, network
// error, an HTTP error, a ticker not found in SEC's list, a mapping
// error) is caught internally and logged server-side, resolving to
// `undefined` — the IDENTICAL "absent" path EngineInput.fundamentalsResult
// already has (Phase E.3/E.4). This is what makes "preserve existing
// fallback behavior" free: there is no new fallback logic here, only the
// already-tested one, reused. A SCORED/INSUFFICIENT_DATA
// FundamentalsScoreResult (partial evidence gaps left as per-component
// MISSING) is a legitimate, successful outcome of this function — never
// caught or altered here, only produced by the already-tested
// scoreFundamentals engine.
import { createSecEdgarClientConfigFromEnv, fetchCompanyFacts, fetchCompanyTickers } from "./client";
import { mapEdgarCompanyFacts } from "./mappers";
import { resolveCikForTicker } from "./ticker-resolver";
import { scoreFundamentals, type FundamentalsScoreResult } from "@/domain/signals/fundamentals-score";
import { GROWTH_SOFTWARE_TEMPLATE } from "@/domain/signals/fundamentals-templates/growth-software";

export async function fetchLiveFundamentalsResult(
  stockSymbol: string,
  checkedAt: string
): Promise<FundamentalsScoreResult | undefined> {
  try {
    const config = createSecEdgarClientConfigFromEnv();

    // Sequential, not Promise.all like momentum's four independent
    // fetches (twelve-data/orchestration.ts) — companyfacts genuinely
    // depends on the CIK resolved from the ticker-list fetch, not an
    // independent input.
    const tickersPayload = await fetchCompanyTickers(config);
    const cik = resolveCikForTicker(tickersPayload, stockSymbol);
    if (cik === null) {
      console.error(`[sec-edgar] live fundamentals fetch failed: ticker "${stockSymbol}" not found in SEC's company_tickers.json`);
      return undefined;
    }

    const companyFactsPayload = await fetchCompanyFacts(config, cik);
    const raw = mapEdgarCompanyFacts(companyFactsPayload, checkedAt);

    return scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, raw);
  } catch (err) {
    console.error("[sec-edgar] live fundamentals fetch failed, falling back to existing Scorecard behavior:", err);
    return undefined;
  }
}
