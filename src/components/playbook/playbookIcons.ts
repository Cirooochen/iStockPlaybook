// Stable icon families — Phase F.3 (PLAYBOOK_INTERFACE_PRINCIPLES.md §16
// Semantic Visual Language). One source of truth per family so the same
// concept always renders the same icon everywhere it appears, instead of
// each component picking its own (the pre-F.3 convention — see e.g. the
// two separate `X` close-icon imports in ActionZoneDrawer/AddTransactionModal).
//
// Action-type icons stay a neutral ink color wherever they're rendered —
// shape carries "what", not color. Only the state-icon family carries
// status color, keeping status color restrained to one channel (§14/§16).
// Icons are always paired with the existing text labels (zone titles,
// `stateLabel`) — never a replacement for them, per §16's guardrail.
import {
  BarChart3,
  CheckCircle2,
  Clock,
  GitBranch,
  Lock,
  Minus,
  PieChart,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ActionZoneState, ActionZoneType, Scorecard } from "@/types/playbook";

// TRIM_1 and TRIM_2 intentionally share one icon — same action family,
// different level (a small level badge distinguishes them where shown,
// e.g. PrimaryActionCard) — never a separate icon per level (§16.1).
export const actionZoneIcon: Record<ActionZoneType, LucideIcon> = {
  ADD: Plus,
  HOLD: Minus,
  TRIM_1: TrendingDown,
  TRIM_2: TrendingDown,
  THESIS_REVIEW: Search,
};

export const zoneStateIcon: Record<ActionZoneState, LucideIcon> = {
  ACTIVE: CheckCircle2,
  WATCH: Clock,
  INACTIVE: Lock,
  CONDITIONAL: GitBranch,
};

export const reasoningCategoryIcon: Record<keyof Scorecard, LucideIcon> = {
  fundamentals: BarChart3,
  valuation: Scale,
  momentum: TrendingUp,
  thesisHealth: Target,
  positionFit: PieChart,
  concentrationRisk: ShieldAlert,
};
