# Changelog

All notable changes to Personal Stock Playbook are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.35.0] — 2026-09-21

### Real-Data Cleanup for Personal Dogfooding

Removes every runtime path that could show fake/seed portfolio or Unity
content to a real user, ahead of v0.1 dogfooding. Audit-first (a
read-only pass mapped every seed touchpoint, Unity special-case, and
localStorage persistence gap before any code changed), then implemented
exactly what the audit found — no unrelated cleanup.

1. **`src/lib/use-portfolio-state.ts`** — `holdings`/`configs` now start
   as `[]` (no more `holdingsSeed`/`stockPlaybookConfigsSeed` initial
   state); the `persisted.configs.length > 0` gate is gone, so an
   explicitly-empty persisted configs array is trusted instead of
   silently falling back to Unity's seed config forever (previously: no
   delete-config UI meant an empty array could never be told apart from
   "never saved," so a real user's first onboarded config was
   permanently appended to `[unityFakeConfig, ...]` in their own
   localStorage). `quotesSeed`/`fxRatesSeed` replaced with empty `Map`s
   — manualPrices is the only v0.1 Portfolio valuation source now, per
   product decision. Required **zero** domain-layer changes:
   `deriveHoldingSnapshot`/`derivePortfolioSnapshot`
   (`domain/portfolio/snapshot.ts`) already resolved a holding with no
   quote to `MISSING` (never 0) and already treated an empty holdings
   array as a valid `COMPLETE` (not `UNAVAILABLE`) valuation state —
   both were already correctly designed for this.
2. **`src/app/stocks/[ticker]/page.tsx`** — removed the ticker-string
   seed lookup (`holdingsSeed.find(h => h.instrument.ticker === ticker)`)
   that fed a momentum benchmark ID, a display-name fallback, and a
   legacy secondary-market price line. A Server Component genuinely
   cannot see a user's real localStorage holdings, so this could only
   ever match the hardcoded seed's literal `"U"` — a real user's own
   Unity holding (onboarded with a random instrument id) would never
   trigger it, while the seed always would. `fallbackName` is just the
   ticker now.
3. **`StockDetailClientShell.tsx`** — removed `UNITY_INSTRUMENT_ID`/
   `isUnity`; every confirmed config now uses the same onboarded
   builders (`buildOnboardingBaselineScorecard`,
   `buildOnboardedActionZoneTemplates`, a synthetic "Playbook created"
   timeline entry, `deriveFundamentalsModelFit(false)`) with zero
   exceptions — a real Unity holding is no longer special-cased at all.
4. **`PlaybookClientShell.tsx`** — removed `showHandAuthoredThesisContent`
   and its conditional render block. **Deleted** `ThesisCard.tsx`,
   `WhatChangesMyView.tsx`, `ResearchPreview.tsx`, `WhyThisStance.tsx` —
   each rendered ONLY Unity's hardcoded `unity-seed.ts` content, had no
   per-stock equivalent, and had zero remaining references (production
   or test) once the render block was gone.
5. **Seed files kept, not deleted** — `holdings-seed.ts`,
   `stock-playbook-seed.ts`, `market-data-seed.ts`, `unity-seed.ts` have
   zero production importers after this pass (confirmed by grep) but are
   still used extensively as realistic fixtures by the domain validation
   suite (`b5.*.test.ts`, `engine.test.ts`, `trust-cleanup.test.ts`,
   `onboarding-integration.test.ts`, `snapshot.test.ts`,
   `stock-concentration-view.test.ts`) — rewriting that suite's fixtures
   was out of scope for this pass. Each file now carries a "test-only, do
   not re-wire into production" header comment, matching
   `portfolio-seed.ts`'s existing precedent.
- **Live-validated**, fresh browser (`localStorage.clear()`), full
  cycle: empty portfolio → add a real ASML holding + cash + manual price
  → reload (persists) → create a real Playbook via the onboarding wizard
  → reload (config persists, `Model fit: Unknown`, no hand-authored
  content) → BUY 1 share → reload (holding/cash persist) → raw
  localStorage inspection confirmed exactly one holding set and one
  config, both keyed by real random UUIDs, zero Unity anywhere →
  `/stocks/U` correctly renders "Stock not found" → ASML's live research
  (Valuation Context, Business Trajectory, Recent Changes, Momentum)
  still works end-to-end on the real holding.
