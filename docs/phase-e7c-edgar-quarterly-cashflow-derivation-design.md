# Phase E.7C — EDGAR Quarterly Cash-Flow Derivation Design

Status: DESIGN ONLY — no application code changed, no scoring/anchor
change, no domain-contract change, nothing wired into
`mapEdgarCompanyFacts` (Phase E.7B) yet. **No MODEL DECISION REQUIRED.**
Every fork considered below (§9) resolves to a single, well-reasoned
answer by directly reusing a precedent this project already approved
(E.6A's `MISSING != 0`, E.7A/E.7B's latest-filed dedup and
`filingDate ?? periodEndDate` asOf rule, E.7A §9's "tag/derivation
provenance is mapper-internal, not a contract concern") — not a new
tradeoff invented for this checkpoint.

## 0. What prompted this and what was additionally verified this session

E.7B's live Unity run (`npm run validate:live-sec-edgar-fundamentals`)
showed `operatingCashFlow`/`capitalExpenditures` MISSING far more often
(18/25 mapped periods) than E.7A's own live checks anticipated. This
session re-fetched Unity's real `companyfacts` payload (the same
already-approved, already-implemented E.7B client — a read-only GET,
no new endpoint) and inspected every raw
`NetCashProvidedByUsedInOperatingActivities` /
`PaymentsToAcquirePropertyPlantAndEquipment` fact directly (54 raw
facts each, 29 after the existing latest-filed dedup) to find the exact
mechanism, not guess at it:

**LIVE-CONFIRMED root cause**: Unity's cash-flow-statement facts are
**cumulative year-to-date, every quarter except Q1**. For every fiscal
year in the payload, the only genuine ~90-day (single-quarter) duration
fact is the one starting at the fiscal year's own start (Q1 — where
"year to date" and "the quarter itself" are definitionally the same
thing). Q2's fact is always a ~180-day (6-month) duration, Q3's is
always a ~272-day (9-month) duration, and the annual figure is a
~364-day (`fp:"FY"`) duration — **never** a discrete ~90-day fact for
Q2/Q3/Q4. This is a genuine reporting convention (common for the cash
flow statement specifically, unlike the income statement, where Unity
*does* also disclose a discrete-quarter column — see E.7A §0.3's
revenue example, which is the opposite pattern: two facts per quarter,
not cumulative-only), not a Unity-specific quirk — nothing below
special-cases Unity; the mechanism is duration-and-tag-shape-driven,
identical to how E.7A/E.7B already treat every other filer.

## 1. The general model: fiscal-year cumulative "tiers"

Every duration fact already carries `start`/`end`; `(end - start)` in
days classifies it into one of four tiers, extending E.7A/E.7B's
existing single-quarter/annual duration classification (§4.1/§4.3 there)
rather than replacing it:

| Tier | Duration window (days) | What it represents |
|---|---|---|
| 1 | 80–100 (existing E.7B window, unchanged) | a genuine single quarter — either Q1 (YTD = Q1 by construction) or a filer's discrete-quarter disclosure for any quarter |
| 2 | 170–190 | 2-quarter (6-month) cumulative YTD |
| 3 | 260–285 | 3-quarter (9-month) cumulative YTD |
| 4 | 355–375, **and** `fp === "FY"` | full fiscal year — both conditions required (duration alone would also match a fiscal year shortened by a fiscal-year-end change that happens to land in this window; requiring `fp === "FY"` too avoids that ambiguity at negligible cost, since every annual fact sampled across E.7A/E.7B/this session carries `fp:"FY"`) |

Tiers 2–4 are **new** relative to E.7B, which discarded every
non-single-quarter, non-annual-labeled fact outright. E.7C proposes
*retaining* tiers 2–4 as algebraic **inputs**, not as periods in their
own right — no annual or half-year/three-quarter `RawFundamentalsPeriod`
is ever emitted; §4.3's existing "quarterly periods only" rule is
unchanged in its *output*, only extended in which raw facts the mapper
is allowed to *read* on the way there (E.7A §9's own precedent: which
raw tag/fact fed a value is mapper-internal).

Facts within a tier are deduplicated by the existing latest-filed rule
(E.7A/E.7B §4.4) **before** any subtraction — restated/amended
cumulative facts are handled by the same already-approved mechanism,
not a new one (§5.1 below).

## 2. Per-quarter resolution

