// Phase I.4A — deriveEvRevenueCheckpoints. Pure-function tests only, no
// network — fixtures mirror the shapes mapEdgarCompanyFacts/
// mapTimeSeriesResponse actually produce.
import { describe, expect, it } from "vitest";
import { deriveEvRevenueCheckpoints, type EvRevenueCheckpointInput } from "@/domain/signals/valuation-checkpoints";
import type { RawFundamentalsPeriod } from "@/types/fundamentals";
import type { DataField, OhlcvBar } from "@/types/market-data";

function available(value: number, asOf: string): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}
const MISSING: DataField<number> = { status: "MISSING" };

function annualPeriod(overrides: Partial<RawFundamentalsPeriod> & { fiscalYear: number }): RawFundamentalsPeriod {
  const fy = overrides.fiscalYear;
  return {
    periodId: `${fy}-FY`,
    periodEndDate: `${fy}-12-31`,
    filingDate: `${fy + 1}-02-25`,
    accn: `0000937966-${fy + 1}-000007`,
    revenue: available(1_000, `${fy + 1}-02-25`),
    operatingIncome: available(100, `${fy + 1}-02-25`),
    operatingCashFlow: available(150, `${fy + 1}-02-25`),
    capitalExpenditures: available(20, `${fy + 1}-02-25`),
    cashAndEquivalents: available(500, `${fy + 1}-02-25`),
    totalDebt: available(200, `${fy + 1}-02-25`),
    ...overrides,
  };
}

function quarterlyPeriod(
  fy: number,
  q: 1 | 2 | 3 | 4,
  overrides: Partial<RawFundamentalsPeriod> = {}
): RawFundamentalsPeriod {
  const endMonth = q * 3;
  const filed = `${fy}-${String(endMonth).padStart(2, "0")}-28`;
  return {
    periodId: `${fy}-Q${q}`,
    fiscalYear: fy,
    fiscalQuarter: q,
    periodEndDate: `${fy}-${String(endMonth).padStart(2, "0")}-${endMonth === 3 || endMonth === 12 ? "31" : "30"}`,
    filingDate: filed,
    accn: `0001810806-${fy}-${String(q).padStart(6, "0")}`,
    revenue: available(250, filed),
    operatingIncome: available(-10, filed),
    operatingCashFlow: available(5, filed),
    capitalExpenditures: available(2, filed),
    cashAndEquivalents: available(300, filed),
    totalDebt: available(50, filed),
    ...overrides,
  };
}

function sharesFor(periods: RawFundamentalsPeriod[], value: number): Record<string, DataField<number>> {
  const map: Record<string, DataField<number>> = {};
  for (const p of periods) {
    if (p.accn !== undefined) map[p.accn] = available(value, p.filingDate ?? p.periodEndDate);
  }
  return map;
}

function bar(date: string, close: number): OhlcvBar {
  return {
    date,
    open: available(close, date),
    high: available(close, date),
    low: available(close, date),
    close: available(close, date),
    volume: available(1_000, date),
  };
}

function baseInput(overrides: Partial<EvRevenueCheckpointInput> = {}): EvRevenueCheckpointInput {
  const periods = [annualPeriod({ fiscalYear: 2024 }), annualPeriod({ fiscalYear: 2025 })];
  return {
    periods,
    periodType: "ANNUAL",
    reportingCurrency: "EUR",
    sharesOutstandingByAccession: sharesFor(periods, 100),
    priceOhlcv: [bar("2025-02-20", 10), bar("2025-02-24", 12), bar("2025-02-26", 20)],
    priceCurrency: "EUR",
    ...overrides,
  };
}

describe("deriveEvRevenueCheckpoints — accession matching", () => {
  it("joins a period's shares outstanding via its own accn, not an unrelated period's", () => {
    const periods = [annualPeriod({ fiscalYear: 2024 }), annualPeriod({ fiscalYear: 2025 })];
    const shares: Record<string, DataField<number>> = {
      [periods[0].accn as string]: available(90, "2025-02-25"),
      [periods[1].accn as string]: available(110, "2026-02-25"),
    };
    const result = deriveEvRevenueCheckpoints(
      baseInput({ periods, sharesOutstandingByAccession: shares, priceOhlcv: [bar("2025-02-25", 10), bar("2026-02-25", 10)] })
    );
    const fy2025 = result.find((c) => c.fiscalYear === 2025);
    expect(fy2025?.sharesOutstanding).toBe(110);
  });

  it("drops the checkpoint when its own accn has no matching shares-outstanding entry", () => {
    const periods = [annualPeriod({ fiscalYear: 2025 })];
    const result = deriveEvRevenueCheckpoints(baseInput({ periods, sharesOutstandingByAccession: {} }));
    expect(result).toEqual([]);
  });

  it("drops the checkpoint when the period itself carries no accn at all", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, accn: undefined })];
    const result = deriveEvRevenueCheckpoints(baseInput({ periods, sharesOutstandingByAccession: sharesFor(periods, 100) }));
    expect(result).toEqual([]);
  });
});