- **Honest side effects, not defects**: Momentum's relative-strength
  benchmark is now `NOT_APPLICABLE` for every stock (previously wired
  only to Unity's hardcoded "SPY" seed; no live per-user benchmark
  config exists from a Server Component to replace it with — already
  every non-Unity stock's behavior). `legacyMarketColor` mechanism kept
  (generic, optional) but nothing populates it now. Transaction timeline
  and onboarding-draft persistence gaps intentionally NOT touched (out
  of this pass's scope).
- Full suite: **62 files, 818 tests, all passing**, clean `tsc --noEmit`,
  same 2 pre-existing unrelated lint errors.

---

## [0.34.0] — 2026-09-21

### v0.1 Stabilization Pass

Two focused fixes ahead of dogfooding, found by the prior release-
readiness review; nothing else changed (no caching/retry infrastructure,
no transaction-timeline persistence, no other backlog items).

1. **Valuation contradiction fixed.** `SignalScorecard.tsx`'s legacy
   "Valuation" row (`scorecard.valuation`, a pre-Phase-I placeholder,
   permanently `null` in production — no live pipeline has ever
   populated it) now drops out of Signal Overview entirely while it's
   `null`, instead of always rendering "Not available" directly beneath
   the new, real `ValuationContextCard`. No score was invented to fill
   it — the row simply stops appearing until/unless `scorecard.valuation`
   is ever genuinely non-null (the mechanism itself is untouched).
2. **Twelve Data call consolidation.** New
   `src/infrastructure/market-data/stock-page-orchestration.ts`
   (`fetchStockPageLiveData`) replaces `page.tsx`'s three independent
   calls (Momentum, Fundamentals, Valuation) with one: the stock quote,
   its daily price series, and SEC EDGAR fundamentals are each fetched
   **once** and shared between Momentum and Valuation, instead of each
   fetching its own copy. `fetchLiveMomentumResult`/
   `fetchLiveEvRevenueCheckpoints`/`fetchLiveFundamentalsResult`
   themselves are untouched — still used by their own tests and the
   standalone validation script; this is an additional, consolidating
   entry point for the one real caller that needs all three.
- **Live-measured Twelve Data calls per page load** (isolated runs, real
  production benchmark/currency conditions): ASML 6 → 4, Unity 6 → 4.
  SEC EDGAR calls: 4 → 2 for both (the duplicate fundamentals fetch
  fell out naturally, as anticipated).
- **Live-validated** both fixes together on ASML/Unity: no more
  contradictory "Valuation" row, Valuation Context reliably resolves
  (15.0x / 12.2x / "Higher than recent history" for ASML) after a rate-
  limit window clears, Unity's "Not available" unaffected.
- Full suite: **62 files, 818 tests, all passing** (5 new tests for the
  consolidation), clean `tsc --noEmit`, same 2 pre-existing unrelated
  lint errors.

---

## [0.33.0] — 2026-09-21

### Phase I.4B — Minimum Valuation Context

Exposes 0.32.0's now-point-in-time-correct `EvRevenueCheckpoint[]` to the
user for the first time — closing the "built, not yet called from
anywhere" gap `fetchLiveEvRevenueCheckpoints` had carried since 0.31.0.
Descriptive context only, per the explicit product scope: current
EV/Revenue against the median of its own 3-5 most recent completed
fiscal years, described as "Higher"/"Lower"/"In line with recent
history" — no cheap/expensive language, no over/undervalued judgment, no
score, no percentile, no threshold beyond the plain three-way sign
comparison the spec itself specifies. Phase I.4A's data pipeline
(`valuation-checkpoints.ts`/`valuation-orchestration.ts`) is untouched.

1. **Added** `src/domain/signals/valuation-context.ts` —
   `deriveValuationContext(checkpoints)`. Pure, deterministic: treats
   `checkpoints[0]` as "current" and the rest as "historical" (a
   documented convention, not a general rule — see the file's own doc
   comment on why threading an explicit `isCurrent` flag through I.4A's
   own type was out of this phase's "do not change the valuation data
   pipeline" boundary); requires at least 3 historical checkpoints or
   resolves `MISSING`; computes the plain median (no interpolation
   beyond the standard even-count average) of the historical
   `evToRevenue` values; compares current against that median with exact
   sign comparison (`>`/`</`=`) to `HIGHER`/`LOWER`/`IN_LINE`. No other
   field exists on the `AVAILABLE` shape.
2. **Added** `src/components/playbook/ValuationContextCard.tsx` —
   mirrors `RecentChangesCard`/`BusinessTrajectoryCard`'s exact visual
   language (same card chrome, same `Minus`-icon "Not available" state,
   same neutral `bg-stone-50` value badges) and the same restraint: no
   color/icon variation by comparison direction — "Higher than recent
   history" is not styled as a warning any more than "Lower" is styled
   as an opportunity, matching `RecentChangesCard`'s own precedent for
   `reversed`. Renders current/historical-median as `NN.Nx` multiples
   plus one plain comparison sentence.
3. **Wired end-to-end**: `src/app/stocks/[ticker]/page.tsx` now also
   calls `fetchLiveEvRevenueCheckpoints` (a third parallel live fetch
   alongside momentum/fundamentals — SEC EDGAR fundamentals again, plus
   Twelve Data historical price/FX; not reusable from the existing
   fundamentals fetch, which carries no price/FX data) and threads
   `initialEvRevenueCheckpoints` through `StockDetailClientShell` →
   `PlaybookClientShell`, which derives `valuationContext` and renders
   `ValuationContextCard` directly below `RecentChangesCard`. A failed
   fetch (`undefined`) and a genuinely-empty result (every checkpoint's
   required evidence missing) both collapse to `[]` before reaching
   `deriveValuationContext`, which already treats both as `MISSING` —
   the same "absent" convention every other `initial*` prop already
   follows.
- **Tests**: `valuation-context.test.ts` (10 tests) — the empty-array/
  Unity-shaped case, the below-minimum (2 historical) case, the
  exactly-3 and full-5 historical cases, `HIGHER`/`LOWER`/`IN_LINE`
  (including exact-equality with no tolerance band), even-count median
  averaging, order-independence of the median, and a shape check that
  no score/percentile/classification field exists on the `AVAILABLE`
  result. No new UI component tests — consistent with this codebase's
  existing convention of testing presentation-layer cards only through
  their pure domain primitive, never rendering them directly (no `.tsx`
  test exists anywhere in this repo). Full suite: **61 files, 813 tests,
  all passing**, clean `tsc --noEmit`, clean lint (the same two
  pre-existing, unrelated `react-hooks/set-state-in-effect` errors as
  every prior phase).
- **Live-validated** in the running app (both reference stocks, real SEC
  EDGAR + Twelve Data data):
  - **ASML**: Current **15.0x**, 5-year median **12.2x**, **"Higher than
    recent history"** — consistent with 0.32.0's own corrected
    checkpoint numbers (current 14.992; historical
    [13.839, 12.754, 11.666, 12.215, 9.255], median 12.215).
  - **Unity**: **"Not available"** — debt still never resolves (0.30.0's
    original finding), so `fetchLiveEvRevenueCheckpoints` still returns
    an empty array and `deriveValuationContext` correctly reports
    `MISSING`, exactly as required.
  - Confirmed live that three concurrent Twelve-Data-touching fetches
    (momentum + the new valuation checkpoints call) can trip the
    provider's per-minute credit cap under real conditions — the
    orchestration's existing "never throws, resolves to `undefined` on
    any failure" contract (0.31.0) degraded correctly to "Not available"
    rather than an error page; re-verified AVAILABLE on retry once the
    window reset. Not treated as a defect to fix in this phase (no
    caching/backoff/retry logic added) — noted here as an observed
    operational characteristic under the free-tier rate limit, not a
    correctness issue with the data itself.

---

## [0.32.0] — 2026-09-21

### Phase I.4A.1 — Point-in-Time Filing Identity Fix

Blocking correctness bug fix. 0.31.0's own live validation looked clean
(ASML: 6 checkpoints, all `CONVERTED`) but §16.3's finding — flagged
there as narrowly scoped to "two most-recently-superseded fiscal
years" — was re-measured on request and found to be far broader: every
one of ASML's 20 fetched historical periods showed the identical ~2.1-year
`periodEndDate` → `filingDate` gap, against a genuine ~56-day baseline
(the one period too new to have been swept up yet). 5 of the 6 selected
checkpoints — every one except "current" — were using price, shares, and
(where applicable) FX dated to a LATER filing than the fundamentals they
were paired with, not the two originally flagged. Treated as blocking:
this fix landed before any I.4B work, per instruction.

**Root cause** — one level deeper than 0.31.0's own §16.3 diagnosis
placed it. `RawFundamentalsPeriod.filingDate`/`accn` are drawn from a
"representative" fact chosen per `end` in `buildPeriodsFromFields`
(`src/infrastructure/market-data/sec-edgar/mappers.ts`). Before this fix,
that representative was pulled from the SAME `end`-keyed map used for the
field's own reported VALUE — a map already collapsed to "latest `filed`
wins" by `dedupeByLatestFiled`, one layer further upstream in
`parsing.ts`. That collapse is CORRECT for a value (a restated/
latest-confirmed figure is the right number to show) but wrong for
identity: a filer's primary financial statements disclose not just the
current fiscal year but 1-2 prior years as comparatives, and EVERY one of
those comparative facts carries the LATER filing's own `filed`/`accn` —
not the filing that originally disclosed that year. "Latest wins" is
therefore also, silently, "whichever filing last restated this period
as a comparative wins" for identity — confirmed live via direct SEC
EDGAR query (`RevenueFromContractWithCustomerExcludingAssessedTax`,
CIK 0000937966, `end=2023-12-31`): three filings (2024-02-14 original,
2025-03-05 comparative, 2026-02-25 comparative) report the identical
value, and the pre-fix mapper kept the LAST one's identity for a period
that was actually first known 787 days earlier.

**First fix attempt failed live validation** — restated here so the
mistake isn't repeated. Adding an earliest-wins `toEarliestByEnd` inside
`mappers.ts` and feeding it the OUTPUT of the existing `extractDurationFacts`/
`extractInstantFacts`/`extractAnnualInstantFacts`/`extractFiscalYearCumulativeFacts`
functions changed nothing: those functions already call
`dedupeByLatestFiled` internally (`parsing.ts`, §4.4), collapsing each
`end` to a single latest-filed fact BEFORE `toEarliestByEnd` ever saw
more than one candidate. Confirmed by a live re-run showing byte-identical
output to the pre-fix version, then isolated with a minimal direct
`mapEdgarCompanyFacts` reproduction before the real fix landed.

**Selection rule (the actual fix)** — `parsing.ts` gained four exported
"filter-only" functions (`filterDurationFacts`/`filterInstantFacts`/
`filterAnnualInstantFacts`/`filterFiscalYearCumulativeFacts`), each the
existing filter half of its extract* sibling, factored out so the
UNDEDUPED (but cadence/duration-filtered) fact array is available to a
caller. `mappers.ts`'s `resolveQuarterlyFields`/`resolveAnnualFields` now
build a period's `identity` (fiscalYear/fiscalQuarter/filingDate/accn)
from `toEarliestByEnd(filterXFacts(...))` — the genuinely earliest-filed
fact per `end` — while every field's reported VALUE keeps reading from
the unchanged `toMapByEnd(extractXFacts(...))` (latest-filed) path.
`operatingCashFlow`/`capex` are the one documented exception: Phase
E.7D's cumulative-YTD derivation synthesizes some of these facts from
OTHER periods' cumulative figures, so there is no single well-defined
"this fact's own earliest filing" without reworking that derivation —
out of this fix's scope, and inconsequential in practice since these two
fields sit last in `buildPeriodsFromFields`'s priority order, behind
revenue/operatingIncome, which resolve for every period this mapper has
been validated against (Unity, ASML). No ticker-specific branch anywhere
— the fix is the shared selection rule, not an ASML special case.

**Preserved, unchanged**: every reported financial VALUE (revenue,
operating income, cash, debt, and their `asOf` dates) — only WHICH
fact supplies a period's identity metadata changed, never which fact
supplies its figure. Historical shares-outstanding join
(`sharesOutstandingByAccession[period.accn]`) needed no code change at
all — it already keyed by every distinct `accn` seen; fixing which
`accn` lands on a period automatically fixes which shares figure that
period's checkpoint joins to. Price/FX date-selection logic in
`valuation-checkpoints.ts` is untouched — it already correctly used
`period.filingDate` as its point-in-time key; that key was simply wrong
before this fix. Unity is structurally unaffected (still 0 checkpoints,
still dropped on missing debt before price/date selection is ever
reached) and its full existing test suite (mapper, orchestration,
Business Trajectory, Recent Changes, FundamentalChangeEvidence) passes
unchanged, since none of those consumers key anything off of
`fiscalYear`/`filingDate`/`accn`.

**Corrected ASML checkpoints (live-validated)** — 6 checkpoints, now each
with a distinct, genuine own-filing checkpoint date (~40-65 days after
its own `periodEndDate`, matching the "current" checkpoint's own
always-correct 56-day baseline):

| fiscal year | checkpoint date | price (USD) | shares | EV/Revenue |
|---|---|---|---|---|
| 2025 (current) | 2026-02-25 | 1,526.51 | 385,417,665 | 14.992 |
| 2024 | 2025-03-05 | 739.75 | 393,283,720 | 9.255 |
| 2023 | 2024-02-14 | 924.44 | 393,421,721 | 12.215 |
| 2022 | 2023-02-15 | 676.81 | 394,589,411 | 11.666 |
| 2021 | 2022-02-09 | 680.37 | 402,601,613 | 12.754 |
| 2020 | 2021-02-10 | 566.89 | 416,514,034 | 13.839 |

Every ratio here changed from 0.31.0's pre-fix numbers except the
current checkpoint (which was always correct); the 2024 and 2023 ratios
changed the most, since those two were the ones sharing the most
anachronistic (2026) price/shares pre-fix.

- **Tests**: `mappers.test.ts` gained a new "Phase I.4A.1 point-in-time
  filing identity" block (4 tests) — the exact ASML three-filing
  reproduction above, a value-vs-identity split proof (a genuine
  restatement still uses the latest VALUE while identity stays on the
  earliest filing), the QUARTERLY/Unity-shaped equivalent (extending the
  existing §4.4 comparative-balance fixture with identity assertions),
  and a period whose only fact IS a later comparative (no earlier
  appearance exists) still resolving rather than going MISSING. Full
  suite: **60 files, 803 tests, all passing**, clean `tsc --noEmit`,
  clean lint.
- **Live-revalidated**: `npm run validate:live-ev-revenue-checkpoints` —
  Unity still 0 checkpoints (unchanged); ASML's 6 checkpoints now show 6
  distinct checkpoint dates (previously 3 of the 6 shared one
  anachronistic date/price/shares triple).

**Is Phase I.4A now point-in-time correct?** For the two reference
filers, yes — every ASML checkpoint's price/shares/FX now dates to that
period's own genuine original filing, and Unity's behavior is unchanged
and unaffected. Not proven true in general for every conceivable filer
shape (e.g. a filer that skips its own first disclosure of a period
entirely and only ever reports it as a comparative — the fourth new test
above shows this degrades to "use whatever exists," not to MISSING or a
thrown error, which is the correct fallback but not a claim that a
still-more-original filing couldn't in principle exist further back than
what SEC EDGAR's own API returns).

---

## [0.31.0] — 2026-09-21

### Phase I.4A — Valuation Data Foundation

Implemented the data plumbing + pure deterministic derivation behind
EV/Revenue observations, per the four product/model decisions 0.30.0
left open (now resolved): missing debt stays MISSING, current + up to 5
completed fiscal-year checkpoints, checkpoint date = filing/knowledge
date, historical price = latest trading-day price on or before that
date, historical shares join by SEC accession number, historical FX
fetched only when priceCurrency != reportingCurrency and always dated to
the checkpoint, missing required evidence drops the checkpoint (no
interpolation/backfill). No classification, percentile, score, peers,
DCF, AI, or UI — data foundation only, per the explicit scope boundary.

1. **`RawFundamentalsPeriod` gained `accn?: string`** and
   **`RawFundamentalsData` gained `sharesOutstandingByAccession: Record<string,
   DataField<number>>`** (`src/types/fundamentals.ts`) — additive fields,
   every existing consumer unchanged. `mapEdgarCompanyFacts`
   (`src/infrastructure/market-data/sec-edgar/mappers.ts`) now carries
   the representative fact's own accession number onto each period and
   keys every `dei:EntityCommonStockSharesOutstanding` fact by its own
   `accn` (not collapsed to one latest value) — the non-arbitrary join
   key verified live in 0.30.0's feasibility spike.
2. **Added** `src/domain/signals/valuation-checkpoints.ts` —
   `deriveEvRevenueCheckpoints`. Pure, deterministic: selects current +
   up to 5 completed fiscal-year periods, joins each one's shares
   outstanding by its own `accn`, selects the latest price/FX bar on or
   before that period's `filingDate` (never a future bar, never
   interpolated), calls the existing `resolveCurrencyIntegrity` boundary
   before ever combining MarketCap with totalDebt/cash, and computes
   `MarketCap = price * shares`, `EV = normalizedMarketCap + totalDebt -
   cash`, `EV/Revenue = EV / TTMRevenue` (reusing
   `computeTrailingTwelveMonthRevenue`'s existing cadence-aware logic
   unchanged). Any checkpoint missing required evidence is silently
   dropped from the result array — never a MISSING placeholder, never
   backfilled from a neighbor.
3. **Fiscal-year checkpoint sampling deliberately orders/selects by the
   `periods` array's own already-guaranteed periodEndDate-ascending
   position — never by re-sorting on `period.fiscalYear` itself.** Found
   live, against ASML's real SEC data: its `fy` XBRL tag is per-FILING,
   not per-fact — a later 20-F's own multi-year comparative disclosure
   carries THAT filing's `fy` label on every year it discloses, not the
   label of the year each fact actually describes. Combined with the
   pre-existing (E.7B) "latest-filed wins" dedup rule, this can make
   several genuinely distinct periods share one mislabeled `fiscalYear`.
   `periods` itself has no such defect (already deduped to one entry per
   distinct `periodEndDate`), so array-position sampling is immune to it
   even though the label is not — this fix landed after a live run first
   surfaced the collision (see the finding below).
4. **Added** `src/infrastructure/market-data/valuation-orchestration.ts`
   — `fetchLiveEvRevenueCheckpoints`, composing the SEC EDGAR fetch
   (extended `FundamentalsFetchResult` with `reportingCurrency`/
   `sharesOutstandingByAccession`, same single fetch, no second round
   trip) with Twelve Data's historical price `/time_series` and, only
   when needed, a historical FX `/time_series` request for the
   `priceCurrency/reportingCurrency` pair (0.30.0's own finding: the
   generic time-series endpoint accepts a forex pair identically to a
   stock symbol — never Twelve Data's current-only `/exchange_rate`).
   Never throws; not wired into any page or UI — same "built, not yet
   called from anywhere" posture 0.24.0's currency-integrity boundary had
   before this phase became its first real caller.
5. **Added** `scripts/validate-live-ev-revenue-checkpoints.ts` +
   `npm run validate:live-ev-revenue-checkpoints` — developer-only live
   validation, mirroring the existing E.7B/C.8B scripts.
- **Tests**: `mappers.test.ts` gained accession-number join-key tests
  (accn carried onto a period, `sharesOutstandingByAccession` keyed
  correctly, an end-to-end ASML-shaped join). `orchestration.test.ts`
  (sec-edgar) gained tests for the two newly-exposed fields.
  `valuation-checkpoints.test.ts` (23 tests) covers accession matching,
  fiscal-year sampling (including the ASML mislabeled-`fy` regression
  above), no-future-price selection (including a market-holiday gap),
  conditional FX fetching, missing historical FX, missing debt (Unity's
  real shape), and checkpoint dropping.
  `valuation-orchestration.test.ts` (5 tests) covers conditional FX
  fetching at the plumbing level and every failure mode. Full suite:
  **60 files, 799 tests, all passing**, clean `tsc --noEmit`, clean lint.
- **Live-validated** for both reference stocks
  (`npm run validate:live-ev-revenue-checkpoints`):
  - **Unity: 0 checkpoints — every one dropped.** Confirmed root cause:
    Unity's live SEC data has never tagged any debt concept
    (`DebtCurrent`/`ShortTermBorrowings`/`LongTermDebtCurrent`/
    `LongTermDebtNoncurrent`/`LongTermDebt`, all absent) across all 25
    fetched periods — exactly 0.30.0's flagged fork, confirmed live, not
    a bug in this implementation.
  - **ASML: 6 checkpoints — one per real fiscal year 2020-2025, all
    `CONVERTED` (USD price normalized to EUR reporting via a dated FX
    bar), all with real revenue/debt/cash/EV/Revenue.**
- **PRODUCT/MODEL issue discovered, not resolved**: ASML's most recent
  20-F's own multi-year comparative disclosure means the *checkpoint
  date* (and therefore the price/shares selected) for its two
  most-recently-superseded fiscal years (2023, 2024 in the live run) is
  the LATEST filing's date, not those years' own original filing date —
  because the mapper's pre-existing "latest-filed wins" dedup (correct
  for restated VALUES) also overwrites `accn`/`filingDate` IDENTITY,
  and that original identity is not recoverable from what
  `RawFundamentalsData` currently retains. Those two checkpoints' own
  revenue/debt/cash are each period's genuine, correct figures; their
  price/shares are anachronistically recent. Sampling itself is
  unaffected (item 3 above) — no year is dropped or double-counted —
  but the resulting EV/Revenue ratio for those two specific years should
  not yet be trusted as a true historical-point-in-time observation.
  Fixing this requires a mapper-level design decision (separating a
  period's VALUE freshness from its IDENTITY provenance) genuinely out
  of this phase's data-plumbing scope — flagged for a follow-up phase,
  not silently patched here.

---

## [0.30.0] — 2026-09-18

### Phase I Valuation Context feasibility (design only)

Determined the smallest historically-correct way to answer "is this
stock cheap or expensive relative to its own history?" for EV/Revenue
only, own-history only, no code changed.

- **Found an exact, non-arbitrary alignment key for historical shares
  outstanding**: verified directly against live SEC data that a period's
  `dei:EntityCommonStockSharesOutstanding` fact shares the identical
  `accn` (SEC accession number) as that period's `revenue`/
  `operatingIncome` facts, for both Unity and ASML — a structural join,
  not a date-window heuristic, even though the two companies' `end`
  dates behave differently (ASML's lands exactly on fiscal year end;
  Unity's lands on the filing's cover-page date, weeks later).
- **Found the single biggest feasibility fork**: Unity tags no debt
  concept at all, anywhere in its filing history (`DebtCurrent`,
  `ShortTermBorrowings`, `LongTermDebtCurrent`, `LongTermDebtNoncurrent`,
  `LongTermDebt` all 404). Under the existing, already-approved rule
  ("MISSING, never $0, when neither debt sub-component resolves" —
  0.24.0's own `toTotalDebtField`), Unity's EV — and therefore every
  EV/Revenue checkpoint — would be permanently `MISSING`, for the one
  reference stock that works everywhere else in Phase I. Flagged as an
  open product decision, not resolved.
- **Found historical FX is feasible without a new vendor or paid tier**:
  Twelve Data's `/time_series` accepts a forex pair (`USD/EUR`)
  identically to a stock symbol, with real historical depth — so ASML's
  price (USD, Twelve Data's default listing) can be normalized to its
  EUR reporting currency using an FX rate *dated to each checkpoint*,
  not today's rate applied retroactively.
- Proposed model: a handful of checkpoints anchored to periods already
  in `RawFundamentalsData.periods` (one per fiscal year, not a dense
  independent grid), each dropped entirely (never interpolated) if any
  required input — debt, cash, TTM revenue, accn-matched shares, a
  price bar, or a dated FX bar — is unavailable.
- No implementation; four open product/model decisions surfaced (the
  Unity debt question above, checkpoint count/anchoring, checkpoint
  date convention, and whether to pursue ASML's currency normalization
  now or defer).

---

## [0.29.0] — 2026-09-18

### Phase I.5 — Recent Changes Presentation

Exposed the already-complete `FundamentalChangeEvidence` primitive
(0.28.0) to the user, closing the plumbing gap that had discarded
`RawFundamentalsData` after scoring since Phase I.1.

1. **Plumbing fix, not a redesign.** `fetchLiveFundamentalsResult`
   (`src/infrastructure/market-data/sec-edgar/orchestration.ts`) now
   returns `FundamentalsFetchResult { scoreResult, periods, periodType }`
   from the *same* SEC EDGAR fetch — never a second round trip.
   `scoreResult` is exactly the same `FundamentalsScoreResult` every
   existing consumer already expected; `page.tsx` unpacks it
   immediately, so `runDecisionEngine`/`EngineInput`/`EngineOutput`,
   `SignalScorecard`, and `deriveBusinessTrajectory` are untouched.
   `periods`/`periodType` are new, additive props threaded separately
   (`page.tsx` → `StockDetailClientShell` → `PlaybookClientShell`),
   consumed only by the new card.
2. **Added** `RecentChangesCard` (`src/components/playbook/RecentChangesCard.tsx`)
   — rendered directly below `BusinessTrajectoryCard`, above
   `SignalScorecard`. Shows the actual `before → after` values for
   revenue growth and operating margin between the two most recently
   reported periods; `reversed` is rendered as one plain factual
   sentence ("Direction changed from positive to negative"), never as
   "material"/"significant"/a warning. No color or icon varies by
   `reversed` — every `AVAILABLE` line uses identical neutral styling.
   `INSUFFICIENT_HISTORY` ("Insufficient history") and `MISSING` ("Not
   available") are rendered distinctly from each other and never as
   "stable"/"no change."
3. No aggregate verdict, no score, no materiality threshold, no AI, no
   effect on stance/action zones/thesis/the decision engine.
- **Added** an `orchestration.test.ts` block confirming `periods`/
  `periodType` are exposed alongside `scoreResult` from a single fetch
  (`fetch` mocked exactly twice) for both a Unity-shaped `QUARTERLY`
  fixture and an ASML-shaped `ANNUAL` fixture. No changes needed to
  `FundamentalChangeEvidence`'s own tests or any engine-level test —
  the full existing suite passing unchanged is the proof of zero effect
  on engine output, since the engine's types were never touched.
- **Verified live** in Chrome on both reference stocks: Unity shows
  "Revenue +16.8% → +23.9%" / "Profitability −69.1% → −5.9%" (no
  reversal — still negative, improving toward breakeven); ASML shows
  "Revenue +2.6% → +15.6%" / "Profitability +31.9% → +34.6%" (no
  reversal) — real, live SEC EDGAR data for both. Neither stock's
  current real data happens to include a sign reversal; that path is
  covered by `fundamental-change-evidence.test.ts`'s 22 deterministic
  tests instead.
- Full suite: **763/763 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.28.0] — 2026-09-17

### Phase I.4 — FundamentalChangeEvidence

Implemented the deterministic primitive behind "Recent Changes,"
corrected before coding: renamed from the originally-proposed "Recent
Material Changes" once a model-definition spike found no honest,
threshold-free way to define general materiality — no ruleset or spec
anywhere in this codebase defines a significance boundary
(`RULESET.fundamentals`'s anchor curves calibrate a 0–100 score, not
materiality).

1. **Added** `src/domain/signals/fundamental-change-evidence.ts` —
   `deriveFundamentalChangeEvidence(periods, periodType)`. Deliberately
   **no `FundamentalsScoreResult` dependency** — reads
   `RawFundamentalsData.periods` directly, one layer below where
   `deriveBusinessTrajectory` sits, reusing `computeRevenueGrowth`/
   `computeOperatingMargin` (`fundamentals.ts`) at two cutoffs
   (`periods` vs. `periods.slice(0, -1)`) rather than duplicating any
   calculation.
2. Two independent lines (revenue, profitability). Status union:
   `AVAILABLE` (`before`/`after`/`beforeSign`/`afterSign`/`reversed`/
   `asOf`), `INSUFFICIENT_HISTORY` (after computable, before not — never
   called "newly available," since that would require comparing against
   a previous fetch or persisted state, neither of which exists here),
   `MISSING` (current value itself not computable).
3. `reversed` is a strict sign comparison only
   (`POSITIVE`↔`NEGATIVE`) — a `ZERO` transition is never a reversal, by
   design, to avoid deciding how close to zero still counts as a flip.
   No magnitude/materiality threshold anywhere.
- **Added** 22 tests: both reversal directions, same-sign
  deterioration/improvement, both zero-crossing directions, insufficient
  history, missing current evidence, both cadences, and Unity-shaped/
  ASML-shaped realistic fixtures.
- No UI, no AI, no effect on Business Trajectory or the decision engine
  — domain layer only; this primitive had no consumer until 0.29.0.
- Full suite: **761/761 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.27.0] — 2026-09-17

### Phase I.3.1 — Reporting-Currency Discovery

Architectural correction of the Phase I.1 regression found in 0.26.0:
removed the whole notion of a caller-supplied reporting currency.

1. **`mapEdgarCompanyFacts`/`fetchLiveFundamentalsResult` no longer take
   a `reportingCurrency` argument at all.** The mapper now discovers it
   itself, per cadence, from the currency units actually present on the
   seven target financial concepts it already reads (revenue,
   operatingIncome, operatingCashFlow, capex, cash, debtShort,
   debtLong) — never the whole companyfacts payload, never a fixed
   USD/EUR/GBP guess order.
2. **Rule**: one consistent currency across every target field → use
   it; zero currencies with usable data → `undefined`; more than one
   distinct currency, within one field or across fields → `undefined` —
   never resolved by order, majority, or ticker.
   `RawFundamentalsData.reportingCurrency` is now `string | undefined`
   (was `string`), never silently defaulted to `"USD"`.
3. Verified against ASML's real payload that scanning must stay scoped
   to the seven target concepts: a full-payload scan found three
   distinct currency-shaped units (EUR for the real financials, plus JPY
   and USD on unrelated foreign-currency-derivative/commitment
   disclosures) — a whole-payload scan would have wrongly flagged ASML
   as ambiguous.
4. Confirmed via live SEC API calls that no explicit reporting-currency
   field exists anywhere (`dei` namespace, `submissions` filer metadata)
   — discovery from the target concepts' own units is the only reliable
   source.
5. `Instrument`/`nativeCurrency` (`src/types/portfolio.ts`) untouched —
   never the problem; conflating it with reporting currency was.
- **Added** tests for Unity→USD/ASML→EUR discovery, within-field and
  cross-field ambiguity → `MISSING`, a non-target-concept currency
  correctly ignored, and a currency present but with zero cadence-usable
  facts correctly falling through to the annual attempt.
- **Verified live**: ASML now shows real Business Trajectory and
  Fundamentals evidence for the first time in the whole Phase I effort
  (8/10 Positive, "Model fit: Unknown") — no changes needed to
  `BusinessTrajectoryCard`/`SignalScorecard`, confirming the presentation
  layer was already correct and only the currency source needed fixing.
- Full suite: **739/739 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.26.0] — 2026-09-17

### Phase I.3 — Business Trajectory (+ a Phase I.1 regression found and fixed)

1. **Added** `src/domain/signals/business-trajectory.ts` —
   `deriveBusinessTrajectory` reads the existing `growthTrend`/
   `marginTrend` component results `scoreFundamentals` already computes
   and maps each independently to `IMPROVING`/`DETERIORATING`/`STABLE`/
   `MISSING` by the sign of `rawValue`. No new score, no new weights, no
   aggregate IMPROVING/MIXED/DETERIORATING verdict — two lines shown
   side by side, never combined.
2. **Added** `BusinessTrajectoryCard` (`src/components/playbook/BusinessTrajectoryCard.tsx`)
   — rendered above `SignalScorecard` as the primary beginner-facing
   evidence read (plain-language direction, no bars, no 1–10 number).
   The existing Fundamentals row was not restructured — a small "Full
   composite score" caption was added under its label instead, so it
   reads as supporting detail rather than a second, competing
   interpretation of the same evidence.
3. **Found and fixed a real, silent regression from Phase I.1**, caught
   by live-browser validation (the first UI-touching phase, which is
   what triggered an actual live check instead of unit tests alone):
   `page.tsx` had been passing
   `seedHolding?.instrument.nativeCurrency` as the SEC reporting-currency
   argument, reasoning it was "the instrument's own known reporting
   currency." That was wrong — `InstrumentIdentity.nativeCurrency`
   (`src/types/portfolio.ts`) is the **portfolio's own cost-basis/
   tracking currency**, not the company's SEC reporting currency. Unity
   proves these differ: its holding is tracked in EUR while Unity itself
   reports to the SEC in USD. Passing "EUR" into a USD-denominated
   filer's fetch had silently broken **Unity's entire live Fundamentals
   Signal Overview row** since Phase I.1 shipped — invisible to every
   automated test, which all supplied their own explicit currency
   directly, never exercising the real `page.tsx` wiring end to end.
   Fixed by reverting `page.tsx` to `fetchLiveFundamentalsResult`'s
   existing `"USD"` default, applied uniformly (not a ticker-specific
   branch) — restores Unity, and honestly reverts ASML's Fundamentals-
   derived evidence to "Not available" for a different reason than
   before (currency source, not currency support or cadence) until
   0.27.0 resolves it properly.
- **Added** 14 tests for `deriveBusinessTrajectory`.
- **Verified live**: Unity shows "Revenue growth is accelerating" /
  "Profitability is improving" with a real 7/10 Fundamentals score.
- Full suite: **740/740 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.25.0] — 2026-09-17

### Phase I.2 — Annual Cadence Support

Closed the second of two root causes behind ASML's "Not available"
Fundamentals (the first, currency, was 0.24.0) — every ASML fact
(us-gaap and dei alike) carries `fp: "FY"`, rejected outright by
quarterly-only period-extraction rules that exist to disambiguate a
*quarterly* filer's own comparative-figure duplicates.

1. **Cadence selection in the mapper**
   (`src/infrastructure/market-data/sec-edgar/mappers.ts`): quarterly
   extraction (today's exact, unchanged logic) is tried first; only if
   it yields zero periods does a new annual-FY extraction run, using
   genuine FY-tier duration facts directly and a new, symmetric
   `extractAnnualInstantFacts` (`parsing.ts`) for instant fields. No
   cumulative-YTD derivation in annual mode — an annual fact already
   covers its whole period, so there's nothing to derive it from, and
   synthesizing one would mean fabricating a quarter that was never
   reported. Quarterly and annual periods are never combined.
2. **A third, previously-unnoticed quarterly-specific rule, found and
   fixed alongside**: the period-identity loop required
   `parseFiscalQuarter(fp) !== null`, and `parseFiscalQuarter("FY")` is
   `null` — this would have silently rejected every annual period even
   after the extraction fixes above. A new `isAcceptableFiscalPeriod`
   replaces that check.
3. **Cadence-aware calculations** (`src/domain/signals/fundamentals.ts`):
   `computeRevenueGrowth`/`computeTrailingTwelveMonthRevenue` (and
   through them `computeGrowthTrend`/`computeNetCashToRevenue`) take an
   optional `periodType`, defaulting to `"QUARTERLY"` — 4 periods back
   for quarterly (unchanged), 1 for annual (each period already spans a
   full year); trailing-twelve-month revenue under annual cadence is the
   single most recent period's own revenue, never a multi-year sum.
   `computeOperatingMargin`/`computeFreeCashFlow`/`computeMarginTrend`/
   `computeFcfMargin` take no `periodType` — confirmed cadence-agnostic
   and left unchanged.
- **Added** a permanent regression test using ASML's real multi-year
  figures reaching two genuine `ANNUAL` periods; a quarterly-preferred/
  never-mixed test; cadence-aware unit tests at both the `fundamentals.ts`
  and `growth-software.ts` layers, including an explicit "this used to
  silently compute a different, wrong number" contrast case; and one
  end-to-end test reaching a genuine `SCORED` result for a realistic
  ASML fixture.
- Full suite: **726/726 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.24.0] — 2026-09-17

### Phase I.1 — Data Foundation

First implementation phase for `docs/phase-i-minimum-research-evidence.md`
— the shared currency/shares-outstanding foundation Business Trajectory
and Valuation Context both need.

1. **Reporting-currency-aware unit resolution.** The SEC EDGAR mapper's
   `resolveUsdUnits` (hardcoded to `.units?.USD`) became
   `resolveUnitFacts(facts, candidates, unitKey)`, parameterized by a
   caller-supplied `reportingCurrency` (later found wrong in 0.26.0,
   corrected in 0.27.0).
2. **Added** `RawFundamentalsData.sharesOutstanding` — the latest
   `dei:EntityCommonStockSharesOutstanding` fact (mandatory for every
   XBRL filer, not currency-denominated), read but not yet consumed by
   anything.
3. **Added** `src/domain/market-data/currency-integrity.ts` —
   `resolveCurrencyIntegrity(valueCurrency, targetCurrency, fx?)` →
   `SAME_CURRENCY`/`CONVERTED` (only for the exact declared pair with an
   `AVAILABLE` rate)/`MISSING` — the boundary a future valuation
   calculation must call before combining any two currency-denominated
   figures. Built and tested; no consumer yet.
4. **Verified against real SEC/Twelve Data APIs, not assumed**: ASML's
   "Not available" Fundamentals was never an IFRS/taxonomy gap — it
   tags the exact `us-gaap` concept names already in the mapper's
   candidate lists, denominated in EUR, all discarded by the old
   USD-only filter. Also found (but not yet fixed — see 0.25.0) that
   every ASML fact carries `fp: "FY"`, and (Finding C, still open) that
   Twelve Data resolves bare "ASML" to its NASDAQ/USD listing, not the
   EUR listing the portfolio model declares — harmless for Momentum
   (its components are scale-invariant ratios) but not for a future
   Valuation calculation.
- Full suite: **702/702 passing**, clean `tsc --noEmit`, clean lint.

---

## [0.23.0] — 2026-09-17

### Phase I — Minimum Research Evidence (design only)

- **Added** `docs/phase-i-minimum-research-evidence.md`. Narrowed
  `docs/minimum-research-model.md`'s five-area model to three active
  Phase I build targets — Business Trajectory, Valuation Context,
  Recent Material Changes — holding Portfolio Fit and Momentum frozen.
  For each area: minimum useful data, likely data source, deterministic
  vs. AI responsibility, missing-state handling, simplest beginner-
  facing UX, and what's reusable from the current system.
- Named explicit non-goals: no overall investment/ownership score, no
  fair-value/DCF, no large research dashboard, no Thesis Lifecycle/
  Investment Memory/evidence history/re-entry workflows, no automatic
  AI buy/hold/sell decisions, no unnecessary archetype complexity. The
  chain every area must preserve: evidence → AI interpretation (where
  useful) → user judgment → the existing deterministic Playbook — none
  of the three areas feeds back into the decision engine.
- Surfaced (not resolved) seven product/model decisions later closed
  one at a time across 0.24.0–0.29.0: the valuation ratio, whether to
  pursue Twelve Data's paid `/statistics` endpoint, whether shares-
  outstanding acquisition is in scope, whether non-US-GAAP-filer
  coverage gaps are acceptable, UI placement, and more. No code
  changed; no implementation started.

---

## [0.22.0] — 2026-09-16

### Post-Phase-H Trust Cleanup (fix)

Fixed the three confirmed trust/correctness issues the product review
named directly (F4/F5), plus a follow-up Fundamentals fix found
necessary while live-verifying the first pass.

1. **Valuation never presents as "5/10 Neutral" again.**
   `Scorecard.valuation` (`src/types/playbook.ts`) is now
   `ScoreItem | null` end to end — the type, the onboarding baseline
   builder, Unity's own seed, the pass-through signal seam
   (`src/domain/signals/signals.ts`), and the confirmed Signal Overview.
   `null` means "not evaluated," kept structurally separate from
   `SignalState` — never a new enum value smuggled into an otherwise-real
   signal's shape. Unity's own Valuation was the exact same fabrication
   (H.2 §8.1 had already documented this) and got no special exception.
2. **Fundamentals model-fit is now surfaced on the confirmed Playbook**,
   not only during onboarding Review. A new shared module
   (`src/domain/playbook/fundamentals-model-fit.ts`) is the single
   source of truth for both screens, so they can never drift apart. No
   archetype classifier added — the same static, instrument-id-keyed
   rule (Unity = confirmed fit, everyone else = unknown) that already
   existed.
3. **Unity's own Action Zone copy no longer claims to evaluate a
   "price / valuation" condition that has never existed anywhere in this
   system.** Confirmed via `checkHC003` that only concentration/weight
   and thesis health are ever deterministically evaluated for trims.
   Rewrote Trim Level 1/2's `primaryTrigger`/`summary`/`whyBullets`/
   `doNotTriggerIf` (and one redundant ADD bullet) to state the real
   concentration-based trigger — the qualitative "food for thought"
   mentions of valuation in `ThesisCard`/`WhatChangesMyView` were left
   untouched (never claimed to be system-evaluated, so not misleading).
4. **Follow-up: the same false-certainty failure existed for
   Fundamentals**, found via live verification of #2 — ASML's real
   Fundamentals row still showed the fabricated "5/10 Neutral" whenever
   SEC EDGAR returned nothing `SCORED` (its genuine, demonstrated case).
   `Scorecard.fundamentals`'s internal type is deliberately unchanged —
   the legacy compatibility placeholder still fills that required slot,
   per instruction. Only the display layer in
   `src/components/playbook/SignalScorecard.tsx` changed: a new shared
   predicate, `isFundamentalsResultScored`, decides whether to show the
   real score/pill or an honest "Not available," used identically by
   both the top-line row and the model-fit tag from #2 so the two can
   never disagree again — a real bug caught live during this fix (the
   model-fit tag initially showed even without a real score, implying an
   evaluation that never happened). The expand-detail panel stays
   available whenever real (even `INSUFFICIENT_DATA`) evidence exists —
   showing the honest 0%-or-partial coverage/component breakdown is more
   transparent, not less.
- **Added** 16 regression tests in
  `src/domain/playbook/trust-cleanup.test.ts`; updated 3 pre-existing
  tests (`onboarding-scorecard.test.ts`, `onboarding-integration.test.ts`,
  `b5.6-contradictions-failure-states.test.ts`) that had asserted the old
  placeholder-as-real behavior.
- **Verified live** in Chrome on both reference stocks: Unity fully
  unaffected (real scores, model-fit tag, and rewritten copy all render
  correctly); ASML's Valuation and Fundamentals both honestly read "Not
  available," with 0% evidence coverage visible on expand and no
  misleading model-fit tag.
- Full suite: **672/672 passing**, clean `tsc --noEmit`, clean lint,
  clean `next build`.

---

## [0.21.0] — 2026-09-16

### Minimum Research Model for a Generic Stock Playbook (design only)

- **Added** `docs/minimum-research-model.md`. Defined the minimum
  evidence a beginner needs to decide Build/Hold/Reduce, building
  directly on the product review's findings, using Unity and ASML as
  reference cases throughout. Reshaped the brief's six candidate areas
  to five: merged Thesis and "Risks/What Changed" (same evidence, same
  current single hand-typed implementation — no product reason to build
  two pipelines); recast Portfolio Fit as not a research area at all
  (it's evidence about the user's own position, already complete, no
  gap to close); recast Momentum as supporting/contextual rather than a
  peer decision pillar (it's the most *present* signal, not necessarily
  the most decision-relevant one for a beginner's Build/Hold/Reduce
  judgment).
- Distinguished gaps that **break trust** (a fabricated Valuation
  placeholder shown as real, an invisible model-fit status) from gaps
  that merely **limit usefulness** (Fundamentals' filer-coverage gap, no
  real Valuation pipeline at all, no per-stock research beyond Unity) —
  only the first category needed fixing before any further evidence
  investment; this became the direct scope of the Trust Cleanup below.
- Confirmed two precise technical facts via direct code reading, not
  assumption: Fundamentals' "Guidance" dimension is unconditionally
  hardcoded `MISSING` in the live SEC EDGAR mapper for every stock —
  the AI-extraction path was never built, not just thin; and
  `deriveThesisHealth` is a literal identity pass-through — there has
  never been a "Thesis Engine" in this codebase, Thesis Health is 100%
  stored user opinion today, never a computed or researched signal.
- Named explicit "evidence we do NOT need" (comps tables, analyst price
  targets, chart patterns, full risk-factor boilerplate, etc.) to keep
  the model from drifting toward a professional equity-research
  terminal. No code changed; no Phase I defined.

---

## [0.20.0] — 2026-09-16

### Post–Phase H Product Review (design only)

- **Added** `docs/post-phase-h-product-review.md`. Walked the real, live
  product end-to-end for both Unity and ASML as a product review, not an
  architecture review. Headline finding: Unity is the product's demo
  case, not its generic case — ASML (real, onboarded through the actual
  H.3–H.5 flow) is a substantially thinner experience.
- Identified and fully specified seven findings (F1–F7), each with user
  problem, live evidence, why it matters, a bug/UX-debt/model-limitation/
  new-capability classification, rough effort/dependency, and "what
  happens if we do nothing": no Valuation evidence exists anywhere; only
  one Fundamentals archetype exists and doesn't generalize (live-
  confirmed failure for ASML); no per-stock research/thesis capability
  beyond Unity's frozen seed; trust signals (model-fit, placeholder
  status) vanish once a Playbook is confirmed; Unity's own copy
  references a valuation check that has never existed; ETF/crypto/cash
  holdings get zero Playbook coverage with no in-product explanation;
  non-Unity transaction history is invisible on the stock's own page
  (confirmed live — a real BUY/SELL against ASML never appeared in its
  "Recent activity").
- Findings grouped into Fix now / Important next / Later-validate. No
  code changed.

---

## [0.19.0] — 2026-09-16

### Phase H.6 — End-to-End Generic Playbook Validation (validation/hardening)

- **Added** `docs/phase-h6-end-to-end-validation.md`. Drove the real,
  non-simulated ASML flow end-to-end in a live browser against the dev
  server — No Playbook → Create Playbook → Questionnaire (including
  exercising "Get AI help," which correctly degraded to "unavailable"
  with no ANTHROPIC_API_KEY configured) → Analyze → Review → Confirm →
  Engine-rendered Stock Detail page → BUY → reload → SELL — plus a full
  Unity regression pass, all with zero console errors.
- **Fixed** four generic-stock correctness bugs found live, all
  addressed with the correct behavior H.0–H.5 already specified (no new
  investment rules or AI logic introduced):
  - `StockHeader.tsx`/`legacyMarketColor`: a non-Unity stock's Hero Stack
    was showing Unity's literal USD price ("$47.20 USD") and daily
    change ("+2.1% today") as its own. `MarketData.primaryPriceUsd`/
    `.dailyChangePct` and `Security.marketCurrency`
    (`src/types/playbook.ts`) are now optional — honestly absent for
    every stock but Unity — instead of fabricated; `page.tsx` now
    gates `legacyMarketColor` on the same `staticConfig` signal that
    already identifies Unity.
  - `ThesisCard`/`WhatChangesMyView`/`ResearchPreview`
    (`PlaybookClientShell.tsx`): were rendering Unity's literal thesis
    text, catalysts, and research-document titles under any other
    stock's confirmed Playbook page. Now gated behind a new
    `showHandAuthoredThesisContent` prop, `true` only for Unity —
    rendering nothing for a non-Unity stock is the honest consequence
    of H.0's own "out of scope" resolution for this content, not a new
    feature.
  - `AddTransactionModal.tsx`: the modal title was the literal string
    "Add Transaction — Unity Software" for every stock. Now takes a
    `securityName` prop from `seed.security.name` — also fixes Unity's
    own title, which was missing "Inc."
  - `PlaybookOnboardingOverlay.tsx`'s Review preview: "Recommended
    holding" used `calcTargetShares(...)` against the target range's
    max%, diverging from the confirmed page's `deriveTargetPosition(...)
    .preferredTargetShares` (a midpoint-aware preferred target,
    `engine.ts:274`) — live-observed as Review showing 15 shares while
    the confirmed page showed 12 for the identical ASML inputs. Review
    now calls the exact same `deriveTargetPosition` function the Engine
    uses, closing the gap H.4's own changelog had flagged as a
    "deliberate, stated scope reduction."
  - Also fixed, found live: a double-period in the onboarding intro
    screen for any company name already ending in one (e.g. "ASML
    Holding N.V..").
- **Updated** `b5.6-contradictions-failure-states.test.ts` to scope its
  "no MarketData field may be optional" check around the two
  now-deliberately-optional cosmetic fields (confirmed non-decision-
  relevant: `engine.ts` never reads them) — the invariant it actually
  protects (missing fundamentals/valuation/momentum SIGNAL data has no
  type-level representation) is unchanged and still enforced for every
  other field.
- **Audited** every Unity-seed import and ticker/instrument-id branch in
  the Playbook rendering path, classified A (intentional legacy
  compatibility — the `UNITY_INSTRUMENT_ID` Scorecard/ActionZone/
  Timeline gate) / B (harmless — dead code, cosmetic placeholder text) /
  C (the four fixed above). No class-C finding left unaddressed.
- **Verified**, live: transaction recalculation (weighted-average cost,
  weight, Primary Action) is arithmetically correct for both BUY and
  SELL; persistence survives a full page reload; the AI boundary holds
  at three independent levels (browser interaction, server log, and the
  unmodified H.5 compile-time/runtime boundary tests); Unity's Stance,
  Primary Action, Signal overview, thesis/research content, and
  transaction modal are all unchanged.
- **Declared Phase H complete** — every item in the plan's own Success
  Criteria is met. Remaining findings (a pre-existing, non-Unity-specific
  `ConcentrationMeter` overlapping-percentage rendering bug; a hardcoded
  "updated today, 16:15" timestamp; the already-accepted H.2 §8.1
  Scorecard placeholder) are documented as out-of-scope limitations for a
  future checkpoint, not Phase H blockers.
- Full suite: **655/655 passing** (one pre-existing test updated in
  place, none skipped/deleted), clean `tsc --noEmit`, clean lint on
  every file touched this session, clean `next build`.

---

## [0.18.0] — 2026-09-16

### Phase H.5 — AI-Assisted Research & Proposal (implemented)

Implemented the approved H.5 design exactly: two read-only AI surfaces
layered strictly upstream of `UserIntent`, with zero changes to
`PlaybookProposal`, `materializeStockPlaybookConfig`, the discrepancy
catalog, or persistence.

#### Types (`src/types/ai-research.ts`)

- **Added** `AIResearchContext`, `EvidenceFieldRef` (a closed union),
  `EvidencePoint`, `AIResponseMeta`, `AIEvidenceBrief`,
  `IntentAssistQuestion`, `IntentSuggestion`, `AIIntentAssist`. None of
  these are referenced by `PlaybookProposal`/`ProposedConfiguration`/
  `StockPlaybookConfig` — verified by a compile-time
  `// @ts-expect-error` proof (`onboarding-ai-boundary.test.ts`) that
  fails `tsc --noEmit` if that boundary is ever weakened.

#### Domain (`src/domain/ai/`, no `src/infrastructure/` imports)

- **Added** `context.ts` — `buildAIResearchContext`, reducing the full
  `ProposalField`-wrapped `UserIntent` to literal, concrete-only answers
  (never a deferred value), and omitting `guardrailPreview` entirely
  until `concentrationStateIfConfirmedNow` is computable.
- **Added** `enums.ts` — the single source of truth for each Intent
  Assist question's valid suggestion values (production enums, minus
  each question's own deferral literal), shared by the prompt builders
  and the validator so they can never diverge.
- **Added** `validation.ts` — the mechanical grounding/validation layer:
  enum validation, citation validation against the closed
  `EvidenceFieldRef` set and the actual context sent, and missing-
  evidence consistency (`refAllowsStrength` — a "strength" point may
  only cite genuinely `SCORED`/available/`COMPLETE` evidence; an
  "uncertainty" point may cite anything, including `MISSING`/
  `INSUFFICIENT_DATA`/`UNKNOWN_FIT` — that's the whole point). A point
  citing even one disallowed ref is dropped whole, never stripped to its
  valid half.
- **Added** `evidence-brief.ts`/`intent-assist.ts` — pure generation
  functions taking an injected `CompleteFn` (dependency inversion, so
  domain never imports infrastructure — same rule
  `twelve-data/mappers.ts` established). Never throw: a provider
  rejection, non-JSON response, or a response that fails validation all
  resolve to `{ status: "UNAVAILABLE" }`. Intent Assist's prompt
  guidance is tailored per question (`INVESTMENT_ROLE`/`CORE_PORTION`
  lean on clarifying questions over assertive suggestions, since no
  amount of evidence fully answers a personal-preference question;
  `THESIS_TRAJECTORY` reuses the original decision-engine spec's §15
  supporting/contradicting-evidence reasoning shape).

#### Infrastructure (`src/infrastructure/ai/anthropic/`, server-only)

- **Added** `env.ts`/`client.ts`/`orchestration.ts` — a thin,
  dependency-free Anthropic Messages API client (mirrors
  `twelve-data/client.ts`'s no-SDK precedent) plus fail-soft
  orchestration composing it with the domain generate functions. Missing
  `ANTHROPIC_API_KEY` degrades to `UNAVAILABLE`, exactly like a missing
  `TWELVE_DATA_API_KEY` already does for momentum.

#### API routes (`src/app/api/ai/evidence-brief`, `.../intent-assist`)

- **Added** two Next.js Route Handlers. Server-only by construction — the
  Anthropic key never reaches the client bundle (verified: no
  `src/domain/`/`src/lib/`/`src/components/` file imports
  `src/infrastructure/`). Each route rebuilds `AIResearchContext` itself
  from the POSTed portfolio/evidence/intent pieces rather than trusting a
  client-supplied summary.

#### UI (`src/components/playbook/onboarding/PlaybookOnboardingOverlay.tsx`)

- **Extended** (not redesigned) H.4's overlay: Analyze gains a fourth,
  genuinely-async checklist row ("Reading the evidence") that triggers
  the one-per-session Evidence Brief call; Review gains an
  `EvidenceBriefPanel` between the Decision and Reasoning cards, styled
  distinctly (teal label, no `Positive`/`Neutral`/`Weak` pill language)
  so it never reads as a fourth deterministic signal. Each questionnaire
  screen's "I'm not sure"/"Help me..." option reveals a "Get AI help"
  affordance; suggestions render as selectable cards routed through the
  exact same `onSelect` handler every hand-authored option already uses
  — an AI-suggested value is indistinguishable from a typed one by the
  time it reaches `userIntent` (`provenance: "USER"` either way).
  Arriving at a question via Review's "Decide" link auto-triggers Intent
  Assist for that question. Neither surface has any effect on
  `canConfirm`/`handleConfirm`.

#### Tests

- **Added** 54 tests across 5 files: `context.test.ts` (intent reduction,
  conditional `guardrailPreview`), `validation.test.ts` (26 cases —
  every enum/citation/missing-evidence-consistency rule, including the
  "mixed valid+invalid citation drops the whole point" case),
  `evidence-brief.test.ts`/`intent-assist.test.ts` (fail-soft on network
  error, non-JSON, and failed grounding — never throws), and
  `onboarding-ai-boundary.test.ts` — the requested proof that an
  AI-suggested answer produces a byte-identical `StockPlaybookConfig` to
  the same value typed manually, that materialized Strategy numbers are
  always H.2's rule table, that no AI-response field name
  (`groundedIn`/`rationale`/`modelVersion`/etc.) ever appears in the
  serialized `PlaybookProposal`/`StockPlaybookConfig`, plus the
  compile-time `@ts-expect-error` boundary proof. Full suite: **655/655
  passing** (601 pre-existing + 54 new), clean `tsc --noEmit`, clean lint
  on every H.5 file, clean `next build` (both routes registered as
  dynamic server routes).

#### Known limitations

- Three pre-existing `react-hooks/set-state-in-effect` lint errors in
  `AddTransactionModal.tsx`/`HoldingFormModal.tsx`/`use-portfolio-state.ts`
  (none touched by H.5, confirmed by file mtimes predating this work) are
  unchanged — out of scope per this task's "do not redesign H.3/H.4."
- No React component-rendering test infrastructure exists in this
  project (unchanged since H.4) — the UI wiring is validated by `tsc`/
  lint/manual review, not rendered-DOM tests; domain-layer tests cover
  the parts that actually enforce the AI boundary.
- Provider/model is Anthropic (`claude-sonnet-4-5` default, overridable);
  no live-API validation script was added (mirrors momentum/fundamentals'
  own separate `validate:live-*` scripts, not part of this task's scope).

---

## [0.17.0] — 2026-09-16

### Phase H.5 — AI-Assisted Research & Proposal (design only, not implemented)

- **Added** `docs/phase-h5-ai-assisted-research-design.md`. Audited the
  completed H.4 implementation directly (not the H.3 mock) and found the
  deterministic pipeline solid but two beginner gaps genuinely unfilled:
  the Review screen's Reasoning card has no interpretation of the raw
  evidence, and every "Not sure"/"Help me decide"/"Help me assess" option
  correctly blocks confirmation but nothing helps resolve it. Scoped two
  read-only AI surfaces — an Evidence Brief (summarize/explain/challenge
  the already-fetched Momentum/Fundamentals evidence) and Intent Assist
  (grounded suggestions for unresolved intent questions, reusing the
  original spec's §15 Thesis Engine contract for Thesis Trajectory) — both
  strictly upstream of `UserIntent`, both fail-soft and never gating
  Confirm Playbook. **Resolved:** H.5 v0.1 does not exercise the `AI`
  provenance case H.1 reserved on `ProposedConfiguration` — AI never
  proposes `Strategy` numbers directly, only helps the user pick a
  `UserIntent` literal, which H.2's unchanged deterministic mapping then
  processes exactly as it does today. `PlaybookProposal`,
  `materializeStockPlaybookConfig`, the discrepancy catalog, and
  persistence are all byte-for-byte unchanged by this design. Anti-
  fabrication is mechanical, not just prompt-based: every AI suggestion's
  value is validated against the real production enum, every cited
  evidence field is validated against what was actually sent to the
  model, and a response that fails validation degrades to "AI assistance
  unavailable" rather than being shown repaired or partial. Explicitly
  out of v0.1: live web/document research, fundamentals archetype
  classification (already ruled out of Phase H entirely by H.0), and any
  persistence of AI output.

---

## [0.16.0] — 2026-09-15

### Phase H.4 — Playbook Creation & Persistence (implemented)

Implemented the approved H.2 deterministic mapping end-to-end: confirmed
`PlaybookProposal` → validate → materialize `StockPlaybookConfig` →
persist → immediately usable by the existing, unmodified Engine →
survives reload. Also implemented H.3's required entry path so a STOCK
holding without a Playbook no longer 404s.

#### Domain layer (`src/domain/playbook/`, `src/types/playbook-proposal.ts`)

- **Added** `proposal.ts` — builds the H.1 `PlaybookProposal` from User
  Intent + Portfolio Context + Research Evidence, deriving
  `ProposedConfiguration`/`GuardrailPreview` deterministically and
  computing `ProposalStatus` (`GATHERING_INTENT`/`READY_FOR_REVIEW`).
- **Added** `materialize-config.ts` — the H.2 mapping, the only place a
  confirmed Proposal becomes production `Strategy`/`Playbook`. Rejects
  unresolved answers, HARD discrepancies, and un-acknowledged SOFT
  discrepancies before mapping Investment Role → target allocation/
  ceiling, Core Portion → ±8% core-share band (computed from **shares at
  confirmation time**, not the proposal-preview snapshot), Thesis
  Trajectory → `ThesisHealth`, and Confidence → `Playbook.confidence`.
  Dead fields (`horizon`, `tacticalSharesMin/Max`, `version`,
  `updatedAt`, `stance`) filled per H.2's documented placeholders.
- **Added** `derive-strategy-fields.ts` — the role/core-band formula
  shared by the Review preview *and* the real mapping, so the two can
  never drift apart.
- **Added** `onboarding-discrepancies.ts` — the approved HARD/SOFT
  catalog (`BUILD_INTENT_THESIS_BROKEN`/`BUILD_INTENT_ACCUMULATION_BLOCKED`
  = HARD, grounded only in HC-002/HC-001; `BUILD_INTENT_ALREADY_OVERWEIGHT`/
  `REDUCE_INTENT_WITHIN_TARGET` = SOFT).
- **Added** `thesis-trajectory.ts` (the fixed 1:1 `ThesisTrajectory` →
  `ThesisHealth` lookup, `NOT_SURE` never defaults to `INTACT`),
  `action-zone-templates.ts` (deterministic, parameterized ActionZone
  copy for newly onboarded stocks — live numbers and generic boilerplate
  only, never fabricated per-stock analysis), and
  `onboarding-scorecard.ts` (the single named compatibility-placeholder
  `Scorecard`, never a real Neutral signal).
- **Added** to `config/ruleset-v0.1.ts`: `strategyDefaults`
  (`roleTargetAllocation`, `accumulationCeilingBufferPct`,
  `coreBandHalfWidthPct`, `corePortionBuckets`) and
  `compatibilityPlaceholders.scorecardItem` — every new policy number
  versioned in the ruleset, never buried in a UI component.

#### Persistence

- **Extended** the existing `lib/portfolio-storage.ts`/
  `lib/use-portfolio-state.ts` localStorage mechanism with a `configs`
  array — no second, onboarding-specific storage system. An absent or
  empty persisted `configs` (e.g. a pre-H.4 blob) falls back to Unity's
  seed default, since no delete-config UI exists that could make that
  ambiguous with a deliberate removal.

#### Entry path and UI

- **Fixed** `/stocks/[ticker]` (`src/app/stocks/[ticker]/page.tsx`) —
  no longer `notFound()`s when a holding has no config. Holding/config
  resolution moved client-side (`StockDetailClientShell`, keyed by
  ticker against live portfolio state) since a manually-added holding's
  existence is no longer knowable to a Server Component at request time.
- **Added** `components/playbook/onboarding/PlaybookOnboardingOverlay.tsx`
  — the full Questionnaire (Investment Role → conditional Core
  Protection → Confidence → Current Intention → Thesis) → Analyze →
  Review → Confirm flow, implementing H.3's discrepancy/unresolved-
  answer/missing-evidence handling.
- **Fixed** `components/portfolio/HoldingsTable.tsx` — the "No playbook"
  cell for a STOCK holding is now a live link into the onboarding flow
  instead of inert text.
- Unity's exact hand-typed Scorecard/ActionZone/Timeline content is
  preserved unchanged via one identity check in `StockDetailClientShell`;
  every other confirmed config uses the new deterministic builders.

#### Tests

- **Added** 57 tests across 7 files: every Investment Role mapping, the
  25/50/75 Core Protection mapping with ±8% banding at confirmation-time
  shares, all 5 `ThesisTrajectory` mappings plus `NOT_SURE` rejection,
  unresolved-answer rejection per field, HARD/SOFT discrepancy gating,
  successful config creation, persistence round-trip, and an end-to-end
  domain-level proof that a real, previously-unconfigured holding (ASML)
  becomes fully Playbook-accessible through the unmodified
  `toStockEngineInputs`/`runDecisionEngine` boundary, alongside a Unity
  regression check. Full suite: **601/601 passing**, clean `tsc --noEmit`,
  clean lint, clean `next build`.

#### Known limitations

- No React component-rendering test infrastructure exists in this
  project (no jsdom/`@testing-library`) — UI-level claims are validated
  at the domain layer that actually drives the UI, not via rendered DOM.
- The Review screen's Decision layer shows target/ceiling/core-range/
  concentration badge rather than a full 5-zone Engine-run "likely first
  zone" preview — a deliberate, stated scope reduction.
- The pre-existing "every stock's Hero Stack shows Unity's USD price/
  daily-change numbers" gap (Phase G.5, explicitly out of scope) is
  unchanged.

---

## [0.15.0] — 2026-09-15

### Phase H.0–H.3 — Playbook Onboarding (design only, not implemented)

Four design phases turning the Stock Playbook from a Unity-specific
configured experience into a capability any STOCK holding can acquire.
Full roadmap: `docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`.

#### H.0 — Playbook Onboarding Product Model

- **Added** `docs/phase-h0-playbook-onboarding-product-model.md`.
  Resolved: fundamentals archetype fit is a provenance/disclosure axis,
  not a score penalty — no archetype classifier built; Investment Role
  ≠ Core Protection (one beginner-friendly question sizes core
  protection, mapped deterministically by a later phase, never a raw
  `coreSharesMin`/`Max` input); Current Intention is Proposal-only.

#### H.1 — Playbook Proposal Model

- **Added** `docs/phase-h1-playbook-proposal-model.md`. Defined
  `PlaybookProposal` (subject/portfolioContext/userIntent/
  researchEvidence/guardrailPreview/proposedConfiguration/status) and
  the `Provenance`/`ProposalField<T>` primitive (`USER`/`SYSTEM`/`AI`/
  `DETERMINISTIC`/`MISSING`) — the "confirmation boundary": a
  materialized `StockPlaybookConfig` carries no provenance at all,
  structurally preventing an AI-provenance value from ever reaching
  production without passing through deterministic validation first.
- Added `ThesisTrajectory`, a beginner-facing concept distinct from the
  raw `ThesisHealth` enum, after an explicit refinement rejecting
  exposure of the production enum directly to users; `"NOT_SURE"` never
  defaults to `INTACT`.

#### H.2 — Deterministic Strategy Mapping

- **Added** `docs/phase-h2-deterministic-strategy-mapping.md`.
  User-approved v0.1 policy constants: per-role target allocation
  (`LONG_TERM_CORE` 20–30%, `GROWTH` 10–18%, `TACTICAL` 3–8%),
  accumulation ceiling = target max + 5pp, core-protection band ±8%
  around `fractionOfCurrentHolding × shares at confirmation`, and a
  HARD/SOFT discrepancy severity model grounded only in real hard-
  constraint conflicts (HC-001/HC-002) — never invented from
  concentration size alone.
- Defined the compatibility-placeholder `ScoreItem` for missing evidence
  (never a real Neutral signal) and deterministic, parameterized
  ActionZone templates (live values and generic boilerplate only).

#### H.3 — Playbook Onboarding UX

- **Added** `docs/phase-h3-playbook-onboarding-ux.md`. Full screen
  sequence (No Playbook → Create Playbook → Questionnaire → Analyze →
  Review → Confirm), question wording, and Review-screen hierarchy
  (Decision → Reasoning → Evidence, reusing the confirmed Playbook's
  visual language instead of another questionnaire).
- A verification pass caught and corrected two issues before
  implementation: the Core Protection answer→fraction mapping had been
  silently invented and needed explicit sign-off (resolved: "All of it"
  removed, three buckets — 75%/50%/25% — approved as a named v0.1
  policy); and the Review screen's "likely first zone" language wrongly
  hedged a fully deterministic computation with probabilistic wording.

---

## [0.14.0] — 2026-09-14 / 2026-09-15

### Phase G.1–G.6 — Real Portfolio (implemented)

Implemented the G.0-approved data model end-to-end and wired it into
both the Portfolio and Stock Detail pages, replacing the legacy
hand-typed seed dependency across the app.

#### G.1 — Core Real Portfolio Implementation

- **Added** `AssetType`, `InstrumentIdentity`, `Holding`, `CostBasis`,
  `StockPlaybookConfig`, `PortfolioValuation` (`COMPLETE`/`PARTIAL`/
  `UNAVAILABLE`), `PortfolioSnapshot`/`HoldingSnapshot`
  (`src/types/portfolio.ts`).
- **Added** `derivePortfolioSnapshot`, `holdingWeightPct`,
  `createStockPlaybookConfig`, `toStockEngineInputs`
  (`src/domain/portfolio/snapshot.ts`) — the fail-safe adapter to the
  unchanged Stock Position Engine; returns `null` whenever valuation
  isn't `COMPLETE` or the holding's own values aren't `AVAILABLE`, so a
  `PARTIAL` portfolio can never silently feed a decision.
- **Migrated** seed data into `holdings-seed.ts`/`stock-playbook-seed.ts`,
  replacing the two independently drifting hand-typed sources
  (`unity-seed.ts` + `portfolio-seed.ts`) as the ownership source of
  truth. Existing `Position`/`Strategy`/`Playbook`/Engine types
  untouched.

#### G.2 — Wire Real Portfolio Snapshot into the Portfolio Page

- **Fixed** the Portfolio page to consume the derived snapshot instead
  of hardcoded allocation/weight/concentration data; removed duplicated
  hardcoded numbers from `ConcentrationOverview`.
- Explicit CASH holding participates in totals; only STOCK rows expose
  Playbook state; `COMPLETE`/`PARTIAL`/`UNAVAILABLE` valuation is
  rendered honestly rather than papered over.

#### G.3 — Manual Portfolio Management

- **Added** Add/Edit/Delete holding and cash-editing UI
  (`HoldingFormModal.tsx`, `domain/portfolio/holding-form.ts`), all 5
  asset types, minimal localStorage persistence
  (`lib/portfolio-storage.ts`, `lib/use-portfolio-state.ts`) —
  hydration-safe (server/first render uses seed defaults, then one
  post-mount resync from storage, avoiding a hydration mismatch).
- `Holding` and `StockPlaybookConfig` kept structurally separate — no
  Playbook onboarding yet.

#### G.4 — End-to-End Portfolio Workflow Validation

- Validated the full manual-portfolio workflow; fixed implementation
  bugs surfaced along the way (no new features added).

#### G.5 — Connect Stock Detail to Real Portfolio

- **Fixed** `/stocks/[ticker]` to source `Holding + PortfolioSnapshot +
  StockPlaybookConfig → toStockEngineInputs() → Engine` instead of the
  legacy seed, unifying Portfolio and Stock Detail on one source of
  truth. Phase F Hero Stack UI and Engine behavior preserved exactly.

#### G.6 — Close Portfolio/Playbook Consistency Gaps

- **Fixed** two inconsistencies: Portfolio no longer displays a stale
  stored Playbook stance when the current stance is derivable live from
  the Engine; Stock Detail BUY/SELL now updates the real Holding+Cash
  portfolio state and persists it (`domain/portfolio/apply-transaction.ts`),
  instead of mutating ephemeral Playbook-only state.

---

## [0.13.0] — 2026-09-14

### Phase G.0 — Real Portfolio Data Model (design only, not implemented)

Read `docs/REAL_PORTFOLIO_MODEL_BRIEF.md` and audited the current
Portfolio/Position/Transaction/concentration implementation before
proposing a model — no code changed this phase.

#### Current-state findings (`docs/phase-g0-real-portfolio-data-model.md` §0)

- Confirmed `src/data/unity-seed.ts` and `src/data/portfolio-seed.ts`
  are two independently hand-typed sources that already drift (nothing
  enforces the two Unity entries agreeing); `portfolioSeed.totalValueEur`
  is a typed literal, not a computed sum.
- Confirmed `ConcentrationOverview.tsx` receives its `portfolio` prop
  but ignores it, reading a third hardcoded `concentrationData` array
  and its own hardcoded `maxTarget = 45` instead — three independent
  copies of numbers that should be one.
- Confirmed a live `MISSING != 0` violation already in seed data: the
  "Other positions" row is typed as an ordinary holding with
  `shares: 0, executionPriceEur: 0, averageCostEur: 0` — those zeros
  mean "not tracked," not "actually zero."
- Confirmed zero `AssetType`-style discriminator exists anywhere in
  `src/` — this is greenfield, not a refactor of existing multi-asset
  plumbing.

#### Recommended model (`docs/phase-g0-real-portfolio-data-model.md` §1)

- **`AssetType`** (`CASH | STOCK | ETF | CRYPTO | OTHER`) and
  `InstrumentIdentity` — currency carried as data (`nativeCurrency`),
  following the existing `RawQuote` convention rather than
  `MarketData`'s baked-in `executionPriceEur`/`primaryPriceUsd` pattern.
- **`Holding`** — ownership only (`quantity`, `costBasis`); no
  `Strategy`/`Playbook` field. `CostBasis` adds a `NOT_APPLICABLE`
  branch (cash has no cost basis by definition — reuses the existing
  `RelativeStrengthData` three-state pattern rather than inventing one).
- **`StockPlaybookConfig`** — Strategy/Playbook linked to a `Holding`
  by `instrument.id`, not embedded in it (see "Ownership boundary
  refinement" below).
- **`PortfolioSnapshot`/`PortfolioValuation`** — the derived
  single source of truth for `totalValueBase`/weights, replacing the
  flat `portfolioTotalEur` literal (see "Valuation states" below).
- **`toStockEngineInputs`** adapter bridges the new model to the
  **unchanged** `EngineInput`/`Position`/`Strategy` — the Stock
  Position Engine is preserved exactly per brief §7.
- **`Transaction`** record type (new) — `applyBuy`/`applySell`'s
  existing formulas now operate on a real cash + security holding
  pair instead of an identity-function placeholder standing in for
  untracked cash.

#### Portfolio valuation states — MODEL DECISION resolved

Brief §11 explicitly flagged "how incomplete pricing affects totals
and weights" as a fork requiring **MODEL DECISION REQUIRED** rather
than a silent fallback. Resolved as Option B, refined:
`PortfolioValuation` is a 3-state union — **COMPLETE** (full total/
weights, Playbook may consume them), **PARTIAL** (known-valued
holdings may be shown, explicitly marked incomplete; never presented
as "Portfolio Total"; no authoritative weights/concentration
calculated from it), **UNAVAILABLE** (no portfolio-derived Playbook
inputs at all). `holdingWeightPct(holding, valuation)` returns `null`
for anything but `COMPLETE`, so no code path can hand a
partial-denominator weight to concentration classification.
`toStockEngineInputs` returns `null` for both `PARTIAL` and
`UNAVAILABLE` — a partial total is exactly as unfit to feed the
Decision Engine as no total at all, even when the STOCK holding itself
priced correctly. **Principle: Portfolio presentation may fail-soft;
decision logic must fail-safe.**

#### Ownership boundary refinement

Clarified per explicit follow-up direction: Portfolio Holdings
describe what the user owns; Stock Strategy/Playbook describes how a
supported stock is managed. `Holding.strategy?`/`Holding.playbook?`
(the initial draft) were removed in favor of `StockPlaybookConfig`,
joined by `InstrumentIdentity.id` — so a Strategy can exist for a
stock the user holds zero shares of (thesis research ahead of a first
buy), and a `Holding` can exist with no Playbook configured yet
(owned, but not onboarded), neither of which the embedded-field draft
could represent.

#### Migration impact

Additive first (new types + `derivePortfolioSnapshot`/
`toStockEngineInputs` alongside unchanged `Position`/`EngineInput`;
one merged `holdings-seed.ts` + `stock-playbook-seed.ts` replacing the
two drifting seed files) — breaking cleanup (retiring `Portfolio`/
`PortfolioHolding`) explicitly deferred to a later phase, per the
brief's own "additive migration" guardrail.

---

## [0.12.0] — 2026-09-11

### Phase F.0–F.2 — UX Architecture Review, Trust Cleanup, Hero Stack Interface Redesign

#### Phase F.0 — Dynamic Product Interface UX Architecture Review (audit only)

- **Added** `docs/phase-f0-dynamic-interface-ux-architecture-review.md`
  — full audit of the stock-detail page across evidence/decision
  hierarchy, dead affordances, and duplication; named the gap that
  `momentumResult`/`fundamentalsResult` and `targetPosition` were
  already computed by the engine but never rendered anywhere.

#### Phase F.1A — Interface Trust Cleanup

- **Fixed** `WhyThisStance.tsx` — took `unrealizedReturnPct` as a prop
  instead of a second, static copy of the same value
  `PositionAndStrategy` already renders (stale-data duplication bug).
- **Removed** hardcoded conclusions strip from `SignalScorecard.tsx`.
- **Removed** dead/jargon-heavy copy from `ActionZoneDrawer.tsx` and
  `AddTransactionModal.tsx`.
- **Removed** dead buttons from `PlaybookStatusBanner.tsx`.

#### Phase F.2 — Playbook-First Interface Exploration

- **Added** `docs/phase-f2-playbook-first-interface-exploration.md` and
  three isolated interactive HTML prototypes (Claude Artifacts, not in
  the repo): Hero Stack, Signal Rail, Conversational Playbook. **Hero
  Stack chosen** as the production direction.
- **Added** `docs/PLAYBOOK_INTERFACE_PRINCIPLES.md` §16 Semantic Visual
  Language — stable icon families for action types, action/signal
  states, reasoning categories, and instrument identity, plus
  guardrails (icon+text while learning, no icon-only/color-only
  meaning, restrained color, no decoration).
- Applied §16 to the Hero Stack prototype; fixed a scrim/contrast issue
  behind the confirm popup and a hardcoded-recalculation bug where the
  post-confirm screen showed literal numbers instead of recomputing
  from the actual transaction input.

#### Hero Stack brought into production

- **Added** `src/components/playbook/playbookIcons.ts` — the single
  shared icon-family source of truth (`actionZoneIcon`,
  `zoneStateIcon`, `reasoningCategoryIcon`), built on `lucide-react`
  (already the project's icon library).
- **Added** `src/components/playbook/PrimaryActionCard.tsx` — the new
  L1 hero card surfacing whichever action zone is most relevant right
  now, including the real current→recommended holding line
  (`targetPosition.preferredTargetShares`, spec §21A — computed since
  Phase B.5 but never rendered anywhere until now).
- **Added** `src/components/playbook/pickPrimaryZone.ts` — presentation-
  layer tie-break (prefers an `ACTIVE` non-`HOLD` zone, else falls back
  to `HOLD`) over the real `ActionZoneState` enum; no new engine
  semantics — `deriveActionZoneState` still returns only one coarse
  state per zone, confirmed via research before this design decision.
- **Updated** `StockHeader.tsx` — monogram avatar + live `position`
  prop (was previously not receiving position data at all) + live
  weight/share-count context, forming one instrument-identity block.
- **Updated** `ActionZoneCard.tsx`/`ActionZoneDrawer.tsx` — action +
  state icons added alongside existing text labels (never icon-only,
  per §16 guardrail).
- **Rewrote** `SignalScorecard.tsx` — reasoning-category icons per row;
  Fundamentals/Momentum rows now expand to their real per-component
  breakdown (`momentumResult`/`fundamentalsResult`, imported from
  `@/domain/engine`'s re-exports per its own documented convention)
  with an honest evidence-coverage line. Valuation/ThesisHealth/
  PositionFit/ConcentrationRisk rows get icons but stay non-expandable
  — no fabricated per-component data for dimensions that don't have any.
- **Updated** `AddTransactionModal.tsx` — accepts an optional
  `suggestedZone` prop; shows a banner naming the real suggested share
  range when opened from an actionable zone, and prefills type/shares
  accordingly. No changes to the existing accounting/preview logic.
- **Updated** `PlaybookClientShell.tsx` — wires all of the above
  together; **removed** the `WhyThisStance` render (its bullets now
  duplicate the Primary Action card + expanded Signal overview).
- Verified: `tsc --noEmit` clean, `eslint` clean of new issues,
  `vitest run` 485/485 passing (up from 423), `next build` clean, and
  a full live-browser walkthrough against real E.8-validated Fundamentals
  data.

---

## [0.11.0] — 2026-09-11

### Phase E.7B–E.8 — SEC EDGAR Fundamentals Adapter, Cash-Flow Derivation, Live Engine Wiring

#### Phase E.7B — SEC EDGAR Structured Fundamentals Adapter + Live Validation

- **Added** `src/infrastructure/market-data/sec-edgar/` — `client.ts`
  (companyfacts fetch), `env.ts` (`SEC_EDGAR_USER_AGENT`, required by
  SEC's fair-access policy for data.sec.gov/www.sec.gov — no API key
  exists for this provider), `errors.ts`, `types.ts`,
  `ticker-resolver.ts` (ticker → CIK), `parsing.ts`, `mappers.ts`
  (XBRL facts → `RawFundamentalsData`), `orchestration.ts`
  (`fetchLiveFundamentalsResult` — never throws, resolves to
  `undefined` on any failure, mirroring `fetchLiveMomentumResult`'s
  existing fail-closed contract), plus deterministic test coverage for
  each module.
- **Added** `scripts/validate-live-sec-edgar-fundamentals.ts` — dev-only
  live validation script (`npm run validate:live-sec-edgar-fundamentals`),
  live-validated against real Unity EDGAR data.
- **Added** `SEC_EDGAR_USER_AGENT` to `.env.local.example`.
- No AI guidance extraction, no scoring changes — `Guidance` stays
  `MISSING` from this provider alone, never fabricated.

#### Phase E.7C — EDGAR Quarterly Cash-Flow Derivation (design only)

- **Added** `docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md`
  — design for deriving quarterly OCF/capex from EDGAR's cumulative
  (YTD) XBRL facts, since EDGAR does not report discrete Q4 figures
  directly. No implementation this checkpoint.

#### Phase E.7D — EDGAR Quarterly Cash-Flow Derivation (implementation)

- **Added** `src/infrastructure/market-data/sec-edgar/cash-flow-derivation.ts`
  implementing the approved E.7C design exactly — cumulative-fact tier
  derivation for OCF/capex, with deterministic tests. No changes to
  scoring, anchors, domain contracts, Guidance, Scorecard, engine, or UI.

#### Phase E.8 — Live Fundamentals → Decision Engine Orchestration

- **Updated** `src/app/stocks/[ticker]/page.tsx` — calls
  `fetchLiveFundamentalsResult` server-side alongside the existing
  `fetchLiveMomentumResult` call, threading the result into
  `PlaybookClientShell` exactly as Momentum's Phase D.2 precedent
  established (never throws; `undefined` falls back to the existing
  seed `scorecard.fundamentals` value unchanged).
- **Updated** `src/components/playbook/PlaybookClientShell.tsx` — passes
  `fundamentalsResult` through to `runDecisionEngine`
  (`EngineInput.fundamentalsResult`, already optional since Phase E.3/E.4).
- No changes to stance/hard-constraints/concentration/sizing logic —
  Fundamentals evidence feeds the Scorecard only, following the same
  "evidence is not the decision" boundary Momentum already established
  (`docs/PHASE-D-INTEGRATION-GUIDE.md`).

---

## [0.10.0] — 2026-09-10

### Phase E — Fundamentals Evidence Model (E.0–E.7A, design + partial implementation)

A second, independent evidence engine alongside Momentum, following the
exact D-phase integration pattern end to end: contract → derivation →
scoring engine → Scorecard integration, then a live-provider strategy
for a future checkpoint. Every non-spec-given numeric anchor/weight is
explicitly labeled a versioned v0.1 hypothesis, never presented as
validated. Test suite grew to 423 tests / 30 files across this and
Phase D combined (from 154 at the end of Phase B.5).

#### New — provider-independent fundamentals contract (E.0, E.1A, E.6A)

- **`src/types/fundamentals.ts`** (new) — `RawFundamentalsPeriod`
  (`periodId` display label; `fiscalYear`; `fiscalQuarter?`;
  `periodEndDate`; `filingDate?`; revenue/operatingIncome/
  operatingCashFlow/capitalExpenditures/cashAndEquivalents/totalDebt,
  each a `DataField<number>`), `RawFundamentalsData` (`periodType:
  "QUARTERLY"|"ANNUAL"` — one field for the whole `periods` array,
  making a mixed-cadence array structurally unrepresentable, not just
  discouraged), `GuidanceEvidence` (spec §12/§29's AI-extraction output
  contract — `direction`/`magnitude`/`evidence`, AI may never assign
  the final score). `fiscalYear`/`fiscalQuarter`/`periodEndDate`/
  `filingDate` were added in E.6A as a **breaking change** to E.1A's
  original `periodId`-only shape, once E.5's live-evidence design
  exposed the quarterly/annual-mixing hazard a bare label couldn't
  prevent — every existing test fixture was migrated in the same
  checkpoint.
- **`FundamentalsArchetype`** — company-archetype-aware by design (spec
  §11 forbids one template for banks/biotech/etc.); v0.1 ships exactly
  one archetype, `GROWTH_SOFTWARE` — a new archetype is an additive
  union member + template value, never a type change.
- **`EvidenceScoredItem`** (`src/types/evidence-scoring.ts`, Phase D.0)
  reused unchanged for fundamentals — it was built general-purpose from
  the start specifically to avoid a second bespoke type here.

#### New — deterministic derivation (E.1A, E.1B, E.1C)

**`src/domain/signals/fundamentals.ts`** (new): `computeRevenueGrowth`,
`computeOperatingMargin`, `computeFreeCashFlow`, `computeFcfMargin`
(FCF ÷ revenue — the metric actually scored; absolute FCF fails
company-size independence), `computeTrailingTwelveMonthRevenue`,
`computeNetCashToRevenue`, `computeGrowthTrend`/`computeMarginTrend`
(two-point deltas of an already-derived metric one quarter apart —
resolved over multi-period averages/regression as the simplest method
that preserves signal, mirroring momentum's own DMA200-slope
precedent), and `mapGuidanceEvidenceToScore` (spec §12's mapping table,
cited verbatim). `MISSING` propagates through every function; no
partial computation, no fabricated scores.

#### New — normalization & calibration (E.1C, E.1D)

Every dimension's metric and curve *shape* resolved first, numeric
anchors proposed second and labeled by source:
`SPEC_DEFINED`/`EXISTING_MODEL_PRECEDENT`/`V0_1_INVESTMENT_HYPOTHESIS`.
Revenue Growth and Guidance are spec-given, cited verbatim. Operating
Margin and FCF Margin reuse Revenue Growth's curve wholesale (deliberate,
disclosed reuse, not independent invention). Growth Trend/Margin Trend
reuse momentum's `trendAnchors` shape, geometrically scaled. Balance
Sheet (`netCashToRevenue`) got its own new **monotonic-then-plateau**
curve — resilience, not capital-allocation efficiency: weaker balance
sheets score lower, a healthy buffer scores well, and excess cash beyond
that earns no additional reward but is never penalized — achieved for
free by the existing anchor-interpolation's clamping behavior, no new
mechanism.

#### New — generic scoring engine (E.2)

- **`src/domain/signals/fundamentals-score.ts`** (new) —
  `scoreFundamentals(template, raw)`: archetype-agnostic by
  construction (never names a specific dimension key), mirrors
  `scoreMomentum`'s coverage math/minimum-evidence
  gate/weight-redistribution exactly. `FundamentalsComponentResult`/
  `FundamentalsEvidenceCoverage`/`FundamentalsScoreResult` (types)
  mirror `MomentumComponentResult`/`MomentumEvidenceCoverage`/
  `MomentumScoreResult` structurally.
- **`src/domain/signals/fundamentals-templates/growth-software.ts`**
  (new) — `GROWTH_SOFTWARE_TEMPLATE`, all 7 spec §11 dimensions, spec's
  own weights (20/10/15/10/20/15/10, sums to 1.00) adopted verbatim.
- **`RULESET.fundamentals.growthSoftware`** (`src/config/ruleset-v0.1.ts`)
  — every anchor array kept as an independent, non-aliased constant
  even where currently identical (e.g. `operatingMarginAnchors`/
  `fcfMarginAnchors` aren't aliased to `revenueGrowthAnchors`), so a
  future recalibration of one never silently moves another.
- Caught and fixed during implementation: TypeScript's `Omit` does not
  distribute over a discriminated union — `FundamentalsComponentScore`
  was introduced as a standalone union, with `FundamentalsComponentResult`
  built from it via intersection instead, to avoid silently collapsing
  the `AVAILABLE` branch's fields.

#### New — Scorecard integration (E.3, E.4)

`EngineInput`/`EngineOutput.fundamentalsResult?: FundamentalsScoreResult`
(additive, optional) and `deriveFundamentalsEvidenceScoredItem` — an
exact, symbol-for-symbol mirror of Phase D.0/D.1's momentum
integration, made possible because `FundamentalsScoreResult` was built
structurally identical to `MomentumScoreResult` from the start. `SCORED`
→ `scorecard.fundamentals` uses the live value; absent or
`INSUFFICIENT_DATA` → the existing seed pass-through, never fabricated.
`EngineOutput.fundamentalsResult` (not `scorecard.fundamentals`) is the
canonical evidence-status source — the same explicit, documented
limitation Momentum's own D.0 integration already carries.

#### Design — live evidence strategy, provider evaluation, cost validation (E.5, E.6B, E.6C, E.7A)

No code in this part — research and architecture only:

- **E.5** — two independent evidence paths (structured financials vs.
  AI-mediated Guidance text extraction), never merged until final
  assembly; `asOf` should prefer a fact's *filing* date over its
  *period-end* date (when knowledge became available, not when the
  underlying activity happened); provenance (`FundamentalsProvenance`)
  deliberately deferred until a live orchestration step actually exists
  to fail.
- **E.6B** — compared Twelve Data, Financial Modeling Prep, Alpha
  Vantage, Finnhub, Massive (formerly Polygon.io), and Tiingo against
  the contract. No provider exposed a genuine contract gap — every
  quirk (Tiingo embeds annual reports inside its quarterly array via
  `quarter === 0`; Massive/Polygon needs a capex sign-flip and a summed
  `totalDebt`; FMP's Terms of Service require a separate licensing
  agreement to display data) resolves in a provider-specific mapper.
- **E.6C** — **live-verified** (not just documentation) against the
  project's actual configured Twelve Data key: `/income_statement`,
  `/balance_sheet`, `/cash_flow`, and even `/earnings` all return
  **403** — the account is on Twelve Data's **Basic (free)** plan;
  fundamentals require the **$99/month Pro** tier. In the same pass,
  confirmed **SEC EDGAR's public XBRL API works today, for $0**, for
  Unity's own revenue/operating income/operating cash flow/capex/cash —
  concluded paid earnings-call transcripts are **not** required for a
  v0.1 Guidance path; free earnings-release/filing text is sufficient.
- **E.7A** — designed the SEC EDGAR → `RawFundamentalsData` mapper in
  detail against real, live-observed response shapes: ticker→CIK via
  SEC's bulk `company_tickers.json`; an ordered XBRL tag fallback list
  per field (only `totalDebt` sums components, by its own contract
  definition); a **live-caught** duration-based filter to separate
  single-quarter facts from year-to-date cumulative facts sharing the
  same `fp`; a **live-caught** duplicate-fact case (the same
  balance appears in two filings) resolved by keeping the
  latest-`filed` entry per canonical period key — one rule that also
  correctly handles genuine restatements. No contract change needed.

No live fundamentals provider is wired up yet (that's a future E.7B+
checkpoint) — Fundamentals evidence today is exercised only through its
own test suite and the Scorecard-integration seam, with `unity-seed.ts`'s
existing static value as the only fallback path in the running app.

Design docs: `docs/phase-e0-fundamentals-evidence-contract-design.md`
through `docs/phase-e7a-sec-edgar-structured-fundamentals-adapter-design.md`
(14 documents total).

---

## [0.9.0] — 2026-09-10

### Phase D — Momentum → Decision Engine Integration (D.0–D.5)

Wires the already-validated 6-dimension Momentum model (Phase C) into
the Scorecard and, narrowly, into ADD-zone eligibility — without
touching stance, hard constraints, concentration, target position, or
trim sizing. Establishes the integration pattern Phase E's fundamentals
work (above) directly reuses.

#### New — `EvidenceScoredItem` (D.0, D.1)

- **`src/types/evidence-scoring.ts`** (new) — `{status:"SCORED",
  item: ScoreItem} | {status:"INSUFFICIENT_DATA"}`. Deliberately
  general-purpose (not momentum-specific) and deliberately **not**
  added to `types/playbook.ts` — zero diff to that shared file.
  Resolved a genuine model-decision fork (encode insufficient evidence
  as a stale/fabricated score vs. expand `SignalState` vs. this new
  additive type) in favor of the additive type — evidence availability
  and signal state are separate concepts.
- **`deriveMomentumEvidenceScoredItem`** (`src/domain/signals/
  momentum-score.ts`) — the one place this may be produced; never
  fabricates a `SCORED`-shaped result for `INSUFFICIENT_DATA`.
- **`EngineInput`/`EngineOutput.momentumResult?: MomentumScoreResult`**
  (additive, optional) — `scorecard.momentum` uses the live value only
  when `SCORED`; absent/`INSUFFICIENT_DATA` both preserve the existing
  seed pass-through, identically. `EngineOutput.momentumResult` (not
  `scorecard.momentum`) is the canonical, full-fidelity evidence
  source — `scorecard.momentum` alone cannot distinguish "fresh" from
  "fallback," a documented, accepted limitation of the legacy
  `ScoreItem`-shaped field, not hidden.

#### New — live orchestration (D.2)

- **`src/infrastructure/market-data/twelve-data/orchestration.ts`**
  (new) — `fetchLiveMomentumResult(stockSymbol, benchmarkInstrumentId,
  checkedAt)`: composes the already-validated C.8A/C.8B pipeline
  (client → mappers → derived signals → `scoreMomentum`) into one
  function. **Never throws** — every failure (missing credentials,
  network error, provider error) is caught and converted to
  `undefined`, logged server-side only, identical to the existing
  "momentum absent" fallback path.
- **`src/app/stocks/[ticker]/page.tsx`** — now an `async` Server
  Component calling `fetchLiveMomentumResult` and passing
  `initialMomentumResult` into `PlaybookClientShell`. The API key never
  reaches the browser bundle — this is the one architectural fact the
  whole design turns on (Server vs. Client Component boundary).
- `PlaybookClientShell`'s orchestration guardrail test
  (`PlaybookClientShell.orchestration.test.ts`) still passes unmodified
  — the shell gained a new prop, not a new import.

#### New — provenance (D.3, deferred pattern reused for Fundamentals in Phase E)

**`MomentumProvenance`**/`deriveMomentumProvenance`
(`LIVE_SCORED`/`LIVE_INSUFFICIENT_DATA`/`FALLBACK`) — a pure derivation
over `MomentumScoreResult | undefined`, not new stored state. Built
only after D.2's live orchestration existed, since `FALLBACK` needed a
real fetch that could actually fail to be a meaningful, distinct case.

#### New — decision influence: stance declined, a narrow defensive ADD gate approved (D.4, D.5)

Resolved a genuine model-decision fork (does momentum influence stance,
action zones, or trim sizing at all, and how):

- **Stance: no influence in v0.1** (declined, not deferred) —
  `deriveStance`'s signature and logic are unchanged.
- **Action zones: `momentumEligible`**, a defensive-only timing gate on
  ADD (`AddEligibility`, `src/domain/playbook/action-zones.ts`) —
  ANDed alongside `accumulationEnabled`/`thesisEligible`, so it can
  only ever **remove** ADD eligibility, never grant it. Only a
  confirmed `SCORED` result with `overall.state === "Weak"` sets it
  `false`; `INSUFFICIENT_DATA`/absent/`Neutral`/`Positive` all leave it
  `true` (fail-open — `MISSING != 0` extended to decision influence,
  not just scoring).
- Trim sizing, add sizing, core protection, concentration, and target
  position gain **zero** momentum influence — resolved directly, not
  left open, per the guide's own worked example ("positive momentum
  must not bypass concentration protection").

#### Testing

New: `momentum-score.test.ts`, `momentum.test.ts`, `trend.test.ts`,
`relative-strength.test.ts`, `fundamentals*.test.ts` (Phase E, above),
`infrastructure/market-data/twelve-data/*.test.ts` (mocked HTTP, no
live network calls in the suite), `engine.test.ts` additions for every
momentum/fundamentals integration case plus explicit non-interference
checks (stance/action-zones/hard-constraints/concentration/target-position
unchanged when evidence is supplied).

Design docs: `docs/phase-d0-momentum-scorecard-integration-design.md`,
`docs/phase-d2-live-momentum-engine-orchestration-design.md`,
`docs/phase-d3-momentum-provenance-design.md`,
`docs/phase-d4-momentum-decision-influence-design.md`.

---

## [0.8.0] — 2026-09-09 / 2026-09-10

### Phase C — Live Market Data Contract & Momentum Signal Engine (C.0–C.9)

The first real (non-seed) evidence engine: a provider-independent raw
market-data contract, six deterministic technical-momentum dimensions
computed from it, and a live Twelve Data adapter — validated end to end
against Unity's real, live price history before Phase D ever wired it
into the engine.

#### New — provider-independent market-data contract (C.0)

- **`src/types/market-data.ts`** (new) — `DataField<T> =
  {status:"AVAILABLE", value, asOf} | {status:"MISSING"}`; `RawQuote`/
  `OhlcvBar`/`FxRate`/`RawMarketData`; `DerivedTechnicalSignals`.
  **Corrected during design**: an earlier draft stored a
  `quality:"FRESH"|"STALE"` tag directly on the field, creating two
  sources of truth (the tag only reflected freshness at write time).
  Fixed — `DataField` stores only `{value, asOf}`.
- **`src/domain/market-data/freshness.ts`** (new) — `evaluateFreshness(field,
  evaluationTime, policy)`, derived on demand, never stored, never
  reading an ambient clock — the fix for the bug above, generalized.
- **`src/domain/market-data/validation.ts`** (new) — structural checks only
  (currency format, positive/non-negative field values); MISSING is a
  valid state, not a validation failure.

#### New — derived technical signals (C.3, C.5)

- **`src/domain/signals/momentum.ts`** (new) — `compute50/200DayMovingAverage`,
  `computeRsi` (**Wilder's original 1978 smoothing**, approved
  2026-09-09 over Cutler's/EMA-based alternatives — a genuine
  model-decision fork, resolved explicitly, documented in place),
  `computeRelativeVolume` (this contract's own explicit convention, no
  industry-standard formula existed to defer to).
- **`src/domain/signals/trend.ts`** (new) — `computeDma200Slope`:
  percentage change of DMA200 over a configurable lookback (Primary
  Trend, approved 2026-09-10).
- **`src/domain/signals/relative-strength.ts`** (new) —
  `computeRelativeStrength`: stock return minus benchmark return over a
  configured window; `NOT_APPLICABLE` (no benchmark configured) kept
  distinct from `MISSING` (benchmark configured, data unavailable).

#### New — momentum scoring engine (C.4, C.6)

**`src/domain/signals/momentum-score.ts`** (new) — `scoreMomentum`: all
six spec §14 dimensions (Primary Trend 25%, 50/200DMA Structure 20%,
Relative Strength 20%, Volume Confirmation 15%, RSI 10%, Price
Extension 10% — spec's own literal weights, summing to 1.00),
`MomentumScoreResult` (`SCORED{overall,components,coverage}` |
`INSUFFICIENT_DATA{components,coverage}`), bounded continuous
anchor-based normalization (`interpolateAnchors`), a minimum-evidence
gate. `NOT_APPLICABLE` excluded from `applicableWeight` entirely
(distinct treatment from `MISSING`, which stays in it and reduces
`availableWeightShare`) — approved 2026-09-10.

#### New — Twelve Data adapter (C.7, C.8A, C.8B)

- **`src/infrastructure/market-data/twelve-data/`** (new) — `client.ts`
  (thin fetch, returns `unknown`, redacts the API key from every error
  message, one request per call, no silent retry), `errors.ts`
  (`TwelveDataApiError` for whole-request provider failures, distinct
  from a field-level `MISSING`), `mappers.ts` (pure payload → contract
  functions; never trusts the provider's default newest-first bar
  order, re-sorts ascending itself), `parsing.ts`, `types.ts`, `env.ts`.
  Contract researched against Twelve Data's live OpenAPI spec first
  (`docs/validation/c7-twelve-data-contract-check.md`) — provider
  chosen only after the contract was already fixed.
- **`scripts/validate-live-market-data.ts`** (new) — one-off manual
  script (not part of the Vitest suite, makes real network calls),
  confirmed the full live pipeline end-to-end against Unity: a real
  `SCORED` momentum result, 7/10, 100% evidence coverage.
- **`.gitignore`** — added `!.env*.example` to un-blanket the `.env*`
  rule for future committable, secret-free example files. The real
  `TWELVE_DATA_API_KEY` lives in `.env.local`, gitignored, never
  logged or committed at any point in this phase.

#### Testing

New: `market-data/freshness.test.ts`, `market-data/validation.test.ts`,
`momentum.test.ts`, `momentum-score.test.ts`, `trend.test.ts`,
`relative-strength.test.ts`, `infrastructure/market-data/twelve-data/
client.test.ts`/`mappers.test.ts` — all mocked-`fetch`, no live network
calls in the automated suite (live validation is the separate,
manually-run script above).

Design/validation docs: `docs/phase-c0-market-data-contract.md`,
`docs/phase-c5-trend-relative-strength-data-contract.md`,
`docs/phase-c6-trend-relative-strength-normalization-design.md`,
`docs/validation/c4-momentum-score-normalization-report.md`,
`docs/validation/c6-momentum-normalization-report.md`,
`docs/validation/c7-twelve-data-contract-check.md`.

---

## [0.7.0] — 2026-09-09

### Phase B.5 — Algorithm Validation (B.5.1–B.5.7, now complete)

Systematic validation of the Decision Engine against
`docs/playbook-decision-engine-spec-v0.1.md`, one checkpoint at a time,
per `docs/phase-b5-algorithm-validation.md`. Every checkpoint validates
CURRENT behavior via real domain function calls (never hand-derived
numbers); findings are classified PASS / IMPLEMENTATION BUG / RULE /
MODEL DESIGN QUESTION / NOT YET IMPLEMENTED, and only explicit,
approved decisions change application code. Test suite grew from 33 to
154 tests across this effort, all under `src/domain/validation/` plus
focused unit tests alongside the domain modules they cover.

#### Phase B.5 Closeout

No application code changed. Consolidated a "Phase B.5 Closeout"
section into `docs/phase-b5-algorithm-validation.md` covering: what's
now validated (transaction accounting, cash-inclusive portfolio total,
concentration states, the target-position/sizing model, BUY/SELL
propagation, hard constraints, thesis ADD eligibility, core protection,
stance/action-zone transitions, and stock-generic behavior across
multiple synthetic strategies); the full deferred-items list (missing/
stale-data semantics, a derived confidence model, HC-004/HC-005,
`trimSizing` vs. `targetPosition.trimCapacity` integration, transaction
recording vs. strategy guardrails, a possible warning when exceeding
`maximumNormalTrim`, real fundamentals/valuation/technical models, and
AI research/thesis evidence — none are B.5 failures, all previously
classified NOT YET IMPLEMENTED or deferred); and Phase C entry
criteria. **Phase C can begin** — the deterministic engine is validated
independently of any external market-data provider, and B.5.7 proved it
is configurable and stock-generic within its current scope. **Phase C
is not started by this closeout.**

#### New — Target Position & Sizing Model (B.5.1 Resolution)

B.5.1 found the engine had no defined interaction between the target
weight range and the core share range for tactical trimming/adding.
Resolved with a new, generic, two-sided capacity model:

- **`src/domain/portfolio/target-position.ts`** (new) — `deriveTargetPosition`,
  `resolveCoreShareRange`. Computes Weight-Share Range (ceil/floor
  rounding so boundary shares actually satisfy the weight guarantee),
  Feasible Strategy Range (intersection with the core range, when
  configured), Strategy Alignment (`ALIGNED`/`CONFLICTING`/`NOT_APPLICABLE`),
  and three capacity tiers per direction — Minimum, Preferred, Maximum
  Normal. **Capacity ≠ recommendation.** Exposed as
  `EngineOutput.targetPosition`. Spec: §21A.
- **`Strategy.coreSharesMin`/`coreSharesMax`** (`src/types/playbook.ts`)
  made an optional pair — invalid if only one is present, rejected by
  `resolveCoreShareRange` rather than silently coerced. New optional
  `preferredTargetWeightPct` field for strategies with no core range.
- **Fixed — portfolio-total convention.** Portfolio Total = Securities +
  Cash; BUY and SELL both now leave `portfolioTotalEur` unchanged
  (previously BUY grew it as external capital, SELL shrank it — both
  contradicted the cash-inclusive convention). New
  `calcPortfolioTotalAfterBuy`/`calcPortfolioTotalAfterSell`
  (`src/domain/portfolio/accounting.ts`), used consistently by
  `applyBuy`/`applySell`, the shell, and the modal preview.
- Note: `targetPosition.trimCapacity` (strategic capacity) and the
  older `concentration.trimSizing` (tactical L1/L2/L3 execution
  staging) intentionally coexist, unreconciled — reconciling them is a
  deferred TODO, not done here.

#### Fixed — HC-003 now distinguishes WEAKENING from BROKEN (B.5.4B)

`checkHC003` (`src/domain/playbook/hard-constraints.ts`) previously
waived core-breach protection for **both** WEAKENING and BROKEN thesis.
B.5.4B validation found this was coarser than the rest of the engine
(HC-002 is BROKEN-only; stance only escalates unconditionally for
BROKEN) and surfaced it as a rule/model design question. Approved
resolution:

```text
INTACT     → core protection active
WEAKENING  → core protection remains active — thesis is under concern,
             but the long-term core commitment has not yet been invalidated
BROKEN     → core protection removed — the thesis supporting the
             long-term core is no longer valid
```

`targetPosition`/`maximumNormalTrim` were deliberately **not** changed —
they remain thesis-independent by design (confirmed across all 5
`ThesisHealth` values, including in B.5.5). Spec §16 updated to match.

#### Implemented — spec §22 ADD thesis eligibility (B.5.5)

B.5.5 found `deriveActionZoneState`'s ADD case checked only
concentration state and `accumulationEnabled` — spec §22's `thesis IN
[INTACT, STRENGTHENING]` clause was not implemented, so MIXED and
WEAKENING both produced `ADD = ACTIVE`. Approved v0.1 decision:

```text
ADD thesis-eligible:    STRENGTHENING, INTACT
ADD thesis-ineligible:  MIXED, WEAKENING, BROKEN
```

MIXED and WEAKENING deliberately share this outcome for v0.1 — no new
stance/HC rule was added to separate them; that distinction remains in
`ThesisHealth`/`scorecard.thesisHealth` for now. BROKEN stays
structurally different (the only state where HC-003 core protection is
removed, and separately ADD-ineligible via HC-002).

- **New** `isThesisEligibleForAdd` (`src/domain/thesis/thesis.ts`) —
  single source of truth for the §22 thesis clause.
- **Changed** `deriveActionZoneState`'s third parameter
  (`src/domain/playbook/action-zones.ts`) from a bare
  `accumulationEnabled` boolean to an `AddEligibility {
  accumulationEnabled, thesisEligible }` gate object, ANDed together in
  the ADD case — structured so Phase C fundamentals/valuation gates can
  be added later without restructuring the function. No other zone
  type reads it.
- `fundamental_score >= 60`/`valuation_score >= 60` (the other two §22
  clauses) remain **not implemented** — genuinely deferred to Phase C.

#### Validated — contradictions preserved, missing/stale-data gap confirmed (B.5.6)

No application code changed. Two real-engine contradiction scenarios
both PASS: (1) strong fundamentals/momentum + expensive valuation +
OVERWEIGHT concentration — all six scorecard dimensions stay
independent (no blended score anywhere), stance/ADD/TRIM follow
concentration + HC-001 as designed; (2) strong company signals (9/9/9)
+ thesis MIXED — the B.5.5 thesis-eligibility gate correctly keeps
`ADD = INACTIVE` even with accumulation enabled and top scores
everywhere, confirming thesis caution wins over strong signals rather
than being averaged away.

Two scenarios confirmed **NOT YET IMPLEMENTED** (architecture absence,
not a bug): missing signal data has no representation anywhere
(`ScoreItem`/`Scorecard`/`MarketData`/`Position` have no optional/
nullable fields, no `INCOMPLETE` state exists, HC-005 doesn't exist) —
demonstrated directly, an all-zero scorecard still produces an ordinary
`HOLD` + `ADD = ACTIVE` with no warning. Stale data fares the same:
`EngineInput` never carries a timestamp at all, `EngineOutput` has no
`confidence` field, `Playbook.confidence` is a static seed with no
derivation function, and HC-004 doesn't exist. Report:
`docs/validation/b5.6-contradictions-failure-states-report.md`.

#### Validated — Decision Engine is stock-generic (B.5.7, Phase B.5 closeout)

No application code changed. First B.5 checkpoint to run
`runDecisionEngine()` against anything other than Unity's seed data:
three fully synthetic strategies, none built from Unity's numbers — a
brand-new zero-share position with a weight-only strategy and no
`preferredTargetWeightPct` (midpoint fallback), an UNDERWEIGHT position
at a different price/portfolio scale with an explicit
`preferredTargetWeightPct`, and an OVERWEIGHT position with its own
target range, a short-term ceiling deliberately decoupled from that
target max, and its own core range under a WEAKENING thesis. All three
produced correct `PositionSizingState`, preferred targets, add/trim
capacities, `ConcentrationState`, HC-001/002/003 behavior, thesis ADD
eligibility, stance (including the `REDUCE_RISK` branch), and action
zones — **PASS**, with zero Unity-specific coupling found anywhere in
the rule/decision logic (checked directly via source inspection).
Confirmed HC-001 and OVERWEIGHT concentration are genuinely independent
per-strategy knobs — they only always co-occur in Unity's own
configuration, not a hidden general rule. **Phase B.5 Algorithm
Validation is now complete (B.5.1–B.5.7).** Report:
`docs/validation/b5.7-generalization-report.md`.

#### New — `docs/VALIDATION_PROTOCOL.md`

Default process for all remaining B.5 checkpoints, replacing the
heavier report-plus-review-packet pattern used through B.5.4A: one lean
`docs/validation/<checkpoint>.md` per checkpoint (Status / Scenarios /
Expected vs Actual / Findings / Tests / Decision Needed), a fixed
4-way classification taxonomy, explicit stop conditions (spec/impl
disagreement, cross-layer conflicts, required product decisions), and a
standing list of deferred issues that should not be re-reported as new
findings each checkpoint.

#### Validation results (no other application code changed)

| Checkpoint | Result | Notes |
|---|---|---|
| B.5.1 Unity Baseline | PASS | Trim Sizing question → resolved via the new Target Position model above |
| B.5.2A/B Transaction (SELL/BUY) | PASS | Surfaced a deferred question: transaction recording vs. Playbook recommendation (should HC-003 ever become a warning instead of a hard block?) — not resolved |
| B.5.3A/B Concentration Thresholds (50%/45%) | PASS | Resolved: `MODERATELY_OVERWEIGHT → HOLD` (not grouped with `OVERWEIGHT`'s `HOLD_TRIM`) is the approved v0.1 severity ladder; spec §18 updated, no code changed |
| B.5.4A Core Protection (healthy thesis) | PASS | Resolved: HC-003 (core-only) and `maximumNormalTrim` (core-and-weight-aware) are an intentional two-layer distinction, not a bug |
| B.5.4B Core Protection (thesis deterioration) | PASS (after the HC-003 fix above) | See above |
| B.5.5 Thesis Validation | **PASS / COMPLETE** | Implemented spec §22's ADD thesis-eligibility clause (see above) and revalidated all five thesis states — see B.5.5 report for the full ladder |
| B.5.6 Contradictions & Failure States | **PASS / COMPLETE** | Contradiction scenarios PASS (see above); missing/stale-data scenarios confirmed NOT YET IMPLEMENTED — no representation of absence anywhere in the domain layer, HC-004/HC-005 don't exist, `confidence` is never derived |
| B.5.7 Generalization Test | **PASS / COMPLETE** | Three synthetic, non-Unity strategies validated end-to-end through the real engine (see above) — no hidden Unity-specific coupling found. **Phase B.5 is now complete; Phase C is next** |

Reports: `docs/validation/b5.1-baseline-report.md` through
`docs/validation/b5.7-generalization-report.md`. Full status and
progress tracker: `docs/phase-b5-algorithm-validation.md`.

---

## [0.6.0] — 2026-09-08

### Decision Engine — Composable Engine Module, Regrouped Output, Thesis/Signals Seams

The six-call pipeline that used to be sequenced inline inside `PlaybookClientShell` is now a single composable, React-free function. The engine can be called and tested without rendering React, and its output is grouped by domain layer instead of one flat object.

#### New composition root (`src/domain/engine.ts`)
- `runDecisionEngine(EngineInput): EngineOutput` — sequences thesis → signals → concentration → hard constraints → stance → action zones → scorecard → trim sizing; contains no investment logic of its own, only composition of the existing pure functions
- `EngineOutput` grouped by layer (previously 10 flat fields):
  ```ts
  {
    concentration: { state, targetShares, sharesToTarget, tacticalInventory, trimSizing },
    thesis: { health },
    constraints: { hc001, hc002, fired, accumulationEnabled },
    stance,
    actionZones,
    scorecard,
  }
  ```
- **Added** `PlaybookSnapshot` type — `{ position, portfolioTotalEur, engine }`, for future Playbook history/snapshots. The engine deliberately does not echo its own inputs back inside `EngineOutput`.

#### New domain seams
- **`src/domain/thesis/thesis.ts`** — `deriveThesisHealth` (pass-through of the seed value; real thesis classification lands in Phase D) and `deriveThesisScoreItem` (canonical `ThesisHealth` → `ScoreItem` mapping, same pattern as `calcConcentrationRiskScore`)
- **`src/domain/signals/signals.ts`** — `deriveFundamentalsScore` / `deriveValuationScore` / `deriveTechnicalScore` / `deriveSignals`, currently pass-through of seed scorecard values; real fundamentals/valuation/technical formulas land in Phase C

#### Fixed — duplicate thesis state
`scorecard.thesisHealth` was previously an independently-seeded `ScoreItem` (`unityScorecard.thesisHealth`) that could silently disagree with `playbook.thesisHealth`. The engine now always sets `scorecard.thesisHealth = deriveThesisScoreItem(thesis.health)` — it can no longer drift out of sync with the canonical thesis state. Verified for all 5 `ThesisHealth` values in `engine.test.ts`.

#### `PlaybookClientShell.tsx`
- No longer imports or sequences the six domain modules directly — calls `runDecisionEngine()` once per render and renders its output
- Only imports `@/domain/engine` (decisions) and `@/domain/portfolio/accounting` (BUY/SELL, applied before the engine runs)

#### `PlaybookStatusBanner.tsx`
- Takes `thesisHealth` as an explicit prop (engine output) instead of reading `seed.playbook.thesisHealth` directly

#### Testing (new)
- Vitest added — `npm test` runs `vitest run`; config at `vitest.config.ts`, no jsdom (all domain tests are pure functions, no React rendering)
- **`src/domain/engine.test.ts`** — regression-vs-manual-pipeline equivalence (Unity baseline, BUY, SELL), scenario coverage (Unity baseline figures, BUY, SELL, overweight concentration, HC-001-disabled ADD, HOLD/TRIM stance, tactical trim sizing), thesis-non-divergence across all 5 `ThesisHealth` values, `PlaybookSnapshot` shape
- **`src/domain/thesis/thesis.test.ts`**, **`src/domain/signals/signals.test.ts`**
- **`src/components/playbook/PlaybookClientShell.orchestration.test.ts`** — static guardrail asserting the shell source never imports the individual domain modules directly (catches decision orchestration leaking back into React)

No formulas, thresholds, or rendered output changed — verified against the Unity production baseline before and after.

---

## [0.5.1] — 2026-09-08

### Fixed — HOLD_TRIM Stance Distinction & HC-003 Confirm Gating

#### `deriveStance` (`src/domain/playbook/stance-rules.ts`)
- **Added** `HOLD_TRIM` stance, distinct from `HOLD_GRADUALLY_TRIM` — `OVERWEIGHT` now returns `HOLD_TRIM`; `SEVERELY_OVERWEIGHT` keeps `HOLD_GRADUALLY_TRIM`. Previously both concentration severities collapsed onto the same stance label. Matches spec §18 ("`MODERATELY_OVERWEIGHT/OVERWEIGHT → HOLD_TRIM`") and the spec's worked example (`"stance": "HOLD_TRIM"`)
- **Added** `HOLD_TRIM` to the `Stance` union (`src/types/playbook.ts`) and to `stanceDisplayLabel`

#### `StanceBadge` (`src/components/shared/StanceBadge.tsx`)
- **Added** `HOLD_TRIM` badge entry — "HOLD / TRIM", amber-50/amber-700 (lighter than `HOLD_GRADUALLY_TRIM`'s amber-800, signaling lower severity)

#### `AddTransactionModal` (`src/components/playbook/AddTransactionModal.tsx`)
- **Fixed** — the Confirm button was gated only on form validity (`isValid`), not on HC-003. A sell that breached the core-share minimum could previously be confirmed even while the HC-003 warning banner was showing. Added `canConfirm = isValid && !hc003?.triggered`; Confirm is now disabled whenever HC-003 is triggered.

#### Known gap (pre-existing, not fixed here — flagged for Algorithm Validation)
`deriveStance`'s `MODERATELY_OVERWEIGHT` branch still returns plain `HOLD`, not `HOLD_TRIM`, though spec §18 groups `MODERATELY_OVERWEIGHT/OVERWEIGHT` together under `HOLD_TRIM`. This predates all changes above — left untouched as a Decision Engine formula question, not a naming/wiring fix.

---

## [0.5.0] — 2026-09-07

### Add Transaction — BUY & SELL with Live Preview and Full Engine Recalculation

The "+ Transaction" button in the Unity Playbook page is now fully functional. Every confirmed transaction runs through the deterministic engine and updates the entire page in real time — no page reload.

#### New components

- **`AddTransactionModal`** (`src/components/playbook/AddTransactionModal.tsx`)
  - BUY / SELL toggle (teal / orange)
  - Entry by shares or by total amount (€); amount auto-converts to share count
  - Price pre-filled from `currentPriceEur`; resets on each open
  - Live "After this transaction" preview: shares delta, avg cost, weight delta (+/− pp), concentration badge, target info, realized gain (SELL only)
  - L1 / L2 trim quick-fill buttons in SELL mode (pre-calculated from tactical inventory)
  - Confirm disabled until valid (price > 0, shares > 0, no oversell)
  - Escape key and scrim click dismiss

#### Accounting (`src/domain/portfolio/accounting.ts`)
- **BUY** — weighted average cost updates: `newAvgCost = (oldShares × oldAvgCost + newShares × price) / totalShares`
- **SELL** — avg cost left unchanged (correct under weighted-average accounting, not tax-lot)
- `realizedGainEur = (sellPrice − avgCost) × shares`; `realizedGainPct = (sellPrice − avgCost) / avgCost`
- `previewBuy` / `previewSell` — safe read-only versions used by modal; `previewSell` returns old position on oversell
- All values rounded to 2 decimal places (`Math.round(n * 100) / 100`)

#### State and recalculation (`src/components/playbook/PlaybookClientShell.tsx`)
- `handleTransaction(type, shares, priceEur)` updates `position` and `portfolioTotalEur` state
- Full engine pipeline re-runs on every render: concentration → hard constraints → stance → action zones → scorecard → target shares → trim sizing
- Timeline entry written for every confirmed transaction with type, shares, price, avg cost / realized gain, and resulting weight
- `portfolioTotalEur` decreases on SELL (treats portfolio as invested-capital basis, not including cash)

#### What recalculates after each transaction
| Signal | After BUY | After SELL |
|---|---|---|
| Shares + avg cost | Updated | Shares updated; avg cost unchanged |
| Portfolio weight | Recalculated | Recalculated |
| Concentration state | Re-derived | Re-derived |
| Action zone states (ADD/TRIM levels) | Re-derived | Re-derived |
| Scorecard (position fit, conc. risk) | Recalculated | Recalculated |
| Stance | Re-derived | Re-derived |
| Timeline | New entry prepended | New entry prepended (with realized gain) |

---

## [0.4.0] — 2026-09-07

### Decision Engine — Full Deterministic Implementation

Implemented the full deterministic playbook engine based on the spec in `docs/playbook-decision-engine-spec-v0.1.md`. AI never owns portfolio accounting or overrides hard constraints. All calculations are pure TypeScript in `src/domain/` with zero React imports.

#### Spec placed in docs
- Copied `playbook-decision-engine-spec-v0.1.md` → `docs/` for permanent project reference

#### Configuration (`src/config/ruleset-v0.1.ts`)
Versioned parameter registry — all thresholds in one place:
- `concentration.moderateMultiplier: 1.15`, `severeMultiplier: 1.30`
- `trimStaging.level1Fraction: 0.30`, `level2Fraction: 0.35`
- `positionFit.penaltyCoefficient: 200`
- `confidence.mediumThreshold: 0.55`, `highThreshold: 0.80`

#### Portfolio domain (`src/domain/portfolio/`)

**`concentration.ts`**
- `classifyConcentration(weightPct, targetMaxPct)` — 4 states: WITHIN_TARGET / MODERATELY_OVERWEIGHT / OVERWEIGHT / SEVERELY_OVERWEIGHT using RULESET multipliers
- `calcTargetShares(portfolioValueEur, targetWeightPct, currentPriceEur)` — `floor(portfolioValue × targetWeight / price)`
- `calcTacticalInventory(currentShares, coreMax, coreMin)` — shares above core max
- `calcTrimSizing(maxTacticalTrim)` — L1 = 30%, L2 = 35%, L3 = remainder of tactical

**`accounting.ts`** — see [0.5.0] above

#### Playbook domain (`src/domain/playbook/`)

**`hard-constraints.ts`**
- HC-001: weight > accumulation max → blocks ADD
- HC-002: thesisHealth === "BROKEN" → blocks ADD
- HC-003: sell breaches core position AND thesis not deteriorating → warns on SELL

**`stance-rules.ts`**
- `deriveStance(concentrationState, thesisHealth)` — priority matrix (BROKEN → THESIS_REVIEW, WEAKENING + OVERWEIGHT → REDUCE_RISK, SEVERELY → HOLD_GRADUALLY_TRIM, etc.)
- `stanceDisplayLabel` record for UI rendering

**`action-zones.ts`**
- `deriveActionZoneState(type, concentrationState, accumulationEnabled)` — each zone state derived, not hardcoded
- TRIM_1: INACTIVE for WITHIN/MODERATELY, WATCH for OVERWEIGHT, ACTIVE for SEVERELY
- TRIM_2: INACTIVE for WITHIN/MODERATELY/OVERWEIGHT, WATCH for SEVERELY

**`scoring.ts`**
- `calcPositionFitScore` — spec §9 formula: `score = max(0, 100 − 200 × excessRatio)`, scaled to 1–10
- `calcConcentrationRiskScore` — mapped from concentration state
- `recalculateScorecard` — updates only positionFit + concentrationRisk; other signals unchanged

#### Shell component (`src/components/playbook/PlaybookClientShell.tsx`)
- Single client component owns all mutable state; runs full engine pipeline on every render
- Props: `seed`, `initialZones`, `initialScorecard`, `initialTimeline`, `initialPortfolioTotalEur`
- Renders all page sections with live engine output

#### ActionZone: Accordion → Drawer redesign

Replaced the expand-in-place accordion pattern with compact cards + Apple-style right-side slide-in drawer.

- **`ActionZoneCard`** — rewritten as pure stateless `<button>`: shows zone label, state, one-line summary, chevron. `isSelected` adds ring. No expand logic.
- **`ActionZoneDrawer`** — fixed 460px right-side panel: `cubic-bezier(0.32, 0.72, 0, 1)` enter, `--ease-in` exit. Scrollable body with: Summary, Primary trigger, Suggested action, Why bullets, Do not trigger if, Trim sizing (TRIM_1/TRIM_2), Sources.
  - ADD + INACTIVE: shows "Why inactive" with fired HC codes and descriptions
  - TRIM_1/TRIM_2: shows "Suggested trim sizing" with L1/L2/L3 share counts
- **`actionZoneConfig.ts`** — shared label + per-state style config extracted for card and drawer to import

#### Other component updates
- **`PlaybookStatusBanner`** — stance now derived (`stanceDisplayLabel[stance]`), not hardcoded
- **`PositionAndStrategy`** — concentration badge, target shares, sell-to-target, tactical inventory display
- **`TimelinePreview`** — accepts `timeline` prop (no direct data import); SELL entries show orange dot
- **`StockHeader`** — `onAddTransaction` prop wired to "+ Transaction" button
- **`ActionZoneSection`** — passes `trimSizing` and `firedConstraints` to drawer

---

## [0.3.0] — 2026-09-06

### Real Playbook Alignment — Unity seed derived from `unity-playbook.md`

The Unity mock data was replaced with values derived directly from the real investment
strategy document (`src/data/unity-playbook.md`). The prototype now reflects the actual
playbook rather than an invented mock strategy.

#### Types (`src/types/playbook.ts`)
- **Renamed** `Stance` value `"HOLD_TRIM"` → `"HOLD_GRADUALLY_TRIM"` — "gradually" is load-bearing in the trim framework
- **Added** `isin?: string` and `executionCurrency?: string` to `Security` — matches the real playbook seed (§27) and dual-market framework (§5)
- **Renamed** `risk` → `concentrationRisk` in `Scorecard` — the playbook (§20) distinguishes concentration risk as its own dimension, separate from general risk

#### Data (`src/data/unity-seed.ts`)
- **Updated** `stance` from `"HOLD_TRIM"` → `"HOLD_GRADUALLY_TRIM"`
- **Added** `isin: "US91332U1016"` and `executionCurrency: "EUR"` to security
- **Fixed** `TRIM_2.suggestedShares` from `"75–125"` → `"75–100"` (playbook §15 specifies 75–100 for the second trim)
- **Renamed** scorecard field `risk` → `concentrationRisk`
- **Updated** `catalysts` to name Unity's products explicitly: **Grow** (advertising), **Vector** (AI monetization), **Create** (engine) — previously generic platform language
- **Expanded** `thesisBreakers` from 4 → 7 items, adding:
  - Failure of key monetization initiatives (Grow, Vector) to produce expected results
  - Major competitive deterioration in core markets
  - Materially increased balance-sheet or liquidity risk
- **Expanded** `THESIS_REVIEW.whyBullets` from 4 → 6 items, adding:
  - Major competitive deterioration in core markets
  - Balance-sheet or liquidity risk increases materially

#### Components
- **Renamed** `StanceBadge` key `HOLD_TRIM` → `HOLD_GRADUALLY_TRIM` (display label was already correct)
- **Fixed** `SignalScorecard` scorecard row key `"risk"` → `"concentrationRisk"` and label `"Risk"` → `"Concentration risk"`
- **Fixed** `SignalScorecard` summary labels: `"Entry attractiveness"` → `"Valuation"`, `"Portfolio fit"` → `"Position fit"`, value `"Low"` → `"Poor"` — now matches playbook §20 vocabulary

#### Portfolio seed (`src/data/portfolio-seed.ts`)
- **Updated** Unity holding `playbookStance` from `"HOLD_TRIM"` → `"HOLD_GRADUALLY_TRIM"`

---

## [0.2.0] — 2026-09-06

### Design Polish — Apple Design Skill Applied

#### PortfolioSummaryCards (`src/components/portfolio/PortfolioSummaryCards.tsx`)
Redesigned against Apple design principles (§15 Typography, §7 Craft, §6 Simplicity, §16 Principle 8 Delight):

- **Removed** `AlertTriangle` icon — alert state now expressed through color alone
- **Updated** value typography: `text-2xl font-semibold` → `text-3xl font-light tracking-tight tabular-nums` — larger but lighter, matching Apple data display and existing `StockHeader` price style
- **Refined** label: `text-xs tracking-wide` → `text-[11px] tracking-widest mb-3` — tighter optical control, more separation before value
- **Added** amber border (`border-amber-200`) to alert cards — entire card signals urgency, not just an icon
- **Updated** sub-label: `mt-0.5` → `mt-1.5` for breathing room below large numbers
- **Changed** card shape: `rounded-lg` → `rounded-xl`

#### ActionZoneCard (`src/components/playbook/ActionZoneCard.tsx`)
Refined against Apple design principles (§7 Spatial consistency, §16 Simplicity, §15 Typography, §1 Response):

- **Added** asymmetric easing: open uses `ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`), close uses `ease-in` (`cubic-bezier(0.68, 0, 0.77, 0.32)`) — the two directions now feel physically distinct
- **Added** `--ease-in` token to `globals.css`
- **Differentiated** opacity timing: 150ms on open, 100ms on close — content fades before height collapses
- **Removed** disabled "Edit rule" button — permanently disabled UI earns no place
- **Removed** redundant "Close" button — the header toggle is always visible and sufficient
- **Refined** all section labels: `text-xs font-semibold tracking-wide` → `text-[11px] font-medium tracking-widest` — labels recede relative to content
- **Updated** state label in collapsed header: `text-stone-400` → `text-stone-500` — ACTIVE/WATCH state legible at a glance

---

## [0.1.0] — 2026-09-04 / 2026-09-05

### Animation Audit — All 7 Plans Executed

Ran a full `improve-animations` audit across 8 categories. 7 plans produced and executed.
All plans documented in `plans/`.

#### Plan 001 — Accessibility baseline (HIGH)
- **Added** `@media (prefers-reduced-motion: reduce)` block to `globals.css`
- Suppresses all `animation` and `transition-duration` to `0.01ms` for users who prefer reduced motion
- Color/state feedback preserved (completes at near-zero duration, no positional movement)

#### Plan 002 — Performance: remove `transition-all` on bar elements (MEDIUM)
- **Fixed** `ConcentrationOverview.tsx` and `SignalScorecard.tsx`: `transition-all` → `transition-colors`
- `transition-all` would animate layout-triggering `width` off-GPU when live data arrives

#### Plan 003 — Missed opportunity: ActionZoneCard accordion animation (MEDIUM)
- **Replaced** `{isOpen && (...)}` boolean mount/unmount with always-mounted content
- Height animated via CSS `grid-template-rows: 0fr → 1fr` (no hardcoded pixel heights)
- Opacity fades simultaneously; CSS transitions retarget correctly on rapid toggling

#### Plan 004 — Physicality: button press feedback (MEDIUM)
- **Added** `motion-safe:active:scale-[0.97]` to primary action buttons
- Affected: `ActionZoneCard` toggle, `StockHeader` Transaction/Research buttons, `PortfolioHeader` Add stock button
- `motion-safe:` variant gates scale behind `prefers-reduced-motion: no-preference`

#### Plan 005 — Cohesion: motion easing tokens (LOW)
- **Added** CSS custom properties to `globals.css` `:root`:
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — strong ease-out for UI
  - `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` — for on-screen movement
- All subsequent animation plans reference these tokens

#### Plan 006 — Missed opportunity: bar grow-in animation (LOW)
- **Added** `@keyframes bar-grow-in` and `.bar-grow-in` class to `globals.css`
- Uses `transform: scaleX(0 → 1)` with `transform-origin: left center` (GPU-composited, 600ms)
- Applied to bars in: `ConcentrationOverview`, `SignalScorecard`, `ConcentrationMeter`
- Reduced-motion users see instant snap (Plan 001 handles this globally)

#### Plan 007 — Missed opportunity: chevron rotation (LOW)
- **Replaced** `ChevronUp` / `ChevronDown` icon swap with single `ChevronDown` + `rotate-180`
- Transition: `transition-transform 250ms var(--ease-out)`
- Removed unused `ChevronUp` import

---

## [0.0.1] — 2026-09-04

### Phase 0 Prototype — Initial Build

#### App shell and routing
- Next.js 16 App Router with TypeScript and Tailwind CSS (Geist font)
- `AppShell` — 220px sidebar, Portfolio + Settings nav, active route highlighting
- Routes: `/` (Portfolio Overview), `/stocks/[ticker]` (Stock Playbook)

#### Portfolio Overview page (`/`)
- `PortfolioHeader` — total value, unrealized return, last-updated timestamp
- `PortfolioSummaryCards` — largest position, positions count, needs attention
- `ConcentrationOverview` — weight bars per holding, delta from target
- `HoldingsTable` — sortable columns: stock, price, return, weight, playbook stance; Unity row is clickable

#### Unity Stock Playbook page (`/stocks/U`)
- `StockHeader` — name, ticker, dual-market prices (NYSE USD + Trade Republic EUR), action buttons
- `StanceBadge` — semantic color system: positive/neutral/attention/risk (not green=buy/red=sell)
- `SignalScorecard` — 6-dimension scorecard with score bars and summary conclusions
- `ConcentrationMeter` — visual bar showing current weight vs target range
- `ThesisCard` — thesis text, catalysts, risks, thesis breakers, view changes
- `ActionZoneCard` — 5 zones (ADD/HOLD/TRIM_1/TRIM_2/THESIS_REVIEW), collapsed/expanded states
- `ResearchPreview` — processed document list
- `TimelinePreview` — chronological event log
- `PlaybookStatusBanner` — stance, confidence, thesis health, version, last updated

#### Data layer
- `src/types/playbook.ts` — full TypeScript type system
- `src/data/unity-seed.ts` — Unity mock data (position, action zones, scorecard, thesis, timeline)
- `src/data/portfolio-seed.ts` — 5-holding portfolio (Unity 58.6%, ASML 14.3%, VWRL 13.1%, BTC 8%, Other 6%)
- `src/lib/format.ts` — `formatEur`, `formatEurDecimals`, `formatPct`, `formatShares`

#### Design skills installed (project-local, `.claude/skills/`)
Four Emil Kowalski skills installed via `npx skills@1.5.23`. Advisory only — do not override product specs.

| Skill | Invoke |
|---|---|
| `apple-design` | `/apple-design` |
| `improve-animations` | `/improve-animations` |
| `review-animations` | `/review-animations` |
| `prototype` | `/prototype` |

Version hashes tracked in `skills-lock.json`.

#### GitHub
- Repository deployed to `github.com/Cirooochen/iStockPlaybook`
