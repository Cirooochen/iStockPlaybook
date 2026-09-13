"use client";

import { useState } from "react";
import type { Scorecard, SignalState } from "@/types/playbook";
import type { MomentumScoreResult, FundamentalsScoreResult } from "@/domain/engine";
import { ChevronRight } from "lucide-react";
import { reasoningCategoryIcon } from "./playbookIcons";

const stateStyle: Record<SignalState, string> = {
  Positive: "text-teal-700 bg-teal-50",
  Neutral: "text-stone-600 bg-stone-100",
  Weak: "text-amber-700 bg-amber-50",
  Elevated: "text-orange-700 bg-orange-50",
  Intact: "text-stone-600 bg-stone-100",
};

const rows: Array<{ key: keyof Scorecard; label: string }> = [
  { key: "fundamentals", label: "Fundamentals" },
  { key: "valuation", label: "Valuation" },
  { key: "momentum", label: "Momentum" },
  { key: "thesisHealth", label: "Thesis health" },
  { key: "positionFit", label: "Position fit" },
  { key: "concentrationRisk", label: "Concentration risk" },
];

// Plain-language labels for the known component keys (momentum-score.ts /
// fundamentals-templates/growth-software.ts) — presentation only, not a
// new scoring rule. Falls back to a humanized version of the raw key for
// any key this map doesn't recognize, since FundamentalsComponentKey is
// deliberately typed as `string` (archetype-scoped, not closed).
const componentLabel: Record<string, string> = {
  rsi: "RSI",
  relativeVolume: "Relative volume",
  structure: "Price structure",
  priceExtension: "Price extension",
  trend: "Trend",
  relativeStrength: "Relative strength",
  revenueGrowth: "Revenue growth",
  growthTrend: "Growth trend",
  operatingMargin: "Operating margin",
  marginTrend: "Margin trend",
  fcfMargin: "FCF margin",
  guidance: "Guidance",
  balanceSheet: "Balance sheet",
};

function humanizeKey(key: string): string {
  return componentLabel[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

interface Props {
  scorecard: Scorecard;
  /** Full evidence/coverage detail behind `scorecard.momentum` — same
   * canonical source EngineOutput.momentumResult already carries;
   * expanding this row was a named F.0 gap (computed, never shown). */
  momentumResult?: MomentumScoreResult;
  fundamentalsResult?: FundamentalsScoreResult;
}

export function SignalScorecard({ scorecard, momentumResult, fundamentalsResult }: Props) {
  const [expanded, setExpanded] = useState<keyof Scorecard | null>(null);

  function detailFor(key: keyof Scorecard) {
    if (key === "momentum") return momentumResult;
    if (key === "fundamentals") return fundamentalsResult;
    return undefined;
  }

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-5">
        Signal overview
      </h2>

      {/* Score rows */}
      <div className="space-y-1 mb-2">
        {rows.map(({ key, label }) => {
          const item = scorecard[key];
          const Icon = reasoningCategoryIcon[key];
          const detail = detailFor(key);
          const isExpandable = detail !== undefined;
          const isOpen = expanded === key;

          const row = (
            <div className="flex items-center gap-3 py-2">
              <Icon className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <span className="text-sm text-stone-600 w-28 shrink-0 text-left">
                {label}
              </span>
              {/* Bar */}
              <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-colors bar-grow-in ${
                    item.score >= 7
                      ? "bg-teal-400"
                      : item.score >= 5
                      ? "bg-stone-300"
                      : "bg-amber-400"
                  }`}
                  style={{ width: `${item.score * 10}%` }}
                />
              </div>
              <span className="text-sm font-medium text-stone-600 tabular-nums w-12 text-right">
                {item.score} / 10
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded w-20 text-center ${
                  stateStyle[item.state]
                }`}
              >
                {item.state}
              </span>
              {isExpandable && (
                <ChevronRight
                  className={`w-3.5 h-3.5 text-stone-300 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
              )}
            </div>
          );

          return (
            <div key={key}>
              {isExpandable ? (
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : key)}
                  aria-expanded={isOpen}
                  className="w-full text-left hover:bg-stone-50 rounded-md transition-colors -mx-2 px-2"
                >
                  {row}
                </button>
              ) : (
                row
              )}

              {isExpandable && isOpen && detail && (
                <div className="ml-7 mb-2 mt-1 bg-stone-50 border border-stone-100 rounded-md px-4 py-3">
                  <p className="text-xs text-stone-500 mb-2">
                    Evidence coverage{" "}
                    <span className="font-semibold text-stone-700">
                      {(detail.coverage.availableWeightShare * 100).toFixed(0)}%
                    </span>{" "}
                    — signals that aren&apos;t available are treated as unknown, never as a
                    negative.
                  </p>
                  <div className="space-y-1">
                    {detail.components.map((c) => (
                      <div key={c.key} className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-stone-600">{humanizeKey(c.key)}</span>
                        <span
                          className={
                            c.status === "AVAILABLE"
                              ? "font-medium text-stone-800 tabular-nums"
                              : "text-stone-400 italic"
                          }
                        >
                          {c.status === "AVAILABLE"
                            ? `${c.score100.toFixed(0)} / 100`
                            : c.status === "NOT_APPLICABLE"
                            ? "Not applicable"
                            : "Not available"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
