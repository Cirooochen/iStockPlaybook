// Phase E.7B — mapEdgarCompanyFacts. Fixtures mirror the real hazards
// docs/phase-e7a-sec-edgar-structured-fundamentals-adapter-design.md §0
// live-observed for Unity (CIK 0001810806): a duplicate comparative
// balance-sheet fact, a cumulative-vs-single-quarter revenue fact
// sharing the same `fp`, an absent long-term-debt tag, and a differently-
// named revenue tag some filers use instead.
import { describe, expect, it } from "vitest";
import { mapEdgarCompanyFacts } from "@/infrastructure/market-data/sec-edgar/mappers";
import { SecEdgarMappingError } from "@/infrastructure/market-data/sec-edgar/errors";

const CHECKED_AT = "2026-09-11T00:00:00.000Z";

function usGaap(concepts: Record<string, unknown>) {
  return { cik: 1810806, entityName: "Unity Software Inc.", facts: { "us-gaap": concepts } };
}

function concept(units: unknown[]) {
  return { units: { USD: units } };
}

describe("mapEdgarCompanyFacts — instrumentId", () => {
  it("derives the zero-padded 10-digit CIK, not the raw numeric cik", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.instrumentId).toBe("0001810806");
    expect(result.periodType).toBe("QUARTERLY");
    expect(result.guidanceEvidence).toEqual({ status: "MISSING" });
    expect(result.checkedAt).toBe(CHECKED_AT);
  });
});

describe("mapEdgarCompanyFacts — structural failure vs per-field MISSING", () => {
  it("throws SecEdgarMappingError when the payload has no valid cik at all", () => {
    expect(() => mapEdgarCompanyFacts({ facts: {} }, CHECKED_AT)).toThrow(SecEdgarMappingError);
  });

  it("throws when the payload is not an object", () => {
    expect(() => mapEdgarCompanyFacts(null, CHECKED_AT)).toThrow(SecEdgarMappingError);
    expect(() => mapEdgarCompanyFacts("nope", CHECKED_AT)).toThrow(SecEdgarMappingError);
  });

  it("a company with zero us-gaap facts maps to an empty periods array, not a thrown error", () => {
    const result = mapEdgarCompanyFacts({ cik: 1810806 }, CHECKED_AT);
    expect(result.periods).toEqual([]);
  });
});

