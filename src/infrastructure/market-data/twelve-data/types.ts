// Twelve Data-specific response DTOs — spec:
// docs/validation/c7-twelve-data-contract-check.md. Provider-specific
// shapes live ONLY inside this src/infrastructure/market-data/twelve-data/
// boundary — nothing here is exported outside this directory's own
// mappers, and no field from these types is ever copied verbatim into
// src/types/market-data.ts's contract types (mappers.ts is the only place
// that reads these).
//
// Only the fields this adapter actually consumes are declared — extra
// fields Twelve Data returns (e.g. /quote's `open`/`high`/`low`/
// `previous_close`/`change`/`percent_change`/`fifty_two_week`, or
// /time_series's `meta.exchange`/`.mic_code`/`.type`) are intentionally
// omitted; they exist on the real payloads but this adapter never reads
// or forwards them ("no provider-specific fields should leak past the
// adapter").
//
// Every field is optional/untyped-safe on purpose: these describe what a
// well-formed response SHOULD contain, not a guarantee — mappers.ts
// treats every field as potentially absent or malformed and never trusts
// this shape blindly (see parsing.ts).

// GET /quote (schema: GetQuote_200_response). Numeric fields are STRINGS.
export interface TwelveDataQuoteResponse {
  currency?: string;
  datetime?: string; // e.g. "2026-09-04" (daily) or "2026-09-04 15:59:00"
  timestamp?: number; // Unix seconds — fallback when `datetime` is absent
  close?: string;
}

// GET /time_series, interval=1day (schema: TimeSeriesItem). Numeric
// fields are STRINGS. `volume` is NOT in Twelve Data's own `required`
// list — confirmed absent-capable for some instrument types (C.7 §2/§3).
export interface TwelveDataTimeSeriesBar {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

// GET /time_series (schema: GetTimeSeries_200_response).
export interface TwelveDataTimeSeriesResponse {
  meta?: {
    currency?: string;
  };
  values?: TwelveDataTimeSeriesBar[];
  status?: string; // "ok" on success — error responses use a different shape entirely, see errors.ts
}

// GET /exchange_rate (schema: GetExchangeRate_200_response). `rate` is a
// real JSON NUMBER here — the one exception to "everything is a string"
// (C.7 §4). `symbol` is "BASE/QUOTE", e.g. "USD/EUR" — query this
// direction, not "EUR/USD", to get the USD->EUR multiplier directly (C.7
// §4). No timestamp string field exists on this endpoint — only Unix
// seconds.
export interface TwelveDataExchangeRateResponse {
  symbol?: string;
  rate?: number;
  timestamp?: number;
}
