"use client";

// Single source of truth for live portfolio state — Phase G.5. Extracted
// from PortfolioClientShell (Phase G.3) so the Portfolio page and the Stock
// Detail page read the exact same holdings/snapshot, instead of each
// growing its own copy of this loading/merging/deriving logic.
import { useEffect, useMemo, useState } from "react";
import { holdingsSeed } from "@/data/holdings-seed";
import { stockPlaybookConfigsSeed } from "@/data/stock-playbook-seed";
import { quotesSeed, fxRatesSeed, asOf as seedAsOf } from "@/data/market-data-seed";
import { derivePortfolioSnapshot } from "@/domain/portfolio/snapshot";
import { mergeManualPrices } from "@/domain/portfolio/manual-prices";
import { loadPortfolioState, savePortfolioState, type ManualPriceEntry } from "@/lib/portfolio-storage";
import type { Holding, PortfolioSnapshot, StockPlaybookConfig } from "@/types/portfolio";
import type { RawQuote } from "@/types/market-data";

export const PORTFOLIO_BASE_CURRENCY = "EUR";

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
  // the first client render always use the seed defaults (so they match
  // exactly, avoiding a hydration mismatch); any real persisted state only
  // takes effect after this flips true. A consumer that copies snapshot
  // data into its own local state on mount (as PlaybookClientShell does)
  // should key off this to force a resync when it changes.
  hydrated: boolean;
}

export function usePortfolioState(): PortfolioState {
  const [holdings, setHoldings] = useState<Holding[]>(holdingsSeed);
  const [manualPrices, setManualPrices] = useState<Record<string, ManualPriceEntry | null>>({});
  const [configs, setConfigs] = useState<StockPlaybookConfig[]>(stockPlaybookConfigsSeed);
  const [asOf, setAsOf] = useState(seedAsOf);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadPortfolioState();
    if (persisted) {
      setHoldings(persisted.holdings);
      setManualPrices(persisted.manualPrices);
      // An empty (or pre-H.4, absent) persisted configs array means "no
      // configs saved yet" — there is no delete-config UI, so it can never
      // mean "Unity's config was deliberately removed." Keep the seed
      // default (Unity) in that case rather than resurrecting nothing.
      if (persisted.configs.length > 0) setConfigs(persisted.configs);
    }
    setAsOf(new Date().toISOString());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with the seed before the load above has run
    savePortfolioState({ holdings, manualPrices, configs });
  }, [holdings, manualPrices, configs, hydrated]);

  const quotes = useMemo(
    () => mergeManualPrices(quotesSeed, manualPrices, PORTFOLIO_BASE_CURRENCY),
    [manualPrices]
  );

  const snapshot = useMemo(
    () => derivePortfolioSnapshot(holdings, quotes, fxRatesSeed, PORTFOLIO_BASE_CURRENCY, asOf),
    [holdings, quotes, asOf]
  );

  return { holdings, setHoldings, manualPrices, setManualPrices, configs, setConfigs, quotes, snapshot, hydrated };
}
