// v0.1 Stabilization — fetchStockPageLiveData. Mocked `fetch` only, per
// the established C.8A/D.2/I.4A convention — no live network calls.
// Primary purpose: prove the consolidation itself (Momentum and
// Valuation no longer make avoidable duplicate Twelve Data/SEC EDGAR
// calls), on top of the existing, untouched
// fetchLiveMomentumResult/fetchLiveEvRevenueCheckpoints test suites which
// already cover each pipeline's own derivation logic in isolation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStockPageLiveData } from "@/infrastructure/market-data/stock-page-orchestration";

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function dateAt(index: number): string {
  return new Date(BASE_MS + index * ONE_DAY_MS).toISOString().slice(0, 10);
}

// Enough bars for a genuinely SCORED momentum result (matches
// twelve-data/orchestration.test.ts's own fixture depth) — also easily
// covers Valuation's own longer lookback once requested at the shared,
// larger size.
function makeAscendingTimeSeriesPayload(count: number, startClose: number, currency: string = "USD") {
  const values = Array.from({ length: count }, (_, i) => {
    const close = startClose + i * 0.1;
    return {
      datetime: dateAt(i),
      open: String(close - 0.2),
      high: String(close + 0.3),
      low: String(close - 0.3),
      close: String(close),
      volume: String(1_000_000 + (i % 5) * 10_000),
    };
  });
  return { meta: { currency }, status: "ok", values };
}

const TICKERS_PAYLOAD = { "0": { cik_str: 937966, ticker: "ASML", title: "ASML Holding N.V." } };

// ASML-shaped: two ANNUAL periods, EUR reporting, debt/cash both resolve
// (unlike Unity's real 0.30.0 finding) so deriveEvRevenueCheckpoints
// actually produces a non-empty result — proving the shared-data path
// really is wired end to end, not just "didn't throw."
function asmlShapedCompanyFactsPayload() {
  const fact = (fy: number, val: number) => ({
    start: `${fy}-01-01`,
    end: `${fy}-12-31`,
    val,
    fy,
    fp: "FY",
    form: "20-F",
    filed: `${fy + 1}-02-25`,
    accn: `0000937966-${fy + 1}-000007`,
  });
  return {
    cik: 937966,
    entityName: "ASML Holding N.V.",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { EUR: [fact(2024, 20_000_000_000), fact(2025, 22_000_000_000)] } },
        OperatingIncomeLoss: { units: { EUR: [fact(2024, 6_000_000_000), fact(2025, 7_000_000_000)] } },
        CashAndCashEquivalentsAtCarryingValue: { units: { EUR: [fact(2024, 5_000_000_000), fact(2025, 6_000_000_000)] } },
        LongTermDebtNoncurrent: { units: { EUR: [fact(2024, 3_000_000_000), fact(2025, 3_500_000_000)] } },
      },
      dei: {
        EntityCommonStockSharesOutstanding: { units: { shares: [fact(2024, 400_000_000), fact(2025, 390_000_000)] } },
      },
    },
  };
}

type RouteResult = { ok: boolean; status: number; body: unknown } | "reject";
type RouteHandler = (symbol: string | null) => RouteResult;

function mockFetchRouter(routes: {
  tickers?: RouteHandler;
  companyFacts?: RouteHandler;
  quote?: RouteHandler;
  timeSeries?: RouteHandler;
  exchangeRate?: RouteHandler;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol");
      let handler: RouteHandler | undefined;
      if (url.hostname === "www.sec.gov") handler = routes.tickers;
      else if (url.hostname === "data.sec.gov") handler = routes.companyFacts;
      else if (url.pathname === "/quote") handler = routes.quote;
      else if (url.pathname === "/time_series") handler = routes.timeSeries;
      else if (url.pathname === "/exchange_rate") handler = routes.exchangeRate;
      if (!handler) return Promise.reject(new Error(`unexpected request to ${url.toString()}`));
      const result = handler(symbol);
      if (result === "reject") return Promise.reject(new Error("simulated network failure"));
      return Promise.resolve(new Response(JSON.stringify(result.body), { status: result.status }));
    })
  );
}

function callsTo(pathname: string): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter((c) => new URL(c[0] as string).pathname === pathname);
}
function hostCalls(hostname: string): unknown[][] {
  return vi.mocked(fetch).mock.calls.filter((c) => new URL(c[0] as string).hostname === hostname);
}