describe("mapEdgarCompanyFacts — §4.1 cumulative-vs-single-quarter hazard", () => {
  it("keeps the 3-month fact and rejects the 6-month cumulative fact sharing the same fp", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        // 3-month Q2 fact — the one that should survive.
        { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        // Genuine 6-month YTD cumulative fact, same fp label ("Q2"), must be rejected by duration.
        { start: "2026-01-01", end: "2026-06-30", val: 250, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
        // The real, single-quarter Q2 fact.
        { start: "2026-04-01", end: "2026-06-30", val: 150, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(2);
    const q2 = result.periods.find((p) => p.periodEndDate === "2026-06-30");
    expect(q2?.revenue).toEqual({ status: "AVAILABLE", value: 150, asOf: "2026-08-06" });
  });

  it("discards an annual (fp='FY') fact outright, regardless of its duration", () => {
    const payload = usGaap({
      OperatingIncomeLoss: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        { start: "2025-01-01", end: "2025-12-31", val: 40, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].periodEndDate).toBe("2026-03-31");
  });
});

describe("mapEdgarCompanyFacts — §4.4 duplicate/comparative-fact dedup", () => {
  it("an instant fact reported once as its own quarter and again as a later quarter's comparative figure dedupes to one period, keeping the latest-filed", () => {
    const payload = usGaap({
      CashAndCashEquivalentsAtCarryingValue: concept([
        // Its own quarter's figure.
        { end: "2025-12-31", val: 2055840000, fy: 2025, fp: "Q4", form: "10-Q", filed: "2026-05-07" },
        // The same balance, reappearing as the comparative prior-period figure inside the NEXT quarter's 10-Q.
        { end: "2025-12-31", val: 2055840000, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-08-06", frame: "CY2025Q4I" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].cashAndEquivalents).toEqual({
      status: "AVAILABLE",
      value: 2055840000,
      asOf: "2026-08-06",
    });
  });

  it("keeps the later-filed value when a restatement genuinely changes the figure for the same period", () => {
    const payload = usGaap({
      CashAndCashEquivalentsAtCarryingValue: concept([
        { end: "2025-12-31", val: 100, fy: 2025, fp: "Q4", form: "10-Q", filed: "2026-05-07" },
        { end: "2025-12-31", val: 999, fy: 2026, fp: "Q1", form: "10-Q/A", filed: "2026-08-06" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0].cashAndEquivalents).toEqual({ status: "AVAILABLE", value: 999, asOf: "2026-08-06" });
  });
});

describe("mapEdgarCompanyFacts — §3 tag fallback", () => {
  it("falls back to `Revenues` when the primary revenue tag is entirely absent", () => {
    const payload = usGaap({
      Revenues: concept([{ start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].revenue).toEqual({ status: "AVAILABLE", value: 500, asOf: "2026-05-07" });
  });

  it("does not silently sum two revenue tags if both happen to be present — first match wins", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
      Revenues: concept([{ start: "2026-01-01", end: "2026-03-31", val: 999, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].revenue).toEqual({ status: "AVAILABLE", value: 500, asOf: "2026-05-07" });
  });

  it("a field with no candidate tag present at all is MISSING, never fabricated", () => {
    const payload = usGaap({});
    const withOneField = usGaap({
      OperatingIncomeLoss: concept([{ start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
    });
    expect(mapEdgarCompanyFacts(payload, CHECKED_AT).periods).toEqual([]);
    const result = mapEdgarCompanyFacts(withOneField, CHECKED_AT);
    expect(result.periods[0].revenue).toEqual({ status: "MISSING" });
  });
});

describe("mapEdgarCompanyFacts — §6 unit selection", () => {
  it("reads only the USD unit key, never an arbitrary first key present", () => {
    const payload = usGaap({
      OperatingIncomeLoss: {
        units: {
          shares: [{ start: "2026-01-01", end: "2026-03-31", val: 999999, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        },
      },
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toEqual([]); // no USD units present for this concept -> field never resolves
  });
});

describe("mapEdgarCompanyFacts — §3.6/§7 total debt", () => {
  it("sums short+long when both resolve", () => {
    const payload = usGaap({
      DebtCurrent: concept([{ end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
      LongTermDebtNoncurrent: concept([{ end: "2026-03-31", val: 900, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].totalDebt).toEqual({ status: "AVAILABLE", value: 1000, asOf: "2026-05-07" });
  });

  it("treats an entirely-unresolved long-term-debt tag (live-confirmed 404 case) as a $0 contribution when short-term resolves", () => {
    const payload = usGaap({
      DebtCurrent: concept([{ end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
      // LongTermDebtNoncurrent / LongTermDebt both absent entirely — mirrors Unity's live-confirmed 404.
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].totalDebt).toEqual({ status: "AVAILABLE", value: 100, asOf: "2026-05-07" });
  });

  it("is MISSING, never $0, when neither short- nor long-term debt tag resolves for a period", () => {
    const payload = usGaap({
      OperatingIncomeLoss: concept([{ start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].totalDebt).toEqual({ status: "MISSING" });
  });
});

describe("mapEdgarCompanyFacts — §4.5 ordering", () => {
  it("sorts periods oldest-to-newest even when the payload's own fact order is reversed", () => {
    const payload = usGaap({
      OperatingIncomeLoss: concept([
        { start: "2026-04-01", end: "2026-06-30", val: 20, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
        { start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods.map((p) => p.periodEndDate)).toEqual(["2026-03-31", "2026-06-30"]);
  });
});

describe("mapEdgarCompanyFacts — Phase E.7D cash-flow derivation, wired end-to-end", () => {
  it("derives operatingCashFlow/capitalExpenditures for a quarter that only ever has cumulative YTD facts", () => {
    const payload = usGaap({
      NetCashProvidedByUsedInOperatingActivities: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        { start: "2026-01-01", end: "2026-06-30", val: 220, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
      PaymentsToAcquirePropertyPlantAndEquipment: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        { start: "2026-01-01", end: "2026-06-30", val: 25, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    const q2 = result.periods.find((p) => p.periodEndDate === "2026-06-30");
    expect(q2?.operatingCashFlow).toEqual({ status: "AVAILABLE", value: 120, asOf: "2026-08-06" });
    expect(q2?.capitalExpenditures).toEqual({ status: "AVAILABLE", value: 15, asOf: "2026-08-06" });
  });

  it("a direct single-quarter fact still wins over a derivable cumulative pair for the same end date", () => {
    const payload = usGaap({
      NetCashProvidedByUsedInOperatingActivities: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        // A filer that (unusually) discloses BOTH a discrete Q2 AND a 6-month cumulative fact.
        { start: "2026-04-01", end: "2026-06-30", val: 999, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
        { start: "2026-01-01", end: "2026-06-30", val: 220, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    const q2 = result.periods.find((p) => p.periodEndDate === "2026-06-30");
    expect(q2?.operatingCashFlow).toEqual({ status: "AVAILABLE", value: 999, asOf: "2026-08-06" });
  });

  it("stays MISSING when the cumulative predecessor never resolves, never fabricating a value from the cumulative fact alone", () => {
    const payload = usGaap({
      // Anchors a period row at 2026-06-30 so operatingCashFlow's own MISSING status is observable.
      OperatingIncomeLoss: concept([
        { start: "2026-04-01", end: "2026-06-30", val: 20, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
      NetCashProvidedByUsedInOperatingActivities: concept([
        // Only a 6-month cumulative fact exists — no Q1 to subtract.
        { start: "2026-01-01", end: "2026-06-30", val: 220, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    const q2 = result.periods.find((p) => p.periodEndDate === "2026-06-30");
    expect(q2?.operatingCashFlow).toEqual({ status: "MISSING" });
  });

  it("revenue/operatingIncome are unaffected by cash-flow derivation — a 6-month revenue fact is still rejected outright (unchanged E.7B behavior)", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 1000, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        { start: "2026-01-01", end: "2026-06-30", val: 2100, fy: 2026, fp: "Q2", form: "10-Q", filed: "2026-08-06" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    // No period is even emitted for 2026-06-30 here since no field produces a fact at that end date.
    expect(result.periods.find((p) => p.periodEndDate === "2026-06-30")).toBeUndefined();
    expect(result.periods).toHaveLength(1);
  });
});

describe("mapEdgarCompanyFacts — merging across fields", () => {
  it("builds one period from facts spread across multiple concepts and maps fy/fp/end/filed correctly", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 1000, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
      OperatingIncomeLoss: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
      CashAndCashEquivalentsAtCarryingValue: concept([
        { end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    const p = result.periods[0];
    expect(p.fiscalYear).toBe(2026);
    expect(p.fiscalQuarter).toBe(1);
    expect(p.periodEndDate).toBe("2026-03-31");
    expect(p.filingDate).toBe("2026-05-07");
    expect(p.periodId).toBe("2026-Q1");
    expect(p.operatingCashFlow).toEqual({ status: "MISSING" });
    expect(p.capitalExpenditures).toEqual({ status: "MISSING" });
  });
});
