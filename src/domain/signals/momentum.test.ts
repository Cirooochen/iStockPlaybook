// Phase C.3 — derived technical signals. See momentum.ts's doc comment for
// the required-input semantics this exercises, and
// docs/phase-c0-market-data-contract.md §5 for the approved contract.
import { describe, expect, it } from "vitest";
import {
  compute50DayMovingAverage,
  compute200DayMovingAverage,
  computeRelativeVolume,
  computeRsi,
  deriveTechnicalSignals,
} from "@/domain/signals/momentum";
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

// Builds `count` bars, close[i] = closes[i] (or a flat fallback), volume[i]
// = volumes[i] (or a flat fallback). open/high/low are irrelevant to every
// function under test here, so they're filled with a placeholder AVAILABLE
// field rather than realistic OHLC relationships.
function makeBars(
  count: number,
  opts: { closes?: number[]; volumes?: number[] } = {}
): OhlcvBar[] {
  return Array.from({ length: count }, (_, i) => {
    const date = dateAt(i);
    const close = opts.closes ? opts.closes[i] : 100;
    const volume = opts.volumes ? opts.volumes[i] : 1000;
    return {
      date,
      open: field(close, date),
      high: field(close, date),
      low: field(close, date),
      close: field(close, date),
      volume: field(volume, date),
    };
  });
}

describe("compute50DayMovingAverage", () => {
  const period = RULESET.technical.dma50Period; // 50

  it("exact lookback boundary: exactly 50 bars with AVAILABLE closes → AVAILABLE, correct average, asOf = last bar's date", () => {
    const closes = Array.from({ length: period }, (_, i) => i + 1); // 1..50, sum 1275
    const bars = makeBars(period, { closes });
    const result = compute50DayMovingAverage(bars);
    expect(result).toEqual({ status: "AVAILABLE", value: 25.5, asOf: dateAt(period - 1) });
  });

  it("insufficient history (49 bars) → MISSING", () => {
    const bars = makeBars(period - 1);
    expect(compute50DayMovingAverage(bars)).toEqual(MISSING);
  });

  it("a single MISSING close within the most recent 50 bars → MISSING (no skipping, no partial average)", () => {
    const bars = makeBars(period, { closes: Array.from({ length: period }, (_, i) => i + 1) });
    bars[25] = { ...bars[25], close: MISSING };
    expect(compute50DayMovingAverage(bars)).toEqual(MISSING);
  });

  it("having MORE than 50 bars only uses the most recent 50 — an older MISSING close outside the window doesn't matter", () => {
    const closes = Array.from({ length: period + 10 }, (_, i) => i + 1);
    const bars = makeBars(period + 10, { closes });
    bars[0] = { ...bars[0], close: MISSING }; // outside the trailing-50 window
    const result = compute50DayMovingAverage(bars);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.asOf).toBe(dateAt(period + 10 - 1));
    }
  });

  it("deterministic: repeated calls on the same input produce the identical result", () => {
    const bars = makeBars(period, { closes: Array.from({ length: period }, (_, i) => i + 1) });
    expect(compute50DayMovingAverage(bars)).toEqual(compute50DayMovingAverage(bars));
  });

  it("generic non-Unity fixture: a synthetic instrument at a completely different price scale", () => {
    const closes = Array.from({ length: period }, () => 1042.75); // flat, non-Unity price
    const bars = makeBars(period, { closes });
    expect(compute50DayMovingAverage(bars)).toEqual({
      status: "AVAILABLE",
      value: 1042.75,
      asOf: dateAt(period - 1),
    });
  });
});

describe("compute200DayMovingAverage", () => {
  const period = RULESET.technical.dma200Period; // 200

  it("exact lookback boundary: exactly 200 bars → AVAILABLE, correct average", () => {
    const closes = Array.from({ length: period }, (_, i) => i + 1); // 1..200, sum 20100
    const bars = makeBars(period, { closes });
    expect(compute200DayMovingAverage(bars)).toEqual({
      status: "AVAILABLE",
      value: 100.5,
      asOf: dateAt(period - 1),
    });
  });

  it("insufficient history (199 bars) → MISSING", () => {
    const bars = makeBars(period - 1);
    expect(compute200DayMovingAverage(bars)).toEqual(MISSING);
  });

  it("a MISSING close anywhere within the 200-bar window → MISSING", () => {
    const bars = makeBars(period);
    bars[199] = { ...bars[199], close: MISSING }; // the most recent bar itself
    expect(compute200DayMovingAverage(bars)).toEqual(MISSING);
  });
});

