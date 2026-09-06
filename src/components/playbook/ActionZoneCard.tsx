"use client";

import { useState } from "react";
import type { ActionZone } from "@/types/playbook";
import { ChevronDown, ChevronUp } from "lucide-react";

const zoneConfig: Record<
  ActionZone["type"],
  { label: string; stateStyle: Record<ActionZone["state"], string>; headerBg: string }
> = {
  ADD: {
    label: "ADD",
    stateStyle: {
      ACTIVE: "text-teal-700 bg-teal-50 border-teal-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-700 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
    headerBg: "bg-stone-50",
  },
  HOLD: {
    label: "HOLD",
    stateStyle: {
      ACTIVE: "text-stone-700 bg-white border-stone-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-700 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
    headerBg: "bg-white",
  },
  TRIM_1: {
    label: "TRIM — LEVEL 1",
    stateStyle: {
      ACTIVE: "text-amber-700 bg-amber-50 border-amber-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-600 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
    headerBg: "bg-white",
  },
  TRIM_2: {
    label: "TRIM — LEVEL 2",
    stateStyle: {
      ACTIVE: "text-orange-700 bg-orange-50 border-orange-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-orange-600 bg-orange-50 border-orange-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
    headerBg: "bg-white",
  },
  THESIS_REVIEW: {
    label: "THESIS REVIEW",
    stateStyle: {
      ACTIVE: "text-red-700 bg-red-50 border-red-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-orange-700 bg-orange-50 border-orange-200",
      CONDITIONAL: "text-stone-600 bg-stone-100 border-stone-200",
    },
    headerBg: "bg-white",
  },
};

const stateLabel: Record<ActionZone["state"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  WATCH: "Watch conditions",
  CONDITIONAL: "Conditional",
};

interface Props {
  zone: ActionZone;
  defaultOpen?: boolean;
}

export function ActionZoneCard({ zone, defaultOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = zoneConfig[zone.type];
  const stateClass = config.stateStyle[zone.state];

  return (
    <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
      {/* Compact header — always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-stone-50 transition-colors ${
          isOpen ? "border-b border-stone-100" : ""
        }`}
      >
        {/* Zone type label */}
        <div className="flex-shrink-0 pt-0.5">
          <span
            className={`inline-block text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded border ${stateClass}`}
          >
            {config.label}
          </span>
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-stone-400">
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
          <p className="text-sm text-stone-600">{zone.summary}</p>
        </div>

        {/* Toggle */}
        <div className="flex-shrink-0 text-stone-400 mt-0.5">
          {isOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-5 py-5 space-y-5">
          {/* Primary trigger */}
          {zone.primaryTrigger && (
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                Primary trigger
              </p>
              <p className="text-sm text-stone-700">{zone.primaryTrigger}</p>
            </div>
          )}

          {/* Suggested action */}
          {zone.suggestedAction && (
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                Suggested action
              </p>
              <p className="text-sm text-stone-700">{zone.suggestedAction}</p>
            </div>
          )}

          {/* Why bullets */}
          {zone.whyBullets && zone.whyBullets.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                Why
              </p>
              <ul className="space-y-1">
                {zone.whyBullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                    <span className="text-stone-300 mt-0.5">•</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Do not trigger if */}
          {zone.doNotTriggerIf && zone.doNotTriggerIf.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                Do not trigger if
              </p>
              <ul className="space-y-1">
                {zone.doNotTriggerIf.map((condition, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-stone-500"
                  >
                    <span className="text-stone-300 mt-0.5">—</span>
                    {condition}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          <div className="pt-3 border-t border-stone-100">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
              Sources
            </p>
            <div className="flex gap-3">
              {["Portfolio strategy", "Latest Playbook", "Current market data"].map(
                (src) => (
                  <span
                    key={src}
                    className="text-xs text-stone-500 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded"
                  >
                    {src}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button className="text-xs text-stone-400 px-3 py-1.5 border border-stone-200 rounded hover:bg-stone-50 transition-colors opacity-50 cursor-not-allowed">
              Edit rule
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-xs text-stone-500 hover:text-stone-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
