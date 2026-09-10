// Phase E.1A — deterministic fundamentals derivation. Formulas, missing
// inputs, and boundary cases only — no scoring/anchors (see
// fundamentals.ts's top-of-file doc comment for what's explicitly not
// implemented and why).
import { describe, expect, it } from "vitest";
import {
  computeRevenueGrowth,
  computeGrowthTrend,
  computeOperatingMargin,
  computeMarginTrend,
  computeFreeCashFlow,
  computeFcfMargin,
  computeTrailingTwelveMonthRevenue,
  computeNetCashToRevenue,
  mapGuidanceEvidenceToScore,
} from "@/domain/signals/fundamentals";
import type { DataField } from "@/types/market-data";
import type { RawFundamentalsPeriod, GuidanceEvidence } from "@/types/fundamentals";

const MISSING: DataField<number> = { status: "MISSING" };

function available(value: number, asOf = "2026-06-30"): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

// fiscalYear/periodEndDate are structurally required (Phase E.6A) but
// not meaningful to these derivation tests, which index by array
// position, not by date — a fixed, valid placeholder is enough;
// fiscalQuarter is omitted by default for the same reason (not read by
// any function under test here).
function period(periodId: string, overrides: Partial<RawFundamentalsPeriod> = {}): RawFundamentalsPeriod {
  return {
    periodId,
    fiscalYear: 2026,
    periodEndDate: "2026-01-01",
    revenue: available(1000, `${periodId}-asOf`),
    operatingIncome: available(150, `${periodId}-asOf`),
    operatingCashFlow: available(200, `${periodId}-asOf`),
    capitalExpenditures: available(50, `${periodId}-asOf`),
    cashAndEquivalents: available(300, `${periodId}-asOf`),
    totalDebt: available(100, `${periodId}-asOf`),
    ...overrides,
  };
}

// Five quarters, oldest-to-newest: Q1(prior year) .. Q5(current), so
// index length-5 = "same quarter prior year" and index length-1 = current,
// exactly the window computeRevenueGrowth needs.
function fiveQuarters(currentOverrides: Partial<RawFundamentalsPeriod> = {}, priorYearOverrides: Partial<RawFundamentalsPeriod> = {}): RawFundamentalsPeriod[] {
  return [
    period("PY-Q2", priorYearOverrides),
    period("Y0-Q3"),
    period("Y0-Q4"),
    period("Y0-Q1"),
    period("Y0-Q2", currentOverrides),
  ];
}

