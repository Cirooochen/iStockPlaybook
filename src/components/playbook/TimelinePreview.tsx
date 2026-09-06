import type { TimelineEntry } from "@/types/playbook";
import { ArrowRight } from "lucide-react";

const entryStyle: Record<TimelineEntry["type"], { dot: string; label: string }> =
  {
    PLAYBOOK_UPDATED: { dot: "bg-stone-400", label: "PLAYBOOK UPDATED" },
    STANCE_CHANGE: { dot: "bg-amber-400", label: "STANCE CHANGE" },
    BUY: { dot: "bg-teal-400", label: "BUY" },
    SELL: { dot: "bg-orange-400", label: "SELL" },
    THESIS_EDIT: { dot: "bg-blue-400", label: "THESIS EDIT" },
  };

interface Props {
  timeline: TimelineEntry[];
}

export function TimelinePreview({ timeline }: Props) {
  const preview = timeline.slice(0, 5);

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-stone-700">Recent activity</h2>
        <button className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors">
          View full timeline
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-100" />
        <div className="space-y-5">
          {preview.map((entry, i) => {
            const style = entryStyle[entry.type];
            return (
              <div key={i} className="flex items-start gap-4 pl-0">
                <div className="relative z-10 mt-1">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${style.dot}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                      {style.label}
                    </span>
                    <span className="text-xs text-stone-300">{entry.date}</span>
                  </div>
                  <p className="text-sm text-stone-700">{entry.summary}</p>
                  {entry.detail && (
                    <p className="text-xs text-stone-400 mt-0.5">{entry.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
