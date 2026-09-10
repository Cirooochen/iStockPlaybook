# Phase C.0 — Market Data Contract Design

Status: **RESOLVED / APPROVED (design only)** — not implemented, not
wired to any provider or application code.

Ran informed by `docs/VALIDATION_PROTOCOL.md`'s spirit (inspect real
code before proposing, classify findings, do not silently expand
scope) even though this is a design deliverable, not a validation
checkpoint — there is nothing to PASS/FAIL yet.

**Revision note (post-review correction):** the original draft stored
a `quality: "FRESH" | "STALE"` tag directly on `DataField<T>`'s
`AVAILABLE` branch. That created two sources of truth — the stored tag
reflected freshness only at write time, while `asOf` stayed fixed, so
the two could silently diverge as time passed with no re-fetch.
Corrected: `DataField<T>` now stores only the raw fact (`value` +
`asOf`, or `MISSING`); freshness is derived on demand by a new pure
`evaluateFreshness` function (§3), never stored. See §2/§3 for the
resolved contract.

Goal: define a **provider-independent** market-data contract for the
Stock Playbook Engine, before any real data provider is chosen. No
external API is called, integrated, or chosen here.

## 1. What was inspected

- `src/types/playbook.ts` — `MarketData`, `Security`, `Scorecard`,
  `ScoreItem`, `Confidence`.
- `src/domain/engine.ts` — `EngineInput`/`EngineOutput` (what the
  deterministic Phase B engine actually consumes today).
- `src/domain/signals/signals.ts` — the current fundamentals/valuation/
  technical pass-through seam.
- `src/config/ruleset-v0.1.ts` — the versioned parameter-registry
  pattern (`RULESET.confidence`, `.concentration`, etc.) already used
  for every other threshold in the engine.
- `docs/playbook-decision-engine-spec-v0.1.md` §4 (FX), §14
  (Technical/Momentum Engine), §16 (HC-004/HC-005), §24 (Confidence),
  §37 (suggested code structure — `signals/momentum.ts`,
  `signals/normalization.ts`, `playbook/confidence.ts`).
- Phase B.5 deferred findings, specifically from
  `docs/validation/b5.6-contradictions-failure-states-report.md` and
  the Phase B.5 Closeout section of
  `docs/phase-b5-algorithm-validation.md`.

**Current state, confirmed by inspection (unchanged by this doc):**

- `MarketData` is a single point-in-time snapshot —
  `{ executionPriceEur, primaryPriceUsd, dailyChangePct, updatedAt }` —
  with **currency baked into the field name** (`...Eur`, `...Usd`)
  rather than carried as data. This does not generalize: a second
  stock whose execution/primary currencies differ from EUR/USD would
  need new field names, not new field values. Flagged in §7 below.
- `EngineInput.executionPriceEur: number` is the **only** market-data
  shaped value the deterministic engine reads. No OHLCV, FX, DMA, RSI,
  or volume data reaches `runDecisionEngine` today, and nothing in
  `deriveStance`/`deriveActionZoneState`/`hard-constraints.ts` reads
  `scorecard.fundamentals`/`valuation`/`momentum` either (confirmed
  repeatedly in B.5.5/B.5.6/B.5.7).
- `signals.ts` is a pure pass-through of a static seed `Scorecard` —
  no formulas, no raw data ingestion.
- No field anywhere in `MarketData`/`Scorecard`/`ScoreItem` is optional
  or nullable — "missing" cannot currently be expressed (B.5.6 finding
  4). `MarketData.updatedAt` exists but nothing reads it (B.5.6 finding
  5). HC-004/HC-005 and `deriveConfidence` do not exist.

This document proposes the contract that closes those gaps
structurally, without implementing the formulas or the constraints
themselves.

## 2. Design principle: missing is a state, not a value

