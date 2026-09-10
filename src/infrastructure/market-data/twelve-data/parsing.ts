// Twelve Data field parsing/normalization — spec:
// docs/validation/c7-twelve-data-contract-check.md. Every function here
// is defensive: it treats the DTOs in types.ts as "what a well-formed
// response should look like," never as a guarantee, and never throws —
// invalid input always resolves to `null`/`MISSING`, never a fabricated
// value (§ "invalid / null numeric fields -> DataField.MISSING").
import type { DataField } from "@/types/market-data";
import { isNonNegativeAvailableField, isPositiveAvailableField } from "@/domain/market-data/validation";

// Twelve Data returns OHLCV/quote numeric fields as STRINGS
// (e.g. "148.85001") but /exchange_rate's `rate` as a real number — this
// accepts either. Strict: "148.85abc" or "" parse to `null`, never a
// partial/truncated number (Number(), not parseFloat()).
export function parseTwelveDataNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Full ISO-8601 (date + time) — for point-in-time quote/FX readings.
// Twelve Data gives three different shapes across endpoints (C.7's
// "timestamps/date format" finding): a date-only or space-separated
// datetime STRING, or a Unix-seconds NUMBER. All three normalize here.
export function normalizeIsoTimestamp(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const date = new Date(raw * 1000); // Twelve Data timestamps are Unix seconds
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // "YYYY-MM-DD HH:MM:SS" parses unreliably across JS engines — normalize
  // the space to "T" first. A bare "YYYY-MM-DD" is already ISO-parseable.
  const isoCandidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(" ", "T")
    : trimmed;
  const ms = Date.parse(isoCandidate);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// Plain calendar date ("YYYY-MM-DD") — for OhlcvBar.date specifically,
// matching its own contract comment ("trading date, not a full
// timestamp") rather than the full-ISO convention above. Tolerates a
// space-separated datetime by taking only the date portion.
export function normalizeDateOnly(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const datePart = trimmed.split(" ")[0];
  const ms = Date.parse(datePart);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

// Parses + validates a price/rate field: must be finite AND positive
// (reusing the existing src/domain/market-data/validation.ts rule, not
// a new one — "price / FX rate must remain positive according to
// existing validation rules"). A non-numeric, zero, or negative reading
// becomes MISSING, never a fabricated/clamped value.
export function toPositiveDataField(rawValue: unknown, asOf: string): DataField<number> {
  const parsed = parseTwelveDataNumber(rawValue);
  if (parsed === null) return { status: "MISSING" };
  const field: DataField<number> = { status: "AVAILABLE", value: parsed, asOf };
  return isPositiveAvailableField(field) ? field : { status: "MISSING" };
}

// Same as above but for volume: zero is a legitimate reading ("preserve
// valid zero where allowed"), only negative/non-numeric becomes MISSING.
export function toNonNegativeDataField(rawValue: unknown, asOf: string): DataField<number> {
  const parsed = parseTwelveDataNumber(rawValue);
  if (parsed === null) return { status: "MISSING" };
  const field: DataField<number> = { status: "AVAILABLE", value: parsed, asOf };
  return isNonNegativeAvailableField(field) ? field : { status: "MISSING" };
}
