// Phase C.1 — evaluateFreshness. See
// docs/phase-c0-market-data-contract.md §2/§3 for the approved contract.
import { describe, expect, it } from "vitest";
import { evaluateFreshness, type FreshnessPolicy } from "@/domain/market-data/freshness";
import type { DataField } from "@/types/market-data";

const asOf = "2026-09-09T12:00:00.000Z";
const policy: FreshnessPolicy = { maxAgeMs: 60 * 60 * 1000 }; // 1 hour

describe("evaluateFreshness — AVAILABLE", () => {
  it("within maxAge → FRESH", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf };
    const evaluationTime = "2026-09-09T12:30:00.000Z"; // 30 min later
    expect(evaluateFreshness(field, evaluationTime, policy)).toEqual({
      status: "FRESH",
      value: 42,
      asOf,
      ageMs: 30 * 60 * 1000,
    });
  });

  it("exactly maxAge → FRESH (inclusive boundary)", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf };
    const evaluationTime = "2026-09-09T13:00:00.000Z"; // exactly 1 hour later
    expect(evaluateFreshness(field, evaluationTime, policy)).toEqual({
      status: "FRESH",
      value: 42,
      asOf,
      ageMs: policy.maxAgeMs,
    });
  });

  it("over maxAge → STALE", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf };
    const evaluationTime = "2026-09-09T13:00:00.001Z"; // 1ms past maxAge
    expect(evaluateFreshness(field, evaluationTime, policy)).toEqual({
      status: "STALE",
      value: 42,
      asOf,
      ageMs: policy.maxAgeMs + 1,
    });
  });
});

describe("evaluateFreshness — MISSING", () => {
  it("MISSING → MISSING, regardless of evaluationTime or policy", () => {
    const field: DataField<number> = { status: "MISSING" };
    expect(evaluateFreshness(field, "2026-09-09T12:30:00.000Z", policy)).toEqual({
      status: "MISSING",
    });
    // Distinct from STALE: no value/asOf/ageMs leak into the MISSING result.
    const result = evaluateFreshness(field, "2099-01-01T00:00:00.000Z", policy);
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("asOf");
    expect(result).not.toHaveProperty("ageMs");
  });
});

describe("evaluateFreshness — freshness is derived, not stored", () => {
  it("the same field produces different results for different evaluationTime values", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 100, asOf };
    const fresh = evaluateFreshness(field, "2026-09-09T12:10:00.000Z", policy);
    const stale = evaluateFreshness(field, "2026-09-10T12:10:00.000Z", policy);
    expect(fresh.status).toBe("FRESH");
    expect(stale.status).toBe("STALE");
    // Same field object, only evaluationTime changed — proves freshness is
    // computed on demand, not read off a stored tag on the field itself.
  });
});

describe("evaluateFreshness — generic beyond number", () => {
  it("works for a string value", () => {
    const field: DataField<string> = { status: "AVAILABLE", value: "USD", asOf };
    const result = evaluateFreshness(field, "2026-09-09T12:10:00.000Z", policy);
    expect(result).toEqual({ status: "FRESH", value: "USD", asOf, ageMs: 10 * 60 * 1000 });
  });

  it("works for an object value", () => {
    const value = { open: 10, close: 11 };
    const field: DataField<{ open: number; close: number }> = { status: "AVAILABLE", value, asOf };
    const result = evaluateFreshness(field, "2026-09-09T12:10:00.000Z", policy);
    expect(result).toEqual({ status: "FRESH", value, asOf, ageMs: 10 * 60 * 1000 });
  });
});

describe("evaluateFreshness — invalid timestamps are explicit, never silently NaN-driven", () => {
  it("throws on an invalid evaluationTime rather than returning a NaN-derived ageMs", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf };
    expect(() => evaluateFreshness(field, "not-a-date", policy)).toThrow(
      /invalid evaluationTime/
    );
  });

  it("throws on an invalid asOf rather than returning a NaN-derived ageMs", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf: "not-a-date" };
    expect(() => evaluateFreshness(field, "2026-09-09T12:30:00.000Z", policy)).toThrow(
      /invalid asOf/
    );
  });

  it("an invalid evaluationTime never reaches asOf math, even when asOf is also invalid", () => {
    // Confirms evaluationTime is validated first — a deterministic failure
    // order, not two independent NaN checks racing each other.
    const field: DataField<number> = { status: "AVAILABLE", value: 42, asOf: "also-not-a-date" };
    expect(() => evaluateFreshness(field, "not-a-date", policy)).toThrow(/invalid evaluationTime/);
  });

  it("MISSING never validates timestamps at all — an invalid evaluationTime does not throw", () => {
    const field: DataField<number> = { status: "MISSING" };
    expect(() => evaluateFreshness(field, "not-a-date", policy)).not.toThrow();
    expect(evaluateFreshness(field, "not-a-date", policy)).toEqual({ status: "MISSING" });
  });
});
