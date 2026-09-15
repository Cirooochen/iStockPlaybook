import type { HoldingSnapshot, PortfolioSnapshot, StockPlaybookConfig } from "@/types/portfolio";
import { holdingWeightPct } from "@/domain/portfolio/snapshot";
import { deriveStockConcentrationView } from "@/domain/portfolio/stock-concentration-view";

interface Props {
  snapshot: PortfolioSnapshot;
  configs: StockPlaybookConfig[];
}

export function PortfolioSummaryCards({ snapshot, configs }: Props) {
  const { holdings, valuation } = snapshot;

  // Weight is only ever authoritative when the whole portfolio is COMPLETE
  // (holdingWeightPct enforces this itself) — never derived from a partial
  // denominator.
  const weighted = holdings
    .map((holding) => ({ holding, weightPct: holdingWeightPct(holding, valuation) }))
    .filter(
      (x): x is { holding: HoldingSnapshot; weightPct: number } => x.weightPct !== null
    );

  const largest =
    weighted.length > 0
      ? weighted.reduce((prev, curr) => (curr.weightPct > prev.weightPct ? curr : prev))
      : null;

  const largestConfig = largest
    ? configs.find((c) => c.instrumentId === largest.holding.instrument.id)
    : undefined;
  const largestConcentrationView = largest
    ? deriveStockConcentrationView(largest.holding, valuation, largestConfig)
    : null;

  // Only STOCK holdings with a linked StockPlaybookConfig carry a target to
  // breach — CASH/ETF/CRYPTO/OTHER, and STOCK holdings with no config yet,
  // are portfolio-only and never counted here.
  const needsReview = configs.filter((config) => {
    const holding = holdings.find((h) => h.instrument.id === config.instrumentId);
    const view = holding ? deriveStockConcentrationView(holding, valuation, config) : null;
    return view !== null && view.state !== "WITHIN_TARGET";
  }).length;

  const cards = [
    {
      label: "Largest position",
      value: largest ? largest.holding.instrument.ticker ?? largest.holding.instrument.name : "—",
      sub: largest ? `${largest.weightPct.toFixed(1)}%` : "Unavailable",
      alert: largestConcentrationView !== null && largestConcentrationView.state !== "WITHIN_TARGET",
    },
    {
      label: "Positions",
      value: `${holdings.length}`,
      sub: "holdings tracked",
      alert: false,
    },
    {
      label: "Needs attention",
      value: valuation.state === "COMPLETE" ? `${needsReview}` : "—",
      sub:
        valuation.state === "COMPLETE"
          ? needsReview === 1
            ? "position flagged"
            : "positions flagged"
          : "valuation incomplete",
      alert: valuation.state === "COMPLETE" && needsReview > 0,
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