describe("computeRevenueGrowth", () => {
  it("computes (current - priorYear) / priorYear from the period 4 quarters back", () => {
    const periods = fiveQuarters({ revenue: available(1200, "current-asOf") }, { revenue: available(1000) });
    const result = computeRevenueGrowth(periods);
    expect(result).toEqual({ status: "AVAILABLE", value: 0.2, asOf: "current-asOf" });
  });

  it("MISSING when current period's revenue is MISSING", () => {
    const periods = fiveQuarters({ revenue: MISSING });
    expect(computeRevenueGrowth(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when the prior-year period's revenue is MISSING", () => {
    const periods = fiveQuarters({}, { revenue: MISSING });
    expect(computeRevenueGrowth(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when fewer than 5 periods are available (no same-quarter-prior-year to compare against)", () => {
    expect(computeRevenueGrowth([period("Y0-Q2")])).toEqual({ status: "MISSING" });
    expect(computeRevenueGrowth([])).toEqual({ status: "MISSING" });
  });

  it("boundary: prior-year revenue of exactly 0 -> MISSING, not +/-Infinity", () => {
    const periods = fiveQuarters({}, { revenue: available(0) });
    expect(computeRevenueGrowth(periods)).toEqual({ status: "MISSING" });
  });
});

// Six quarters, oldest-to-newest — only indices 0/1/4/5 matter:
// computeRevenueGrowth(periods) uses index5 (current) vs index1 (prior
// year); computeRevenueGrowth(periods.slice(0,-1)) uses index4 (current
// of that slice) vs index0 (prior year of that slice). Indices 2/3 are
// filler.
const sixQuarters = [
  period("Q1", { revenue: available(1000, "q1-asOf") }),
  period("Q2", { revenue: available(1000, "q2-asOf") }),
  period("Q3"),
  period("Q4"),
  period("Q5", { revenue: available(1200, "q5-asOf") }),
  period("Q6", { revenue: available(1300, "q6-asOf") }),
];

describe("computeGrowthTrend", () => {
  it("computes revenueGrowth(current) - revenueGrowth(previous quarter)", () => {
    // current growth = (1300-1000)/1000 = 0.3; previous growth = (1200-1000)/1000 = 0.2
    const result = computeGrowthTrend(sixQuarters);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value).toBeCloseTo(0.1, 10);
      expect(result.asOf).toBe("q6-asOf");
    }
  });

  it("MISSING when the current quarter's revenueGrowth is MISSING", () => {
    const periods = sixQuarters.map((p, i) => (i === 5 ? { ...p, revenue: MISSING } : p));
    expect(computeGrowthTrend(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when the previous quarter's revenueGrowth is MISSING", () => {
    const periods = sixQuarters.map((p, i) => (i === 0 ? { ...p, revenue: MISSING } : p));
    expect(computeGrowthTrend(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when fewer than 6 periods are available", () => {
    expect(computeGrowthTrend(sixQuarters.slice(1))).toEqual({ status: "MISSING" }); // exactly 5
    expect(computeGrowthTrend([])).toEqual({ status: "MISSING" });
  });
});

describe("computeOperatingMargin", () => {
  it("computes operatingIncome / revenue for the current (last) period", () => {
    const periods = [period("Y0-Q1"), period("Y0-Q2", { operatingIncome: available(200, "asOf"), revenue: available(1000, "asOf") })];
    expect(computeOperatingMargin(periods)).toEqual({ status: "AVAILABLE", value: 0.2, asOf: "asOf" });
  });

  it("MISSING when operatingIncome is MISSING", () => {
    expect(computeOperatingMargin([period("Y0-Q1", { operatingIncome: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when revenue is MISSING", () => {
    expect(computeOperatingMargin([period("Y0-Q1", { revenue: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when periods is empty", () => {
    expect(computeOperatingMargin([])).toEqual({ status: "MISSING" });
  });

  it("boundary: revenue of exactly 0 -> MISSING, not +/-Infinity", () => {
    expect(computeOperatingMargin([period("Y0-Q1", { revenue: available(0) })])).toEqual({ status: "MISSING" });
  });
});

describe("computeMarginTrend", () => {
  const twoQuarters = [
    period("Q1", { operatingIncome: available(100, "q1-asOf"), revenue: available(1000, "q1-asOf") }),
    period("Q2", { operatingIncome: available(180, "q2-asOf"), revenue: available(1000, "q2-asOf") }),
  ];

  it("computes operatingMargin(current) - operatingMargin(previous quarter)", () => {
    // current margin = 180/1000 = 0.18; previous margin = 100/1000 = 0.10
    const result = computeMarginTrend(twoQuarters);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value).toBeCloseTo(0.08, 10);
      expect(result.asOf).toBe("q2-asOf");
    }
  });

  it("MISSING when the current quarter's operatingMargin is MISSING", () => {
    const periods = [twoQuarters[0], { ...twoQuarters[1], operatingIncome: MISSING }];
    expect(computeMarginTrend(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when the previous quarter's operatingMargin is MISSING", () => {
    const periods = [{ ...twoQuarters[0], revenue: MISSING }, twoQuarters[1]];
    expect(computeMarginTrend(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when fewer than 2 periods are available", () => {
    expect(computeMarginTrend([twoQuarters[1]])).toEqual({ status: "MISSING" }); // exactly 1
    expect(computeMarginTrend([])).toEqual({ status: "MISSING" });
  });
});

describe("computeFreeCashFlow", () => {
  it("computes operatingCashFlow - capitalExpenditures for the current period", () => {
    const periods = [period("Y0-Q1", { operatingCashFlow: available(200, "asOf"), capitalExpenditures: available(50, "asOf") })];
    expect(computeFreeCashFlow(periods)).toEqual({ status: "AVAILABLE", value: 150, asOf: "asOf" });
  });

  it("MISSING when operatingCashFlow is MISSING", () => {
    expect(computeFreeCashFlow([period("Y0-Q1", { operatingCashFlow: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when capitalExpenditures is MISSING", () => {
    expect(computeFreeCashFlow([period("Y0-Q1", { capitalExpenditures: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when periods is empty", () => {
    expect(computeFreeCashFlow([])).toEqual({ status: "MISSING" });
  });

  it("allows a negative result (cash outflow exceeding operating cash flow) — not clamped", () => {
    const periods = [period("Y0-Q1", { operatingCashFlow: available(30, "asOf"), capitalExpenditures: available(50, "asOf") })];
    expect(computeFreeCashFlow(periods)).toEqual({ status: "AVAILABLE", value: -20, asOf: "asOf" });
  });
});

describe("computeFcfMargin — E.1C §4.1's resolved scored metric (FCF / revenue, not absolute FCF)", () => {
  it("computes computeFreeCashFlow(periods) / current period's revenue", () => {
    const periods = [
      period("Y0-Q1", { operatingCashFlow: available(200, "asOf"), capitalExpenditures: available(50, "asOf"), revenue: available(1000, "revenue-asOf") }),
    ];
    // FCF = 200 - 50 = 150; FCF margin = 150 / 1000 = 0.15
    expect(computeFcfMargin(periods)).toEqual({ status: "AVAILABLE", value: 0.15, asOf: "asOf" });
  });

  it("MISSING when revenue is MISSING", () => {
    expect(computeFcfMargin([period("Y0-Q1", { revenue: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("boundary: revenue of exactly 0 -> MISSING, not +/-Infinity", () => {
    expect(computeFcfMargin([period("Y0-Q1", { revenue: available(0) })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when the underlying FCF computation is MISSING (operatingCashFlow absent)", () => {
    expect(computeFcfMargin([period("Y0-Q1", { operatingCashFlow: MISSING })])).toEqual({ status: "MISSING" });
  });

  it("MISSING when periods is empty", () => {
    expect(computeFcfMargin([])).toEqual({ status: "MISSING" });
  });
});

describe("computeTrailingTwelveMonthRevenue", () => {
  const fourQuarters = [
    period("Q1", { revenue: available(100) }),
    period("Q2", { revenue: available(110) }),
    period("Q3", { revenue: available(120) }),
    period("Q4", { revenue: available(130, "q4-asOf") }),
  ];

  it("sums the trailing 4 quarters' revenue", () => {
    expect(computeTrailingTwelveMonthRevenue(fourQuarters)).toEqual({ status: "AVAILABLE", value: 460, asOf: "q4-asOf" });
  });

  it("uses only the most recent 4 when more history is available", () => {
    const fiveQuarters = [period("Q0", { revenue: available(9999) }), ...fourQuarters];
    expect(computeTrailingTwelveMonthRevenue(fiveQuarters)).toEqual({ status: "AVAILABLE", value: 460, asOf: "q4-asOf" });
  });

  it("MISSING when fewer than 4 periods are available", () => {
    expect(computeTrailingTwelveMonthRevenue(fourQuarters.slice(0, 3))).toEqual({ status: "MISSING" });
    expect(computeTrailingTwelveMonthRevenue([])).toEqual({ status: "MISSING" });
  });

  it("MISSING (no partial sum) when any one of the 4 quarters' revenue is MISSING", () => {
    const withGap = [fourQuarters[0], { ...fourQuarters[1], revenue: MISSING }, fourQuarters[2], fourQuarters[3]];
    expect(computeTrailingTwelveMonthRevenue(withGap)).toEqual({ status: "MISSING" });
  });
});

describe("computeNetCashToRevenue", () => {
  const fourQuarters = [
    period("Q1", { revenue: available(100) }),
    period("Q2", { revenue: available(100) }),
    period("Q3", { revenue: available(100) }),
    period("Q4", { revenue: available(100), cashAndEquivalents: available(300, "q4-asOf"), totalDebt: available(100, "q4-asOf") }),
  ];

  it("computes (cashAndEquivalents - totalDebt) / trailingTwelveMonthRevenue", () => {
    // TTM revenue = 400; (300 - 100) / 400 = 0.5
    expect(computeNetCashToRevenue(fourQuarters)).toEqual({ status: "AVAILABLE", value: 0.5, asOf: "q4-asOf" });
  });

  it("MISSING when the current period's cashAndEquivalents is MISSING", () => {
    const periods = [...fourQuarters.slice(0, 3), { ...fourQuarters[3], cashAndEquivalents: MISSING }];
    expect(computeNetCashToRevenue(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when the current period's totalDebt is MISSING", () => {
    const periods = [...fourQuarters.slice(0, 3), { ...fourQuarters[3], totalDebt: MISSING }];
    expect(computeNetCashToRevenue(periods)).toEqual({ status: "MISSING" });
  });

  it("MISSING when trailing-twelve-month revenue can't be computed (insufficient history)", () => {
    expect(computeNetCashToRevenue(fourQuarters.slice(0, 3))).toEqual({ status: "MISSING" });
  });

  it("MISSING when periods is empty", () => {
    expect(computeNetCashToRevenue([])).toEqual({ status: "MISSING" });
  });

  it("boundary: trailing-twelve-month revenue of exactly 0 -> MISSING, not +/-Infinity", () => {
    const zeroRevenueQuarters = fourQuarters.map((p) => ({ ...p, revenue: available(0) }));
    expect(computeNetCashToRevenue(zeroRevenueQuarters)).toEqual({ status: "MISSING" });
  });
});

describe("mapGuidanceEvidenceToScore — spec §12's table, cited verbatim", () => {
  const cases: [GuidanceEvidence["direction"], GuidanceEvidence["magnitude"], number][] = [
    ["RAISED", "MATERIAL", 90],
    ["RAISED", "SMALL", 75],
    ["REITERATED", null, 55],
    ["MIXED", null, 45],
    ["LOWERED", "SMALL", 30],
    ["LOWERED", "MATERIAL", 10],
  ];

  it.each(cases)("%s + %s -> %d", (direction, magnitude, expected) => {
    expect(mapGuidanceEvidenceToScore({ direction, magnitude, evidence: [] })).toBe(expected);
  });

  it("REITERATED/MIXED ignore magnitude entirely, exactly like spec's table has no magnitude branch for them", () => {
    expect(mapGuidanceEvidenceToScore({ direction: "REITERATED", magnitude: "MATERIAL", evidence: [] })).toBe(55);
    expect(mapGuidanceEvidenceToScore({ direction: "MIXED", magnitude: "SMALL", evidence: [] })).toBe(45);
  });

  it("is pure: the evidence array never affects the mapped score", () => {
    const withEvidence = mapGuidanceEvidenceToScore({ direction: "RAISED", magnitude: "MATERIAL", evidence: ["Q3 call transcript"] });
    const withoutEvidence = mapGuidanceEvidenceToScore({ direction: "RAISED", magnitude: "MATERIAL", evidence: [] });
    expect(withEvidence).toBe(withoutEvidence);
  });
});
