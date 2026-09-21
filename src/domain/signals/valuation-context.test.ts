// Phase I.4B — deriveValuationContext. Pure-function tests only; builds
// minimal EvRevenueCheckpoint fixtures directly (only `evToRevenue` and
// array position/order actually matter to this function) rather than
// re-deriving them through the full I.4A pipeline, which
// valuation-checkpoints.test.ts already covers on its own.
import { describe, expect, it } from "vitest";
import { deriveValuationContext } from "@/domain/signals/valuation-context";
import type { EvRevenueCheckpoint } from "@/domain/signals/valuation-checkpoints";

function checkpoint(evToRevenue: number, fiscalYear: number = 2020): EvRevenueCheckpoint {
  return {
    fiscalYear,
    periodId: `${fiscalYear}-FY`,
    checkpointDate: `${fiscalYear + 1}-02-25`,
    price: 100,
    priceCurrency: "USD",
    sharesOutstanding: 1_000,
    marketCap: 100_000,
    currencyIntegrity: { status: "SAME_CURRENCY", currency: "USD" },
    normalizedMarketCap: 100_000,
    totalDebt: 200,
    cashAndEquivalents: 50,
    enterpriseValue: 100_150,
    trailingTwelveMonthRevenue: 100_150 / evToRevenue,
    evToRevenue,
  };
}

describe("deriveValuationContext — checkpoint-count gate", () => {
  it("is MISSING for an empty checkpoint array — Unity's real shape (debt never resolves)", () => {
    expect(deriveValuationContext([])).toEqual({ status: "MISSING" });
  });

  it("is MISSING with only current + 2 historical checkpoints — below the 3-historical minimum", () => {
    const result = deriveValuationContext([checkpoint(10), checkpoint(8), checkpoint(9)]);
    expect(result).toEqual({ status: "MISSING" });
  });

  it("is AVAILABLE with exactly current + 3 historical checkpoints — the minimum itself", () => {
    const result = deriveValuationContext([checkpoint(10), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result.status).toBe("AVAILABLE");
  });

  it("is AVAILABLE with current + 5 historical checkpoints — the pipeline's own maximum", () => {
    const result = deriveValuationContext([checkpoint(10), checkpoint(8), checkpoint(9), checkpoint(7), checkpoint(6), checkpoint(11)]);
    expect(result.status).toBe("AVAILABLE");
    expect(result.status === "AVAILABLE" && result.historicalCheckpointCount).toBe(5);
  });
});

describe("deriveValuationContext — median and comparison", () => {
  it("HIGHER: current above the historical median", () => {
    // historical = [8, 9, 7] -> median 8
    const result = deriveValuationContext([checkpoint(10), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result).toMatchObject({ status: "AVAILABLE", currentEvToRevenue: 10, historicalMedianEvToRevenue: 8, comparison: "HIGHER" });
  });

  it("LOWER: current below the historical median", () => {
    // historical = [8, 9, 7] -> median 8
    const result = deriveValuationContext([checkpoint(5), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result).toMatchObject({ status: "AVAILABLE", currentEvToRevenue: 5, historicalMedianEvToRevenue: 8, comparison: "LOWER" });
  });

  it("IN_LINE: current exactly equal to the historical median — exact equality only, no tolerance band", () => {
    // historical = [8, 9, 7] -> median 8
    const result = deriveValuationContext([checkpoint(8), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result).toMatchObject({ status: "AVAILABLE", currentEvToRevenue: 8, historicalMedianEvToRevenue: 8, comparison: "IN_LINE" });
  });

  it("computes the average of the two middle values for an even-sized historical set (4 historical checkpoints)", () => {
    // historical = [7, 8, 9, 12] sorted -> median (8+9)/2 = 8.5
    const result = deriveValuationContext([checkpoint(10), checkpoint(12), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result).toMatchObject({ status: "AVAILABLE", historicalMedianEvToRevenue: 8.5, historicalCheckpointCount: 4 });
  });

  it("is order-independent — the median does not depend on the historical checkpoints' own most-recent-first array order", () => {
    const inOrder = deriveValuationContext([checkpoint(10), checkpoint(7), checkpoint(8), checkpoint(9)]);
    const reversed = deriveValuationContext([checkpoint(10), checkpoint(9), checkpoint(8), checkpoint(7)]);
    expect(inOrder).toEqual(reversed);
  });
});

describe("deriveValuationContext — descriptive scope boundary", () => {
  it("never reports anything beyond status/values/comparison — no score, percentile, or classification field exists on the AVAILABLE shape", () => {
    const result = deriveValuationContext([checkpoint(10), checkpoint(8), checkpoint(9), checkpoint(7)]);
    expect(result.status).toBe("AVAILABLE");
    expect(Object.keys(result).sort()).toEqual(
      ["comparison", "currentEvToRevenue", "historicalCheckpointCount", "historicalMedianEvToRevenue", "status"].sort()
    );
  });
});
