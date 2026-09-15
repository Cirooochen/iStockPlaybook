import type { PortfolioSnapshot } from "@/types/portfolio";
import { formatEur } from "@/lib/format";
import { Plus, Clock } from "lucide-react";

interface Props {
  snapshot: PortfolioSnapshot;
  onAddHolding: () => void;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PortfolioHeader({ snapshot, onAddHolding }: Props) {
  const { valuation } = snapshot;

  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 mb-3">Portfolio</h1>

        {valuation.state === "COMPLETE" && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-light text-stone-900 tabular-nums">
                {formatEur(valuation.totalValueBase)}
              </span>
              <span className="text-sm text-stone-500">Total value</span>
            </div>
            {valuation.totalUnrealizedPnlBase.status === "AVAILABLE" &&
              valuation.totalUnrealizedReturnPct.status === "AVAILABLE" && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-stone-600">
                    {valuation.totalUnrealizedPnlBase.value >= 0 ? "+" : ""}
                    {formatEur(valuation.totalUnrealizedPnlBase.value)}
                  </span>
                  <span className="text-stone-300">·</span>
                  <span className="text-sm text-stone-600">
                    {valuation.totalUnrealizedReturnPct.value >= 0 ? "+" : ""}
                    {valuation.totalUnrealizedReturnPct.value.toFixed(1)}% total unrealized return
                  </span>
                </div>
              )}
          </>
        )}

        {valuation.state === "PARTIAL" && (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-light text-stone-900 tabular-nums">
                {formatEur(valuation.knownValueBase)}
              </span>
              <span className="text-sm text-amber-700">Known value (incomplete)</span>
            </div>
            <p className="text-xs text-amber-600 mt-1">
              {valuation.excludedHoldingIds.length}{" "}
              {valuation.excludedHoldingIds.length === 1 ? "holding" : "holdings"} could not be
              valued — this is not the full portfolio total.
            </p>
          </div>
        )}

        {valuation.state === "UNAVAILABLE" && (
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-light text-stone-400">—</span>
            <span className="text-sm text-stone-500">Portfolio value unavailable</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-2 text-xs text-stone-400">
          <Clock className="w-3 h-3" />
          Last updated {formatUpdatedAt(snapshot.asOf)}
        </div>
      </div>
      <button
        onClick={onAddHolding}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]"
      >
        <Plus className="w-4 h-4" />
        Add holding
      </button>
    </div>
  );
}
