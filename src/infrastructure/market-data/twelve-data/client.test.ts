// Phase C.8B — Twelve Data HTTP client. Mocked `fetch` only — no live
// network calls, per instruction ("keep existing fixture tests; mock
// client behavior where useful; live API execution itself should remain
// an explicit developer validation, not a required unit test").
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTwelveDataClientConfigFromEnv,
  fetchDailyTimeSeries,
  fetchExchangeRate,
  fetchQuote,
  TwelveDataNetworkError,
  type TwelveDataClientConfig,
} from "@/infrastructure/market-data/twelve-data/client";

const CONFIG: TwelveDataClientConfig = { apiKey: "test-key-do-not-print", baseUrl: "https://fake.example.com" };

function mockFetchOnce(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => handler(input.toString()))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchQuote", () => {
  it("requests /quote with the symbol and apikey query params, returns parsed JSON", async () => {
    let requestedUrl = "";
    mockFetchOnce((url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ currency: "USD", close: "40.46" }), { status: 200 });
    });

    const result = await fetchQuote(CONFIG, "U");
    expect(result).toEqual({ currency: "USD", close: "40.46" });

    const parsed = new URL(requestedUrl);
    expect(parsed.pathname).toBe("/quote");
    expect(parsed.searchParams.get("symbol")).toBe("U");
    expect(parsed.searchParams.get("apikey")).toBe("test-key-do-not-print");
  });
});

describe("fetchDailyTimeSeries", () => {
  it("requests /time_series with interval=1day, the requested outputsize, and order=asc — never relying on the provider default", async () => {
    let requestedUrl = "";
    mockFetchOnce((url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ meta: {}, values: [], status: "ok" }), { status: 200 });
    });

    await fetchDailyTimeSeries(CONFIG, "U", 220);

    const parsed = new URL(requestedUrl);
    expect(parsed.pathname).toBe("/time_series");
    expect(parsed.searchParams.get("symbol")).toBe("U");
    expect(parsed.searchParams.get("interval")).toBe("1day");
    expect(parsed.searchParams.get("outputsize")).toBe("220");
    expect(parsed.searchParams.get("order")).toBe("asc");
  });
});

describe("fetchExchangeRate", () => {
  it("requests /exchange_rate with the given pair as `symbol`", async () => {
    let requestedUrl = "";
    mockFetchOnce((url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ symbol: "USD/EUR", rate: 0.92, timestamp: 1757000000 }), { status: 200 });
    });

    await fetchExchangeRate(CONFIG, "USD/EUR");

    const parsed = new URL(requestedUrl);
    expect(parsed.pathname).toBe("/exchange_rate");
    expect(parsed.searchParams.get("symbol")).toBe("USD/EUR");
  });
});

describe("error handling — distinct from a provider error-shaped body", () => {
  it("a Twelve Data error-shaped 401 body is returned AS-IS, not thrown here (mappers.ts owns that detection)", async () => {
    mockFetchOnce(
      () => new Response(JSON.stringify({ code: 401, message: "Invalid API Key", status: "error" }), { status: 401 })
    );
    const result = await fetchQuote(CONFIG, "U");
    expect(result).toEqual({ code: 401, message: "Invalid API Key", status: "error" });
  });

  it("a network-level failure (fetch rejects) throws TwelveDataNetworkError, never silently retried", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        return Promise.reject(new Error("ECONNREFUSED"));
      })
    );
    await expect(fetchQuote(CONFIG, "U")).rejects.toBeInstanceOf(TwelveDataNetworkError);
    expect(callCount).toBe(1); // exactly one attempt — no retry
  });

  it("a non-JSON response body throws TwelveDataNetworkError", async () => {
    mockFetchOnce(() => new Response("<html>not json</html>", { status: 200 }));
    await expect(fetchQuote(CONFIG, "U")).rejects.toBeInstanceOf(TwelveDataNetworkError);
  });

  it("the API key never appears in a thrown network-error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );
    try {
      await fetchQuote(CONFIG, "U");
      throw new Error("expected fetchQuote to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(CONFIG.apiKey);
    }
  });
});

describe("createTwelveDataClientConfigFromEnv", () => {
  it("throws a clear error when TWELVE_DATA_API_KEY is not set", () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    expect(() => createTwelveDataClientConfigFromEnv()).toThrow(/TWELVE_DATA_API_KEY/);
  });

  it("returns a config carrying the env-provided key when set", () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "env-provided-key");
    expect(createTwelveDataClientConfigFromEnv()).toEqual({ apiKey: "env-provided-key" });
  });
});
