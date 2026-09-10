// Phase C.5 — Primary Trend (dma200Slope). See trend.ts's doc comment and
// docs/phase-c5-trend-relative-strength-data-contract.md §3 for the
// approved v0.1 convention this exercises. Synthetic fixtures only.
import { describe, expect, it } from "vitest";
import { computeDma200Slope, deriveTrendSignal } from "@/domain/signals/trend";
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

function makeBars(count: number, closes?: number[]): OhlcvBar[] {
  return Array.from({ length: count }, (_, i) => {
    const date = dateAt(i);
    const close = closes ? closes[i] : 100;
    return {
      date,
      open: field(close, date),
      high: field(close, date),
      low: field(close, date),
      close: field(close, date),
      volume: field(1000, date),
    };
  });
}

const dma200Period = RULESET.technical.dma200Period; // 200
const lookback = RULESET.technical.trend.dma200SlopeLookbackDays; // 20
const totalBars = dma200Period + lookback; // 220

describe("computeDma200Slope", () => {
  it("exact lookback boundary: dma200Period+lookback bars -> AVAILABLE, correct percentage-change value, asOf = last bar's date", () => {
    const closes = Array.from({ length: totalBars }, (_, i) => i + 1); // 1..220
    const bars = makeBars(totalBars, closes);

    const pastCloses = closes.slice(0, dma200Period); // first 200 -> "lookback days ago" window
    const currentCloses = closes.slice(lookback, totalBars); // last 200 -> "current" window
    const pastAvg = pastCloses.reduce((a, b) => a + b, 0) / dma200Period;
    const currentAvg = currentCloses.reduce((a, b) => a + b, 0) / dma200Period;
    const expected = currentAvg / pastAvg - 1;

    const result = computeDma200Slope(bars);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value).toBeCloseTo(expected, 10);
      expect(result.asOf).toBe(dateAt(totalBars - 1));
    }
  });

  it("insufficient history (one bar short) -> MISSING", () => {
    const bars = makeBars(totalBars - 1);
    expect(computeDma200Slope(bars)).toEqual(MISSING);
  });

  it("a MISSING close only within the CURRENT window (not the lookback-ago window) -> MISSING", () => {
    const bars = makeBars(totalBars);
    bars[210] = { ...bars[210], close: MISSING }; // index 210 is in [20,219] (current) but not [0,199] (past)
    expect(computeDma200Slope(bars)).toEqual(MISSING);
  });

  it("a MISSING close only within the LOOKBACK-AGO window (not the current window) -> MISSING", () => {
    const bars = makeBars(totalBars);
    bars[5] = { ...bars[5], close: MISSING }; // index 5 is in [0,199] (past) but not [20,219] (current)
    expect(computeDma200Slope(bars)).toEqual(MISSING);
  });

  it("a zero lookback-ago DMA200 -> MISSING, not a divide-by-zero/Infinity", () => {
    const closes = Array.from({ length: totalBars }, (_, i) => (i < dma200Period ? 0 : 100));
    const bars = makeBars(totalBars, closes);
    expect(computeDma200Slope(bars)).toEqual(MISSING);
  });

  it("deterministic: repeated calls on the same input produce the identical result", () => {
    const closes = Array.from({ length: totalBars }, (_, i) => 100 + Math.sin(i) * 3);
    const bars = makeBars(totalBars, closes);
    expect(computeDma200Slope(bars)).toEqual(computeDma200Slope(bars));
  });

  it("generic non-Unity fixture: a synthetic instrument at a distinct price scale, falling trend -> negative slope", () => {
    const closes = Array.from({ length: totalBars }, (_, i) => 2000 - i); // declining, non-Unity price scale
    const bars = makeBars(totalBars, closes);
    const result = computeDma200Slope(bars);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value).toBeLessThan(0); // current (lower prices) below lookback-ago (higher prices)
    }
  });
});

describe("deriveTrendSignal", () => {
  it("wraps computeDma200Slope's result under dma200Slope", () => {
    const bars = makeBars(totalBars);
    expect(deriveTrendSignal(bars)).toEqual({ dma200Slope: computeDma200Slope(bars) });
  });
});
