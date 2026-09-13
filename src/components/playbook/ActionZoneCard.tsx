"use client";

import type { ActionZone } from "@/types/playbook";
import { ChevronRight } from "lucide-react";
import { zoneConfig, stateLabel } from "./actionZoneConfig";
import { actionZoneIcon, zoneStateIcon } from "./playbookIcons";

interface Props {
  zone: ActionZone;
  isSelected: boolean;
  onClick: () => void;
}

export function ActionZoneCard({ zone, isSelected, onClick }: Props) {
  const config = zoneConfig[zone.type];
  const stateClass = config.stateStyle[zone.state];
  const ActionIcon = actionZoneIcon[zone.type];
  const StateIcon = zoneStateIcon[zone.state];

  return (
    <button
      onClick={onClick}
      aria-expanded={isSelected}
      className={`w-full text-left px-5 py-4 flex items-center gap-4 bg-white rounded-lg border transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97] hover:bg-stone-50 ${
        isSelected
          ? "border-stone-300 ring-1 ring-stone-200"
          : "border-stone-200"
      }`}
    >
      {/* Zone type label */}
      <div className="flex-shrink-0">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded border ${stateClass}`}
        >
          <ActionIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {config.label}
        </span>
      </div>

      {/* Summary */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <StateIcon className="w-3 h-3" aria-hidden="true" />
            {stateLabel[zone.state]}
          </span>
          {zone.suggestedShares && (
            <>
              <span className="text-stone-200">·</span>
              <span className="text-xs text-stone-500">
                Consider {zone.suggestedShares} shares
              </span>
            </>
          )}
        </div>
        <p className="text-sm text-stone-600 truncate">{zone.summary}</p>
      </div>

      {/* Affordance */}
      <div className="flex-shrink-0 text-stone-300">
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}
