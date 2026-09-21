import { ArrowRight, Minus } from "lucide-react";
import type { FundamentalChangeEvidence, FundamentalChangeEvidenceLine, FundamentalChangeSign } from "@/domain/signals/fundamental-change-evidence";

// Phase I.5 — presentation of FundamentalChangeEvidence (a completed,
// tested primitive — src/domain/signals/fundamental-change-evidence.ts —
// not touched here). This card is evidence presentation ONLY: no
// materiality/significance judgment, no aggregate verdict, no score, no
// AI interpretation. See docs/phase-i-minimum-research-evidence.md §14
// for why `reversed` is rendered as a plain factual statement ("Direction
// changed from X to Y"), never as "material"/"significant"/a warning —
// the underlying primitive deliberately has no such classification (its
// own spike found no honest, threshold-free way to determine one), and
// this presentation layer must not manufacture one through wording or
// styling that the data itself doesn't support.
//
// Deliberately NO per-state color/icon variation based on `reversed` —
// every AVAILABLE line (reversed or not) uses the identical neutral
// icon and identical neutral value styling. A `reversed: true` line is
// NOT styled as an alert (no red, no warning icon, no severity badge):
// the fact that a sign flipped is shown in words, once, plainly — the
// same restraint BusinessTrajectoryCard already applies to its own
// DETERIORATING state (amber, not red; no urgency language).
function signWord(sign: FundamentalChangeSign): string {
  return sign === "POSITIVE" ? "positive" : "negative"; // reversed is only ever POSITIVE<->NEGATIVE — ZERO never reaches here
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value * 100).toFixed(1)}%`;
}

interface LineProps {
  label: string;
  line: FundamentalChangeEvidenceLine;
}

function ChangeLine({ label, line }: LineProps) {
  // INSUFFICIENT_HISTORY and MISSING are both honest absence states with
  // DIFFERENT meanings (docs/phase-i-minimum-research-evidence.md §14) —
  // never conflated with each other, and never rendered as "stable" or
  // "no change."
  if (line.status === "MISSING") {
    return (
      <div className="flex items-center gap-3 py-2">
        <Minus className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
        <span className="text-sm text-stone-600 w-28 shrink-0 text-left">{label}</span>
        <span className="text-sm text-stone-400 italic">Not available</span>
      </div>
    );
  }

  if (line.status === "INSUFFICIENT_HISTORY") {
    return (
      <div className="flex items-center gap-3 py-2">
        <Minus className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
        <span className="text-sm text-stone-600 w-28 shrink-0 text-left">{label}</span>
        <span className="text-sm text-stone-400 italic">Insufficient history</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 flex-wrap">
      <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
      <span className="text-sm text-stone-600 w-28 shrink-0 text-left">{label}</span>
      <span className="text-sm text-stone-700 bg-stone-50 px-2 py-0.5 rounded tabular-nums">
        {formatPercent(line.before)} <ArrowRight className="w-3 h-3 inline -mt-0.5" aria-hidden="true" /> {formatPercent(line.after)}
      </span>
      {line.reversed && (
        <span className="text-xs text-stone-400">
          Direction changed from {signWord(line.beforeSign)} to {signWord(line.afterSign)}
        </span>
      )}
    </div>
  );
}

interface Props {
  evidence: FundamentalChangeEvidence;
}

// Phase I.5 — the smallest Recent Changes slice (docs/phase-i-minimum-
// research-evidence.md §14): the actual before/after values for revenue
// growth and operating margin between the two most recently reported
// periods, plus a threshold-free exact-sign-reversal fact. No aggregate
// Recent Changes verdict, no score, no effect on stance/action zones/
// thesis/the decision engine — this reads only PlaybookClientShell's own
// already-fetched raw periods, nothing new.
export function RecentChangesCard({ evidence }: Props) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-1">Recent changes</h2>
      <p className="text-xs text-stone-400 mb-4">
        What changed between the two most recently reported periods — evidence, not a verdict.
      </p>
      <div className="space-y-1">
        <ChangeLine label="Revenue" line={evidence.revenue} />
        <ChangeLine label="Profitability" line={evidence.profitability} />
      </div>
    </div>
  );
}
