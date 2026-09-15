// Manual Portfolio Management — Phase G.3.
import { describe, expect, it } from "vitest";
import {
  validateHoldingFormInput,
  createHolding,
  updateHolding,
  type HoldingFormInput,
} from "@/domain/portfolio/holding-form";
import type { Holding } from "@/types/portfolio";

const asOf = "2026-09-14T12:00:00+02:00";

describe("validateHoldingFormInput", () => {
  const validStock: HoldingFormInput = {
    assetType: "STOCK",
    name: "Acme Corp",
    ticker: "ACME",
    quantity: 10,
  };

  it("accepts a minimal valid STOCK input", () => {
    expect(validateHoldingFormInput(validStock)).toEqual({ valid: true, errors: [] });
  });

  it("rejects an empty name", () => {
    const result = validateHoldingFormInput({ ...validStock, name: "  " });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Name is required.");
  });

  it("rejects zero or negative quantity", () => {
    expect(validateHoldingFormInput({ ...validStock, quantity: 0 }).valid).toBe(false);
    expect(validateHoldingFormInput({ ...validStock, quantity: -5 }).valid).toBe(false);
  });

  it("requires a ticker for STOCK/ETF/CRYPTO but not CASH/OTHER", () => {
    expect(validateHoldingFormInput({ ...validStock, ticker: undefined }).valid).toBe(false);
    expect(
      validateHoldingFormInput({ assetType: "CASH", name: "Cash (EUR)", quantity: 100 }).valid
    ).toBe(true);
    expect(
      validateHoldingFormInput({ assetType: "OTHER", name: "Misc", quantity: 1 }).valid
    ).toBe(true);
  });

  it("rejects a negative average cost but allows it to be omitted", () => {
    expect(validateHoldingFormInput({ ...validStock, averageCostNative: -1 }).valid).toBe(false);
    expect(validateHoldingFormInput({ ...validStock, averageCostNative: undefined }).valid).toBe(true);
  });

  it("rejects a non-positive current price but allows it to be omitted", () => {
    expect(validateHoldingFormInput({ ...validStock, currentPriceNative: 0 }).valid).toBe(false);
    expect(validateHoldingFormInput({ ...validStock, currentPriceNative: undefined }).valid).toBe(true);
  });
});

describe("createHolding", () => {
  it("builds a STOCK holding with AVAILABLE cost basis when averageCostNative is given", () => {
    const holding = createHolding(
      { assetType: "STOCK", name: "Acme Corp", ticker: "ACME", quantity: 10, averageCostNative: 12.5 },
      "h-1",
      "instr-1",
      "EUR",
      asOf
    );
    expect(holding).toEqual({
      id: "h-1",
      instrument: {
        id: "instr-1",
        assetType: "STOCK",
        name: "Acme Corp",
        ticker: "ACME",
        exchange: undefined,
        isin: undefined,
        nativeCurrency: "EUR",
      },
      quantity: 10,
      costBasis: { status: "AVAILABLE", averageCostNative: 12.5, asOf },
    });
  });

  it("builds a STOCK holding with MISSING cost basis when averageCostNative is omitted — never 0", () => {
    const holding = createHolding(
      { assetType: "STOCK", name: "Acme Corp", ticker: "ACME", quantity: 10 },
      "h-1",
      "instr-1",
      "EUR",
      asOf
    );
    expect(holding.costBasis).toEqual({ status: "MISSING" });
  });

  it("builds a CASH holding with NOT_APPLICABLE cost basis, ignoring any averageCostNative", () => {
    const holding = createHolding(
      { assetType: "CASH", name: "Cash (EUR)", quantity: 500, averageCostNative: 999 },
      "h-cash",
      "instr-cash",
      "EUR",
      asOf
    );
    expect(holding.costBasis).toEqual({ status: "NOT_APPLICABLE" });
    expect(holding.instrument.ticker).toBeUndefined();
    expect(holding.quantity).toBe(500);
  });

  it("allows OTHER with no ticker", () => {
    const holding = createHolding(
      { assetType: "OTHER", name: "Miscellaneous", quantity: 1 },
      "h-misc",
      "instr-misc",
      "EUR",
      asOf
    );
    expect(holding.instrument.ticker).toBeUndefined();
  });
});

describe("updateHolding", () => {
  const existing: Holding = {
    id: "h-1",
    instrument: {
      id: "instr-1",
      assetType: "STOCK",
      name: "Acme Corp",
      ticker: "ACME",
      exchange: "NYSE",
      nativeCurrency: "EUR",
    },
    quantity: 10,
    costBasis: { status: "AVAILABLE", averageCostNative: 12.5, asOf: "2026-01-01T00:00:00Z" },
  };

  it("updates quantity and cost basis while preserving id and instrument id", () => {
    const updated = updateHolding(
      existing,
      { assetType: "STOCK", name: "Acme Corp", ticker: "ACME", quantity: 20, averageCostNative: 15 },
      asOf
    );
    expect(updated.id).toBe("h-1");
    expect(updated.instrument.id).toBe("instr-1");
    expect(updated.quantity).toBe(20);
    expect(updated.costBasis).toEqual({ status: "AVAILABLE", averageCostNative: 15, asOf });
  });

  it("keeps the original assetType even if the input tries to change it", () => {
    const updated = updateHolding(
      existing,
      { assetType: "CASH", name: "Acme Corp", quantity: 20 },
      asOf
    );
    expect(updated.instrument.assetType).toBe("STOCK");
  });

  it("can clear cost basis back to MISSING by omitting averageCostNative", () => {
    const updated = updateHolding(existing, { assetType: "STOCK", name: "Acme Corp", ticker: "ACME", quantity: 10 }, asOf);
    expect(updated.costBasis).toEqual({ status: "MISSING" });
  });
});
