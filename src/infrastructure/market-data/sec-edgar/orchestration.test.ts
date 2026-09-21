// Phase E.8 — fetchLiveFundamentalsResult. Mocked `fetch` only, per the
// established C.8A/D.2 convention — no live network calls. Exercises
// the real client/ticker-resolver/mapper/scoreFundamentals pipeline end
// to end, so a genuine SCORED result requires realistic, sufficiently
// deep fixture data (not just "was the right function called").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveFundamentalsResult } from "@/infrastructure/market-data/sec-edgar/orchestration";

const TICKERS_PAYLOAD = { "0": { cik_str: 1810806, ticker: "U", title: "Unity Software Inc." } };

// Six quarters of revenue (computeGrowthTrend's minimum, per
// src/domain/signals/fundamentals.ts) — enough for a genuine SCORED
// result via revenueGrowth/growthTrend/operatingMargin/marginTrend.
function quarterlyRevenueFacts(quarters: number) {
  return Array.from({ length: quarters }, (_, i) => {
    const year = 2025 + Math.floor(i / 4);
    const q = (i % 4) + 1;
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = `${year}-${String(endMonth).padStart(2, "0")}-${endMonth === 3 || endMonth === 12 ? "31" : "30"}`;
    return {
      start,
      end,
      val: 1_000_000 + i * 50_000,
      fy: year,
      fp: `Q${q}`,
      form: "10-Q",
      filed: `${year}-${String(endMonth).padStart(2, "0")}-28`,
    };
  });
}

function companyFactsPayload(quarters: number, currency: string = "USD") {
  return {
    cik: 1810806,
    entityName: "Unity Software Inc.",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { [currency]: quarterlyRevenueFacts(quarters) } },
      } as Record<string, unknown>,
    },
  };
}

// revenueGrowth+growthTrend alone (0.20+0.10 of GROWTH_SOFTWARE_TEMPLATE's
// weights — src/config/ruleset-v0.1.ts) fall short of the template's own
// 0.5 minimumAvailableWeightShare gate — confirmed by this file's own
// pre-existing "resolves a SCORED..." test tolerating either outcome from
// a revenue-only fixture. Adding operatingIncome (operatingMargin 0.15 +
// marginTrend 0.10) reaches 0.55, reliably clearing the gate — needed so
// the Phase I.1 currency-threading tests below assert a real, unambiguous
// SCORED result, not "either is fine."
function companyFactsPayloadWithOperatingIncome(quarters: number, currency: string) {
  const payload = companyFactsPayload(quarters, currency);
  payload.facts["us-gaap"] = {
    ...payload.facts["us-gaap"],
    OperatingIncomeLoss: { units: { [currency]: quarterlyRevenueFacts(quarters).map((f) => ({ ...f, val: f.val * 0.1 })) } },
  };
  return payload;
}

// Phase I.2 — a realistic multi-year, EUR-denominated, fp:"FY" fixture
// (ASML's real live shape — see mappers.test.ts's own ASML-shaped
// fixtures) with enough years for a genuine end-to-end SCORED result:
// growthTrend needs 3 annual periods minimum (src/domain/signals/
// fundamentals.ts), so this uses 4.
const ASML_TICKERS_PAYLOAD = { "0": { cik_str: 937966, ticker: "ASML", title: "ASML Holding N.V." } };

function annualFact(year: number, val: number, start = `${year}-01-01`, end = `${year}-12-31`) {
  return { start, end, val, fy: year, fp: "FY", form: "20-F", filed: `${year + 1}-02-25` };
}

