// Phase C.8A — Twelve Data adapter. Fixture-based only, per instruction —
// no live network calls anywhere in this file. Fixtures mirror the real
// response shapes confirmed in
// docs/validation/c7-twelve-data-contract-check.md.
import { describe, expect, it } from "vitest";
import {
  buildRawMarketData,
  mapExchangeRateResponse,
  mapQuoteResponse,
  mapTimeSeriesResponse,
} from "@/infrastructure/market-data/twelve-data/mappers";
import { TwelveDataApiError, isTwelveDataError } from "@/infrastructure/market-data/twelve-data/errors";

const ERROR_FIXTURE = { code: 401, message: "Invalid API Key", status: "error" };

describe("isTwelveDataError", () => {
  it("detects a well-formed Twelve Data error payload", () => {
    expect(isTwelveDataError(ERROR_FIXTURE)).toBe(true);
  });

  it("does not misclassify a normal quote/time_series/exchange_rate payload as an error", () => {
    expect(isTwelveDataError({ close: "40.46", currency: "USD" })).toBe(false);
    expect(isTwelveDataError({ values: [] })).toBe(false);
    expect(isTwelveDataError({ symbol: "USD/EUR", rate: 0.92 })).toBe(false);
    expect(isTwelveDataError(null)).toBe(false);
    expect(isTwelveDataError(undefined)).toBe(false);
    expect(isTwelveDataError("error")).toBe(false);
  });
});

