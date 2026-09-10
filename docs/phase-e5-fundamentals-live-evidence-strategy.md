# Phase E.5 — Fundamentals Live Evidence Strategy & Orchestration Design

Status: DESIGN ONLY — no application code changed. **CLEAN INTEGRATION**
overall — every one of the 10 resolve items below has a single,
reasoned answer, and none exposes a genuine multi-way model fork. One
honest cost is flagged, not hidden: correctly resolving items 2–3
(period metadata, quarterly/annual mixing) requires **new required
fields on `RawFundamentalsPeriod`/`RawFundamentalsData`** — a breaking
change to E.1A/E.2's already-shipped raw contract types, not just an
additive one (§12). This is a real, disclosed cost, not a silently
invented model decision.

## 0. What was read

- `docs/phase-e0-fundamentals-evidence-contract-design.md` through
  `docs/phase-e3-fundamentals-scorecard-integration-design.md` — the
  full raw contract (`RawFundamentalsData`/`RawFundamentalsPeriod`/
  `GuidanceEvidence`, E.0/E.1A), Growth/Margin Trend derivation (E.1B),
  the normalization model and calibration (E.1C/E.1D), the
  `GROWTH_SOFTWARE_TEMPLATE`/`scoreFundamentals` engine (E.2), and the
  Scorecard integration seam (E.3, now implemented as E.4).
- `src/types/fundamentals.ts` / `src/domain/signals/fundamentals*.ts`
  (current, post-E.4) — confirmed `RawFundamentalsPeriod` today has
  only `periodId: string` ("e.g. '2026-Q2' — provider-agnostic label,
  not itself a parseable date") for period identity — no
  quarterly/annual discriminator, no fiscal-year/quarter fields, no
  period-end date, no filing date. Every derivation function
  (`computeRevenueGrowth`, `computeTrailingTwelveMonthRevenue`, etc.)
  assumes — per their own doc comments — "QUARTERLY reporting... a
  raw-data-shape assumption, not resolved here." This checkpoint is
  where that gets resolved.
- **The existing Momentum live-data architecture** — the direct
  precedent for items 4/8/10:
  - `src/infrastructure/market-data/twelve-data/client.ts` — the
    client/mapper/orchestration layering: a thin fetch layer returning
    `unknown` (never a typed provider DTO leaked past it), API-key
    redaction, one request per call, no silent retry.
  - `src/infrastructure/market-data/twelve-data/mappers.ts` — pure
    functions, provider payload → contract type; a **whole-request
    provider failure throws** (`TwelveDataApiError`), while a
    **field-level problem always becomes `MISSING`**, never a thrown
    error and never a fabricated value — two deliberately different
    failure modes, directly relevant to item 7.
  - `docs/phase-d2-live-momentum-engine-orchestration-design.md` +
    `src/infrastructure/market-data/twelve-data/orchestration.ts` — the
    exact orchestration shape item 10 mirrors: `fetchLiveMomentumResult`
    composes independent fetches, assembles the raw contract, calls the
    scoring engine, and **never throws** — every failure anywhere in the
    chain is caught and converted to `undefined`, logged server-side via
    `console.error`, never propagated. §1 there is the Server/Client
    Component boundary argument item 8 reuses unchanged.
  - `docs/phase-d3-momentum-provenance-design.md` — the reasoning item
    9 reuses: provenance was deliberately built *after* live
    orchestration existed, not alongside it.
- `docs/playbook-decision-engine-spec-v0.1.md` §12/§29 — Guidance's AI
  Research Contract, re-confirmed as the basis for item 6's extraction
  boundary (already partially resolved in E.0 §3.2, extended here to
  cover *where the source text comes from*, which E.0 did not address).

## 1. Two evidence paths, kept structurally separate

**Path A — structured financial data** (revenue, operating income,
operating cash flow, capex, cash, debt, period metadata): a
provider-independent, fully numeric contract — no AI anywhere in this
path. **Path B — Guidance evidence**: the one dimension whose raw
evidence requires an AI-extraction step from unstructured text (spec
§12/§29), landing in the same `GuidanceEvidence` shape E.0/E.1A already
defined and implemented. These paths never merge until the final
`RawFundamentalsData` assembly step (§5) — a structured-data provider
outage must not affect Guidance's availability, and vice versa.

## 2. Provider-independent interface for structured fundamentals (item 1)

`RawFundamentalsPeriod`/`RawFundamentalsData` (E.1A) already are this
interface in spirit — no new *concept* is introduced, only the fields
items 2–3 require are added (§3). The shape any structured-fundamentals
provider's mapper must ultimately produce, mirroring
`RawQuote`/`OhlcvBar`'s role for momentum exactly: nothing here is
provider-specific, and (per instruction) no provider is chosen — the
contract stands on its own, testable against synthetic fixtures alone,
the same way `RawMarketData` was validated (C.0) before Twelve Data was
picked (C.7/C.8A).

## 3. Reporting-period metadata (item 2)

The current `periodId: string` label is insufficient — it cannot
express quarterly-vs-annual, fiscal alignment, or the two genuinely
different dates a period has. Proposed addition (illustrative, not
implemented):

```ts
// illustrative — src/types/fundamentals.ts, revised
export type FundamentalsPeriodType = "QUARTERLY" | "ANNUAL";

export interface RawFundamentalsPeriod {
  periodId: string;           // unchanged — provider-agnostic display label, e.g. "2026-Q2"
  fiscalYear: number;         // NEW — e.g. 2026
  fiscalQuarter?: 1 | 2 | 3 | 4; // NEW — present only when the dataset's periodType is QUARTERLY (see §4)
  periodEndDate: string;      // NEW — the period's own end date (e.g. "2026-06-30"); distinct from periodId's label, used for chronological ordering and TTM-window math
  filingDate?: string;        // NEW — when the report was actually published; may lag periodEndDate by weeks. The correct freshness anchor (§6) — optional only because some historical/backfilled data may not carry it, never because it's unimportant
  revenue: DataField<number>;
  operatingIncome: DataField<number>;
  operatingCashFlow: DataField<number>;
  capitalExpenditures: DataField<number>;
  cashAndEquivalents: DataField<number>;
  totalDebt: DataField<number>;
}
```

`fiscalYear`/`fiscalQuarter`/`periodEndDate` are the concrete answer to
item 2's list; `filingDate` is deliberately optional (not every
historical record a provider returns will carry it) but always
*preferred* when present (§6).

