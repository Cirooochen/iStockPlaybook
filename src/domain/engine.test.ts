import { describe, expect, it } from "vitest";
import {
  runDecisionEngine,
  type EngineInput,
  type EngineOutput,
  type PlaybookSnapshot,
} from "@/domain/engine";
import {
  classifyConcentration,
  calcTargetShares,
  calcTacticalInventory,
  calcTrimSizing,
} from "@/domain/portfolio/concentration";
import {
  checkHC001,
  checkHC002,
  isAccumulationEnabled,
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
import { deriveTargetPosition, resolveCoreShareRange } from "@/domain/portfolio/target-position";
import {
  applyBuy,
  applySell,
  calcPortfolioTotalAfterBuy,
  calcPortfolioTotalAfterSell,
} from "@/domain/portfolio/accounting";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { ActionZone, Position, Scorecard, Strategy, ThesisHealth } from "@/types/playbook";

// Mirrors the pipeline that used to be sequenced inline in
// PlaybookClientShell.tsx (before it called the engine). Used as an
// independent oracle: if the engine ever drifts from composing the
// unmodified domain functions (including the thesis/signals seams) the same
// way, this comparison catches it.
function runManualPipeline(input: EngineInput): EngineOutput {
  const {
    position,
    portfolioTotalEur,
    executionPriceEur,
    strategy,
    scorecard,
    actionZoneTemplates,
  } = input;

  const thesisHealth = deriveThesisHealth(input.thesisHealth);
  const signals = deriveSignals(scorecard);

  const concentrationState = classifyConcentration(
    position.portfolioWeightPct,
    strategy.mediumTermTargetMaxPct
  );
  const hc001 = checkHC001(position.portfolioWeightPct, strategy.shortTermMaxWeightPct);
  const hc002 = checkHC002(thesisHealth);
  const accumulationEnabled = isAccumulationEnabled(hc001, hc002);
  const fired = [hc001, hc002].filter((c) => c.triggered);
  const stance = deriveStance(concentrationState, thesisHealth);
  const addEligibility = {
    accumulationEnabled,
    thesisEligible: isThesisEligibleForAdd(thesisHealth),
    momentumEligible: deriveMomentumEligibility(input.momentumResult),
  };
  const actionZones: ActionZone[] = actionZoneTemplates.map((zone) => ({
    ...zone,
    state: deriveActionZoneState(zone.type, concentrationState, addEligibility),
  }));
  const recalculated = recalculateScorecard(
    scorecard,
    position.portfolioWeightPct,
    strategy.mediumTermTargetMaxPct,
    concentrationState
  );
  const momentumEvidence = input.momentumResult
    ? deriveMomentumEvidenceScoredItem(input.momentumResult)
    : undefined;
  const momentumScoreItem =
    momentumEvidence?.status === "SCORED" ? momentumEvidence.item : signals.momentum;
  const fundamentalsEvidence = input.fundamentalsResult
    ? deriveFundamentalsEvidenceScoredItem(input.fundamentalsResult)
    : undefined;
  const fundamentalsScoreItem =
    fundamentalsEvidence?.status === "SCORED" ? fundamentalsEvidence.item : signals.fundamentals;
  const scorecardOut: Scorecard = {
    ...recalculated,
    fundamentals: fundamentalsScoreItem,
    valuation: signals.valuation,
    momentum: momentumScoreItem,
    thesisHealth: deriveThesisScoreItem(thesisHealth),
  };
  const targetShares = calcTargetShares(
    portfolioTotalEur,
    strategy.mediumTermTargetMaxPct,
    executionPriceEur
  );
  const sharesToTarget = Math.max(0, position.shares - targetShares);
  const coreShareRange = resolveCoreShareRange(strategy.coreSharesMin, strategy.coreSharesMax);
  const tacticalInventory = coreShareRange
    ? calcTacticalInventory(position.shares, coreShareRange.max, coreShareRange.min)
    : { aboveCoreMax: 0, maxSellToCore: position.shares };
  const trimSizing = calcTrimSizing(tacticalInventory.aboveCoreMax);
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
    scorecard: scorecardOut,
    targetPosition,
    momentumResult: input.momentumResult,
    fundamentalsResult: input.fundamentalsResult,
  };
}

