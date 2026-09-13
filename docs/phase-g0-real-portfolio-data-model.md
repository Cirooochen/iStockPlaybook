# Phase G.0 — Real Portfolio Data Model (Design)

Status: **design only, not implemented**. Source brief: `docs/REAL_PORTFOLIO_MODEL_BRIEF.md`.

## 0. Current state (what exists today)

This section is the factual baseline the design below reacts to. Every
claim here was verified directly against the current source.

**Two independently-authored data sources, not one.**
`src/data/unity-seed.ts` exports `unitySeed: StockSeed` (one stock, one
`Position`) and `src/data/portfolio-seed.ts` exports `portfolioSeed:
Portfolio` (a 5-entry `holdings` array: Unity, ASML, an ETF, Bitcoin, and
an "Other positions" catch-all). The two Unity entries currently agree
by hand-typed coincidence — nothing enforces that. `portfolioSeed.totalValueEur
= 62280` is likewise a typed literal that happens to equal the sum of
the five holdings' `valueEur`, not a computed sum.

**`src/types/playbook.ts` today:**
```ts
export interface Security {
  name: string; ticker: string; exchange: string;
  marketCurrency: string; isin?: string; executionCurrency?: string;
}
export interface MarketData {
  executionPriceEur: number; primaryPriceUsd: number;
  dailyChangePct: number; updatedAt: string;
}
export interface Position {
  shares: number; averageCostEur: number; valueEur: number;
  unrealizedReturnPct: number; portfolioWeightPct: number;
}
export interface PortfolioHolding {
  security: Security; market: MarketData; position: Position;
  playbookStance: Stance; playbookReason: string;
  attentionState: "ACTION" | "WATCH" | "STABLE" | "UPDATE_NEEDED";
}
export interface Portfolio {
  totalValueEur: number; unrealizedReturnEur: number;
  unrealizedReturnPct: number; updatedAt: string;
  holdings: PortfolioHolding[];
}
```
`Position`'s three derived-looking fields (`valueEur`, `unrealizedReturnPct`,
`portfolioWeightPct`) are **plain stored numbers**, correct only as of
whenever `applyBuy`/`applySell` last ran (or whatever the seed hand-typed).
Nothing recomputes them on read. There is **no `Transaction` type** —
`TimelineEntry.summary` is a free-text string (`"BUY — 50 shares @
€31.40"`) with no structured shares/price fields.

**No cash concept exists anywhere.** `src/domain/portfolio/accounting.ts`
documents this as a deliberate placeholder:
> "Cash is implicit inside portfolioTotalEur — there is no separate cash
> ledger during Phase B.5... BUY transactions are assumed to be funded
> from existing portfolio cash."

`calcPortfolioTotalAfterBuy`/`calcPortfolioTotalAfterSell` are literally
identity functions (`return oldTotalPortfolioEur`). The seed's "Other
positions" row is the closest thing to a cash bucket today, but it's
typed as an ordinary holding with `shares: 0, executionPriceEur: 0,
averageCostEur: 0` — a live **`MISSING != 0` violation already present
in seed data**: those zeros mean "not tracked here," not "actually
zero," and nothing distinguishes the two.

**No `AssetType` discriminator exists.** `portfolioSeed.holdings` already
contains a stock, an ETF, crypto, and a catch-all — proving the *display*
layer tolerates variety — but all five are the same `PortfolioHolding`
shape. `Position.shares: 0.087` (Bitcoin) works only because `shares:
number` isn't integer-constrained, not because of any crypto-aware
logic. Grep for `AssetType`/`Holding`-as-discriminator across `src/`:
zero results. This is greenfield.

**Concentration math takes raw numbers, not objects.**
`classifyConcentration(weightPct: number, targetMaxPct: number)`
(`src/domain/portfolio/concentration.ts`) never divides value by a
total itself — it consumes an already-computed weight. Thresholds
(`RULESET.concentration`: `moderateMultiplier: 1.15, severeMultiplier:
1.30`) are applied against `Strategy.mediumTermTargetMaxPct`, a
single-stock-strategy field. There is no multi-position aggregate
concentration check today.