## 4. Avoiding overlapping annual + quarterly periods (item 3)

**Resolved at the `RawFundamentalsData` level, not per-period** — one
new field applies to the *whole* `periods` array, making a mixed-cadence
array structurally impossible to represent, not merely discouraged by
convention:

```ts
// illustrative — src/types/fundamentals.ts, revised
export interface RawFundamentalsData {
  instrumentId: string;
  periodType: FundamentalsPeriodType; // NEW — applies to every entry in `periods`; the type-level guarantee against mixing
  periods: RawFundamentalsPeriod[];   // unchanged shape, now guaranteed homogeneous by periodType
  guidanceEvidence: DataField<GuidanceEvidence>;
  checkedAt: string;
}
```

**Why this beats the alternative (two separate arrays,
`quarterlyPeriods`/`annualPeriods`):** every E.1A/E.2 derivation
function (`computeRevenueGrowth`, `computeTrailingTwelveMonthRevenue`,
etc.) already reads a single `periods: RawFundamentalsPeriod[]` with
fixed-offset indexing (4-back for YoY, last-4-sum for TTM) — splitting
into two arrays would require touching every one of those
already-shipped, already-tested functions to decide which array to read
from. Tagging the single array with one homogeneity field costs nothing
in the derivation layer and is strictly additive there — only the raw
*assembly* step (§5) needs new logic. This is the smaller change,
consistent with this phase's own recurring "smallest clean" standard
(E.1B §5, E.1C's FCF-metric resolution).

**When a provider offers both cadences for the same instrument:**
`QUARTERLY` is preferred, unconditionally — every derivation function
this system has built so far (Growth Trend, Margin Trend, TTM revenue)
needs quarterly granularity to produce a meaningful two-point delta or
four-quarter sum; annual-only data would make those three dimensions
permanently `MISSING` even when the company reports quarterly. `ANNUAL`
is used only when a provider genuinely offers no quarterly data for
that instrument (common for some non-US filers). This preference is
stated once, here, not re-decided per instrument or per fetch.

## 5. Assembling `RawFundamentalsData` (item 4)

Mirrors `buildRawMarketData`'s role exactly — one pure, provider-
independent assembly function, but split across the two evidence paths
(§1) and merged at the end:

```ts
// illustrative, not implemented
function buildRawFundamentalsData(
  structured: ParsedStructuredFinancials, // already provider-mapped, path A
  guidanceEvidence: DataField<GuidanceEvidence>, // already resolved, path B (§7)
  checkedAt: string
): RawFundamentalsData {
  return {
    instrumentId: structured.instrumentId,
    periodType: structured.periodType, // chosen per §4's quarterly-preferred rule, upstream of this function
    periods: structured.periods, // sorted oldest-to-newest by periodEndDate — validated here, not assumed
    guidanceEvidence,
    checkedAt,
  };
}
```

Path A's own mapper is responsible for the quarterly-preference
decision (§4) and for sorting/validating `periods` before this function
ever sees them — same division of labor `mapTimeSeriesResponse` already
has for momentum ("never trusts the payload's order... re-sorts
ascending itself").

## 6. Where freshness/`asOf` comes from (item 5)

Two genuinely different dates exist per period (§3); they serve two
different purposes, and conflating them would be a real correctness
bug, not a style choice:

- **Every `DataField<number>`'s `asOf`** (revenue, operatingIncome,
  etc.) should be the period's **`filingDate`** — when the fact
  actually became knowable to the market — never `periodEndDate` (when
  the underlying business activity happened, but before anyone could
  have known the number). This is what `evaluateFreshness` (already
  built, C.0/E.1C §4.2) actually needs: "how old is our *knowledge* of
  this fact," not "how old is the fact itself." When `filingDate` is
  absent (an older/backfilled record without it), `periodEndDate` is
  the fallback, explicitly less correct but not absent — never leave
  `asOf` unset.
- **`guidanceEvidence`'s `asOf`** — the guidance source document's own
  disclosure date (§7's `GuidanceSourceDocument.publishedAt`), not the
  moment AI extraction happened to run.
- **`checkedAt`** (already on `RawFundamentalsData`, unchanged) — keeps
  its existing, distinct meaning: when *this fetch attempt* happened,
  even if everything inside came back `MISSING`. Not conflated with
  either date above, same as `RawMarketData.checkedAt` today.

## 7. AI Guidance extraction boundary and output contract (item 6)

E.0 §3.2 already fully specifies `GuidanceEvidence`'s *output* shape and
spec §12's deterministic mapping (implemented, E.1A/E.2, untouched
here). What was not yet addressed: where the *input text* comes from.

```ts
// illustrative, not implemented — the extraction INPUT, new to this checkpoint
export interface GuidanceSourceDocument {
  documentType: "EARNINGS_RELEASE" | "SHAREHOLDER_LETTER" | "EARNINGS_CALL_TRANSCRIPT";
  publishedAt: string; // this document's own disclosure date — becomes GuidanceEvidence's DataField.asOf (§6)
  text: string;
}

// illustrative, not implemented — the extraction boundary itself. NOT
// implemented per instruction; this signature is the contract a future
// AI-extraction step must satisfy, nothing more.
function extractGuidanceEvidence(doc: GuidanceSourceDocument): Promise<GuidanceEvidence | null>;
```

**The boundary, stated explicitly, per spec §2/§12 and this
checkpoint's own instructions:**
- AI may only ever populate `GuidanceEvidence.{direction, magnitude,
  evidence}` — a structured fact extracted from `doc.text`. It never
  sees, computes, or influences a numeric score; `mapGuidanceEvidenceToScore`
  (already implemented) is the only place a number is ever assigned, and
  it is pure deterministic code with no AI in its call path.
- **AI must never be asked to extract when `doc` doesn't exist.** If no
  `GuidanceSourceDocument` is available for the current cycle, the
  pipeline does not call `extractGuidanceEvidence` at all — it goes
  straight to `guidanceEvidence: {status:"MISSING"}` (§8). This is the
  literal, direct answer to "do not infer `GuidanceEvidence` when
  source text is absent": there is no code path in this design that
  could infer it, because the function that would produce it is simply
  never invoked without real source text.
- A failed/null/malformed extraction result is treated identically to
  "no document" — `MISSING`, never a partial or best-guess
  `GuidanceEvidence` (§8).
- **Which document to prefer** when a provider/source surfaces more
  than one candidate for the same period (an earnings release *and* a
  call transcript, say, potentially with subtly different emphasis) is
  a real, open selection-policy question — not resolved here, and
  explicitly not blocking this checkpoint's architecture (a later
  implementation-time detail, §15, the same category as E.1C/E.1D's
  deferred anchor numbers).

