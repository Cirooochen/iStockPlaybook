// Portfolio Snapshot derivation — Phase G.1.
// Design: docs/phase-g0-real-portfolio-data-model.md §1.4/§1.5, resolved
// valuation-state model §2. Pure functions. No React, no I/O — quotes/FX
// are supplied by the caller (a future orchestration layer), never fetched
// here (brief §9).
import type { DataField, RawQuote, FxRate } from "@/types/market-data";
import type { Position, Strategy } from "@/types/playbook";
import type {
  Holding,
  HoldingSnapshot,
  PortfolioSnapshot,
  PortfolioValuation,
  StockPlaybookConfig,
} from "@/types/portfolio";

function fxKey(from: string, to: string): string {
  return `${from}->${to}`;
}

// A MISSING price/FX never contributes 0 (brief §11) — converting is only
// ever a no-op (same currency) or a real, available rate. No 1:1 fallback.
function convertToBase(
  amountNative: number,
  nativeCurrency: string,
  baseCurrency: string,
  fxRates: Map<string, FxRate>,
  asOf: string
): DataField<number> {
  if (nativeCurrency === baseCurrency) {
    return { status: "AVAILABLE", value: amountNative, asOf };
  }
  const fx = fxRates.get(fxKey(nativeCurrency, baseCurrency));
  if (!fx || fx.rate.status !== "AVAILABLE") {
    return { status: "MISSING" };
  }
  return { status: "AVAILABLE", value: amountNative * fx.rate.value, asOf };
}

function deriveHoldingSnapshot(
  holding: Holding,
  quotes: Map<string, RawQuote>,
  fxRates: Map<string, FxRate>,
  baseCurrency: string,
  asOf: string
): HoldingSnapshot {
  const { instrument, quantity, costBasis } = holding;

  if (instrument.assetType === "CASH") {
    const valueBase = convertToBase(quantity, instrument.nativeCurrency, baseCurrency, fxRates, asOf);
    return {
      holdingId: holding.id,
      instrument,
      quantity,
      priceNative: { status: "AVAILABLE", value: 1, asOf },
      valueBase,
      costBasisBase: { status: "NOT_APPLICABLE" },
      unrealizedPnlBase: { status: "NOT_APPLICABLE" },
      unrealizedReturnPct: { status: "NOT_APPLICABLE" },
    };
  }

  const quote = quotes.get(instrument.id);
  const priceNative: DataField<number> = quote?.price ?? { status: "MISSING" };

  const valueBase: DataField<number> =
    priceNative.status === "AVAILABLE" && quote
      ? convertToBase(quantity * priceNative.value, quote.currency, baseCurrency, fxRates, asOf)
      : { status: "MISSING" };

  const costBasisBase: DataField<number> | { status: "NOT_APPLICABLE" } =
    costBasis.status === "AVAILABLE"
      ? convertToBase(quantity * costBasis.averageCostNative, instrument.nativeCurrency, baseCurrency, fxRates, asOf)
      : costBasis.status === "NOT_APPLICABLE"
        ? { status: "NOT_APPLICABLE" }
        : { status: "MISSING" };

  const unrealizedPnlBase: DataField<number> | { status: "NOT_APPLICABLE" } =
    costBasisBase.status === "NOT_APPLICABLE"
      ? { status: "NOT_APPLICABLE" }
      : valueBase.status === "AVAILABLE" && costBasisBase.status === "AVAILABLE"
        ? { status: "AVAILABLE", value: valueBase.value - costBasisBase.value, asOf }
        : { status: "MISSING" };

  const unrealizedReturnPct: DataField<number> | { status: "NOT_APPLICABLE" } =
    unrealizedPnlBase.status === "NOT_APPLICABLE"
      ? { status: "NOT_APPLICABLE" }
      : unrealizedPnlBase.status === "AVAILABLE" &&
          costBasisBase.status === "AVAILABLE" &&
          costBasisBase.value !== 0
        ? { status: "AVAILABLE", value: (unrealizedPnlBase.value / costBasisBase.value) * 100, asOf }
        : { status: "MISSING" };

  return {
    holdingId: holding.id,
    instrument,
    quantity,
    priceNative,
    valueBase,
    costBasisBase,
    unrealizedPnlBase,
    unrealizedReturnPct,
  };
}

function classifyValuationState(holdings: HoldingSnapshot[]): "COMPLETE" | "PARTIAL" | "UNAVAILABLE" {
  if (holdings.length === 0) return "COMPLETE"; // an empty portfolio is fully known, not unavailable
  const known = holdings.filter((h) => h.valueBase.status === "AVAILABLE");
  if (known.length === holdings.length) return "COMPLETE";
  if (known.length === 0) return "UNAVAILABLE";
  return "PARTIAL";
}

// Sums a set of per-holding DataField<number>|NOT_APPLICABLE amounts.
// NOT_APPLICABLE contributes 0 (an identity element, e.g. cash has no cost
// basis to add). MISSING poisons the whole sum — a total is never reported
// as complete when a piece of it is unknown (brief §11's MISSING != 0,
// applied to aggregates as well as individual fields).
function sumDataFields(
  fields: (DataField<number> | { status: "NOT_APPLICABLE" })[],
  asOf: string
): DataField<number> {
  let total = 0;
  for (const f of fields) {
    if (f.status === "MISSING") return { status: "MISSING" };
    if (f.status === "AVAILABLE") total += f.value;
  }
  return { status: "AVAILABLE", value: total, asOf };
}