describe("deriveEvRevenueCheckpoints — fiscal-year checkpoint sampling", () => {
  it("ANNUAL cadence: current is the latest period, completed years are every other period, most recent first", () => {
    const periods = [2021, 2022, 2023, 2024, 2025].map((fy) => annualPeriod({ fiscalYear: fy }));
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: periods.map((p) => bar(p.filingDate as string, 10)),
      })
    );
    expect(result.map((c) => c.fiscalYear)).toEqual([2025, 2024, 2023, 2022, 2021]);
  });

  it("caps completed fiscal years at 5, dropping the oldest beyond that", () => {
    const periods = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((fy) => annualPeriod({ fiscalYear: fy }));
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: periods.map((p) => bar(p.filingDate as string, 10)),
      })
    );
    // current (2025) + 5 completed = 2024..2020, never 2019/2018.
    expect(result.map((c) => c.fiscalYear).sort((a, b) => b - a)).toEqual([2025, 2024, 2023, 2022, 2021, 2020]);
  });

  it("QUARTERLY cadence: current is the latest quarter whatever its number, completed fiscal years are only Q4 periods", () => {
    const periods = [
      quarterlyPeriod(2024, 1),
      quarterlyPeriod(2024, 2),
      quarterlyPeriod(2024, 3),
      quarterlyPeriod(2024, 4),
      quarterlyPeriod(2025, 1),
      quarterlyPeriod(2025, 2),
    ];
    const priceOhlcv = periods.map((p) => bar(p.filingDate as string, 10));
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        periodType: "QUARTERLY",
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv,
      })
    );
    expect(result.map((c) => c.periodId).sort()).toEqual(["2024-Q4", "2025-Q2"].sort());
  });

  it("ASML-shaped mislabeled-fy fixture: sampling relies on periodEndDate order, immune to a later filing's comparative disclosure mislabeling `fiscalYear`", () => {
    // Live-verified against ASML's real SEC data (docs/phase-i-minimum-
    // research-evidence.md's Phase I.4A section): its `fy` tag is
    // per-FILING, not per-fact, so a later filing's own comparative
    // years all inherit that LATER filing's fy label. Real periodEndDates
    // 2021..2025, but the two most recent (2023, 2024) are mislabeled
    // fiscalYear 2025 (the same as the true 2025 period) because all
    // three were last touched by the same 2026 filing.
    const real2021 = annualPeriod({ fiscalYear: 2023, periodId: "2023-FY", periodEndDate: "2021-12-31", filingDate: "2022-02-01", accn: "OLD-2021" });
    const real2022 = annualPeriod({ fiscalYear: 2024, periodId: "2024-FY", periodEndDate: "2022-12-31", filingDate: "2023-02-01", accn: "OLD-2022" });
    const real2023 = annualPeriod({ fiscalYear: 2025, periodId: "2025-FY", periodEndDate: "2023-12-31", filingDate: "2026-02-25", accn: "NEW-2026" });
    const real2024 = annualPeriod({ fiscalYear: 2025, periodId: "2025-FY", periodEndDate: "2024-12-31", filingDate: "2026-02-25", accn: "NEW-2026" });
    const real2025 = annualPeriod({ fiscalYear: 2025, periodId: "2025-FY", periodEndDate: "2025-12-31", filingDate: "2026-02-25", accn: "NEW-2026" });
    const periods = [real2021, real2022, real2023, real2024, real2025];

    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: [bar("2022-02-01", 5), bar("2023-02-01", 6), bar("2026-02-25", 10)],
      })
    );

    // All 5 real, distinct periodEndDates are represented exactly once —
    // never 3 collapsed under one duplicated label, never one dropped.
    expect(result).toHaveLength(5);
    expect(result.map((c) => c.checkpointDate).sort()).toEqual(
      ["2022-02-01", "2023-02-01", "2026-02-25", "2026-02-25", "2026-02-25"].sort()
    );
  });

  it("QUARTERLY cadence: with fewer than 4 quarters of history, current has no TTM revenue and is dropped", () => {
    const periods = [quarterlyPeriod(2025, 1), quarterlyPeriod(2025, 2)];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        periodType: "QUARTERLY",
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: periods.map((p) => bar(p.filingDate as string, 10)),
      })
    );
    expect(result).toEqual([]);
  });
});

