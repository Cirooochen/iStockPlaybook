// Phase I.1 — currency-integrity boundary. See
// docs/phase-i-minimum-research-evidence.md and
// currency-integrity.ts's own doc comment for the rule this enforces:
// same currency -> allowed; different currencies + a verified FX rate ->
// normalize, allowed; otherwise -> MISSING. Never a mixed-currency
// combination silently allowed through.
import { describe, expect, it } from "vitest";
import { resolveCurrencyIntegrity } from "@/domain/market-data/currency-integrity";
import type { DataField, FxRate } from "@/types/market-data";

function availableRate(value: number): DataField<number> {
  return { status: "AVAILABLE", value, asOf: "2026-09-17T00:00:00.000Z" };
}

const USD_EUR_RATE: FxRate = { from: "USD", to: "EUR", rate: availableRate(0.87147) };

describe("resolveCurrencyIntegrity — same currency", () => {
  it("allows two USD figures with no FX rate needed at all", () => {
    expect(resolveCurrencyIntegrity("USD", "USD")).toEqual({ status: "SAME_CURRENCY", currency: "USD" });
  });

  it("allows two EUR figures (Unity is USD/USD; ASML's fundamentals+SEC data would both be EUR)", () => {
    expect(resolveCurrencyIntegrity("EUR", "EUR")).toEqual({ status: "SAME_CURRENCY", currency: "EUR" });
  });

  it("ignores a supplied FX rate entirely when the currencies already match", () => {
    const result = resolveCurrencyIntegrity("USD", "USD", { from: "EUR", to: "GBP", rate: availableRate(1) });
    expect(result).toEqual({ status: "SAME_CURRENCY", currency: "USD" });
  });
});

describe("resolveCurrencyIntegrity — different currencies, verified FX", () => {
  it("converts when the FX rate is exactly the (value -> target) pair and AVAILABLE — the real ASML case: EUR fundamentals, USD price (Twelve Data's default 'ASML' listing)", () => {
    expect(resolveCurrencyIntegrity("EUR", "USD", { from: "EUR", to: "USD", rate: availableRate(1.15) })).toEqual({
      status: "CONVERTED",
      from: "EUR",
      to: "USD",
      rate: 1.15,
    });
  });

  it("converts the other direction too, when that's the pair actually supplied", () => {
    expect(resolveCurrencyIntegrity("USD", "EUR", USD_EUR_RATE)).toEqual({
      status: "CONVERTED",
      from: "USD",
      to: "EUR",
      rate: 0.87147,
    });
  });
});

describe("resolveCurrencyIntegrity — different currencies, no safe conversion -> MISSING, never guessed", () => {
  it("is MISSING when no FX rate is supplied at all", () => {
    expect(resolveCurrencyIntegrity("EUR", "USD")).toEqual({ status: "MISSING" });
  });

  it("is MISSING when the supplied FX rate is the wrong pair (not simply inverted or substituted)", () => {
    expect(resolveCurrencyIntegrity("EUR", "USD", { from: "GBP", to: "USD", rate: availableRate(1.3) })).toEqual({
      status: "MISSING",
    });
  });

  it("is MISSING when the supplied FX rate is inverted relative to what's needed — never silently flipped", () => {
    // Caller needs EUR -> USD; only USD -> EUR is supplied.
    expect(resolveCurrencyIntegrity("EUR", "USD", USD_EUR_RATE)).toEqual({ status: "MISSING" });
  });

  it("is MISSING when the FX rate itself is MISSING, even though it's structurally the right pair", () => {
    const fx: FxRate = { from: "EUR", to: "USD", rate: { status: "MISSING" } };
    expect(resolveCurrencyIntegrity("EUR", "USD", fx)).toEqual({ status: "MISSING" });
  });

  it("is MISSING for a structurally invalid currency code, even when it equals the target string-for-string", () => {
    expect(resolveCurrencyIntegrity("usd", "usd")).toEqual({ status: "MISSING" });
    expect(resolveCurrencyIntegrity("US", "USD")).toEqual({ status: "MISSING" });
  });
});