describe("computeRelativeVolume", () => {
  const window = RULESET.technical.relativeVolumeWindow; // 20

  it("exact lookback boundary: window+1 bars (20 baseline + 1 current) → AVAILABLE, correct ratio, asOf = current bar's date", () => {
    const volumes = [...Array(window).fill(100), 250]; // baseline avg 100, current 250
    const bars = makeBars(window + 1, { volumes });
    const result = computeRelativeVolume(bars);
    expect(result).toEqual({ status: "AVAILABLE", value: 2.5, asOf: dateAt(window) });
  });

  it("insufficient history (exactly window bars, no distinct current bar) → MISSING", () => {
    const bars = makeBars(window);
    expect(computeRelativeVolume(bars)).toEqual(MISSING);
  });

  it("MISSING current-bar volume → MISSING", () => {
    const volumes = [...Array(window).fill(100), 250];
    const bars = makeBars(window + 1, { volumes });
    bars[window] = { ...bars[window], volume: MISSING };
    expect(computeRelativeVolume(bars)).toEqual(MISSING);
  });

  it("a MISSING volume anywhere in the baseline window → MISSING", () => {
    const volumes = [...Array(window).fill(100), 250];
    const bars = makeBars(window + 1, { volumes });
    bars[5] = { ...bars[5], volume: MISSING };
    expect(computeRelativeVolume(bars)).toEqual(MISSING);
  });

  it("a zero baseline average → MISSING, not Infinity", () => {
    const volumes = [...Array(window).fill(0), 250];
    const bars = makeBars(window + 1, { volumes });
    expect(computeRelativeVolume(bars)).toEqual(MISSING);
  });

  it("deterministic: repeated calls on the same input produce the identical result", () => {
    const volumes = [...Array(window).fill(100), 250];
    const bars = makeBars(window + 1, { volumes });
    expect(computeRelativeVolume(bars)).toEqual(computeRelativeVolume(bars));
  });

  it("generic non-Unity fixture: a synthetic instrument with a distinct volume scale", () => {
    const volumes = [...Array(window).fill(50_000), 40_000]; // below-average volume day
    const bars = makeBars(window + 1, { volumes });
    const result = computeRelativeVolume(bars);
    expect(result).toEqual({ status: "AVAILABLE", value: 0.8, asOf: dateAt(window) });
  });
});

