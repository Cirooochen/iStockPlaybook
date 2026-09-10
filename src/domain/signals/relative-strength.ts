// Relative Strength — spec §14 (Technical/Momentum Engine),
// docs/phase-c5-trend-relative-strength-data-contract.md §4. Phase C.5
// resolution (2026-09-10).
//
// Approved v0.1 convention: return differential over a single configured
// aligned window.
//
//   stockReturn      = (stockEnd / stockStart) - 1
//   benchmarkReturn  = (benchmarkEnd / benchmarkStart) - 1
//   relativeStrength = stockReturn - benchmarkReturn
//
// positive = stock outperformed the benchmark; zero = matched it;
// negative = underperformed it. This is a CONTINUOUS, raw signal only —
// how `relativeStrength` maps into a 0-100 momentum sub-score is
// deliberately NOT decided here.
//
// ── Provider/API concerns stay outside this layer ────────────────────
// This function takes already-fetched `OhlcvBar[]` series for both the
// stock and the benchmark, plus the benchmark's `instrumentId` (already
// resolved from `Strategy.benchmarkInstrumentId` by the caller) — it
// does not know or care how either series was obtained, and contains no
// hardcoded benchmark symbol anywhere.
//
// ── NOT_APPLICABLE vs. MISSING ────────────────────────────────────────
// NOT_APPLICABLE means no benchmark is configured for this strategy at
// all (`benchmarkInstrumentId` is undefined) — a structural "this
// strategy doesn't use relative strength," never a data problem. MISSING
// means a benchmark IS configured but this window's data didn't align or
// wasn't available — reusing the target-position.ts StrategyAlignment
// pattern rather than inventing a new one. The MISSING branch carries no
// partial payload, matching MomentumComponentResult's MISSING shape
// (Phase C.4).
//
// ── Exact date-string alignment, not index-based ─────────────────────
// A stock and its benchmark may trade on different calendars (this app
// already tracks a NYSE-listed stock against a EUR-based portfolio —
// cross-market data is the normal case here). For the configured window
// of `W` trading days ending at the stock's most recent bar date D_end:
//   1. Stock close at D_end, and the benchmark close at the SAME date
//      D_end (exact string match on OhlcvBar.date) — if the benchmark has
//      no bar dated D_end, the result is MISSING.
//   2. D_start = the stock's own bar date W bars back in the stock's
//      series. Benchmark close at that SAME date D_start — if absent,
//      MISSING.
// No nearest-date fallback, no interpolation across a gap — the same "no
// invented data" rule already governing DMA/RSI/relative volume.
//
// ── asOf propagation ──────────────────────────────────────────────────
// D_end (the window's end date) — for freshness evaluation via the
// existing evaluateFreshness, not stored freshness.
import type { OhlcvBar, RelativeStrengthData } from "@/types/market-data";
import { RULESET } from "@/config/ruleset-v0.1";

function closeOnDate(ohlcv: OhlcvBar[], date: string): number | null {
  const bar = ohlcv.find((b) => b.date === date);
  if (!bar || bar.close.status === "MISSING") return null;
  return bar.close.value;
}

export function computeRelativeStrength(
  stockOhlcv: OhlcvBar[],
  benchmarkInstrumentId: string | undefined,
  benchmarkOhlcv: OhlcvBar[]
): RelativeStrengthData {
  if (benchmarkInstrumentId === undefined) {
    return { status: "NOT_APPLICABLE" };
  }

  const window = RULESET.technical.relativeStrength.comparisonWindowTradingDays;
  if (stockOhlcv.length < window + 1) {
    return { status: "MISSING" };
  }

  const endBar = stockOhlcv[stockOhlcv.length - 1];
  const startBar = stockOhlcv[stockOhlcv.length - 1 - window];
  const dEnd = endBar.date;
  const dStart = startBar.date;

  const stockEnd = closeOnDate(stockOhlcv, dEnd);
  const stockStart = closeOnDate(stockOhlcv, dStart);
  const benchmarkEnd = closeOnDate(benchmarkOhlcv, dEnd);
  const benchmarkStart = closeOnDate(benchmarkOhlcv, dStart);

  if (stockEnd === null || stockStart === null || benchmarkEnd === null || benchmarkStart === null) {
    return { status: "MISSING" };
  }
  if (stockStart === 0 || benchmarkStart === 0) {
    return { status: "MISSING" };
  }

  const stockReturn = stockEnd / stockStart - 1;
  const benchmarkReturn = benchmarkEnd / benchmarkStart - 1;

  return {
    status: "AVAILABLE",
    benchmarkInstrumentId,
    windowTradingDays: window,
    asOf: dEnd,
    stockReturn,
    benchmarkReturn,
    relativeStrength: stockReturn - benchmarkReturn,
  };
}
