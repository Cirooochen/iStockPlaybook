// Phase G.4 — regression coverage for the bug found in end-to-end
// validation: clearing a seeded holding's price must actually clear it.
import { describe, expect, it } from "vitest";
import { mergeManualPrices } from "@/domain/portfolio/manual-prices";
import type { RawQuote } from "@/types/market-data";

const asOf = "2026-09-14T12:00:00+02:00";

const seedQuotes = new Map<string, RawQuote>([
  ["U", { price: { status: "AVAILABLE", value: 40.46, asOf }, currency: "EUR" }],
]);

describe("mergeManualPrices", () => {
  it("falls back to the seed quote when there is no manual price entry at all", () => {
    const merged = mergeManualPrices(seedQuotes, {}, "EUR");
    expect(merged.get("U")).toEqual(seedQuotes.get("U"));
  });

  it("overrides the seed quote with a manually entered price", () => {
    const merged = mergeManualPrices(
      seedQuotes,
      { U: { priceNative: 45, asOf: "2026-09-14T13:00:00+02:00" } },
      "EUR"
    );
    expect(merged.get("U")).toEqual({
      price: { status: "AVAILABLE", value: 45, asOf: "2026-09-14T13:00:00+02:00" },
      currency: "EUR",
    });
  });

  it("an explicit null clears a seeded quote instead of falling back to it", () => {
    const merged = mergeManualPrices(seedQuotes, { U: null }, "EUR");
    expect(merged.has("U")).toBe(false);
  });

  it("a null entry for an instrument with no seed quote is simply absent, not an error", () => {
    const merged = mergeManualPrices(new Map(), { XYZ: null }, "EUR");
    expect(merged.has("XYZ")).toBe(false);
  });
});
