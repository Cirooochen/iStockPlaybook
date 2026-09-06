import Link from "next/link";
import type { StockSeed } from "@/types/playbook";
import { ChevronLeft, Clock, Plus } from "lucide-react";

interface Props {
  seed: StockSeed;
  onAddTransaction?: () => void;
}

export function StockHeader({ seed, onAddTransaction }: Props) {
  const { security, market } = seed;
  const dailySign = market.dailyChangePct >= 0 ? "+" : "";

  return (
    <div className="mb-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Portfolio
      </Link>

      <div className="flex items-start justify-between">
        {/* Left: company + price */}
        <div>
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-stone-900">
              {security.name}
            </h1>
            <span className="text-sm text-stone-400 font-mono">
              {security.ticker} · {security.exchange}
            </span>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-light text-stone-900 tabular-nums">
              €{market.executionPriceEur.toFixed(2)}
            </span>
            <span className="text-sm text-stone-500 tabular-nums">
              {dailySign}
              {market.dailyChangePct.toFixed(1)}% today
            </span>
          </div>

          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs text-stone-400">
              Primary market ${market.primaryPriceUsd.toFixed(2)}{" "}
              {security.marketCurrency}
            </span>
            <span className="text-stone-200">·</span>
            <div className="flex items-center gap-1 text-xs text-stone-400">
              <Clock className="w-3 h-3" />
              Market data updated today, 16:15
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onAddTransaction}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm text-stone-600 border border-stone-300 rounded-md hover:bg-stone-50 transition duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" />
            Transaction
          </button>
          <button className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm text-stone-600 border border-stone-300 rounded-md hover:bg-stone-50 transition duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]">
            <Plus className="w-3.5 h-3.5" />
            Research
          </button>
        </div>
      </div>
    </div>
  );
}
