# Phase E.7A — SEC EDGAR Structured Fundamentals Adapter Design

Status: DESIGN ONLY — no application code changed, no scoring/contract
change. **No MODEL DECISION REQUIRED.** Every one of the 9 resolve
items below has a single, well-reasoned answer grounded in E.6C's real,
live API responses (Unity, CIK `0001810806`) — not just EDGAR's
documentation. Two additional live checks were made this session,
beyond E.6C's, specifically to firm up this design (§0).

## 0. What was read / additionally verified this session

- `docs/phase-e5-fundamentals-live-evidence-strategy.md` through
  `docs/phase-e6c-fundamentals-live-contract-cost-validation.md` — the
  target contract (`RawFundamentalsData`/`RawFundamentalsPeriod`, E.6A)
  and E.6C's live findings: `companyconcept`/`companyfacts` confirmed
  working for Unity's revenue, operating income, operating cash flow,
  capex, and cash & equivalents; a debt-related tag 404'd; 8-K filing
  lists confirmed accessible.
- **New this session** — two live checks specifically to resolve open
  questions E.6C didn't need to answer:
  1. `https://www.sec.gov/files/company_tickers.json` — CONFIRMED: a
     free, bulk, exact ticker→CIK mapping (10,407 entries), e.g.
     `{"cik_str": 1810806, "ticker": "U", "title": "Unity Software Inc."}`.
     A better-fit mechanism than E.6C's company-*name* search for §1.
  2. `companyconcept/.../CashAndCashEquivalentsAtCarryingValue.json` —
     CONFIRMED the **instant-fact shape** (balance-sheet concepts carry
     only `end`, no `start`, unlike revenue's duration-fact shape) and
     directly surfaced a **real duplicate-fact case**: the same
     `end: "2025-12-31"` balance (`val: 2055840000`) appears in *two*
     filings — once as its own quarter's figure (`accn ...-000032`,
     `fp: "Q1"`, `filed: "2026-05-07"`, no `frame`) and again as the
     *comparative prior-period* figure inside the next quarter's 10-Q
     (`accn ...-000043`, `fp: "Q2"`, `filed: "2026-08-06"`,
     `frame: "CY2025Q4I"`). This directly informs §4's deduplication
     rule below — not a hypothetical, a live example.
  3. Re-confirmed (E.6C) revenue's own duplicate-shape nuance: the same
     `RevenueFromContractWithCustomerExcludingAssessedTax` concept
     returns **both** a 3-month fact (`start:"2026-01-01"`,
     `end:"2026-03-31"`, `fp:"Q1"`) **and** a 6-month cumulative fact
     (`start:"2026-01-01"`, `end:"2026-06-30"`, `fp:"Q2"`) — `fp` alone
     does not distinguish "this quarter" from "year-to-date through
     this quarter." Directly informs §4.

## 1. Required SEC identifiers

**Ticker → CIK**: use the bulk `company_tickers.json` file (§0.2) —
live-confirmed exact-match lookup (`ticker: "U"` → `cik_str: 1810806`),
not the company-*name* search E.6C used for its own quick verification
(name search is fuzzy/ambiguous; the bulk ticker file is exact and
free). A future adapter fetches and caches this file once (it's
~1–2MB, updated periodically by SEC, not per-instrument), then does an
in-memory ticker→CIK lookup — no per-request network call needed for
this step after the initial fetch.

