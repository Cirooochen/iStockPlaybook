import Link from "next/link";
import type { InstrumentIdentity, PortfolioSnapshot, StockPlaybookConfig } from "@/types/portfolio";
import { holdingWeightPct } from "@/domain/portfolio/snapshot";
import { deriveStockConcentrationView } from "@/domain/portfolio/stock-concentration-view";
import { ArrowRight } from "lucide-react";

interface Props {
  snapshot: PortfolioSnapshot;
  configs: StockPlaybookConfig[];
}

function displayLabel(instrument: InstrumentIdentity): string {
  return instrument.ticker ?? instrument.name;
}

export function ConcentrationOverview({ snapshot, configs }: Props) {
  const { holdings, valuation } = snapshot;

  if (valuation.state !== "COMPLETE") {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-5">
          Concentration
        </h2>
        <p className="text-sm text-stone-500">
          {valuation.state === "PARTIAL"
            ? "Concentration is unavailable — portfolio valuation is incomplete, so weights against the whole portfolio can't be shown."
            : "Concentration is unavailable — no holdings could be valued."}
        </p>
      </div>
    );
  }

  // COMPLETE guarantees every holding resolved a valueBase, so
  // holdingWeightPct is non-null for all of them here.
  const bars = holdings
    .map((holding) => ({
      holding,
      weightPct: holdingWeightPct(holding, valuation)!,
      view: deriveStockConcentrationView(
        holding,
        valuation,
        configs.find((c) => c.instrumentId === holding.instrument.id)
      ),
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const alerts = bars
    .filter((b) => b.view !== null && b.view.state !== "WITHIN_TARGET")
    .sort(
      (a, b) =>
        b.view!.weightPct - b.view!.targetMaxPct - (a.view!.weightPct - a.view!.targetMaxPct)
    );
  const worst = alerts[0];

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-5">
        Concentration
      </h2>

      <div className="space-y-3 mb-5">
        {bars.map(({ holding, weightPct, view }) => {
          const isAlert = view !== null && view.state !== "WITHIN_TARGET";
          return (
            <div key={holding.holdingId} className="flex items-center gap-3">
              <span className="text-sm text-stone-700 w-36 shrink-0">
                {displayLabel(holding.instrument)}
              </span>
              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-colors bar-grow-in ${
                    isAlert ? "bg-amber-400" : "bg-stone-300"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, weightPct))}%` }}
                />
              </div>
              <span
                className={`text-sm tabular-nums w-12 text-right font-medium ${
                  isAlert ? "text-amber-700" : "text-stone-600"
                }`}
              >
                {weightPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-stone-100">
        {worst ? (
          <>
            <p className="text-xs text-stone-500 max-w-sm">
              {displayLabel(worst.holding.instrument)} is{" "}
              <span className="text-amber-700 font-medium">
                {(worst.view!.weightPct - worst.view!.targetMaxPct).toFixed(1)} percentage points
              </span>{" "}
              above your medium-term target maximum of {worst.view!.targetMaxPct}%.
            </p>
            <Link
              href={`/stocks/${worst.holding.instrument.ticker}`}
              className="flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap"
            >
              Review {displayLabel(worst.holding.instrument)} Playbook
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        ) : (
          <p className="text-xs text-stone-500">
            All configured positions are within their target range.
          </p>
        )}
      </div>
    </div>
  );
}
