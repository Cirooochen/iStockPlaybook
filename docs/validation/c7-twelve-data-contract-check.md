# Phase C.7 — Twelve Data Provider Contract Check

Status: ANALYSIS / DESIGN ONLY — no adapter implemented, no network
fetching performed, no API key used or added anywhere.

Ran informed by `docs/VALIDATION_PROTOCOL.md`'s spirit — verify against
real, current provider documentation rather than assuming a shape, and
classify findings rather than silently deciding an adapter design. Our
contract (`docs/phase-c0-market-data-contract.md`, `src/types/market-
data.ts`) is the source of truth throughout; nothing here proposes
changing `RawQuote`/`OhlcvBar`/`FxRate`/`RawMarketData`/`DataField<T>` to
match Twelve Data.

## Method

Fetched Twelve Data's public OpenAPI specification
(`https://api.twelvedata.com/doc/swagger/openapi.json`, ~3.4MB, no
authentication required to read the schema itself) and inspected it
directly with `jq` for the exact response schemas of `/quote`,
`/time_series`, and `/exchange_rate`, plus their query parameters, enums,
and error-response shape. Cross-checked against Twelve Data's public
docs/pricing pages for plan-level access and rate limits. **No
authenticated request was made** — `GET /exchange_rate?symbol=EUR/USD`
without a key correctly returned `401 Unauthorized`, confirming the live
endpoints do require a key (not added here, per instruction). Everything
below is schema-level, not a live data sample.

## 1. Current/daily price → `RawQuote`

Source: `/quote` endpoint (`GetQuote_200_response` schema).

| Twelve Data field | Transform | Our field |
|---|---|---|
| `close` (**string**, e.g. `"148.85001"`) | `parseFloat`, wrap `{status:"AVAILABLE", value, asOf}` | `RawQuote.price.value` |
| `datetime` (string) or `timestamp` (Unix seconds, int) | prefer `datetime` if present and already date/ISO-shaped; else convert `timestamp` (seconds) → ISO 8601 string | `RawQuote.price.asOf` |
| `currency` (string, e.g. `"USD"`) | pass through directly | `RawQuote.currency` |
| *(HTTP error, or a 200 with `close` absent/null)* | produce `{status:"MISSING"}` — never propagate the provider's raw error object into domain code | `RawQuote.price` MISSING branch |

`open`/`high`/`low`/`volume`/`previous_close`/`change`/`percent_change`/
`average_volume`/`fifty_two_week`/`is_market_open` are also present on
`/quote` but are not part of `RawQuote` — not mapped, not needed.

## 2. Historical daily OHLCV (stock) → `OhlcvBar[]`

Source: `/time_series` endpoint, `interval=1day`
(`GetTimeSeries_200_response` / `TimeSeriesItem` schemas).

