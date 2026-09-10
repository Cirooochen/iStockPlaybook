// Phase E.6A — fundamentals period-metadata validation + asOf-derivation
// helpers.
import { describe, expect, it } from "vitest";
import {
  hasRequiredFiscalQuarter,
  isValidPeriodEndDate,
  isValidFilingDate,
  isSortedOldestToNewest,
  deriveFundamentalsFieldAsOf,
} from "@/domain/signals/fundamentals-validation";
import type { DataField } from "@/types/market-data";
import type { RawFundamentalsPeriod } from "@/types/fundamentals";

function available(value: number, asOf = "asOf"): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

function period(overrides: Partial<RawFundamentalsPeriod> = {}): RawFundamentalsPeriod {
  return {
    periodId: "2026-Q2",
    fiscalYear: 2026,
    fiscalQuarter: 2,
    periodEndDate: "2026-06-30",
    revenue: available(1000),
    operatingIncome: available(100),
    operatingCashFlow: available(150),
    capitalExpenditures: available(50),
    cashAndEquivalents: available(200),
    totalDebt: available(100),
    ...overrides,
  };
}

function periodWithoutFiscalQuarter(): RawFundamentalsPeriod {
  return {
    periodId: "2026-Q2",
    fiscalYear: 2026,
    periodEndDate: "2026-06-30",
    revenue: available(1000),
    operatingIncome: available(100),
    operatingCashFlow: available(150),
    capitalExpenditures: available(50),
    cashAndEquivalents: available(200),
    totalDebt: available(100),
  };
}

describe("hasRequiredFiscalQuarter", () => {
  it("QUARTERLY: valid fiscalQuarter (1-4) -> true", () => {
    for (const q of [1, 2, 3, 4] as const) {
      expect(hasRequiredFiscalQuarter(period({ fiscalQuarter: q }), "QUARTERLY")).toBe(true);
    }
  });

  it("QUARTERLY: missing fiscalQuarter -> false", () => {
    expect(hasRequiredFiscalQuarter(periodWithoutFiscalQuarter(), "QUARTERLY")).toBe(false);
  });

  it("QUARTERLY: out-of-range fiscalQuarter -> false", () => {
    expect(hasRequiredFiscalQuarter({ ...period(), fiscalQuarter: 0 as 1 }, "QUARTERLY")).toBe(false);
    expect(hasRequiredFiscalQuarter({ ...period(), fiscalQuarter: 5 as 1 }, "QUARTERLY")).toBe(false);
  });

  it("ANNUAL: fiscalQuarter absent -> true (not required)", () => {
    expect(hasRequiredFiscalQuarter(periodWithoutFiscalQuarter(), "ANNUAL")).toBe(true);
  });

  it("ANNUAL: fiscalQuarter present -> still true (not forbidden)", () => {
    expect(hasRequiredFiscalQuarter(period({ fiscalQuarter: 4 }), "ANNUAL")).toBe(true);
  });
});

describe("isValidPeriodEndDate", () => {
  it("a real calendar date -> true", () => {
    expect(isValidPeriodEndDate("2026-06-30")).toBe(true);
  });

  it("an unparseable string -> false", () => {
    expect(isValidPeriodEndDate("not-a-date")).toBe(false);
  });
});

describe("isValidFilingDate", () => {
  it("undefined -> true (optional, absence is valid)", () => {
    expect(isValidFilingDate(undefined)).toBe(true);
  });

  it("a real date -> true", () => {
    expect(isValidFilingDate("2026-08-01")).toBe(true);
  });

  it("an unparseable string -> false", () => {
    expect(isValidFilingDate("not-a-date")).toBe(false);
  });
});

describe("isSortedOldestToNewest", () => {
  it("ascending periodEndDate -> true", () => {
    const periods = [
      period({ periodEndDate: "2026-01-31" }),
      period({ periodEndDate: "2026-04-30" }),
      period({ periodEndDate: "2026-06-30" }),
    ];
    expect(isSortedOldestToNewest(periods)).toBe(true);
  });

  it("descending or out-of-order periodEndDate -> false", () => {
    const periods = [period({ periodEndDate: "2026-06-30" }), period({ periodEndDate: "2026-01-31" })];
    expect(isSortedOldestToNewest(periods)).toBe(false);
  });

  it("equal periodEndDate values -> true (non-decreasing, not strictly increasing)", () => {
    const periods = [period({ periodEndDate: "2026-06-30" }), period({ periodEndDate: "2026-06-30" })];
    expect(isSortedOldestToNewest(periods)).toBe(true);
  });

  it("empty or single-element arrays -> true", () => {
    expect(isSortedOldestToNewest([])).toBe(true);
    expect(isSortedOldestToNewest([period()])).toBe(true);
  });
});

describe("deriveFundamentalsFieldAsOf", () => {
  it("prefers filingDate when present", () => {
    expect(deriveFundamentalsFieldAsOf(period({ periodEndDate: "2026-06-30", filingDate: "2026-08-01" }))).toBe(
      "2026-08-01"
    );
  });

  it("falls back to periodEndDate when filingDate is absent", () => {
    expect(deriveFundamentalsFieldAsOf(period({ periodEndDate: "2026-06-30" }))).toBe("2026-06-30");
  });
});
