// B.5.6 — Contradictions & Failure States
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.6-contradictions-failure-states-report.md.
//
// Validates CURRENT behavior only — no rule/formula changes. Exercises
// real runDecisionEngine() for the contradiction scenarios (§25.1/§25.2)
// and reads real source files for the missing/stale-data scenarios
// (§25.3/§25.4), since no domain code exists yet to exercise there — see
// the report for why that is NOT YET IMPLEMENTED rather than untested.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import * as hardConstraints from "@/domain/playbook/hard-constraints";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { Position, Scorecard, ThesisHealth } from "@/types/playbook";

function buildInput(overrides: {
  weightPct: number;
  thesisHealth: ThesisHealth;
  scorecard: Scorecard;
}): EngineInput {
  const price = unitySeed.market.executionPriceEur;
  const position: Position = {
    shares: 902,
    averageCostEur: 27.76,
    valueEur: 902 * price,
    unrealizedReturnPct: ((price - 27.76) / 27.76) * 100,
    portfolioWeightPct: overrides.weightPct,
  };
  return {
    position,
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: price,
    strategy: unitySeed.strategy,
    thesisHealth: overrides.thesisHealth,
    scorecard: overrides.scorecard,
    actionZoneTemplates: unityActionZones,
  };
}

const zoneState = (output: ReturnType<typeof runDecisionEngine>, type: string) =>
  output.actionZones.find((z) => z.type === type)?.state;

describe("B.5.6.1 — strong fundamentals + momentum, expensive valuation, OVERWEIGHT concentration", () => {
  // 55% weight: OVERWEIGHT relative to the 45% target (45 * 1.15 = 51.75,
  // 45 * 1.30 = 58.5 — see classifyConcentration). Also exceeds the 50%
  // short-term HC-001 ceiling; both are real, expected consequences of a
  // materially overweight position, not a confounded test setup.
  const scorecard: Scorecard = {
    ...unityScorecard,
    fundamentals: { score: 9, state: "Positive" },
    momentum: { score: 9, state: "Positive" },
    valuation: { score: 2, state: "Weak" }, // expensive — low score is "unattractive" per §10 convention
  };
  const input = buildInput({ weightPct: 55, thesisHealth: "INTACT", scorecard });
  const output = runDecisionEngine(input);

  it("each signal dimension passes through independently — none are blended into a single number", () => {
    expect(output.scorecard.fundamentals).toEqual({ score: 9, state: "Positive" });
    expect(output.scorecard.momentum).toEqual({ score: 9, state: "Positive" });
    expect(output.scorecard.valuation).toEqual({ score: 2, state: "Weak" });
    // EngineOutput.scorecard has exactly these six independent dimensions —
    // no "overall"/"composite" field exists anywhere that would average them.
    expect(Object.keys(output.scorecard).sort()).toEqual(
      [
        "concentrationRisk",
        "fundamentals",
        "momentum",
        "positionFit",
        "thesisHealth",
        "valuation",
      ].sort()
    );
  });

  it("concentration is OVERWEIGHT and HC-001 also fires (55% exceeds both the 45% target and the 50% short-term ceiling)", () => {
    expect(output.concentration.state).toBe("OVERWEIGHT");
    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.accumulationEnabled).toBe(false);
  });

  it("stance follows concentration (HOLD_TRIM) — strong fundamentals/momentum and expensive valuation do not move it, because nothing in deriveStance reads them yet", () => {
    expect(output.stance).toBe("HOLD_TRIM");
  });

  it("ADD is INACTIVE and TRIM_1 is WATCH — expensive valuation is visible in the scorecard but does not additionally suppress ADD (it is already INACTIVE via concentration + HC-001)", () => {
    expect(zoneState(output, "ADD")).toBe("INACTIVE");
    expect(zoneState(output, "TRIM_1")).toBe("WATCH");
    expect(zoneState(output, "TRIM_2")).toBe("INACTIVE");
  });
});

describe("B.5.6.2 — strong company signals do not override thesis MIXED for ADD eligibility", () => {
  // WITHIN_TARGET concentration (same fixture shape as B.5.5) isolates the
  // thesis gate from concentration/HC-001 effects.
  const scorecard: Scorecard = {
    ...unityScorecard,
    fundamentals: { score: 9, state: "Positive" },
    valuation: { score: 9, state: "Positive" },
    momentum: { score: 9, state: "Positive" },
  };
  const input = buildInput({ weightPct: 42.2, thesisHealth: "MIXED", scorecard });
  const output = runDecisionEngine(input);

  it("accumulation stays enabled and HC-002 does not fire — MIXED is not BROKEN", () => {
    expect(output.constraints.accumulationEnabled).toBe(true);
    expect(output.constraints.hc002.triggered).toBe(false);
  });

  it("ADD is INACTIVE anyway — spec §22 thesis-eligibility gate (B.5.5) blocks it regardless of how strong fundamentals/valuation/momentum are", () => {
    expect(zoneState(output, "ADD")).toBe("INACTIVE");
  });

  it("stance stays HOLD — MIXED does not escalate stance (only WEAKENING+overweight or BROKEN do)", () => {
    expect(output.stance).toBe("HOLD");
  });

  it("the strong company signals remain visible in the scorecard even though ADD is blocked — the contradiction is preserved, not resolved by silently downgrading the scores", () => {
    expect(output.scorecard.fundamentals.score).toBe(9);
    expect(output.scorecard.valuation.score).toBe(9);
    expect(output.scorecard.momentum.score).toBe(9);
  });
});

