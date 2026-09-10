// Phase C.5 — Relative Strength (return differential). See
// relative-strength.ts's doc comment and
// docs/phase-c5-trend-relative-strength-data-contract.md §4 for the
// approved v0.1 convention this exercises. Synthetic fixtures only — no
// real benchmark symbol anywhere.
import { describe, expect, it } from "vitest";
import { computeRelativeStrength } from "@/domain/signals/relative-strength";
import type { DataField, OhlcvBar } from "@/types/market-data";
import { RULESET } from "@/config/ruleset-v0.1";

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function dateAt(index: number): string {
  return new Date(BASE_MS + index * ONE_DAY_MS).toISOString().slice(0, 10);
}

function field(value: number, asOf: string): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

const MISSING: DataField<number> = { status: "MISSING" };

function bar(date: string, close: DataField<number>): OhlcvBar {
  return { date, open: close, high: close, low: close, close, volume: field(1000, date) };
}

function makeSeries(count: number, closes: number[], dateOffset = 0): OhlcvBar[] {
  return Array.from({ length: count }, (_, i) => bar(dateAt(i + dateOffset), field(closes[i], dateAt(i + dateOffset))));
}

const window = RULESET.technical.relativeStrength.comparisonWindowTradingDays; // 63
const totalBars = window + 1; // 64

// SYNTHETIC_INDEX — a made-up, non-real benchmark identifier, deliberately
// not resembling any real ticker.
const BENCHMARK_ID = "SYNTHETIC_INDEX";

describe("computeRelativeStrength — NOT_APPLICABLE", () => {
  it("no benchmark configured (undefined) -> NOT_APPLICABLE, regardless of any data provided", () => {
    const stock = makeSeries(totalBars, Array(totalBars).fill(100));
    const benchmark = makeSeries(totalBars, Array(totalBars).fill(100));
    expect(computeRelativeStrength(stock, undefined, benchmark)).toEqual({ status: "NOT_APPLICABLE" });
  });
});

describe("computeRelativeStrength — AVAILABLE, return-differential correctness", () => {
  it("exact lookback boundary (window+1 stock bars), aligned dates -> AVAILABLE, correct stockReturn/benchmarkReturn/relativeStrength, asOf = D_end", () => {
    const stockCloses = Array(totalBars).fill(100);
    stockCloses[totalBars - 1] = 130; // stockReturn = 130/100 - 1 = 0.30
    const benchmarkCloses = Array(totalBars).fill(100);
    benchmarkCloses[totalBars - 1] = 110; // benchmarkReturn = 110/100 - 1 = 0.10

    const stock = makeSeries(totalBars, stockCloses);
    const benchmark = makeSeries(totalBars, benchmarkCloses);

    const result = computeRelativeStrength(stock, BENCHMARK_ID, benchmark);
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
    expect(result.benchmarkInstrumentId).toBe(BENCHMARK_ID);
    expect(result.windowTradingDays).toBe(window);
    expect(result.asOf).toBe(dateAt(totalBars - 1));
    expect(result.stockReturn).toBeCloseTo(0.3, 10);
    expect(result.benchmarkReturn).toBeCloseTo(0.1, 10);
    expect(result.relativeStrength).toBeCloseTo(0.2, 10); // positive = outperformed
  });

  it("relativeStrength = 0 when stock and benchmark returns match exactly", () => {
    const closes = Array(totalBars).fill(100);
    closes[totalBars - 1] = 125;
    const stock = makeSeries(totalBars, closes);
    const benchmark = makeSeries(totalBars, closes);
    const result = computeRelativeStrength(stock, BENCHMARK_ID, benchmark);
    if (result.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
    expect(result.relativeStrength).toBe(0);
  });

  it("relativeStrength is negative when the stock underperforms the benchmark", () => {
    const stockCloses = Array(totalBars).fill(100);
    stockCloses[totalBars - 1] = 105; // +5%
    const benchmarkCloses = Array(totalBars).fill(100);
    benchmarkCloses[totalBars - 1] = 120; // +20%
    const stock = makeSeries(totalBars, stockCloses);
    const benchmark = makeSeries(totalBars, benchmarkCloses);
    const result = computeRelativeStrength(stock, BENCHMARK_ID, benchmark);
    if (result.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
    expect(result.relativeStrength).toBeLessThan(0);
  });

  it("deterministic: repeated calls on the same input produce the identical result", () => {
    const stockCloses = Array.from({ length: totalBars }, (_, i) => 100 + i * 0.3);
    const benchmarkCloses = Array.from({ length: totalBars }, (_, i) => 100 + i * 0.1);
    const stock = makeSeries(totalBars, stockCloses);
    const benchmark = makeSeries(totalBars, benchmarkCloses);
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual(
      computeRelativeStrength(stock, BENCHMARK_ID, benchmark)
    );
  });
});

describe("computeRelativeStrength — MISSING (insufficient stock history)", () => {
  it("fewer than window+1 stock bars -> MISSING", () => {
    const stock = makeSeries(window, Array(window).fill(100));
    const benchmark = makeSeries(window, Array(window).fill(100));
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual({ status: "MISSING" });
  });
});

describe("computeRelativeStrength — exact date-string alignment, no nearest-date fallback", () => {
  it("benchmark missing a bar at D_end (the stock's most recent date) -> MISSING, even though the benchmark has data 'close enough'", () => {
    const stock = makeSeries(totalBars, Array(totalBars).fill(100));
    // Benchmark series shifted by one day — every date is off by 1, so it
    // never exactly matches D_end or D_start, despite having the "same"
    // relative shape.
    const benchmark = makeSeries(totalBars, Array(totalBars).fill(100), 1);
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual({ status: "MISSING" });
  });

  it("benchmark missing a bar at D_start only (has D_end) -> MISSING", () => {
    const stock = makeSeries(totalBars, Array(totalBars).fill(100));
    // Benchmark covers every date except the very first (D_start).
    const benchmark = makeSeries(totalBars - 1, Array(totalBars - 1).fill(100), 1);
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual({ status: "MISSING" });
  });

  it("benchmark has a bar at the required date, but its close is MISSING -> MISSING", () => {
    const stock = makeSeries(totalBars, Array(totalBars).fill(100));
    const benchmark = makeSeries(totalBars, Array(totalBars).fill(100));
    benchmark[totalBars - 1] = { ...benchmark[totalBars - 1], close: MISSING }; // D_end's close missing
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual({ status: "MISSING" });
  });

  it("the stock's own close at D_start or D_end is MISSING -> MISSING", () => {
    const stock = makeSeries(totalBars, Array(totalBars).fill(100));
    stock[0] = { ...stock[0], close: MISSING }; // D_start
    const benchmark = makeSeries(totalBars, Array(totalBars).fill(100));
    expect(computeRelativeStrength(stock, BENCHMARK_ID, benchmark)).toEqual({ status: "MISSING" });
  });
});

describe("computeRelativeStrength — generic, non-real benchmark fixture", () => {
  it("works with a synthetic instrument and a made-up benchmark id at a distinct price scale", () => {
    const stockCloses = Array.from({ length: totalBars }, (_, i) => 5000 + i * 2);
    const benchmarkCloses = Array.from({ length: totalBars }, (_, i) => 3000 + i);
    const stock = makeSeries(totalBars, stockCloses);
    const benchmark = makeSeries(totalBars, benchmarkCloses);
    const result = computeRelativeStrength(stock, "MADE_UP_BENCHMARK_XYZ", benchmark);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.benchmarkInstrumentId).toBe("MADE_UP_BENCHMARK_XYZ");
    }
  });
});