## 8. Failure behavior (item 7)

| Failure | Behavior |
|---|---|
| Structured data (path A) entirely unavailable — provider fetch fails, network error, bad instrument id | The **whole** live-fundamentals fetch resolves `undefined` (§11) — never a partially-populated `RawFundamentalsData`. Mirrors `fetchLiveMomentumResult`'s catch-all exactly. |
| Structured data partially missing — some periods present, some fields within a period `MISSING` | **Not a failure at all** — this is the ordinary, already-built `DataField.MISSING` path (E.1A), already correctly propagated through every derivation function and `scoreFundamentals`'s coverage math (E.2). No new handling needed. |
| Guidance source document missing (no earnings release/letter/transcript available this cycle) | `guidanceEvidence: {status:"MISSING"}`. Structured data (path A) is entirely unaffected — the two paths are independent (§1). `scoreFundamentals` already redistributes Guidance's 15% weight over the other six dimensions (E.2's existing coverage math), same as any other `MISSING` component. |
| AI extraction failure (the document exists, but extraction errors, times out, or returns something untrustworthy) | Identical to "guidance missing" — `{status:"MISSING"}`, logged server-side (`console.error`, mirroring D.2's own pattern), never thrown past the orchestration boundary, never a partial/guessed `GuidanceEvidence`. |

## 9. Server/client boundary (item 8)

Identical reasoning to D.2 §1, reused unchanged: this orchestration
must run **server-only** — a Server Component (`page.tsx`-equivalent)
or a Route Handler/Server Action, never inside `PlaybookClientShell`.
Both a structured-financials provider's API key *and* any AI-extraction
service's credentials must never reach the browser bundle. If anything,
this is a **stronger** case than momentum's: fundamentals data changes
quarterly, not daily, so re-fetching (and re-running AI extraction) on
every page load is more wasteful here than it already was for momentum
— worth flagging as a sharper argument for a future caching/revalidation
step, but **not designed here**, consistent with D.2's own identical
non-goal.

## 10. Provider provenance (item 9)

**Not needed now — same reasoning as D.3's own resolution for
momentum, reapplied unchanged.** `MomentumProvenance` was built *after*
D.2's live orchestration already existed — its `FALLBACK` state only
became a meaningful, distinct case once there was a real fetch that
could fail. This checkpoint is fundamentals' *own* first live-fetch
design, not yet implemented — building `FundamentalsProvenance` now
would have nothing real to distinguish. Once a
`fetchLiveFundamentalsResult`-equivalent exists (§11, once
implemented), the identical 3-way derivation D.3 already worked out
applies for free, from `FundamentalsScoreResult | undefined` alone — a
pure function, not new stored state, deferred to its own later
checkpoint (mirroring D.0→D.1→D.2→D.3's own sequencing).

## 11. Orchestration flow: live evidence → `scoreFundamentals()` (item 10)

```text
[Server-only — e.g. src/app/stocks/[ticker]/page.tsx-equivalent]

fetchLiveFundamentalsResult(instrumentId, checkedAt)
  │
  ├─ Path A — structured financials
  │    fetchStructuredFinancials(config, instrumentId)      -> provider JSON (unknown)
  │      -> mapStructuredFinancialsResponse(json)            -> typed, provider-specific parsed shape
  │      -> (choose periodType per §4; sort by periodEndDate) -> ParsedStructuredFinancials
  │
  ├─ Path B — guidance evidence (independent of Path A, per §1)
  │    fetchGuidanceSourceDocument(config, instrumentId)     -> GuidanceSourceDocument | undefined
  │      -> if undefined:                                       guidanceEvidence = { status: "MISSING" }  (§8)
  │      -> if present:  extractGuidanceEvidence(doc)  [AI]  -> GuidanceEvidence | null
  │           -> if null/failed:                                guidanceEvidence = { status: "MISSING" }  (§8)
  │           -> if succeeded:                                  guidanceEvidence = { status: "AVAILABLE", value, asOf: doc.publishedAt }  (§6)
  │
  ├─ buildRawFundamentalsData(pathA, guidanceEvidence, checkedAt)  -> RawFundamentalsData   (§5)
  │
  └─ scoreFundamentals(GROWTH_SOFTWARE_TEMPLATE, rawFundamentalsData) -> FundamentalsScoreResult

catch (anywhere above) -> console.error(...); return undefined   -- never thrown further, mirrors fetchLiveMomentumResult exactly
```

Paths A and B are independent and can run concurrently (`Promise.all`-
style, same as momentum's parallel quote/time-series/fx fetches) —
neither depends on the other's result. The final function signature:

```ts
// illustrative, not implemented
async function fetchLiveFundamentalsResult(
  instrumentId: string,
  checkedAt: string
): Promise<FundamentalsScoreResult | undefined>;
```

Same shape as `fetchLiveMomentumResult` deliberately — a future
`page.tsx` caller composes both calls identically (`initialMomentumResult`/
`initialFundamentalsResult` props into `PlaybookClientShell`), mirroring
D.2 §2.2's own prop-threading pattern exactly.

## 12. Disclosed cost — this is a breaking change to E.1A/E.2's raw types

Unlike every prior E-phase design checkpoint, §3/§4's additions are
**not purely additive**: `fiscalYear`/`periodEndDate`/`periodType`
become new *required* fields on `RawFundamentalsPeriod`/
`RawFundamentalsData`. Every existing test fixture across
`fundamentals.test.ts`, `fundamentals-score.test.ts`, and
`growth-software.test.ts` (E.1A/E.1B/E.2, all already shipped) builds
period objects without these fields and would need updating. This is
stated plainly rather than minimized: correctly resolving items 2–3
requires it, and no additive-only alternative was found that doesn't
either (a) leave the quarterly/annual mixing hazard unresolved at the
type level, or (b) require the larger, more invasive two-array split
(§4) that would touch every derivation function's internals instead of
just its test fixtures. Between "touch six functions' internal logic"
and "touch three test files' fixtures," the fixture-only cost is
smaller and does not risk the already-validated derivation math — that
is the basis for this being the *chosen* smallest-cost path, not an
unexamined default.

## 13. Explicit non-goals of this design

- No provider chosen for structured financials or Guidance source
  documents — per instruction, provider choice comes after the
  contract; nothing here depends on Twelve Data, or any other named
  API, having a specific shape.
- No AI extraction implemented — §7 defines the contract, not a prompt,
  model choice, or extraction pipeline.
- No caching/revalidation strategy (§9) — flagged as an even sharper
  need than momentum's own identical D.2 non-goal, not designed here.
- No `FundamentalsProvenance` (§10).
- No Scorecard/stance/action-zone wiring beyond what E.3/E.4 already
  built — this checkpoint only extends *how `fundamentalsResult` gets
  produced*, not what the engine does with it.
- No code written — every snippet above is illustrative.

## 14. Architecture conflict check

None found. The proposed shape reuses every existing pattern
(client/mapper/orchestration layering, `DataField`, the
`SCORED`/`INSUFFICIENT_DATA` result shape, the catch-all-never-throws
orchestration convention, the Server/Client Component boundary) without
modification to any of them. The one real cost (§12) is a type-shape
change to already-shipped code, not a case where the architecture
itself cannot represent the intended behavior — explicitly not an
`ARCHITECTURE CONFLICT`, and not a `MODEL DECISION REQUIRED` either:
every choice in §2–§11 has exactly one reasoned answer, with open
*implementation-detail* questions (document-source preference, §7)
explicitly named as such rather than silently resolved or inflated into
blocking forks.

## 15. Recommended next step

Not implemented here, per instruction. A future E.6 implementation
checkpoint would be mechanical but sequenced: (1) revise
`RawFundamentalsPeriod`/`RawFundamentalsData` per §3/§4, updating every
existing E.1A/E.1B/E.2 test fixture (§12's disclosed cost — a real,
non-trivial but mechanical pass, not a design question); (2) implement
`buildRawFundamentalsData` (§5); (3) choose and implement a structured-
financials provider client/mapper (now that the contract is fixed,
§2's own stated ordering); (4) choose and implement a Guidance
source-document provider and the AI extraction call satisfying §7's
contract; (5) implement `fetchLiveFundamentalsResult` (§11) with tests
mirroring `orchestration.test.ts`'s own mocked-fetch style; (6) wire it
into `page.tsx`/`PlaybookClientShell` exactly as D.2 did for momentum.
Caching (§9) and provenance (§10) remain their own, later, separate
checkpoints, not assumed to be part of E.6.
