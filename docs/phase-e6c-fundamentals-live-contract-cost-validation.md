# Phase E.6C — Fundamentals Live Contract & Cost Validation

Status: VALIDATION ONLY — no production adapters implemented, no
domain contract changed, nothing purchased or upgraded. Every finding
below is labeled **LIVE-VERIFIED** (a real API call was made this
session and its actual response inspected) or **DOCUMENTATION-DERIVED**
(carried from E.6B's documentation review, not independently re-run
against a live endpoint this session) — per instruction, these are
never blended without saying which is which.

**API key handling:** the existing configured `TWELVE_DATA_API_KEY`
was read once into a shell variable, used directly in `curl` calls, and
`unset` immediately after — never echoed, never written to a log file,
never included in any command text shown in this document. Response
bodies were inspected directly (Twelve Data's own error/success JSON
never echoes the request's `apikey` parameter back), so nothing below
required redaction to write safely.

## 0. What was done

- Live `curl` calls against Twelve Data's real API (`api.twelvedata.com`)
  using the existing configured key, for symbol `U` (Unity) — the same
  representative instrument this project's momentum pipeline already
  uses.
- Live calls against **SEC EDGAR's free, public APIs**
  (`www.sec.gov`/`data.sec.gov`) for Unity Software Inc. — no API key
  required, only a `User-Agent` header identifying the requester, per
  SEC's fair-use policy for these endpoints.
- No purchases, no subscription upgrades, no adapter code written, no
  change to `RawFundamentalsData`/`RawFundamentalsPeriod` (E.6A).

## A. Twelve Data structured fundamentals — LIVE-VERIFIED

### A.1 Endpoints attempted

| Endpoint | Params | HTTP | Result |
|---|---|---|---|
| `/income_statement` | `symbol=U&period=quarterly` | **403** | `"available exclusively with pro or ultra or venture or enterprise plans"` |
| `/balance_sheet` | `symbol=U&period=quarterly` | **403** | same message |
| `/cash_flow` | `symbol=U&period=quarterly` | **403** | same message |
| `/earnings` | `symbol=U` | **403** | `"available exclusively with grow or pro or ultra or venture or enterprise plans"` |
| `/earnings_calendar` | `symbol=U` | **403** | same message |
| `/api_usage` | (account-level, no symbol) | **200** | `{"plan_category":"basic", "plan_limit":8, "plan_daily_limit":800}` |

### A.2 Plan tier — LIVE-VERIFIED, corrects an E.6B guess

The `api_usage` call confirms the currently configured key is on
Twelve Data's **Basic (free)** plan — 8 credits/min, 800/day. E.6B's
documentation-derived guess ("likely what this project's existing
momentum pipeline uses" was framed as Grow, $29/mo) was **too
generous**: the real account is one tier below that. This is a
correction, not a contradiction — Basic is sufficient for the
momentum pipeline's existing quote/time-series/FX calls (unaffected,
not re-tested here since that's out of this checkpoint's scope), but
zero fundamentals-adjacent endpoints are reachable on it, not even the
purely numeric `/earnings` endpoint.

### A.3 Failure classification — subscription-tier, not data-availability

Per instruction, this is explicitly **a provider/cost finding, not an
implementation failure**: the 403 body names the exact required plans
by name, structurally identical to `TwelveDataApiError`'s existing
whole-request-failure handling (`src/infrastructure/market-data/
twelve-data/errors.ts`) — not a "symbol not found," not an empty
dataset, not a malformed request. Unity's fundamentals data almost
certainly exists in Twelve Data's system (a major US-listed company);
the current key simply cannot reach it at this tier.

### A.4 Required transformations

**Not independently re-verified this session** — every field-shape
claim from E.6B (`total_debt` given directly, `fiscal_year`/
`fiscal_quarter`/`fiscal_date`/`filing_date` present) remains
**DOCUMENTATION-DERIVED**, since the 403 responses never included a
real payload to inspect. If/when a Pro-tier key is available, capturing
one real response for each of the three endpoints should be the first
step of any future implementation checkpoint — not assumed correct
from documentation alone, consistent with this project's own
established live-key-check discipline (C.7).

### A.5 Cost to unlock

Confirmed unchanged from E.6B: **Pro plan, $99/month**, is the
cheapest Twelve Data tier that includes `income_statement`/
`balance_sheet`/`cash_flow`. Live-verified today: **not reachable at
$0.**

## B. Guidance path — LIVE-VERIFIED, free alternative found

### B.1 Twelve Data's own guidance-adjacent endpoints — also blocked on Basic

`/earnings`/`/earnings_calendar` (numeric EPS actual/estimate only —
never real guidance *text* even at Grow tier, consistent with E.6B's
own finding that Twelve Data was never a credible Path B candidate)
both 403 on the current key. Confirms there is no cheap partial win
here — Twelve Data offers nothing usable for Path B at any price this
checkpoint tested.

### B.2 SEC EDGAR — LIVE-VERIFIED, free, official, zero cost

- **Company lookup** — LIVE-VERIFIED via
  `/cgi-bin/browse-edgar?action=getcompany`: found Unity Software
  Inc.'s CIK (`0001810806`) instantly, no key required.
- **Structured financials via XBRL** — LIVE-VERIFIED, and the
  strongest finding of this checkpoint: `data.sec.gov/api/xbrl/
  companyconcept/CIK0001810806/us-gaap/{concept}.json` returned real,
  current data for:
  - `RevenueFromContractWithCustomerExcludingAssessedTax` → real
    quarterly revenue figures, each entry carrying `start`/`end`
    (period start/end — directly usable as `periodEndDate`), `fy`
    (→`fiscalYear`), `fp` (e.g. `"Q2"` →`fiscalQuarter`), `form`
    (`10-Q`), and `filed` (→`filingDate`) — **an almost 1:1 match to
    our E.6A contract's period-metadata fields, for free.**
  - `OperatingIncomeLoss`, `NetCashProvidedByUsedInOperatingActivities`,
    `PaymentsToAcquirePropertyPlantAndEquipment`,
    `CashAndCashEquivalentsAtCarryingValue` — all **HTTP 200,
    confirmed present** for Unity.
  - `LongTermDebtNoncurrent` — **404** for Unity specifically. UNCERTAIN
    whether this means Unity uses a different debt-related tag or
    genuinely carries none (plausible for an equity-funded
    growth-software company, consistent with this project's own
    archetype reasoning in E.1C/E.1D) — not resolved this session; a
    real implementation would need a fallback tag list, the same
    per-filer XBRL-tag-inconsistency risk E.6B already flagged for
    Finnhub.
  - The **bulk `companyfacts/CIK0001810806.json`** endpoint — LIVE-
    VERIFIED 200, ~1.3MB, every XBRL concept for the instrument in one
    call. More practical than per-concept fetching for a real
    implementation (one request per instrument, not six).
  - `Revenues` (a differently-named tag) returned 404 — direct,
    live-verified evidence that per-filer XBRL tag names genuinely
    vary even for something as basic as "revenue," confirming the risk
    E.6B could only describe abstractly.
- **Filing/earnings-release access** — LIVE-VERIFIED via
  `/submissions/CIK0001810806.json`: recent 8-K filings listed with
  exact filing dates and document filenames (e.g. an 8-K filed
  2026-08-06, aligning with the same-day 10-Q). 8-K filings around
  earnings dates conventionally carry the earnings-release text as an
  exhibit — this convention is well-established EDGAR practice
  (**DOCUMENTATION-DERIVED**, not confirmed by reading Unity's actual
  exhibit text this session).
- **Transcripts** — CONFIRMED absent by design: companies are not
  required to file call transcripts with the SEC; EDGAR structurally
  cannot be a transcript source, not a gap in this research.

### B.3 Do we actually need paid transcripts for v0.1?

**No — directly answering the task's question.** Earnings-release text
(free via 8-K exhibits) plus the 10-Q/10-K filing text itself already
carry forward-looking/management-commentary language sufficient for
`GuidanceEvidence` extraction (direction/magnitude framing per spec
§12). Spec's own AI Research Contract (§29) names `"EARNINGS"` as a
`document_type` generically — it does not require a call transcript
specifically. A transcript adds Q&A nuance and color a release doesn't
have, but is not necessary to produce a legitimate `GuidanceEvidence`
value for v0.1. This directly supports a genuinely free Path B.

## C. Three architectures

### C.1 MINIMUM-COST V0.1 — **$0/month**

- **Path A**: SEC EDGAR XBRL (`companyfacts`/`companyconcept`) — free,
  live-verified working today for revenue, operating income, operating
  cash flow, capex, cash & equivalents.
- **Path B**: SEC EDGAR 8-K exhibits (earnings-release text) + 10-Q/
  10-K text — free, live-verified filing-list access; actual exhibit
  text extraction is a real, un-validated implementation step (not
  attempted this session).
- **What's sacrificed**: US-listed companies only — EDGAR has no
  non-US coverage at all, a hard boundary, not a degradation; real,
  live-confirmed per-filer XBRL tag inconsistency (§B.2) requiring a
  genuine tag-alias/fallback-list mapper, more implementation work than
  a normalized commercial provider; total debt likely `MISSING` for
  some filers (graceful, existing semantics — not a new failure mode);
  no transcript-level nuance (§B.3 — not judged necessary for v0.1
  anyway).
- **Licensing** — **CONFIRMED, the cleanest of any option researched
  across E.6B/E.6C**: SEC filings are U.S. government public records,
  no licensing or redistribution restriction of any kind. No ToS
  question to resolve before display, unlike every commercial provider
  in E.6B.

### C.2 BEST PRACTICAL V0.1 — **≈$99/month**

- **Path A**: Twelve Data Pro ($99/mo, live-confirmed as the unlock
  tier, §A.5) or Massive/Polygon's Financials add-on (~$99/mo,
  documentation-derived, E.6B) — a provider-normalized field shape
  (less per-filer tag-matching work than raw XBRL) and claimed
  (not live-verified) international coverage.
