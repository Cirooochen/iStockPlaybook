import type { Portfolio } from "@/types/playbook";
import { formatEur } from "@/lib/format";
import { Plus, Clock } from "lucide-react";

interface Props {
  portfolio: Portfolio;
}

export function PortfolioHeader({ portfolio }: Props) {
  const sign = portfolio.unrealizedReturnEur >= 0 ? "+" : "";

  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 mb-3">Portfolio</h1>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-light text-stone-900 tabular-nums">
            {formatEur(portfolio.totalValueEur)}
          </span>
          <span className="text-sm text-stone-500">Total value</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-stone-600">
            {sign}
            {formatEur(portfolio.unrealizedReturnEur)}
          </span>
          <span className="text-stone-300">·</span>
          <span className="text-sm text-stone-600">
            {sign}
            {portfolio.unrealizedReturnPct.toFixed(1)}% total unrealized return
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-stone-400">
          <Clock className="w-3 h-3" />
          Last updated today, 16:15
        </div>
      </div>
      <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-stone-700 border border-stone-300 rounded-md hover:bg-stone-50 transition-colors">
        <Plus className="w-4 h-4" />
        Add stock
      </button>
    </div>
  );
}
