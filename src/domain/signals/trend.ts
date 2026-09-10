// Primary Trend — spec §14 (Technical/Momentum Engine),
// docs/phase-c5-trend-relative-strength-data-contract.md §3. Phase C.5
// resolution (2026-09-10).
//
// Approved v0.1 convention: percentage change of DMA200 over a
// configurable lookback.
//
//   trendSlope = (DMA200_current / DMA200_lookbackAgo) - 1
//
// This produces a CONTINUOUS, raw trend signal only. How it maps into a
// 0-100 momentum sub-score is deliberately NOT decided here — that
// normalization step belongs with a future momentum-score.ts change, not
// this file (same boundary momentum.ts's DMA/RSI/relative-volume compute
// functions already draw against their own normalization).
//
// ── Input contract ────────────────────────────────────────────────────
// `ohlcv` is assumed sorted ASCENDING by date (oldest first); the LAST
// element is the most recent bar — same convention as momentum.ts.
//
// ── Data source ───────────────────────────────────────────────────────
// No new raw type is needed: DMA200_current and DMA200_lookbackAgo are
// both computed via momentum.ts's existing simpleMovingAverage, run
// against two different suffixes of the SAME `ohlcv` array
// (`ohlcv` itself for "current", `ohlcv.slice(0, ohlcv.length - lookback)`
// for "lookback days ago") — no separate historical-DMA raw plumbing.
//
// ── MISSING semantics ─────────────────────────────────────────────────
// `dma200Slope` is MISSING whenever EITHER the current or the
// lookback-ago 200-bar window is itself MISSING (insufficient history —
// including the case where the whole series is shorter than
// dma200Period + lookback — or a MISSING close anywhere within either
// window) — reusing simpleMovingAverage's existing rule unchanged, just
// applied twice. Also MISSING if DMA200_lookbackAgo is exactly 0 (no
// meaningful ratio, same "no invented Infinity" rule as
// computeRelativeVolume's zero-baseline case).
//
// ── asOf propagation ──────────────────────────────────────────────────
// The most recent bar's date — same convention as every other derived
// field in this contract.
import type { DataField, DerivedTrendSignal, OhlcvBar } from "@/types/market-data";
import { RULESET } from "@/config/ruleset-v0.1";
import { simpleMovingAverage } from "@/domain/signals/momentum";

export function computeDma200Slope(ohlcv: OhlcvBar[]): DataField<number> {
  const period = RULESET.technical.dma200Period;
  const lookback = RULESET.technical.trend.dma200SlopeLookbackDays;

  const current = simpleMovingAverage(ohlcv, period);
  const past = simpleMovingAverage(ohlcv.slice(0, Math.max(0, ohlcv.length - lookback)), period);

  if (current.status === "MISSING" || past.status === "MISSING") {
    return { status: "MISSING" };
  }
  if (past.value === 0) {
    return { status: "MISSING" };
  }

  const asOf = ohlcv[ohlcv.length - 1].date;
  return { status: "AVAILABLE", value: current.value / past.value - 1, asOf };
}

export function deriveTrendSignal(ohlcv: OhlcvBar[]): DerivedTrendSignal {
  return { dma200Slope: computeDma200Slope(ohlcv) };
}
