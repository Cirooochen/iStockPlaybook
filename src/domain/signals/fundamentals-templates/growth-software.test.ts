// Phase E.2 — GROWTH_SOFTWARE_TEMPLATE. Verifies the template's shape
// (weights sum to 1.00), each dimension's RULESET anchor wiring at known
// breakpoints, MISSING propagation, the approved Balance Sheet plateau/
// floor (docs/phase-e1c-fundamentals-normalization-design.md §7.1), and
// one end-to-end SCORED fixture. Per-dimension score100 spot checks use
// today's docs/phase-e1d-fundamentals-anchor-calibration-v0.1.md
// proposal (all VERSIONED V0_1_INVESTMENT_HYPOTHESES except Revenue
// Growth/Guidance) — expected to change if RULESET.fundamentals is ever
// recalibrated; these tests exist to catch accidental wiring drift, not
// to pin the calibration itself as correct.
import { describe, expect, it } from "vitest";
import { GROWTH_SOFTWARE_TEMPLATE } from "@/domain/signals/fundamentals-templates/growth-software";
import { scoreFundamentals } from "@/domain/signals/fundamentals-score";
import type { DataField } from "@/types/market-data";
import type { RawFundamentalsData, RawFundamentalsPeriod, GuidanceEvidence } from "@/types/fundamentals";

function available(value: number, asOf = "asOf"): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

// fiscalYear/periodEndDate are structurally required (Phase E.6A) but
// not meaningful to these anchor-wiring tests, which index by array
// position, not by date — a fixed, valid placeholder is enough.
function period(periodId: string, overrides: Partial<RawFundamentalsPeriod> = {}): RawFundamentalsPeriod {
  return {
    periodId,
    fiscalYear: 2026,
    periodEndDate: "2026-01-01",
    revenue: available(1000),
    operatingIncome: available(100),
    operatingCashFlow: available(150),
    capitalExpenditures: available(50),
    cashAndEquivalents: available(200),
    totalDebt: available(100),
    ...overrides,
  };
}

function rawData(overrides: Partial<RawFundamentalsData> = {}): RawFundamentalsData {
  return {
    instrumentId: "TEST",
    periodType: "QUARTERLY",
    periods: [],
    guidanceEvidence: { status: "MISSING" },
    checkedAt: "2026-09-10T00:00:00.000Z",
    reportingCurrency: "USD",
    sharesOutstanding: { status: "MISSING" },
    sharesOutstandingByAccession: {},
    ...overrides,
  };
}

function componentByKey(key: string) {
  const def = GROWTH_SOFTWARE_TEMPLATE.components.find((c) => c.key === key);
  if (!def) throw new Error(`no component with key "${key}"`);
  return def;
}

describe("GROWTH_SOFTWARE_TEMPLATE — shape", () => {
  it("has archetype GROWTH_SOFTWARE and exactly 7 dimensions", () => {
    expect(GROWTH_SOFTWARE_TEMPLATE.archetype).toBe("GROWTH_SOFTWARE");
    expect(GROWTH_SOFTWARE_TEMPLATE.components).toHaveLength(7);
    expect(GROWTH_SOFTWARE_TEMPLATE.components.map((c) => c.key).sort()).toEqual(
      ["balanceSheet", "fcfMargin", "growthTrend", "guidance", "marginTrend", "operatingMargin", "revenueGrowth"].sort()
    );
  });

  it("weights sum to exactly 1.00 — spec §11's growth-software table", () => {
    const total = GROWTH_SOFTWARE_TEMPLATE.components.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });
});