describe("deriveEvRevenueCheckpoints — no-future-price selection", () => {
  it("selects the latest bar on or before the filing date, never a later one", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: [bar("2026-02-20", 10), bar("2026-02-25", 15), bar("2026-02-26", 999)],
      })
    );
    expect(result[0]?.price).toBe(15);
  });

  it("is dropped when every available bar is after the filing date", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: [bar("2026-03-01", 999)],
      })
    );
    expect(result).toEqual([]);
  });

  it("skips forward over a market-holiday gap to the last real trading day before the filing date", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    // No bar on 2026-02-24/25 (holiday/weekend) — the last real trading day is 2026-02-20.
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: [bar("2026-02-18", 8), bar("2026-02-20", 9), bar("2026-02-27", 999)],
      })
    );
    expect(result[0]?.price).toBe(9);
  });
});

describe("deriveEvRevenueCheckpoints — conditional FX fetching", () => {
  it("same currency: SAME_CURRENCY integrity, no FX needed, marketCap unchanged by normalization", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceCurrency: "EUR",
        reportingCurrency: "EUR",
        priceOhlcv: [bar("2026-02-25", 10)],
      })
    );
    expect(result[0]?.currencyIntegrity).toEqual({ status: "SAME_CURRENCY", currency: "EUR" });
    expect(result[0]?.normalizedMarketCap).toBe(result[0]?.marketCap);
  });

  it("different currencies with a dated FX bar on or before the checkpoint: CONVERTED, marketCap normalized by that rate", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceCurrency: "USD",
        reportingCurrency: "EUR",
        priceOhlcv: [bar("2026-02-25", 10)], // 10 USD * 100 shares = 1000 USD marketCap
        fxOhlcv: [bar("2026-01-01", 0.9), bar("2026-02-25", 0.92), bar("2026-03-01", 0.5)],
      })
    );
    expect(result[0]?.currencyIntegrity).toEqual({ status: "CONVERTED", from: "USD", to: "EUR", rate: 0.92 });
    expect(result[0]?.marketCap).toBe(1000);
    expect(result[0]?.normalizedMarketCap).toBeCloseTo(920, 5);
  });

  it("different currencies with no fxOhlcv supplied at all: checkpoint dropped, never assumed same-currency", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceCurrency: "USD",
        reportingCurrency: "EUR",
        priceOhlcv: [bar("2026-02-25", 10)],
        fxOhlcv: undefined,
      })
    );
    expect(result).toEqual([]);
  });
});

describe("deriveEvRevenueCheckpoints — missing historical FX", () => {
  it("drops the checkpoint when fxOhlcv has no bar on or before the checkpoint date", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceCurrency: "USD",
        reportingCurrency: "EUR",
        priceOhlcv: [bar("2026-02-25", 10)],
        fxOhlcv: [bar("2026-03-01", 0.92)], // only a future FX bar exists
      })
    );
    expect(result).toEqual([]);
  });

  it("never falls back to a later or today's FX rate — only ever the dated bar", () => {
    const periods = [annualPeriod({ fiscalYear: 2024, filingDate: "2025-02-25" }), annualPeriod({ fiscalYear: 2025, filingDate: "2026-02-25" })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceCurrency: "USD",
        reportingCurrency: "EUR",
        priceOhlcv: [bar("2025-02-25", 10), bar("2026-02-25", 10)],
        fxOhlcv: [bar("2025-02-25", 0.80), bar("2026-02-25", 0.95)],
      })
    );
    const fy2024 = result.find((c) => c.fiscalYear === 2024);
    const fy2025 = result.find((c) => c.fiscalYear === 2025);
    expect(fy2024?.currencyIntegrity).toMatchObject({ rate: 0.80 });
    expect(fy2025?.currencyIntegrity).toMatchObject({ rate: 0.95 });
  });
});