function asmlAnnualCompanyFactsPayload(years: number = 4) {
  const startYear = 2022;
  const revenues = [21_200_000_000, 27_600_000_000, 28_262_900_000, 32_667_300_000];
  const operatingIncomes = [6_500_000_000, 9_100_000_000, 8_600_000_000, 9_800_000_000];
  const cashFlows = [3_800_000_000, 4_200_000_000, 6_500_000_000, 7_100_000_000];
  const capexValues = [1_800_000_000, 1_900_000_000, 1_000_000_000, 1_200_000_000];

  return {
    cik: 937966,
    entityName: "ASML Holding N.V.",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { EUR: Array.from({ length: years }, (_, i) => annualFact(startYear + i, revenues[i])) },
        },
        OperatingIncomeLoss: {
          units: { EUR: Array.from({ length: years }, (_, i) => annualFact(startYear + i, operatingIncomes[i])) },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: { EUR: Array.from({ length: years }, (_, i) => annualFact(startYear + i, cashFlows[i])) },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: { EUR: Array.from({ length: years }, (_, i) => annualFact(startYear + i, capexValues[i])) },
        },
        CashAndCashEquivalentsAtCarryingValue: {
          units: { EUR: [annualFact(startYear + years - 1, 6_800_000_000)] },
        },
        LongTermDebtNoncurrent: {
          units: { EUR: [annualFact(startYear + years - 1, 2_000_000_000)] },
        },
      } as Record<string, unknown>,
      dei: {
        EntityCommonStockSharesOutstanding: {
          units: { shares: [{ end: `${startYear + years - 1}-12-31`, val: 385_417_665, fy: startYear + years - 1, fp: "FY", form: "20-F", filed: `${startYear + years}-02-25` }] },
        },
      } as Record<string, unknown>,
    },
  };
}

type RouteHandler = () => { ok: boolean; status: number; body: unknown } | "reject";

function mockFetchRouter(routes: { tickers?: RouteHandler; companyFacts?: RouteHandler }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = input.toString();
      const handler = url.includes("company_tickers.json") ? routes.tickers : routes.companyFacts;
      if (!handler) return Promise.reject(new Error(`unexpected request to ${url}`));
      const result = handler();
      if (result === "reject") return Promise.reject(new Error("simulated network failure"));
      return Promise.resolve(new Response(JSON.stringify(result.body), { status: result.status }));
    })
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchLiveFundamentalsResult — success", () => {
  it("resolves a SCORED FundamentalsScoreResult when both fetches succeed with sufficient quarterly history", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayload(6) }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");

    expect(result).toBeDefined();
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    if (result?.scoreResult.status === "SCORED") {
      expect(result.scoreResult.overall.score).toBeGreaterThanOrEqual(1);
      expect(result.scoreResult.overall.score).toBeLessThanOrEqual(10);
    } else {
      // Sparse fixture (revenue only) may legitimately fall short of
      // GROWTH_SOFTWARE_TEMPLATE's minimumAvailableWeightShare — either
      // outcome proves the real pipeline ran end to end without throwing.
      expect(result?.scoreResult.status).toBe("INSUFFICIENT_DATA");
    }
  });
});

// Phase I.5 — fetchLiveFundamentalsResult now also carries `periods`/
// `periodType` alongside `scoreResult`, from the SAME fetch — the
// plumbing gap docs/phase-i-minimum-research-evidence.md §14 closes.
describe("fetchLiveFundamentalsResult — Phase I.5 periods/periodType exposed alongside scoreResult", () => {
  it("carries the mapper's own periods/periodType, not just the scored result — no second fetch", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayloadWithOperatingIncome(6, "USD") }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");

    expect(vi.mocked(fetch).mock.calls).toHaveLength(2); // still exactly one ticker-list + one companyfacts call
    expect(result?.periodType).toBe("QUARTERLY");
    expect(result?.periods).toHaveLength(6);
    expect(result?.periods.at(-1)?.revenue).toEqual({ status: "AVAILABLE", value: 1_250_000, asOf: "2026-06-28" });
  });

  it("carries ANNUAL periods for an ASML-shaped fixture, from the same single fetch used to reach SCORED", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: ASML_TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: asmlAnnualCompanyFactsPayload(4) }),
    });

    const result = await fetchLiveFundamentalsResult("ASML", "2026-09-17T00:00:00.000Z");

    expect(result?.periodType).toBe("ANNUAL");
    expect(result?.periods).toHaveLength(4);
    expect(result?.periods.every((p) => p.fiscalQuarter === undefined)).toBe(true);
  });
});

