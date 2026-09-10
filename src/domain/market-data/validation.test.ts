// Phase C.2 — structural validation helpers for the raw market-data
// contract. See docs/phase-c0-market-data-contract.md §4/§6.
import { describe, expect, it } from "vitest";
import {
  isValidInstrumentId,
  isValidCurrency,
  isValidTimestamp,
  isValidOhlcvDate,
  isValidFxPair,
  isFiniteAvailableField,
  isPositiveAvailableField,
  isNonNegativeAvailableField,
} from "@/domain/market-data/validation";
import type { DataField, FxRate, OhlcvBar, RawMarketData, RawQuote } from "@/types/market-data";

describe("isValidInstrumentId", () => {
  it("accepts a non-empty id", () => {
    expect(isValidInstrumentId("acme-corp")).toBe(true);
  });
  it("rejects an empty or whitespace-only id", () => {
    expect(isValidInstrumentId("")).toBe(false);
    expect(isValidInstrumentId("   ")).toBe(false);
  });
});

describe("isValidCurrency", () => {
  it("accepts a three-uppercase-letter code", () => {
    expect(isValidCurrency("USD")).toBe(true);
    expect(isValidCurrency("EUR")).toBe(true);
  });
  it("rejects lowercase, wrong length, or non-letter codes", () => {
    expect(isValidCurrency("usd")).toBe(false);
    expect(isValidCurrency("US")).toBe(false);
    expect(isValidCurrency("USDD")).toBe(false);
    expect(isValidCurrency("US1")).toBe(false);
    expect(isValidCurrency("")).toBe(false);
  });
});

describe("isValidTimestamp / isValidOhlcvDate", () => {
  it("accepts a parseable ISO timestamp / date", () => {
    expect(isValidTimestamp("2026-09-09T12:00:00.000Z")).toBe(true);
    expect(isValidOhlcvDate("2026-09-09")).toBe(true);
  });
  it("rejects an unparseable string", () => {
    expect(isValidTimestamp("not-a-date")).toBe(false);
    expect(isValidOhlcvDate("not-a-date")).toBe(false);
  });
});

describe("isValidFxPair", () => {
  it("accepts two distinct, structurally valid currencies", () => {
    expect(isValidFxPair("USD", "EUR")).toBe(true);
  });
  it("rejects a pair where either code is structurally invalid", () => {
    expect(isValidFxPair("usd", "EUR")).toBe(false);
    expect(isValidFxPair("USD", "eu")).toBe(false);
  });
  it("rejects a pair converting a currency to itself", () => {
    expect(isValidFxPair("USD", "USD")).toBe(false);
  });
});

describe("isFiniteAvailableField", () => {
  it("accepts a finite AVAILABLE value", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 42.5, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isFiniteAvailableField(field)).toBe(true);
  });
  it("rejects NaN/Infinity AVAILABLE values", () => {
    const nan: DataField<number> = { status: "AVAILABLE", value: NaN, asOf: "2026-09-09T12:00:00.000Z" };
    const inf: DataField<number> = { status: "AVAILABLE", value: Infinity, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isFiniteAvailableField(nan)).toBe(false);
    expect(isFiniteAvailableField(inf)).toBe(false);
  });
  it("MISSING trivially passes — structural checks don't require presence", () => {
    expect(isFiniteAvailableField({ status: "MISSING" })).toBe(true);
  });
});

describe("isPositiveAvailableField — price/rate semantics", () => {
  it("accepts a positive AVAILABLE value", () => {
    const field: DataField<number> = { status: "AVAILABLE", value: 40.46, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isPositiveAvailableField(field)).toBe(true);
  });
  it("rejects zero and negative AVAILABLE values", () => {
    const zero: DataField<number> = { status: "AVAILABLE", value: 0, asOf: "2026-09-09T12:00:00.000Z" };
    const negative: DataField<number> = { status: "AVAILABLE", value: -1, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isPositiveAvailableField(zero)).toBe(false);
    expect(isPositiveAvailableField(negative)).toBe(false);
  });
  it("MISSING trivially passes", () => {
    expect(isPositiveAvailableField({ status: "MISSING" })).toBe(true);
  });
});

