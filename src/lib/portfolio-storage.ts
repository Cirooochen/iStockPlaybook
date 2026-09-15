// Minimal local persistence for manually-managed portfolio state —
// Phase G.3. No backend/DB exists in this app; localStorage is the
// smallest mechanism that survives a page reload, matching the brief's
// "v0.1 — Manual setup" scope (§13). Best-effort: a storage failure
// (quota, private mode, unavailable) degrades to in-memory-only for the
// session rather than throwing.
import type { Holding, StockPlaybookConfig } from "@/types/portfolio";

const STORAGE_KEY = "istockplaybook.portfolio.v1";

export interface ManualPriceEntry {
  priceNative: number;
  asOf: string;
}

export interface PersistedPortfolioState {
  holdings: Holding[];
  // Keyed by InstrumentIdentity.id — a manually-entered "what is it worth
  // now" fact, kept separate from Holding (brief §9), never embedded in it.
  // A value overrides any seed/default quote; `null` explicitly records
  // "the user cleared this price" — distinct from the key being absent
  // (no opinion, fall back to the seed default) — so editing a
  // previously-seeded holding's price to blank actually clears it instead
  // of silently falling back to the seed value underneath.
  manualPrices: Record<string, ManualPriceEntry | null>;
  // Phase H.4 — confirmed Playbook onboarding configs. Joined by
  // instrumentId, same as stockPlaybookConfigsSeed (never a second config
  // source of truth — this IS the live one; the seed only supplies
  // Unity's default before any localStorage state exists).
  configs: StockPlaybookConfig[];
}

export function loadPortfolioState(): PersistedPortfolioState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.holdings)) return null;
    return {
      holdings: parsed.holdings,
      manualPrices: parsed.manualPrices ?? {},
      // Array.isArray guard, not `?? []`, so an older (pre-H.4) persisted
      // blob with no `configs` key at all is distinguishable, at the
      // call site, from a deliberately empty one — see
      // use-portfolio-state.ts's hydration comment.
      configs: Array.isArray(parsed.configs) ? parsed.configs : [],
    };
  } catch {
    return null;
  }
}

export function savePortfolioState(state: PersistedPortfolioState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort — see module comment.
  }
}