describe("computeRsi — Wilder's original smoothing", () => {
  const period = RULESET.technical.rsiPeriod; // 14

  it("exact lookback boundary: exactly period+1 (15) closes, seed-only (no subsequent smoothing) → AVAILABLE", () => {
    // 15 closes, strictly increasing by 1 → 14 gain-deltas of 1, 0 losses.
    const closes = Array.from({ length: period + 1 }, (_, i) => 100 + i);
    const bars = makeBars(period + 1, { closes });
    const result = computeRsi(bars);
    // avgGain = 1, avgLoss = 0 → avgLoss=0 & avgGain>0 edge case → RSI = 100
    expect(result).toEqual({ status: "AVAILABLE", value: 100, asOf: dateAt(period) });
  });

  it("insufficient history (period closes, only 13 deltas) → MISSING", () => {
    const bars = makeBars(period);
    expect(computeRsi(bars)).toEqual(MISSING);
  });

  it("a MISSING close anywhere in the array → MISSING (RSI's calculation window is the whole array, not just a trailing slice)", () => {
    const closes = Array.from({ length: period + 5 }, (_, i) => 100 + i);
    const bars = makeBars(period + 5, { closes });
    bars[0] = { ...bars[0], close: MISSING }; // outside DMA's trailing window, but RSI still sees it
    expect(computeRsi(bars)).toEqual(MISSING);
  });

  it("edge case: avgLoss = 0, avgGain > 0 → RSI = 100 (strictly increasing prices)", () => {
    const closes = Array.from({ length: period + 1 }, (_, i) => 1000 + i * 2); // generic non-Unity price scale
    const bars = makeBars(period + 1, { closes });
    expect(computeRsi(bars)).toEqual({ status: "AVAILABLE", value: 100, asOf: dateAt(period) });
  });

  it("edge case: avgGain = 0, avgLoss > 0 → RSI = 0 (strictly decreasing prices)", () => {
    const closes = Array.from({ length: period + 1 }, (_, i) => 114 - i);
    const bars = makeBars(period + 1, { closes });
    expect(computeRsi(bars)).toEqual({ status: "AVAILABLE", value: 0, asOf: dateAt(period) });
  });

  it("edge case: avgGain = 0, avgLoss = 0 → MISSING (flat price, no movement at all)", () => {
    const closes = Array.from({ length: period + 1 }, () => 100);
    const bars = makeBars(period + 1, { closes });
    expect(computeRsi(bars)).toEqual(MISSING);
  });

  it("recursive smoothing beyond the seed: one subsequent Wilder step matches an independently re-derived expected value", () => {
    // 14 unit gains (seed), then one loss of 4 on the 15th delta — one
    // subsequent smoothing step beyond the seed average.
    const closes = [
      ...Array.from({ length: period + 1 }, (_, i) => 100 + i), // 100..114, 14 deltas of +1
      110, // delta = 114 -> 110 = -4 (a loss)
    ];
    const bars = makeBars(period + 2, { closes });

    // Independent oracle: re-derive the expected value from the approved
    // algorithm description itself, not from the implementation.
    const seedAvgGain = 1; // mean of 14 gains of 1 each
    const seedAvgLoss = 0;
    const nextGain = 0; // the 15th delta (-4) is a loss, not a gain
    const nextLoss = 4;
    const avgGain = (seedAvgGain * (period - 1) + nextGain) / period;
    const avgLoss = (seedAvgLoss * (period - 1) + nextLoss) / period;
    const rs = avgGain / avgLoss;
    const expectedRsi = 100 - 100 / (1 + rs);

    const result = computeRsi(bars);
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") {
      expect(result.value).toBeCloseTo(expectedRsi, 10);
      expect(result.asOf).toBe(dateAt(period + 1));
    }
  });

  it("deterministic: repeated calls on the same input produce the identical result", () => {
    const closes = Array.from({ length: period + 3 }, (_, i) => 100 + Math.sin(i) * 2);
    const bars = makeBars(period + 3, { closes });
    expect(computeRsi(bars)).toEqual(computeRsi(bars));
  });
});

describe("deriveTechnicalSignals — composes all four independently", () => {
  it("returns AVAILABLE for every indicator when enough history is provided for all of them", () => {
    const period = Math.max(
      RULESET.technical.dma200Period,
      RULESET.technical.rsiPeriod + 1,
      RULESET.technical.relativeVolumeWindow + 1
    );
    const closes = Array.from({ length: period }, (_, i) => 1000 + i * 0.5);
    const volumes = Array.from({ length: period }, (_, i) => 10_000 + (i % 5) * 100);
    const bars = makeBars(period, { closes, volumes });

    const result = deriveTechnicalSignals(bars);
    expect(result.dma50.status).toBe("AVAILABLE");
    expect(result.dma200.status).toBe("AVAILABLE");
    expect(result.rsi.status).toBe("AVAILABLE");
    expect(result.relativeVolume.status).toBe("AVAILABLE");
  });

  it("each indicator is independently MISSING when its own requirement isn't met — none is faked or skipped to compensate for another", () => {
    // Only 30 bars: enough for relative volume (needs 21) but not DMA50
    // (needs 50), DMA200 (needs 200), or RSI (needs 15 — this alone WOULD be
    // enough for RSI, so give it a MISSING close instead to keep RSI MISSING
    // too and prove every field is independently evaluated).
    const bars = makeBars(30);
    bars[0] = { ...bars[0], close: MISSING };

    const result = deriveTechnicalSignals(bars);
    expect(result.dma50).toEqual(MISSING);
    expect(result.dma200).toEqual(MISSING);
    expect(result.rsi).toEqual(MISSING);
    expect(result.relativeVolume.status).toBe("AVAILABLE"); // unaffected — doesn't read close at all
  });
});
