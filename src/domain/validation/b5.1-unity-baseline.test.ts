// B.5.1 — Unity Baseline Validation
// See docs/phase-b5-algorithm-validation.md and
// docs/playbook-decision-engine-spec-v0.1.md §33.
//
// Pins the CURRENT behavior of runDecisionEngine() against the real Unity
// production seed data, as a regression baseline for Phase B.5. This test
// asserts what the engine actually does today -- including one known
// divergence from spec §21 documented below -- not what the spec says it
// should do. Do not "fix" this test to match the spec without a deliberate
// rule-design decision; see the B.5.1 validation report.
import { describe, expect, it } from "vitest";
import { runDecisionEngine, type EngineInput } from "@/domain/engine";
import { unitySeed, unityActionZones, unityScorecard } from "@/data/unity-seed";
import { portfolioSeed } from "@/data/portfolio-seed";

describe("B.5.1 — Unity baseline validation", () => {
  it("produces an internally consistent SEVERELY_OVERWEIGHT / HOLD_GRADUALLY_TRIM decision", () => {
    const input: EngineInput = {
      position: unitySeed.position,
      portfolioTotalEur: portfolioSeed.totalValueEur,
      executionPriceEur: unitySeed.market.executionPriceEur,
      strategy: unitySeed.strategy,
      thesisHealth: unitySeed.playbook.thesisHealth,
      scorecard: unityScorecard,
      actionZoneTemplates: unityActionZones,
    };

    const output = runDecisionEngine(input);

    // Concentration: 58.6% vs. the 45% medium-term target -> SEVERELY_OVERWEIGHT
    expect(output.concentration.state).toBe("SEVERELY_OVERWEIGHT");

    // Thesis passes through untouched -- the only canonical source of thesis state
    expect(output.thesis.health).toBe("INTACT");

    // Constraints: weight (58.6%) exceeds the short-term accumulation
    // ceiling (50%) -> HC-001 fires, accumulation disabled. Thesis is not
    // BROKEN, so HC-002 does not fire.
    expect(output.constraints.hc001.triggered).toBe(true);
    expect(output.constraints.hc002.triggered).toBe(false);
    expect(output.constraints.accumulationEnabled).toBe(false);

    // Decision: SEVERELY_OVERWEIGHT + non-broken thesis -> HOLD_GRADUALLY_TRIM
    expect(output.stance).toBe("HOLD_GRADUALLY_TRIM");

    // Action: ADD is blocked, the long-term core HOLD stays active, and
    // TRIM_1 is live for a severely overweight position.
    const zoneState = (type: string) =>
      output.actionZones.find((z) => z.type === type)?.state;
    expect(zoneState("ADD")).toBe("INACTIVE");
    expect(zoneState("HOLD")).toBe("ACTIVE");
    expect(zoneState("TRIM_1")).toBe("ACTIVE");

    // Trim sizing: the current implementation stages 100% of the shares
    // above the 650-share core (252), NOT min(sharesToTarget, aboveCoreMax)
    // as spec §21 defines (which would be 210, since only 210 shares are
    // needed to reach the 45% target). This is a known, reported divergence
    // -- see the B.5.1 report -- asserted here as current actual behavior,
    // not as spec-endorsed behavior.
    expect(output.concentration.sharesToTarget).toBe(210);
    expect(output.concentration.tacticalInventory.aboveCoreMax).toBe(252);
    expect(output.concentration.trimSizing.maxTacticalTrim).toBe(252);
  });
});
