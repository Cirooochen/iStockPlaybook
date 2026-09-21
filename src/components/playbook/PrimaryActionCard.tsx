import type { ActionZone } from "@/types/playbook";
import { actionZoneIcon, zoneStateIcon } from "./playbookIcons";
import { stateLabel, zoneConfig } from "./actionZoneConfig";
import { formatShares } from "@/lib/format";

interface Props {
  zone: ActionZone;
  currentShares: number;
  /**
   * Real `targetPosition.preferredTargetShares` (spec §21A) — the
   * strategic destination, not an immediate instruction (Playbook
   * Interface Principles §3). `null` only when the target-weight range
   * and core range are CONFLICTING and no single point satisfies both —
   * shown honestly rather than invented.
   */
  recommendedShares: number | null;
  onAct: () => void;
}

// TRIM_1 / TRIM_2 share one action icon (playbookIcons.ts) — this badge
// is the only per-level distinction, not a second icon (§16.1).
function levelBadge(zoneType: ActionZone["type"]): string | null {
  if (zoneType === "TRIM_1") return "1";
  if (zoneType === "TRIM_2") return "2";
  return null;
}

export function PrimaryActionCard({ zone, currentShares, recommendedShares, onAct }: Props) {
  const ActionIcon = actionZoneIcon[zone.type];
  const StateIcon = zoneStateIcon[zone.state];
  const badge = levelBadge(zone.type);
  const stateClass = zoneConfig[zone.type].stateStyle[zone.state];

  // Only a genuinely actionable, currently-active zone gets an Act CTA —
  // never shown ahead of the real deterministic state (Playbook
  // Interface Principles §6 guardrail: never show Act before conditions
  // are satisfied).
  const canAct = zone.state === "ACTIVE" && Boolean(zone.suggestedShares);

  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3">
        Primary action
      </p>
      <div className="bg-white rounded-lg border border-stone-200 p-7 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex shrink-0">
              <ActionIcon className="w-9 h-9 p-2 rounded-full border border-stone-300 text-stone-600" aria-hidden="true" />
              {badge && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-stone-700 text-white text-[9px] font-bold leading-none flex items-center justify-center border-2 border-white">
                  {badge}
                </span>
              )}
            </span>
            <h2 className="text-2xl font-bold text-stone-900 tracking-tight">{zone.title}</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded border shrink-0 ${stateClass}`}
          >
            <StateIcon className="w-3 h-3" aria-hidden="true" />
            {stateLabel[zone.state]}
          </span>
        </div>

        <p className="text-sm text-stone-600 leading-relaxed max-w-2xl mb-5">{zone.summary}</p>

        {canAct ? (
          <button
            onClick={onAct}
            className="inline-flex items-center gap-2 bg-teal-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]"
          >
            Act on this →
          </button>
        ) : (
          zone.primaryTrigger && (
            <p className="text-sm text-stone-500 italic leading-relaxed">{zone.primaryTrigger}</p>
          )
        )}

        <div className="flex gap-4 mt-5 pt-5 border-t border-stone-100 text-sm text-stone-500">
          <span>
            Current holding <span className="font-semibold text-stone-800 tabular-nums">{formatShares(currentShares)}</span> shares
          </span>
          <span className="text-stone-300">→</span>
          <span>
            Recommended holding{" "}
            <span className="font-semibold text-stone-800 tabular-nums">
              {recommendedShares === null ? "not currently determinable" : `${formatShares(recommendedShares)} shares`}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
