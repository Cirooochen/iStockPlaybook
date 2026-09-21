import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { BusinessTrajectory, BusinessTrajectoryDirection, BusinessTrajectoryLine } from "@/domain/signals/business-trajectory";

// Phase I.3 — beginner-facing copy for each line's own direction. Two
// independent maps (not one shared set) since "accelerating" doesn't
// read naturally for margin, and "improving" doesn't read naturally for
// revenue growth specifically — same underlying direction, different
// plain-language framing per line, per
// docs/phase-i-minimum-research-evidence.md §11.
const REVENUE_COPY: Record<BusinessTrajectoryDirection, string> = {
  IMPROVING: "Revenue growth is accelerating",
  DETERIORATING: "Revenue growth is slowing",
  STABLE: "Revenue growth is steady",
};

const PROFITABILITY_COPY: Record<BusinessTrajectoryDirection, string> = {
  IMPROVING: "Profitability is improving",
  DETERIORATING: "Profitability is weakening",
  STABLE: "Profitability is steady",
};

const directionStyle: Record<BusinessTrajectoryDirection, string> = {
  IMPROVING: "text-teal-700 bg-teal-50",
  DETERIORATING: "text-amber-700 bg-amber-50",
  STABLE: "text-stone-600 bg-stone-100",
};

const directionIcon: Record<BusinessTrajectoryDirection, LucideIcon> = {
  IMPROVING: TrendingUp,
  DETERIORATING: TrendingDown,
  STABLE: Minus,
};

interface LineProps {
  label: string;
  line: BusinessTrajectoryLine;
  copy: Record<BusinessTrajectoryDirection, string>;
}

function TrajectoryLine({ label, line, copy }: LineProps) {
  if (line.status === "MISSING") {
    return (
      <div className="flex items-center gap-3 py-2">
        <Minus className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
        <span className="text-sm text-stone-600 w-28 shrink-0 text-left">{label}</span>
        <span className="text-sm text-stone-400 italic">Not available</span>
      </div>
    );
  }

  const Icon = directionIcon[line.direction];
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
      <span className="text-sm text-stone-600 w-28 shrink-0 text-left">{label}</span>
      <span className={`text-sm px-2 py-0.5 rounded ${directionStyle[line.direction]}`}>{copy[line.direction]}</span>
    </div>
  );
}

interface Props {
  trajectory: BusinessTrajectory;
}

// Phase I.3 — the primary beginner-facing evidence read (see
// docs/phase-i-minimum-research-evidence.md §11's UI-integration
// decision): rendered ahead of SignalScorecard's fuller Fundamentals
// composite, which stays available as supporting/detail evidence. Two
// independent lines, deliberately no combined verdict and no 1-10
// number — direction in plain language, or an honest "Not available,"
// never a fabricated "Steady" for missing evidence.
export function BusinessTrajectoryCard({ trajectory }: Props) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-1">Business trajectory</h2>
      <p className="text-xs text-stone-400 mb-4">
        Is the business improving or deteriorating — evidence, not a verdict.
      </p>
      <div className="space-y-1">
        <TrajectoryLine label="Revenue" line={trajectory.revenue} copy={REVENUE_COPY} />
        <TrajectoryLine label="Profitability" line={trajectory.profitability} copy={PROFITABILITY_COPY} />
      </div>
    </div>
  );
}
