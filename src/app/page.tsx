import { portfolioSeed } from "@/data/portfolio-seed";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { PortfolioSummaryCards } from "@/components/portfolio/PortfolioSummaryCards";
import { ConcentrationOverview } from "@/components/portfolio/ConcentrationOverview";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";

export default function PortfolioPage() {
  return (
    <div>
      <PortfolioHeader portfolio={portfolioSeed} />
      <PortfolioSummaryCards portfolio={portfolioSeed} />
      <ConcentrationOverview portfolio={portfolioSeed} />
      <HoldingsTable portfolio={portfolioSeed} />
    </div>
  );
}
