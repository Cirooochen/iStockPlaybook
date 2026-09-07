import type { Stance } from "@/types/playbook";

const stanceConfig: Record<
  Stance,
  { label: string; className: string }
> = {
  HOLD_GRADUALLY_TRIM: {
    label: "HOLD / GRADUALLY TRIM",
    className: "bg-amber-50 text-amber-800 border border-amber-200",
  },
  HOLD_TRIM: {
    label: "HOLD / TRIM",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  HOLD: {
    label: "HOLD",
    className: "bg-stone-100 text-stone-700 border border-stone-200",
  },
  BUILD: {
    label: "BUILD",
    className: "bg-teal-50 text-teal-800 border border-teal-200",
  },
  ADD: {
    label: "ADD SELECTIVELY",
    className: "bg-teal-50 text-teal-800 border border-teal-200",
  },
  REDUCE_RISK: {
    label: "REDUCE RISK",
    className: "bg-orange-50 text-orange-800 border border-orange-200",
  },
  THESIS_REVIEW: {
    label: "THESIS REVIEW",
    className: "bg-red-50 text-red-800 border border-red-200",
  },
  EXIT: {
    label: "EXIT / AVOID",
    className: "bg-red-50 text-red-800 border border-red-200",
  },
};

interface Props {
  stance: Stance;
  size?: "sm" | "md" | "lg";
}

export function StanceBadge({ stance, size = "md" }: Props) {
  const config = stanceConfig[stance];

  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-0.5"
      : size === "lg"
      ? "text-base px-3 py-1.5 font-bold tracking-wide"
      : "text-xs px-2.5 py-1 font-semibold tracking-wide";

  return (
    <span
      className={`inline-flex rounded items-center uppercase ${sizeClass} ${config.className}`}
    >
      {config.label}
    </span>
  );
}