**Governing precedence rule, applied uniformly to all four quarters,
not just Q1**: a directly-reported genuine single-quarter (tier-1) fact
is *always* preferred over a derived value, for whichever quarter it
happens to cover. E.7B's existing extraction already produces this for
any quarter a filer discloses discretely (Q1 for Unity; potentially
Q2–Q4 too for a filer that *does* disclose a discrete-quarter cash-flow
column). Derivation is a **fallback**, evaluated per-quarter, attempted
**only when the tier-1 path is MISSING for that specific quarter's end
date** — never as a first choice, since a computed value can only be
as good as its two inputs and directly-reported data carries no
subtraction risk at all.

1. **Q1 — unchanged from E.7B.** Its own YTD-so-far fact *is* the
   single quarter (tier 1) whenever it exists. No predecessor exists
   before it in the fiscal year, so there is nothing to derive it
   from — absent its own tier-1 fact, Q1 stays MISSING, exactly as
   today.

2. **Q2 = tier-2 fact − tier-1 (Q1) fact**, same fiscal-year `start`.

3. **Q3 = tier-3 fact − tier-2 fact**, same fiscal-year `start`.

4. **Q4 = tier-4 (`fp:"FY"`) fact − tier-3 fact**, same fiscal-year
   `start`. **Approved**, gated by the identical alignment check
   required for Q2/Q3 (§3) — no extra caution beyond that, and no
   weaker guarantee than Q2/Q3: the same two checks (matching `start`,
   resulting gap in the single-quarter window) that make Q2/Q3 safe
   make Q4 safe too. A fiscal-year-end change severe enough to break
   this (a stub/transition year) fails the gap-duration check below and
   correctly falls back to MISSING rather than silently misfiring — see
   §5.3.

Every derivation is a **plain subtraction of two already-deduplicated,
already-validated facts** — no interpolation, no averaging, no
model-fitting (per instruction §6).

## 3. The one alignment-safety gate, shared by Q2/Q3/Q4

A derivation for quarter *N* (using cumulative fact `cur` and its
one-tier-lower predecessor `prev`, both already resolved from the same
fiscal-year `start` group) is attempted **only if all of**:

1. `cur.start === prev.start` — both cumulative facts are anchored to
   the *same* fiscal-year start. A mismatch (a fiscal-year-end change,
   a data anomaly) means the subtraction would mix two different
   accounting periods — never attempted; falls through to MISSING.
2. Exactly one tier-1/2/3/4 candidate exists for that `start` in each
   tier being compared — see §5.2 for the "more than one" case.
3. `(cur.end − prev.end)` falls in the existing 80–100-day single-quarter
   window (the *same* constant E.7A/E.7B already use, not a new
   tolerance) — this is what actually proves "the gap between these two
   cumulative snapshots is one genuine quarter," and is what catches a
   fiscal-year transition/stub period generically, without any
   calendar-month assumption (§5.4).

This single gate is *why* Q4 needs no separate, weaker-confidence
treatment than Q2/Q3 (resolving item 4 of the instruction): the
"period alignment is deterministic" question reduces to exactly the
same two checks in every case. Live-confirmed this session: zero of
Unity's 20 newly-derivable OCF/capex quarters were blocked by this gate
— every one had matching starts and a clean 80–100-day gap (§7).

## 4. Where a derived value's `asOf` comes from (instruction item 7)

Reuses E.7B's own `toTotalDebtField` pattern (the one existing
multi-fact-combining field) rather than inventing a new rule:

```text
asOf(derived quarter N) = max(filed(cur), filed(prev))
                          falling back to cur.end only if BOTH lack `filed`
```

Both contributing facts must have already become knowable for the
derived value to be knowable — using only one side's `filed` (e.g. the
earlier `prev`) would understate how stale the derived figure actually
is, since the *later* of the two filings is what completed the
computation. `filed` dates compare correctly as plain ISO strings (the
same lexicographic-comparison trick `parsing.ts`'s existing dedup
already relies on) — no date-library dependency needed.

## 5. The six hazards (instruction item 5)

### 5.1 Amended filings / latest-filed facts

No new rule: each tier's candidate fact is resolved via the *existing*
per-`(start,end)` latest-filed dedup (E.7A/E.7B §4.4) before any
subtraction runs. A later restatement of, say, the 6-month figure is
picked up automatically on the next mapper run (this mapper is pure and
stateless — it recomputes from whatever snapshot of `companyfacts` it's
given, same as every field today).

