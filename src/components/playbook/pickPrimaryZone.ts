import type { ActionZone } from "@/types/playbook";

// Presentation-layer selection among already-computed real zone states —
// not a new classification. The domain model allows more than one zone
// to be ACTIVE at once (HOLD is unconditionally always ACTIVE per
// deriveActionZoneState; ADD or TRIM_1 can be ACTIVE at the same time
// depending on concentration), so the Primary Action card needs a
// tie-break: prefer an ACTIVE non-HOLD zone (an actual actionable
// trim/add) if one exists, else fall back to HOLD (also always
// ACTIVE, so this never returns undefined given the five real zone
// templates this project always provides).
export function pickPrimaryZone(zones: ActionZone[]): ActionZone {
  const actionableActive = zones.find((z) => z.state === "ACTIVE" && z.type !== "HOLD");
  if (actionableActive) return actionableActive;

  const hold = zones.find((z) => z.type === "HOLD");
  return hold ?? zones[0];
}
