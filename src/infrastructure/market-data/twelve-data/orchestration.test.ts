// Phase D.2 — fetchLiveMomentumResult. Mocked `fetch` only, per the
// established C.8A/C.8B convention — no live network calls. Exercises
// the real client/mapper/domain-signal/scoreMomentum pipeline end to
// end, so a genuine SCORED result requires realistic, sufficiently deep
// fixture data (not just "was the right function called").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLiveMomentumResult } from "@/infrastructure/market-data/twelve-data/orchestration";
import { RULESET } from "@/config/ruleset-v0.1";

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_BARS = RULESET.technical.dma200Period + RULESET.technical.trend.dma200SlopeLookbackDays;

function dateAt(index: number): string {
  return new Date(BASE_MS + index * ONE_DAY_MS).toISOString().slice(0, 10);
}

function makeAscendingTimeSeriesPayload(count: number, startClose: number) {
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
  return { meta: { currency: "USD" }, status: "ok", values };
}

const QUOTE_PAYLOAD = { currency: "USD", datetime: dateAt(HISTORY_BARS - 1), close: "121.90" };
const FX_PAYLOAD = { symbol: "USD/EUR", rate: 0.92, timestamp: Math.floor(Date.parse(dateAt(HISTORY_BARS - 1)) / 1000) };
const ERROR_PAYLOAD = { code: 401, message: "Invalid API Key", status: "error" };

type RouteHandler = (symbol: string | null) => { ok: boolean; status: number; body: unknown } | "reject";

function mockFetchRouter(routes: { quote?: RouteHandler; timeSeries?: RouteHandler; exchangeRate?: RouteHandler }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = new URL(input.toString());
      const symbol = url.searchParams.get("symbol");
      const handler =
        url.pathname === "/quote" ? routes.quote : url.pathname === "/time_series" ? routes.timeSeries : routes.exchangeRate;
      if (!handler) return Promise.reject(new Error(`unexpected request to ${url.pathname}`));
      const result = handler(symbol);
      if (result === "reject") return Promise.reject(new Error("simulated network failure"));
      return Promise.resolve(
        new Response(JSON.stringify(result.body), { status: result.status })
      );
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

describe("fetchLiveMomentumResult — success", () => {
  it("resolves a SCORED MomentumScoreResult when all four fetches succeed with sufficient history", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(HISTORY_BARS, 100) }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchLiveMomentumResult("U", "SPY", "2026-09-10T00:00:00.000Z");

    expect(result).toBeDefined();
    expect(result?.status).toBe("SCORED");
    if (result?.status === "SCORED") {
      expect(result.overall.score).toBeGreaterThanOrEqual(1);
      expect(result.overall.score).toBeLessThanOrEqual(10);
    }
  });

  it("no benchmark configured -> never requests the benchmark endpoint (only 3 calls: quote, stock time_series, FX), still resolves", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(HISTORY_BARS, 100) }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchLiveMomentumResult("U", undefined, "2026-09-10T00:00:00.000Z");

    expect(result).toBeDefined();
    expect(vi.mocked(fetch).mock.calls).toHaveLength(3);
    if (result) {
      const relativeStrength = result.components.find((c) => c.key === "relativeStrength");
      expect(relativeStrength?.status).toBe("NOT_APPLICABLE");
    }
  });
});

describe("fetchLiveMomentumResult — failure / fallback (never throws, resolves undefined)", () => {
  it("missing credentials -> resolves undefined, no fetch attempted at all", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());

    const result = await fetchLiveMomentumResult("U", "SPY", "2026-09-10T00:00:00.000Z");

    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("network failure on any request -> resolves undefined, not thrown", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      quote: () => "reject",
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(HISTORY_BARS, 100) }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    await expect(fetchLiveMomentumResult("U", "SPY", "2026-09-10T00:00:00.000Z")).resolves.toBeUndefined();
  });

  it("a Twelve Data provider error response (e.g. bad API key) -> resolves undefined, not thrown", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      quote: () => ({ ok: false, status: 401, body: ERROR_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(HISTORY_BARS, 100) }),
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    await expect(fetchLiveMomentumResult("U", "SPY", "2026-09-10T00:00:00.000Z")).resolves.toBeUndefined();
  });

  it("insufficient history (fewer bars than every lookback needs) -> still resolves (not a thrown error) — INSUFFICIENT_DATA is a legitimate scoreMomentum outcome, not a fetch failure", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test-key");
    mockFetchRouter({
      quote: () => ({ ok: true, status: 200, body: QUOTE_PAYLOAD }),
      timeSeries: () => ({ ok: true, status: 200, body: makeAscendingTimeSeriesPayload(10, 100) }), // far short of 220
      exchangeRate: () => ({ ok: true, status: 200, body: FX_PAYLOAD }),
    });

    const result = await fetchLiveMomentumResult("U", "SPY", "2026-09-10T00:00:00.000Z");
    expect(result).toBeDefined();
    expect(result?.status).toBe("INSUFFICIENT_DATA");
  });
});
