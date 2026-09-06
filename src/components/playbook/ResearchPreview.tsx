import { unityResearch } from "@/data/unity-seed";
import { Plus, ExternalLink, CheckCircle2 } from "lucide-react";

export function ResearchPreview() {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-stone-700">Latest research</h2>
        <div className="flex items-center gap-2">
          <button className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors">
            View all research
          </button>
          <button className="flex items-center gap-1 text-xs font-medium text-stone-600 border border-stone-300 rounded px-2.5 py-1 hover:bg-stone-50 transition-colors">
            <Plus className="w-3 h-3" />
            Add research
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {unityResearch.map((doc) => (
          <div
            key={doc.id}
            className="flex items-start justify-between p-3 bg-stone-50 rounded-md"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-stone-800">{doc.title}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {doc.type} · {doc.period} · {doc.status}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <span className="text-xs text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded">
                {doc.playbookImpact}
              </span>
              <button className="text-stone-300 hover:text-stone-600 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
