import { whyThisStance } from "@/data/unity-seed";
import { ExternalLink } from "lucide-react";

export function WhyThisStance() {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-stone-700">
          Why this stance?
        </h2>
        <button className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors">
          <ExternalLink className="w-3 h-3" />
          See evidence
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Supporting */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
            Supporting
          </p>
          <ul className="space-y-2">
            {whyThisStance.supporting.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="text-teal-500 mt-0.5 font-medium">+</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Constraints */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
            Constraints
          </p>
          <ul className="space-y-2">
            {whyThisStance.constraints.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                <span className="text-amber-500 mt-0.5 font-medium">–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