| Twelve Data field | Transform | Our field |
|---|---|---|
| `values[].datetime` (string; `"YYYY-MM-DD"` for `interval=1day`, confirmed via the `1min` example's `"YYYY-MM-DD HH:MM:SS"` shape narrowing to date-only at daily granularity) | pass through directly — already our `date` convention | `OhlcvBar.date` |
| `values[].open`/`high`/`low`/`close` (**strings**) | `parseFloat`, wrap in `DataField` with `asOf = values[].datetime` | `OhlcvBar.open`/`high`/`low`/`close` |
| `values[].volume` (**string**, and — per schema — **not in the `required` field list**, unlike open/high/low/close/datetime which are) | `parseFloat` if present; `{status:"MISSING"}` if absent/null | `OhlcvBar.volume` |
| *(query param)* `outputsize` (1–5000, **default 30**) | must be set explicitly to ≥220 (our longest lookback, see §Historical depth below) — the default is far too short | sizing the `ohlcv[]` request, not a response field |
| *(query param)* `order` (`asc`/`desc`, **default `desc`**) | must pass `order=asc` explicitly (or reverse client-side) — our contract requires ascending, oldest-first | ordering of `ohlcv[]`, not a response field |
| `meta.currency` | cross-check against `RawQuote.currency` for the same instrument (should agree) | — |

## 3. Benchmark historical daily OHLCV → `OhlcvBar[]` (Relative Strength)

Identical mapping to §2 — a second, independent `/time_series` call
against whatever instrument `Strategy.benchmarkInstrumentId` resolves
to. No new raw type needed, confirming the C.5 design decision to reuse
`RawMarketData` verbatim for a benchmark. One difference worth flagging:
if the configured benchmark is a pure **index** rather than an ETF,
`volume` is more likely to be entirely absent (Twelve Data's own docs
note volume is "not available for all instrument types") — this does
**not** block Relative Strength (`computeRelativeStrength` only reads
`close`), but would matter if a benchmark's OHLCV were ever reused for a
volume-based computation later.

## 4. EUR/USD FX → `FxRate`

Source: `/exchange_rate` endpoint (`GetExchangeRate_200_response`
schema).

| Twelve Data field | Transform | Our field |
|---|---|---|
| `symbol` (string, `"BASE/QUOTE"`, e.g. `"USD/EUR"`) | split on `/` | `FxRate.from` / `FxRate.to` |
| `rate` (**number**, not a string — unlike `/quote`/`/time_series`) | use directly, wrap in `DataField` | `FxRate.rate.value` |
| `timestamp` (Unix seconds, **integer** — `/exchange_rate` has no `datetime` string field at all, unlike `/quote`) | convert seconds → ISO 8601 string | `FxRate.rate.asOf` |

**Direction matters and is an adapter parameter choice, not a
transformation of the response**: the confirmed schema example
(`"symbol": "USD/JPY", "rate": 105.12`) means `rate` = *1 unit of BASE in
QUOTE currency* — i.e., querying `symbol=USD/EUR` returns directly the
USD→EUR multiplier this app needs for `executionPriceEur =
primaryPriceUsd × rate`. Querying the reversed pair (`EUR/USD`) would
require an extra `1/rate` inversion in the adapter. **Recommendation:
query `USD/EUR` directly**, not `EUR/USD`.

## Explicit checks (per instruction)

- **Timestamps/date format**: three different shapes across three
  endpoints — `/quote`'s `datetime` (string, ISO-ish) *and* `timestamp`
  (Unix seconds, redundant); `/time_series`'s `values[].datetime` (plain
  date string at `1day` interval); `/exchange_rate`'s `timestamp` only
  (Unix seconds, **no string field at all**). An adapter must normalize
  all three into our contract's plain ISO-string `asOf` convention —
  routine, but genuinely three different conversions, not one.
- **Numeric values as strings vs. numbers**: `/quote` and `/time_series`
  return **every** OHLCV-shaped number as a string (`"148.85001"`).
  `/exchange_rate`'s `rate` is the one exception — a real JSON number.
  Confirmed directly from the schema (`"type": "string"` vs.
  `"type": "number", "format": "double"`), not assumed.
- **Currency metadata**: present and reliable — `/quote.currency` and
  `/time_series.meta.currency` both report the instrument's trading
  currency (e.g. `"USD"`) as a plain string, mapping directly to
  `RawQuote.currency`.
- **Volume availability**: present for `/quote` and `/time_series`, but
  **not a required field** in the schema — confirmed absent-capable, not
  merely "could theoretically be missing." Matters most for
  index-shaped benchmarks (§3).