const baseStrategy: Strategy = {
  horizon: "test horizon",
  shortTermMaxWeightPct: 30,
  mediumTermTargetMinPct: 15,
  mediumTermTargetMaxPct: 20,
  coreSharesMin: 400,
  coreSharesMax: 500,
  tacticalSharesMin: 100,
  tacticalSharesMax: 150,
};

const baseScorecard: Scorecard = {
  fundamentals: { score: 6, state: "Neutral" },
  valuation: { score: 6, state: "Neutral" },
  momentum: { score: 6, state: "Neutral" },
  thesisHealth: { score: 6, state: "Intact" },
  positionFit: { score: 6, state: "Neutral" },
  concentrationRisk: { score: 6, state: "Neutral" },
};

const baseZoneTemplates: ActionZone[] = [
  { type: "ADD", state: "INACTIVE", title: "ADD", summary: "" },
  { type: "HOLD", state: "INACTIVE", title: "HOLD", summary: "" },
  { type: "TRIM_1", state: "INACTIVE", title: "TRIM_1", summary: "" },
  { type: "TRIM_2", state: "INACTIVE", title: "TRIM_2", summary: "" },
  { type: "THESIS_REVIEW", state: "INACTIVE", title: "THESIS_REVIEW", summary: "" },
];

function buildInput(overrides: Partial<EngineInput> & { position: Position }): EngineInput {
  return {
    portfolioTotalEur: 25000,
    executionPriceEur: 10,
    strategy: baseStrategy,
    thesisHealth: "INTACT",
    scorecard: baseScorecard,
    actionZoneTemplates: baseZoneTemplates,
    ...overrides,
  };
}

function unityInput(): EngineInput {
  return {
    position: unitySeed.position,
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: unitySeed.market.executionPriceEur,
    strategy: unitySeed.strategy,
    thesisHealth: unitySeed.playbook.thesisHealth,
    scorecard: unityScorecard,
    actionZoneTemplates: unityActionZones,
  };
}

describe("runDecisionEngine — regression vs. the original inline pipeline", () => {
  it("matches the manual pipeline for the Unity production baseline", () => {
    const input = unityInput();
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });

  it("matches the manual pipeline after a BUY", () => {
    const startPosition: Position = {
      shares: 500,
      averageCostEur: 10,
      valueEur: 5000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 20,
    };
    const newPosition = applyBuy(startPosition, { shares: 300, priceEur: 10 }, 10, 25000);
    const newPortfolioTotal = calcPortfolioTotalAfterBuy(25000);
    const input = buildInput({ position: newPosition, portfolioTotalEur: newPortfolioTotal });

    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });

  it("matches the manual pipeline after a SELL", () => {
    const startPosition: Position = {
      shares: 500,
      averageCostEur: 10,
      valueEur: 5000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 20,
    };
    const { position: newPosition } = applySell(startPosition, { shares: 150, priceEur: 12 }, 10, 25000);
    const newPortfolioTotal = calcPortfolioTotalAfterSell(25000);
    const input = buildInput({ position: newPosition, portfolioTotalEur: newPortfolioTotal });

    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });
});

