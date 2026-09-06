"use client";

import { useEffect } from "react";
import type { ActionZone } from "@/types/playbook";
import { X } from "lucide-react";
import { zoneConfig, stateLabel } from "./actionZoneConfig";
import type { TrimSizing } from "@/domain/portfolio/concentration";
import type { HardConstraintResult } from "@/domain/playbook/hard-constraints";

interface Props {
  zone: ActionZone | null;
  onClose: () => void;
  trimSizing: TrimSizing;
  firedConstraints: HardConstraintResult[];
}

export function ActionZoneDrawer({
  zone,
  onClose,
  trimSizing,
  firedConstraints,
}: Props) {
  const isOpen = zone !== null;

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const showConstraintWarning =
    zone?.type === "ADD" &&
    zone.state === "INACTIVE" &&
    firedConstraints.length > 0;

  const showTrimSizing =
    (zone?.type === "TRIM_1" || zone?.type === "TRIM_2") &&
    trimSizing.maxTacticalTrim > 0;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-stone-900/10 transition-opacity ${
          isOpen
            ? "opacity-100 duration-300 [transition-timing-function:var(--ease-drawer)]"
            : "opacity-0 duration-[250ms] [transition-timing-function:var(--ease-in)] pointer-events-none"
        }`}
        style={{ zIndex: 40 }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={zone ? `${zoneConfig[zone.type].label} details` : undefined}
        className={`fixed inset-y-0 right-0 w-[460px] bg-white shadow-2xl flex flex-col transition-transform ${
          isOpen
            ? "duration-300 [transition-timing-function:var(--ease-drawer)]"
            : "duration-[250ms] [transition-timing-function:var(--ease-in)]"
        }`}
        style={{
          zIndex: 50,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {zone && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-5 border-b border-stone-100 flex-shrink-0">
              <div>
                <span
                  className={`inline-block text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded border mb-3 ${
                    zoneConfig[zone.type].stateStyle[zone.state]
                  }`}
                >
                  {zoneConfig[zone.type].label}
                </span>
                <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1">
                  {stateLabel[zone.state]}
                </p>
                <h3 className="text-base font-semibold text-stone-800">
                  {zone.title}
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close detail panel"
                className="text-stone-400 hover:text-stone-600 transition-colors mt-0.5 motion-safe:active:scale-[0.97]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Hard constraint explanation for ADD when inactive */}
              {showConstraintWarning && (
                <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-[11px] font-medium text-stone-500 uppercase tracking-widest">
                    Why inactive
                  </p>
                  {firedConstraints.map((c) => (
                    <div key={c.code}>
                      <span className="text-xs font-semibold text-stone-500">
                        {c.code}
                      </span>
                      <p className="text-xs text-stone-500 leading-relaxed mt-0.5">
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              <div>
                <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-2">
                  Summary
                </p>
                <p className="text-sm text-stone-700 leading-relaxed">
                  {zone.summary}
                </p>
              </div>

              {/* Primary trigger */}
              {zone.primaryTrigger && (
                <div>
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-2">
                    Primary trigger
                  </p>
                  <p className="text-sm text-stone-700 leading-relaxed">
                    {zone.primaryTrigger}
                  </p>
                </div>
              )}

              {/* Suggested action */}
              {zone.suggestedAction && (
                <div>
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-2">
                    Suggested action
                  </p>
                  <p className="text-sm text-stone-700 leading-relaxed">
                    {zone.suggestedAction}
                  </p>
                </div>
              )}

              {/* Why bullets */}
              {zone.whyBullets && zone.whyBullets.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-2">
                    Why
                  </p>
                  <ul className="space-y-1.5">
                    {zone.whyBullets.map((bullet, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-stone-600"
                      >
                        <span className="text-stone-300 mt-0.5 shrink-0">•</span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Do not trigger if */}
              {zone.doNotTriggerIf && zone.doNotTriggerIf.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-2">
                    Do not trigger if
                  </p>
                  <ul className="space-y-1.5">
                    {zone.doNotTriggerIf.map((condition, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-stone-500"
                      >
                        <span className="text-stone-300 mt-0.5 shrink-0">—</span>
                        {condition}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trim sizing suggestions */}
              {showTrimSizing && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-4">
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-3">
                    Suggested trim sizing
                  </p>
                  <div className="space-y-2">
                    {zone.type === "TRIM_1" && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-stone-600">Level 1 (30% of tactical)</span>
                        <span className="text-sm font-semibold text-amber-700 tabular-nums">
                          {trimSizing.level1} shares
                        </span>
                      </div>
                    )}
                    {zone.type === "TRIM_2" && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-stone-600">Level 2 (35% of tactical)</span>
                          <span className="text-sm font-semibold text-orange-700 tabular-nums">
                            {trimSizing.level2} shares
                          </span>
                        </div>
                        {trimSizing.level3 > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-stone-600">Level 3 (remainder)</span>
                            <span className="text-sm font-semibold text-orange-700 tabular-nums">
                              {trimSizing.level3} shares
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <p className="text-xs text-stone-400 mt-1">
                      Total tactical available: {trimSizing.maxTacticalTrim} shares
                    </p>
                  </div>
                </div>
              )}

              {/* Sources */}
              <div className="pt-4 border-t border-stone-100">
                <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-3">
                  Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Portfolio strategy", "Latest Playbook", "Current market data"].map(
                    (src) => (
                      <span
                        key={src}
                        className="text-xs text-stone-500 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded"
                      >
                        {src}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
