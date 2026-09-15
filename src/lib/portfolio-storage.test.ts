// Phase G.3 — localStorage is stubbed (no jsdom in this project's vitest
// environment); a Map-backed fake is enough to exercise the real
// get/set/JSON round-trip and error paths.
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPortfolioState, savePortfolioState } from "@/lib/portfolio-storage";
import type { Holding } from "@/types/portfolio";

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadPortfolioState", () => {
  it("returns null when nothing is stored", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
    expect(loadPortfolioState()).toBeNull();
  });

  it("returns null when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadPortfolioState()).toBeNull();
  });

  it("returns null (never throws) on malformed JSON", () => {
    vi.stubGlobal("localStorage", fakeLocalStorage({ "istockplaybook.portfolio.v1": "{not json" }));
    expect(loadPortfolioState()).toBeNull();
  });

  it("returns null when the stored shape has no holdings array", () => {
    vi.stubGlobal(
      "localStorage",
      fakeLocalStorage({ "istockplaybook.portfolio.v1": JSON.stringify({ foo: "bar" }) })
    );
    expect(loadPortfolioState()).toBeNull();
  });

  it("defaults manualPrices to {} when absent from the stored payload", () => {
    vi.stubGlobal(
      "localStorage",
      fakeLocalStorage({ "istockplaybook.portfolio.v1": JSON.stringify({ holdings: [] }) })
    );
    expect(loadPortfolioState()).toEqual({ holdings: [], manualPrices: {}, configs: [] });
  });

  it("defaults configs to [] when absent from the stored payload (pre-H.4 blob)", () => {
    vi.stubGlobal(
      "localStorage",
      fakeLocalStorage({ "istockplaybook.portfolio.v1": JSON.stringify({ holdings: [], manualPrices: {} }) })
    );
    expect(loadPortfolioState()).toEqual({ holdings: [], manualPrices: {}, configs: [] });
  });
});

describe("savePortfolioState / loadPortfolioState round-trip", () => {
  it("persists and reloads holdings and manual prices exactly", () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal("localStorage", storage);

    const holding: Holding = {
      id: "h-1",
      instrument: { id: "instr-1", assetType: "STOCK", name: "Acme", ticker: "ACME", nativeCurrency: "EUR" },
      quantity: 10,
      costBasis: { status: "MISSING" },
    };

    savePortfolioState({
      holdings: [holding],
      manualPrices: { "instr-1": { priceNative: 12.5, asOf: "2026-09-14T12:00:00+02:00" } },
      configs: [],
    });

    expect(loadPortfolioState()).toEqual({
      holdings: [holding],
      manualPrices: { "instr-1": { priceNative: 12.5, asOf: "2026-09-14T12:00:00+02:00" } },
      configs: [],
    });
  });

  it("does not throw when localStorage.setItem fails (e.g. quota)", () => {
    const storage = fakeLocalStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    vi.stubGlobal("localStorage", storage);

    expect(() => savePortfolioState({ holdings: [], manualPrices: {}, configs: [] })).not.toThrow();
  });
});