describe("runDecisionEngine — Unity baseline output is unchanged after the regroup", () => {
  it("Unity baseline: SEVERELY_OVERWEIGHT, HC-001 fired, HOLD_GRADUALLY_TRIM", () => {
    const output = runDecisionEngine(unityInput());

    expect(output.concentration.state).toBe("SEVERELY_OVERWEIGHT");
    expect(output.stance).toBe("HOLD_GRADUALLY_TRIM");
    expect(output.constraints.fired.map((c) => c.code)).toEqual(["HC-001"]);
    expect(output.constraints.accumulationEnabled).toBe(false);
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("INACTIVE");
    expect(output.thesis.health).toBe("INTACT");

    // Same figures the pre-regroup flat EngineOutput asserted.
    expect(output.concentration.targetShares).toBe(692);
    expect(output.concentration.sharesToTarget).toBe(210);
    expect(output.concentration.tacticalInventory).toEqual({
      aboveCoreMax: 252,
      maxSellToCore: 302,
    });
    expect(output.concentration.trimSizing).toEqual({
      level1: 76,
      level2: 88,
      level3: 88,
      maxTacticalTrim: 252,
    });
    expect(output.scorecard.positionFit).toEqual({ score: 4, state: "Neutral" });
    expect(output.scorecard.concentrationRisk).toEqual({ score: 2, state: "Elevated" });
  });

  it("BUY scenario: increases shares and pushes concentration out of target", () => {
    const startPosition: Position = {
      shares: 500,
      averageCostEur: 10,
      valueEur: 5000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 20,
    };
    const newPosition = applyBuy(startPosition, { shares: 100, priceEur: 10 }, 10, 25000);
    const newPortfolioTotal = calcPortfolioTotalAfterBuy(25000);
    const output = runDecisionEngine(
      buildInput({ position: newPosition, portfolioTotalEur: newPortfolioTotal })
    );

    expect(newPosition.shares).toBe(600);
    expect(output.concentration.state).not.toBe("WITHIN_TARGET");
  });

  it("SELL scenario: decreases shares and brings concentration back within target", () => {
    const startPosition: Position = {
      shares: 700,
      averageCostEur: 10,
      valueEur: 7000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 25.9,
    };
    expect(
      classifyConcentration(startPosition.portfolioWeightPct, baseStrategy.mediumTermTargetMaxPct)
    ).not.toBe("WITHIN_TARGET");

    const { position: newPosition } = applySell(startPosition, { shares: 200, priceEur: 10 }, 10, 27000);
    const newPortfolioTotal = calcPortfolioTotalAfterSell(27000);
    const output = runDecisionEngine(
      buildInput({ position: newPosition, portfolioTotalEur: newPortfolioTotal })
    );

    expect(newPosition.shares).toBe(500);
    expect(output.concentration.state).toBe("WITHIN_TARGET");
  });

  it("overweight concentration state disables ADD and puts TRIM_1 on watch", () => {
    const position: Position = {
      shares: 600,
      averageCostEur: 10,
      valueEur: 6000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 24, // target 20 × 1.15=23 < 24 <= 20 × 1.30=26 → OVERWEIGHT
    };
    const output = runDecisionEngine(buildInput({ position }));

    expect(output.concentration.state).toBe("OVERWEIGHT");
    expect(output.actionZones.find((z) => z.type === "TRIM_1")?.state).toBe("WATCH");
  });

  it("ADD is disabled by HC-001 even when concentration is within target", () => {
    const position: Position = {
      shares: 500,
      averageCostEur: 10,
      valueEur: 5000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 20,
    };
    const strategy: Strategy = { ...baseStrategy, shortTermMaxWeightPct: 15 };
    const output = runDecisionEngine(buildInput({ position, strategy }));

    expect(output.concentration.state).toBe("WITHIN_TARGET");
    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.accumulationEnabled).toBe(false);
    expect(output.actionZones.find((z) => z.type === "ADD")?.state).toBe("INACTIVE");
  });

  it("HOLD/TRIM stance for OVERWEIGHT concentration with intact thesis", () => {
    const position: Position = {
      shares: 600,
      averageCostEur: 10,
      valueEur: 6000,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 24,
    };
    const output = runDecisionEngine(buildInput({ position }));

    expect(output.concentration.state).toBe("OVERWEIGHT");
    expect(output.stance).toBe("HOLD_TRIM");
  });

  it("tactical trim sizing splits the above-core-max inventory into staged levels", () => {
    const position: Position = {
      shares: 620,
      averageCostEur: 10,
      valueEur: 6200,
      unrealizedReturnPct: 0,
      portfolioWeightPct: 24.8,
    };
    const output = runDecisionEngine(buildInput({ position }));

    // aboveCoreMax = 620 shares - coreSharesMax(500) = 120
    expect(output.concentration.tacticalInventory.aboveCoreMax).toBe(120);
    expect(output.concentration.trimSizing).toEqual({
      level1: 36, // round(120 * 0.30)
      level2: 42, // round(120 * 0.35)
      level3: 42, // remainder
      maxTacticalTrim: 120,
    });
  });
});