**Disclosed, accepted limitation, not solved here**: nothing detects
whether a restatement was *jointly* applied to sibling cumulative facts
(e.g. Q1 restated but the 6-month figure not yet re-filed to match).
Building a cross-fact reconciliation heuristic would itself be a form
of estimation — explicitly out of scope (item 6) — so a transient,
internally-inconsistent derived quarter during the narrow window between
an amendment and its sibling filings is accepted as a known, disclosed
risk, not silently corrected or flagged with new provenance metadata
(§8).

### 5.2 Missing predecessor cumulative facts

If `prev` (or `cur`) doesn't resolve to exactly one candidate for that
`start`/tier — either **absent** (no fact in that tier at all) or
**ambiguous** (more than one fact lands in the same tier for the same
`start`, an XBRL anomaly no live fact this session or E.7A/E.7B
exhibited) — the derivation is not attempted; that quarter is MISSING.
Never falls back to using `cur` alone as if it were already a single
quarter (that would silently report, e.g., 9 months of cash flow as one
quarter — exactly the fabrication class item 6 forbids). This is a
direct extension of `fundamentals.ts`'s own already-stated "no partial
computation" convention.

### 5.3 Fiscal-year boundaries / transition periods

Handled entirely by §3's `start`-matching + gap-duration checks — no
separate transition-period detection needed. A fiscal-year-end change
severe enough to produce a genuine stub period will make either the
`start` values disagree or the computed gap fall outside 80–100 days,
both already-covered failure paths that resolve to MISSING.

### 5.4 Non-calendar fiscal years

The entire model is calendar-agnostic by construction: every check
(`start` equality, tier classification, gap duration) operates on the
literal `start`/`end` date strings a filer's own XBRL reports — nothing
assumes a January fiscal-year start or that "Q2" means April–June.
Live-verified indirectly: Unity's own fiscal year happens to be
calendar-aligned, but nothing in §1–§3 reads a calendar month anywhere;
a June-fiscal-year-end filer's facts would classify into the identical
four tiers using the same day-count windows.

### 5.5 Negative capex conventions

