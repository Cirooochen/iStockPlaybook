// Spec §19, §20, §22. Focused on the ADD zone's eligibility gating — the
// other zone types are covered indirectly via engine.test.ts's scenarios
// and do not depend on AddEligibility at all.
import { describe, expect, it } from "vitest";
import { deriveActionZoneState, type AddEligibility } from "@/domain/playbook/action-zones";
import type { ConcentrationState } from "@/domain/portfolio/concentration";

const gates = (
  accumulationEnabled: boolean,
  thesisEligible: boolean,
  momentumEligible: boolean = true
): AddEligibility => ({
  accumulationEnabled,
  thesisEligible,
  momentumEligible,
});

describe("deriveActionZoneState — ADD (spec §22 eligibility)", () => {
  it("WITHIN_TARGET is ACTIVE only when both gates pass", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, true))).toBe("ACTIVE");
  });

  it("WITHIN_TARGET is INACTIVE when accumulation is disabled (HC-001/HC-002), even if thesis-eligible", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(false, true))).toBe("INACTIVE");
  });

  it("WITHIN_TARGET is INACTIVE when thesis is ineligible (MIXED/WEAKENING/BROKEN), even if accumulation is enabled", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, false))).toBe("INACTIVE");
  });

  it("WITHIN_TARGET is INACTIVE when both gates fail", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(false, false))).toBe("INACTIVE");
  });

  it("MODERATELY_OVERWEIGHT is WATCH only when both gates pass, INACTIVE otherwise", () => {
    expect(deriveActionZoneState("ADD", "MODERATELY_OVERWEIGHT", gates(true, true))).toBe(
      "WATCH"
    );
    expect(deriveActionZoneState("ADD", "MODERATELY_OVERWEIGHT", gates(true, false))).toBe(
      "INACTIVE"
    );
    expect(deriveActionZoneState("ADD", "MODERATELY_OVERWEIGHT", gates(false, true))).toBe(
      "INACTIVE"
    );
  });

  it("OVERWEIGHT/SEVERELY_OVERWEIGHT stay INACTIVE regardless of gates", () => {
    const overweightStates: ConcentrationState[] = ["OVERWEIGHT", "SEVERELY_OVERWEIGHT"];
    for (const state of overweightStates) {
      expect(deriveActionZoneState("ADD", state, gates(true, true))).toBe("INACTIVE");
    }
  });
});

describe("deriveActionZoneState — ADD (Phase D.5 momentumEligible: defensive-only gate)", () => {
  it("WITHIN_TARGET is INACTIVE when momentumEligible is false, even though accumulation + thesis both pass", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, true, false))).toBe(
      "INACTIVE"
    );
  });

  it("MODERATELY_OVERWEIGHT drops from WATCH to INACTIVE when momentumEligible is false", () => {
    expect(deriveActionZoneState("ADD", "MODERATELY_OVERWEIGHT", gates(true, true, false))).toBe(
      "INACTIVE"
    );
  });

  it("momentumEligible can only REMOVE eligibility, never grant it: true does not rescue a failing accumulation or thesis gate", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(false, true, true))).toBe(
      "INACTIVE"
    );
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, false, true))).toBe(
      "INACTIVE"
    );
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(false, false, true))).toBe(
      "INACTIVE"
    );
  });

  it("momentumEligible true (default) is a no-op — identical to the pre-D.5 two-gate behavior", () => {
    expect(deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, true, true))).toBe(
      deriveActionZoneState("ADD", "WITHIN_TARGET", gates(true, true))
    );
  });
});

describe("deriveActionZoneState — other zone types ignore AddEligibility", () => {
  it("HOLD is always ACTIVE, TRIM_1/TRIM_2/THESIS_REVIEW are unaffected by the gates", () => {
    const passing = gates(true, true);
    const failing = gates(false, false);
    expect(deriveActionZoneState("HOLD", "WITHIN_TARGET", passing)).toBe(
      deriveActionZoneState("HOLD", "WITHIN_TARGET", failing)
    );
    expect(deriveActionZoneState("TRIM_1", "SEVERELY_OVERWEIGHT", passing)).toBe(
      deriveActionZoneState("TRIM_1", "SEVERELY_OVERWEIGHT", failing)
    );
    expect(deriveActionZoneState("TRIM_2", "SEVERELY_OVERWEIGHT", passing)).toBe(
      deriveActionZoneState("TRIM_2", "SEVERELY_OVERWEIGHT", failing)
    );
    expect(deriveActionZoneState("THESIS_REVIEW", "WITHIN_TARGET", passing)).toBe(
      deriveActionZoneState("THESIS_REVIEW", "WITHIN_TARGET", failing)
    );
  });
});
