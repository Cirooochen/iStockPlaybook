// Fundamental Change Evidence — deterministic slice only (no AI, no UI).
// Fixtures follow fundamentals.test.ts's own pattern (period()/available()
// helpers, array-position indexing, not date-meaningful).
import { describe, expect, it } from "vitest";
import { deriveFundamentalChangeEvidence } from "@/domain/signals/fundamental-change-evidence";
import type { DataField } from "@/types/market-data";
import type { RawFundamentalsPeriod } from "@/types/fundamentals";

const MISSING: DataField<number> = { status: "MISSING" };

function available(value: number, asOf = "2026-06-30"): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

function period(periodId: string, overrides: Partial<RawFundamentalsPeriod> = {}): RawFundamentalsPeriod {
  return {
    periodId,
    fiscalYear: 2026,
    periodEndDate: "2026-01-01",
    revenue: available(1000, `${periodId}-asOf`),
    operatingIncome: available(100, `${periodId}-asOf`),
    operatingCashFlow: available(150, `${periodId}-asOf`),
    capitalExpenditures: available(50, `${periodId}-asOf`),
    cashAndEquivalents: available(200, `${periodId}-asOf`),
    totalDebt: available(100, `${periodId}-asOf`),
    ...overrides,
  };
}

// Six quarters, oldest-to-newest. computeRevenueGrowth(periods) ("after")
// uses index5 vs index1 (4-back); computeRevenueGrowth(periods.slice(0,-1))
// ("before") uses index4 vs index0. Indices 2/3 are pure filler — never
// read by either evaluation, matching fundamentals.test.ts's own
// established sixQuarters convention.
function sixQuartersRevenue(rev0: number, rev1: number, rev4: number, rev5: number): RawFundamentalsPeriod[] {
  return [
    period("Q1", { revenue: available(rev0, "q1-asOf") }),
    period("Q2", { revenue: available(rev1, "q2-asOf") }),
    period("Q3"),
    period("Q4"),
    period("Q5", { revenue: available(rev4, "q5-asOf") }),
    period("Q6", { revenue: available(rev5, "q6-asOf") }),
  ];
}

// Three annual periods. computeRevenueGrowth (offset=1) "after" compares
// index2 vs index1; "before" (periods.slice(0,-1)) compares index1 vs index0.
function threeYearsRevenue(rev0: number, rev1: number, rev2: number): RawFundamentalsPeriod[] {
  return [
    period("FY1", { revenue: available(rev0, "fy1-asOf") }),
    period("FY2", { revenue: available(rev1, "fy2-asOf") }),
    period("FY3", { revenue: available(rev2, "fy3-asOf") }),
  ];
}

