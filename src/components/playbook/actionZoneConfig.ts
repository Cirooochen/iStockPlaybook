import type { ActionZone } from "@/types/playbook";

export const zoneConfig: Record<
  ActionZone["type"],
  { label: string; stateStyle: Record<ActionZone["state"], string> }
> = {
  ADD: {
    label: "ADD",
    stateStyle: {
      ACTIVE: "text-teal-700 bg-teal-50 border-teal-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-700 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
  },
  HOLD: {
    label: "HOLD",
    stateStyle: {
      ACTIVE: "text-stone-700 bg-white border-stone-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-700 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
  },
  TRIM_1: {
    label: "TRIM — LEVEL 1",
    stateStyle: {
      ACTIVE: "text-amber-700 bg-amber-50 border-amber-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-amber-600 bg-amber-50 border-amber-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
  },
  TRIM_2: {
    label: "TRIM — LEVEL 2",
    stateStyle: {
      ACTIVE: "text-orange-700 bg-orange-50 border-orange-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-orange-600 bg-orange-50 border-orange-200",
      CONDITIONAL: "text-stone-500 bg-stone-50 border-stone-200",
    },
  },
  THESIS_REVIEW: {
    label: "THESIS REVIEW",
    stateStyle: {
      ACTIVE: "text-red-700 bg-red-50 border-red-200",
      INACTIVE: "text-stone-400 bg-stone-50 border-stone-200",
      WATCH: "text-orange-700 bg-orange-50 border-orange-200",
      CONDITIONAL: "text-stone-600 bg-stone-100 border-stone-200",
    },
  },
};

export const stateLabel: Record<ActionZone["state"], string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  WATCH: "Watch conditions",
  CONDITIONAL: "Conditional",
};
