import Link from "next/link";
import type { Portfolio } from "@/types/playbook";
import { concentrationData } from "@/data/portfolio-seed";
import { ArrowRight } from "lucide-react";

interface Props {
  portfolio: Portfolio;
}

export function ConcentrationOverview({ portfolio: _ }: Props) {
  const maxTarget = 45;
  const unityWeight = concentrationData[0].weightPct;
  const overTarget = unityWeight - maxTarget;

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-5">
        Concentration
      </h2>

      <div className="space-y-3 mb-5">
        {concentrationData.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm text-stone-700 w-36 shrink-0">
              {item.label}
            </span>
            <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-colors bar-grow-in ${
                  item.isAlert ? "bg-amber-400" : "bg-stone-300"
                }`}
                style={{ width: `${item.weightPct}%` }}
              />
            </div>
            <span
              className={`text-sm tabular-nums w-12 text-right font-medium ${
                item.isAlert ? "text-amber-700" : "text-stone-600"
              }`}
            >
              {item.weightPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-stone-100">
        <p className="text-xs text-stone-500 max-w-sm">
          Unity is{" "}
          <span className="text-amber-700 font-medium">
            {overTarget.toFixed(1)} percentage points
          </span>{" "}
          above your medium-term target maximum of {maxTarget}%.
        </p>
        <Link
          href="/stocks/U"
          className="flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap"
        >
          Review Unity Playbook
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