describe("thesis health cannot diverge between engine.thesis and engine.scorecard", () => {
  const cases: ThesisHealth[] = ["STRENGTHENING", "INTACT", "MIXED", "WEAKENING", "BROKEN"];

  it.each(cases)(
    "scorecard.thesisHealth always matches the canonical thesis.health for %s",
    (health) => {
      const position: Position = {
        shares: 500,
        averageCostEur: 10,
        valueEur: 5000,
        unrealizedReturnPct: 0,
        portfolioWeightPct: 20,
      };
      // Deliberately stale/wrong seed value — proves the engine ignores it
      // and derives scorecard.thesisHealth from thesis.health instead.
      const staleScorecard: Scorecard = {
        ...baseScorecard,
        thesisHealth: { score: 0, state: "Weak" },
      };
      const output = runDecisionEngine(
        buildInput({ position, thesisHealth: health, scorecard: staleScorecard })
      );

      expect(output.thesis.health).toBe(health);
      expect(output.scorecard.thesisHealth).toEqual(deriveThesisScoreItem(health));
      expect(output.scorecard.thesisHealth).not.toEqual(staleScorecard.thesisHealth);
    }
  );
});

describe("runDecisionEngine — Phase D.1 momentum -> Scorecard integration", () => {
  const position: Position = {
    shares: 500,
    averageCostEur: 10,
    valueEur: 5000,
    unrealizedReturnPct: 0,
    portfolioWeightPct: 20,
  };

  const SCORED_RESULT: MomentumScoreResult = {
    status: "SCORED",
    overall: { score: 8, state: "Positive" },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };

  const INSUFFICIENT_RESULT: MomentumScoreResult = {
    status: "INSUFFICIENT_DATA",
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
  };

  it("momentumResult absent -> scorecard.momentum unchanged (today's exact pass-through), EngineOutput.momentumResult stays undefined", () => {
    const output = runDecisionEngine(buildInput({ position }));
    expect(output.scorecard.momentum).toEqual(baseScorecard.momentum);
    expect(output.momentumResult).toBeUndefined();
  });

  it("momentumResult SCORED -> scorecard.momentum equals result.overall exactly", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: SCORED_RESULT }));
    expect(output.scorecard.momentum).toEqual(SCORED_RESULT.overall);
    expect(output.scorecard.momentum).not.toEqual(baseScorecard.momentum);
  });

  it("momentumResult INSUFFICIENT_DATA -> scorecard.momentum equals today's pass-through value, identical to the absent case — never fabricated", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: INSUFFICIENT_RESULT }));
    expect(output.scorecard.momentum).toEqual(baseScorecard.momentum);
  });

  it("EngineOutput.momentumResult echoes EngineInput.momentumResult exactly, in every case", () => {
    const scored = runDecisionEngine(buildInput({ position, momentumResult: SCORED_RESULT }));
    expect(scored.momentumResult).toBe(SCORED_RESULT);

    const insufficient = runDecisionEngine(buildInput({ position, momentumResult: INSUFFICIENT_RESULT }));
    expect(insufficient.momentumResult).toBe(INSUFFICIENT_RESULT);

    const absent = runDecisionEngine(buildInput({ position }));
    expect(absent.momentumResult).toBeUndefined();
  });

  it("matches the independent manual-pipeline oracle with a SCORED momentumResult", () => {
    const input = buildInput({ position, momentumResult: SCORED_RESULT });
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });

  it("matches the independent manual-pipeline oracle with an INSUFFICIENT_DATA momentumResult", () => {
    const input = buildInput({ position, momentumResult: INSUFFICIENT_RESULT });
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });
});

