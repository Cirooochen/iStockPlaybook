// Market data quality foundation — spec: docs/phase-c0-market-data-contract.md §2
// DataField<T> stores only the raw fact: a value with its timestamp, or
// nothing at all. Freshness is deliberately NOT stored here — an earlier
// design that stored a `quality: "FRESH" | "STALE"` tag alongside the value
// created two sources of truth (the tag reflected freshness only at write
// time, while `asOf` stayed fixed). Freshness is derived on demand instead —
// see src/domain/market-data/freshness.ts's evaluateFreshness.
export type DataField<T> =
  | { status: "AVAILABLE"; value: T; asOf: string }
  | { status: "MISSING" };

// Raw market-data contract — spec: docs/phase-c0-market-data-contract.md §4.
// Provider-independent shape for whatever a market-data provider supplies
// (or fails to supply). Nothing here is computed by the domain layer.

export interface RawQuote {
  price: DataField<number>;
  // Currency is carried as data, not baked into the field name (unlike the
  // existing MarketData.executionPriceEur/primaryPriceUsd) — see §7.
  currency: string;
}

export interface OhlcvBar {
  date: string; // trading date, not a full timestamp
  open: DataField<number>;
  high: DataField<number>;
  low: DataField<number>;
  close: DataField<number>;
  volume: DataField<number>;
}

export interface FxRate {
  from: string;
  to: string;
  rate: DataField<number>;
}

export interface RawMarketData {
  instrumentId: string; // provider-agnostic identifier, not necessarily the UI ticker
  quote: RawQuote;
  ohlcv: OhlcvBar[]; // as much daily history as the provider returns; length is not fixed by this contract
  fx?: FxRate; // present only when execution currency != portfolio base currency
  checkedAt: string; // when this fetch attempt happened, even if everything inside is MISSING
}

// Derived technical signals — spec: docs/phase-c0-market-data-contract.md §5.
// Computed internally from RawMarketData.ohlcv (src/domain/signals/momentum.ts)
// — never accepted as provider-supplied source of truth. Each field is
// independently MISSING when its own required history/fields aren't
// available; never backfilled, extrapolated, or defaulted to a neutral
// value. See momentum.ts's doc comment for exact per-field semantics.
export interface DerivedTechnicalSignals {
  dma50: DataField<number>;
  dma200: DataField<number>;
  rsi: DataField<number>;
  relativeVolume: DataField<number>;
}

// Primary Trend — spec: docs/phase-c5-trend-relative-strength-data-contract.md
// §3. Kept separate from DerivedTechnicalSignals (minimal blast radius on
// that already-shipped type, same reasoning MomentumScoreResult followed in
// Phase C.4). Computed internally from RawMarketData.ohlcv
// (src/domain/signals/trend.ts) — never provider-supplied. This is a raw,
// continuous trend signal; how it maps into a 0-100 momentum sub-score is
// NOT decided by this type or its producer.
export interface DerivedTrendSignal {
  dma200Slope: DataField<number>;
}

// Relative Strength — spec: docs/phase-c5-trend-relative-strength-data-contract.md
// §4. Computed internally from the stock's + a configured benchmark's raw
// OHLCV (src/domain/signals/relative-strength.ts) — never provider-supplied.
// Three states, reusing the existing StrategyAlignment pattern
// (src/domain/portfolio/target-position.ts) rather than inventing a new one:
// NOT_APPLICABLE when no benchmark is configured for the strategy at all
// (distinct from MISSING, which means a benchmark IS configured but this
// window's data didn't align or couldn't be obtained). The MISSING branch
// deliberately carries no partial payload, matching
// MomentumComponentResult's MISSING shape (Phase C.4). This is a raw,
// continuous signal; how `relativeStrength` maps into a 0-100 momentum
// sub-score is NOT decided by this type or its producer.
export type RelativeStrengthData =
  | { status: "NOT_APPLICABLE" }
  | { status: "MISSING" }
  | {
      status: "AVAILABLE";
      benchmarkInstrumentId: string;
      windowTradingDays: number;
      asOf: string; // the window's end date — for freshness evaluation, not stored freshness
      stockReturn: number; // (stockEnd / stockStart) - 1
      benchmarkReturn: number; // (benchmarkEnd / benchmarkStart) - 1
      relativeStrength: number; // stockReturn - benchmarkReturn
    };
