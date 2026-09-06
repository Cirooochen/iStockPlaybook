import { notFound } from "next/navigation";
import {
  unitySeed,
  unityActionZones,
  unityScorecard,
  unityTimeline,
} from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import { PlaybookClientShell } from "@/components/playbook/PlaybookClientShell";

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  if (ticker !== "U") {
    notFound();
  }

  return (
    <PlaybookClientShell
      seed={unitySeed}
      initialZones={unityActionZones}
      initialScorecard={unityScorecard}
      initialTimeline={unityTimeline}
      initialPortfolioTotalEur={portfolioSeed.totalValueEur}
    />
  );
}