**Transaction accounting today** (`accounting.ts`'s `applyBuy`/`applySell`,
called from `PlaybookClientShell.handleTransaction`): shares/avgCost/value/
weight/return recomputed from `Position` + a flat `portfolioTotalEur`
passed in by the caller; the portfolio total itself never changes
(cash absorbs the difference implicitly, untracked). Only one position
(Unity) is ever run through this pipeline — sibling holdings in
`portfolioSeed.holdings` are static and never re-weighted after a
transaction, so they silently drift out of sync with the total.

**`src/domain/engine.ts`'s `EngineInput`** (unchanged by this design):
```ts
export interface EngineInput {
  position: Position;
  portfolioTotalEur: number;
  executionPriceEur: number;
  strategy: Strategy;
  thesisHealth: ThesisHealth;
  scorecard: Scorecard;
  actionZoneTemplates: ActionZone[];
  momentumResult?: MomentumScoreResult;
  fundamentalsResult?: FundamentalsScoreResult;
}
```
Single `Position`, single `Strategy`, a bare `portfolioTotalEur: number`
supplied by the caller. `src/app/stocks/[ticker]/page.tsx` passes
`initialPortfolioTotalEur={portfolioSeed.totalValueEur}` — the flat
literal, not anything derived from `unitySeed.position` or the other
four holdings. `src/components/portfolio/ConcentrationOverview.tsx`
compounds this: it receives `portfolio: Portfolio` as a prop but
**ignores it** (`{ portfolio: _ }`), reading a third, separately
hardcoded `concentrationData` array and its own hardcoded `maxTarget =
45` instead. Three independent copies of numbers that should be one.

**FX: two disconnected systems, no live conversion.** `MarketData`
bakes currency into field names (`executionPriceEur`/`primaryPriceUsd`)
as two independently hand-typed seed numbers — no function converts
one from the other. A newer, real `FxRate`/`DataField<T>` contract
already exists in `src/types/market-data.ts` (Phase C0), feeding only
the momentum pipeline today; nothing connects it to `Position`/`Portfolio`.

**Provider coupling: clean.** Neither `src/types/**` nor `src/domain/**`
import from `src/infrastructure/**` anywhere. `market-data.ts`'s own
`RawQuote` already carries currency as data (`price: DataField<number>;
currency: string`) rather than baking it into a field name, specifically
to avoid `MarketData`'s pattern (see its comment at line 18-19). This
is the convention the new model follows — extending an already-isolated
layer, not fighting existing leakage.

---

## 1. Recommended model

Additive: new types live alongside `Position`/`Strategy`/`Playbook`,
which are **unchanged** — they remain the Stock Playbook Engine's
contract (`EngineInput` is not touched by this design; see §1.5).

### 1.1 Asset type and instrument identity

```ts
export type AssetType = "CASH" | "STOCK" | "ETF" | "CRYPTO" | "OTHER";

export interface InstrumentIdentity {
  // Provider-agnostic identifier, same convention as
  // RawMarketData.instrumentId — never a raw provider symbol.
  id: string;
  assetType: AssetType;
  name: string;
  // Absent for CASH; may be absent for OTHER.
  ticker?: string;
  exchange?: string;
  isin?: string;
  // The instrument's own currency — was "marketCurrency". For CASH,
  // this IS the holding's denomination (e.g. a EUR cash holding has
  // nativeCurrency: "EUR" and no ticker/exchange).
  nativeCurrency: string;
}
```

One `AssetType` union, matching the brief's own single list (§1, §14)
rather than a structurally separate cash concept — cash is a holding
like any other, with `assetType: "CASH"` as a degenerate case (see 1.2).
This also directly fixes the seed's `MISSING != 0` violation: a real
`CASH` holding replaces "Other positions"'s zeroed-out stock-shaped row.

### 1.2 Holding — stored, provider-independent

```ts
export type CostBasis =
  | { status: "AVAILABLE"; averageCostNative: number; asOf: string }
  | { status: "MISSING" }       // cost history unknown (e.g. migrated data)
  | { status: "NOT_APPLICABLE" }; // CASH only — cash has no cost basis
                                   // by definition, not an unknown one.
                                   // Same three-state pattern
                                   // RelativeStrengthData already uses.

export interface Holding {
  id: string;
  instrument: InstrumentIdentity;
  // Shares/units for STOCK/ETF/CRYPTO; the cash amount itself (in
  // nativeCurrency) for CASH — cash has no separate "price", it IS the
  // value. Never share-count-shaped for CASH.
  quantity: number;
  costBasis: CostBasis; // per-unit, in instrument.nativeCurrency
}
```

