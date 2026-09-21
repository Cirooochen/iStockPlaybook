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

function usGaap(concepts: Record<string, unknown>, dei: Record<string, unknown> = {}) {
  return { cik: 1810806, entityName: "Unity Software Inc.", facts: { "us-gaap": concepts, dei } };
}

function concept(units: unknown[], unitKey: string = "USD") {
  return { units: { [unitKey]: units } };
}

describe("mapEdgarCompanyFacts — instrumentId", () => {
  it("derives the zero-padded 10-digit CIK, not the raw numeric cik", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.instrumentId).toBe("0001810806");
    expect(result.periodType).toBe("QUARTERLY");
    expect(result.guidanceEvidence).toEqual({ status: "MISSING" });
    expect(result.checkedAt).toBe(CHECKED_AT);
  });

  it("reportingCurrency is undefined, never a guessed default, when there is no target-concept data to derive it from", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.reportingCurrency).toBeUndefined();
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

// Phase I.4A.1 (docs/phase-i-minimum-research-evidence.md §16.6) — the
// point-in-time filing-identity fix. §4.4 above establishes "latest-filed
// wins" is correct for a field's reported VALUE; these tests prove the
// OPPOSITE rule now governs a period's own IDENTITY
// (fiscalYear/fiscalQuarter/filingDate/accn) — the earliest filing to
// ever disclose this `end` — and that a later filing repeating the same
// `end` as multi-year comparative data can never overwrite that identity,
// even though (per §4.4) it's correctly still allowed to overwrite the
// VALUE. Live-verified against ASML's real SEC data: its primary
// financial statements disclose the current year plus up to two prior
// years as comparatives, each carrying the LATEST filing's own
// `filed`/`accn` under the pre-fix mapper — this is that live bug's exact
// shape, reproduced as fixtures.
describe("mapEdgarCompanyFacts — Phase I.4A.1 point-in-time filing identity", () => {
  it("ANNUAL cadence: a fiscal year's identity comes from its OWN original filing, never a later 20-F's multi-year comparative disclosure of the same period — ASML's real shape (three filings, one genuinely unchanged value)", () => {
    const payload = usGaap(
      {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(
          [
            // FY2023's own original 20-F.
            { start: "2023-01-01", end: "2023-12-31", val: 27_558_500_000, fy: 2023, fp: "FY", form: "20-F", filed: "2024-02-14", accn: "0000937966-24-000008" },
            // The SAME period, reappearing as a "-1 year" comparative inside FY2024's 20-F.
            { start: "2023-01-01", end: "2023-12-31", val: 27_558_500_000, fy: 2024, fp: "FY", form: "20-F", filed: "2025-03-05", accn: "0000937966-25-000009" },
            // The SAME period again, as a "-2 year" comparative inside FY2025's 20-F.
            { start: "2023-01-01", end: "2023-12-31", val: 27_558_500_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25", accn: "0001628280-26-011378" },
          ],
          "EUR"
        ),
      },
      {}
    );

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    const p = result.periods[0];
    expect(p.periodEndDate).toBe("2023-12-31");
    expect(p.fiscalYear).toBe(2023); // never 2024 or 2025 — the later filings' own mislabeled `fy`
    expect(p.periodId).toBe("2023-FY");
    expect(p.filingDate).toBe("2024-02-14"); // never 2025-03-05 or 2026-02-25
    expect(p.accn).toBe("0000937966-24-000008");
  });

  it("the reported VALUE still uses the latest-filed fact (a genuine restatement) even though identity uses the earliest — the two rules are independent, not one dedup pass", () => {
    const payload = usGaap(
      {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(
          [
            { start: "2023-01-01", end: "2023-12-31", val: 100, fy: 2023, fp: "FY", form: "20-F", filed: "2024-02-14", accn: "ORIGINAL-FILING" },
            { start: "2023-01-01", end: "2023-12-31", val: 999, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25", accn: "LATER-COMPARATIVE" },
          ],
          "EUR"
        ),
      },
      {}
    );

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    const p = result.periods[0];
    expect(p.revenue).toEqual({ status: "AVAILABLE", value: 999, asOf: "2026-02-25" }); // value: latest wins (§4.4, unchanged)
    expect(p.filingDate).toBe("2024-02-14"); // identity: earliest wins (this fix)
    expect(p.accn).toBe("ORIGINAL-FILING");
  });

  it("QUARTERLY cadence: a balance's own filingDate/accn survive being repeated as a LATER quarter's comparative balance — Unity's real shape, extending the §4.4 dedup fixture above with identity assertions", () => {
    const payload = usGaap({
      CashAndCashEquivalentsAtCarryingValue: concept([
        { end: "2025-12-31", val: 2_055_840_000, fy: 2025, fp: "Q4", form: "10-Q", filed: "2026-05-07", accn: "OWN-FILING" },
        { end: "2025-12-31", val: 2_055_840_000, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-08-06", accn: "LATER-COMPARATIVE", frame: "CY2025Q4I" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    const p = result.periods[0];
    expect(p.fiscalYear).toBe(2025); // never 2026, the later comparative's own fy
    expect(p.fiscalQuarter).toBe(4);
    expect(p.filingDate).toBe("2026-05-07"); // never 2026-08-06
    expect(p.accn).toBe("OWN-FILING");
  });

  it("a period whose ONLY fact is a later comparative disclosure (no earlier appearance exists at all) still resolves — earliest-of-what-exists, never MISSING merely because nothing came before it", () => {
    const payload = usGaap(
      {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(
          [{ start: "2025-01-01", end: "2025-12-31", val: 32_667_300_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25", accn: "0001628280-26-011378" }],
          "EUR"
        ),
      },
      {}
    );

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods).toHaveLength(1);
    const p = result.periods[0];
    expect(p.filingDate).toBe("2026-02-25");
    expect(p.accn).toBe("0001628280-26-011378");
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

// Phase I.3.1 — mapEdgarCompanyFacts no longer takes a reportingCurrency
// argument at all: it discovers the currency itself from the target
// financial concepts' own units. Fixtures are synthetic (quarterly-shaped,
// unlike ASML's real all-annual data — see the dedicated ASML-shaped
// describe block below for that) so this section isolates ONE variable:
// does discovery actually read the currency the data itself carries, in
// both directions, and correctly refuse to guess when the data disagrees
// with itself.
describe("mapEdgarCompanyFacts — Phase I.3.1 reporting-currency discovery", () => {
  it("discovers USD from a USD-denominated target concept (Unity's real shape) with no argument needed", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.reportingCurrency).toBe("USD");
    expect(result.periods[0].revenue).toEqual({ status: "AVAILABLE", value: 500, asOf: "2026-05-07" });
  });

  it("discovers EUR from a EUR-denominated target concept (ASML's real shape) with no argument needed", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept(
        [{ start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        "EUR"
      ),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.reportingCurrency).toBe("EUR");
    expect(result.periods[0].revenue).toEqual({ status: "AVAILABLE", value: 500, asOf: "2026-05-07" });
  });

  it("is MISSING/ambiguous — never guessed by order, majority, or ticker — when a SINGLE target concept carries both USD and EUR facts simultaneously", () => {
    const payload = usGaap({
      OperatingIncomeLoss: {
        units: {
          USD: [{ start: "2026-01-01", end: "2026-03-31", val: 111, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
          EUR: [{ start: "2026-01-01", end: "2026-03-31", val: 222, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        },
      },
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.reportingCurrency).toBeUndefined();
    expect(result.periods).toEqual([]); // never picks USD-first, never picks whichever has more facts
  });

  it("is MISSING/ambiguous when two DIFFERENT target concepts disagree on currency (revenue USD, operatingIncome EUR) — a genuinely inconsistent payload, never resolved by preferring one field", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
      OperatingIncomeLoss: concept(
        [{ start: "2026-01-01", end: "2026-03-31", val: 50, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        "EUR"
      ),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.reportingCurrency).toBeUndefined();
    expect(result.periods).toEqual([]);
  });

  it("ignores a currency that appears only on a concept the mapper doesn't target — verified against ASML's own real quirk: a foreign-currency-derivative notional tagged in JPY alongside genuinely EUR-only financials", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept(
        [{ start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        "EUR"
      ),
      // Not one of REVENUE_TAGS/OPERATING_INCOME_TAGS/etc — mirrors
      // ASML's real live-verified companyfacts payload, which carries
      // exactly this concept in JPY even though its actual financials
      // are entirely EUR.
      NotionalAmountOfForeignCurrencyDerivatives: concept(
        [{ start: "2026-01-01", end: "2026-03-31", val: 9_000_000, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" }],
        "JPY"
      ),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.reportingCurrency).toBe("EUR"); // JPY never even considered — not a target concept
    expect(result.periods[0].revenue).toEqual({ status: "AVAILABLE", value: 500, asOf: "2026-05-07" });
  });

  it("a currency unit key with zero cadence-usable facts on a target concept does not count as evidence for that currency", () => {
    // The EUR units exist on the concept but every fact is an annual
    // (fp:"FY") one — not usable for a QUARTERLY-mode discovery pass at
    // all (mirrors why ASML's own quarterly attempt correctly finds
    // nothing — see the ASML-shaped describe block below).
    const payload = usGaap({
      OperatingIncomeLoss: concept(
        [{ start: "2025-01-01", end: "2025-12-31", val: 400, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25" }],
        "EUR"
      ),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    // Falls through to the annual attempt (Phase I.2), which DOES find EUR.
    expect(result.reportingCurrency).toBe("EUR");
    expect(result.periodType).toBe("ANNUAL");
  });
});

// Phase I.1 — shares outstanding, read from the "dei" namespace (never
// "us-gaap") — not currency-denominated, so reportingCurrency doesn't
// apply here at all.
describe("mapEdgarCompanyFacts — Phase I.1 shares outstanding (dei namespace)", () => {
  it("reads the latest EntityCommonStockSharesOutstanding fact as a single top-level field, not per-period", () => {
    const payload = usGaap(
      {},
      {
        EntityCommonStockSharesOutstanding: concept(
          [
            { end: "2025-11-01", val: 400_000_000, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-05" },
            { end: "2026-02-01", val: 410_000_000, fy: 2025, fp: "Q4", form: "10-K", filed: "2026-02-10" },
          ],
          "shares"
        ),
      }
    );
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.sharesOutstanding).toEqual({ status: "AVAILABLE", value: 410_000_000, asOf: "2026-02-10" });
  });

  it("is MISSING, never fabricated, when the payload has no dei namespace at all (every pre-Phase-I fixture)", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.sharesOutstanding).toEqual({ status: "MISSING" });
  });

  it("is MISSING when the only dei facts present are fp='FY' — same exclusion extractInstantFacts already applies to every other instant field", () => {
    const payload = usGaap(
      {},
      {
        EntityCommonStockSharesOutstanding: concept(
          [{ end: "2026-02-01", val: 410_000_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-10" }],
          "shares"
        ),
      }
    );
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.sharesOutstanding).toEqual({ status: "MISSING" });
  });
});

// Phase I.4A — accession-number join key. Verified live against real SEC
// data (docs/phase-i-minimum-research-evidence.md's 0.30.0 feasibility
// spike): a period's revenue/operatingIncome fact shares the identical
// `accn` as that period's dei:EntityCommonStockSharesOutstanding fact.
describe("mapEdgarCompanyFacts — Phase I.4A accession-number join key", () => {
  it("carries the representative fact's accn onto the period", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07", accn: "0001810806-26-000042" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].accn).toBe("0001810806-26-000042");
  });

  it("is undefined, never fabricated, when the representative fact carries no accn", () => {
    const payload = usGaap({
      RevenueFromContractWithCustomerExcludingAssessedTax: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
      ]),
    });
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periods[0].accn).toBeUndefined();
  });

  it("keys sharesOutstandingByAccession by each fact's own accn, not by end date", () => {
    const payload = usGaap(
      {},
      {
        EntityCommonStockSharesOutstanding: concept(
          [
            { end: "2025-11-01", val: 400_000_000, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-05", accn: "0001810806-25-000099" },
            { end: "2026-02-01", val: 410_000_000, fy: 2025, fp: "Q4", form: "10-K", filed: "2026-02-10", accn: "0001810806-26-000010" },
          ],
          "shares"
        ),
      }
    );
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.sharesOutstandingByAccession).toEqual({
      "0001810806-25-000099": { status: "AVAILABLE", value: 400_000_000, asOf: "2025-11-05" },
      "0001810806-26-000010": { status: "AVAILABLE", value: 410_000_000, asOf: "2026-02-10" },
    });
  });

  it("skips a shares-outstanding fact with no accn — never keyed under a fabricated placeholder", () => {
    const payload = usGaap(
      {},
      {
        EntityCommonStockSharesOutstanding: concept(
          [{ end: "2026-02-01", val: 410_000_000, fy: 2025, fp: "Q4", form: "10-K", filed: "2026-02-10" }],
          "shares"
        ),
      }
    );
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.sharesOutstandingByAccession).toEqual({});
  });

  it("is empty, never fabricated, when there is no dei namespace at all", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.sharesOutstandingByAccession).toEqual({});
  });

  it("end-to-end: a period's own accn resolves the correct shares-outstanding value via sharesOutstandingByAccession, for an ANNUAL (ASML-shaped) filer", () => {
    const payload = usGaap(
      {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(
          [{ start: "2025-01-01", end: "2025-12-31", val: 32_667_300_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25", accn: "0000937966-26-000007" }],
          "EUR"
        ),
      },
      {
        EntityCommonStockSharesOutstanding: concept(
          [{ end: "2025-12-31", val: 385_417_665, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25", accn: "0000937966-26-000007" }],
          "shares"
        ),
      }
    );
    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    const period = result.periods[0];
    expect(period.accn).toBe("0000937966-26-000007");
    expect(result.sharesOutstandingByAccession[period.accn as string]).toEqual({
      status: "AVAILABLE",
      value: 385_417_665,
      asOf: "2026-02-25",
    });
  });
});

// Phase I.1/I.2/I.3.1: fixtures below mirror ASML's REAL, live-verified
// SEC EDGAR shape (CIK 0000937966) as of 2026-09 — every us-gaap AND dei
// fact ASML has ever filed carries fp:"FY" (a 20-F filer with no 10-Q
// equivalent has no quarterly-cadence facts at all), denominated in EUR.
// Phase I.1 fixed the currency filter; Phase I.2 added the annual-cadence
// fallback; Phase I.3.1 (this block, updated) removes the need to tell
// the mapper the currency at all — it discovers EUR itself, correctly,
// with no argument.
describe("mapEdgarCompanyFacts — Phase I.3.1 ASML-shaped fixture (currency discovered + annual cadence, both handled with no caller input)", () => {
  function asmlShapedPayload(currency: string = "EUR") {
    return usGaap(
      {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept(
          [
            { start: "2024-01-01", end: "2024-12-31", val: 28_262_900_000, fy: 2024, fp: "FY", form: "20-F", filed: "2025-03-05" },
            { start: "2025-01-01", end: "2025-12-31", val: 32_667_300_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25" },
          ],
          currency
        ),
        OperatingIncomeLoss: concept(
          [
            { start: "2024-01-01", end: "2024-12-31", val: 8_600_000_000, fy: 2024, fp: "FY", form: "20-F", filed: "2025-03-05" },
            { start: "2025-01-01", end: "2025-12-31", val: 9_800_000_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25" },
          ],
          currency
        ),
        CashAndCashEquivalentsAtCarryingValue: concept(
          [{ end: "2025-12-31", val: 6_800_000_000, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25" }],
          currency
        ),
      },
      {
        EntityCommonStockSharesOutstanding: concept(
          [{ end: "2025-12-31", val: 385_417_665, fy: 2025, fp: "FY", form: "20-F", filed: "2026-02-25" }],
          "shares"
        ),
      }
    );
  }

  it("resolves two real ANNUAL periods, currency discovered as EUR with no argument, sorted oldest-to-newest, with FY-shaped periodId/fiscalQuarter", () => {
    const result = mapEdgarCompanyFacts(asmlShapedPayload(), CHECKED_AT);

    expect(result.reportingCurrency).toBe("EUR");
    expect(result.periodType).toBe("ANNUAL");
    expect(result.periods).toHaveLength(2);
    expect(result.periods.map((p) => p.periodId)).toEqual(["2024-FY", "2025-FY"]);
    expect(result.periods.every((p) => p.fiscalQuarter === undefined)).toBe(true);
    expect(result.periods[1]).toMatchObject({
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      revenue: { status: "AVAILABLE", value: 32_667_300_000, asOf: "2026-02-25" },
      operatingIncome: { status: "AVAILABLE", value: 9_800_000_000, asOf: "2026-02-25" },
      cashAndEquivalents: { status: "AVAILABLE", value: 6_800_000_000, asOf: "2026-02-25" },
      totalDebt: { status: "MISSING" }, // no debt tag in this fixture — honestly MISSING, not $0
    });
  });

  it("resolves shares outstanding via the same annual-mode extraction, no longer MISSING", () => {
    const result = mapEdgarCompanyFacts(asmlShapedPayload(), CHECKED_AT);
    expect(result.sharesOutstanding).toEqual({ status: "AVAILABLE", value: 385_417_665, asOf: "2026-02-25" });
  });

  it("discovers whatever currency the data actually carries, not a hardcoded EUR expectation — the same fixture in USD resolves to USD instead", () => {
    const result = mapEdgarCompanyFacts(asmlShapedPayload("USD"), CHECKED_AT);
    expect(result.reportingCurrency).toBe("USD");
    expect(result.periods).toHaveLength(2);
  });
});

// Phase I.2 — quarterly is tried first and preferred; annual and
// quarterly periods are never combined into one RawFundamentalsData.
describe("mapEdgarCompanyFacts — Phase I.2 quarterly-preferred / never-mixed", () => {
  it("a filer with genuine quarterly facts stays QUARTERLY even when FY facts for the same concept are also present — the FY facts are unused, not merged in", () => {
    const payload = usGaap({
      OperatingIncomeLoss: concept([
        { start: "2026-01-01", end: "2026-03-31", val: 10, fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-07" },
        // A genuine annual fact ALSO present (e.g. a company that later
        // switched reporting style, or a stray comparative FY figure).
        { start: "2025-01-01", end: "2025-12-31", val: 400, fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
      ]),
    });

    const result = mapEdgarCompanyFacts(payload, CHECKED_AT);
    expect(result.periodType).toBe("QUARTERLY");
    expect(result.periods).toHaveLength(1); // the FY fact never becomes a second period
    expect(result.periods[0].periodEndDate).toBe("2026-03-31");
  });

  it("a payload with zero facts of either cadence stays periods:[] / periodType:'QUARTERLY' — the pre-existing zero-data default, unchanged", () => {
    const result = mapEdgarCompanyFacts(usGaap({}), CHECKED_AT);
    expect(result.periods).toEqual([]);
    expect(result.periodType).toBe("QUARTERLY");
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
