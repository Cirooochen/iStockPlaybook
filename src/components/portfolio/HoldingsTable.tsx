"use client";

import { useState } from "react";
import Link from "next/link";
import type { HoldingSnapshot, PortfolioSnapshot, StockPlaybookConfig } from "@/types/portfolio";
import { holdingWeightPct } from "@/domain/portfolio/snapshot";
import { deriveStockConcentrationView } from "@/domain/portfolio/stock-concentration-view";
import { concentrationLabel } from "@/domain/portfolio/concentration";
import { StanceBadge } from "@/components/shared/StanceBadge";
import { formatEur, formatPct } from "@/lib/format";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";

interface Props {
  snapshot: PortfolioSnapshot;
  configs: StockPlaybookConfig[];
  onEdit: (holding: HoldingSnapshot) => void;
  onDelete: (holdingId: string) => void;
}

export function HoldingsTable({ snapshot, configs, onEdit, onDelete }: Props) {
  const { holdings, valuation } = snapshot;
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
          {holdings.map((holding) => {
            const { instrument } = holding;
            const config = configs.find((c) => c.instrumentId === instrument.id);
            // Any STOCK holding with a ticker has a Stock Detail page to
            // navigate to (brief §1/§14 — only STOCK supports the
            // Playbook; CASH/ETF/CRYPTO/OTHER are portfolio-only) — a
            // config is no longer required (Phase H.4): a STOCK holding
            // with no config yet lands on that page's "No Playbook" state
            // with a Create Playbook entry point, instead of being inert.
            const isClickable = instrument.assetType === "STOCK" && Boolean(instrument.ticker);
            const weightPct = holdingWeightPct(holding, valuation);
            const concentrationView = deriveStockConcentrationView(holding, valuation, config);
            const isPendingDelete = pendingDeleteId === holding.holdingId;

            const nameBlock = (
              <>
                <p className="text-sm font-medium text-stone-900">
                  {instrument.ticker
                    ? instrument.name.split(" ").slice(0, 2).join(" ")
                    : instrument.name}
                </p>
                {instrument.ticker && (
                  <p className="text-xs text-stone-400 mt-0.5">
                    {instrument.exchange ? `${instrument.ticker} · ${instrument.exchange}` : instrument.ticker}
                  </p>
                )}
              </>
            );

            return (
              <tr
                key={holding.holdingId}
                className={`border-b border-stone-50 last:border-0 ${
                  isClickable ? "hover:bg-stone-50 cursor-pointer transition-colors" : ""
                }`}
              >
                {/* Stock */}
                <td className="px-6 py-4">
                  {isClickable ? (
                    <Link href={`/stocks/${instrument.ticker}`} className="block">
                      {nameBlock}
                    </Link>
                  ) : (
                    <div>{nameBlock}</div>
                  )}
                </td>

                {/* Price */}
                <td className="px-4 py-4 text-right">
                  {instrument.assetType !== "CASH" && holding.priceNative.status === "AVAILABLE" ? (
                    <p className="text-sm text-stone-700 tabular-nums">
                      {formatEur(holding.priceNative.value)}
                    </p>
                  ) : (
                    <span className="text-xs text-stone-300">—</span>
                  )}
                </td>

                {/* Return */}
                <td className="px-4 py-4 text-right">
                  {holding.valueBase.status === "AVAILABLE" ? (
                    <>
                      <p className="text-sm text-stone-700 tabular-nums">
                        {formatEur(holding.valueBase.value)}
                      </p>
                      {holding.unrealizedReturnPct.status === "AVAILABLE" && (
                        <p className="text-xs text-stone-500 tabular-nums">
                          {formatPct(holding.unrealizedReturnPct.value)}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-stone-300">—</span>
                  )}
                </td>

                {/* Weight */}
                <td className="px-4 py-4 text-right">
                  {weightPct !== null ? (
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        concentrationView && concentrationView.state !== "WITHIN_TARGET"
                          ? "text-amber-700"
                          : "text-stone-700"
                      }`}
                    >
                      {weightPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-xs text-stone-300">—</span>
                  )}
                </td>

                {/* Playbook */}
                <td className="px-4 py-4">
                  {!config ? (
                    isClickable ? (
                      <Link
                        href={`/stocks/${instrument.ticker}`}
                        className="text-xs font-medium text-teal-700 hover:text-teal-800 transition-colors"
                      >
                        Set up playbook →
                      </Link>
                    ) : (
                      <span className="text-xs text-stone-300">No playbook</span>
                    )
                  ) : concentrationView ? (
                    <div>
                      <StanceBadge stance={concentrationView.stance} size="sm" />
                      <p className="text-xs text-stone-400 mt-1">
                        {concentrationLabel[concentrationView.state]}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-stone-300">Stance unavailable</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-4">
                  {isPendingDelete ? (
                    <div className="flex items-center gap-2 justify-end whitespace-nowrap">
                      <span className="text-xs text-stone-500">Delete?</span>
                      <button
                        onClick={() => {
                          onDelete(holding.holdingId);
                          setPendingDeleteId(null);
                        }}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="text-xs text-stone-500 hover:text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => onEdit(holding)}
                        aria-label={`Edit ${instrument.name}`}
                        className="text-stone-300 hover:text-stone-600 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(holding.holdingId)}
                        aria-label={`Delete ${instrument.name}`}
                        className="text-stone-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isClickable && (
                        <Link href={`/stocks/${instrument.ticker}`}>
                          <ChevronRight className="w-4 h-4 text-stone-300 hover:text-stone-500 transition-colors" />
                        </Link>
                      )}
                    </div>
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
