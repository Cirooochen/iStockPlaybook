// Phase E.7B — SEC EDGAR HTTP client. Mocked `fetch` only — no live
// network calls, mirrors twelve-data/client.test.ts's own convention
// exactly ("live API execution itself should remain an explicit
// developer validation, not a required unit test").
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSecEdgarClientConfigFromEnv,
  fetchCompanyFacts,
  fetchCompanyTickers,
  type SecEdgarClientConfig,
} from "@/infrastructure/market-data/sec-edgar/client";
import { SecEdgarHttpError, SecEdgarNetworkError } from "@/infrastructure/market-data/sec-edgar/errors";

const CONFIG: SecEdgarClientConfig = {
  userAgent: "iStockPlaybook-test test@example.com",
  tickersUrl: "https://fake.example.com/company_tickers.json",
  companyFactsBaseUrl: "https://fake.example.com/companyfacts",
};

function mockFetchOnce(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL, init?: RequestInit) => handler(input.toString(), init))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchCompanyTickers", () => {
  it("requests the configured tickers URL with a User-Agent header, no API key", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    mockFetchOnce((url, init) => {
      requestedUrl = url;
      requestedHeaders = init?.headers;
      return new Response(JSON.stringify({ "0": { cik_str: 1, ticker: "X" } }), { status: 200 });
    });

    const result = await fetchCompanyTickers(CONFIG);
    expect(result).toEqual({ "0": { cik_str: 1, ticker: "X" } });
    expect(requestedUrl).toBe(CONFIG.tickersUrl);
    expect((requestedHeaders as Record<string, string>)["User-Agent"]).toBe(CONFIG.userAgent);
  });
});

describe("fetchCompanyFacts", () => {
  it("requests {base}/CIK{cik}.json using the already zero-padded CIK", async () => {
    let requestedUrl = "";
    mockFetchOnce((url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ cik: 1810806 }), { status: 200 });
    });

    await fetchCompanyFacts(CONFIG, "0001810806");
    expect(requestedUrl).toBe("https://fake.example.com/companyfacts/CIK0001810806.json");
  });
});

describe("error handling", () => {
  it("a non-2xx status throws SecEdgarHttpError, never returned as data", async () => {
    mockFetchOnce(() => new Response("Not Found", { status: 404 }));
    await expect(fetchCompanyFacts(CONFIG, "0000000000")).rejects.toBeInstanceOf(SecEdgarHttpError);
  });

  it("a network-level failure throws SecEdgarNetworkError, never silently retried", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        return Promise.reject(new Error("ECONNREFUSED"));
      })
    );
    await expect(fetchCompanyFacts(CONFIG, "0001810806")).rejects.toBeInstanceOf(SecEdgarNetworkError);
    expect(callCount).toBe(1);
  });

  it("a non-JSON response body throws SecEdgarNetworkError", async () => {
    mockFetchOnce(() => new Response("<html>not json</html>", { status: 200 }));
    await expect(fetchCompanyFacts(CONFIG, "0001810806")).rejects.toBeInstanceOf(SecEdgarNetworkError);
  });
});

describe("createSecEdgarClientConfigFromEnv", () => {
  it("throws a clear error when SEC_EDGAR_USER_AGENT is not set", () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "");
    expect(() => createSecEdgarClientConfigFromEnv()).toThrow(/SEC_EDGAR_USER_AGENT/);
  });

  it("returns a config carrying the env-provided User-Agent when set", () => {
    vi.stubEnv("SEC_EDGAR_USER_AGENT", "MyApp contact@example.com");
    expect(createSecEdgarClientConfigFromEnv()).toEqual({ userAgent: "MyApp contact@example.com" });
  });
});