describe("runDecisionEngine — Phase E.3/E.4 fundamentals -> Scorecard integration", () => {
  const position: Position = {
    shares: 500,
    averageCostEur: 10,
    valueEur: 5000,
    unrealizedReturnPct: 0,
    portfolioWeightPct: 20,
  };

  const SCORED_FUNDAMENTALS: FundamentalsScoreResult = {
    status: "SCORED",
    overall: { score: 8, state: "Positive" },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };

  const INSUFFICIENT_FUNDAMENTALS: FundamentalsScoreResult = {
    status: "INSUFFICIENT_DATA",
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
  };

  it("fundamentalsResult absent -> scorecard.fundamentals unchanged (today's exact pass-through), EngineOutput.fundamentalsResult stays undefined", () => {
    const output = runDecisionEngine(buildInput({ position }));
    expect(output.scorecard.fundamentals).toEqual(baseScorecard.fundamentals);
    expect(output.fundamentalsResult).toBeUndefined();
  });

  it("fundamentalsResult SCORED -> scorecard.fundamentals equals result.overall exactly", () => {
    const output = runDecisionEngine(buildInput({ position, fundamentalsResult: SCORED_FUNDAMENTALS }));
    expect(output.scorecard.fundamentals).toEqual(SCORED_FUNDAMENTALS.overall);
    expect(output.scorecard.fundamentals).not.toEqual(baseScorecard.fundamentals);
  });

  it("fundamentalsResult INSUFFICIENT_DATA -> scorecard.fundamentals equals today's pass-through value, identical to the absent case — never fabricated", () => {
    const output = runDecisionEngine(buildInput({ position, fundamentalsResult: INSUFFICIENT_FUNDAMENTALS }));
    expect(output.scorecard.fundamentals).toEqual(baseScorecard.fundamentals);
  });

  it("EngineOutput.fundamentalsResult echoes EngineInput.fundamentalsResult exactly, in every case — the canonical evidence-status source, not scorecard.fundamentals", () => {
    const scored = runDecisionEngine(buildInput({ position, fundamentalsResult: SCORED_FUNDAMENTALS }));
    expect(scored.fundamentalsResult).toBe(SCORED_FUNDAMENTALS);

    const insufficient = runDecisionEngine(buildInput({ position, fundamentalsResult: INSUFFICIENT_FUNDAMENTALS }));
    expect(insufficient.fundamentalsResult).toBe(INSUFFICIENT_FUNDAMENTALS);

    const absent = runDecisionEngine(buildInput({ position }));
    expect(absent.fundamentalsResult).toBeUndefined();
  });

  it("matches the independent manual-pipeline oracle with a SCORED fundamentalsResult", () => {
    const input = buildInput({ position, fundamentalsResult: SCORED_FUNDAMENTALS });
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });

  it("matches the independent manual-pipeline oracle with an INSUFFICIENT_DATA fundamentalsResult", () => {
    const input = buildInput({ position, fundamentalsResult: INSUFFICIENT_FUNDAMENTALS });
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });

  it("does not interfere with stance, action zones, hard constraints, concentration, target position, or sizing — SCORED fundamentals changes only scorecard.fundamentals", () => {
    const without = runDecisionEngine(buildInput({ position }));
    const withScored = runDecisionEngine(buildInput({ position, fundamentalsResult: SCORED_FUNDAMENTALS }));

    expect(withScored.stance).toBe(without.stance);
    expect(withScored.actionZones).toEqual(without.actionZones);
    expect(withScored.constraints).toEqual(without.constraints);
    expect(withScored.concentration).toEqual(without.concentration);
    expect(withScored.targetPosition).toEqual(without.targetPosition);
    // Every other Scorecard field is untouched; only .fundamentals differs.
    expect({ ...withScored.scorecard, fundamentals: undefined }).toEqual({ ...without.scorecard, fundamentals: undefined });
  });
});