describe("B.5.6.3 — missing required signal data has no representation in the domain layer (NOT YET IMPLEMENTED)", () => {
  it("a worst-case (score 0, all dimensions) scorecard still produces a full, unflagged decision — there is no distinct 'unknown' signal, only 'known and bad'", () => {
    const scorecard: Scorecard = {
      fundamentals: { score: 0, state: "Weak" },
      valuation: { score: 0, state: "Weak" },
      momentum: { score: 0, state: "Weak" },
      thesisHealth: { score: 0, state: "Weak" },
      positionFit: { score: 0, state: "Weak" },
      concentrationRisk: { score: 0, state: "Weak" },
    };
    const output = runDecisionEngine(
      buildInput({ weightPct: 42.2, thesisHealth: "INTACT", scorecard })
    );
    // Fully computed, concrete output — no INCOMPLETE/UNKNOWN marker exists
    // to distinguish "we have no data" from "the data is genuinely this bad".
    expect(output.stance).toBe("HOLD");
    expect(zoneState(output, "ADD")).toBe("ACTIVE");
    expect(output.scorecard.fundamentals).toEqual({ score: 0, state: "Weak" });
  });

  it("HC-005 (spec §16 — missing evidence ⇒ Playbook INCOMPLETE) is not implemented — hard-constraints.ts exports only HC-001/002/003", () => {
    expect(typeof (hardConstraints as Record<string, unknown>).checkHC001).toBe("function");
    expect(typeof (hardConstraints as Record<string, unknown>).checkHC002).toBe("function");
    expect(typeof (hardConstraints as Record<string, unknown>).checkHC003).toBe("function");
    expect((hardConstraints as Record<string, unknown>).checkHC004).toBeUndefined();
    expect((hardConstraints as Record<string, unknown>).checkHC005).toBeUndefined();
  });

  it("no field in Scorecard/ScoreItem/MarketData/Position is optional or nullable — 'missing' cannot be expressed at the type level", () => {
    const typesSource = readFileSync(
      path.resolve(process.cwd(), "src/types/playbook.ts"),
      "utf-8"
    );
    const scoreItemBlock = typesSource.slice(
      typesSource.indexOf("interface ScoreItem"),
      typesSource.indexOf("interface Scorecard")
    );
    const scorecardBlock = typesSource.slice(
      typesSource.indexOf("interface Scorecard"),
      typesSource.indexOf("interface Security")
    );
    const marketDataBlock = typesSource.slice(
      typesSource.indexOf("interface MarketData"),
      typesSource.indexOf("interface Position")
    );
    // A `field?:` optional marker or `| null`/`| undefined` union would be
    // the mechanism to express absence — none exists in any of these three.
    for (const block of [scoreItemBlock, scorecardBlock, marketDataBlock]) {
      expect(block).not.toMatch(/\w+\?:/);
      expect(block).not.toMatch(/\| *(null|undefined)/);
    }
  });

  it("no 'INCOMPLETE' state exists anywhere in the Stance/ActionZoneState/Confidence unions", () => {
    const typesSource = readFileSync(
      path.resolve(process.cwd(), "src/types/playbook.ts"),
      "utf-8"
    );
    expect(typesSource).not.toContain("INCOMPLETE");
  });
});

describe("B.5.6.4 — stale market/fundamental data cannot influence engine output (NOT YET IMPLEMENTED)", () => {
  it("EngineInput never carries MarketData.updatedAt — only a bare executionPriceEur number crosses the engine boundary", () => {
    const engineSource = readFileSync(
      path.resolve(process.cwd(), "src/domain/engine.ts"),
      "utf-8"
    );
    const inputBlock = engineSource.slice(
      engineSource.indexOf("interface EngineInput"),
      engineSource.indexOf("interface ConcentrationView")
    );
    expect(inputBlock).not.toContain("updatedAt");
    expect(inputBlock).not.toContain("MarketData");
    expect(inputBlock).toContain("executionPriceEur: number");
  });

  it("EngineOutput has no confidence field at all — HC-004 ('stale data prohibits HIGH-confidence output') has nothing to act on", () => {
    const scorecard: Scorecard = { ...unityScorecard };
    const output = runDecisionEngine(
      buildInput({ weightPct: 42.2, thesisHealth: "INTACT", scorecard })
    );
    expect(output).not.toHaveProperty("confidence");
  });

  it("Playbook.confidence is a static seed field, never derived — no deriveConfidence function exists in the domain layer", () => {
    const confidence = unitySeed.playbook.confidence;
    expect(confidence).toBe("MEDIUM"); // unchanged regardless of market/fundamental data freshness
    // No src/domain/playbook/confidence.ts (or equivalent) exists to compute
    // this from RULESET.confidence's thresholds — those thresholds
    // (mediumThreshold/highThreshold) are configured but unread by any
    // function in the domain layer.
    const rulesetSource = readFileSync(
      path.resolve(process.cwd(), "src/config/ruleset-v0.1.ts"),
      "utf-8"
    );
    expect(rulesetSource).toContain("mediumThreshold");
    const engineSource = readFileSync(
      path.resolve(process.cwd(), "src/domain/engine.ts"),
      "utf-8"
    );
    expect(engineSource).not.toContain("confidence");
  });
});