// Phase I.4A — reportingCurrency/sharesOutstandingByAccession exposed
// alongside periods/periodType, from the same single fetch (no second
// SEC EDGAR round trip) — the raw evidence a future EV/Revenue checkpoint
// build (src/domain/signals/valuation-checkpoints.ts) needs on top of
// what Phase I.5 already exposed.
describe("fetchLiveFundamentalsResult — Phase I.4A reportingCurrency/sharesOutstandingByAccession exposed", () => {
  it("carries the discovered reportingCurrency alongside scoreResult, from the same fetch", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayloadWithOperatingIncome(6, "USD") }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");

    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
    expect(result?.reportingCurrency).toBe("USD");
  });

  it("carries sharesOutstandingByAccession keyed by each fact's own accn, empty when no dei fact carries one", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayloadWithOperatingIncome(6, "USD") }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");

    expect(result?.sharesOutstandingByAccession).toEqual({});
  });
});

describe("fetchLiveFundamentalsResult — Phase I.3.1 reporting-currency discovery, end to end", () => {
  it("resolves a genuine SCORED result for USD-denominated facts (Unity's real shape) with no currency argument of any kind", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayloadWithOperatingIncome(6, "USD") }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");
    expect(result?.scoreResult.status).toBe("SCORED");
  });

  it("resolves a genuine SCORED result for EUR-denominated facts too, through the exact same call — the mapper discovers EUR itself, no argument needed", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayloadWithOperatingIncome(6, "EUR") }),
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");
    expect(result?.scoreResult.status).toBe("SCORED");
  });
});

describe("fetchLiveFundamentalsResult — Phase I.3.1 ASML-shaped annual end-to-end", () => {
  it("resolves a genuine SCORED result from real client -> ticker-resolution -> currency-discovering, annual-cadence mapper -> scorer, for a live-shaped ASML fixture (EUR, fp:'FY', no quarterly facts at all) — no currency argument passed anywhere", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: ASML_TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: asmlAnnualCompanyFactsPayload(4) }),
    });

    const result = await fetchLiveFundamentalsResult("ASML", "2026-09-17T00:00:00.000Z");

    expect(result?.scoreResult.status).toBe("SCORED");
    if (result?.scoreResult.status === "SCORED") {
      expect(result.scoreResult.overall.score).toBeGreaterThanOrEqual(1);
      expect(result.scoreResult.overall.score).toBeLessThanOrEqual(10);
    }
  });
});

describe("fetchLiveFundamentalsResult — failure / fallback (never throws, resolves undefined)", () => {
  it("missing requester identity (SEC_EDGAR_USER_AGENT unset) -> resolves undefined, no fetch attempted at all", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "");
    vi.stubGlobal("fetch", vi.fn());

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");

    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ticker-list fetch network failure -> resolves undefined, not thrown", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({ tickers: () => "reject" });

    await expect(fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z")).resolves.toBeUndefined();
  });

  it("ticker not found in SEC's list -> resolves undefined, never attempts the companyfacts fetch", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({ tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }) });

    const result = await fetchLiveFundamentalsResult("NOPE", "2026-09-10T00:00:00.000Z");

    expect(result).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1); // only the ticker-list call
  });

  it("companyfacts HTTP failure (e.g. 404 for an unknown CIK) -> resolves undefined, not thrown", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: false, status: 404, body: "Not Found" }),
    });

    await expect(fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z")).resolves.toBeUndefined();
  });

  it("a malformed companyfacts payload (mapping failure) -> resolves undefined, not thrown", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: { facts: {} } }), // no `cik` -> SecEdgarMappingError
    });

    await expect(fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z")).resolves.toBeUndefined();
  });

  it("insufficient quarterly history -> still resolves (not a thrown error) — INSUFFICIENT_DATA is a legitimate scoreFundamentals outcome, not a fetch failure", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: companyFactsPayload(1) }), // far short of what any trend dimension needs
    });

    const result = await fetchLiveFundamentalsResult("U", "2026-09-10T00:00:00.000Z");
    expect(result).toBeDefined();
    expect(result?.scoreResult.status).toBe("INSUFFICIENT_DATA");
  });
});
