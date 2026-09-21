"use client";

import { useState } from "react";
import type { ActionZone } from "@/types/playbook";
import type { TrimSizing } from "@/domain/portfolio/concentration";
import type { HardConstraintResult } from "@/domain/playbook/hard-constraints";
import { ActionZoneCard } from "./ActionZoneCard";
import { ActionZoneDrawer } from "./ActionZoneDrawer";

interface Props {
  zones: ActionZone[];
  trimSizing: TrimSizing;
  firedConstraints: HardConstraintResult[];
}

export function ActionZoneSection({ zones, trimSizing, firedConstraints }: Props) {
  const [selectedZone, setSelectedZone] = useState<ActionZone | null>(null);

  function handleCardClick(zone: ActionZone) {
    setSelectedZone((prev) => (prev?.type === zone.type ? null : zone));
  }

  return (
    <section className="mb-6 pb-6 border-b border-stone-200">
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-stone-700">
          Your Action Framework
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">
          These are planning conditions, not automatic trade instructions.
        </p>
      </div>
      <div className="divide-y divide-stone-100">
        {zones.map((zone) => (
          <ActionZoneCard
            key={zone.type}
            zone={zone}
            isSelected={selectedZone?.type === zone.type}
            onClick={() => handleCardClick(zone)}
          />
        ))}
      </div>
      <ActionZoneDrawer
        zone={selectedZone}
        onClose={() => setSelectedZone(null)}
        trimSizing={trimSizing}
        firedConstraints={firedConstraints}
      />
    </section>
  );
}