describe("mapQuoteResponse", () => {
  const NORMAL = { currency: "USD", datetime: "2026-09-04", timestamp: 1757000000, close: "40.46000" };

  it("normal quote -> AVAILABLE price, parsed as a number, correct currency and asOf", () => {
    const result = mapQuoteResponse(NORMAL);
    expect(result.currency).toBe("USD");
    expect(result.price.status).toBe("AVAILABLE");
    if (result.price.status === "AVAILABLE") {
      expect(result.price.value).toBe(40.46);
      expect(result.price.value).toBeTypeOf("number");
      expect(result.price.asOf).toBe(new Date("2026-09-04").toISOString());
    }
  });

  it("timestamp normalization: falls back to the Unix-seconds `timestamp` when `datetime` is absent", () => {
    const result = mapQuoteResponse({ currency: "USD", timestamp: 1757000000, close: "40.46" });
    expect(result.price.status).toBe("AVAILABLE");
    if (result.price.status === "AVAILABLE") {
      expect(result.price.asOf).toBe(new Date(1757000000 * 1000).toISOString());
    }
  });

  it("timestamp normalization: space-separated intraday datetime is parsed correctly", () => {
    const result = mapQuoteResponse({ currency: "USD", datetime: "2026-09-04 15:59:00", close: "40.46" });
    expect(result.price.status).toBe("AVAILABLE");
    if (result.price.status === "AVAILABLE") {
      expect(result.price.asOf).toBe(new Date("2026-09-04T15:59:00").toISOString());
    }
  });

  it("null close -> price MISSING", () => {
    const result = mapQuoteResponse({ ...NORMAL, close: null });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("malformed numeric string ('N/A') -> price MISSING", () => {
    const result = mapQuoteResponse({ ...NORMAL, close: "N/A" });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("malformed numeric string ('148.85abc', partially-numeric garbage) -> price MISSING, not a truncated parse", () => {
    const result = mapQuoteResponse({ ...NORMAL, close: "148.85abc" });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("zero close -> price MISSING (price must remain positive)", () => {
    const result = mapQuoteResponse({ ...NORMAL, close: "0" });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("negative close -> price MISSING", () => {
    const result = mapQuoteResponse({ ...NORMAL, close: "-5.00" });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("missing/invalid currency -> price MISSING even if close/datetime are valid", () => {
    const missing = mapQuoteResponse({ datetime: "2026-09-04", close: "40.46" });
    expect(missing.currency).toBe("");
    expect(missing.price).toEqual({ status: "MISSING" });

    const invalid = mapQuoteResponse({ ...NORMAL, currency: "usd" }); // lowercase, structurally invalid
    expect(invalid.price).toEqual({ status: "MISSING" });
  });

  it("missing/unparseable datetime and timestamp -> price MISSING", () => {
    const result = mapQuoteResponse({ currency: "USD", close: "40.46" });
    expect(result.price).toEqual({ status: "MISSING" });
  });

  it("provider error shape -> throws TwelveDataApiError with the code/message", () => {
    expect(() => mapQuoteResponse(ERROR_FIXTURE)).toThrow(TwelveDataApiError);
    try {
      mapQuoteResponse(ERROR_FIXTURE);
      throw new Error("expected mapQuoteResponse to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TwelveDataApiError);
      expect((err as TwelveDataApiError).code).toBe(401);
    }
  });
});

describe("mapTimeSeriesResponse", () => {
  // Newest-first, matching Twelve Data's documented default order — the
  // mapper must re-sort, not trust this.
  const NORMAL_DESCENDING = {
    meta: { currency: "USD" },
    status: "ok",
    values: [
      { datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "40.46", volume: "1234567" },
      { datetime: "2026-09-03", open: "39.50", high: "40.20", low: "39.00", close: "40.00", volume: "1100000" },
      { datetime: "2026-09-02", open: "39.00", high: "39.80", low: "38.50", close: "39.50", volume: "980000" },
    ],
  };

  it("normal OHLCV: all fields parsed as numbers, dates preserved as plain YYYY-MM-DD", () => {
    const bars = mapTimeSeriesResponse(NORMAL_DESCENDING);
    expect(bars).toHaveLength(3);
    const first = bars[0];
    expect(first.date).toBe("2026-09-02"); // ascending -> earliest first
    expect(first.close).toEqual({ status: "AVAILABLE", value: 39.5, asOf: "2026-09-02" });
    expect(first.volume).toEqual({ status: "AVAILABLE", value: 980000, asOf: "2026-09-02" });
  });

  it("ascending bar output: input given newest-first (Twelve Data's default) is re-sorted oldest-first", () => {
    const bars = mapTimeSeriesResponse(NORMAL_DESCENDING);
    expect(bars.map((b) => b.date)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
  });

  it("ascending bar output holds even when the input is already ascending (idempotent, not order-dependent)", () => {
    const alreadyAscending = {
      ...NORMAL_DESCENDING,
      values: [...NORMAL_DESCENDING.values].reverse(),
    };
    const bars = mapTimeSeriesResponse(alreadyAscending);
    expect(bars.map((b) => b.date)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
  });

  it("null/missing volume on one bar -> that bar's volume MISSING, its OHLC fields unaffected", () => {
    const withMissingVolume = {
      ...NORMAL_DESCENDING,
      values: [{ datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "40.46", volume: null }],
    };
    const bars = mapTimeSeriesResponse(withMissingVolume);
    expect(bars).toHaveLength(1);
    expect(bars[0].volume).toEqual({ status: "MISSING" });
    expect(bars[0].close.status).toBe("AVAILABLE");
  });

  it("preserves a valid zero volume as AVAILABLE (zero is legitimate for volume, unlike price)", () => {
    const withZeroVolume = {
      ...NORMAL_DESCENDING,
      values: [{ datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "40.46", volume: "0" }],
    };
    const bars = mapTimeSeriesResponse(withZeroVolume);
    expect(bars[0].volume).toEqual({ status: "AVAILABLE", value: 0, asOf: "2026-09-04" });
  });

  it("malformed numeric string on one field ('close': 'N/A') -> only that field MISSING", () => {
    const malformed = {
      ...NORMAL_DESCENDING,
      values: [{ datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "N/A", volume: "1000" }],
    };
    const bars = mapTimeSeriesResponse(malformed);
    expect(bars[0].close).toEqual({ status: "MISSING" });
    expect(bars[0].open.status).toBe("AVAILABLE");
    expect(bars[0].volume.status).toBe("AVAILABLE");
  });

  it("a bar with an unparseable/missing datetime is dropped entirely, not kept with a placeholder date", () => {
    const withBadDate = {
      ...NORMAL_DESCENDING,
      values: [
        { datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "40.46", volume: "1000" },
        { datetime: "not-a-date", open: "1", high: "1", low: "1", close: "1", volume: "1" },
        { open: "1", high: "1", low: "1", close: "1", volume: "1" }, // datetime absent entirely
      ],
    };
    const bars = mapTimeSeriesResponse(withBadDate);
    expect(bars).toHaveLength(1);
    expect(bars[0].date).toBe("2026-09-04");
  });

  it("an empty/missing values array is a legitimate empty result, not an error", () => {
    expect(mapTimeSeriesResponse({ meta: { currency: "USD" }, status: "ok", values: [] })).toEqual([]);
    expect(mapTimeSeriesResponse({ meta: { currency: "USD" }, status: "ok" })).toEqual([]);
  });

  it("provider error shape -> throws TwelveDataApiError", () => {
    expect(() => mapTimeSeriesResponse(ERROR_FIXTURE)).toThrow(TwelveDataApiError);
  });
});

describe("mapExchangeRateResponse", () => {
  const NORMAL = { symbol: "USD/EUR", rate: 0.92, timestamp: 1757000000 };

  it("normal FX response: USD/EUR direction mapped directly, rate already a number, timestamp normalized", () => {
    const result = mapExchangeRateResponse(NORMAL);
    expect(result.from).toBe("USD");
    expect(result.to).toBe("EUR");
    expect(result.rate).toEqual({
      status: "AVAILABLE",
      value: 0.92,
      asOf: new Date(1757000000 * 1000).toISOString(),
    });
  });

  it("rate = 0 -> MISSING (rate must remain positive)", () => {
    const result = mapExchangeRateResponse({ ...NORMAL, rate: 0 });
    expect(result.rate).toEqual({ status: "MISSING" });
  });

  it("negative rate -> MISSING", () => {
    const result = mapExchangeRateResponse({ ...NORMAL, rate: -0.92 });
    expect(result.rate).toEqual({ status: "MISSING" });
  });

  it("missing/non-numeric rate -> MISSING", () => {
    expect(mapExchangeRateResponse({ ...NORMAL, rate: null }).rate).toEqual({ status: "MISSING" });
    expect(mapExchangeRateResponse({ ...NORMAL, rate: "not-a-number" }).rate).toEqual({ status: "MISSING" });
  });

  it('tolerates a string-typed rate (e.g. "0.92") even though the schema types it as a number — parsing is lenient by representation, not by which endpoint sent it', () => {
    const result = mapExchangeRateResponse({ ...NORMAL, rate: "0.92" });
    expect(result.rate.status).toBe("AVAILABLE");
    if (result.rate.status === "AVAILABLE") {
      expect(result.rate.value).toBe(0.92);
    }
  });

  it("missing/malformed symbol -> from/to empty, rate MISSING", () => {
    const result = mapExchangeRateResponse({ rate: 0.92, timestamp: 1757000000 });
    expect(result.from).toBe("");
    expect(result.to).toBe("");
    expect(result.rate).toEqual({ status: "MISSING" });
  });

  it("provider error shape -> throws TwelveDataApiError", () => {
    expect(() => mapExchangeRateResponse(ERROR_FIXTURE)).toThrow(TwelveDataApiError);
  });
});

describe("buildRawMarketData", () => {
  const quotePayload = { currency: "USD", datetime: "2026-09-04", close: "40.46" };
  const timeSeriesPayload = {
    meta: { currency: "USD" },
    status: "ok",
    values: [{ datetime: "2026-09-04", open: "40.00", high: "41.00", low: "39.50", close: "40.46", volume: "1000" }],
  };
  const fxPayload = { symbol: "USD/EUR", rate: 0.92, timestamp: 1757000000 };

  it("composes quote + time_series + fx into a single RawMarketData with the caller-supplied instrumentId/checkedAt", () => {
    const result = buildRawMarketData({
      instrumentId: "synthetic-instrument",
      quotePayload,
      timeSeriesPayload,
      fxPayload,
      checkedAt: "2026-09-04T16:00:00.000Z",
    });
    expect(result.instrumentId).toBe("synthetic-instrument");
    expect(result.checkedAt).toBe("2026-09-04T16:00:00.000Z");
    expect(result.quote.price.status).toBe("AVAILABLE");
    expect(result.ohlcv).toHaveLength(1);
    expect(result.fx?.from).toBe("USD");
  });

  it("fx is undefined when fxPayload is omitted (no conversion needed)", () => {
    const result = buildRawMarketData({
      instrumentId: "synthetic-instrument",
      quotePayload,
      timeSeriesPayload,
      checkedAt: "2026-09-04T16:00:00.000Z",
    });
    expect(result.fx).toBeUndefined();
  });

  it("propagates a TwelveDataApiError thrown by any sub-mapper rather than swallowing it into MISSING", () => {
    expect(() =>
      buildRawMarketData({
        instrumentId: "synthetic-instrument",
        quotePayload: ERROR_FIXTURE,
        timeSeriesPayload,
        checkedAt: "2026-09-04T16:00:00.000Z",
      })
    ).toThrow(TwelveDataApiError);
  });
});