The single most important rule from the brief: **missing data must
never be represented as zero** (or as any other in-range sentinel
value). A `0` RSI, a `0` price, or a `0`-score momentum reading must
never mean "we don't know" — every other engine consumer would read it
as a real, extremely bearish measurement.

Proposed mechanism — every raw or derived market-data field is wrapped
in a small discriminated union instead of being a bare `number`:

```ts
// Illustrative — not implemented. Would live alongside the other
// domain types, e.g. src/types/market-data.ts.

type DataField<T> =
  | { status: "AVAILABLE"; value: T; asOf: string }
  | { status: "MISSING" };
```

- `MISSING` carries no `value` field at all — not `null`, not `0` —
  so a consumer cannot accidentally read a number out of it; TypeScript
  forces a branch on `status` first.
- `AVAILABLE` carries only `value` and `asOf` — **no `quality`/freshness
  field is stored here.** An earlier draft of this document stored a
  `quality: "FRESH" | "STALE"` tag directly on `AVAILABLE`, which
  creates two sources of truth: the stored `quality` reflects freshness
  *at write time*, while `asOf` is a fixed timestamp — the two silently
  diverge the moment time passes without the record being re-fetched
  (a value written as `quality: "FRESH"` at 9:31am is still,
  incorrectly, tagged `"FRESH"` at 6:00pm unless something re-writes
  it). `DataField<T>` therefore stores only the raw fact (`value` +
  `asOf`); freshness is *derived*, never stored — see §3.
- This is a stronger guarantee than a plain `T | undefined`/`T | null`
  (rejected as insufficient in the B.5.6 report): a nullable field
  still lets a careless consumer coalesce `?? 0` or `|| 0`; a
  discriminated union with no numeric branch in the `MISSING` case
  cannot be silently defaulted that way without an explicit, visible
  fallback decision at the call site.

Every field defined in §4 and §5 below uses this wrapper. `MISSING` and
`STALE` are deliberately different states (§3), not collapsed into one
— but note `STALE` is not a `DataField` status at all; it only exists
as an output of the freshness evaluation below.

## 3. Freshness: derived explicitly, never stored

Freshness is a **read-time** computation over a `DataField<T>`, an
`evaluationTime`, and a per-data-type policy — never a field baked into
stored data, and never computed by re-deriving it ad hoc at each call
site (which is exactly how the rejected `quality`-on-`AVAILABLE` design
went stale). One pure function, one result shape, used everywhere a
freshness check is needed:

```ts
// Illustrative — not implemented. Would live alongside DataField<T>,
// e.g. src/domain/market-data/freshness.ts.

interface FreshnessPolicy {
  maxAgeMs: number; // per data type — see point 2 below
}

type FreshnessResult<T> =
  | { status: "MISSING" }
  | { status: "FRESH"; value: T; asOf: string; ageMs: number }
  | { status: "STALE"; value: T; asOf: string; ageMs: number };

function evaluateFreshness<T>(
  field: DataField<T>,
  evaluationTime: string,
  policy: FreshnessPolicy
): FreshnessResult<T> {
  if (field.status === "MISSING") {
    return { status: "MISSING" };
  }
  const ageMs = Date.parse(evaluationTime) - Date.parse(field.asOf);
  return ageMs <= policy.maxAgeMs
    ? { status: "FRESH", value: field.value, asOf: field.asOf, ageMs }
    : { status: "STALE", value: field.value, asOf: field.asOf, ageMs };
}
```

Design properties this preserves, in direct response to the correction:

1. **Single source of truth.** `DataField<T>` stores only the raw fact
   (`value`/`asOf`, or `MISSING`). `evaluateFreshness` is the *only*
   place `FRESH`/`STALE` is ever produced, and it produces that label
   fresh on every call from `asOf` + `evaluationTime` + `policy` — it
   is structurally impossible for a stored freshness tag to go stale,
   because none is stored.