describe("runDecisionEngine — Phase D.5 momentum -> ADD-zone eligibility (defensive-only gate)", () => {
  // WITHIN_TARGET (20% weight === 20% mediumTermTargetMaxPct) + INTACT thesis
  // + accumulation enabled: with momentum absent, ADD is otherwise ACTIVE —
  // exactly the "otherwise-eligible" scenario needed to prove the gate can
  // only ever remove eligibility, never grant it.
  const position: Position = {
    shares: 500,
    averageCostEur: 10,
    valueEur: 5000,
    unrealizedReturnPct: 0,
    portfolioWeightPct: 20,
  };

  const WEAK_RESULT: MomentumScoreResult = {
    status: "SCORED",
    overall: { score: 2, state: "Weak" },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };

  const NEUTRAL_RESULT: MomentumScoreResult = {
    status: "SCORED",
    overall: { score: 5, state: "Neutral" },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };

  const POSITIVE_RESULT: MomentumScoreResult = {
    status: "SCORED",
    overall: { score: 9, state: "Positive" },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };

  const INSUFFICIENT_RESULT: MomentumScoreResult = {
    status: "INSUFFICIENT_DATA",
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
  };

  function addZoneState(output: EngineOutput): string | undefined {
    return output.actionZones.find((z) => z.type === "ADD")?.state;
  }

  it("momentumResult absent -> ADD is otherwise ACTIVE (baseline for every other case in this block)", () => {
    const output = runDecisionEngine(buildInput({ position }));
    expect(addZoneState(output)).toBe("ACTIVE");
  });

  it("momentumResult INSUFFICIENT_DATA -> ADD unaffected, identical to absent", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: INSUFFICIENT_RESULT }));
    expect(addZoneState(output)).toBe("ACTIVE");
  });

  it("momentumResult SCORED Weak -> ADD becomes INACTIVE, the only case that restricts it", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: WEAK_RESULT }));
    expect(addZoneState(output)).toBe("INACTIVE");
  });

  it("momentumResult SCORED Neutral -> ADD stays ACTIVE, unaffected", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: NEUTRAL_RESULT }));
    expect(addZoneState(output)).toBe("ACTIVE");
  });

  it("momentumResult SCORED Positive -> ADD stays ACTIVE — positive momentum is never required to grant it, it was already ACTIVE without momentum", () => {
    const output = runDecisionEngine(buildInput({ position, momentumResult: POSITIVE_RESULT }));
    expect(addZoneState(output)).toBe("ACTIVE");
  });

  it("proves momentum can only REMOVE ADD eligibility, never grant it: SCORED Positive does not rescue an ADD zone that HC-001/thesis would otherwise disable", () => {
    const overweightPosition: Position = { ...position, portfolioWeightPct: 35 }; // > shortTermMaxWeightPct (30) -> HC-001 triggers
    const withoutMomentum = runDecisionEngine(buildInput({ position: overweightPosition }));
    const withPositiveMomentum = runDecisionEngine(
      buildInput({ position: overweightPosition, momentumResult: POSITIVE_RESULT })
    );
    expect(addZoneState(withoutMomentum)).toBe("INACTIVE");
    expect(addZoneState(withPositiveMomentum)).toBe("INACTIVE");
  });

  it("stance, trim zones, sizing, and concentration are all unaffected by momentum in every case above", () => {
    const withoutMomentum = runDecisionEngine(buildInput({ position }));
    const withWeakMomentum = runDecisionEngine(buildInput({ position, momentumResult: WEAK_RESULT }));
    expect(withWeakMomentum.stance).toBe(withoutMomentum.stance);
    expect(withWeakMomentum.concentration).toEqual(withoutMomentum.concentration);
    expect(withWeakMomentum.actionZones.filter((z) => z.type !== "ADD")).toEqual(
      withoutMomentum.actionZones.filter((z) => z.type !== "ADD")
    );
  });

  it("matches the independent manual-pipeline oracle with a SCORED Weak momentumResult", () => {
    const input = buildInput({ position, momentumResult: WEAK_RESULT });
    expect(runDecisionEngine(input)).toEqual(runManualPipeline(input));
  });
});

describe("PlaybookSnapshot", () => {
  it("wraps position/portfolioTotalEur with engine output, without the engine echoing them back", () => {
    const input = unityInput();
    const engineOutput = runDecisionEngine(input);
    const snapshot: PlaybookSnapshot = {
      position: input.position,
      portfolioTotalEur: input.portfolioTotalEur,
      engine: engineOutput,
    };

    expect(snapshot.position).toBe(input.position);
    expect(snapshot.portfolioTotalEur).toBe(input.portfolioTotalEur);
    expect(snapshot.engine).toBe(engineOutput);
    expect(snapshot.engine).not.toHaveProperty("position");
    expect(snapshot.engine).not.toHaveProperty("portfolioTotalEur");
  });
});
