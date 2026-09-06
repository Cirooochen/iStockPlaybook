import { notFound } from "next/navigation";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { StockHeader } from "@/components/playbook/StockHeader";
import { PlaybookStatusBanner } from "@/components/playbook/PlaybookStatusBanner";
import { PositionAndStrategy } from "@/components/playbook/PositionAndStrategy";
import { ActionZoneSection } from "@/components/playbook/ActionZoneSection";
import { WhyThisStance } from "@/components/playbook/WhyThisStance";
import { SignalScorecard } from "@/components/playbook/SignalScorecard";
import { ThesisCard } from "@/components/playbook/ThesisCard";
import { WhatChangesMyView } from "@/components/playbook/WhatChangesMyView";
import { ResearchPreview } from "@/components/playbook/ResearchPreview";
import { TimelinePreview } from "@/components/playbook/TimelinePreview";

export default async function StockPlaybookPage({
  params,
}: PageProps<"/stocks/[ticker]">) {
  const { ticker } = await params;

  if (ticker !== "U") {
    notFound();
  }

  return (
    <div>
      <StockHeader seed={unitySeed} />
      <PlaybookStatusBanner seed={unitySeed} />
      <PositionAndStrategy seed={unitySeed} />
      <ActionZoneSection zones={unityActionZones} />
      <WhyThisStance />
      <SignalScorecard scorecard={unityScorecard} />
      <ThesisCard />
      <WhatChangesMyView />
      <ResearchPreview />
      <TimelinePreview />
    </div>
  );
}
