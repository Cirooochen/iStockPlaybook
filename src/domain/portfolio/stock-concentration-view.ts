// Portfolio-page concentration view for a STOCK holding — Phase G.2,
// extended in G.6 to also derive the live stance.
// Bridges a HoldingSnapshot to the existing concentration domain
// (classifyConcentration) without running the Stock Position Engine
// (src/domain/engine.ts is untouched) — this is Portfolio's own
// "market value, total portfolio value, weight, and concentration"
// responsibility (brief §7), not a Playbook decision.
import type { HoldingSnapshot, PortfolioValuation, StockPlaybookConfig } from "@/types/portfolio";
import type { Stance } from "@/types/playbook";
import { classifyConcentration, type ConcentrationState } from "@/domain/portfolio/concentration";
import { holdingWeightPct } from "@/domain/portfolio/snapshot";
import { deriveStance } from "@/domain/playbook/stance-rules";

export interface StockConcentrationView {
  weightPct: number;
  state: ConcentrationState;
  targetMaxPct: number;
  // The CURRENT stance, derived live from this weight + the stored
  // thesisHealth via the same deriveStance the Stock Engine uses — never
  // config.playbook.stance, which is only whatever the Playbook last
  // happened to record and goes stale the moment the portfolio changes
  // (G.6 — Portfolio and Stock Detail must share one decision source of
  // truth, not just one ownership source of truth).
  stance: Stance;
}

// Only meaningful for a STOCK holding with a linked StockPlaybookConfig
// (brief §1/§14 — only STOCK supports the Playbook, and a target-based
// concentration state is a Strategy concept, not a generic portfolio one).
// Returns null when weight isn't authoritative (valuation not COMPLETE, or
// this holding's own value unavailable) or no config is linked — never
// fabricates a state (or a stance) from a partial weight.
export function deriveStockConcentrationView(
  holding: HoldingSnapshot,
  valuation: PortfolioValuation,
  config: StockPlaybookConfig | undefined
): StockConcentrationView | null {
  if (!config) return null;
  if (holding.instrument.assetType !== "STOCK") return null;

  const weightPct = holdingWeightPct(holding, valuation);
  if (weightPct === null) return null;

  const targetMaxPct = config.strategy.mediumTermTargetMaxPct;
  const state = classifyConcentration(weightPct, targetMaxPct);
  // deriveThesisHealth (src/domain/thesis/thesis.ts) is a documented
  // identity pass-through of the stored thesisHealth, so this matches
  // runDecisionEngine's own stance derivation exactly, without running the
  // rest of the engine.
  const stance = deriveStance(state, config.playbook.thesisHealth);
  return { weightPct, state, targetMaxPct, stance };
}