describe("deriveFundamentalChangeEvidence — revenue: reversal detection (QUARTERLY)", () => {
  it("POSITIVE -> NEGATIVE is a reversal", () => {
    // before = (1100-1000)/1000 = +0.10; after = (900-1000)/1000 = -0.10
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 1100, 900), "QUARTERLY");
    expect(result.revenue).toEqual({
      status: "AVAILABLE",
      before: 0.1,
      beforeSign: "POSITIVE",
      after: -0.1,
      afterSign: "NEGATIVE",
      reversed: true,
      asOf: "q6-asOf",
    });
  });

  it("NEGATIVE -> POSITIVE is a reversal", () => {
    // before = (900-1000)/1000 = -0.10; after = (1100-1000)/1000 = +0.10
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 900, 1100), "QUARTERLY");
    expect(result.revenue).toMatchObject({ status: "AVAILABLE", beforeSign: "NEGATIVE", afterSign: "POSITIVE", reversed: true });
  });

  it("POSITIVE -> POSITIVE (deterioration, e.g. 20% -> 5%) exposes the numbers but is NOT reversed", () => {
    // before = (1200-1000)/1000 = +0.20; after = (1050-1000)/1000 = +0.05
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 1200, 1050), "QUARTERLY");
    expect(result.revenue).toEqual({
      status: "AVAILABLE",
      before: 0.2,
      beforeSign: "POSITIVE",
      after: 0.05,
      afterSign: "POSITIVE",
      reversed: false,
      asOf: "q6-asOf",
    });
  });

  it("NEGATIVE -> NEGATIVE (improvement, e.g. -20% -> -5%) exposes the numbers but is NOT reversed", () => {
    // before = (800-1000)/1000 = -0.20; after = (950-1000)/1000 = -0.05
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 800, 950), "QUARTERLY");
    expect(result.revenue).toEqual({
      status: "AVAILABLE",
      before: -0.2,
      beforeSign: "NEGATIVE",
      after: -0.05,
      afterSign: "NEGATIVE",
      reversed: false,
      asOf: "q6-asOf",
    });
  });

  it("POSITIVE -> ZERO crosses zero but is NOT a reversal", () => {
    // before = (1100-1000)/1000 = +0.10; after = (1000-1000)/1000 = 0
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 1100, 1000), "QUARTERLY");
    expect(result.revenue).toMatchObject({ status: "AVAILABLE", beforeSign: "POSITIVE", afterSign: "ZERO", reversed: false });
  });

  it("ZERO -> NEGATIVE crosses zero but is NOT a reversal", () => {
    // before = (1000-1000)/1000 = 0; after = (900-1000)/1000 = -0.10
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 1000, 900), "QUARTERLY");
    expect(result.revenue).toMatchObject({ status: "AVAILABLE", beforeSign: "ZERO", afterSign: "NEGATIVE", reversed: false });
  });

  it("+1% -> -0.5% is an exact reversal but the module never labels it 'material' — no threshold applied to small magnitudes either", () => {
    // before = (1010-1000)/1000 = +0.01; after = (995-1000)/1000 = -0.005
    const result = deriveFundamentalChangeEvidence(sixQuartersRevenue(1000, 1000, 1010, 995), "QUARTERLY");
    expect(result.revenue).toMatchObject({ status: "AVAILABLE", beforeSign: "POSITIVE", afterSign: "NEGATIVE", reversed: true });
    // No "materiality"/"significance" field exists anywhere on this type —
    // structurally impossible to assert one wasn't computed beyond noting
    // the object has exactly the AVAILABLE shape's own fields.
    expect(Object.keys(result.revenue).sort()).toEqual(["afterSign", "asOf", "before", "beforeSign", "reversed", "status", "after"].sort());
  });
});

describe("deriveFundamentalChangeEvidence — revenue: insufficient history / missing (QUARTERLY)", () => {
  it("INSUFFICIENT_HISTORY when exactly 5 periods exist (after computable, before needs a 6th)", () => {
    const fiveQuarters = sixQuartersRevenue(1000, 1000, 1100, 1200).slice(1); // drop Q1, leaving 5
    const result = deriveFundamentalChangeEvidence(fiveQuarters, "QUARTERLY");
    expect(result.revenue.status).toBe("INSUFFICIENT_HISTORY");
    if (result.revenue.status === "INSUFFICIENT_HISTORY") {
      expect(result.revenue.after).toBeCloseTo(0.2, 10); // (1200-1000)/1000, index4 vs index0 of the 5-length array
      expect(result.revenue.afterSign).toBe("POSITIVE");
    }
  });

  it("MISSING when there isn't even enough history for 'after' (fewer than 5 quarters)", () => {
    const result = deriveFundamentalChangeEvidence([period("Q1")], "QUARTERLY");
    expect(result.revenue).toEqual({ status: "MISSING" });
  });

  it("MISSING, never fabricated, when the current period's own revenue fact is a gap despite enough history", () => {
    const periods = sixQuartersRevenue(1000, 1000, 1100, 900);
    periods[5] = { ...periods[5], revenue: MISSING };
    const result = deriveFundamentalChangeEvidence(periods, "QUARTERLY");
    expect(result.revenue).toEqual({ status: "MISSING" });
  });

  it("MISSING when periods is empty", () => {
    const result = deriveFundamentalChangeEvidence([], "QUARTERLY");
    expect(result.revenue).toEqual({ status: "MISSING" });
  });
});

