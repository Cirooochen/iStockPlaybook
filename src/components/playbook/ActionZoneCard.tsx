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
      className={`w-full text-left py-3.5 flex items-center gap-4 transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.99] hover:bg-stone-50 -mx-2 px-2 rounded-md ${
        isSelected ? "bg-stone-50" : ""
      }`}
    >
      {/* Zone icon */}
      <div className="flex-shrink-0">
        <ActionIcon
          className={`w-6 h-6 p-1 rounded-full border ${stateClass}`}
          aria-hidden="true"
        />
      </div>

      {/* Summary */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-stone-800">{config.label}</span>
        <p className="text-sm text-stone-500 truncate mt-0.5">
          {zone.suggestedShares ? `Consider ${zone.suggestedShares} shares` : zone.summary}
        </p>
      </div>

      {/* State — right-aligned, matching PrimaryActionCard's own badge placement */}
      <div className="flex-shrink-0 inline-flex items-center gap-1 text-xs text-stone-500">
        <StateIcon className="w-3 h-3" aria-hidden="true" />
        {stateLabel[zone.state]}
      </div>

      {/* Affordance */}
      <div className="flex-shrink-0 text-stone-300">
        <ChevronRight className="w-4 h-4" />
      </div>
    </button>
  );
}
