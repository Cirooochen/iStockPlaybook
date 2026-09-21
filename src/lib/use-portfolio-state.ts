"use client";

// Single source of truth for live portfolio state — Phase G.5. Extracted
// from PortfolioClientShell (Phase G.3) so the Portfolio page and the Stock
// Detail page read the exact same holdings/snapshot, instead of each
// growing its own copy of this loading/merging/deriving logic.
import { useEffect, useMemo, useState } from "react";
import { derivePortfolioSnapshot } from "@/domain/portfolio/snapshot";
import { mergeManualPrices } from "@/domain/portfolio/manual-prices";
import { loadPortfolioState, savePortfolioState, type ManualPriceEntry } from "@/lib/portfolio-storage";
import type { Holding, PortfolioSnapshot, StockPlaybookConfig } from "@/types/portfolio";
import type { FxRate, RawQuote } from "@/types/market-data";

export const PORTFOLIO_BASE_CURRENCY = "EUR";

// v0.1 real-data cleanup — no seed/demo portfolio ships in the runtime
// anymore (holdings-seed.ts/stock-playbook-seed.ts/market-data-seed.ts
// are now test-only fixtures, still used by domain validation tests, but
// no longer imported here). A holding without a manualPrices entry has
// no quote at all — deriveHoldingSnapshot (snapshot.ts) already resolves
// that to MISSING, never 0, so an empty base map is the correct "no
// quote provider wired for v0.1" starting point, not a placeholder to
// fill in later.
const EMPTY_QUOTES: Map<string, RawQuote> = new Map();
const EMPTY_FX_RATES: Map<string, FxRate> = new Map();
// Only used for the very first (pre-hydration) render, before any real
// holdings can exist to be timestamped by it — overwritten by a real
// `new Date().toISOString()` the moment the mount-time effect below runs,
// same hydration-safety pattern as `hydrated` itself.
const INITIAL_ASOF = "1970-01-01T00:00:00.000Z";

export interface PortfolioState {
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  manualPrices: Record<string, ManualPriceEntry | null>;
  setManualPrices: React.Dispatch<React.SetStateAction<Record<string, ManualPriceEntry | null>>>;
  configs: StockPlaybookConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<StockPlaybookConfig[]>>;
  quotes: Map<string, RawQuote>;
  snapshot: PortfolioSnapshot;
  // True once the mount-time localStorage load has run. Server render and
  // the first client render always use the same empty defaults (so they
  // match exactly, avoiding a hydration mismatch); any real persisted
  // state only takes effect after this flips true. A consumer that copies
  // snapshot
  // data into its own local state on mount (as PlaybookClientShell does)
  // should key off this to force a resync when it changes.
  hydrated: boolean;
}

export function usePortfolioState(): PortfolioState {
  // v0.1 real-data cleanup — genuinely empty until either a mount-time
  // localStorage load (below) or a real user action populates them.
  // Server render and the first client render both use these same empty
  // defaults (avoiding a hydration mismatch); real persisted state only
  // takes effect after `hydrated` flips true.
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [manualPrices, setManualPrices] = useState<Record<string, ManualPriceEntry | null>>({});
  const [configs, setConfigs] = useState<StockPlaybookConfig[]>([]);
  const [asOf, setAsOf] = useState(INITIAL_ASOF);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadPortfolioState();
    if (persisted) {
      setHoldings(persisted.holdings);
      setManualPrices(persisted.manualPrices);
      // v0.1 real-data cleanup — an explicitly-empty persisted configs
      // array IS trusted now (no more "no configs saved yet" seed
      // fallback to resurrect): there is nothing left to resurrect, so a
      // real empty state stays empty.
      setConfigs(persisted.configs);
    }
    setAsOf(new Date().toISOString());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with the empty defaults before the load above has run
    savePortfolioState({ holdings, manualPrices, configs });
  }, [holdings, manualPrices, configs, hydrated]);

  const quotes = useMemo(
    () => mergeManualPrices(EMPTY_QUOTES, manualPrices, PORTFOLIO_BASE_CURRENCY),
    [manualPrices]
  );

  const snapshot = useMemo(
    () => derivePortfolioSnapshot(holdings, quotes, EMPTY_FX_RATES, PORTFOLIO_BASE_CURRENCY, asOf),
    [holdings, quotes, asOf]
  );

  return { holdings, setHoldings, manualPrices, setManualPrices, configs, setConfigs, quotes, snapshot, hydrated };
}