A `Holding` describes only ownership — what, how much, at what cost.
It carries no `Strategy`/`Playbook` field. See §1.2b for how "how a
supported stock is managed" attaches instead.

### 1.2b Ownership boundary: Holdings vs. Stock Playbook configuration

**Portfolio Holdings describe what the user owns. Stock Strategy/Playbook
describes how a supported stock is managed.** These are linked through
instrument identity, not through one owning the other:

```ts
// Exists independently of current ownership — a Strategy/Playbook can be
// configured for a stock the user holds zero shares of (thesis research
// ahead of a first buy), and a STOCK Holding can exist with no config yet
// (owned, but not onboarded into the Playbook). Embedding Strategy/
// Playbook on Holding would have made both cases unrepresentable.
export interface StockPlaybookConfig {
  instrumentId: string; // = InstrumentIdentity.id — a join key, not a Holding id
  strategy: Strategy;
  playbook: Playbook;
}
```

The "only STOCK supports the Playbook" rule (brief §1, §14) is enforced
where a `StockPlaybookConfig` is constructed (reject a non-STOCK
`instrumentId`), the same way `resolveCoreShareRange` already rejects
an invalid `Strategy` pairing today rather than the type system
preventing it structurally — precedent already established in this
codebase, not a new pattern. Resolving "does this holding have a
Playbook" is a lookup by `instrument.id`, not a field read:
```ts
const config = stockPlaybookConfigs.find(c => c.instrumentId === holding.instrument.id);
```

### 1.3 Pricing boundary — reused, not reinvented

Holdings never embed a quote provider (brief §9, §15). Pricing reuses
the existing provider-independent contract from `src/types/market-data.ts`
verbatim — `RawQuote` and `FxRate` already are `DataField<T>`-based and
provider-agnostic:
```ts
// already exists, unchanged:
export interface RawQuote { price: DataField<number>; currency: string; }
export interface FxRate { from: string; to: string; rate: DataField<number>; }
```
A holding's live quote is looked up by `instrument.id`, supplied by the
caller (a future orchestration layer, symmetric to today's
`fetchLiveMomentumResult`/`fetchLiveFundamentalsResult`) — **out of
scope for G.0**, which defines only the boundary: domain snapshot
derivation takes quotes/FX as pure inputs, never fetches them itself.
CASH needs no quote lookup at all — its value is its `quantity`, always.

### 1.4 Portfolio Snapshot — the one derived source of truth

```ts
export interface HoldingSnapshot {
  holdingId: string;
  instrument: InstrumentIdentity;
  quantity: number;
  priceNative: DataField<number>; // CASH: not looked up — treat as N/A upstream, valueBase uses quantity directly
  valueBase: DataField<number>;   // this holding's OWN known value; MISSING if priceNative MISSING, or FX needed and MISSING (never 0, never stale)
  costBasisBase: DataField<number> | { status: "NOT_APPLICABLE" }; // MISSING if costBasis is MISSING or FX needed and MISSING; NOT_APPLICABLE (cash) — never 0-that-looks-earned
  unrealizedPnlBase: DataField<number> | { status: "NOT_APPLICABLE" };
  unrealizedReturnPct: DataField<number> | { status: "NOT_APPLICABLE" };
}
```

Deliberately **no `weightPct` field here.** A weight is only ever
authoritative relative to a whole-portfolio total, and per §2 that
total is not always trustworthy — see the valuation-state model below.

```ts
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
      // Deliberately NOT named totalValueBase — this is a sum of only the
      // AVAILABLE holdings, never presentable as "Portfolio Total" (§2).
      knownValueBase: number;
      excludedHoldingIds: string[]; // holdings whose value couldn't be established
    }
  | { state: "UNAVAILABLE" };

export interface PortfolioSnapshot {
  asOf: string;
  baseCurrency: string; // "EUR" for v0.1 — brief §8
  holdings: HoldingSnapshot[];
  valuation: PortfolioValuation;
}
```