- **Path B**: SEC EDGAR (still free) for US-listed holdings; add a
  paid transcript provider (FMP or Finnhub, per E.6B) only once/if
  non-US coverage or transcript-level nuance is genuinely needed —
  not assumed necessary for v0.1 by default (§B.3).
- **What's sacrificed vs. C.3**: no guaranteed non-US Guidance-source
  depth; if FMP is ever added, its licensing question (E.6B §1.2.5)
  is still unresolved.
- **Licensing** — Twelve Data's fundamentals-specific redistribution
  terms remain UNCERTAIN (not found in E.6B or this session) — needs
  direct ToS confirmation *before* this tier is actually purchased,
  not after.

### C.3 FUTURE / PRODUCTION-GRADE — **≈$150–250+/month**

- **Path A**: Twelve Data Pro/Ultra or Massive/Polygon Advanced, for
  broader international coverage and provider-side field
  normalization.
- **Path B**: Finnhub (confirmed European transcript coverage, E.6B
  §1.4) or FMP Ultimate (confirmed transcripts, contingent on
  resolving its licensing question) — full transcript-level Guidance
  evidence across every covered market, not just US filers.
- **What's gained**: non-US coverage for both paths; transcript
  nuance; reduced per-filer tag-matching risk vs. raw XBRL.
