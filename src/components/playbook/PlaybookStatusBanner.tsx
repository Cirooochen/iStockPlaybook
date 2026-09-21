import type { StockSeed, Stance, ThesisHealth } from "@/types/playbook";
import { stanceDisplayLabel } from "@/domain/playbook/stance-rules";

const confidenceLabel: Record<string, string> = {
  LOW: "Low confidence",
  MEDIUM: "Medium confidence",
  HIGH: "High confidence",
};

const thesisHealthLabel: Record<string, { label: string; className: string }> =
  {
    STRENGTHENING: {
      label: "Strengthening",
      className: "text-teal-700 bg-teal-50",
    },
    INTACT: { label: "Intact", className: "text-stone-600 bg-stone-100" },
    MIXED: { label: "Mixed", className: "text-amber-700 bg-amber-50" },
    WEAKENING: {
      label: "Weakening",
      className: "text-orange-700 bg-orange-50",
    },
    BROKEN: { label: "Broken", className: "text-red-700 bg-red-50" },
  };

interface Props {
  seed: StockSeed;
  stance: Stance;
  thesisHealth: ThesisHealth;
}

export function PlaybookStatusBanner({ seed, stance, thesisHealth }: Props) {
  const { playbook } = seed;
  const health = thesisHealthLabel[thesisHealth];

  return (
    <div className="mb-6 pb-6 border-b border-stone-200">
      <div className="mb-2">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-2">
          Playbook
        </p>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold text-stone-900 tracking-tight">
            {stanceDisplayLabel[stance]}
          </h2>
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${health.className}`}
          >
            Thesis {health.label}
          </span>
        </div>
        <p className="text-xs text-stone-400">
          {confidenceLabel[playbook.confidence]} · Last updated today, 16:18
        </p>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed max-w-2xl">
        {playbook.summary}
      </p>
    </div>
  );
}
