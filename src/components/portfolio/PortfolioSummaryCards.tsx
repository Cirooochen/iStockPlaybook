import type { Portfolio } from "@/types/playbook";

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
          className={`bg-white rounded-xl px-6 py-5 border ${
            card.alert ? "border-amber-200" : "border-stone-200"
          }`}
        >
          <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-3">
            {card.label}
          </p>
          <p
            className={`text-3xl font-light tracking-tight tabular-nums ${
              card.alert ? "text-amber-600" : "text-stone-900"
            }`}
          >
            {card.value}
          </p>
          <p className={`text-xs mt-1.5 ${card.alert ? "text-amber-500" : "text-stone-400"}`}>
            {card.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
