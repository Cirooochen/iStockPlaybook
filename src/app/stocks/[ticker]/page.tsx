import { unitySeed } from "@/data/unity-seed";
import { holdingsSeed } from "@/data/holdings-seed";
import { stockPlaybookConfigsSeed } from "@/data/stock-playbook-seed";
import { StockDetailClientShell } from "@/components/playbook/StockDetailClientShell";
import { fetchLiveMomentumResult } from "@/infrastructure/market-data/twelve-data/orchestration";
import { fetchLiveFundamentalsResult } from "@/infrastructure/market-data/sec-edgar/orchestration";

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  // Phase H.4 — whether this ticker has a holding, and whether that
  // holding has a Playbook config, is now live, client-side state
  // (usePortfolioState, localStorage) that a Server Component cannot see
  // — StockDetailClientShell resolves both by ticker itself and renders
  // the right state (Hero Stack / No Playbook / Playbook unavailable /
  // not found). This route no longer 404s on a missing config.
  //
  // The static seed lookup below is used to recover Unity's existing
  // benchmark for the live momentum fetch (a config-dependent value the
  // server genuinely cannot get any other way), a display-name fallback,
  // and (Phase H.6 hardening) as the "is this Unity" signal for
  // legacyMarketColor below — stockPlaybookConfigsSeed contains only
  // Unity's config, so staticConfig is defined if and only if this is
  // Unity. Never used to gate whether this page renders.
  const seedHolding = holdingsSeed.find((h) => h.instrument.ticker === ticker);
  const staticConfig = seedHolding
    ? stockPlaybookConfigsSeed.find((c) => c.instrumentId === seedHolding.instrument.id)
    : undefined;

  // Server-only (this file has no "use client" directive — see
  // docs/phase-d2-live-momentum-engine-orchestration-design.md §1):
  // TWELVE_DATA_API_KEY/SEC_EDGAR_USER_AGENT never reach
  // PlaybookClientShell's browser bundle. Neither call ever throws —
  // each resolves to undefined on any failure, which
  // PlaybookClientShell/runDecisionEngine already treat identically to
  // "no live data available" (Phase D.0/D.1's existing fallback,
  // extended to Fundamentals by Phase E.3/E.4/E.8). Fetched for every
  // ticker, not just configured ones, so a newly onboarded stock's
  // Analyze/Review step (H.3) has real evidence to show, not just its
  // eventual confirmed Playbook page.
  const checkedAt = new Date().toISOString();
  const [initialMomentumResult, initialFundamentalsResult] = await Promise.all([
    fetchLiveMomentumResult(ticker, staticConfig?.strategy.benchmarkInstrumentId, checkedAt),
    fetchLiveFundamentalsResult(ticker, checkedAt),
  ]);

  return (
    <StockDetailClientShell
      ticker={ticker}
      fallbackName={seedHolding?.instrument.name ?? ticker}
      // Phase H.6 hardening — only Unity has real seed data for this
      // (see StockDetailClientShell's Props comment); every other stock
      // gets undefined, and StockHeader omits the line rather than
      // fabricating one.
      legacyMarketColor={
        staticConfig &&
        unitySeed.market.primaryPriceUsd !== undefined &&
        unitySeed.market.dailyChangePct !== undefined &&
        unitySeed.security.marketCurrency !== undefined
          ? {
              primaryPriceUsd: unitySeed.market.primaryPriceUsd,
              marketCurrency: unitySeed.security.marketCurrency,
              dailyChangePct: unitySeed.market.dailyChangePct,
            }
          : undefined
      }
      initialMomentumResult={initialMomentumResult}
      initialFundamentalsResult={initialFundamentalsResult}
    />
  );
}
