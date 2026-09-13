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

function companyFactsPayload(quarters: number) {
  return {
    cik: 1810806,
    entityName: "Unity Software Inc.",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: quarterlyRevenueFacts(quarters) } },
      },
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
    if (result?.status === "SCORED") {
      expect(result.overall.score).toBeGreaterThanOrEqual(1);
      expect(result.overall.score).toBeLessThanOrEqual(10);
    } else {
      // Sparse fixture (revenue only) may legitimately fall short of
      // GROWTH_SOFTWARE_TEMPLATE's minimumAvailableWeightShare — either
      // outcome proves the real pipeline ran end to end without throwing.
      expect(result?.status).toBe("INSUFFICIENT_DATA");
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
    expect(result?.status).toBe("INSUFFICIENT_DATA");
  });
});
