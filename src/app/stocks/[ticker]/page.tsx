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

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  if (ticker !== "U") {
    notFound();
  }

  // Server-only (this file has no "use client" directive — see
  // docs/phase-d2-live-momentum-engine-orchestration-design.md §1):
  // TWELVE_DATA_API_KEY never reaches PlaybookClientShell's browser
  // bundle. Never throws — resolves to undefined on any failure, which
  // PlaybookClientShell/runDecisionEngine already treat identically to
  // "no live data available" (Phase D.0/D.1's existing fallback).
  const initialMomentumResult = await fetchLiveMomentumResult(
    unitySeed.security.ticker,
    unitySeed.strategy.benchmarkInstrumentId,
    new Date().toISOString()
  );

  return (
    <PlaybookClientShell
      seed={unitySeed}
      initialZones={unityActionZones}
      initialScorecard={unityScorecard}
      initialTimeline={unityTimeline}
      initialPortfolioTotalEur={portfolioSeed.totalValueEur}
      initialMomentumResult={initialMomentumResult}
    />
  );
}
