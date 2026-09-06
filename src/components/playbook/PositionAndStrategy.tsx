import type { StockSeed } from "@/types/playbook";
import { ConcentrationMeter } from "./ConcentrationMeter";
import { formatEur, formatEurDecimals, formatPct } from "@/lib/format";

interface Props {
  seed: StockSeed;
}

export function PositionAndStrategy({ seed }: Props) {
  const { position, strategy } = seed;

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* Left: My Position */}
      <div className="bg-white rounded-lg border border-stone-200 p-6">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
          My position
        </p>

        <div className="mb-4">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">
              {position.shares.toLocaleString("de-DE")}
            </span>
            <span className="text-sm text-stone-500">shares</span>
          </div>
          <p className="text-sm text-stone-500">
            {formatEurDecimals(position.averageCostEur)} average cost
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-100">
          <div>
            <p className="text-xs text-stone-400 mb-1">Current value</p>
            <p className="text-base font-semibold text-stone-900 tabular-nums">
              {formatEur(position.valueEur)}
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Unrealized return</p>
            <p className="text-base font-semibold text-stone-600 tabular-nums">
              {formatPct(position.unrealizedReturnPct)}
            </p>
          </div>
        </div>
      </div>

      {/* Right: Portfolio Fit */}
      <div className="bg-white rounded-lg border border-stone-200 p-6">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
          Portfolio fit
        </p>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div>
            <p className="text-xs text-stone-400 mb-1">Current weight</p>
            <p className="text-lg font-bold text-amber-700 tabular-nums">
              {position.portfolioWeightPct.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Short-term target</p>
            <p className="text-lg font-semibold text-stone-700">
              &lt;{strategy.shortTermMaxWeightPct}%
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Medium-term target</p>
            <p className="text-lg font-semibold text-stone-700">
              {strategy.mediumTermTargetMinPct}–{strategy.mediumTermTargetMaxPct}%
            </p>
          </div>
        </div>

        <div className="mb-5">
          <ConcentrationMeter
            currentPct={position.portfolioWeightPct}
            targetMinPct={strategy.mediumTermTargetMinPct}
            targetMaxPct={strategy.mediumTermTargetMaxPct}
          />
        </div>

        <div className="pt-4 border-t border-stone-100 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-stone-400 mb-1">Long-term core</p>
            <p className="text-sm font-semibold text-stone-700">
              {strategy.coreSharesMin}–{strategy.coreSharesMax} shares
            </p>
          </div>
          <div>
            <p className="text-xs text-stone-400 mb-1">Tactical (available)</p>
            <p className="text-sm font-semibold text-stone-700">
              {strategy.tacticalSharesMin}–{strategy.tacticalSharesMax} shares
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