- **Historical depth required by our longest lookback**: our longest
  lookback is Primary Trend's `dma200Period (200) + dma200SlopeLookbackDays
  (20) = 220` bars (`RULESET.technical.trend`/`.dma200Period`). Twelve
  Data's `outputsize` supports up to **5000** — comfortably (>20×) more
  than needed, confirmed directly from the schema, not assumed. (Relative
  Strength needs only 64 bars, RSI 15, relative volume 21 — all smaller
  than 220.)
- **Ordering of historical bars**: confirmed via the `OrderEnum` schema —
  **`desc` (newest-first) is the default**; our contract requires
  ascending. Must pass `order=asc` explicitly, or reverse client-side.
- **Missing/null/error behavior**: two genuinely different failure
  modes, confirmed from the schema, not merged into one assumption: (a)
  a request-level failure (bad symbol, rate limit, auth) returns a
  **distinct JSON shape**, `{code, message, status:"error"}`, at a
  non-200 HTTP status — easy to detect structurally, not by inspecting
  field values; (b) Twelve Data's own prose documentation states
  individual OHLC field values may be `null` **within an otherwise-200
  response** for genuine data gaps — the schema doesn't mark fields
  nullable explicitly, so an adapter must defensively treat `null`
  and non-numeric-parseable strings as MISSING per field, not assume the
  schema's `required` list guarantees a value.
- **Stock/benchmark date-alignment implications**: both series are
  fetched as independent `/time_series` calls and, by default, each
  returns dates in **its own exchange's local timezone**
  (`meta.exchange_timezone`) — the `timezone` query parameter is
  documented as "ignored… for intervals of 1day," so both requests
  already return calendar dates, not timestamps, minimizing timezone
  drift risk for daily bars specifically. Still, if the stock and
  benchmark trade on materially different exchanges, requesting both
  with the same explicit `timezone=UTC` parameter is a cheap, defensive
  adapter choice to avoid any edge-case date mismatch — a
  recommendation, not a required fix (the C.5 exact-date-string
  alignment algorithm already handles a mismatch correctly as `MISSING`,
  it just wouldn't find a false negative more often than necessary
  without this).
- **FX pair direction**: confirmed above — query `USD/EUR` directly, not
  `EUR/USD` (§4).
- **API rate-limit implications for a small v0.1 portfolio**: see
  dedicated section below.

## Classification

**Adapter transformations required** (routine, all achievable without
touching the contract):

1. Parse every OHLCV-shaped string field to a number (`/quote`,
   `/time_series`) — `/exchange_rate.rate` is already a number.
2. Force `order=asc` on every `/time_series` call (or reverse
   client-side).
3. Explicitly request `outputsize ≥ 220` (or an equivalent
   `start_date`/`end_date` range) — the default (30) is far short.
4. Normalize three different timestamp shapes (`/quote`'s
   `datetime`/`timestamp`, `/time_series`'s date-only `datetime`,
   `/exchange_rate`'s Unix-only `timestamp`) into our contract's plain
   ISO-string `asOf`.
5. Query FX as `USD/EUR` (not `EUR/USD`) to get the direction this app
   needs without an extra inversion.
6. Map Twelve Data's `{code, message, status:"error"}` error shape, and
   any per-field `null`, into our contract's `MISSING` states — never
   let a provider error object or a `null` reach domain code directly.
7. **Deliberately do NOT use** Twelve Data's own pre-computed indicator
   endpoints (`/rsi`, `/sma`, `/rvol`, and dozens more — confirmed
   present in the API) even though they exist and would be
   "convenient." Per the standing C.0/C.3 architecture rule, derived
   indicators are computed internally from raw OHLCV, never accepted as
   provider-supplied source of truth. Noting this explicitly so a future
   implementer doesn't reach for the shortcut.

**Provider limitations** (real, worth knowing, none blocking):

1. `outputsize` capped at 5000/call — irrelevant today (we need ~220),
   would matter for a future multi-year backtest requiring pagination.
2. `volume` isn't guaranteed for every instrument type — doesn't block
   any currently-implemented dimension (only relative volume needs it,
   and that's computed on the *stock's* own OHLCV, not the benchmark's).
3. Individual field `null`s are possible within a 200 response — the
   schema doesn't mark this explicitly; confirmed only via Twelve Data's
   prose docs, not the machine-readable schema — an adapter must
   defensively assume it can happen.
4. Exact historical depth actually available for a specific instrument
   (e.g., how far back Unity's real trading history goes on this
   provider) and whether the Basic/free tier carries any depth
   restriction beyond the universal 5000-bar cap were **not confirmed**
   from the documentation reachable here — flagged as "verify with an
   authenticated call at actual implementation time," not asserted
   either way.

**Contract gaps**: **none found.** Every field our contract defines
(`RawQuote.price`/`.currency`, `OhlcvBar.date`/`.open`/`.high`/`.low`/
`.close`/`.volume`, `FxRate.from`/`.to`/`.rate`, `RawMarketData.
checkedAt`) has a clean, identifiable Twelve Data source field. The one
soft note, not a gap: `/quote` carries a single `datetime`/`timestamp`
for the whole quote object, not one per OHLC field — meaning every
`DataField` extracted from one `/quote` response shares the same `asOf`,
which is exactly what our contract already expects (a `RawQuote` has one
`price: DataField<number>`, not per-field timestamps) — worth stating
explicitly so a future implementer doesn't look for something that was
never part of our contract to begin with.

## Rate-limit assessment

Confirmed from Twelve Data's pricing page: Basic (free) tier = **8 API
credits/minute, 800/day**, and `/time_series` costs **1 credit per
symbol per call** regardless of `outputsize`. Basic tier explicitly
includes "real-time US equities and ETFs" and "real-time forex market
data" — both `/time_series` (Unity, a US equity) and `/exchange_rate`
(USD/EUR, forex) should be reachable without a paid plan (**worth
reconfirming with an authenticated call before committing**, since the
documentation available here doesn't exhaustively rule out finer-grained
restrictions).

A full refresh of Unity's playbook needs, at minimum:

```text
1 call  — Unity /quote (current price)            = 1 credit
1 call  — Unity /time_series (≥220 daily bars)     = 1 credit
1 call  — benchmark /time_series (≥64 daily bars)  = 1 credit
1 call  — /exchange_rate (USD/EUR)                 = 1 credit
                                                    -----------
                                                      4 credits