export function derivePortfolioSnapshot(
  holdings: Holding[],
  quotes: Map<string, RawQuote>,
  fxRates: Map<string, FxRate>,
  baseCurrency: string,
  asOf: string
): PortfolioSnapshot {
  const holdingSnapshots = holdings.map((h) =>
    deriveHoldingSnapshot(h, quotes, fxRates, baseCurrency, asOf)
  );
  const state = classifyValuationState(holdingSnapshots);

  let valuation: PortfolioValuation;
  if (state === "UNAVAILABLE") {
    valuation = { state: "UNAVAILABLE" };
  } else if (state === "PARTIAL") {
    const known = holdingSnapshots.filter((h) => h.valueBase.status === "AVAILABLE");
    const excluded = holdingSnapshots.filter((h) => h.valueBase.status !== "AVAILABLE");
    valuation = {
      state: "PARTIAL",
      knownValueBase: known.reduce(
        (sum, h) => sum + (h.valueBase as { status: "AVAILABLE"; value: number }).value,
        0
      ),
      excludedHoldingIds: excluded.map((h) => h.holdingId),
    };
  } else {
    const totalValueBase = holdingSnapshots.reduce(
      (sum, h) => sum + (h.valueBase as { status: "AVAILABLE"; value: number }).value,
      0
    );
    const totalCostBasisBase = sumDataFields(
      holdingSnapshots.map((h) => h.costBasisBase),
      asOf
    );
    const totalUnrealizedPnlBase = sumDataFields(
      holdingSnapshots.map((h) => h.unrealizedPnlBase),
      asOf
    );
    const totalUnrealizedReturnPct: DataField<number> =
      totalUnrealizedPnlBase.status === "AVAILABLE" &&
      totalCostBasisBase.status === "AVAILABLE" &&
      totalCostBasisBase.value !== 0
        ? {
            status: "AVAILABLE",
            value: (totalUnrealizedPnlBase.value / totalCostBasisBase.value) * 100,
            asOf,
          }
        : { status: "MISSING" };
    valuation = {
      state: "COMPLETE",
      totalValueBase,
      totalCostBasisBase,
      totalUnrealizedPnlBase,
      totalUnrealizedReturnPct,
    };
  }

  return { asOf, baseCurrency, holdings: holdingSnapshots, valuation };
}

// Authoritative weight is a function of (holding, valuation), never a
// stored field — and it refuses outside COMPLETE. Concentration
// classification must consume this, never PortfolioValuation.knownValueBase
// directly, so a PARTIAL denominator can never leak into a weight.
export function holdingWeightPct(
  holding: HoldingSnapshot,
  valuation: PortfolioValuation
): number | null {
  if (valuation.state !== "COMPLETE") return null;
  if (holding.valueBase.status !== "AVAILABLE") return null;
  return (holding.valueBase.value / valuation.totalValueBase) * 100;
}

// Enforces brief §1/§14: only STOCK supports the Playbook. Rejected at
// construction (returns null), the same way resolveCoreShareRange
// (src/domain/portfolio/target-position.ts) rejects an invalid Strategy
// pairing rather than the type system preventing it structurally.
export function createStockPlaybookConfig(
  instrumentId: string,
  holdings: Holding[],
  strategy: Strategy,
  playbook: StockPlaybookConfig["playbook"]
): StockPlaybookConfig | null {
  const holding = holdings.find((h) => h.instrument.id === instrumentId);
  if (!holding || holding.instrument.assetType !== "STOCK") return null;
  return { instrumentId, strategy, playbook };
}

// Bridges the new model to the existing, unchanged Stock Position Engine
// boundary (EngineInput is not touched by this design — brief §7, design §1.5).
// Returns null — never a fabricated Position, never a partial or
// best-effort total — whenever: the holding isn't found or isn't STOCK; its
// own valueBase/costBasisBase/unrealizedReturnPct aren't AVAILABLE; the
// snapshot's valuation isn't COMPLETE; or holdingWeightPct returns null.
// This is the fail-safe half of the design's guiding principle: Portfolio
// presentation may fail-soft (PARTIAL still shows something), but decision
// logic must fail-safe (this adapter never does) — an unrelated unpriced
// holding still blocks the Playbook, because the portfolio total (the
// concentration denominator) is what's compromised, not just one holding's
// own display value.
export function toStockEngineInputs(
  snapshot: PortfolioSnapshot,
  holdingId: string,
  config: StockPlaybookConfig
): { position: Position; portfolioTotalEur: number; strategy: Strategy } | null {
  const holding = snapshot.holdings.find((h) => h.holdingId === holdingId);
  if (!holding) return null;
  if (holding.instrument.assetType !== "STOCK") return null;
  if (config.instrumentId !== holding.instrument.id) return null;
  if (snapshot.valuation.state !== "COMPLETE") return null;
  if (holding.valueBase.status !== "AVAILABLE") return null;
  if (holding.costBasisBase.status !== "AVAILABLE") return null;
  if (holding.unrealizedReturnPct.status !== "AVAILABLE") return null;
  if (holding.quantity === 0) return null;

  const weightPct = holdingWeightPct(holding, snapshot.valuation);
  if (weightPct === null) return null;

  const averageCostEur = holding.costBasisBase.value / holding.quantity;

  return {
    position: {
      shares: holding.quantity,
      averageCostEur,
      valueEur: holding.valueBase.value,
      unrealizedReturnPct: holding.unrealizedReturnPct.value,
      portfolioWeightPct: weightPct,
    },
    portfolioTotalEur: snapshot.valuation.totalValueBase,
    strategy: config.strategy,
  };
}
