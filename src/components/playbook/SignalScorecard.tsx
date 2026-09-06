import type { Scorecard, SignalState } from "@/types/playbook";

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
  { key: "risk", label: "Risk" },
];

interface Props {
  scorecard: Scorecard;
}

export function SignalScorecard({ scorecard }: Props) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-5">
        Signal overview
      </h2>

      {/* Score rows */}
      <div className="space-y-3 mb-6">
        {rows.map(({ key, label }) => {
          const item = scorecard[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-stone-600 w-28 shrink-0">
                {label}
              </span>
              {/* Bar */}
              <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
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
            </div>
          );
        })}
      </div>

      {/* Summary conclusions */}
      <div className="pt-5 border-t border-stone-100 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-stone-400 mb-1">Company attractiveness</p>
          <p className="text-sm font-semibold text-teal-700">High</p>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">Entry attractiveness</p>
          <p className="text-sm font-semibold text-amber-700">Low</p>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">Portfolio fit</p>
          <p className="text-sm font-semibold text-amber-700">Low</p>
        </div>
      </div>
    </div>
  );
}
