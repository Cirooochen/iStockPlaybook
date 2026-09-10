// Derived technical signals — spec §14 (Technical/Momentum Engine),
// docs/phase-c0-market-data-contract.md §5. Phase C.3.
//
// Computed internally from RawMarketData.ohlcv, never accepted as
// provider-supplied source of truth (per §5) — so every stock's indicators
// come from the same formula regardless of provider.
//
// ── Input contract (must hold for every function in this file) ──────────
// `ohlcv` is assumed sorted ASCENDING by date (oldest first); the LAST
// element is the most recent bar. This file does not re-validate bar
// structure or date parsing — see src/domain/market-data/validation.ts for
// the structural checks a caller should already have applied upstream.
//
// ── Required-input semantics, defined before any formula below ──────────
// 1. Which OHLCV field each indicator consumes:
//    - DMA50/DMA200 consume `close`.
//    - Relative volume consumes `volume`.
//    - RSI consumes `close` (day-over-day deltas).
// 2. Minimum history/lookback required:
//    - DMA(N) requires the most recent N bars (RULESET.technical.dma50Period
//      / dma200Period).
//    - Relative volume requires the most recent bar PLUS
//      RULESET.technical.relativeVolumeWindow bars immediately preceding it
//      (window + 1 bars total) — the current bar is deliberately excluded
//      from its own baseline average (see computeRelativeVolume).
//    - RSI requires at least RULESET.technical.rsiPeriod + 1 bars (enough
//      closes to form `rsiPeriod` day-over-day deltas for the seed average).
//      UNLIKE DMA/relative volume, RSI does not only look at a fixed
//      trailing window when more history is available — see point 4.
// 3. What happens when history is insufficient (fewer bars exist than the
//    required lookback): the result is MISSING. No partial-window average,
//    no shrinking the divisor — a shorter window is not the same
//    measurement as the configured one.
// 4. What happens when a required bar/field is itself MISSING: the whole
//    result is MISSING. No skipping past a MISSING bar to reach further
//    back, no backfilling/interpolating. For DMA/relative volume, "required"
//    means within their fixed trailing window — an older MISSING bar
//    outside that window doesn't matter. For RSI, the calculation window is
//    the ENTIRE `ohlcv` array passed in, not just the most recent
//    `rsiPeriod + 1` bars: Wilder's smoothing is recursive and
//    path-dependent on the whole history it's given (seed once on the
//    earliest available deltas, then smooth forward through every
//    subsequent delta) — so a MISSING close ANYWHERE in the array fails
//    the whole computation, and a caller controls how much history RSI
//    considers by how much of `ohlcv` it passes in, not via a separate
//    windowing parameter.
// 5. How timestamps/asOf propagate into derived DataField outputs: the
//    derived field's `asOf` is the `date` of the most recent bar that
//    contributed to the computation (the last bar in the array/window) —
//    the indicator is only as current as its newest input.
// 6. Whether stale raw input produces a stale derived output, or the
//    derived field stays merely AVAILABLE with freshness evaluated
//    separately: the latter. Exactly like every other DataField in this
//    codebase (see docs/phase-c0-market-data-contract.md's C.0 correction
//    and src/domain/market-data/freshness.ts), freshness is NEVER stored —
//    a derived DataField only carries `value` + `asOf`. A caller who needs
//    to know whether a derived indicator is stale calls
//    `evaluateFreshness(derivedField, evaluationTime, policy)` on it
//    directly, the same way they would on a raw field. Staleness of the
//    underlying raw bars does not get baked into a special derived status —
//    it only affects what `evaluateFreshness` returns when asked, against
//    whatever policy is relevant to a derived indicator's own staleness
//    window (not decided in this file).
import type { DataField, DerivedTechnicalSignals, OhlcvBar } from "@/types/market-data";
import { RULESET } from "@/config/ruleset-v0.1";

interface AvailableWindow {
  values: number[];
  asOf: string; // date of the most recent bar in the window
}

// Shared plumbing for both DMA50 and DMA200 (and reusable by any other
// close-based, fixed-window indicator later): the last `period` bars, if
// and only if every one of them has an AVAILABLE close.
function recentAvailableCloses(ohlcv: OhlcvBar[], period: number): AvailableWindow | null {
  if (ohlcv.length < period) return null;
  const window = ohlcv.slice(-period);
  const values: number[] = [];
  for (const bar of window) {
    if (bar.close.status === "MISSING") return null;
    values.push(bar.close.value);
  }
  return { values, asOf: window[window.length - 1].date };
}

// Exported for reuse by src/domain/signals/trend.ts, which calls this at
// two different array cutoffs to compute a DMA200 slope (Phase C.5) — not
// otherwise part of this file's own public surface.
export function simpleMovingAverage(ohlcv: OhlcvBar[], period: number): DataField<number> {
  const window = recentAvailableCloses(ohlcv, period);
  if (!window) return { status: "MISSING" };
  const sum = window.values.reduce((total, close) => total + close, 0);
  return { status: "AVAILABLE", value: sum / period, asOf: window.asOf };
}

// v0.1: standard simple moving average of `close`, per instruction — not
// Wilder-smoothed or exponential. Window length is versioned config, not a
// magic number.
export function compute50DayMovingAverage(ohlcv: OhlcvBar[]): DataField<number> {
  return simpleMovingAverage(ohlcv, RULESET.technical.dma50Period);
}

export function compute200DayMovingAverage(ohlcv: OhlcvBar[]): DataField<number> {
  return simpleMovingAverage(ohlcv, RULESET.technical.dma200Period);
}

