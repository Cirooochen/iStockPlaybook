import { unityThesis } from "@/data/unity-seed";
import { Edit2 } from "lucide-react";

export function ThesisCard() {
  const { text, horizon, catalysts, risks, thesisBreakers } = unityThesis;

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">
            Investment thesis
          </p>
          <span className="text-xs text-stone-400">Horizon: {horizon}</span>
        </div>
        <button className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors">
          <Edit2 className="w-3 h-3" />
          Edit thesis
        </button>
      </div>

      <p className="text-sm text-stone-700 leading-relaxed mb-5">{text}</p>

      <div className="grid grid-cols-3 gap-5 pt-5 border-t border-stone-100">
        {/* Catalysts */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
            Catalysts
          </p>
          <ul className="space-y-1.5">
            {catalysts.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-stone-600">
                <span className="text-teal-400 mt-0.5">+</span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Risks */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
            Risks
          </p>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-stone-500">
                <span className="text-stone-300 mt-0.5">—</span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        {/* Thesis breakers */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
            Thesis breakers
          </p>
          <ul className="space-y-1.5">
            {thesisBreakers.map((tb, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-stone-500">
                <span className="text-orange-400 mt-0.5">!</span>
                {tb}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
