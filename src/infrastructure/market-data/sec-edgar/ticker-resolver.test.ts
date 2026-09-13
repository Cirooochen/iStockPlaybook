// Phase E.7B — resolveCikForTicker. Fixture shape mirrors the real
// company_tickers.json — an object keyed by numeric-string index, not
// an array (design doc §0.1/§1).
import { describe, expect, it } from "vitest";
import { resolveCikForTicker, zeroPadCik } from "@/infrastructure/market-data/sec-edgar/ticker-resolver";

const TICKERS_PAYLOAD = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 1810806, ticker: "U", title: "Unity Software Inc." },
};

describe("resolveCikForTicker", () => {
  it("resolves an exact ticker match to its zero-padded 10-digit CIK", () => {
    expect(resolveCikForTicker(TICKERS_PAYLOAD, "U")).toBe("0001810806");
  });

  it("matches case-insensitively", () => {
    expect(resolveCikForTicker(TICKERS_PAYLOAD, "u")).toBe("0001810806");
  });

  it("returns null for a ticker not present in the list", () => {
    expect(resolveCikForTicker(TICKERS_PAYLOAD, "NOPE")).toBeNull();
  });

  it("returns null, never throws, for a malformed payload", () => {
    expect(resolveCikForTicker(null, "U")).toBeNull();
    expect(resolveCikForTicker("not an object", "U")).toBeNull();
    expect(resolveCikForTicker({}, "U")).toBeNull();
  });
});

describe("zeroPadCik", () => {
  it("pads to exactly 10 digits", () => {
    expect(zeroPadCik(1810806)).toBe("0001810806");
    expect(zeroPadCik(320193)).toBe("0000320193");
  });
});