- **Licensing** — requires resolving FMP's confirmed ToS question
  (E.6B §1.2.5) and reconfirming Twelve Data's/Finnhub's own
  redistribution terms before any user-facing display — not assumed
  clear even at this spend level.

## D. Explicit non-goals of this checkpoint

- No adapter, client, or mapper code written for Twelve Data
  fundamentals endpoints or SEC EDGAR.
- No subscription purchased or upgraded — Twelve Data remains on its
  current Basic plan.
- No change to `RawFundamentalsData`/`RawFundamentalsPeriod` (E.6A) —
  every field EDGAR's XBRL data maps onto already exists in the
  contract; no gap was found that would require one.
- No actual `GuidanceEvidence` extraction attempted — B.2's 8-K exhibit
  text was not fetched or read this session, only the filing *list*
  was confirmed accessible.
- No Scorecard/engine/stance/action-zone wiring.

## E. Architecture conflict check

None found. Every live-verified fact either confirms an E.6B
documentation-derived claim (Twelve Data's field shape, once
purchased) or extends the same already-approved contract to a new,
free data source (SEC EDGAR) without requiring any change to it —
`fy`/`fp`/`start`/`end`/`filed` map directly onto
`fiscalYear`/`fiscalQuarter`/`periodEndDate`/`filingDate` with no
structural mismatch found.

## F. Recommendation and next step

For a **personal, cost-conscious v0.1** whose only real holding
(Unity) is US-listed, **C.1 (SEC EDGAR, $0/month)** is a genuinely
viable, live-verified starting point — not a placeholder pending a
paid upgrade. It sacrifices non-US coverage and provider-side
normalization, not correctness, and carries zero licensing risk. **C.2
(Twelve Data Pro, ~$99/mo)** remains the better choice once/if non-US
holdings matter or per-filer XBRL tag work proves too costly to
maintain. Not decided here — a product/budget choice for whoever
approves the next implementation checkpoint, not this validation pass.

A future implementation checkpoint (mapper/adapter work, still not
attempted here) should: (1) pick one of C.1/C.2 explicitly; (2) if
C.1, build the EDGAR XBRL mapper including a per-concept tag-alias
fallback list (starting from the concepts confirmed present/absent in
§B.2) and fetch one real 8-K exhibit to confirm earnings-release text
is actually extractable as expected; (3) if C.2, purchase Twelve Data
Pro and capture real `income_statement`/`balance_sheet`/`cash_flow`
payloads to finally move §A.4 from DOCUMENTATION-DERIVED to
LIVE-VERIFIED before writing a mapper against them.