**Canonical instrument identity**: `RawFundamentalsData.instrumentId`
should be the **zero-padded 10-digit CIK string** (e.g.
`"0001810806"`), not the ticker. Rationale: a CIK is SEC's own stable,
provider-native identifier (tickers can change on corporate actions;
CIKs don't) — the same "provider-agnostic identifier, not necessarily
the UI ticker" principle `RawFundamentalsData.instrumentId`'s own doc
comment already states (E.1A), just now given a concrete value for
this specific provider. The `companyconcept`/`companyfacts` URLs
themselves require the zero-padded form (`CIK0001810806`), so storing
it pre-formatted avoids re-deriving it at every call site.

## 2. Field mapping strategy — overview

Each of the six numeric fields maps from one or more XBRL
`us-gaap:`-namespaced concepts, fetched via `companyfacts` (one call
per instrument returns every concept — live-confirmed 200, ~1.3MB for
Unity, §0/E.6C) rather than six separate `companyconcept` calls. Five
of six fields map from **exactly one** semantically canonical tag, once
a fallback list resolves which tag a given filer actually used (§3);
**total debt** is the one field requiring an intentional **sum of two
sub-components**, per its own already-documented contract definition
(E.1A: "short-term + long-term interest-bearing debt, combined") — not
a new design choice, just this provider's specific implementation of a
rule the contract already states.

## 3. XBRL tag fallback strategy

**Selection rule, stated once, applied per field below:** try each
candidate tag in order; the first one present in `companyfacts.facts["us-gaap"]`
for the instrument is used. Do not silently sum tags for any field
except `totalDebt`, whose contract definition already calls for a sum
(§3.6) — every other field's fallback list is a **first-match**
selection among semantically equivalent alternatives, never an
implicit aggregation.

### 3.1 Revenue
`["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax"]`.
First candidate CONFIRMED present for Unity (§0/E.6C); `Revenues`
CONFIRMED **absent** for Unity specifically (a live-verified example of
exactly the cross-filer tag variance this fallback list exists to
handle) — ordered first-to-second by ASC 606 recency (most filers
since 2018 use the first tag; `Revenues` is the older, pre-606
convention some smaller/older filings still use).

### 3.2 Operating income
`["OperatingIncomeLoss"]`. CONFIRMED present for Unity. This is the
single, near-universal US-GAAP tag for this concept — no credible
alternate tag identified; a one-element list is the honest answer, not
under-design.

### 3.3 Operating cash flow
`["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]`.
First CONFIRMED present for Unity. Second candidate exists for filers
that separate discontinued operations — not tested against a live
filer this session, included on documented US-GAAP taxonomy grounds.

### 3.4 Capital expenditures
`["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements", "PaymentsToAcquireProductiveAssets"]`.
First CONFIRMED present for Unity; other two are documented US-GAAP
alternates for capex-adjacent spend, not live-tested.

### 3.5 Cash and equivalents
`["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]`.
First CONFIRMED present for Unity. Second is a newer, combined tag
(cash + restricted cash) some filers use instead of the plain one —
not live-tested, included since its absence would otherwise silently
produce `MISSING` for filers who exclusively use the combined tag.

### 3.6 Total debt — the one summed field, by contract design

```text
totalDebt = sum of whichever of these are present:
  short-term component: first match of ["DebtCurrent", "ShortTermBorrowings", "LongTermDebtCurrent"]
  long-term component:  first match of ["LongTermDebtNoncurrent", "LongTermDebt"]
```

`LongTermDebtNoncurrent` **CONFIRMED absent (404)** for Unity
specifically (§0/E.6C) — live evidence this field's fallback-and-MISSING
design (not just its tag list) genuinely gets exercised, not a
hypothetical edge case. See §7 for the exact MISSING-vs-zero rule this
absence triggers.

## 4. Period filtering

Three distinct, real (not hypothetical) hazards, each live-evidenced
this session or in E.6C:

### 4.1 Isolating single-quarter duration facts (revenue, operating income, operating cash flow, capex)

**Live-confirmed problem** (§0.3): the same concept returns both a
single-quarter fact and a year-to-date cumulative fact tagged with the
*same* `fp`. **Resolution: filter by duration**, computed as
`end − start` in days, accepting only facts where that span falls in a
tolerant single-quarter window (**80–100 days**) — rejecting ~180-day
(half-year), ~270-day (three-quarter), and ~365-day (annual) cumulative
facts by construction. `fp !== "FY"` is used as a cheap pre-filter
(discards the annual fact immediately, no duration math needed for
that one case), but duration is the **primary, authoritative** filter
for the cumulative-vs-single-quarter ambiguity `fp` alone cannot
resolve (both the 3-month and 6-month Unity facts share `fp: "Q2"`).

### 4.2 Instant facts (cash, debt) need no duration filtering

Balance-sheet concepts (§0.2) carry only `end`, never `start` — there
is no cumulative-vs-single-period ambiguity for these; the period a
fact belongs to is simply its `end` date. §4.1's filter does not apply
to `cashAndEquivalents`/`totalDebt`'s component tags.

### 4.3 Excluding annual (FY) facts from quarterly history

For v0.1 (per instruction, "quarterly only... when available"):
discard every fact with `fp === "FY"` outright, regardless of
duration — this is what actually implements "quarterly only," with
§4.1's duration filter as the finer-grained backstop for the
cumulative-vs-quarter case FY-exclusion alone doesn't catch.

**Deferred, not resolved here**: some filers never report a standalone
Q4 fact at all (only Q1–Q3 10-Qs plus an annual 10-K) — Q4's own figure
would need to be *derived* (`FY − (Q1+Q2+Q3)` or similar), which is a
computation, not a field-selection/mapping decision, and arguably
belongs in domain-layer derivation logic (mirroring how `computeGrowthTrend`
composes existing values rather than the mapper inventing new ones) —
not attempted in this checkpoint. When no directly-reported Q4 fact
exists, that field is `MISSING` for that quarter, honestly, per §7 —
not silently derived.

### 4.4 Duplicate / amended facts

**Live-confirmed problem** (§0.2): the identical `end: "2025-12-31"`
balance appears under two different accession numbers — once as its
"home" quarter's figure, once as a later quarter's *comparative*
prior-period figure. **Resolution**: group facts by a canonical period
key (`end` alone for instant facts; `start`+`end` for duration facts,
post-§4.1 filtering), and within each group, **keep the fact with the
latest `filed` date**. This single rule handles both today's
duplication (Unity's two identical values — keeping the later one is a
no-op since the values agree) *and* genuine amendments/restatements
(if a later-filed fact for the same period ever has a *different*
value, the more recent filing is definitionally the more authoritative
one to keep) — one rule, two real cases, no separate amendment-specific
logic needed.

### 4.5 Ordering

`periods` must end up sorted oldest-to-newest by `periodEndDate`
(E.1A/E.6A's existing convention) — the mapper sorts explicitly itself
rather than trusting `companyfacts`' own array order, mirroring
`mapTimeSeriesResponse`'s established "never trusts the payload's
order" precedent (C.8A) even though this session's samples happened to
already appear chronological.

## 5. Mapping to period-metadata fields

| Contract field | Source |
|---|---|
| `fiscalYear` | `fy` |
| `fiscalQuarter` | `fp` parsed (`"Q1"`→`1`, ..., `"Q4"`→`4`); absent/`"FY"` facts are already excluded by §4.3 before this mapping runs, so every surviving fact has a parseable `fp` |
| `periodEndDate` | `end` |
| `filingDate` | `filed` |
| `DataField.asOf` (every numeric field) | `filed` when present (CONFIRMED present on every fact sampled this session), falling back to `end` only if a future filer's fact ever lacks it — matching E.5 §6's already-approved `filingDate ?? periodEndDate` rule (`deriveFundamentalsFieldAsOf`, E.6A) exactly; no new asOf rule invented here, this is that rule's first real provider application |
| `periodId` | a constructed display label, e.g. `` `${fy}-Q${fiscalQuarter}` `` — display/debug only, per E.6A's own contract note |
| `RawFundamentalsData.periodType` | always `"QUARTERLY"` for this mapper (v0.1 scope, §4.3) |

## 6. Unit handling

- **USD confirmed, no scaling needed**: every value sampled this
  session was a raw, full-precision dollar amount (e.g.
  `508238000` = $508,238,000) — `data.sec.gov`'s JSON API does **not**
  apply the "reported in thousands" pre-scaling some legacy
  EDGAR HTML/XBRL-viewer displays show. No multiplier transformation
  needed, confirmed by inspection, not assumed.
- **Defensive unit-key selection**: `companyfacts`/`companyconcept`
  responses nest values under a `units` object keyed by unit type
  (`"USD"` for every concept sampled this session). The mapper must
  explicitly read the `"USD"` key, never "the first key present" —
  some concepts (e.g. share-count facts, irrelevant to our six fields
  but present elsewhere in the same `companyfacts` payload) use a
  `"shares"` unit instead; blindly taking an arbitrary first unit key
  would silently read the wrong kind of fact for a differently-shaped
  concept in the future. None of our six fields' candidate tags are
  expected to have a non-USD unit, but the mapper should verify this
  rather than assume it silently.

## 7. Missing-field behavior

Uniform rule, restated once: if **no** candidate tag in a field's
fallback list (§3) resolves to a valid fact for a given period, that
field is `MISSING` for that period — never a fabricated number, never
a silent zero. This is the existing `DataField.MISSING` semantics
(E.0/E.1A), unchanged, just now given a concrete trigger condition for
this provider.

**Total debt specifically** (§3.6), spelled out since it is the field
most likely to exercise this path (live-confirmed: Unity has no
resolvable long-term-debt tag):

- If **at least one** of the short-term/long-term candidate tags
  resolves, sum whichever resolved, treating an unresolved *specific
  sub-component* as a genuine `$0` contribution to the sum for that
  sub-component only (a common, legitimate real-world pattern — a
  filer with zero short-term debt commonly omits that tag entirely
  rather than reporting an explicit zero).
- If **neither** sub-component resolves for a period, `totalDebt` is
  `MISSING` for that period, not `$0` — absence of *every* candidate
  tag cannot be distinguished from "not disclosed this way" vs.
  "genuinely zero," and per this project's standing `MISSING != 0`
  principle (`docs/PHASE-D-INTEGRATION-GUIDE.md` §4, restated in every
  fundamentals checkpoint since E.0), the conservative reading is
  preferred. This is a judgment call, disclosed as one — not
  presented as an obvious fact — but it does not rise to a
  MODEL DECISION REQUIRED fork: the alternative (treating total
  tag-absence as `$0`) would mean fabricating a specific numeric claim
  ("this company has zero debt") from the mere absence of evidence,
  which every prior MISSING-semantics decision in this project has
  already ruled out as a class, not something newly contested here.

## 8. Validation and deterministic mapper boundary

- **Pure function**: `mapEdgarCompanyFacts(payload: unknown, checkedAt: string): RawFundamentalsData` —
  same shape as `mapQuoteResponse`/`mapTimeSeriesResponse` (C.8A): takes
  an already-fetched JSON payload, returns the contract type, makes no
  network call itself, and is deterministic (same input always
  produces the same output — no `Date.now()`/ambient clock reads
  inside the mapper; `checkedAt` is caller-supplied, matching every
  other mapper's convention in this codebase).
- **Self-validates its own output** before returning, reusing E.6A's
  already-built `src/domain/signals/fundamentals-validation.ts`
  helpers (`hasRequiredFiscalQuarter`, `isValidPeriodEndDate`,
  `isValidFilingDate`, `isSortedOldestToNewest`) rather than inventing
  new validation logic — those helpers were built generically, for
  exactly this eventual use, and this is their first real consumer.
- **Whole-payload failure vs. per-fact `MISSING`**: mirrors
  `mappers.ts`'s existing two-tier error convention (C.8A) — if
  `companyfacts` itself returns an error shape or the payload doesn't
  parse as the expected structure at all, the mapper throws (a
  provider-level failure, not a per-field data gap); a single field's
  every-candidate-tag-absent (§7) is `MISSING`, never a thrown error.

## 9. Does `RawFundamentalsData` need new provenance metadata?

**No — resolved directly, no contract change.** Per instruction
("prefer no contract change unless genuinely necessary"): which
specific XBRL tag produced a given value is a **mapper-internal**
concern, not a domain-contract one — exactly mirroring how
`RawFundamentalsPeriod` already carries no memory of which Twelve
Data/FMP/etc. field name a value came from either (E.1A's contract was
deliberately provider-independent from the start). Nothing in the
existing derivation layer (`fundamentals.ts`), scoring engine
(`fundamentals-score.ts`), or `GROWTH_SOFTWARE_TEMPLATE` needs to know
which tag was selected — that information is useful for *debugging a
mapper*, not for anything downstream of it. If tag-level tracing is
ever wanted, it belongs in a development-time log line inside the
mapper (matching `console.error`'s existing use in
`fetchLiveMomentumResult` for its own diagnostic logging, C.8B/D.2),
not a new field threaded through the contract and every consumer of
it.

## 10. Explicit non-goals of this design

- No code written — every function signature/list above is
  illustrative.
- No scoring/anchor change — `scoreFundamentals`/
  `GROWTH_SOFTWARE_TEMPLATE` (E.2/E.1D) are untouched; this design
  only concerns how `RawFundamentalsData` gets populated.
- No Guidance/AI extraction (Path B) — structured-data mapping only,
  per instruction.
- No orchestration function (`fetchLiveFundamentalsResult`-equivalent,
  E.5 §11) — this design covers only the mapper step within that
  future flow, not the fetch/compose/score sequencing around it.
- No Scorecard/engine/stance/action-zone wiring.
- No change to `RawFundamentalsData`/`RawFundamentalsPeriod` (E.6A) —
  every field EDGAR's data maps onto already exists in the contract.

## 11. Architecture conflict check

None found. Every design choice reuses an already-established pattern
(pure mapper functions, E.6A's own validation helpers, the
`asOf = filingDate ?? periodEndDate` rule, `MISSING != 0`) or resolves
a genuinely new provider-specific quirk (duration-based quarter
isolation, latest-`filed`-wins deduplication) entirely within the
mapper layer, never touching the domain contract. §9 explicitly
confirms no contract change is needed.

## 12. Recommended next step

Not implemented here, per instruction. A future E.7B implementation
checkpoint would be mechanical: (1) a small EDGAR client
(`fetchCompanyFacts(cik): Promise<unknown>`, mirroring `client.ts`'s
thin-fetch-returns-`unknown` convention, with the required
`User-Agent` header and no API key); (2) the ticker→CIK resolver
(§1, likely with the bulk file fetched/cached once); (3)
`mapEdgarCompanyFacts` implementing §2–§8 exactly; (4) focused tests
using Unity's actual live-observed shapes from this session and E.6C
as fixtures (including the real duplicate-fact and cumulative-vs-
quarter cases §0/§4 found) — not synthetic guesses. Guidance-path
(Path B) mapping and the orchestration function remain separate,
later checkpoints, consistent with E.5's own phased sequencing.
