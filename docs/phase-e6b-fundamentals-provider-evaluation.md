# Phase E.6B — Fundamentals Provider Evaluation / Contract Check

Status: RESEARCH / DESIGN ONLY — no application code changed, no
provider chosen or integrated. **No MODEL DECISION REQUIRED.** No
provider's real API exposed a genuine gap in the E.5/E.6A contract
(`RawFundamentalsPeriod`/`RawFundamentalsData`) — every provider's real
fields map onto it, sometimes needing mapper-layer arithmetic (never a
structural contract change). Provider selection itself is treated the
same way C.7 treated it for momentum: a researched recommendation with
an explicit fallback, not a forced stop — consistent with this
project's own precedent (§7).

**Methodology note, stated honestly per instruction:** findings below
are labeled **CONFIRMED** (verified against the provider's real,
current documentation, cited) or **UNCERTAIN** (documentation was
paywalled/JS-rendered/blocked, or the finding rests on general prior
knowledge not independently re-verified). All six providers' core
documentation was reached and cited directly during this checkpoint's
research; remaining UNCERTAIN items are specific sub-details each
section names explicitly (e.g. exact XBRL tag names requiring an API
key, a parameter's precise mixing behavior), not whole providers left
unverified. **A live-key contract check (mirroring C.7's own
methodology — real API calls, not just documentation) is still
required before implementation for whichever provider(s) are ultimately
chosen**, regardless of what's below — documentation review, however
thorough, is not a substitute for exercising the real API.

## 0. What was read

- `docs/phase-e5-fundamentals-live-evidence-strategy.md` +
  `docs/phase-e6a-*` (implemented) — the target contract this
  evaluation checks every provider against, reproduced here for
  reference:
  ```ts
  type FundamentalsPeriodType = "QUARTERLY" | "ANNUAL";
  interface RawFundamentalsPeriod {
    periodId: string;               // display label only
    fiscalYear: number;
    fiscalQuarter?: 1 | 2 | 3 | 4;   // required iff periodType is QUARTERLY
    periodEndDate: string;
    filingDate?: string;            // preferred asOf source; optional
    revenue: DataField<number>;
    operatingIncome: DataField<number>;
    operatingCashFlow: DataField<number>;
    capitalExpenditures: DataField<number>;  // positive outflow convention
    cashAndEquivalents: DataField<number>;
    totalDebt: DataField<number>;
  }
  interface RawFundamentalsData {
    instrumentId: string;
    periodType: FundamentalsPeriodType;  // one array must be homogeneous
    periods: RawFundamentalsPeriod[];    // oldest-to-newest by periodEndDate
    guidanceEvidence: DataField<GuidanceEvidence>;  // from AI-extracted text, never a provider's own qualitative score
    checkedAt: string;
  }
  ```
- Live documentation for all six providers — Twelve Data, Financial
  Modeling Prep, Alpha Vantage, Finnhub, Massive (Polygon.io's October
  2025 rebrand — same product, confirmed by a 301 redirect from
  `polygon.io/docs/...` to `massive.com/docs/...`), and Tiingo — fetched
  directly this session, citations inline below in each provider's own
  section. Sub-details behind an API key wall (exact response payload
  shapes, live pricing confirmation) remain UNCERTAIN and are named as
  such per provider, not glossed over.

## 1. Per-provider findings

### 1.1 Twelve Data

*(Already our momentum-pipeline provider — `src/infrastructure/market-data/twelve-data/`.)*

1. **Structured coverage** — CONFIRMED: dedicated `income_statement`,
   `balance_sheet`, `cash_flow` endpoints exist, described as providing
   raw statement data, not just ratios. [twelvedata.com/fundamentals](https://twelvedata.com/fundamentals), [twelvedata.com/docs](https://twelvedata.com/docs)
2. **Depth/cadence** — CONFIRMED: `period` parameter accepts `annual`
   or `quarter` (implying separate requests per cadence, not a mixed
   response — UNCERTAIN whether this is explicitly stated vs. inferred
   from the parameter design); historical data back to the 1980s–90s
   for major markets. Date fields found: `fiscal_date` (period end),
   `fiscal_year`, `fiscal_quarter`, **and `filing_date`** — CONFIRMED
   via direct doc fetch, though the fetch was AI-summarized and not
   independently spot-checked against a live API response this
   session — treat as high-confidence, not verified-by-execution.
3. **Guidance-source availability** — UNCERTAIN, conflicting signals
   across two fetches this session: one surfaced a "Press releases"
   endpoint and a passing EDGAR-filings mention; a second, more
   targeted fetch of the fundamentals product page found **no**
   mention of EDGAR filings and did not confirm transcripts or
   shareholder-letter text anywhere. Net assessment: at most
   press-release *metadata/headlines*, not full transcript or filing
   text — **not treated as a reliable Path B source** without a
   live-key check.
4. **Contract compatibility** — the cleanest mapping found among all
   six: `revenue`→`revenue`, `operating_income`→`operatingIncome`,
   `operating_cash_flow`→`operatingCashFlow`,
   `capital_expenditures`→`capitalExpenditures`,
   `cash_and_equivalents`→`cashAndEquivalents`, **`total_debt` given
   directly** (no sub-component summing needed, unlike Massive/Polygon
   §1.5), `fiscal_year`/`fiscal_quarter`/`fiscal_date`/`filing_date` map
   directly onto our four period-metadata fields with no
   transformation. Mixing risk: low — `period` is a request parameter,
   not embedded per-record, so a client naturally makes one
   homogeneous-cadence request at a time.
5. **Practical fit** — international equity coverage claimed broadly
   ("1m+ global instruments, 50+ countries" per marketing copy,
   CONFIRMED as stated, not independently verified for EU depth
   specifically); already integrated (zero new account/API key).
   **Pricing — CONFIRMED, a real cost:** Income Statement/Balance
   Sheet/Cash Flow require the **Pro plan, $99/month** — the cheaper
   Grow plan ($29/month), likely what this project's existing momentum
   pipeline uses, does **not** include them. Rate limits at Pro: ≈1,597
   API credits/min. [twelvedata.com/pricing](https://twelvedata.com/pricing).
   Licensing/redistribution terms specific to fundamentals data:
   UNCERTAIN, not found this session — needs direct ToS review before
   any user-facing display of derived figures, same caveat as every
   other provider here.
6. Best fit as a **structured-data-only (Path A) source**, reusing the
   existing adapter pattern; not a credible Path B (guidance) source.

### 1.2 Financial Modeling Prep (FMP)

*Note: an earlier pass through this checkpoint hit an HTTP 403 on FMP's
docs and marked this whole section UNCERTAIN. A dedicated re-fetch
succeeded and materially changes the picture, including surfacing a
real licensing concern the earlier pass missed — this section replaces
that draft.*

1. **Structured coverage** — CONFIRMED: dedicated Income Statement,
   Balance Sheet, and Cash Flow Statement endpoints, raw figures (not
   just ratios): `revenue`, `operatingIncome` (income statement);
   `operatingCashFlow`, `capitalExpenditure` (cash flow); `cash`,
   **`totalDebt` given directly** — no sub-component summing needed,
   same as Twelve Data. [Income Statement API](https://site.financialmodelingprep.com/developer/docs/stable/income-statement), [Cash Flow Statement API](https://site.financialmodelingprep.com/developer/docs/stable/cashflow-statement)
2. **Depth/cadence** — CONFIRMED: `period` param supports annual
   (`FY`) and quarterly separately (so no mixed-cadence payload — low
   mixing risk, same shape as Twelve Data's request-time split);
   history "up to 30 years." Fields present: `date` (period end),
   `period`, `calendarYear` (fiscal year), **`fillingDate`** (SEC
   filing date), `acceptedDate`. No explicit numeric fiscal-quarter
   field confirmed — `period` may be string-coded ("Q1"/"FY"); parsing
   it to our `1|2|3|4` type is UNCERTAIN, a small mapper-layer detail,
   not a contract gap. [FMP API reference](https://github.com/FinancialModelingPrepAPI/Financial-Modeling-Prep-API)
3. **Guidance-source availability** — CONFIRMED: dedicated earnings-
   call-transcript endpoints returning full raw text
   (`search-transcripts`, `earning-call-transcript-latest`, batch/dated
   variants). [Earnings Transcript API](https://site.financialmodelingprep.com/developer/docs/stable/search-transcripts)
4. **Contract compatibility** — CONFIRMED clean for 5 of 6 numeric
   facts (including a direct `totalDebt`, better than Twelve Data's
   own confirmed mapping only in that both now confirm it directly);
   `fiscalQuarter` parsing from `period` is the one open, small detail
   (§4.3).
5. **Practical fit** — **CONFIRMED, and a real concern.** Pricing:
   Free tier 250 req/day; paid tiers Starter (300 req/min), Premium
   (750 req/min), Ultimate (3000 req/min, with bandwidth caps up to
   150GB). CONFIRMED: transcripts and full international coverage are
   gated to the **Ultimate** tier specifically ("Ultimate unlocks
   global coverage, transcripts, ETF/mutual fund holdings, 13F...") —
   a real cost for a personal v0.1 app, likely $139+/month once
   transcripts are needed. [Pricing Plans](https://site.financialmodelingprep.com/pricing-plans)
   **Licensing — CONFIRMED, a material risk, not previously flagged:**
   FMP's Terms of Service prohibit Commercial Use and prohibit
   redistribution/display of the data without a separate "Data Display
   and Licensing Agreement"; the Personal Use license is explicitly
   non-commercial, individual-only, and does not cover acting "on
   behalf of ... any other third party." **This needs direct
   resolution before FMP data is ever shown in this app's UI**, even
   though the app is personal — the ToS language is stricter than a
   simple "personal use is fine" reading would suggest. [Terms of Service](https://site.financialmodelingprep.com/developer/docs/terms-of-service), [Can You Use FMP Data in a Public App?](https://site.financialmodelingprep.com/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard)
6. The only provider confirmed to offer both structured financials
   AND transcripts from one vendor — a genuine architectural
   simplification *if* the Ultimate-tier cost and the licensing
   question (§5) are both resolved acceptably; neither is assumed
   resolved by this checkpoint.

### 1.3 Alpha Vantage

1. **Structured coverage** — CONFIRMED: `INCOME_STATEMENT`,
   `BALANCE_SHEET`, `CASH_FLOW` functions exist and return raw
   statement data (`totalRevenue`, `grossProfit`, `costOfRevenue`
   confirmed present; `operatingIncome`/`operatingCashflow`/
   `capitalExpenditures`/`cashAndCashEquivalentsAtCarryingValue`/
   `shortTermDebt`/`longTermDebt` are UNCERTAIN — well-known Alpha
   Vantage field names from general prior knowledge, not
   independently re-confirmed via live fetch this session, since the
   documentation page's relevant section wasn't retrievable in full).
   [alphavantage.co/documentation](https://www.alphavantage.co/documentation/), [macroption.com field reference](https://www.macroption.com/alpha-vantage-fundamental-data/)
2. **Depth/cadence** — **CONFIRMED, and structurally significant**:
   each response contains **separate `annualReports` and
   `quarterlyReports` arrays** — the cleanest confirmed answer to "no
   mixing" of any provider researched (structurally impossible to mix
   within one array, matching our own `periodType` design intent
   exactly). `fiscalDateEnding` (period end) CONFIRMED present. **No
   distinct filing/report date field was found** in these three
   endpoints — a real, disclosed gap, addressed in §2.
3. **Guidance-source availability** — CONFIRMED to exist as a listed
   endpoint (`EARNINGS_CALL_TRANSCRIPT`), UNCERTAIN on current
   tier/pricing/access details (table-of-contents entry found, full
   section content not retrievable this session).
4. **Contract compatibility** — `fiscalDateEnding`→`periodEndDate`
   clean; `filingDate` would stay unset for Alpha-Vantage-sourced data,
   falling back to `periodEndDate` per our own already-designed E.5 §6
   fallback — not a contract gap, a known and accepted degradation.
   No mixing risk (separate arrays, per §2 above).
5. **Practical fit** — Alpha Vantage's free tier is widely known to be
   heavily rate-limited (historically as low as 25 requests/day on
   some plans); exact current limits UNCERTAIN, not re-confirmed this
   session — flagged rather than stated as fact. Premium tiers exist
   (150/300/600/1200 requests/minute, CONFIRMED present on the pricing
   section) but exact fundamentals+transcript inclusion per tier is
   UNCERTAIN. International/European equity fundamentals coverage
   depth UNCERTAIN. Licensing/redistribution: page states "for
   commercial use, please contact sales" (CONFIRMED) — a real signal
   worth flagging for a personal app that could eventually be shown to
   others.
6. A credible single-provider candidate for A+B *if* the transcript
   endpoint's access terms check out — needs its own live-key
   verification pass before being treated as equal to FMP's confirmed
   transcript access.

### 1.4 Finnhub

*Note: an earlier pass marked this section largely UNCERTAIN citing
inaccessible docs. A dedicated re-fetch reached Finnhub's swagger spec
directly and substantially strengthens this section — it replaces that
draft.*

1. **Structured coverage** — CONFIRMED: `/stock/financials-reported`
   (raw as-filed, XBRL-tag-based, split into `bs`/`cf`/`ic` sections),
   sourced from SEC filings. A separate `/stock/financials`
   "standardized" endpoint also exists (Finnhub-normalized, not
   as-filed). [Finnhub API docs](https://finnhub.io/docs/api). Exact
   XBRL tag names for our six fields are UNCERTAIN without an API key
   (plausible candidates — `Revenues`, `OperatingIncomeLoss`,
   `NetCashProvidedByUsedInOperatingActivities`,
   `PaymentsToAcquirePropertyPlantAndEquipment`,
   `CashAndCashEquivalentsAtCarryingValue` — standard US-GAAP taxonomy
   names, not verified present for a given filer).
2. **Depth/cadence** — CONFIRMED (swagger spec): `freq=annual|quarterly`
   param (one cadence per request — prevents mixing by construction,
   same shape as Twelve Data/FMP); response includes `year`, `quarter`
   (0 for annual 10-K, 1–4 for quarterly 10-Q), `startDate`, `endDate`,
   **`filedDate`**, `acceptedDate`, `form`. "30+ years" claimed for the
   standardized endpoint; depth for `-reported` specifically not
   independently confirmed.
3. **Guidance-source availability** — **CONFIRMED, the strongest
   finding for Finnhub**: `/stock/transcripts` + `/stock/transcripts/list`
   — full speaker-attributed earnings-call transcripts, "15+ years of
   data," explicitly covering **"US, UK, European, Australian and
   Canadian companies"** — the only provider researched with
   *confirmed* European transcript coverage specifically. `/stock/filings`
   (SEC filing list with direct `reportUrl`/`filingUrl` links) is
   **not** premium-gated. `/press-releases` exists but full text is
   Enterprise-only — the standard tier returns only a headline + short
   description, not usable as extraction source text.
4. **Contract compatibility** — good structural fit:
   `year`→fiscalYear, `quarter` (0-sentinel)→fiscalQuarter (small
   `0→undefined` transform), `endDate`→periodEndDate,
   `filedDate`→filingDate; `freq` param maps cleanly to `periodType`
   with no mixing risk. **Real risk, industry-wide not Finnhub-
   specific**: as-filed/XBRL data is well-documented to use
   inconsistent tag names across filers for the same concept — mapping
   to our fixed six-field schema likely needs a per-filer tag-alias
   table, and "total debt" almost certainly needs summing multiple
   XBRL debt line items (no single canonical tag in US-GAAP taxonomy)
   — a real, if manageable, mapper-layer cost, not a contract gap.
5. **Practical fit** — free tier ≈60 calls/min, no credit card,
   positioned for "personal, non-commercial projects" — but
   `financials-reported`, `financials`, `transcripts`, AND
   `press-releases` are **all** marked "Premium required" in the
   swagger spec; only `/stock/filings` (the SEC filing list, not full
   text) is free-tier. Paid pricing is contact-based, not published —
   UNCERTAIN cost. International coverage confirmed strong for
   transcripts specifically (§3); fundamentals-reported coverage
   breadth for European filers UNCONFIRMED.
6. Structurally, Finnhub could serve **both** Path A and Path B under
   one paid account — its transcripts are the best-confirmed European
   coverage of any provider researched — but the paid-tier gate on
   every relevant endpoint and the un-published pricing make it harder
   to commit to for a personal v0.1 budget than the recommended pair
   (§3). A credible alternative if FMP's licensing question (§1.2.5)
   doesn't resolve favorably.

### 1.5 Massive (formerly Polygon.io — rebranded October 2025, confirmed by a live 301 redirect from polygon.io to massive.com)

1. **Structured coverage** — **CONFIRMED**, directly fetched from live
   docs, the most field-verified provider after Twelve Data: income
   statement fields `revenue`, `operating_income`,
   `total_operating_expenses`, etc.; cash flow fields
   `net_cash_from_operating_activities`,
   `purchase_of_property_plant_and_equipment` (capex); balance sheet
   fields `cash_and_equivalents`, `debt_current`,
   `long_term_debt_and_capital_lease_obligations`,
   `total_liabilities`. [Income Statements](https://massive.com/docs/rest/stocks/fundamentals/income-statements), [Cash Flow Statements](https://massive.com/docs/rest/stocks/fundamentals/cash-flow-statements), [Balance Sheets](https://massive.com/docs/rest/stocks/fundamentals/balance-sheets)
2. **Depth/cadence** — CONFIRMED: `timeframe` parameter accepts
   `quarterly`, `annual`, `trailing_twelve_months`; `fiscal_year`,
   `fiscal_quarter`, `period_end`, and **`filing_date`** all CONFIRMED
   present. **Real, confirmed mixing risk**: the docs describe a
   `timeframe.any_of` filter accepting comma-separated values,
   implying a single request/response *can* combine multiple
   timeframes — a client must explicitly request one timeframe value
   at a time to honor our `periodType` homogeneity invariant (§2).
3. **Guidance-source availability** — UNCERTAIN, leaning absent: no
   evidence of a transcript/filing-text endpoint found; Massive/Polygon
   is documented primarily as a quantitative market-data + financials-
   from-filings provider.
4. **Contract compatibility** — clean overall, with **two confirmed,
   concrete transformations needed in the mapper layer** (not the
   domain contract): (a) `totalDebt` is not given as one field — must
   be derived as `debt_current + long_term_debt_and_capital_lease_obligations`;
   (b) capex (`purchase_of_property_plant_and_equipment`) is
   **CONFIRMED reported as a negative value**, opposite our contract's
   documented positive-outflow convention — a sign flip needed in the
   mapper. Both are exactly the kind of "provider-specific
   transformation" this checkpoint asked to identify — neither implies
   a contract change.
5. **Practical fit** — CONFIRMED pricing: free/Basic tier (5 calls/min,
   15-min-delayed data, 2 years history), Starter $29/mo, Developer
   $79–99/mo (two slightly different figures appeared across sources —
   flagged, not resolved), Advanced $199/mo. UNCERTAIN whether
   fundamentals specifically requires a paid tier or is included at
   Basic — not confirmed this session, a real open question for
   v0.1's budget. International/European fundamentals depth UNCERTAIN.
6. Best fit as a strong **structured-data fallback** if Twelve Data's
   fundamentals prove incomplete on a live check; not a Path B
   candidate.

### 1.6 Tiingo

1. **Structured coverage** — CONFIRMED endpoint exists
   (`fundamentals/statements`), providing income statement, balance
   sheet, and cash flow data, 20+ years of history claimed. Exact
   field/dataCode names (revenue, operatingIncome, capex, etc.) —
   UNCERTAIN: Tiingo's docs explicitly defer field names to a separate
   `/tiingo/fundamentals/definitions` lookup endpoint rather than
   listing them statically, and that endpoint's contents weren't
   fetched this session. [Tiingo fundamentals documentation](https://www.tiingo.com/documentation/fundamentals)
2. **Depth/cadence** — **CONFIRMED, and the single most important
   finding of this whole evaluation for item 3 (mixing risk)**: Tiingo's
   own documentation states *"quarter == 0 represents an annual report
   for the corresponding year"* — annual and quarterly reports are
   returned **together, distinguished only by a `quarter` value**, not
   as separate arrays or a request-time filter. This is a real,
   concrete, confirmed instance of exactly the mixing hazard E.5 §4
   was designed to prevent — a Tiingo mapper would need to explicitly
   split on `quarter === 0` before ever populating our single
   homogeneous-`periodType` `periods` array. `date` (CONFIRMED,
   described as "statement release date" — likely closer to a filing/
   release date than a period-end date, but this is inferred from
   wording, not independently confirmed against a live response) and
   `quarter`/`year` are the only date-adjacent fields documented; no
   distinct period-end-date field separate from `date` was found.
3. **Guidance-source availability** — UNCERTAIN, leaning absent: no
   evidence of transcript/filing-text content found; Tiingo's other
   products (news API) are headline/article aggregation, not
   company-disclosed guidance text.
4. **Contract compatibility** — workable, but requires the
   quarter-vs-annual split (§2) as a real, non-trivial mapper-layer
   step, and the `date` field's exact meaning (filing vs. period-end)
   needs live-response verification before deciding which of our two
   date fields it should populate.
5. **Practical fit** — CONFIRMED: fundamentals is a **paid add-on**,
   with the Dow 30 free for evaluation only; current pricing is
   **not publicly listed** — Tiingo's own materials direct to
   "contact sales@tiingo.com," and an older $10/month reference found
   in search results is explicitly flagged as possibly outdated. This
   opaque, contact-sales pricing model is a poor practical fit for a
   personal v0.1 project relative to every other provider's
   self-serve tiers. International coverage CONFIRMED limited — docs
   state "US Equities and ADRs" only, no direct European fundamentals
   coverage confirmed. **Licensing — CONFIRMED, a real concern**:
   Tiingo's terms state "Internal use means you may not display or
   share the data with another person or organization" — a real
   display/redistribution constraint for a user-facing app, even a
   personal one, independent of the Fundamentals add-on's own
   (unconfirmed) specific terms. [Tiingo Pricing](https://www.tiingo.com/about/pricing)
6. Not recommended for v0.1 — confirmed mixing hazard plus opaque
   pricing make it the weakest practical fit despite reasonable
   structured-data depth.

## 2. Major contract gaps found: **none**

Per instruction ("do not change the domain contract merely to fit a
provider unless a genuine contract gap is discovered"): no provider
researched exposed a case our `RawFundamentalsPeriod`/
`RawFundamentalsData` shape (E.6A) cannot represent. Every
provider-specific quirk found resolves entirely in a future
**mapper layer** (mirroring `mappers.ts`'s existing role for momentum),
never the domain contract itself:

| Provider | Quirk found | Resolves in |
|---|---|---|
| Tiingo | `quarter === 0` embeds annual reports inside the quarterly array | Mapper splits before assembly — confirms E.5 §4's predicted risk was real, not hypothetical |
| Massive/Polygon | `timeframe.any_of` can request mixed timeframes in one call | Mapper/client always requests one `timeframe` value at a time |
| Massive/Polygon | No single `totalDebt` field | Mapper sums `debt_current + long_term_debt_and_capital_lease_obligations` |
| Massive/Polygon | Capex reported as negative | Mapper sign-flips to our positive-outflow convention |
| Alpha Vantage | No distinct filing-date field in the 3 core statement endpoints | Already-designed fallback: `filingDate` stays unset, `periodEndDate` is used (E.5 §6) — no contract change |
| FMP | No explicit numeric fiscal-quarter field — `period` may be string-coded ("Q1") | Mapper parses `period` into `1\|2\|3\|4` |
| Finnhub | As-filed/XBRL tag names vary per filer (industry-wide characteristic, not Finnhub-specific) | Mapper maintains a per-filer/per-concept tag-alias table; `totalDebt` sums multiple XBRL debt tags, same shape as Massive/Polygon's known transformation |

None of these seven items required touching `RawFundamentalsPeriod`/
`RawFundamentalsData` itself — every one resolves in a provider-specific
mapper, exactly the boundary E.5/E.6A already drew.

## 3. Recommended provider architecture

**Separate providers for Path A and Path B — do not force one
"does-everything" provider for v0.1:**

- **Path A (structured financials): Twelve Data**, reusing the
  already-integrated adapter (`src/infrastructure/market-data/
  twelve-data/`) with new endpoint calls added alongside the existing
  quote/time-series/FX ones. Rationale: the cleanest confirmed
  field-to-contract mapping of any provider researched (including a
  direct `total_debt` and `filing_date`, needing zero mapper-layer
  arithmetic), zero new account/API-key setup, and it already has this
  project's own trusted client/mapper/error-handling pattern to extend
  rather than duplicate.
- **Path B (guidance-source text): tentatively Financial Modeling
  Prep**, using *only* its confirmed Earnings Transcript endpoint —
  not its financials — **conditional on resolving §1.2.5's licensing
  question.** FMP is the only provider confirmed to bundle both paths
  under one account, and its transcript endpoint is real and
  well-documented, but its Terms of Service confirmed require a
  separate Data Display and Licensing Agreement for showing the data
  in an app UI, and transcripts specifically sit behind its priciest
  ($139+/mo) tier. **This is not a clean recommendation — it is the
  best-documented option with a real, disclosed cost and a real,
  disclosed legal question, both left open.**
- **Credible alternative for Path B: Finnhub.** The only provider with
  *confirmed* (not inferred) European transcript coverage
  ("US, UK, European, Australian and Canadian companies"), also
  paid-tier-gated but with published, self-serve intent (vs. FMP's
  Ultimate-tier bundling and unresolved licensing question). If §1.2.5
  doesn't resolve favorably, this is the stronger next candidate, not
  a last-resort fallback.

**Fallback options, if a live-key check contradicts the above:**
- Path A fallback: **Massive/Polygon** — second-cleanest confirmed
  field mapping, at the cost of two known, small mapper-layer
  transformations (§2) and a real pricing tier (~$99/mo for the
  Financials add-on, similar order of cost to Twelve Data's Pro tier)
  to confirm for fundamentals access.
- Path B fallback: **Alpha Vantage**'s `EARNINGS_CALL_TRANSCRIPT`
  endpoint — confirmed to exist, access tier/terms unconfirmed; would
  need its own contract-check pass before use.
- Not recommended for v0.1 at all: **Tiingo** (confirmed mixing
  hazard, confirmed display/redistribution restriction in its general
  terms, and opaque contact-sales pricing for the Fundamentals add-on
  specifically — the weakest practical fit of the six on multiple
  independent, confirmed grounds).

This recommendation is deliberately **not** presented as a
`MODEL DECISION REQUIRED` — see §0/§4. It is, however, presented with
a genuinely unresolved cost/legal question (FMP's licensing terms) that
a live-key/ToS-review pass (§7) must close before implementation
commits to it.

## 4. Why this isn't a MODEL DECISION REQUIRED stop

Provider selection is a researched engineering recommendation with a
disclosed fallback, the same category this project already resolved
without a formal stop in Phase C (`docs/validation/c7-twelve-data-
contract-check.md` → direct adoption in C.8A, no separate "which
provider" model-decision checkpoint was raised). Nothing found here
rises to "multiple legitimate *models*" the way, say, E.0's archetype
fork or E.1C's Balance Sheet shape fork did — every provider maps onto
the *same*, already-approved contract; the only real variation is
*how much mapper-layer work* each requires and *how confidently* this
session could verify it. The one place a real, confirmed structural
hazard was found (Tiingo's quarter-0-embeds-annual pattern) is already
fully handled by an existing contract feature (`periodType`
homogeneity, E.6A) plus ordinary mapper-layer filtering — not a case
where "existing boundaries cannot represent the intended behavior."

## 5. Explicit non-goals of this checkpoint

- No provider chosen/integrated — a recommendation only, per
  instruction.
- No adapter/client/mapper code written for any provider.
- No live-key verification performed — every finding above is
  documentation-based (with confidence levels stated); a live-key
  contract check (C.7-style) is the explicit, required next step
  before implementation (§0, §7).
- No licensing/redistribution legal conclusion reached for any
  provider — every provider's terms need direct legal/ToS review
  before this app displays derived figures to anyone beyond its
  author; flagged as unresolved everywhere it applies, not silently
  assumed fine.
- No AI extraction, no orchestration, no Scorecard/engine wiring.

## 6. Architecture conflict check

None. This checkpoint is research; no application architecture was
proposed or changed.

## 7. Recommended next step

A future **E.6C** checkpoint (or the "provider client/mapper
implementation" step of an eventual E.7) would perform the C.7-style
live-key contract check this evaluation's own uncertainty flags call
for — specifically: (1) confirm Twelve Data's fundamentals endpoints
against a real API key (field names, whether `filing_date` is reliably
populated, actual fundamentals-tier pricing); (2) confirm FMP's
transcript endpoint access terms and current pricing with a real key;
(3) only then design/implement the two provider-specific mappers
(`mapTwelveDataFundamentals*`-equivalent,
`mapFmpEarningsTranscript`-equivalent) feeding `buildRawFundamentalsData`
(E.5 §5) — not attempted here, per "do not implement."
