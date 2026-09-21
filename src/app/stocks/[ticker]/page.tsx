import { StockDetailClientShell } from "@/components/playbook/StockDetailClientShell";
import { fetchStockPageLiveData } from "@/infrastructure/market-data/stock-page-orchestration";

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  // Phase H.4 — whether this ticker has a holding, and whether that
  // holding has a Playbook config, is live, client-side state
  // (usePortfolioState, localStorage) that a Server Component cannot see
  // — StockDetailClientShell resolves both by ticker itself and renders
  // the right state (Hero Stack / No Playbook / Playbook unavailable /
  // not found). This route never 404s on a missing config.
  //
  // v0.1 real-data cleanup — this used to also resolve a static seed
  // holding/config by ticker string match, for a momentum benchmark ID,
  // a display-name fallback, and a legacy secondary-market price line.
  // Removed: a Server Component genuinely cannot see the user's real
  // localStorage holdings, so that lookup could only ever resolve
  // against the hardcoded seed — a real user's own "U" holding would
  // never match it (onboarded holdings get a random instrument id, not
  // the literal ticker), while the seed's fake "U" always would. No
  // client-readable per-user benchmark config exists to replace it with;
  // every stock's momentum now honestly has no benchmark (relative
  // strength: NOT_APPLICABLE) unless a future phase wires one from real,
  // client-visible config. `fallbackName` is simply the ticker now — the
  // Stock Detail page's own live holding data supplies the real display
  // name once resolved client-side.
  const checkedAt = new Date().toISOString();
  // Phase I.3 found a real Phase I.1 mistake here (docs/phase-i-minimum-
  // research-evidence.md §12): this used to pass
  // `seedHolding?.instrument.nativeCurrency` as a reporting-currency
  // argument, but that field is the PORTFOLIO's own cost-basis/tracking
  // currency (e.g. a European user's EUR-denominated holding record for
  // a US stock), not the company's SEC reporting currency — Unity proves
  // these differ (its holding is tracked in EUR while Unity itself
  // reports to the SEC in USD). Phase I.3.1 (§13) removed the whole
  // notion of a caller-supplied reporting currency: fetchLiveFundamentalsResult
  // no longer takes one at all — mapEdgarCompanyFacts now discovers each
  // filer's real reporting currency itself, from its own target financial
  // concepts, correctly handling both Unity (USD) and ASML (EUR) without
  // this call site knowing anything about currency.
  // v0.1 stabilization — a single consolidated fetch (Momentum +
  // Fundamentals + Valuation used to be three independent calls here,
  // duplicating both the SEC EDGAR fundamentals fetch and the Twelve Data
  // quote/price-series fetch; live-confirmed to trip Twelve Data's
  // free-tier per-minute credit cap on a single page load). See
  // stock-page-orchestration.ts for the consolidation itself — nothing
  // about what each result MEANS changed, only how many network calls
  // produce them.
  const { momentumResult: initialMomentumResult, fundamentalsFetch, evRevenueCheckpoints: initialEvRevenueCheckpoints } =
    await fetchStockPageLiveData(ticker, undefined, checkedAt);
  // Phase I.5 — fetchLiveFundamentalsResult now returns the scored result
  // alongside the raw periods/periodType from the SAME fetch (the
  // plumbing gap docs/phase-i-minimum-research-evidence.md §13/§14
  // identified: RawFundamentalsData used to be discarded after scoring).
  // `initialFundamentalsResult` is unpacked to the exact same
  // FundamentalsScoreResult shape every existing consumer already expects
  // (decision engine, SignalScorecard, Business Trajectory) — nothing
  // downstream of that prop changes. periods/periodType are new,
  // additional props consumed only by PlaybookClientShell's Recent
  // Changes card.
  const initialFundamentalsResult = fundamentalsFetch?.scoreResult;
  const initialFundamentalsPeriods = fundamentalsFetch?.periods;
  const initialFundamentalsPeriodType = fundamentalsFetch?.periodType;

  return (
    <StockDetailClientShell
      ticker={ticker}
      fallbackName={ticker}
      initialMomentumResult={initialMomentumResult}
      initialFundamentalsResult={initialFundamentalsResult}
      initialFundamentalsPeriods={initialFundamentalsPeriods}
      initialFundamentalsPeriodType={initialFundamentalsPeriodType}
      initialEvRevenueCheckpoints={initialEvRevenueCheckpoints}
    />
  );
}
