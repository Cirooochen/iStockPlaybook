// Ticker -> CIK resolution — Phase E.7B, design doc §1. Pure function:
// takes an already-fetched `company_tickers.json` payload and a ticker,
// returns the zero-padded 10-digit CIK string
// (RawFundamentalsData.instrumentId's canonical form, design doc §1) or
// `null` if the ticker isn't found — never throws on a not-found ticker,
// since "this ticker isn't in SEC's list" is a legitimate outcome, not a
// malformed-payload failure.
import type { SecEdgarCompanyTickersResponse } from "./types";

export function zeroPadCik(cik: number): string {
  return String(Math.trunc(cik)).padStart(10, "0");
}

export function resolveCikForTicker(payload: unknown, ticker: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const response = payload as SecEdgarCompanyTickersResponse;
  const target = ticker.trim().toUpperCase();
  if (target === "") return null;

  for (const entry of Object.values(response)) {
    if (
      entry !== undefined &&
      typeof entry.ticker === "string" &&
      entry.ticker.toUpperCase() === target &&
      typeof entry.cik_str === "number" &&
      Number.isFinite(entry.cik_str)
    ) {
      return zeroPadCik(entry.cik_str);
    }
  }
  return null;
}