`RawFundamentalsPeriod.capitalExpenditures`'s own doc comment already
says "stored as a positive outflow figure," but neither E.7B's raw
`toDataField` nor anything else already in this codebase clamps or
sign-checks it — the raw XBRL value is passed through as-is today,
positive or not. E.7C preserves that: a derived value (a plain
subtraction) is stored **exactly as computed, unclamped**, including a
possible negative result (e.g. a quarter with net PP&E disposal
proceeds exceeding new purchases nets to a negative incremental capex
— a legitimate real value, not an error). Introducing a new positivity
check for this checkpoint would be a **new validation rule with no
existing precedent for these two specific fields** — not something this
design adds. `operatingCashFlow` has no sign convention at all (it's
routinely negative already, e.g. Unity's own Q1 2020 figure above), so
this concern only ever applies to capex.

### 5.6 Mismatched start/end dates

This is §3's alignment gate restated from the failure side: a `start`
mismatch or an out-of-window gap both resolve to MISSING, never a
guessed or partially-computed value. No live Unity fact this session
exhibited either failure mode (§7) — both paths exist purely as a
guardrail against a filer this project hasn't yet observed live.

## 6. What's preserved (instruction item 6) — confirmed, not just asserted

- **MISSING when derivation cannot be proven** — every failure path in
  §3/§5 above resolves to MISSING, never a fabricated or partial value.
- **`filingDate ?? periodEndDate` asOf semantics** — §4 extends the
  *same* rule (already generalized once for `totalDebt`'s sum) to a
  subtraction; no second asOf convention introduced.
- **No interpolation or estimation** — every derived value is an exact
  algebraic identity (`cumulative(N) − cumulative(N−1)` *is* quarter
  *N*'s standalone figure when both cumulative snapshots share a fiscal-
  year start and are exactly one quarter apart — not an approximation).
- **No Unity-specific logic** — confirmed in §5.4; every rule is
  expressed in terms of `start`/`end`/duration/`fp`, never a calendar
  month, a specific CIK, or a specific filer's tag choice.

## 7. Expected FCF-evidence-coverage improvement — LIVE-ESTIMATED, not guessed (instruction item 8)

Re-fetched Unity's real `companyfacts` this session (same endpoint/
client as E.7B) and simulated §1–§3 above against the actual 54 raw
facts per concept (29 after dedup), without writing any of this into
the mapper:

| Concept | Available today (tier-1 only) | Newly derivable under E.7C | Coverage |
|---|---|---|---|
| Operating cash flow | 7 quarters (every Q1, 2020–2026) | **+20** (every Q2/Q3/Q4 observed) | 7 → 27 of 27 possible quarter-ends in the fetched range |
| Capital expenditures | 7 quarters | **+20** | 7 → 27 of 27 |

Zero of the 20 gains were blocked by the §3 alignment gate (no
ambiguous-tier or misaligned-start cases in Unity's real data) — the
full theoretical gain is realized for this instrument.

**Direct effect on E.7B's live SCORED result**: E.7B's most recent
mapped period (`periodEndDate: "2026-06-30"`) had `operatingCashFlow`
and `capitalExpenditures` both MISSING, which is exactly why
`fcfMargin` (weight 0.20, the single largest GROWTH_SOFTWARE dimension)
was MISSING in that run's final component list.
`2026-06-30` is one of the 20 live-confirmed newly-derivable quarters
above (Q2, gap = 91 days from the 2026-Q1 fact, `start` match exact) —
so implementing E.7C would very likely turn `fcfMargin` AVAILABLE for
Unity's current quarter, directly raising `availableWeightShare` above
E.7B's measured 55.0% without touching any anchor, weight, or scoring
rule.

This result is Unity-specific **only as a demonstration instrument**
(per instruction §6/no-Unity-specific-logic, the mechanism itself is
generic) — a filer that already discloses discrete Q2–Q4 cash-flow
figures would see a smaller or zero gain here, correctly, since §2's
precedence rule never overrides an already-available direct fact.

## 8. Contract impact

**None.** `RawFundamentalsData`/`RawFundamentalsPeriod` are unchanged.
A derived `operatingCashFlow`/`capitalExpenditures` value is stored in
the exact same `DataField<number>` shape a directly-reported one is —
whether a given value was read directly or derived by subtraction is,
per E.7A §9's already-settled reasoning ("which XBRL tag produced a
value is mapper-internal, not a domain-contract concern"), the same
class of fact: mapper-internal provenance, not something any consumer
of `RawFundamentalsData` (derivation layer, scoring engine, template)
needs to see. No new field, no new status, no new metadata.

## 9. Explicit non-goals of this design

- No code written — every rule above is illustrative, not implemented.
- No change to `mapEdgarCompanyFacts` (E.7B) — this is a design for a
  future extension of it.
- No scoring/anchor change — `scoreFundamentals`/
  `GROWTH_SOFTWARE_TEMPLATE`/`computeFcfMargin` are untouched.
- No Scorecard/engine/app wiring.
- No cross-fact restatement-consistency reconciliation (§5.1) — flagged
  as an accepted limitation, not solved.
- No revenue/operating-income derivation — E.7A/E.7B's income-statement
  handling (which already captures a discrete-quarter fact for most
  filers per E.7A §0.3) is out of this checkpoint's scope, which is
  cash-flow-statement-specific per instruction.

## 10. Forks considered and resolved (no MODEL DECISION REQUIRED)

Every apparent choice point above resolves by reusing an
already-approved precedent, not by picking between two live options:

- *Derive-first vs. report-first when both exist*: report-first, for
  every quarter — the only reading consistent with "no interpolation or
  estimation" (a computed value never overrides better, directly-
  disclosed data).
- *Clamp negative derived values vs. preserve them*: preserve — matches
  the existing, already-shipped unclamped behavior for these two fields
  (§5.5); clamping would be a new, un-precedented rule.
- *Attempt cross-fact restatement reconciliation vs. accept the gap*:
  accept and disclose (§5.1) — reconciliation logic would itself be
  estimation, which item 6 explicitly forbids.
- *New provenance metadata for "this value was derived" vs. none*: none
  — directly inherits E.7A §9's already-settled contract-stability
  reasoning.

## 11. Recommended next step

Not implemented here, per instruction. A future E.7D implementation
checkpoint would: (1) extend `parsing.ts`'s fact extraction to retain
tiers 2–4 as a separate, non-emitted candidate pool; (2) add the
fiscal-year-`start`-keyed tier resolution + §3's alignment gate as a
small, pure, independently unit-testable function; (3) wire its result
into `mapEdgarCompanyFacts`'s existing `toDataField` calls for
`operatingCashFlow`/`capitalExpenditures` only, as a fallback after the
existing tier-1 lookup; (4) add fixture tests using this session's real
Unity tier-2/3/4 facts (§7) as the primary cases, plus a synthetic
mismatched-`start`/ambiguous-tier fixture for the two failure paths
Unity's own data didn't exercise (§5.2/§5.6).