describe("deriveFundamentalChangeEvidence — revenue: ANNUAL cadence", () => {
  it("POSITIVE -> NEGATIVE reversal with only 3 annual periods (offset=1, not 4)", () => {
    // before = (1100-1000)/1000 = +0.10; after = (900-1100)/1100 ≈ -0.1818
    const result = deriveFundamentalChangeEvidence(threeYearsRevenue(1000, 1100, 900), "ANNUAL");
    expect(result.revenue.status).toBe("AVAILABLE");
    if (result.revenue.status === "AVAILABLE") {
      expect(result.revenue.beforeSign).toBe("POSITIVE");
      expect(result.revenue.afterSign).toBe("NEGATIVE");
      expect(result.revenue.reversed).toBe(true);
      expect(result.revenue.asOf).toBe("fy3-asOf");
    }
  });

  it("INSUFFICIENT_HISTORY with exactly 2 annual periods", () => {
    const result = deriveFundamentalChangeEvidence(threeYearsRevenue(1000, 1100, 900).slice(1), "ANNUAL");
    expect(result.revenue.status).toBe("INSUFFICIENT_HISTORY");
    if (result.revenue.status === "INSUFFICIENT_HISTORY") {
      expect(result.revenue.after).toBeCloseTo((900 - 1100) / 1100, 10);
    }
  });

  it("the SAME 3-period array is MISSING under the default QUARTERLY cadence (needs 5) — proves periodType is genuinely load-bearing", () => {
    const result = deriveFundamentalChangeEvidence(threeYearsRevenue(1000, 1100, 900), "QUARTERLY");
    expect(result.revenue).toEqual({ status: "MISSING" });
  });
});

describe("deriveFundamentalChangeEvidence — profitability (operating margin, cadence-agnostic)", () => {
  it("AVAILABLE with exactly 2 periods, reversal detected the same way", () => {
    const periods = [
      period("P1", { operatingIncome: available(100, "p1-asOf"), revenue: available(1000, "p1-asOf") }), // margin +0.10
      period("P2", { operatingIncome: available(-50, "p2-asOf"), revenue: available(1000, "p2-asOf") }), // margin -0.05
    ];
    const result = deriveFundamentalChangeEvidence(periods, "QUARTERLY");
    expect(result.profitability).toEqual({
      status: "AVAILABLE",
      before: 0.1,
      beforeSign: "POSITIVE",
      after: -0.05,
      afterSign: "NEGATIVE",
      reversed: true,
      asOf: "p2-asOf",
    });
  });

  it("INSUFFICIENT_HISTORY with exactly 1 period", () => {
    const result = deriveFundamentalChangeEvidence([period("P1")], "QUARTERLY");
    expect(result.profitability.status).toBe("INSUFFICIENT_HISTORY");
  });

  it("MISSING when periods is empty", () => {
    const result = deriveFundamentalChangeEvidence([], "QUARTERLY");
    expect(result.profitability).toEqual({ status: "MISSING" });
  });

  it("behaves identically regardless of periodType — confirmed cadence-agnostic, unlike revenue", () => {
    const periods = [
      period("P1", { operatingIncome: available(100, "p1-asOf"), revenue: available(1000, "p1-asOf") }),
      period("P2", { operatingIncome: available(50, "p2-asOf"), revenue: available(1000, "p2-asOf") }),
    ];
    const quarterly = deriveFundamentalChangeEvidence(periods, "QUARTERLY");
    const annual = deriveFundamentalChangeEvidence(periods, "ANNUAL");
    expect(quarterly.profitability).toEqual(annual.profitability);
  });
});

describe("deriveFundamentalChangeEvidence — independence: revenue and profitability never combined", () => {
  it("one line AVAILABLE, the other MISSING, at the same time — no forced pairing", () => {
    const periods = sixQuartersRevenue(1000, 1000, 1100, 900).map((p) => ({ ...p, operatingIncome: MISSING }));
    const result = deriveFundamentalChangeEvidence(periods, "QUARTERLY");
    expect(result.revenue.status).toBe("AVAILABLE");
    expect(result.profitability).toEqual({ status: "MISSING" });
  });
});

