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
import type { DataField } from "@/types/market-data";
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";

// Phase I.5 — closes the plumbing gap docs/phase-i-minimum-research-evidence.md
// identified: `mapEdgarCompanyFacts`'s own `RawFundamentalsData` (specifically
// its `periods`/`periodType`) used to be computed here and then discarded —
// only the scored result ever left this function, so nothing above this
// layer could derive FundamentalChangeEvidence (src/domain/signals/
// fundamental-change-evidence.ts), which deliberately reads raw periods
// directly, never FundamentalsScoreResult. This exposes exactly the
// minimum needed for that — `periods` and `periodType`, not the whole
// RawFundamentalsData (guidanceEvidence/reportingCurrency/sharesOutstanding
// have no Recent Changes use) — alongside the existing, unchanged
// FundamentalsScoreResult, from the SAME fetch — never a second SEC EDGAR
// round trip for the same data.
// Phase I.4A — additionally exposes `reportingCurrency`/
// `sharesOutstandingByAccession` from that SAME fetch, alongside
// `periods`/`periodType` above (same "expose the minimum needed, from the
// same fetch, never a second round trip" reasoning Phase I.5 already
// established) — the raw evidence a future Valuation Context checkpoint
// build needs (src/domain/signals/valuation-checkpoints.ts), on top of
// what FundamentalChangeEvidence already reads.
export interface FundamentalsFetchResult {
  scoreResult: FundamentalsScoreResult;
  periods: RawFundamentalsPeriod[];
  periodType: FundamentalsPeriodType;
  reportingCurrency: string | undefined;
  sharesOutstandingByAccession: Record<string, DataField<number>>;
}

// Phase I.3.1 — no `reportingCurrency` parameter (Phase I.1's own design
// here was wrong — see docs/phase-i-minimum-research-evidence.md §12/§13):
// mapEdgarCompanyFacts now discovers the filer's reporting currency
// itself, from its own target financial concepts. No caller of this
// function needs to know a currency in advance.
export async function fetchLiveFundamentalsResult(
  stockSymbol: string,
  checkedAt: string
): Promise<FundamentalsFetchResult | undefined> {
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

    return {
      scoreResult: scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, raw),
      periods: raw.periods,
      periodType: raw.periodType,
      reportingCurrency: raw.reportingCurrency,
      sharesOutstandingByAccession: raw.sharesOutstandingByAccession,
    };
  } catch (err) {
    console.error("[sec-edgar] live fundamentals fetch failed, falling back to existing Scorecard behavior:", err);
    return undefined;
  }
}
