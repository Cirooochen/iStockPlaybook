// Real Portfolio data model — Phase G.1. Design: docs/phase-g0-real-portfolio-data-model.md.
// Additive: Position/Strategy/Playbook (src/types/playbook.ts) are unchanged
// and remain the Stock Position Engine's contract. These types describe
// portfolio-level ownership and valuation, which feed the engine through
// toStockEngineInputs (src/domain/portfolio/snapshot.ts) rather than
// replacing it.
import type { DataField } from "@/types/market-data";
import type { Strategy, Playbook } from "@/types/playbook";

export type AssetType = "CASH" | "STOCK" | "ETF" | "CRYPTO" | "OTHER";

export interface InstrumentIdentity {
  // Provider-agnostic identifier — a join key, never a raw provider symbol.
  id: string;
  assetType: AssetType;
  name: string;
  // Absent for CASH; may be absent for OTHER.
  ticker?: string;
  exchange?: string;
  isin?: string;
  // The instrument's own currency — was Security.marketCurrency. For CASH,
  // this IS the holding's denomination (e.g. a EUR cash holding has
  // nativeCurrency: "EUR" and no ticker/exchange).
  nativeCurrency: string;
}

export type CostBasis =
  | { status: "AVAILABLE"; averageCostNative: number; asOf: string }
  | { status: "MISSING" } // cost history unknown (e.g. migrated data)
  | { status: "NOT_APPLICABLE" }; // CASH only — cash has no cost basis by
  // definition, not an unknown one. Same three-state pattern
  // RelativeStrengthData (src/types/market-data.ts) already uses.

export interface Holding {
  id: string;
  instrument: InstrumentIdentity;
  // Shares/units for STOCK/ETF/CRYPTO; the cash amount itself (in
  // nativeCurrency) for CASH — cash has no separate "price", it IS the
  // value. Never share-count-shaped for CASH.
  quantity: number;
  costBasis: CostBasis; // per-unit, in instrument.nativeCurrency
}

// Portfolio Holdings describe what the user owns. Stock Strategy/Playbook
// describes how a supported stock is managed. Linked through instrument
// identity, not through one owning the other — a Strategy/Playbook can
// exist for a stock currently held at zero shares (thesis research ahead of
// a first buy), and a STOCK Holding can exist with no config yet (owned,
// but not onboarded into the Playbook).
export interface StockPlaybookConfig {
  instrumentId: string; // = InstrumentIdentity.id — a join key, not a Holding id
  strategy: Strategy;
  playbook: Playbook;
}

export interface HoldingSnapshot {
  holdingId: string;
  instrument: InstrumentIdentity;
  quantity: number;
  // CASH: not looked up — a cash unit is always worth exactly 1 of its own
  // currency, so this is AVAILABLE with value 1 rather than fabricating a
  // provider lookup that could never fail or ever mean anything else.
  priceNative: DataField<number>;
  // This holding's OWN known value, in the snapshot's base currency. MISSING
  // if priceNative is MISSING, or FX conversion is needed and MISSING —
  // never 0, never stale.
  valueBase: DataField<number>;
  // Total cost basis (quantity × per-unit cost), in base currency. MISSING
  // if costBasis is MISSING or FX conversion is needed and MISSING;
  // NOT_APPLICABLE for CASH — never a 0-that-looks-earned.
  costBasisBase: DataField<number> | { status: "NOT_APPLICABLE" };
  unrealizedPnlBase: DataField<number> | { status: "NOT_APPLICABLE" };
  unrealizedReturnPct: DataField<number> | { status: "NOT_APPLICABLE" };
}

// No weightPct field here — a weight is only ever authoritative relative to
// a whole-portfolio total, and that total is not always trustworthy (see
// PortfolioValuation below). Use holdingWeightPct instead.

export type PortfolioValuation =
  | {
      state: "COMPLETE";
      totalValueBase: number;
      totalCostBasisBase: DataField<number>;
      totalUnrealizedPnlBase: DataField<number>;
      totalUnrealizedReturnPct: DataField<number>;
    }
  | {
      state: "PARTIAL";
      // Deliberately NOT named totalValueBase — a sum of only the
      // AVAILABLE holdings, never presentable as "Portfolio Total".
      knownValueBase: number;
      excludedHoldingIds: string[]; // holdings whose value couldn't be established
    }
  | { state: "UNAVAILABLE" };

export interface PortfolioSnapshot {
  asOf: string;
  baseCurrency: string; // "EUR" for v0.1
  holdings: HoldingSnapshot[];
  valuation: PortfolioValuation;
}
