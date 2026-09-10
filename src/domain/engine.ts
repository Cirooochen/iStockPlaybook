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
  deriveTargetPosition,
  resolveCoreShareRange,
  type TargetPositionResult,
} from "@/domain/portfolio/target-position";
import {
  checkHC001,
  checkHC002,
  isAccumulationEnabled,
  type HardConstraintResult,
} from "@/domain/playbook/hard-constraints";
import { deriveStance } from "@/domain/playbook/stance-rules";
import { deriveActionZoneState } from "@/domain/playbook/action-zones";
import { recalculateScorecard } from "@/domain/playbook/scoring";
import {
  deriveThesisHealth,
  deriveThesisScoreItem,
  isThesisEligibleForAdd,
} from "@/domain/thesis/thesis";
import { deriveSignals } from "@/domain/signals/signals";
import {
  deriveMomentumEvidenceScoredItem,
  deriveMomentumEligibility,
  type MomentumScoreResult,
} from "@/domain/signals/momentum-score";
import {
  deriveFundamentalsEvidenceScoredItem,
  type FundamentalsScoreResult,
} from "@/domain/signals/fundamentals-score";
// Re-exported so PlaybookClientShell (and other engine callers) can type
// their own momentumResult/fundamentalsResult prop/argument without
// importing @/domain/signals/momentum-score or
// @/domain/signals/fundamentals-score directly — keeps "the shell only
// imports @/domain/engine" true in spirit, not just by the letter of the
// orchestration guardrail (src/components/playbook/PlaybookClientShell.orchestration.test.ts).
export type { MomentumScoreResult, FundamentalsScoreResult };

export interface EngineInput {
  position: Position;
  portfolioTotalEur: number;
  executionPriceEur: number;
  strategy: Strategy;
  /** Raw seed value — the thesis seam resolves this to the engine's thesis.health. */
  thesisHealth: ThesisHealth;
  scorecard: Scorecard;
  actionZoneTemplates: ActionZone[];
  /**
   * Pre-computed momentum evidence (Twelve Data -> C.8A mappers ->
   * derived signals -> scoreMomentum, all run by the caller BEFORE
   * invoking the engine — see
   * docs/phase-d0-momentum-scorecard-integration-design.md §2.1). The
   * engine never computes this itself and stays market-data-free.
   * Optional: every existing caller that has no live momentum data yet
   * gets byte-for-byte unchanged behavior when this is omitted.
   */
  momentumResult?: MomentumScoreResult;
  /**
   * Pre-computed fundamentals evidence (a raw-data pipeline ->
   * GROWTH_SOFTWARE_TEMPLATE -> scoreFundamentals, all run by the
   * caller BEFORE invoking the engine — see
   * docs/phase-e3-fundamentals-scorecard-integration-design.md §1.2).
   * The engine never computes this itself and stays market-data-free,
   * mirroring momentumResult exactly. Optional: every existing caller
   * that has no live fundamentals data yet gets byte-for-byte unchanged
   * behavior when this is omitted.
   */
  fundamentalsResult?: FundamentalsScoreResult;
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
  /**
   * Target Position & Sizing Model (spec §21A) — capacity, not a
   * recommendation. Complements `concentration`, does not replace it: this
   * classifies position size relative to the target weight range (and, when
   * aligned, the core range together), separate from ConcentrationState's
   * overweight-severity classification which drives stance.
   */
  targetPosition: TargetPositionResult;
  /**
   * Echoes EngineInput.momentumResult verbatim (same pass-through
   * pattern as `thesis.health`) — the canonical, full-fidelity source
   * for momentum evidence/coverage (component breakdown, applicable/
   * available/missing weight). `scorecard.momentum` is a lossy summary
   * derived from this when SCORED; this field is where the full picture
   * — including WHY a score might be INSUFFICIENT_DATA — lives. See
   * docs/phase-d0-momentum-scorecard-integration-design.md §2.2/§6.
   */
  momentumResult?: MomentumScoreResult;
  /**
   * Echoes EngineInput.fundamentalsResult verbatim (same pass-through
   * pattern as momentumResult/thesis.health) — the canonical,
   * full-fidelity source for fundamentals evidence/coverage.
   * `scorecard.fundamentals` is a lossy summary derived from this when
   * SCORED; this field is where the full picture — including WHY a
   * score might be INSUFFICIENT_DATA — lives. `scorecard.fundamentals`
   * is NOT the canonical evidence-status source; this field is. See
   * docs/phase-e3-fundamentals-scorecard-integration-design.md §1.5.
   */
  fundamentalsResult?: FundamentalsScoreResult;
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
  const addEligibility = {
    accumulationEnabled,
    thesisEligible: isThesisEligibleForAdd(thesisHealth),
    // Phase D.5 — defensive-only timing gate, see AddEligibility's doc
    // comment / docs/phase-d4-momentum-decision-influence-design.md §8.
    momentumEligible: deriveMomentumEligibility(input.momentumResult),
  };
  const actionZones: ActionZone[] = actionZoneTemplates.map((zone) => ({
    ...zone,
    state: deriveActionZoneState(zone.type, concentrationState, addEligibility),
  }));