describe("GROWTH_SOFTWARE_TEMPLATE — per-dimension anchor wiring", () => {
  it("revenueGrowth: 10% YoY growth -> score100 50 (spec §11's own anchor point, SPEC_DEFINED)", () => {
    const periods = [period("Q1", { revenue: available(1000) }), period("Q2"), period("Q3"), period("Q4"), period("Q5", { revenue: available(1100) })];
    const result = componentByKey("revenueGrowth").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("growthTrend: unchanged growth rate quarter-over-quarter -> score100 50 (neutral)", () => {
    const periods = [
      period("Q1", { revenue: available(1000) }),
      period("Q2", { revenue: available(1000) }),
      period("Q3", { revenue: available(1000) }),
      period("Q4", { revenue: available(1000) }),
      period("Q5", { revenue: available(1100) }), // YoY vs Q1 = 0.10
      period("Q6", { revenue: available(1100) }), // YoY vs Q2 = 0.10 -> delta 0
    ];
    const result = componentByKey("growthTrend").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("operatingMargin: 10% margin -> score100 50", () => {
    const periods = [period("Q1", { operatingIncome: available(100), revenue: available(1000) })];
    const result = componentByKey("operatingMargin").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("marginTrend: unchanged operating margin quarter-over-quarter -> score100 50 (neutral)", () => {
    const periods = [
      period("Q1", { operatingIncome: available(100), revenue: available(1000) }),
      period("Q2", { operatingIncome: available(100), revenue: available(1000) }),
    ];
    const result = componentByKey("marginTrend").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("fcfMargin: 10% FCF margin -> score100 50", () => {
    const periods = [period("Q1", { operatingCashFlow: available(150), capitalExpenditures: available(50), revenue: available(1000) })];
    const result = componentByKey("fcfMargin").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("guidance: RAISED+MATERIAL -> score100 90 (spec §12, SPEC_DEFINED), wired through the template", () => {
    const evidence: GuidanceEvidence = { direction: "RAISED", magnitude: "MATERIAL", evidence: [] };
    const result = componentByKey("guidance").score(rawData({ guidanceEvidence: { status: "AVAILABLE", value: evidence, asOf: "2026-09-01" } }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBe(90);
  });

  it("guidance: MISSING raw evidence -> MISSING, never fabricated", () => {
    const result = componentByKey("guidance").score(rawData({ guidanceEvidence: { status: "MISSING" } }));
    expect(result).toEqual({ status: "MISSING" });
  });

  it("balanceSheet: breakeven (net cash == net debt) -> score100 50 (neutral)", () => {
    const periods = [
      period("Q1", { revenue: available(1000) }),
      period("Q2", { revenue: available(1000) }),
      period("Q3", { revenue: available(1000) }),
      period("Q4", { cashAndEquivalents: available(100), totalDebt: available(100), revenue: available(1000) }),
    ];
    const result = componentByKey("balanceSheet").score(rawData({ periods }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });
});

describe("GROWTH_SOFTWARE_TEMPLATE — Phase I.2 ANNUAL cadence threading", () => {
  it("revenueGrowth uses a 1-period offset under ANNUAL cadence — 2 annual periods, not 5, is enough", () => {
    const periods = [period("FY2024", { revenue: available(1000) }), period("FY2025", { revenue: available(1100) })];
    const result = componentByKey("revenueGrowth").score(rawData({ periods, periodType: "ANNUAL" }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6); // same 10% YoY anchor as the QUARTERLY test above
  });

  it("the SAME 2 periods are MISSING under the template's default QUARTERLY assumption — proves periodType is genuinely threaded, not ignored", () => {
    const periods = [period("FY2024", { revenue: available(1000) }), period("FY2025", { revenue: available(1100) })];
    const result = componentByKey("revenueGrowth").score(rawData({ periods })); // periodType defaults to QUARTERLY
    expect(result).toEqual({ status: "MISSING" });
  });

  it("growthTrend uses a 1-period offset under ANNUAL cadence — 3 annual periods, not 6, is enough", () => {
    const periods = [
      period("FY2023", { revenue: available(1000) }),
      period("FY2024", { revenue: available(1000) }), // YoY vs FY2023 = 0
      period("FY2025", { revenue: available(1000) }), // YoY vs FY2024 = 0 -> delta 0 (neutral)
    ];
    const result = componentByKey("growthTrend").score(rawData({ periods, periodType: "ANNUAL" }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6);
  });

  it("balanceSheet's TTM-revenue denominator is the single annual period's own revenue, not a 4-period sum", () => {
    const periods = [period("FY2025", { revenue: available(1000), cashAndEquivalents: available(100), totalDebt: available(100) })];
    const result = componentByKey("balanceSheet").score(rawData({ periods, periodType: "ANNUAL" }));
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(50, 6); // net cash == net debt -> neutral
  });

  it("marginTrend/operatingMargin/fcfMargin are unaffected by periodType — cadence-agnostic, single-most-recent-period comparisons", () => {
    const periods = [
      period("FY2024", { operatingIncome: available(100), revenue: available(1000) }),
      period("FY2025", { operatingIncome: available(100), revenue: available(1000) }),
    ];
    expect(componentByKey("marginTrend").score(rawData({ periods, periodType: "ANNUAL" }))).toEqual(
      componentByKey("marginTrend").score(rawData({ periods, periodType: "QUARTERLY" }))
    );
    expect(componentByKey("operatingMargin").score(rawData({ periods, periodType: "ANNUAL" }))).toEqual(
      componentByKey("operatingMargin").score(rawData({ periods, periodType: "QUARTERLY" }))
    );
  });
});

describe("GROWTH_SOFTWARE_TEMPLATE — Balance Sheet's approved monotonic-then-plateau shape (E.1C §7.1)", () => {
  function quarters(net: number): RawFundamentalsPeriod[] {
    // TTM revenue = 4000 (4 quarters of 1000); net = cash - debt on the current quarter.
    return [
      period("Q1", { revenue: available(1000) }),
      period("Q2", { revenue: available(1000) }),
      period("Q3", { revenue: available(1000) }),
      period("Q4", { cashAndEquivalents: available(1000 + net), totalDebt: available(1000), revenue: available(1000) }),
    ];
  }

  it("at exactly the plateau threshold (netCashToRevenue = 0.75) -> score100 85", () => {
    const result = componentByKey("balanceSheet").score(rawData({ periods: quarters(3000) })); // 3000/4000 = 0.75
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(85, 6);
  });

  it("far beyond the plateau threshold -> STILL score100 85, never higher (approved: excess cash earns no extra reward)", () => {
    const result = componentByKey("balanceSheet").score(rawData({ periods: quarters(20000) })); // ratio = 5.0, far beyond 0.75
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBe(85);
  });

  it("at exactly the floor (netCashToRevenue = -0.50) -> score100 10", () => {
    const result = componentByKey("balanceSheet").score(rawData({ periods: quarters(-2000) })); // -2000/4000 = -0.50
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBeCloseTo(10, 6);
  });

  it("far beyond the floor -> STILL score100 10, never lower (clamped, never declines further)", () => {
    const result = componentByKey("balanceSheet").score(rawData({ periods: quarters(-20000) })); // ratio = -5.0
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.score100).toBe(10);
  });

  it("the curve never declines anywhere across the full modeled domain (monotonic non-decreasing)", () => {
    const ratios = [-2, -0.5, -0.15, -0.05, 0, 0.15, 0.3, 0.5, 0.75, 2, 10];
    const scores = ratios.map((r) => {
      const result = componentByKey("balanceSheet").score(rawData({ periods: quarters(r * 4000) }));
      if (result.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
      return result.score100;
    });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });
});

describe("GROWTH_SOFTWARE_TEMPLATE — end-to-end via scoreFundamentals()", () => {
  it("every dimension MISSING/absent -> INSUFFICIENT_DATA, never a fabricated score", () => {
    const result = scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, rawData());
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result).not.toHaveProperty("overall");
    expect(result.components).toHaveLength(7);
    expect(result.components.every((c) => c.status === "MISSING")).toBe(true);
  });

  it("full evidence available -> SCORED, with full coverage and every component key/weight present", () => {
    const periods: RawFundamentalsPeriod[] = [
      period("Q1", { revenue: available(1000) }),
      period("Q2", { revenue: available(1000) }),
      period("Q3", { revenue: available(1000) }),
      period("Q4", { revenue: available(1000) }),
      period("Q5", { revenue: available(1100) }),
      period("Q6", {
        revenue: available(1200),
        operatingIncome: available(180),
        operatingCashFlow: available(220),
        capitalExpenditures: available(40),
        cashAndEquivalents: available(1600),
        totalDebt: available(100),
      }),
    ];
    const guidanceEvidence: DataField<GuidanceEvidence> = {
      status: "AVAILABLE",
      value: { direction: "RAISED", magnitude: "SMALL", evidence: [] },
      asOf: "2026-09-01",
    };

    const result = scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, rawData({ periods, guidanceEvidence }));

    expect(result.status).toBe("SCORED");
    if (result.status === "SCORED") {
      expect(result.coverage.availableWeightShare).toBeCloseTo(1, 10);
      expect(result.coverage.missingWeight).toBeCloseTo(0, 10);
      expect(result.overall.score).toBeGreaterThanOrEqual(1);
      expect(result.overall.score).toBeLessThanOrEqual(10);
    }
    expect(result.components).toHaveLength(7);
    for (const c of result.components) {
      expect(c.status).toBe("AVAILABLE");
      expect(typeof c.weight).toBe("number");
    }
  });

  it("is deterministic: repeated calls on the same input produce the identical result", () => {
    const raw = rawData({ periods: [period("Q1")] });
    expect(scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, raw)).toEqual(scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, raw));
  });
});