// Unity-shaped (real live magnitudes, quarterly) and ASML-shaped (real
// live magnitudes, annual) fixtures — mirrors business-trajectory.test.ts's
// own reference-stock verification, at this module's own (raw-periods)
// layer rather than through FundamentalsScoreResult.
describe("deriveFundamentalChangeEvidence — Unity-shaped fixture (QUARTERLY)", () => {
  it("resolves real AVAILABLE revenue and profitability evidence from Unity-like live magnitudes", () => {
    const periods = [
      period("Q1", { revenue: available(430_000_000, "q1-asOf"), operatingIncome: available(-40_000_000, "q1-asOf") }),
      period("Q2", { revenue: available(440_000_000, "q2-asOf"), operatingIncome: available(-35_000_000, "q2-asOf") }),
      period("Q3", { revenue: available(450_000_000, "q3-asOf"), operatingIncome: available(-30_000_000, "q3-asOf") }),
      period("Q4", { revenue: available(460_000_000, "q4-asOf"), operatingIncome: available(-20_000_000, "q4-asOf") }),
      period("Q5", { revenue: available(530_000_000, "q5-asOf"), operatingIncome: available(-25_000_000, "q5-asOf") }), // YoY vs Q1: +0.2326
      period("Q6", { revenue: available(545_000_000, "q6-asOf"), operatingIncome: available(15_000_000, "q6-asOf") }), // YoY vs Q2: +0.2386; margin flips to positive
    ];
    const result = deriveFundamentalChangeEvidence(periods, "QUARTERLY");

    expect(result.revenue.status).toBe("AVAILABLE");
    if (result.revenue.status === "AVAILABLE") {
      expect(result.revenue.beforeSign).toBe("POSITIVE");
      expect(result.revenue.afterSign).toBe("POSITIVE");
      expect(result.revenue.reversed).toBe(false); // steady double-digit growth both periods
    }

    expect(result.profitability.status).toBe("AVAILABLE");
    if (result.profitability.status === "AVAILABLE") {
      // "before" uses the last period of periods.slice(0,-1), i.e. Q5:
      // -25M/530M. "after" uses the full array's last period, Q6: +15M/545M.
      expect(result.profitability.beforeSign).toBe("NEGATIVE");
      expect(result.profitability.afterSign).toBe("POSITIVE");
      expect(result.profitability.reversed).toBe(true); // operating loss -> operating profit
    }
  });
});

describe("deriveFundamentalChangeEvidence — ASML-shaped fixture (ANNUAL)", () => {
  it("resolves real AVAILABLE revenue and profitability evidence from ASML-like live annual magnitudes", () => {
    const periods = [
      period("FY2023", { revenue: available(27_600_000_000, "fy2023-asOf"), operatingIncome: available(9_100_000_000, "fy2023-asOf") }),
      period("FY2024", { revenue: available(28_262_900_000, "fy2024-asOf"), operatingIncome: available(8_600_000_000, "fy2024-asOf") }),
      period("FY2025", { revenue: available(32_667_300_000, "fy2025-asOf"), operatingIncome: available(9_800_000_000, "fy2025-asOf") }),
    ];
    const result = deriveFundamentalChangeEvidence(periods, "ANNUAL");

    expect(result.revenue.status).toBe("AVAILABLE");
    if (result.revenue.status === "AVAILABLE") {
      // before = (28262.9-27600)/27600 ≈ +0.024; after = (32667.3-28262.9)/28262.9 ≈ +0.1558
      expect(result.revenue.beforeSign).toBe("POSITIVE");
      expect(result.revenue.afterSign).toBe("POSITIVE");
      expect(result.revenue.reversed).toBe(false);
      expect(result.revenue.asOf).toBe("fy2025-asOf");
    }

    expect(result.profitability.status).toBe("AVAILABLE");
    if (result.profitability.status === "AVAILABLE") {
      // before = 8600/28262.9 ≈ +0.3043; after = 9800/32667.3 ≈ +0.3000
      expect(result.profitability.beforeSign).toBe("POSITIVE");
      expect(result.profitability.afterSign).toBe("POSITIVE");
      expect(result.profitability.reversed).toBe(false);
    }
  });

  it("the same ASML-shaped periods are MISSING for revenue under QUARTERLY (only 3 annual periods) — no cross-cadence fabrication", () => {
    const periods = [
      period("FY2023", { revenue: available(27_600_000_000) }),
      period("FY2024", { revenue: available(28_262_900_000) }),
      period("FY2025", { revenue: available(32_667_300_000) }),
    ];
    const result = deriveFundamentalChangeEvidence(periods, "QUARTERLY");
    expect(result.revenue).toEqual({ status: "MISSING" });
  });
});