describe("deriveEvRevenueCheckpoints — missing debt", () => {
  it("drops a checkpoint whose totalDebt is MISSING, even though every other input resolves (Unity's real shape)", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, totalDebt: MISSING })];
    const result = deriveEvRevenueCheckpoints(baseInput({ periods, sharesOutstandingByAccession: sharesFor(periods, 100) }));
    expect(result).toEqual([]);
  });

  it("never infers zero debt — MISSING totalDebt is not treated as 0 in the EV formula", () => {
    const missingDebtPeriods = [annualPeriod({ fiscalYear: 2025, totalDebt: MISSING })];
    const zeroDebtPeriods = [annualPeriod({ fiscalYear: 2025, totalDebt: available(0, "2026-02-25") })];

    const missingResult = deriveEvRevenueCheckpoints(
      baseInput({ periods: missingDebtPeriods, sharesOutstandingByAccession: sharesFor(missingDebtPeriods, 100) })
    );
    const zeroResult = deriveEvRevenueCheckpoints(
      baseInput({ periods: zeroDebtPeriods, sharesOutstandingByAccession: sharesFor(zeroDebtPeriods, 100) })
    );

    expect(missingResult).toEqual([]);
    expect(zeroResult).toHaveLength(1);
  });

  it("drops a checkpoint whose cashAndEquivalents is MISSING", () => {
    const periods = [annualPeriod({ fiscalYear: 2025, cashAndEquivalents: MISSING })];
    const result = deriveEvRevenueCheckpoints(baseInput({ periods, sharesOutstandingByAccession: sharesFor(periods, 100) }));
    expect(result).toEqual([]);
  });
});

describe("deriveEvRevenueCheckpoints — checkpoint dropping (no interpolation/backfill)", () => {
  it("drops exactly the checkpoints missing required evidence, keeping the rest — never backfilled from a neighbor", () => {
    const periods = [
      annualPeriod({ fiscalYear: 2022, totalDebt: MISSING }), // dropped: debt
      annualPeriod({ fiscalYear: 2023 }), // kept
      annualPeriod({ fiscalYear: 2024, filingDate: undefined }), // dropped: no filing date
      annualPeriod({ fiscalYear: 2025 }), // kept (current)
    ];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: [bar("2023-02-25", 10), bar("2024-02-25", 10), bar("2025-02-25", 10), bar("2026-02-25", 10)],
      })
    );
    expect(result.map((c) => c.fiscalYear).sort()).toEqual([2023, 2025]);
  });

  it("is MISSING (undefined reportingCurrency) drops every checkpoint, not a partial result", () => {
    const periods = [annualPeriod({ fiscalYear: 2025 })];
    const result = deriveEvRevenueCheckpoints(
      baseInput({ periods, reportingCurrency: undefined, sharesOutstandingByAccession: sharesFor(periods, 100) })
    );
    expect(result).toEqual([]);
  });

  it("Unity-shaped fixture: debt MISSING on every checkpoint drops all of them — an honest empty result, not a thrown error", () => {
    // A full 20-quarter history (5 fiscal years, all 4 quarters each) so
    // every candidate checkpoint has sufficient trailing-twelve-month
    // history to compute — isolating totalDebt as the ONLY reason every
    // checkpoint is dropped, mirroring Unity's real SEC EDGAR shape
    // (no debt concept tagged anywhere, ever).
    const periods = [2021, 2022, 2023, 2024, 2025].flatMap((fy) =>
      ([1, 2, 3, 4] as const).map((q) => quarterlyPeriod(fy, q, { totalDebt: MISSING }))
    );
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        periodType: "QUARTERLY",
        sharesOutstandingByAccession: sharesFor(periods, 100),
        priceOhlcv: periods.map((p) => bar(p.filingDate as string, 10)),
      })
    );
    expect(result).toEqual([]);
  });
});

describe("deriveEvRevenueCheckpoints — the formula itself", () => {
  it("computes MarketCap, EV, and EV/Revenue exactly per the resolved formula", () => {
    const periods = [
      annualPeriod({
        fiscalYear: 2025,
        filingDate: "2026-02-25",
        totalDebt: available(300, "2026-02-25"),
        cashAndEquivalents: available(200, "2026-02-25"),
        revenue: available(1_000, "2026-02-25"),
      }),
    ];
    const result = deriveEvRevenueCheckpoints(
      baseInput({
        periods,
        sharesOutstandingByAccession: sharesFor(periods, 50),
        priceOhlcv: [bar("2026-02-25", 10)],
      })
    );
    // marketCap = 10 * 50 = 500; EV = 500 + 300 - 200 = 600; EV/Rev = 600/1000 = 0.6
    expect(result[0]).toMatchObject({ marketCap: 500, enterpriseValue: 600, trailingTwelveMonthRevenue: 1_000, evToRevenue: 0.6 });
  });
});