  const recalculatedScorecard = recalculateScorecard(
    scorecard,
    position.portfolioWeightPct,
    strategy.mediumTermTargetMaxPct,
    concentrationState
  );

  // Momentum — Phase D.0/D.1 integration. deriveMomentumEvidenceScoredItem
  // never fabricates a score for INSUFFICIENT_DATA; the transitional
  // handling below is what decides what the LEGACY ScoreItem-shaped
  // scorecard.momentum shows in that case (docs/phase-d0-momentum-
  // scorecard-integration-design.md §6): when there is no SCORED result —
  // either momentumResult was never supplied, or it was supplied and came
  // back INSUFFICIENT_DATA — the field is simply left at today's existing
  // pass-through value, never actively re-encoded as a stale-but-fresh
  // -looking score. The canonical distinction always remains available on
  // the returned momentumResult below, never lost.
  const momentumEvidence = input.momentumResult
    ? deriveMomentumEvidenceScoredItem(input.momentumResult)
    : undefined;
  const momentumScoreItem =
    momentumEvidence?.status === "SCORED" ? momentumEvidence.item : signals.momentum;

  // Fundamentals — Phase E.3/E.4 integration, exact mirror of the
  // momentum block above. deriveFundamentalsEvidenceScoredItem never
  // fabricates a score for INSUFFICIENT_DATA; when there is no SCORED
  // result — either fundamentalsResult was never supplied, or it was
  // supplied and came back INSUFFICIENT_DATA — scorecard.fundamentals
  // simply stays at today's existing pass-through value, never actively
  // re-encoded as a stale-but-fresh-looking score. The canonical
  // distinction always remains available on the returned
  // fundamentalsResult below (docs/phase-e3-fundamentals-scorecard-
  // integration-design.md §1.3/§1.4/§1.5).
  const fundamentalsEvidence = input.fundamentalsResult
    ? deriveFundamentalsEvidenceScoredItem(input.fundamentalsResult)
    : undefined;
  const fundamentalsScoreItem =
    fundamentalsEvidence?.status === "SCORED" ? fundamentalsEvidence.item : signals.fundamentals;

  const finalScorecard: Scorecard = {
    ...recalculatedScorecard,
    fundamentals: fundamentalsScoreItem,
    valuation: signals.valuation,
    momentum: momentumScoreItem,
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

  // Old §21 trim-sizing pipeline is core-range-specific and untouched
  // (staging logic not refactored per B.5.1 Resolution prerequisite #3).
  // With no core range configured, there is no core-based tactical
  // inventory to report — zeroed rather than invented.
  const coreShareRange = resolveCoreShareRange(strategy.coreSharesMin, strategy.coreSharesMax);
  const tacticalInventory = coreShareRange
    ? calcTacticalInventory(position.shares, coreShareRange.max, coreShareRange.min)
    : { aboveCoreMax: 0, maxSellToCore: position.shares };
  const trimSizing = calcTrimSizing(tacticalInventory.aboveCoreMax);

  // Target Position & Sizing — spec §21A. A separate, generic model from
  // the concentration/trimSizing pipeline above; not yet consumed by it.
  // See the B.5.1 Resolution report for the overlap this creates with
  // concentration.trimSizing.
  const targetPosition = deriveTargetPosition({
    currentShares: position.shares,
    currentWeightPct: position.portfolioWeightPct,
    portfolioTotalEur,
    priceEur: executionPriceEur,
    targetWeightMinPct: strategy.mediumTermTargetMinPct,
    targetWeightMaxPct: strategy.mediumTermTargetMaxPct,
    coreShareRange,
    preferredTargetWeightPct: strategy.preferredTargetWeightPct,
  });

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
    targetPosition,
    momentumResult: input.momentumResult,
    fundamentalsResult: input.fundamentalsResult,
  };
}
