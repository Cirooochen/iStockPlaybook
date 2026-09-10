// B.5.5 — Thesis Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/validation/b5.5-thesis-validation-report.md.
//
// Validates CURRENT behavior only — no rule changes. Position, price,
// portfolio, concentration, fundamentals, valuation, and momentum are
// held fixed (the same Unity 650-share scenario used in B.5.4A/B.5.4B)
// so thesisHealth is the only changing variable. Exercises the real
// runDecisionEngine() and real checkHC003() across all five thesis
// states.
import { describe, expect, it } from "vitest";
import { checkHC003 } from "@/domain/playbook/hard-constraints";
import { runDecisionEngine } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";
import type { ThesisHealth } from "@/types/playbook";

const coreMin = unitySeed.strategy.coreSharesMin as number;
const ALL_STATES: ThesisHealth[] = [
  "STRENGTHENING",
  "INTACT",
  "MIXED",
  "WEAKENING",
  "BROKEN",
];

function engineAt650(thesisHealth: ThesisHealth) {
  const price = unitySeed.market.executionPriceEur;
  const shares = 650;
  const valueEur = shares * price;
  return runDecisionEngine({
    position: {
      shares,
      averageCostEur: 27.76,
      valueEur,
      unrealizedReturnPct: ((price - 27.76) / 27.76) * 100,
      portfolioWeightPct: (valueEur / portfolioSeed.totalValueEur) * 100,
    },
    portfolioTotalEur: portfolioSeed.totalValueEur,
    executionPriceEur: price,
    strategy: unitySeed.strategy,
    thesisHealth,
    scorecard: unityScorecard,
    actionZoneTemplates: unityActionZones,
  });
}

const zoneState = (output: ReturnType<typeof engineAt650>, type: string) =>
  output.actionZones.find((z) => z.type === type)?.state;

describe("B.5.5 — thesis output is a pass-through, but scorecard differentiates all five states", () => {
  it("EngineOutput.thesis.health echoes the input for every state", () => {
    for (const t of ALL_STATES) {
      expect(engineAt650(t).thesis.health).toBe(t);
    }
  });

  it("scorecard.thesisHealth differs across all five states (only place they're distinguished)", () => {
    const scores = ALL_STATES.map((t) => engineAt650(t).scorecard.thesisHealth.score);
    expect(new Set(scores).size).toBe(5);
  });
});

describe("B.5.5 — STRENGTHENING, INTACT, MIXED, and WEAKENING share HC-002/HC-003/stance and every action zone except ADD (fixed WITHIN_TARGET concentration)", () => {
  const nonBrokenStates: ThesisHealth[] = ["STRENGTHENING", "INTACT", "MIXED", "WEAKENING"];

  it("HC-002 does not trigger, accumulation stays enabled, for all four", () => {
    for (const t of nonBrokenStates) {
      const o = engineAt650(t);
      expect(o.constraints.hc002.triggered).toBe(false);
      expect(o.constraints.accumulationEnabled).toBe(true);
    }
  });

  it("HC-003 triggers identically (core protection active) for all four — SELL 100 from 650 blocked", () => {
    for (const t of nonBrokenStates) {
      expect(checkHC003(100, 650, coreMin, t).triggered).toBe(true);
    }
  });

  it("stance is HOLD for all four (WEAKENING's REDUCE_RISK branch needs concurrent overweight, which this fixture does not have)", () => {
    for (const t of nonBrokenStates) {
      expect(engineAt650(t).stance).toBe("HOLD");
    }
  });

  it("HOLD, TRIM_1, TRIM_2, THESIS_REVIEW are identical across all four — only ADD now distinguishes by thesis eligibility", () => {
    const zoneTypes = ["HOLD", "TRIM_1", "TRIM_2", "THESIS_REVIEW"];
    const outputs = nonBrokenStates.map((t) => engineAt650(t));
    for (const type of zoneTypes) {
      const states = new Set(outputs.map((o) => zoneState(o, type)));
      expect(states.size).toBe(1);
    }
  });

  it("ADD zone: STRENGTHENING/INTACT are ACTIVE (thesis-eligible), MIXED/WEAKENING are INACTIVE — spec §22 thesis clause, implemented per the B.5.5 v0.1 decision", () => {
    expect(zoneState(engineAt650("STRENGTHENING"), "ADD")).toBe("ACTIVE");
    expect(zoneState(engineAt650("INTACT"), "ADD")).toBe("ACTIVE");
    expect(zoneState(engineAt650("MIXED"), "ADD")).toBe("INACTIVE");
    expect(zoneState(engineAt650("WEAKENING"), "ADD")).toBe("INACTIVE");
  });

  it("maximumNormalTrim is identical (34) for all four — thesis-independent, per the B.5.1 Resolution model", () => {
    for (const t of nonBrokenStates) {
      expect(engineAt650(t).targetPosition.trimCapacity.maximumNormal).toBe(34);
    }
  });
});

describe("B.5.5 — BROKEN removes core protection and is ADD-ineligible on two independent grounds", () => {
  it("HC-002 triggers, accumulation disabled, HC-003 waived, stance escalates, ADD deactivates", () => {
    const o = engineAt650("BROKEN");
    expect(o.constraints.hc002.triggered).toBe(true);
    expect(o.constraints.accumulationEnabled).toBe(false);
    expect(checkHC003(100, 650, coreMin, "BROKEN").triggered).toBe(false);
    expect(o.stance).toBe("THESIS_REVIEW");
    expect(zoneState(o, "ADD")).toBe("INACTIVE");
  });

  it("maximumNormalTrim is unchanged even under BROKEN (34) — thesis-independent by design", () => {
    expect(engineAt650("BROKEN").targetPosition.trimCapacity.maximumNormal).toBe(34);
  });
});

describe("B.5.5 — full ADD-zone ladder across all five thesis states", () => {
  it("STRENGTHENING and INTACT are ACTIVE; MIXED, WEAKENING, and BROKEN are INACTIVE", () => {
    const expected: Record<ThesisHealth, string> = {
      STRENGTHENING: "ACTIVE",
      INTACT: "ACTIVE",
      MIXED: "INACTIVE",
      WEAKENING: "INACTIVE",
      BROKEN: "INACTIVE",
    };
    for (const t of ALL_STATES) {
      expect(zoneState(engineAt650(t), "ADD")).toBe(expected[t]);
    }
  });
});
