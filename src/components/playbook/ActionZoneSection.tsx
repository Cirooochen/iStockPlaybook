import type { ActionZone } from "@/types/playbook";
import { ActionZoneCard } from "./ActionZoneCard";

interface Props {
  zones: ActionZone[];
}

export function ActionZoneSection({ zones }: Props) {
  return (
    <section className="mb-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-stone-800">
          Your Action Framework
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">
          These are planning conditions, not automatic trade instructions.
        </p>
      </div>

      <div className="space-y-2">
        {zones.map((zone) => (
          <ActionZoneCard
            key={zone.type}
            zone={zone}
            defaultOpen={zone.type === "HOLD"}
          />
        ))}
      </div>
    </section>
  );
}