`derivePortfolioSnapshot(holdings: Holding[], quotes: Map<string,
RawQuote>, fxRates: Map<string, FxRate>, baseCurrency: string, asOf:
string): PortfolioSnapshot` is a pure function — same inputs, same
output, no I/O, matching every existing domain function in this
codebase. `valuation.state` is classified directly from how many
holdings resolved a `valueBase`:
```ts
function classifyValuation(holdings: HoldingSnapshot[]): "COMPLETE" | "PARTIAL" | "UNAVAILABLE" {
  if (holdings.length === 0) return "COMPLETE"; // an empty portfolio is fully known, not unavailable
  const known = holdings.filter(h => h.valueBase.status === "AVAILABLE");
  if (known.length === holdings.length) return "COMPLETE";
  if (known.length === 0) return "UNAVAILABLE";
  return "PARTIAL";
}
```
This is what `portfolioTotalEur` (brief §2: "should eventually become a
derived Portfolio output rather than an independently maintained
input") becomes: `valuation.totalValueBase`, computed and only present
at all in the `COMPLETE` branch — not a literal typed in a seed file,
and not obtainable except when the whole portfolio actually priced.

**Authoritative weight is a function of `(holding, valuation)`, not a
stored field, and it refuses outside `COMPLETE`:**
```ts
function holdingWeightPct(holding: HoldingSnapshot, valuation: PortfolioValuation): number | null {
  if (valuation.state !== "COMPLETE") return null;
  if (holding.valueBase.status !== "AVAILABLE") return null;
  return (holding.valueBase.value / valuation.totalValueBase) * 100;
}
```
Concentration classification (`classifyConcentration`) consumes this
function's output, never `PortfolioValuation.knownValueBase` directly —
so "do not calculate authoritative... concentration from the partial
denominator" is enforced structurally: there is no code path that can
hand `classifyConcentration` a weight while `state !== "COMPLETE"`,
because `holdingWeightPct` itself returns `null` first. It runs only
for a holding with a linked `StockPlaybookConfig` (§1.2b) — an
instrument-identity join, not a field read — exactly mirroring how it
consumes `Position.portfolioWeightPct` today, just fed a computed,
state-gated input instead of a stored one. Generic per-holding
`valueBase` (portfolio allocation display, no target/threshold) is
available for every asset type regardless of overall valuation state,
per brief §1 — it's specifically the *weight* (a ratio against a
possibly-incomplete whole) that the state gates, not the holding's own
known value.

### 1.5 Relationship to the Stock Position Engine — unchanged, adapted

Per brief §7 ("preserve unless demonstrated need to change") and this
project's standing no-engine-changes-without-approval rule, `Position`
and `EngineInput` are **not modified**. A small adapter bridges the new
model to the existing engine boundary:

```ts
function toStockEngineInputs(
  snapshot: PortfolioSnapshot,
  holdingId: string,
  config: StockPlaybookConfig // resolved by the caller via instrument.id (§1.2b), not embedded in the Holding
): { position: Position; portfolioTotalEur: number; strategy: Strategy } | null
```

