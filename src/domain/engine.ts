// Decision Engine — spec §37 domain/playbook/decision-engine.ts
// Composes the existing Phase A/B pipeline into one pure, React-free function.
// This is the single seam PlaybookClientShell calls — it must not contain any
// investment logic itself, only sequencing of the existing domain functions.
import type {
  ActionZone,
  Position,
  Scorecard,
  Strategy,
  ThesisHealth,
  Stance,
} from "@/types/playbook";
import {
  classifyConcentration,
  calcTargetShares,
  calcTacticalInventory,
  calcTrimSizing,
  type ConcentrationState,
  type TacticalInventory,
  type TrimSizing,
} from "@/domain/portfolio/concentration";
import {
  checkHC001,
  checkHC002,
  isAccumulationEnabled,
  type HardConstraintResult,
} from "@/domain/playbook/hard-constraints";
import { deriveStance } from "@/domain/playbook/stance-rules";
import { deriveActionZoneState } from "@/domain/playbook/action-zones";
import { recalculateScorecard } from "@/domain/playbook/scoring";
import { deriveThesisHealth, deriveThesisScoreItem } from "@/domain/thesis/thesis";
import { deriveSignals } from "@/domain/signals/signals";

export interface EngineInput {
  position: Position;
  portfolioTotalEur: number;
  executionPriceEur: number;
  strategy: Strategy;
  /** Raw seed value — the thesis seam resolves this to the engine's thesis.health. */
  thesisHealth: ThesisHealth;
  scorecard: Scorecard;
  actionZoneTemplates: ActionZone[];
}

export interface ConcentrationView {
  state: ConcentrationState;
  targetShares: number;
  sharesToTarget: number;
  tacticalInventory: TacticalInventory;
  trimSizing: TrimSizing;
}

export interface ThesisView {
  health: ThesisHealth;
}

export interface ConstraintsView {
  hc001: HardConstraintResult;
  hc002: HardConstraintResult;
  fired: HardConstraintResult[];
  accumulationEnabled: boolean;
}

export interface EngineOutput {
  concentration: ConcentrationView;
  thesis: ThesisView;
  constraints: ConstraintsView;
  stance: Stance;
  actionZones: ActionZone[];
  scorecard: Scorecard;
}

// Wraps engine output with the mutable inputs it was computed from — for
// future Playbook snapshots/history. Deliberately NOT part of EngineOutput:
// the engine decides things about a position, it does not own or echo it.
export interface PlaybookSnapshot {
  position: Position;
  portfolioTotalEur: number;
  engine: EngineOutput;
}

export function runDecisionEngine(input: EngineInput): EngineOutput {
  const {
    position,
    portfolioTotalEur,
    executionPriceEur,
    strategy,
    scorecard,
    actionZoneTemplates,
  } = input;

  // Thesis — canonical source of truth for thesis health.
  const thesisHealth = deriveThesisHealth(input.thesisHealth);

  // Signals (fundamentals / valuation / technical) — pass-through until Phase C
  const signals = deriveSignals(scorecard);

  // Portfolio / Concentration
  const concentrationState = classifyConcentration(
    position.portfolioWeightPct,
    strategy.mediumTermTargetMaxPct
  );

  // Hard Constraints
  const hc001 = checkHC001(
    position.portfolioWeightPct,
    strategy.shortTermMaxWeightPct
  );
  const hc002 = checkHC002(thesisHealth);
  const accumulationEnabled = isAccumulationEnabled(hc001, hc002);
  const fired = [hc001, hc002].filter((c) => c.triggered);

  // Decision
  const stance = deriveStance(concentrationState, thesisHealth);

  // Action
  const actionZones: ActionZone[] = actionZoneTemplates.map((zone) => ({
    ...zone,
    state: deriveActionZoneState(zone.type, concentrationState, accumulationEnabled),
  }));

  const recalculatedScorecard = recalculateScorecard(
    scorecard,
    position.portfolioWeightPct,
    strategy.mediumTermTargetMaxPct,
    concentrationState
  );
  const finalScorecard: Scorecard = {
    ...recalculatedScorecard,
    fundamentals: signals.fundamentals,
    valuation: signals.valuation,
    momentum: signals.momentum,
    // Derived from the canonical thesisHealth above — never independently
    // seeded, so it cannot drift out of sync with thesis.health.
    thesisHealth: deriveThesisScoreItem(thesisHealth),
  };

  const targetShares = calcTargetShares(
    portfolioTotalEur,
    strategy.mediumTermTargetMaxPct,
    executionPriceEur
  );
  const sharesToTarget = Math.max(0, position.shares - targetShares);

  const tacticalInventory = calcTacticalInventory(
    position.shares,
    strategy.coreSharesMax,
    strategy.coreSharesMin
  );
  const trimSizing = calcTrimSizing(tacticalInventory.aboveCoreMax);

  return {
    concentration: {
      state: concentrationState,
      targetShares,
      sharesToTarget,
      tacticalInventory,
      trimSizing,
    },
    thesis: { health: thesisHealth },
    constraints: { hc001, hc002, fired, accumulationEnabled },
    stance,
    actionZones,
    scorecard: finalScorecard,
  };
}
