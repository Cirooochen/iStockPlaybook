import { describe, expect, it } from "vitest";
import { buildOnboardedActionZoneTemplates } from "@/domain/playbook/action-zone-templates";
import type { Strategy } from "@/types/playbook";

const strategy: Strategy = {
  horizon: "",
  shortTermMaxWeightPct: 23,
  mediumTermTargetMinPct: 10,
  mediumTermTargetMaxPct: 18,
  tacticalSharesMin: 0,
  tacticalSharesMax: 0,
};

describe("buildOnboardedActionZoneTemplates", () => {
  it("returns exactly the 5 production zone types, matching deriveActionZoneState's expectations", () => {
    const zones = buildOnboardedActionZoneTemplates({
      strategy,
      currentShares: 100,
      weightPct: 12,
      portfolioTotalEur: 100000,
      executionPriceEur: 100,
    });
    expect(zones.map((z) => z.type)).toEqual(["ADD", "HOLD", "TRIM_1", "TRIM_2", "THESIS_REVIEW"]);
  });

  it("uses only live numeric values and generic boilerplate — never fabricated per-stock analysis", () => {
    const zones = buildOnboardedActionZoneTemplates({
      strategy,
      currentShares: 100,
      weightPct: 12,
      portfolioTotalEur: 100000,
      executionPriceEur: 100,
    });
    const add = zones.find((z) => z.type === "ADD")!;
    expect(add.summary).toContain("12.0%");
    expect(add.summary).toContain("10–18%");
    // No valuation/earnings-style commentary anywhere (H.2 §9.2 kind-3 exclusion).
    for (const zone of zones) {
      const text = [zone.summary, zone.primaryTrigger, ...(zone.whyBullets ?? [])].join(" ");
      expect(text.toLowerCase()).not.toContain("valuation");
      expect(text.toLowerCase()).not.toContain("earnings");
    }
  });

  it("leaves ADD.suggestedShares unset — no ADD sizing formula was approved", () => {
    const zones = buildOnboardedActionZoneTemplates({
      strategy,
      currentShares: 100,
      weightPct: 12,
      portfolioTotalEur: 100000,
      executionPriceEur: 100,
    });
    expect(zones.find((z) => z.type === "ADD")!.suggestedShares).toBeUndefined();
  });

  it("sets TRIM suggestedShares from live trim sizing when tactical inventory exists", () => {
    const coreStrategy: Strategy = { ...strategy, coreSharesMin: 50, coreSharesMax: 60 };
    const zones = buildOnboardedActionZoneTemplates({
      strategy: coreStrategy,
      currentShares: 100, // 40 shares above coreMax(60) -> tactical inventory
      weightPct: 20,
      portfolioTotalEur: 100000,
      executionPriceEur: 100,
    });
    const trim1 = zones.find((z) => z.type === "TRIM_1")!;
    expect(trim1.suggestedShares).toBeDefined();
    expect(Number(trim1.suggestedShares)).toBeGreaterThan(0);
  });
});