2. **`MISSING` stays distinct from `STALE`.** `evaluateFreshness`
   short-circuits `MISSING` before any age math runs — a field that
   was never returned by the provider can never be misreported as an
   old-but-present value, and `FreshnessResult`'s `MISSING` branch
   carries no `value`/`asOf`/`ageMs`, mirroring `DataField`'s own
   `MISSING` shape.
3. **`evaluationTime` is an explicit parameter, never an ambient
   clock.** Every other domain function in this codebase is pure and
   deterministic (no `Date.now()`, no ambient state) — this function
   follows the same rule, both for testability and because the
   Workflow/session tooling in this project already treats ambient
   "now" reads as a correctness hazard. Whatever layer requests a
   freshness check supplies `evaluationTime`.
4. **`FreshnessPolicy` is keyed per data type/category, not a single
   global constant.** An intraday quote, a daily OHLCV close, an FX
   rate, and a fundamentals filing all have structurally different
   natural staleness windows. Following the existing `RULESET` pattern
   (`RULESET.confidence`, `.concentration`, etc. — see
   `src/config/ruleset-v0.1.ts`), these policies would live as a new,
   versioned `RULESET.marketData.freshness` map keyed by data type
   (e.g. one `FreshnessPolicy` for quotes, a longer one for OHLCV daily
   bars, a longer one still for FX), **not hardcoded in application
   code**, and passed into `evaluateFreshness` by the caller.
5. **Provider-independent.** `evaluateFreshness` reads only
   `DataField`/`evaluationTime`/`policy` — nothing about a specific
   provider's latency, feed type, or delay characteristics is baked
   into the function itself; that variability lives entirely in which
   `FreshnessPolicy` a caller supplies.

The actual `maxAgeMs` threshold values are explicitly **not chosen in
this document** — see Open Design Questions (§11). They are
provider-latency dependent (e.g., real-time vs. 15-minute-delayed
feeds have structurally different "acceptable age"), and choosing them
now would be exactly the "provider-specific behavior" this checkpoint
was told not to invent.

## 4. Raw market data contract

Everything in this section is data a provider supplies (or fails to
supply) — nothing here is computed by the domain layer.

```ts
// Illustrative — not implemented.

interface RawQuote {
  price: DataField<number>;
  currency: string; // always required — see §6; a quote with no known currency is not a quote
}

interface OhlcvBar {
  date: string; // trading date, not a full timestamp
  open: DataField<number>;
  high: DataField<number>;
  low: DataField<number>;
  close: DataField<number>;
  volume: DataField<number>;
}

interface FxRate {
  from: string;
  to: string;
  rate: DataField<number>;
}

interface RawMarketData {
  instrumentId: string; // provider-agnostic identifier, not necessarily the UI ticker
  quote: RawQuote;
  ohlcv: OhlcvBar[]; // as much daily history as the provider returns; length is not fixed here (see §11)
  fx?: FxRate; // present only when execution currency != portfolio base currency
  checkedAt: string; // when this fetch attempt happened, even if everything inside is MISSING
}
```

Notes:

- `checkedAt` is required and separate from any individual field's
  `asOf` — it is what lets a caller distinguish "we asked and got
  nothing" from "we never asked." A wholly-MISSING `RawMarketData` is
  still a meaningful, loggable fact.
- `ohlcv` is a raw series, not a fixed-length window — see §9 for why
  the exact history depth needed is not decided here.
