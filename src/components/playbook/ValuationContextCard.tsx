import { Minus } from "lucide-react";
import type { ValuationContext, ValuationContextComparison } from "@/domain/signals/valuation-context";

// Phase I.4B — presentation of deriveValuationContext (a completed,
// tested primitive — src/domain/signals/valuation-context.ts — not
// touched here). Descriptive context ONLY, mirroring
// RecentChangesCard/BusinessTrajectoryCard's own restraint: no cheap/
// expensive language, no over/undervalued judgment, no score, no
// percentile, no color/icon variation by comparison direction — a
// "Higher than recent history" reading is not styled as a warning any
// more than "Lower" is styled as an opportunity. The underlying
// primitive has no such classification; this layer must not invent one
// through wording or styling.
const COMPARISON_COPY: Record<ValuationContextComparison, string> = {
  HIGHER: "Higher than recent history",
  LOWER: "Lower than recent history",
  IN_LINE: "In line with recent history",
};

function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
}

interface Props {
  context: ValuationContext;
}

// Phase I.4B — the smallest Valuation Context slice (docs/phase-i-
// minimum-research-evidence.md §16.8): current EV/Revenue against the
// median of its own 3-5 most recent completed-fiscal-year observations
// (Phase I.4A), described in one plain sentence. No aggregate valuation
// verdict, no effect on stance/action zones/thesis/the decision engine.
export function ValuationContextCard({ context }: Props) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-1">Valuation context</h2>
      <p className="text-xs text-stone-400 mb-4">
        EV/Revenue today versus its own recent history — evidence, not a verdict.
      </p>
      {context.status === "MISSING" ? (
        <div className="flex items-center gap-3 py-2">
          <Minus className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
          <span className="text-sm text-stone-400 italic">Not available</span>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-3 py-2 flex-wrap">
            <span className="text-sm text-stone-600 w-28 shrink-0 text-left">Current</span>
            <span className="text-sm text-stone-700 bg-stone-50 px-2 py-0.5 rounded tabular-nums">
              {formatMultiple(context.currentEvToRevenue)}
            </span>
          </div>
          <div className="flex items-center gap-3 py-2 flex-wrap">
            <span className="text-sm text-stone-600 w-28 shrink-0 text-left">
              {context.historicalCheckpointCount}-year median
            </span>
            <span className="text-sm text-stone-700 bg-stone-50 px-2 py-0.5 rounded tabular-nums">
              {formatMultiple(context.historicalMedianEvToRevenue)}
            </span>
          </div>
          <p className="text-sm text-stone-600 pt-1">{COMPARISON_COPY[context.comparison]}</p>
        </div>
      )}
    </div>
  );
}