describe("isNonNegativeAvailableField — volume semantics", () => {
  it("accepts a positive AVAILABLE value and zero", () => {
    const positive: DataField<number> = { status: "AVAILABLE", value: 1_200_000, asOf: "2026-09-09T12:00:00.000Z" };
    const zero: DataField<number> = { status: "AVAILABLE", value: 0, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isNonNegativeAvailableField(positive)).toBe(true);
    expect(isNonNegativeAvailableField(zero)).toBe(true);
  });
  it("rejects a negative AVAILABLE value", () => {
    const negative: DataField<number> = { status: "AVAILABLE", value: -1, asOf: "2026-09-09T12:00:00.000Z" };
    expect(isNonNegativeAvailableField(negative)).toBe(false);
  });
  it("MISSING trivially passes", () => {
    expect(isNonNegativeAvailableField({ status: "MISSING" })).toBe(true);
  });
});

describe("RawMarketData — synthetic fixtures compose correctly with the helpers", () => {
  const asOf = "2026-09-09T12:00:00.000Z";

  it("a fully AVAILABLE, valid fixture passes every relevant structural check", () => {
    const quote: RawQuote = { price: { status: "AVAILABLE", value: 40.46, asOf }, currency: "USD" };
    const bar: OhlcvBar = {
      date: "2026-09-09",
      open: { status: "AVAILABLE", value: 39.9, asOf },
      high: { status: "AVAILABLE", value: 41.0, asOf },
      low: { status: "AVAILABLE", value: 39.5, asOf },
      close: { status: "AVAILABLE", value: 40.46, asOf },
      volume: { status: "AVAILABLE", value: 1_500_000, asOf },
    };
    const fx: FxRate = { from: "USD", to: "EUR", rate: { status: "AVAILABLE", value: 0.92, asOf } };
    const data: RawMarketData = {
      instrumentId: "synthetic-co",
      quote,
      ohlcv: [bar],
      fx,
      checkedAt: asOf,
    };

    expect(isValidInstrumentId(data.instrumentId)).toBe(true);
    expect(isValidTimestamp(data.checkedAt)).toBe(true);
    expect(isValidCurrency(data.quote.currency)).toBe(true);
    expect(isPositiveAvailableField(data.quote.price)).toBe(true);
    expect(isValidOhlcvDate(data.ohlcv[0].date)).toBe(true);
    expect(isPositiveAvailableField(data.ohlcv[0].close)).toBe(true);
    expect(isNonNegativeAvailableField(data.ohlcv[0].volume)).toBe(true);
    expect(isValidFxPair(data.fx!.from, data.fx!.to)).toBe(true);
    expect(isPositiveAvailableField(data.fx!.rate)).toBe(true);
  });

  it("a wholly-MISSING fixture is still structurally valid at the RawMarketData level (checkedAt/instrumentId/currency are the only always-required parts)", () => {
    const data: RawMarketData = {
      instrumentId: "synthetic-co",
      quote: { price: { status: "MISSING" }, currency: "USD" },
      ohlcv: [],
      checkedAt: asOf,
    };

    expect(isValidInstrumentId(data.instrumentId)).toBe(true);
    expect(isValidTimestamp(data.checkedAt)).toBe(true);
    expect(isValidCurrency(data.quote.currency)).toBe(true);
    expect(isPositiveAvailableField(data.quote.price)).toBe(true); // MISSING trivially passes
    expect(data.fx).toBeUndefined(); // fx is optional as a whole block
  });

  it("fx present-with-MISSING-rate is structurally valid — conversion needed but the rate couldn't be fetched", () => {
    const fx: FxRate = { from: "USD", to: "EUR", rate: { status: "MISSING" } };
    expect(isValidFxPair(fx.from, fx.to)).toBe(true);
    expect(isPositiveAvailableField(fx.rate)).toBe(true);
  });
});
