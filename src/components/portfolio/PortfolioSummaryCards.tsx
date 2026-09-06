import type { Portfolio } from "@/types/playbook";
import { AlertTriangle } from "lucide-react";

interface Props {
  portfolio: Portfolio;
}

export function PortfolioSummaryCards({ portfolio }: Props) {
  const largest = portfolio.holdings.reduce((prev, curr) =>
    curr.position.portfolioWeightPct > prev.position.portfolioWeightPct
      ? curr
      : prev
  );

  const needsReview = portfolio.holdings.filter(
    (h) => h.attentionState === "ACTION" || h.attentionState === "WATCH"
  ).length;

  const cards = [
    {
      label: "Largest position",
      value: largest.security.ticker,
      sub: `${largest.position.portfolioWeightPct.toFixed(1)}%`,
      alert: largest.position.portfolioWeightPct > 45,
    },
    {
      label: "Positions",
      value: `${portfolio.holdings.length}`,
      sub: "holdings tracked",
      alert: false,
    },
    {
      label: "Needs attention",
      value: `${needsReview}`,
      sub: needsReview === 1 ? "position flagged" : "positions flagged",
      alert: needsReview > 0,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-white rounded-lg border border-stone-200 px-5 py-4"
        >
          <p className="text-xs text-stone-400 uppercase tracking-wide mb-2">
            {card.label}
          </p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold text-stone-900">
              {card.value}
            </span>
            {card.alert && (
              <AlertTriangle className="w-4 h-4 text-amber-500 mb-0.5" />
            )}
          </div>
          <p className="text-xs text-stone-400 mt-0.5">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
