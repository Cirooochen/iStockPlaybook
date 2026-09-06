import Link from "next/link";
import type { Portfolio, PortfolioHolding } from "@/types/playbook";
import { StanceBadge } from "@/components/shared/StanceBadge";
import { formatEur, formatPct } from "@/lib/format";
import { ChevronRight } from "lucide-react";

interface Props {
  portfolio: Portfolio;
}

const attentionBadge: Record<
  PortfolioHolding["attentionState"],
  { label: string; className: string }
> = {
  ACTION: {
    label: "ACTION",
    className: "bg-amber-100 text-amber-800",
  },
  WATCH: {
    label: "WATCH",
    className: "bg-stone-100 text-stone-600",
  },
  STABLE: {
    label: "STABLE",
    className: "bg-stone-50 text-stone-400",
  },
  UPDATE_NEEDED: {
    label: "UPDATE",
    className: "bg-blue-50 text-blue-700",
  },
};

export function HoldingsTable({ portfolio }: Props) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-100">
        <h2 className="text-sm font-semibold text-stone-700">Holdings</h2>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-stone-100">
            <th className="text-left px-6 py-3 text-xs font-medium text-stone-400 uppercase tracking-wide">
              Stock
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-stone-400 uppercase tracking-wide">
              Price
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-stone-400 uppercase tracking-wide">
              Return
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-stone-400 uppercase tracking-wide">
              Weight
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-stone-400 uppercase tracking-wide">
              Playbook
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {portfolio.holdings.map((holding) => {
            const isClickable = holding.security.ticker === "U";

            return (
              <tr
                key={holding.security.ticker}
                className={`border-b border-stone-50 last:border-0 ${
                  isClickable
                    ? "hover:bg-stone-50 cursor-pointer transition-colors"
                    : ""
                }`}
              >
                {/* Stock */}
                <td className="px-6 py-4">
                  {isClickable ? (
                    <Link
                      href={`/stocks/${holding.security.ticker}`}
                      className="block"
                    >
                      <p className="text-sm font-medium text-stone-900">
                        {holding.security.name.split(" ").slice(0, 2).join(" ")}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {holding.security.ticker} · {holding.security.exchange}
                      </p>
                    </Link>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {holding.security.ticker === "—"
                          ? holding.security.name
                          : holding.security.name.split(" ").slice(0, 2).join(" ")}
                      </p>
                      {holding.security.ticker !== "—" && (
                        <p className="text-xs text-stone-400 mt-0.5">
                          {holding.security.ticker} · {holding.security.exchange}
                        </p>
                      )}
                    </div>
                  )}
                </td>

                {/* Price */}
                <td className="px-4 py-4 text-right">
                  {holding.market.executionPriceEur > 0 ? (
                    <>
                      <p className="text-sm text-stone-700 tabular-nums">
                        {formatEur(holding.market.executionPriceEur)}
                      </p>
                      <p
                        className={`text-xs tabular-nums ${
                          holding.market.dailyChangePct >= 0
                            ? "text-stone-500"
                            : "text-stone-500"
                        }`}
                      >
                        {holding.market.dailyChangePct >= 0 ? "+" : ""}
                        {holding.market.dailyChangePct.toFixed(1)}% today
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-stone-300">—</span>
                  )}
                </td>

                {/* Return */}
                <td className="px-4 py-4 text-right">
                  {holding.position.unrealizedReturnPct !== 0 ? (
                    <>
                      <p className="text-sm text-stone-700 tabular-nums">
                        {formatEur(holding.position.valueEur)}
                      </p>
                      <p className="text-xs text-stone-500 tabular-nums">
                        {formatPct(holding.position.unrealizedReturnPct)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-stone-700 tabular-nums">
                      {formatEur(holding.position.valueEur)}
                    </p>
                  )}
                </td>

                {/* Weight */}
                <td className="px-4 py-4 text-right">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      holding.position.portfolioWeightPct > 45
                        ? "text-amber-700"
                        : "text-stone-700"
                    }`}
                  >
                    {holding.position.portfolioWeightPct.toFixed(1)}%
                  </span>
                </td>

                {/* Playbook */}
                <td className="px-4 py-4">
                  <div>
                    <StanceBadge stance={holding.playbookStance} size="sm" />
                    <p className="text-xs text-stone-400 mt-1">
                      {holding.playbookReason}
                    </p>
                  </div>
                </td>

                {/* Arrow */}
                <td className="px-4 py-4">
                  {isClickable && (
                    <Link href={`/stocks/${holding.security.ticker}`}>
                      <ChevronRight className="w-4 h-4 text-stone-300 hover:text-stone-500 transition-colors" />
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