Returns `null` — never a fabricated `Position`, and never a partial or
best-effort total — whenever any of the following hold: the holding's
own `valueBase`/`costBasisBase` aren't `AVAILABLE`; `snapshot.valuation.state
!== "COMPLETE"`; or `holdingWeightPct` (§1.4) returns `null` for this
holding. **This is the fail-safe half of the principle this design
resolves on: Portfolio presentation may fail-soft (§2 — PARTIAL still
shows something), but decision logic must fail-safe (this adapter never
does).** A `PARTIAL` valuation is a perfectly normal, displayable
Portfolio-page state; it is never an acceptable `EngineInput` source,
regardless of whether the STOCK holding itself happens to be one of the
priced ones — an unrelated unpriced ETF or crypto holding still blocks
the Playbook, because the *portfolio total* (the concentration
denominator) is what's compromised, not just one holding's own display
value. The caller (the stock page) treats `null` as "Playbook can't be
computed right now," an honest state, not a silent fallback. This is
the one place `Position`'s always-a-number fields meet the new model's
`DataField<number>`/state-gated fields — the adapter is exactly where
that conversion happens, once, instead of leaking optionality into the
engine or fabricating numbers to satisfy `Position`'s required fields.

### 1.6 Transactions — a real record, still holding-level mutation

```ts
export interface Transaction {
  id: string;
  holdingId: string;       // the security/ETF/crypto holding (never CASH)
  type: "BUY" | "SELL";
  quantity: number;
  priceBase: number;       // per-unit, in portfolio base currency, at execution
  executedAt: string;
}
```

`applyBuy`/`applySell` (unchanged formulas — weighted-average cost on
BUY, unchanged average cost on SELL, `r2` rounding) now operate on a
**pair** of holdings — the security and one base-currency `CASH`
holding — instead of a `Position` plus an untouched flat total:
- BUY: `cash.quantity -= quantity * priceBase`; security `quantity`
  and `costBasis` update via the existing formula.
- SELL: inverse; `cash.quantity += quantity * priceBase`.
- Both produce one appended `Transaction` record.

This makes today's comment-only invariant ("BUY/SELL leave the
portfolio total unchanged") a **real, checkable property** of two
holdings changing together, rather than an identity function standing
in for untracked cash. `Transaction` is additive/audit-trail — it
records what happened for the timeline and for future CSV/broker
import (brief §13) — but `Holding.quantity`/`costBasis` remain the
authoritative, directly-mutated fields (same operational shape as
today's `applyBuy`/`applySell`), not a ledger-replay projection. A
full replay-sourced model is more general but is exactly the kind of
premature generalization §15 warns against for v0.1; `Transaction`'s
shape (`holdingId`, `quantity`, `priceBase`, `executedAt`) already
carries enough information to support replay later as a non-breaking
addition, so this isn't a dead end — it's deferred, not foreclosed.

v0.1 transactions are recorded directly in `baseCurrency` terms (same
simplification already implicit today — `TransactionInput.priceEur`
is used as-is, with no FX step). True native-currency transaction
recording is future scope per brief §8 ("do not choose a new FX
provider during G.0 unless required").

### 1.7 Missing data — dictated directly by brief §11, not a judgment call

- A `MISSING` price never contributes `0` to `valueBase` — the holding
  is excluded from sums, never zeroed (see §2 for what that does to
  totals).
- A `MISSING` FX rate never falls back to 1:1 — same treatment as a
  missing price.
- `CostBasis: NOT_APPLICABLE` (cash) is structurally distinct from
  `MISSING` (unknown cost for a non-cash holding) — a snapshot must
  never report cash as having "no gain" via the same code path that
  means "we don't know."

---

## 2. Portfolio valuation states (resolved 2026-09-14)

Previously flagged as MODEL DECISION REQUIRED (brief §11: "G.0 must
define how incomplete pricing affects totals and weights... surface
MODEL DECISION REQUIRED rather than silently choosing a misleading
fallback"). Resolved as: **Option B, refined** — partial valuation may
be presented, but decision inputs stay strict. `PortfolioValuation`
(§1.4) has exactly three states:

- **COMPLETE** — every holding resolved a `valueBase`. Full
  `totalValueBase`/weights are derivable. The Stock Playbook may
  consume `portfolioTotal`/concentration inputs (§1.5).
- **PARTIAL** — at least one holding resolved, at least one didn't.
  Portfolio UI/domain may expose the known-valued holdings and
  `knownValueBase`, explicitly marked incomplete (`excludedHoldingIds`
  is always present alongside it — a screen that shows
  `knownValueBase` without also surfacing that list has reintroduced
  the silently-misleading fallback the brief warns against). This
  number is never labeled or treated as "Portfolio Total," and no
  `holdingWeightPct`/concentration is calculated from it — enforced by
  `holdingWeightPct` returning `null` outside `COMPLETE` (§1.4), not
  left as a convention to remember at each call site.
- **UNAVAILABLE** — zero holdings resolved a value (a portfolio with
  *no* holdings is `COMPLETE` with `totalValueBase: 0`, not this state
  — `UNAVAILABLE` specifically means valuation was attempted for
  existing holdings and none succeeded). No portfolio-derived Playbook
  inputs at all.

**Principle: Portfolio presentation may fail-soft. Decision logic must
fail-safe.** Concretely: `toStockEngineInputs` (§1.5) returns `null`
for both `PARTIAL` and `UNAVAILABLE` — a partial total is exactly as
unfit to feed the Decision Engine as no total at all, even when the
STOCK holding itself happens to be one of the ones that priced
correctly, because what's compromised is the *denominator*
(`portfolioTotalEur`), not any one holding's own value. The Portfolio
page, by contrast, is expected to render something useful in all three
states — `COMPLETE` shows the real total, `PARTIAL` shows known value
plus an explicit "incomplete" state naming what's excluded, and
`UNAVAILABLE` shows an honest empty/error state — never blocking the
whole page the way the engine adapter is allowed to block the whole
Playbook.

---

## 3. Migration impact

**Additive first, breaking second — nothing above requires deleting
`Position`/`Strategy`/`Playbook`/`EngineInput` in the same pass.**

1. Add the new types (§1.1–§1.6) alongside existing ones in
   `src/types/`. No existing type is edited in this step.
2. Add `derivePortfolioSnapshot`, the holding-pair `applyBuy`/`applySell`,
   and `toStockEngineInputs` as new pure functions in
   `src/domain/portfolio/` (or a new sibling module) — existing
   `accounting.ts`/`concentration.ts`/`target-position.ts` functions
   are reused, not rewritten, wherever their signatures already fit
   (e.g. `classifyConcentration`, `calcTrimSizing` take the same
   `weightPct`/`targetMaxPct` shape either way).
3. Replace `unity-seed.ts` + `portfolio-seed.ts`'s duplicated
   position data with **two** seeds, matching the §1.2b ownership
   split: `holdings-seed.ts` (a `Holding[]` including a real `CASH`
   holding replacing the zeroed-out "Other positions" row, and the
   four existing non-cash holdings, each migrated field-for-field —
   `shares`→`quantity`, `averageCostEur`→`costBasis.averageCostNative`,
   etc.) and `stock-playbook-seed.ts` (a `StockPlaybookConfig[]`,
   today just Unity's `strategy`/`playbook`, joined to
   `holdings-seed.ts`'s Unity holding by `instrument.id` rather than
   embedded in it). This eliminates the two-file drift risk documented
   in §0 — there is exactly one holdings seed a `PortfolioSnapshot` is
   derived from, consumed by both the Portfolio page and the stock
   page.
4. `src/app/stocks/[ticker]/page.tsx` computes a `PortfolioSnapshot`
   once, resolves Unity's `StockPlaybookConfig` by `instrument.id`,
   calls `toStockEngineInputs(snapshot, unityHoldingId, config)`, and
   passes its `position`/`portfolioTotalEur`/`strategy` into
   `PlaybookClientShell` exactly as it does today —
   `PlaybookClientShell`/`runDecisionEngine` need **no changes**. If
   `toStockEngineInputs` returns `null` (§1.5/§2 — `PARTIAL` or
   `UNAVAILABLE` valuation), the page renders an honest "Playbook
   unavailable — portfolio valuation incomplete" state instead of the
   shell, rather than passing a partial or fabricated total through.
5. `ConcentrationOverview.tsx` stops ignoring its `portfolio` prop and
   stops reading the separately-hardcoded `concentrationData` array and
   `maxTarget = 45` literal (§0) — both come from the same
   `PortfolioSnapshot` and the linked `StockPlaybookConfig.strategy
   .mediumTermTargetMaxPct` (§1.2b), resolved by instrument identity,
   not read off the holding itself. This is a real prop-shape change
   for that component (and likely `HoldingsTable.tsx`, not audited in
   this pass) — exact prop diffs are implementation work, not G.0
   design scope, but should be expected.
6. `AddTransactionModal`/`PlaybookClientShell.handleTransaction` switch
   from `applyBuy(Position, ...)` to the holding-pair transaction
   function and append a `Transaction` record to a new
   portfolio-level transaction list. `TimelineEntry` continues to exist
   for the human-readable log; it can now be generated from
   `Transaction` records instead of being hand-authored, but that's an
   optional follow-on, not required for G.0's scope.
7. **Breaking, deferred to a later phase**: once every consumer reads
   from `PortfolioSnapshot`/`Holding[]`, the old `Portfolio`/
   `PortfolioHolding` types can be retired. Do this only after step 5's
   consumers are migrated — not in the same pass, per the brief's own
   "additive migration" guardrail (§15).

**Not affected by this design at all**: `src/domain/engine.ts`,
`src/domain/playbook/**`, `src/domain/signals/**`, `src/domain/thesis/**`,
the momentum/fundamentals live-data orchestration, and every existing
test covering them.
