// Twelve Data -> provider-independent market-data contract — spec:
// docs/validation/c7-twelve-data-contract-check.md (source of truth for
// every field mapping below) and docs/phase-c0-market-data-contract.md
// (the contract itself, unchanged).
//
// Pure functions only: every mapper here takes an already-fetched,
// already-parsed JSON payload (`unknown`) and returns our contract type.
// No network call is made or implied by this file — fetching (and the
// API key it would require) is explicitly out of scope for this
// checkpoint and, when implemented, belongs in a separate client module
// within this same src/infrastructure/market-data/twelve-data/ directory
// — never in src/domain/, which has never imported from
// src/infrastructure/ and never will (see the "Adapter boundary" note in
// this checkpoint's REVIEW SUMMARY).
//
// Deliberately NOT used: Twelve Data's own pre-computed indicator
// endpoints (/rsi, /sma, /rvol, and dozens more, confirmed present in
// its API). Per the standing C.0/C.3 architecture rule, derived
// indicators are computed internally from raw OHLCV
// (src/domain/signals/momentum.ts et al.) — this adapter only ever
// produces RawQuote/OhlcvBar[]/FxRate, never a provider-computed
// indicator value.
//
// Error handling: a whole-request provider failure (bad symbol, auth,
// rate limit — Twelve Data's `{code, message, status:"error"}` shape)
// throws TwelveDataApiError (errors.ts) rather than silently degrading to
// an all-MISSING contract value — see errors.ts's doc comment for why
// that's a deliberately different failure mode from a per-field MISSING.
// A field-level problem (null, malformed string, non-positive price)
// always becomes MISSING, never a thrown error and never a fabricated
// value.
//
// Ordering: mapTimeSeriesResponse never trusts the payload's order —
// Twelve Data defaults to newest-first, and even when a future caller
// requests `order=asc`, this mapper re-sorts ascending itself rather than
// assuming the request parameter was honored ("do not rely on Twelve
// Data's default newest-first ordering").
import type { FxRate, OhlcvBar, RawMarketData, RawQuote } from "@/types/market-data";
import { isValidCurrency, isValidFxPair } from "@/domain/market-data/validation";
import { throwIfTwelveDataError } from "./errors";
import { normalizeDateOnly, normalizeIsoTimestamp, toNonNegativeDataField, toPositiveDataField } from "./parsing";
import type { TwelveDataExchangeRateResponse, TwelveDataQuoteResponse, TwelveDataTimeSeriesResponse } from "./types";

export function mapQuoteResponse(payload: unknown): RawQuote {
  throwIfTwelveDataError(payload);
  const response = payload as TwelveDataQuoteResponse;

  const currency = typeof response.currency === "string" ? response.currency.trim() : "";
  const asOf = normalizeIsoTimestamp(response.datetime ?? response.timestamp ?? null);

  // A quote with no known, structurally valid currency isn't a usable
  // quote (docs/phase-c0-market-data-contract.md §4: "a quote with no
  // known currency is not a quote") — nor is one with no valid timestamp
  // to anchor freshness. Either failure forces price to MISSING.
  if (!isValidCurrency(currency) || asOf === null) {
    return { price: { status: "MISSING" }, currency };
  }
  return { price: toPositiveDataField(response.close, asOf), currency };
}

export function mapTimeSeriesResponse(payload: unknown): OhlcvBar[] {
  throwIfTwelveDataError(payload);
  const response = payload as TwelveDataTimeSeriesResponse;
  const values = Array.isArray(response.values) ? response.values : [];

  const bars: OhlcvBar[] = [];
  for (const raw of values) {
    const date = normalizeDateOnly(raw?.datetime);
    // A bar with no usable date can't be placed in the series at all —
    // OhlcvBar.date is a required plain string, not a DataField, so an
    // unparseable date drops the whole bar rather than inventing a
    // placeholder date.
    if (date === null) continue;
    bars.push({
      date,
      open: toPositiveDataField(raw.open, date),
      high: toPositiveDataField(raw.high, date),
      low: toPositiveDataField(raw.low, date),
      close: toPositiveDataField(raw.close, date),
      volume: toNonNegativeDataField(raw.volume, date),
    });
  }

  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}

export function mapExchangeRateResponse(payload: unknown): FxRate {
  throwIfTwelveDataError(payload);
  const response = payload as TwelveDataExchangeRateResponse;

  const [from = "", to = ""] = typeof response.symbol === "string" ? response.symbol.split("/") : [];
  const asOf = normalizeIsoTimestamp(response.timestamp ?? null);

  if (!isValidFxPair(from, to) || asOf === null) {
    return { from, to, rate: { status: "MISSING" } };
  }
  return { from, to, rate: toPositiveDataField(response.rate, asOf) };
}

export interface BuildRawMarketDataInput {
  instrumentId: string;
  quotePayload: unknown;
  timeSeriesPayload: unknown;
  fxPayload?: unknown; // omit entirely when no currency conversion is needed
  // When this fetch attempt happened — supplied by the caller, never read
  // from an ambient clock (same rule every pure function in this
  // codebase already follows, e.g. evaluateFreshness's evaluationTime).
  checkedAt: string;
}

// Composes the three mapped pieces into RawMarketData. Does not catch or
// downgrade a TwelveDataApiError thrown by any of the three mappers —
// propagates it to the caller unchanged. Deciding how to handle a
// partial failure across multiple calls (e.g. quote succeeds but the
// benchmark time_series fails) is portfolio-wide refresh orchestration,
// explicitly out of scope for this checkpoint.
export function buildRawMarketData(input: BuildRawMarketDataInput): RawMarketData {
  const quote = mapQuoteResponse(input.quotePayload);
  const ohlcv = mapTimeSeriesResponse(input.timeSeriesPayload);
  const fx = input.fxPayload !== undefined ? mapExchangeRateResponse(input.fxPayload) : undefined;

  return {
    instrumentId: input.instrumentId,
    quote,
    ohlcv,
    fx,
    checkedAt: input.checkedAt,
  };
}