```

Against 800/day and 8/minute, this is trivial — a single stock's full
refresh uses 0.5% of the daily quota and half the per-minute quota.
Scaling to a modest multi-stock v0.1 portfolio (B.5.7 already proved the
engine is stock-generic): **~10 stocks × 4 credits = 40 credits per full
portfolio refresh**, still under 5% of the daily quota, with the
per-minute cap being the more binding constraint at high stock counts
(8/minute means ≥5 minutes to sequence 10 stocks' worth of calls without
batching or a paid tier). **Assessment: PASS for a small v0.1
portfolio**, with the per-minute cap worth revisiting only if the
portfolio grows materially beyond roughly 15–20 stocks refreshed
back-to-back.

An adapter-design opportunity, not a decision made here: Unity's
`/quote` call could potentially be dropped by using the most recent bar
of the already-required `/time_series` call as "current price" instead —
saving 1 of 4 credits per stock — but `/quote` is real-time while
`/time_series`'s daily bar only finalizes at market close, so this is a
genuine semantic trade-off (live intraday price vs. one fewer call), not
a free optimization; left for the adapter-implementation step to decide.

## Recommendation

**Twelve Data's real API response structure maps cleanly onto our
existing provider-independent market-data contract.** No contract
change is needed or proposed. All required transformations are routine
(string-to-number parsing, timestamp normalization, explicit
ordering/outputsize parameters, FX direction selection, error/null →
MISSING mapping) and squarely belong in a future adapter, not in
`RawMarketData`/`DataField<T>`/domain logic. Rate limits comfortably
support a small v0.1 portfolio on the free tier.

## Decision Needed

None to close this checkpoint — no contract gap was found, so there is
nothing here requiring a product/model decision. Two items are flagged
for verification (not decision) before actual adapter implementation
begins:

1. Confirm with an authenticated call that Unity's actual historical
   depth on Twelve Data covers the needed ~220 daily bars (should be
   trivial given Unity has traded since 2020, but not confirmed here
   since no key was used).
2. Confirm Basic/free tier carries no undocumented restriction on
   `/exchange_rate` or `/time_series` access beyond the credit/day caps
   already confirmed.

## Explicit non-goals of this checkpoint

- No `TwelveDataAdapter` implemented; no network fetching performed
  beyond reading the public, unauthenticated OpenAPI spec document.
- No API key added anywhere.
- No momentum formula changed; no `RULESET` weight changed.
- No real data wired into `runDecisionEngine` or anywhere else.
- No `RawMarketData`/`DataField<T>`/domain-layer type changed to
  accommodate Twelve Data — the contract remains exactly as designed in
  Phase C.0–C.6.