- `fx` is optional at the top level (no FX conversion needed when
  execution currency already equals the portfolio's base currency),
  but once present its `rate` field still uses `DataField<number>` —
  an FX feed can itself be missing or stale independent of the price
  feed (per spec §4, "every FX value requires a timestamp").

## 5. Derived technical signals contract

These are **never raw input** — they are computed internally from
`RawMarketData.ohlcv` by the domain layer (spec §37's suggested
`signals/momentum.ts`). A provider that happens to also return
pre-computed indicators is not trusted as the source of truth here,
so that every stock's indicators are computed by the same formula
regardless of provider — the same reasoning already applied to
fundamentals/valuation normalization in spec §11–§13.

```ts
// Illustrative — not implemented. Formulas are explicitly out of
// scope for this document (see §8).

interface DerivedTechnicalSignals {
  dma50: DataField<number>;
  dma200: DataField<number>;
  rsi: DataField<number>;
  relativeVolume: DataField<number>;
}
```

Each field is independently `MISSING` when the underlying `ohlcv`
series does not contain enough history to compute it (e.g., `dma200`
needs materially more trading days of `close` data than `dma50` does)
— never backfilled, extrapolated, or defaulted to a neutral value.
Exactly how much history each indicator needs is a formula parameter
decided when the formulas themselves are implemented (Phase C.1+, not
here) — see §9.

## 6. Required vs. optional fields

| Field | Required? | Notes |
|---|---|---|
| `RawMarketData.instrumentId` | **Required** | Every fetch attempt needs a subject, even a failed one. |
| `RawMarketData.checkedAt` | **Required** | Needed even when every other field is MISSING. |
| `RawQuote.currency` | **Required** | A price with no known currency cannot be converted or displayed; treat as a fetch failure at a higher level, not a currency-less quote. |
| `RawQuote.price` | Optional (`DataField`) | Can be MISSING (feed down, instrument not covered); when AVAILABLE, its freshness (FRESH/STALE) is derived via `evaluateFreshness` (§3), not stored on the field itself. |
| `OhlcvBar.*` (open/high/low/close/volume) | Optional (`DataField`), per bar, per field | A single bar can have a known close but missing volume, etc. — each field wrapped independently, not the whole bar. |
| `RawMarketData.fx` | Optional (whole block) | Absent entirely when no conversion is needed; present-with-MISSING-rate when conversion is needed but the rate couldn't be fetched. |
| `DerivedTechnicalSignals.*` | Optional (`DataField`), per indicator | Independently MISSING per indicator based on available history — never all-or-nothing. |

## 7. Currency: a correction this contract makes over the current type

`MarketData`'s existing `executionPriceEur`/`primaryPriceUsd` naming
bakes currency into the field name. `RawQuote` above instead carries
`currency` as data (`{ price, currency: "USD" }`), matching how
`Security.marketCurrency`/`executionCurrency` are already modeled as
data, not field-name suffixes. This is a **structural observation
about the existing type, not a code change** — `types/playbook.ts` is
untouched by this document; if/when this contract is implemented, it
would coexist alongside (or eventually replace) `MarketData`, which is
a separate decision (§11).

## 8. What the Decision Engine actually needs vs. what stays outside `EngineInput`

Re-confirming the B.5.5/B.5.6/B.5.7 finding directly against this
contract: the deterministic Phase B engine (`runDecisionEngine`) needs
exactly **one** market-data-shaped value — a single resolved price
number in the portfolio's base currency, already FX-converted, already
selected from whatever raw data existed. Everything else in §4–§5
stays **outside** `EngineInput`:

| Stays outside `EngineInput` | Where it lives instead |
|---|---|
| `RawMarketData` (quote, OHLCV, FX, `checkedAt`) | A new market-data layer, upstream of the engine boundary — resolves raw provider data into the one number the engine needs. |
| `DerivedTechnicalSignals` (DMA/RSI/relative volume) | `src/domain/signals/momentum.ts` (spec §37) — feeds `Scorecard.momentum` eventually, not the engine directly. |
| `FreshnessResult` output (from `evaluateFreshness`, §3) | Same market-data/signals layer, computed on demand — never stored. Only if/when HC-004 is implemented would some freshness result need to cross into `EngineInput` or a future confidence input — not decided here (§11). |
| FX rates and raw currency conversion | Resolved before the engine boundary — consistent with how `executionPriceEur` is already a pre-resolved number today, not a raw USD amount plus a separate FX rate. |

`EngineInput.executionPriceEur` itself is **not changed** by this
document — it remains a bare `number`. Whether it should eventually
become `DataField<number>`-shaped (so a future HC-004 could evaluate
its freshness via `evaluateFreshness`) is an open question deferred to
whenever HC-004 is actually designed, not decided now (§11) — this
document explicitly does not change existing Phase B behavior or
types.

## 9. Where `signals.ts` should evolve

No change made here. Recommended future direction, for when Phase C.1
implements real formulas:

- Today: `deriveTechnicalScore(scorecard) => scorecard.momentum` — a
  trivial pass-through of a pre-baked `ScoreItem`.
- Future: `deriveTechnicalScore` would instead consume
  `DerivedTechnicalSignals` (§5) and produce either a real `ScoreItem`
  (when enough of the underlying indicators are `AVAILABLE`) or an
  explicit "insufficient data" result — never silently averaging
  MISSING fields into a mid-range score. This split mirrors spec §37's
  suggested `signals/momentum.ts` (raw OHLCV → DMA/RSI/relative
  volume) feeding `signals/normalization.ts` (bounded continuous
  normalization, same pattern as spec §11's revenue-growth anchors)
  feeding `signals.ts`'s `deriveTechnicalScore`.
- `deriveFundamentalsScore`/`deriveValuationScore` would eventually
  need an analogous raw-data contract (fundamentals filings, valuation
  multiples) — explicitly **out of scope** for this document, which
  covers market/technical data only. Worth a separate, equally-scoped
  design pass before Phase C.1 touches those two functions.

## 10. Explicit non-goals of this document

Per the task brief, none of the following are done here:

- No API provider chosen, evaluated, or called.
- No technical-indicator formulas implemented (DMA/RSI/relative-volume
  math, lookback windows, and normalization anchors are all Phase C.1+
  work).
- HC-004/HC-005 not implemented — this contract makes them
  *implementable* (by giving staleness/absence a real representation)
  without implementing them.
- Confidence scoring (spec §24) not implemented — same relationship as
  HC-004/HC-005.
- No existing Phase B type, rule, or test changed. `MarketData`,
  `EngineInput`, `Scorecard`, and every already-validated B.5 behavior
  are untouched.

## 11. Open design questions

Not resolved here — candidates for the next design/decision step:

1. **Staleness thresholds per data type** (§3) — not chosen; depends
   on which provider(s) are eventually selected and their latency
   characteristics.
2. **Should `EngineInput`'s price ever become `DataField`-shaped** (so
   a future HC-004 could run `evaluateFreshness` on it) (§8)? Only
   relevant once HC-004 is actually designed — premature to decide
   before that.
3. **Where should these new types physically live** —
   `src/types/market-data.ts` (parallel to `types/playbook.ts`) is the
   natural fit by existing convention, but not committed to here.
4. **Required OHLCV history depth** (§5) — 200DMA needs materially more
   history than 50DMA/RSI/relative-volume; the exact lookback windows
   are formula parameters that belong in a future
   `RULESET.technical`-style config once Phase C.1 implements them, not
   fixed in this contract.
5. **Relationship to `MarketData` (existing type)** — whether
   `RawMarketData`/`DataField` eventually replaces `MarketData` or
   coexists alongside it (`MarketData` continuing to serve display-only
   UI needs, e.g. `StockHeader`'s dual-market price) is a separate
   decision, not made here.
6. **Fundamentals/valuation raw-data contract** — this document
   intentionally covers market/technical data only (§9); an equivalent
   contract for fundamentals and valuation inputs is a distinct future
   design pass.

## 12. Recommended next step

Not started here, per instruction. A natural Phase C.1 candidate would
be implementing `DataField<T>` and `evaluateFreshness` as real, tested
domain types and functions (still provider-independent — synthetic
`DataField`/OHLCV fixtures and hand-picked `evaluationTime`/`policy`
values, no live API), before any provider integration is attempted.
Provider selection itself should follow, not precede, that.
