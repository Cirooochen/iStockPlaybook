import { notFound } from "next/navigation";
import {
  unitySeed,
  unityActionZones,
  unityScorecard,
  unityTimeline,
} from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import { PlaybookClientShell } from "@/components/playbook/PlaybookClientShell";
import { fetchLiveMomentumResult } from "@/infrastructure/market-data/twelve-data/orchestration";
import { fetchLiveFundamentalsResult } from "@/infrastructure/market-data/sec-edgar/orchestration";

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  if (ticker !== "U") {
    notFound();
  }

  // Server-only (this file has no "use client" directive — see
  // docs/phase-d2-live-momentum-engine-orchestration-design.md §1):
  // TWELVE_DATA_API_KEY/SEC_EDGAR_USER_AGENT never reach
  // PlaybookClientShell's browser bundle. Neither call ever throws —
  // each resolves to undefined on any failure, which
  // PlaybookClientShell/runDecisionEngine already treat identically to
  // "no live data available" (Phase D.0/D.1's existing fallback,
  // extended to Fundamentals by Phase E.3/E.4/E.8).
  const checkedAt = new Date().toISOString();
  const [initialMomentumResult, initialFundamentalsResult] = await Promise.all([
    fetchLiveMomentumResult(unitySeed.security.ticker, unitySeed.strategy.benchmarkInstrumentId, checkedAt),
    fetchLiveFundamentalsResult(unitySeed.security.ticker, checkedAt),
  ]);

  return (
    <PlaybookClientShell
      seed={unitySeed}
      initialZones={unityActionZones}
      initialScorecard={unityScorecard}
      initialTimeline={unityTimeline}
      initialPortfolioTotalEur={portfolioSeed.totalValueEur}
      initialMomentumResult={initialMomentumResult}
      initialFundamentalsResult={initialFundamentalsResult}
    />
  );
}