// ── Relative volume: one explicit, provider-independent formulation ──────
// No single universally-cited "the" standard exists for relative volume the
// way Wilder's RSI is standard for RSI (platforms vary the baseline window
// length and, for intraday feeds, compare against the same time-of-day —
// not applicable here since this contract models daily bars only). This
// contract defines its own formula rather than silently assuming one:
//
//   relativeVolume = mostRecentBar.volume
//                     ────────────────────────────────────────────────
//                     average(volume over the RULESET.technical.
//                     relativeVolumeWindow daily bars immediately
//                     preceding the most recent bar)
//
// i.e. today's volume divided by the trailing N-day average volume that
// precedes today, where N = RULESET.technical.relativeVolumeWindow (a
// versioned config value, not a magic number — see §32/RULESET pattern).
// The current/most-recent bar is deliberately EXCLUDED from its own
// baseline average — including it would mechanically pull the ratio toward
// 1 and blunt the signal. Every bar in the baseline window (and the current
// bar) must have an AVAILABLE volume, per point 4 above. A baseline average
// of exactly 0 (every prior bar had zero volume) has no meaningful ratio
// and is treated as MISSING rather than +Infinity.
export function computeRelativeVolume(ohlcv: OhlcvBar[]): DataField<number> {
  const window = RULESET.technical.relativeVolumeWindow;
  if (ohlcv.length < window + 1) return { status: "MISSING" };

  const currentBar = ohlcv[ohlcv.length - 1];
  if (currentBar.volume.status === "MISSING") return { status: "MISSING" };

  const baselineBars = ohlcv.slice(-(window + 1), -1);
  const baselineVolumes: number[] = [];
  for (const bar of baselineBars) {
    if (bar.volume.status === "MISSING") return { status: "MISSING" };
    baselineVolumes.push(bar.volume.value);
  }

  const baselineAverage = baselineVolumes.reduce((total, v) => total + v, 0) / window;
  if (baselineAverage === 0) return { status: "MISSING" };

  return {
    status: "AVAILABLE",
    value: currentBar.volume.value / baselineAverage,
    asOf: currentBar.date,
  };
}

// ── RSI: Wilder's original (1978) smoothing — approved 2026-09-09 ────────
// Resolved product/model decision: of the three legitimate, commonly-used
// RSI conventions (Wilder's original smoothing / Cutler's plain-SMA RSI /
// EMA-based RSI — each produces different numeric output for identical
// input), Wilder's original is the approved v0.1 convention. Not chosen
// silently — flagged for review, decided explicitly, documented here.
//
// Algorithm (period = RULESET.technical.rsiPeriod = 14):
//   1. Compute day-over-day close deltas across the ENTIRE `ohlcv` array
//      passed in (delta[i] = close[i] - close[i-1]).
//   2. Seed: avgGain/avgLoss = simple average of gains/losses over the
//      FIRST `period` deltas.
//   3. Smooth forward through every remaining delta, recursively:
//        avg = ((previousAvg * (period - 1)) + currentValue) / period
//      (currentValue is that delta's gain, or its loss — whichever this
//      average tracks; the other side's currentValue is 0 for that delta).
//   4. RS = avgGain / avgLoss (after the final smoothing step);
//      RSI = 100 - 100 / (1 + RS).
// Edge cases (approved, in this exact priority order):
//   - avgLoss = 0 and avgGain > 0 → RSI = 100 (no losses at all — maximally
//     overbought by this formula, not a divide-by-zero bug).
//   - avgGain = 0 and avgLoss > 0 → RSI = 0.
//   - avgGain = 0 and avgLoss = 0 → MISSING (the price never moved across
//     the entire window — no signal, not a spurious neutral 50).
// Per point 4 above, this uses the WHOLE `ohlcv` array, not a fixed trailing
// window: a caller controls how much history feeds the recursive smoothing
// by how much of `ohlcv` they pass in.
export function computeRsi(ohlcv: OhlcvBar[]): DataField<number> {
  const period = RULESET.technical.rsiPeriod;
  if (ohlcv.length < period + 1) return { status: "MISSING" };

  const closes: number[] = [];
  for (const bar of ohlcv) {
    if (bar.close.status === "MISSING") return { status: "MISSING" };
    closes.push(bar.close.value);
  }

  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }

  const seedDeltas = deltas.slice(0, period);
  let avgGain =
    seedDeltas.reduce((total, delta) => total + (delta > 0 ? delta : 0), 0) / period;
  let avgLoss =
    seedDeltas.reduce((total, delta) => total + (delta < 0 ? -delta : 0), 0) / period;

  for (let i = period; i < deltas.length; i++) {
    const delta = deltas[i];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const asOf = ohlcv[ohlcv.length - 1].date;

  if (avgLoss === 0 && avgGain > 0) return { status: "AVAILABLE", value: 100, asOf };
  if (avgGain === 0 && avgLoss > 0) return { status: "AVAILABLE", value: 0, asOf };
  if (avgGain === 0 && avgLoss === 0) return { status: "MISSING" };

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return { status: "AVAILABLE", value: rsi, asOf };
}

// Composes all four derived technical signals — spec §5's
// DerivedTechnicalSignals shape. Each indicator is computed and reported
// fully independently; none is skipped, faked, or defaulted if another is
// MISSING.
export function deriveTechnicalSignals(ohlcv: OhlcvBar[]): DerivedTechnicalSignals {
  return {
    dma50: compute50DayMovingAverage(ohlcv),
    dma200: compute200DayMovingAverage(ohlcv),
    rsi: computeRsi(ohlcv),
    relativeVolume: computeRelativeVolume(ohlcv),
  };
}
