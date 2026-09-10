// Freshness evaluation — spec: docs/phase-c0-market-data-contract.md §3
// Pure and provider-independent: freshness is derived on demand from a
// DataField, an explicit evaluationTime, and a per-data-type policy — never
// stored on the field, never read from an ambient clock (no Date.now()).
import type { DataField } from "@/types/market-data";

export interface FreshnessPolicy {
  maxAgeMs: number;
}

export type FreshnessResult<T> =
  | { status: "MISSING" }
  | { status: "FRESH"; value: T; asOf: string; ageMs: number }
  | { status: "STALE"; value: T; asOf: string; ageMs: number };

export function evaluateFreshness<T>(
  field: DataField<T>,
  evaluationTime: string,
  policy: FreshnessPolicy
): FreshnessResult<T> {
  if (field.status === "MISSING") {
    return { status: "MISSING" };
  }

  const evaluationTimeMs = Date.parse(evaluationTime);
  if (Number.isNaN(evaluationTimeMs)) {
    throw new Error(`evaluateFreshness: invalid evaluationTime "${evaluationTime}"`);
  }

  const asOfMs = Date.parse(field.asOf);
  if (Number.isNaN(asOfMs)) {
    throw new Error(`evaluateFreshness: invalid asOf "${field.asOf}" on an AVAILABLE DataField`);
  }

  const ageMs = evaluationTimeMs - asOfMs;
  return ageMs <= policy.maxAgeMs
    ? { status: "FRESH", value: field.value, asOf: field.asOf, ageMs }
    : { status: "STALE", value: field.value, asOf: field.asOf, ageMs };
}
