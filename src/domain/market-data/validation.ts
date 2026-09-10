// Structural validation helpers for the raw market-data contract — spec:
// docs/phase-c0-market-data-contract.md §4/§6. Purely structural: these
// check that a value is internally well-formed, not that data is complete
// or fresh (MISSING is a valid DataField state — see market-data.ts — so
// every AVAILABLE-only check here passes trivially when the field is
// MISSING). No provider-specific symbol/ticker rules.
import type { DataField } from "@/types/market-data";

export function isValidInstrumentId(instrumentId: string): boolean {
  return instrumentId.trim().length > 0;
}

// Structural shape only (ISO 4217-style: three uppercase letters) — not a
// check against a real, provider-specific list of known currency codes.
export function isValidCurrency(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

export function isValidTimestamp(timestamp: string): boolean {
  return !Number.isNaN(Date.parse(timestamp));
}

// A trading date (not a full timestamp) — still just needs to parse to a
// real calendar date.
export function isValidOhlcvDate(date: string): boolean {
  return !Number.isNaN(Date.parse(date));
}

export function isValidFxPair(from: string, to: string): boolean {
  return isValidCurrency(from) && isValidCurrency(to) && from !== to;
}

export function isFiniteAvailableField(field: DataField<number>): boolean {
  return field.status === "MISSING" || Number.isFinite(field.value);
}

// For fields where zero/negative is not a semantically valid measurement —
// price and FX rate.
export function isPositiveAvailableField(field: DataField<number>): boolean {
  return field.status === "MISSING" || (Number.isFinite(field.value) && field.value > 0);
}

// For volume: zero is a legitimate reading (no shares traded), negative is not.
export function isNonNegativeAvailableField(field: DataField<number>): boolean {
  return field.status === "MISSING" || (Number.isFinite(field.value) && field.value >= 0);
}