const QUOTE_PAYLOAD = { currency: "USD", datetime: dateAt(299), close: "742.50" };
const FX_PAYLOAD = { symbol: "USD/EUR", rate: 0.9, timestamp: Math.floor(Date.parse(dateAt(299)) / 1000) };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SEC_EDGAR_USER_AGENT", "test-agent contact@example.com");
  vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchStockPageLiveData — consolidation (no avoidable duplicate calls)", () => {
  it("fetches the quote, the stock's daily series, and the companyfacts payload exactly ONCE each — not once per consumer", async () => {
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: asmlShapedCompanyFactsPayload() }),
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: (symbol) => ({
        ok: true,
        status: 200,
        body: symbol === "USD/EUR" ? makeAscendingTimeSeriesPayload(2000, 0.9, "EUR") : makeAscendingTimeSeriesPayload(2000, 700, "USD"),
      }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchStockPageLiveData("ASML", undefined, "2026-09-21T00:00:00.000Z");

    expect(callsTo("/quote")).toHaveLength(1);
    expect(hostCalls("data.sec.gov")).toHaveLength(1);
    // Exactly two /time_series calls total: the stock's own price series
    // (shared by Momentum + Valuation) and Valuation's USD/EUR FX series
    // — never a second stock-price series for Momentum's own use.
    const timeSeriesCalls = callsTo("/time_series");
    expect(timeSeriesCalls).toHaveLength(2);
    expect(timeSeriesCalls.filter((c) => new URL(c[0] as string).searchParams.get("symbol") === "ASML")).toHaveLength(1);
    expect(timeSeriesCalls.filter((c) => new URL(c[0] as string).searchParams.get("symbol") === "USD/EUR")).toHaveLength(1);

    expect(result.momentumResult).toBeDefined();
    expect(result.momentumResult?.status).toBe("SCORED");
    expect(result.evRevenueCheckpoints).toBeDefined();
    expect(result.evRevenueCheckpoints?.length).toBeGreaterThan(0);
    expect(result.evRevenueCheckpoints?.every((c) => c.currencyIntegrity.status === "CONVERTED")).toBe(true);
  });

  it("same-currency stock (no FX series needed): exactly one /time_series call total, still shared correctly", async () => {
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: { "0": { cik_str: 937966, ticker: "ASML", title: "ASML" } } }),
      companyFacts: () => ({
        ok: true,
        status: 200,
        body: {
          ...asmlShapedCompanyFactsPayload(),
          facts: {
            ...asmlShapedCompanyFactsPayload().facts,
            "us-gaap": Object.fromEntries(
              Object.entries(asmlShapedCompanyFactsPayload().facts["us-gaap"]).map(([tag, concept]) => [
                tag,
                { units: { USD: concept.units.EUR } },
              ])
            ),
          },
        },
      }),
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(2000, 700, "USD") }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchStockPageLiveData("ASML", undefined, "2026-09-21T00:00:00.000Z");

    expect(callsTo("/time_series")).toHaveLength(1);
    expect(result.momentumResult?.status).toBe("SCORED");
    expect(result.evRevenueCheckpoints?.every((c) => c.currencyIntegrity.status === "SAME_CURRENCY")).toBe(true);
  });
});

describe("fetchStockPageLiveData — independent failure modes", () => {
  it("Fundamentals/SEC EDGAR failure only affects Valuation — Momentum still resolves SCORED from the shared Twelve Data fetch", async () => {
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: {} }), // ticker cannot be resolved -> fundamentals undefined
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(2000, 700, "USD") }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchStockPageLiveData("ASML", undefined, "2026-09-21T00:00:00.000Z");

    expect(result.fundamentalsFetch).toBeUndefined();
    expect(result.evRevenueCheckpoints).toBeUndefined();
    expect(result.momentumResult?.status).toBe("SCORED");
  });

  it("reportingCurrency undiscoverable -> Valuation resolves [] (not undefined), Momentum unaffected", async () => {
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: { cik: 937966, facts: {} } }),
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(2000, 700, "USD") }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchStockPageLiveData("ASML", undefined, "2026-09-21T00:00:00.000Z");

    expect(result.evRevenueCheckpoints).toEqual([]);
    expect(result.momentumResult?.status).toBe("SCORED");
  });

  it("shared Twelve Data fetch failure (quote fails) resolves BOTH Momentum and Valuation to undefined, never thrown", async () => {
    mockFetchRouter({
      tickers: () => ({ ok: true, status: 200, body: TICKERS_PAYLOAD }),
      companyFacts: () => ({ ok: true, status: 200, body: asmlShapedCompanyFactsPayload() }),
      quote: () => "reject",
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(2000, 700, "USD") }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchStockPageLiveData("ASML", undefined, "2026-09-21T00:00:00.000Z");

    expect(result.momentumResult).toBeUndefined();
    expect(result.evRevenueCheckpoints).toBeUndefined();
    expect(result.fundamentalsFetch).toBeDefined(); // SEC EDGAR succeeded independently
  });
});
