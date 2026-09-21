// Phase I.4A — fetchLiveEvRevenueCheckpoints. Mocked `fetch` only, per the
// established C.8A/D.2/E.8 convention — no live network calls. Exercises
// the real SEC EDGAR fetch -> Twelve Data historical price/FX fetch ->
// deriveEvRevenueCheckpoints pipeline end to end.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveEvRevenueCheckpoints } from "@/infrastructure/market-data/valuation-orchestration";

const TICKERS_PAYLOAD = { "0": { cik_str: 1810806, ticker: "U", title: "Unity Software Inc." } };

// One accn per quarter — mirrors the real SEC shape (a 10-Q's revenue
// fact and its cover-page shares-outstanding fact share the same
// accession number, verified live in the 0.30.0 feasibility spike).
function quarterlyFactsWithAccn(quarters: number, val: (i: number) => number) {
  return Array.from({ length: quarters }, (_, i) => {
    const year = 2024 + Math.floor(i / 4);
    const q = (i % 4) + 1;
    const endMonth = q * 3;
    const end = `${year}-${String(endMonth).padStart(2, "0")}-${endMonth === 3 || endMonth === 12 ? "31" : "30"}`;
    const filed = `${year}-${String(endMonth).padStart(2, "0")}-28`;
    return {
      start: `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`,
      end,
      val: val(i),
      fy: year,
      fp: `Q${q}`,
      form: "10-Q",
      filed,
      accn: `0001810806-${year}-${String(q).padStart(6, "0")}`,
    };
  });
}

function unityCompanyFactsPayload(quarters: number = 8, currency: string = "USD") {
  const revenueFacts = quarterlyFactsWithAccn(quarters, (i) => 1_000_000 + i * 10_000);
  const sharesFacts = quarterlyFactsWithAccn(quarters, () => 400_000_000).map((f) => ({ ...f, val: f.val }));
  return {
    cik: 1810806,
    entityName: "Unity Software Inc.",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { [currency]: revenueFacts } },
        CashAndCashEquivalentsAtCarryingValue: { units: { [currency]: revenueFacts.map((f) => ({ ...f, val: 500_000_000 })) } },
        LongTermDebtNoncurrent: { units: { [currency]: revenueFacts.map((f) => ({ ...f, val: 200_000_000 })) } },
      },
      dei: {
        EntityCommonStockSharesOutstanding: { units: { shares: sharesFacts } },
      },
    },
  };
}

function timeSeriesPayload(currency: string, dates: string[], close: number) {
  return {
    meta: { currency },
    status: "ok",
    values: dates.map((datetime) => ({ datetime, open: String(close), high: String(close), low: String(close), close: String(close), volume: "1000" })),
  };
}

const PRICE_DATES = ["2024-03-28", "2024-06-28", "2024-09-28", "2024-12-28", "2025-03-28", "2025-06-28", "2025-09-28", "2025-12-28"];

type RouteHandler = () => { ok: boolean; status: number; body: unknown };

function mockFetchRouter(routes: { tickers?: RouteHandler; companyFacts?: RouteHandler; quote?: RouteHandler; timeSeries?: RouteHandler[] }) {
  let timeSeriesCallIndex = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = new URL(input.toString());
      let handler: RouteHandler | undefined;
      if (url.hostname === "www.sec.gov") handler = routes.tickers;
      else if (url.hostname === "data.sec.gov") handler = routes.companyFacts;
      else if (url.pathname === "/quote") handler = routes.quote;
      else if (url.pathname === "/time_series") handler = routes.timeSeries?.[timeSeriesCallIndex++];
      if (!handler) return Promise.reject(new Error(`unexpected request to ${url.toString()}`));
      const result = handler();
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

describe("fetchLiveEvRevenueCheckpoints — conditional FX fetching", () => {
  it("same currency: never requests /time_series for an FX pair, only for the stock's own price", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: unityCompanyFactsPayload(8, "USD") }),
      quote: () => ({ ok: true, status: 200, body: { currency: "USD", datetime: "2025-12-28", close: "50" } }),
      timeSeries: [() => ({ ok: true, status: 200, body: timeSeriesPayload("USD", PRICE_DATES, 50) })],
    });

    const result = await fetchLiveEvRevenueCheckpoints("U", "2026-01-01T00:00:00.000Z");

    expect(vi.mocked(fetch).mock.calls.filter((c) => new URL(c[0] as string).pathname === "/time_series")).toHaveLength(1);
    expect(result).toBeDefined();
    expect(result?.length).toBeGreaterThan(0);
    expect(result?.every((c) => c.currencyIntegrity.status === "SAME_CURRENCY")).toBe(true);
  });

  it("different currencies: requests a second /time_series call for the priceCurrency/reportingCurrency pair", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: unityCompanyFactsPayload(8, "EUR") }),
      quote: () => ({ ok: true, status: 200, body: { currency: "USD", datetime: "2025-12-28", close: "50" } }),
      timeSeries: [
        () => ({ ok: true, status: 200, body: timeSeriesPayload("USD", PRICE_DATES, 50) }),
        () => ({ ok: true, status: 200, body: timeSeriesPayload("EUR", PRICE_DATES, 0.9) }),
      ],
    });

    const result = await fetchLiveEvRevenueCheckpoints("U", "2026-01-01T00:00:00.000Z");

    const timeSeriesCalls = vi.mocked(fetch).mock.calls.filter((c) => new URL(c[0] as string).pathname === "/time_series");
    expect(timeSeriesCalls).toHaveLength(2);
    expect(new URL(timeSeriesCalls[1][0] as string).searchParams.get("symbol")).toBe("USD/EUR");
    expect(result?.every((c) => c.currencyIntegrity.status === "CONVERTED")).toBe(true);
  });
});

describe("fetchLiveEvRevenueCheckpoints — failure modes", () => {
  it("resolves undefined, never throws, when the ticker cannot be resolved", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({ tickers: () => ({ ok: true, status: 200, body: {} }) });

    const result = await fetchLiveEvRevenueCheckpoints("NOPE", "2026-01-01T00:00:00.000Z");
    expect(result).toBeUndefined();
  });

  it("resolves an empty array, not undefined, when reportingCurrency cannot be discovered at all", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: { cik: 1810806, facts: {} } }),
    });

    const result = await fetchLiveEvRevenueCheckpoints("U", "2026-01-01T00:00:00.000Z");
    expect(result).toEqual([]);
  });

  it("resolves undefined, never throws, when the Twelve Data quote request fails", async () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: unityCompanyFactsPayload(8, "USD") }),
      quote: () => ({ ok: false, status: 500, body: { code: 500, message: "boom", status: "error" } }),
    });

    const result = await fetchLiveEvRevenueCheckpoints("U", "2026-01-01T00:00:00.000Z");
    expect(result).toBeUndefined();
  });
});
