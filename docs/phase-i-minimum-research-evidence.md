# Phase I — Minimum Research Evidence

Status: **product/model definition** (§§0-8 below, unchanged from the
original version of this document — no code changed by that pass), **plus
Phase I.1 — Data Foundation** (§9, implemented), **Phase I.2 — Annual
Cadence Support** (§10, implemented), **Phase I.3 — Business Trajectory**
(§11, implemented; §12 records a real regression Phase I.3's live
validation caught in Phase I.1's own wiring), **Phase I.3.1 —
Reporting-Currency Discovery** (§13, implemented — the architectural fix
for §12, closing its open decision: ASML's Fundamentals-derived evidence,
including Business Trajectory, now works end to end, live-verified),
**Phase I.4 — FundamentalChangeEvidence** (§14, implemented — the
deterministic primitive behind Recent Changes, deliberately not named
"Recent Material Changes" once its own spike found no honest way to
define general materiality), and **Phase I.5 — Recent Changes
Presentation** (§15, implemented — the smallest UI slice over §14's
primitive, live-verified for both Unity and ASML), a **0.30.0 Valuation
Context feasibility spike** (design only, no code — resolved the four
open product/model decisions §16 below lists), **Phase I.4A —
Valuation Data Foundation** (§16, implemented — the data plumbing + pure
deterministic derivation behind EV/Revenue observations; §16.7 fixes a
blocking point-in-time correctness bug found after implementation), and
**Phase I.4B — Minimum Valuation Context** (§16.8, implemented — current
EV/Revenue vs. its own recent-history median, described in one plain
sentence; still no percentile, score, or classification beyond that).
Builds directly on
`docs/minimum-research-model.md` (the five-area research model) and
`docs/post-phase-h-product-review.md` (the seven findings that motivated
it). Where those two documents proposed a broader five-area model, this
document deliberately narrows Phase I to three value points and states,
explicitly, what is out of scope and why.

**Core question:** *What is the smallest set of research evidence that
makes a generic Stock Playbook meaningfully more useful to a beginner,
without turning it into a verdict machine?*

Unity and ASML remain the two reference cases throughout, for the same
reason `minimum-research-model.md` used them: Unity is the one stock
with live, computed, US-GAAP-backed fundamentals *and* a complete,
hand-authored qualitative layer; ASML is the real generic case — a
foreign private issuer where the live SEC EDGAR pipeline honestly
returns "Not available" today. Any area that only "works" for Unity is
not yet a generic capability.

---

## 0. What was read

- `docs/minimum-research-model.md` — the five-area model (Business
  Health, Valuation, Thesis & Watch, Portfolio Fit, Momentum), its
  overlap analysis (§3), its explicit non-goals (§4), and its trust-vs-
  usefulness split (§5). Phase I's three areas map onto three of these
  five; §1 below states the mapping and what was deliberately left out.
- `docs/post-phase-h-product-review.md` — F1 (no Valuation), F2
  (Fundamentals archetype doesn't generalize), F3 (no per-stock
  research), F4 (placeholder/model-fit invisibility, since remediated —
  see below), F5 (frozen copy citing evidence that doesn't exist).
- Current code, verified directly (not re-derived from the two docs
  above, which predate some of this):
  - **Fundamentals contract**: `src/types/fundamentals.ts` —
    `RawFundamentalsPeriod` (revenue, operatingIncome,
    operatingCashFlow, capitalExpenditures, cashAndEquivalents,
    totalDebt, all `DataField<number>`), `GuidanceEvidence`
    (`direction`/`magnitude`/`evidence[]`), `FundamentalsComponentScore`
    (`AVAILABLE`/`MISSING`/`NOT_APPLICABLE`), `FundamentalsScoreResult`
    (`SCORED`/`INSUFFICIENT_DATA`) — never a fabricated score for
    missing evidence.
  - **Fundamentals scoring**: `src/domain/signals/fundamentals-score.ts`
    (generic, archetype-agnostic engine) over
    `src/domain/signals/fundamentals-templates/growth-software.ts`'s
    seven weighted components (`revenueGrowth`, `growthTrend`,
    `operatingMargin`, `marginTrend`, `fcfMargin`, `guidance`,
    `balanceSheet`). `guidanceEvidence` is still unconditionally
    `{status: "MISSING"}` in `sec-edgar/mappers.ts:236` — confirmed
    still true, not yet built. The live pipeline
    (`sec-edgar/orchestration.ts`) only reads the `us-gaap` XBRL
    namespace (`mappers.ts:162`) — a foreign private issuer filing a
    20-F under IFRS (ASML's real situation) has no facts there, so its
    periods end up empty and `scoreFundamentals` returns
    `INSUFFICIENT_DATA`, confirmed live in
    `docs/phase-h6-end-to-end-validation.md`.
  - **`modelFit`**: `src/domain/playbook/fundamentals-model-fit.ts` — not
    a classifier, a static two-value rule
    (`CONFIRMED_FIT` iff the caller passes `isUnity`, else
    `UNKNOWN_FIT`; `LIMITED_FIT` is defined but never produced). This
    postdates `phase-e0`'s design (introduced in Phase H, not E.0).
  - **Momentum**: `src/domain/signals/momentum-score.ts` — six
    components (`rsi`, `relativeVolume`, `structure`, `priceExtension`,
    `trend`, `relativeStrength`), same `SCORED`/`INSUFFICIENT_DATA`
    shape. `src/infrastructure/market-data/twelve-data/orchestration.ts`
    fetches daily OHLC history internally to derive DMAs/RSI/trend, but
    **never returns it** from `fetchLiveMomentumResult` — the raw daily
    bars are not currently exposed as a reusable output anywhere.
  - **Valuation — already fixed at the type/UI level, still zero
    pipeline**: `src/types/playbook.ts`'s `Scorecard.valuation` is
    `ScoreItem | null`, with a comment explicitly forbidding a
    fabricated placeholder. `src/domain/signals/signals.ts`'s
    `deriveValuationScore` is a pure pass-through of that `null`.
    `src/components/playbook/SignalScorecard.tsx` (lines ~101–116)
    already renders `null` as an honest "Not available" row (empty bar,
    em-dash, grey pill, no expand chevron) — **this is F4's fix,
    already shipped**, and `modelFit` is already surfaced as a
    sub-label next to Fundamentals when it's actually `SCORED`. What
    F1/F4 still leaves open, unchanged: there is no live computation
    behind Valuation at all, for any stock. `RawFundamentalsPeriod` has
    no shares-outstanding or market-cap field of any kind.
  - **Thesis**: `src/domain/thesis/thesis.ts` (45 lines) —
    `deriveThesisHealth` is a literal pass-through of a seed value;
    `THESIS_SCORE_MAP` turns `ThesisHealth` into a `ScoreItem`.
    `ThesisTrajectory` (the beginner-vocabulary onboarding Q4 answer:
    `GETTING_STRONGER` / `NO_MEANINGFUL_CHANGE` / `SOME_DOUBTS` /
    `GETTING_WEAKER` / `REASONS_NO_LONGER_HOLD` / `NOT_SURE`) is
    captured in the Proposal and **does** survive into the confirmed
    `StockPlaybookConfig` via
    `mapThesisTrajectoryToHealth` in `materialize-config.ts` — this part
    already works, for every stock, not just Unity.
    `ThesisCard`/`WhatChangesMyView`/`ResearchPreview` import
    `unity-seed.ts` directly with no props at all, and are gated by a
    single `showHandAuthoredThesisContent={isUnity}` prop in
    `StockDetailClientShell.tsx` — confirmed Unity-only, by construction,
    not by content thinness.
  - **AI (H.5)**: `docs/phase-h5-ai-assisted-research-design.md`'s
    header still says "design only" — **stale**; it is implemented.
    `src/domain/ai/evidence-brief.ts` and `intent-assist.ts` generate
    structured, grounded output (`EvidencePoint`/`IntentSuggestion`,
    each carrying a `groundedIn: EvidenceFieldRef[]`) from an
    `AIResearchContext` built by `src/domain/ai/context.ts`;
    `src/domain/ai/validation.ts` mechanically validates every grounding
    reference and enum value, dropping (never repairing) anything that
    doesn't check out. `src/infrastructure/ai/anthropic/orchestration.ts`
    wraps every call in try/catch and fails soft to
    `{status: "UNAVAILABLE"}` — confirmed working with no API key
    configured. The scope boundary (§8 of the design doc) is explicit:
    AI interprets already-computed structured evidence; it never
    fetches, reads, or extracts from a raw filing or news source.
  - **Fixtures**: `src/data/unity-seed.ts` is the only hand-authored
    fixture; there is no `asml-seed.ts` equivalent. ASML's Fundamentals
    and Momentum are both computed live, every time, from the same code
    path Unity uses (`fetchLiveFundamentalsResult` /
    `fetchLiveMomentumResult` in `src/app/stocks/[ticker]/page.tsx`).
    `docs/phase-h6-end-to-end-validation.md` is the closest thing to a
    documented ASML fixture — a live-browser narrative trace, not a JSON
    file.

---

## 1. Scope: three areas, not five

`minimum-research-model.md` proposed five areas (Business Health,
Valuation, Thesis & Watch, Portfolio Fit, Momentum). Phase I keeps
exactly three of them as *active build targets*, holds two as
*explicitly frozen*, and narrows one of the three (Thesis & Watch)
considerably further than that document imagined:

| Phase I area | Maps to `minimum-research-model.md` | Narrowing applied here |
|---|---|---|
| Business Trajectory | Business Health (§2.1) | Trajectory (direction) only, not a 1–10 composite score. Reuses two of the seven existing components (`growthTrend`, `marginTrend`); does not touch the other five or the archetype-fit question. |
| Valuation Context | Valuation (§2.2) | Same "one ratio vs. own history" framing that doc already recommended; this document works out the concrete new data (shares outstanding) that framing actually requires. |
| Recent Material Changes | Half of Thesis & Watch (§2.3) | Deliberately **not** the full merged area that doc proposed. No user-authored thesis statement, no forward watch-list, no filing-reading AI. Just: detect that a computed value changed between two periods, and say so in one sentence. |
| Portfolio Fit | §2.4 | **Frozen.** Already complete; no gap to close; not touched in Phase I. |
| Momentum | §2.5 | **Frozen as supporting/timing evidence.** Its six components, weights, and live pipeline are untouched. The one exception, noted explicitly in §3 below, is exposing its *already-fetched* raw price history for reuse by Valuation Context — that is a plumbing change, not new Momentum evidence. |

**Explicit non-goals for Phase I** (restated from the task, mapped to
why each one matters here):

- **No overall investment/ownership score.** The three areas are read
  side by side, never blended into one number. This also means Business
  Trajectory must not silently become "a fourth attempt at the
  Fundamentals 1–10 score" — see the open decision in §7.
- **No fair-value prediction or DCF.** Valuation Context answers "cheap
  or expensive *for this stock, vs. its own history*," never "worth
  $X."
- **No large research dashboard.** Three compact cards on the existing
  confirmed Playbook page, not a new tab or page.
- **No Thesis Lifecycle, Investment Memory, thesis/evidence history, or
  re-entry workflows.** Recent Material Changes is stateless and
  recomputed on every view — it has no "mark as seen," no persisted log
  of past changes, no lifecycle state machine. This is the area most at
  risk of scope creep toward exactly those forbidden shapes; §6 and §7
  name the guardrail explicitly.
- **No automatic AI buy/hold/sell decisions.** AI's role in all three
  areas stays interpretation of already-computed evidence, exactly
  H.5's existing boundary — it never writes to `UserIntent` or
  `StockPlaybookConfig`, and never outputs an action verb.
- **No unnecessary archetype complexity.** No new classifier, no new
  archetype templates (bank, industrial, biotech, etc.). Business
  Trajectory and Valuation Context both ride on the single existing
  `growth-software` template and the existing binary `modelFit` rule.
  Where that template doesn't fit (ASML), the honest answer is "Not
  available," not a second template.

**The chain every area must preserve** (per the task, and consistent
with H.5's own design): **Evidence → AI interpretation (where useful)
→ user judgment → the existing deterministic Playbook.** Concretely:
a computed value is evidence; an AI sentence about that value is
interpretation, always optional and always dismissible; what the user
does with it is their call; the Playbook's stance/action-zone/portfolio
math (§4 of `minimum-research-model.md`, `PLAYBOOK_INTERFACE_PRINCIPLES.md`)
is unchanged and does not consume any Phase I output as an input. None
of the three areas feeds back into the decision engine.

---

## 2. The three areas

### 2.1 Business Trajectory

**Beginner question:** *Is the business improving or deteriorating?*

**Minimum useful data:** Direction, not level. Two signals, both
already computed as discrete components inside the existing
Fundamentals engine: `growthTrend` (is revenue growth accelerating or
decelerating) and `marginTrend` (is operating margin improving or
worsening). Combine only these two into a small tri-state read —
`IMPROVING` / `DETERIORATING` / `MIXED` (one up, one down) — rather than
showing or requiring the full seven-component, weighted 1–10 composite.
Cash generation (`fcfMargin`) is a reasonable third input but is not
part of the *minimum*; adding it is a cheap, optional extension, not a
Phase I requirement.

**Likely data source:** The existing live SEC EDGAR pipeline —
`fetchLiveFundamentalsResult` → `scoreFundamentals` — already computes
`growthTrend` and `marginTrend` as `FundamentalsComponentScore` values
for every ticker it can resolve. No new data source is required; this
is a narrower *read* of data already being fetched and scored today.

**Deterministic vs. AI responsibility:** The direction itself
(`IMPROVING`/`DETERIORATING`/`MIXED`) is 100% deterministic — it is the
sign of two values the engine already computes, with no new judgment
call. AI's only legitimate role, matching H.5's existing Evidence Brief
pattern exactly, is turning that direction into one plain-language
sentence ("Revenue growth has been accelerating while margins have
held roughly flat") — interpretation of already-computed evidence,
never a new evidence source, never an archetype classification, never
guidance extraction (both of those remain explicitly deferred, per
`minimum-research-model.md` §2.1, and are *not* reopened here).

**Missing/uncertain state:** When the underlying `FundamentalsScoreResult`
is `INSUFFICIENT_DATA` (the ASML case — a real, expected, live outcome
of Phase I, not a bug to fix first) or when `growthTrend`/`marginTrend`
individually resolve to `MISSING`/`NOT_APPLICABLE`, Business Trajectory
shows the same honest "Not available" treatment
`SignalScorecard.tsx` already uses for `null` Valuation today — never a
fabricated direction. If only one of the two components is available,
show that one alone with a note that the read is partial, not a forced
`MIXED`.

**Simplest beginner-facing UX:** Two short lines, no score, no bar:
"Revenue: Accelerating / Decelerating / Flat / Not available" and
"Profitability: Improving / Worsening / Steady / Not available," with
an optional one-sentence AI gloss underneath. This is deliberately
thinner than the existing Fundamentals row on the Signal Overview —
§7 flags the open question of how the two coexist.

**What we can reuse:** The entire fundamentals contract, scoring
engine, SEC EDGAR orchestration/mapper/ticker-resolver pipeline, the
`AVAILABLE`/`MISSING`/`NOT_APPLICABLE`/`INSUFFICIENT_DATA` type
patterns, and the "Not available" rendering pattern already shipped in
`SignalScorecard.tsx`. Genuinely new: a small, pure derivation function
mapping two existing component results to a tri-state read, plus a new
(thinner) UI treatment for it.

---

### 2.2 Valuation Context

**Beginner question:** *Is this stock expensive or cheap right now,
relative to its own history?*

**Minimum useful data:** One ratio, compared against a range of that
same ratio computed at several past points for the same stock — not a
peer comps table, not a fair-value estimate. Candidate ratios:
price-to-earnings (P/E) for a profitable company, EV/Revenue for one
that isn't consistently profitable (relevant for Unity, whose
operating income has been thin or negative in parts of its history).
Which ratio to use, and how, is a real methodology decision — see §7.

**Likely data source:** Partially new. What already exists and is
directly reusable: current price (Twelve Data quote, already fetched
live for every stock), revenue, `totalDebt`, and `cashAndEquivalents`
(all already in `RawFundamentalsPeriod`, sourced from the same SEC
EDGAR pipeline as Business Trajectory) — enough to build an enterprise
value and an EV/Revenue ratio without touching earnings at all. What is
genuinely missing: **shares outstanding** (or a direct market-cap
figure) — there is no field for this anywhere in the current
fundamentals model, and it is required to turn revenue/earnings into a
per-share or enterprise-value figure. Also missing: a reusable source
of **historical** daily prices — Twelve Data's orchestration already
fetches daily OHLC internally to compute Momentum's DMAs, but discards
it after scoring; it would need to be exposed (or re-fetched
independently) to build the "own history" comparison range.

**Deterministic vs. AI responsibility:** All of it is arithmetic, once
the inputs exist — exactly `minimum-research-model.md` §2.2's original
conclusion, confirmed still true by this closer read of the code. No
judgment is needed to compute a ratio or a percentile within a known
history. AI's only role is explaining what "cheaper than 80% of the
last 3 years" means in plain language — never computing, estimating, or
adjusting the ratio itself, and never producing a fair-value number.

**Missing/uncertain state:** Reuse the exact pattern already shipped for
Valuation today — `null`/"Not available," no placeholder score, no
expand affordance. This will legitimately fire for the same population
Business Trajectory already fails for (any stock whose fundamentals are
`INSUFFICIENT_DATA`, including ASML, since the ratio's fundamental
denominator comes from the same source) — an honest, shared failure
mode, not a new one.

**Simplest beginner-facing UX:** The current ratio value plus a simple
range visualization — a min–max bar over the comparison window with a
marker for "today" — captioned something like "cheaper than most of the
last 3 years" / "near the high end of its recent range." No "fair
value," no "undervalued by X%" framing.

**What we can reuse:** `totalDebt`/`cashAndEquivalents`/`revenue` from
the existing fundamentals model; the existing live price quote fetch;
the `null`→"Not available" rendering pattern already shipped in
`SignalScorecard.tsx` (this is close to a direct copy — the UI slot
already exists, it just needs a real value to render instead of
`null`). Genuinely new: a shares-outstanding (or market-cap) data
source and mapper; a mechanism to obtain/retain historical daily
prices; a new deterministic scoring module (mirroring
`fundamentals-score.ts`'s `SCORED`/`INSUFFICIENT_DATA` shape, scaled
down to one ratio); a new UI component for the range visualization.
This is the area with the most real, non-trivial new engineering work
of the three.

---

### 2.3 Recent Material Changes

**Beginner question:** *What changed recently that is actually worth my
attention?*

**Minimum useful data:** Deliberately small: has anything the system
already computes flipped direction or crossed a threshold between the
two most recent periods? Concretely — did `growthTrend` or
`marginTrend`'s component score move in the opposite direction from the
period before, or did the overall `FundamentalsScoreResult` cross from
`SCORED` to `INSUFFICIENT_DATA` or back? That is the entire detection
surface for Phase I. This is intentionally narrower than
`minimum-research-model.md` §2.3's "Thesis & Watch" — no user-authored
thesis statement is re-surfaced here, no forward-looking "what would
change my mind" list, no filing-reading AI. Those remain out of scope,
not because they're not valuable, but because building them is exactly
the Thesis Lifecycle / Investment Memory shape this phase is told not
to create.

**Likely data source:** The same multi-period `RawFundamentalsData`
already fetched by the SEC EDGAR pipeline for Business Trajectory — no
new external data source. A stock needs at least two resolved periods
for there to be anything to diff; this is naturally satisfied for any
ticker whose Fundamentals already resolve to `SCORED` today.

**Deterministic vs. AI responsibility:** Detecting *that* something
changed is fully deterministic — a period-over-period diff of values
the engine already computes, nothing new to fetch or judge.
AI's genuinely new (but appropriately small) role is turning a detected
change into one or two plain-language sentences — "Revenue growth
decelerated for the first time in four quarters" — which stays inside
H.5's existing interpret-only boundary (it reads already-computed,
already-structured deltas, never a raw filing or earnings call
transcript). This is a materially smaller AI extension than
`minimum-research-model.md` §2.3 originally imagined for this area (it
explicitly deferred "reading a recent filing... to compare against the
stated thesis" as a larger, separate scoping decision) — Phase I does
not reopen that larger question.

**Missing/uncertain state:** Fewer than two available periods → "Not
enough history yet," honestly, not silence and not a fabricated "no
change." If Fundamentals are `INSUFFICIENT_DATA` outright (ASML),
there is no fundamentals-based material change to report — whether
Momentum-derived changes should fill that gap for exactly this
population is an open decision (§7).

**Simplest beginner-facing UX:** A short, stateless list — one to three
bullet points, plain language, each optionally carrying an AI-phrased
sentence grounded in the specific delta that produced it (directly
reusing H.5's `groundedIn: EvidenceFieldRef[]` pattern). Recomputed
fresh on every page load; nothing is persisted, marked-as-read, or
logged — the moment this needs its own storage or "history" it has
become the forbidden Thesis Lifecycle/Investment Memory, not this
smaller thing.

**What we can reuse:** The existing multi-period fundamentals data
(already fetched, already scored per-period); H.5's entire grounding/
validation infrastructure (`EvidenceFieldRef` union,
`sanitizeEvidenceBrief`-style validation, `buildAIResearchContext`
pattern, fail-soft orchestration) — a new "Recent Changes" generator can
follow `evidence-brief.ts`'s file exactly, just with a new, narrower
input shape. Genuinely new: a small deterministic diff function over
two periods' component results; a new (small) AI generator plus its
prompt and validation extension; a new stateless UI card.

---

## 3. Cross-area dependencies

- **Valuation Context depends on Business Trajectory's own data
  source**, not just conceptually (per `minimum-research-model.md`
  §3) but concretely: `revenue`/`totalDebt`/`cashAndEquivalents` are the
  same `RawFundamentalsPeriod` fields Business Trajectory reads. A
  stock that can't resolve Fundamentals can't get either area — one
  root cause, two honestly-missing surfaces, not two separate bugs to
  chase.
- **Valuation Context also needs one new fact Business Trajectory does
  not** — shares outstanding / market cap — so it cannot ship purely as
  a byproduct of Business Trajectory's work; it has its own, smaller,
  additional data dependency.
- **Recent Material Changes depends on Business Trajectory's multi-
  period data**, not on Valuation Context — it can ship independently
  of whether shares-outstanding work is done, since it only diffs
  values Business Trajectory already surfaces.
- **Valuation Context's historical-range requirement touches Momentum's
  plumbing, not its evidence.** Momentum's live orchestration already
  fetches the daily price history Valuation Context needs for its "own
  history" comparison; today that history is fetched and then discarded
  after scoring. Exposing it (or re-fetching it independently) is a
  plumbing change to shared infrastructure, not new Momentum evidence,
  and does not change Momentum's own components, weights, or scoring —
  Momentum stays frozen as supporting/timing evidence exactly as
  `minimum-research-model.md` §1.3/§2.5 concluded.

---

## 4. Testability with Unity and ASML

Both stocks must be usable to validate Phase I, but "usable" does not
mean "both succeed" — ASML's honest failures are themselves part of
what needs testing:

| Area | Unity (expected) | ASML (expected) |
|---|---|---|
| Business Trajectory | Computed live from the same US-GAAP SEC EDGAR pipeline used today (not the hand-seeded fixture) — a real `IMPROVING`/`DETERIORATING`/`MIXED` read. | Honest "Not available" — the same `INSUFFICIENT_DATA` root cause already confirmed live in H.6, now surfaced through the new tri-state read instead of the old composite score. |
| Valuation Context | Real ratio computed once shares-outstanding is added; Unity's thin/negative operating income at points in its history is the concrete test case for whether the P/E-vs-EV/Revenue methodology decision (§7) is correctly handled. | Honest "Not available" — same root cause as Fundamentals; a good test that the shared-dependency failure (§3) propagates correctly rather than silently defaulting to a placeholder. |
| Recent Material Changes | Should detect at least one real period-over-period delta, since Unity has multiple live-scored periods. | No fundamentals-based change to report (same root cause); this is the concrete case for the open decision on whether Momentum-derived changes should fill the gap (§7) — without that, ASML shows nothing here, which is honest but worth deciding on deliberately, not by default. |

---

## 5. What stays untouched

- **Portfolio Fit** — no changes of any kind; already complete
  (`minimum-research-model.md` §2.4).
- **Momentum's evidence** — six components, weights, live orchestration,
  `SCORED`/`INSUFFICIENT_DATA` shape: unchanged. The only touch point is
  the plumbing note in §3.
- **The decision engine, stance logic, and Action Zones** — none of the
  three Phase I areas is consumed as an input to
  `src/domain/engine.ts` or any stance/trigger logic. They are evidence
  a user reads, not a signal the Playbook computes with.
- **Thesis Health's pass-through and `ThesisTrajectory` mapping** —
  already correct and already generic (works for every stock, not just
  Unity); not reopened here. Recent Material Changes may reference this
  as read-only context (§7) but does not modify how it's computed.
- **`ThesisCard`/`WhatChangesMyView`/`ResearchPreview`** — remain
  Unity-only, gated exactly as they are today. Phase I does not attempt
  to generalize them; Recent Material Changes is a different, smaller
  capability, not a generic replacement for these.

---

## 6. Genuinely new work required

Grouped by area, roughly in dependency order:

**Business Trajectory**
- A small, pure derivation function: two existing `FundamentalsComponentScore`
  values → a tri-state `IMPROVING`/`DETERIORATING`/`MIXED`/`MISSING` read.
- A new, thinner UI treatment distinct from (or replacing part of) the
  existing Fundamentals row — open decision, §7.

**Valuation Context**
- A shares-outstanding (or market-cap) data source and mapper — real new
  data acquisition, likely from SEC EDGAR's `dei:EntityCommonStockSharesOutstanding`
  tag or an equivalent, following the same honest-`MISSING` pattern as
  every other fundamentals field.
- A mechanism to obtain and retain historical daily prices usable for an
  "own history" comparison window (extend Twelve Data orchestration to
  expose `rawMarketData.ohlcv`, or fetch independently).
- A new deterministic scoring module, structurally similar to
  `fundamentals-score.ts` but scoped to one ratio
  (`SCORED`/`INSUFFICIENT_DATA`, honest `null` on failure).
- A new UI component for the ratio + historical-range visualization.
- Resolution of the ratio-methodology decision (§7) before any of the
  above can be built correctly.

**Recent Material Changes**
- A small deterministic period-over-period diff function over existing
  multi-period fundamentals data.
- A new AI generator (new prompt, new input/output shape) following
  `evidence-brief.ts`'s existing pattern, plus extending
  `EvidenceFieldRef`/validation to cover the new delta evidence.
- A new, explicitly stateless UI card — no persistence, no "seen" state,
  no history log (the guardrail against Thesis Lifecycle/Investment
  Memory scope creep, stated once here and worth re-checking at review
  time).

---

## 7. Product/model decisions this document surfaces, not resolves

1. **Does Business Trajectory replace the existing Fundamentals 1–10
   score/row on the Signal Overview, sit alongside it as a second card,
   or become the primary framing with the fuller composite demoted to
   an expandable detail?** Showing both a tri-state trajectory *and* a
   1–10 "7/10 Positive" score computed from overlapping data risks
   looking redundant or contradictory to a beginner if not deliberately
   designed.
2. **Which valuation ratio, and by what rule?** P/E when a company is
   consistently profitable, EV/Revenue otherwise? Always EV/Revenue for
   universality and simplicity? And how wide should the "own history"
   comparison window be (e.g., trailing 3 years of quarterly points)?
   This is a real methodology call, not an implementation detail —
   picking the wrong ratio for a company's profile could produce a
   numerically valid "cheap/expensive" read that's conceptually
   misleading.
3. **Is shares-outstanding acquisition genuinely in scope for Phase I's
   "minimum," or does it push Valuation Context toward a later phase**
   on its own, separate timeline from Business Trajectory and Recent
   Material Changes (both of which need no new data source at all)?
4. **Is it acceptable that Business Trajectory and Valuation Context
   will both honestly read "Not available" for any non-US-GAAP filer
   (ASML-like) in Phase I** — i.e., Phase I's real, live-for-every-stock
   coverage is two-of-three areas narrower than the pitch for exactly
   the population Fundamentals already fails for — or does closing even
   part of that gap become a Phase I prerequisite rather than a later,
   separately-scoped problem (per `minimum-research-model.md` §5/§7's
   own open question #3)?
5. **Should Recent Material Changes include Momentum-derived deltas**
   (e.g., a relative-strength or trend-structure flip) alongside
   fundamentals-based ones, given fundamentals-based deltas will be
   unavailable for exactly the stocks that also lack Business
   Trajectory/Valuation Context — Momentum is the one channel
   confirmed live for every stock, ASML included?
6. **Should the user's own onboarding `ThesisTrajectory` answer be
   re-surfaced as read-only context inside Recent Material Changes**
   ("you said your reasons were getting weaker") — a light reuse of
   data that already exists and already survives to the confirmed
   config — or kept out entirely to avoid any conceptual overlap with
   the explicitly-excluded Thesis Lifecycle?
7. **UI placement** — do these three areas replace part of today's
   Signal Overview, add as a new section above/below it, or something
   else? Getting this wrong is the concrete way this phase drifts
   toward the explicitly forbidden "large research dashboard."

---

## 8. Summary table

| Area | Minimum data | New data needed | Deterministic | AI role | Missing state | Reuse |
|---|---|---|---|---|---|---|
| Business Trajectory | `growthTrend` + `marginTrend` direction | None | Fully | One-sentence gloss | "Not available" (shared with ASML's Fundamentals gap) | Fundamentals contract, scoring engine, SEC EDGAR pipeline, missing-state pattern |
| Valuation Context | One ratio vs. own-history range | Shares outstanding/market cap; historical price series | Fully, once inputs exist | Explain the ratio/percentile, never compute it | "Not available" (shared root cause with Fundamentals) | Revenue/debt/cash fields, live price quote, existing `null`→"Not available" UI slot |
| Recent Material Changes | Period-over-period delta in existing components | None | Detection is fully deterministic | 1-2 sentence plain-language digest, grounded | "Not enough history yet" / silent if no fundamentals-based deltas exist | Multi-period fundamentals data, H.5's entire grounding/validation/fail-soft infrastructure |

---

## 9. Phase I.1 — Data Foundation (implemented)

Status: **implemented, tested, merged into the live pipeline** (not a
design document — this section records what was built and verified).
Scope: exactly the shared currency/shares-outstanding data foundation
needed by Business Trajectory and Valuation Context for Unity + ASML —
no EV/Revenue calculation, no historical percentile, no UI, per the
explicit boundaries set when this work was commissioned.

### 9.1 Product decisions resolved (inputs to this phase, not re-litigated)

- **EV/Revenue is the single Phase I valuation ratio** (§7 open question
  #2, now resolved) — not P/E.
- **Twelve Data's `/statistics` endpoint is skipped entirely** (§7 open
  question #3, resolved: no) — confirmed during the preceding feasibility
  spike to require a paid plan upgrade and to be current-snapshot-only
  regardless; the free-tier, compute-it-ourselves approach covers both
  current and historical needs with data already reachable from the
  existing pipeline.
- **No general IFRS support is claimed.** What was built generalizes the
  SEC EDGAR unit filter to "whichever reporting currency the caller
  declares for this instrument," not "any IFRS taxonomy." See §9.3 for
  exactly how far that gets ASML.
- **Unsupported filers honestly return MISSING/"Not available."** No
  exception was added anywhere to force a result for a filer this
  pipeline can't genuinely resolve.
- **Universal stock coverage is explicitly not an MVP requirement.**
  Confirmed still true after implementation — see §9.3's residual gap.

### 9.2 What was built

1. **Reporting-currency-aware unit resolution.**
   `src/infrastructure/market-data/sec-edgar/mappers.ts`'s
   `resolveUsdUnits` (hardcoded to `.units?.USD`) is now
   `resolveUnitFacts(facts, candidates, unitKey)`, called with the
   caller's `reportingCurrency` for every currency-denominated field
   (revenue, operating income, operating cash flow, capex, cash, debt).
   `mapEdgarCompanyFacts(payload, checkedAt, reportingCurrency = "USD")`
   validates the currency structurally (reusing
   `isValidCurrency` from `src/domain/market-data/validation.ts`) and
   throws `SecEdgarMappingError` — the existing whole-payload-failure
   path, already caught upstream — for a malformed one.
2. **Threaded through the pipeline, not hardcoded per ticker.**
   `fetchLiveFundamentalsResult(stockSymbol, checkedAt, reportingCurrency
   = "USD")` passes the parameter straight to the mapper.
   `src/app/stocks/[ticker]/page.tsx` supplies
   `seedHolding?.instrument.nativeCurrency ?? "USD"` — the currency comes
   from the instrument's own already-modeled `nativeCurrency`
   (`src/types/portfolio.ts`), never from a ticker string comparison. A
   ticker with no seed holding yet (mid-onboarding) defaults to USD, the
   same uniform default every existing caller already had.
3. **Shares outstanding, read from the existing payload.**
   `RawFundamentalsData` gained `sharesOutstanding: DataField<number>` —
   the single latest-known fact from SEC's `dei:EntityCommonStockSharesOutstanding`
   (mandatory for every XBRL filer, not currency-denominated).
   Deliberately a single top-level field, not joined per-period: that
   fact's "as of" date is the filing's cover-page date, not a fiscal
   period end, so forcing an exact-date join onto `periods` would either
   silently drop real data or misrepresent its precision. Building a
   real historical shares-outstanding series aligned to fiscal periods is
   left to the future Valuation Context work this phase does not
   implement.
4. **A hard currency-integrity boundary**, for that future work to use
   (not yet called from anywhere, since nothing yet computes a ratio):
   `src/domain/market-data/currency-integrity.ts`'s
   `resolveCurrencyIntegrity(valueCurrency, targetCurrency, fx?)` →
   `SAME_CURRENCY` / `CONVERTED` (only for the exact declared pair, with
   an `AVAILABLE` rate) / `MISSING` otherwise. A future valuation
   calculation must call this before combining any two
   currency-denominated figures — never combine them directly.
5. **Tests**: `mappers.test.ts` gained currency-awareness tests (EUR
   resolves when asked, USD facts are invisible when EUR is requested and
   vice versa, a dual-currency fixture proves no silent mixing, an
   invalid currency code throws), shares-outstanding tests (dei-namespace
   read, latest-by-date selection, honest MISSING when absent),
   `orchestration.test.ts` gained an end-to-end EUR-threading test
   reaching a genuine `SCORED` result, and `currency-integrity.test.ts`
   covers the full same/converted/missing matrix. The full suite (56
   files, 702 tests, including the existing Unity baseline/validation
   tests) passes unchanged.

### 9.3 Verified data-contract findings (new — discovered during this
implementation pass, not assumed at the feasibility-spike stage)

**Finding A — ASML's "Not available" was never an IFRS/taxonomy gap.**
Confirmed directly against SEC's raw XBRL API (not summarized): ASML
(CIK 0000937966) tags the exact `us-gaap`-namespaced concept names
already in this mapper's own candidate lists — revenue, operating
income, net income, operating cash flow, capex, cash, long-term debt —
with 20-50+ annual data points each, back to 2007-2009. Every one is
denominated in EUR. The old hardcoded `.units?.USD` filter discarded all
of it regardless of tag match. The fix in §9.2 item 1 is the actual, real
resolution to this — not a workaround.

**Finding B — the currency fix alone does not unlock ASML.** A second,
distinct, previously-unknown root cause was found while building the
first: **every single ASML fact — us-gaap and dei alike — carries
`fp: "FY"`**, confirmed by pulling ASML's full fact history, because
ASML (a 20-F filer with no 10-Q equivalent) has no quarterly-cadence SEC
filings at all. `parsing.ts`'s `extractDurationFacts`/`extractInstantFacts`
both reject `fp: "FY"` facts outright by design — a rule written to
disambiguate a *quarterly* filer's own comparative-figure duplicates,
which incidentally also rejects 100% of an *annual-only* filer's genuine
data. This is now a permanent regression test
(`mappers.test.ts`'s "ASML-shaped fixture" block) using ASML's real
figures, asserting exactly this: `reportingCurrency` threads through
correctly, but `periods` stays empty and `sharesOutstanding` stays
`MISSING`, for this reason alone. **Practical consequence: ASML's live
Business Trajectory will still read "Not available" today** — correctly
and honestly, per the resolved product decisions in §9.1, but for a
different reason than originally investigated. Closing this (some form
of annual-period support) is genuinely new, separately-scoped work — not
attempted here, and not a currency problem.

**Finding C — Twelve Data resolves bare "ASML" to its NASDAQ/USD
listing, not the Euronext Amsterdam/EUR listing the portfolio model
declares** (`holdings-seed.ts`: `exchange: "AMS"`, `nativeCurrency:
"EUR"`). Confirmed live: `/quote?symbol=ASML` and `/symbol_search`
both return the NASDAQ (`XNGS`, USD) listing by default; the correct
Euronext (`XAMS`, EUR) listing exists in Twelve Data's own symbol
database but fetching it via `mic_code` disambiguation returned "This
symbol is available starting with the Grow or Venture plan" — a real,
newly-discovered paid-plan gate on the current free/Basic tier. This has
been harmless for Momentum specifically (RSI/DMA-structure/trend/
relative-strength are all scale-invariant ratios or relative returns —
the currency label doesn't change the computed score), which is exactly
why it was never visible before. It will **not** be harmless once
Valuation Context exists: ASML's price (USD, the only fetchable listing
on the current plan) and its fundamentals (EUR, once Finding B is
resolved) are genuinely different currencies. `/exchange_rate?symbol=USD/EUR`
was confirmed live and working on the current free plan, so the
`CONVERTED` path of §9.2 item 4's boundary is a real, available option —
not `MISSING` by default — once a future Valuation Context module
actually calls it.

### 9.4 Residual limitations (honest, not urgent)

- ASML's Business Trajectory and Valuation Context remain "Not available"
  today, for Finding B above — a known, understood, tested gap, not a
  silent one.
- The reporting-currency generalization covers "filers who tag
  `us-gaap`-labeled concepts in their own currency" (confirmed true for
  ASML) — not a guarantee for every foreign issuer; a strict
  `ifrs-full`-only filer would still be honestly `MISSING`.
- Debt-tag coverage remains partial for some filers (e.g. ASML's
  `DebtCurrent` 404s; `LongTermDebtNoncurrent` resolves) — already
  handled honestly by the pre-existing "sum of whichever resolves, never
  fabricate the other half" rule (§3.6 total debt logic, unchanged).

### 9.5 What Phase I.2 (or later) would need to decide

1. **Annual-period support** (Finding B) — does `RawFundamentalsData`
   fall back to `periodType: "ANNUAL"` when no quarterly-cadence facts
   exist but `fp: "FY"` facts do? How do `growthTrend`/`marginTrend`
   (currently windowed for quarterly cadence) behave over annual
   periods? This is a real design decision, not a mechanical fix — not
   attempted in this phase.
2. **ASML's price listing** (Finding C) — accept the current-plan default
   (NASDAQ/USD) and always FX-normalize against EUR fundamentals via the
   `CONVERTED` path, or pursue a currency-matched listing (which the
   evidence above shows requires a paid Twelve Data plan upgrade for at
   least this instrument)? This is a cost/product decision, not
   something this phase should default on its own.

---

## 10. Phase I.2 — Annual Cadence Support (implemented)

Status: **implemented, tested, merged into the live pipeline**. Closes
§9.5 item 1 (Finding B): the currency fix in §9 was necessary but not
sufficient to unlock ASML's live Fundamentals — every ASML fact (us-gaap
and dei alike) carries `fp: "FY"`, rejected outright by the quarterly-only
period-extraction rules. §9.5 item 2 (Finding C, ASML's Twelve Data price
listing) remains open — untouched by this phase, which is fundamentals-
only.

### 10.1 Product decision resolved

**Make the affected calculations genuinely cadence-aware; do not gate
valid annual evidence to MISSING simply because it is annual.** This was
the one real fork §9.5 item 1 surfaced (a smaller, more defensive
alternative — permanently withholding `revenueGrowth`/`growthTrend`/
`balanceSheet` under annual cadence — was considered and explicitly not
taken, since it would only partially achieve "let Business Trajectory
eventually work from honest annual data").

### 10.2 What was built

1. **Cadence selection, at the mapper's period-construction layer**
   (`src/infrastructure/market-data/sec-edgar/mappers.ts`). Quarterly
   extraction (today's exact, unchanged E.7B/E.7D logic, now named
   `resolveQuarterlyFields`) is tried first; only if it yields zero
   periods does a new `resolveAnnualFields` run, using genuine FY-tier
   duration facts directly (`extractFiscalYearCumulativeFacts`, already
   existed — previously used only as a Q4-derivation input, now also used
   directly) and instant facts requiring `fp: "FY"` (a new, symmetric
   `extractAnnualInstantFacts` in `parsing.ts`, mirroring
   `extractInstantFacts` exactly but with the FY condition flipped). No
   cumulative-YTD derivation is used in annual mode — an annual fact
   already covers its whole period, so there is nothing to derive it
   from; synthesizing one would mean fabricating a quarter that was never
   reported, which this phase does not do. `RawFundamentalsData.periodType`
   — the field that already existed for exactly this (§9.1's own finding)
   — is now genuinely set, never hardcoded. Quarterly and annual periods
   are never combined: whichever cadence's extraction produced periods
   is the only one used; the other's facts are simply unread. A filer
   with a few stray quarterly facts alongside otherwise-annual data would
   still stay QUARTERLY — a known, accepted limitation, not solved by a
   partial-filer heuristic (none was added, per the resolved scope).
2. **A previously-unnoticed third quarterly-specific rule, fixed
   alongside the two named in §9.5**: the period-identity ("representative
   fact") loop required `parseFiscalQuarter(fp) !== null` to accept any
   candidate — and `parseFiscalQuarter("FY")` is `null`. This would have
   silently rejected every annual period even after the two parsing.ts
   fixes. A new `isAcceptableFiscalPeriod(fp, cadence)` replaces that
   check, branching on cadence; annual periods get `fiscalQuarter:
   undefined` and a `"${fiscalYear}-FY"` periodId instead of a quarter
   number.
3. **Cadence-aware calculations**
   (`src/domain/signals/fundamentals.ts`): `computeRevenueGrowth` and
   `computeTrailingTwelveMonthRevenue` (and, through it,
   `computeNetCashToRevenue`, and through `computeRevenueGrowth`,
   `computeGrowthTrend`) take an optional `periodType` parameter,
   defaulting to `"QUARTERLY"` — preserving every existing caller's exact
   behavior. `periodsPerYear`: 4 for quarterly (unchanged), 1 for annual
   (each period already spans a full year). Trailing-twelve-month
   revenue under annual cadence is the single most recent period's own
   revenue directly, never a sum of multiple annual periods (that would
   be several years, not twelve months) — no TTM estimation from partial
   annual data. `computeOperatingMargin`/`computeFreeCashFlow`/
   `computeMarginTrend`/`computeFcfMargin` take **no** `periodType` —
   confirmed cadence-agnostic (each looks only at the single most recent
   period; "this period vs. the previous reported period" is equally
   meaningful whichever cadence that period represents) and left
   unchanged.
4. **`growth-software.ts`** threads `raw.periodType` through at exactly
   the three call sites that need it (`revenueGrowth`, `growthTrend`,
   `balanceSheet`); the other four component definitions are unchanged.
5. **Tests**: a permanent regression fixture using ASML's real multi-year
   figures now asserts the FIXED behavior (two genuine `ANNUAL` periods,
   correct values, correct `periodId`s, `fiscalQuarter: undefined`) where
   it previously documented the gap; a quarterly-preferred/never-mixed
   test (genuine quarterly facts alongside a stray FY fact stay
   QUARTERLY-only); the pre-existing zero-data default is confirmed
   unchanged; cadence-aware unit tests for all four functions at both the
   `fundamentals.ts` and `growth-software.ts` template layers, including
   an explicit "this used to silently compute a different, wrong number"
   contrast case for `computeRevenueGrowth`; and one full end-to-end test
   (`orchestration.test.ts`) taking a realistic 4-year, EUR,
   `fp:"FY"`-only ASML-shaped fixture through the real
   client→ticker-resolution→mapper→scorer pipeline to a genuine `SCORED`
   result — and confirming the identical fixture stays
   `INSUFFICIENT_DATA` under the USD default, proving the annual-cadence
   fix doesn't bypass the currency-integrity fix. Full suite: **56 files,
   726 tests, all passing**, Unity baseline unchanged.

### 10.3 What remains out of scope (unchanged from §6's original boundary)

Mixed-cadence reconciliation, synthetic/interpolated quarters, TTM
estimation from annual data, IFRS taxonomy expansion, company archetypes,
Business Trajectory UI, Valuation, and Recent Material Changes — none of
these were touched. §9.5 item 2 (ASML's Twelve Data price listing,
Finding C) is also still open; this phase is fundamentals-only.

### 10.4 Residual limitations (honest, not urgent)

- A filer with a handful of stray quarterly facts alongside otherwise-
  annual data would stay QUARTERLY (losing the annual data) under the
  "zero quarterly periods" threshold — real, not solved, not hit by
  either reference stock.
- `RawFundamentalsData.sharesOutstanding` (§9) now correctly resolves for
  ASML under annual cadence (its own `extractAnnualInstantFacts` fix,
  same root cause) — confirmed by the same end-to-end test.
- Business Trajectory itself (the actual beginner-facing feature this
  work exists to support) is still not built — this phase is data
  foundation only, per its own explicit scope.

---

## 11. Phase I.3 — Business Trajectory (implemented)

Status: **implemented, tested, merged, live-validated in the running app
for both Unity and ASML.**

### 11.1 Final mapping — existing evidence → displayed trajectory state

No new evidence, no new score, no new weights. `src/domain/signals/
business-trajectory.ts`'s `deriveBusinessTrajectory` reads the exact
`growthTrend`/`marginTrend` `FundamentalsComponentResult`s
`scoreFundamentals` already computes (Phase I.2's cadence-aware
versions — this file has no cadence logic of its own) and maps each
independently:

| Component | Beginner line | `rawValue` sign | Displayed state |
|---|---|---|---|
| `growthTrend` | Revenue | `> 0` | IMPROVING → "Revenue growth is accelerating" |
| `growthTrend` | Revenue | `< 0` | DETERIORATING → "Revenue growth is slowing" |
| `growthTrend` | Revenue | `= 0` | STABLE → "Revenue growth is steady" |
| `growthTrend` | Revenue | component MISSING/NOT_APPLICABLE/absent | MISSING → "Not available" |
| `marginTrend` | Profitability | `> 0` | IMPROVING → "Profitability is improving" |
| `marginTrend` | Profitability | `< 0` | DETERIORATING → "Profitability is weakening" |
| `marginTrend` | Profitability | `= 0` | STABLE → "Profitability is steady" |
| `marginTrend` | Profitability | component MISSING/NOT_APPLICABLE/absent | MISSING → "Not available" |

The two lines are read independently and never combined — no aggregate
IMPROVING/MIXED/DETERIORATING verdict exists anywhere in this code, per
the resolved product decision. `deriveBusinessTrajectory` reads
`FundamentalsScoreResult.components` directly, which is present on
**both** the `SCORED` and `INSUFFICIENT_DATA` branches — so Business
Trajectory can show real evidence even when the fuller 7-component
composite didn't reach `SCORED` (e.g. Guidance's permanent `MISSING`
alone can sink overall coverage without touching growthTrend/
marginTrend's own availability).

### 11.2 UI integration decision

**Business Trajectory is a new, separate card (`BusinessTrajectoryCard.tsx`)
rendered immediately above `SignalScorecard`** in `PlaybookClientShell.tsx`
— the first evidence a user reads, in plain-language direction, no bars,
no 1-10 number. The existing Fundamentals row inside `SignalScorecard`
is **not restructured or hidden** — restructuring it was more change than
"smallest integration" called for, and it remains genuinely useful detail
(the full 7-dimension breakdown, still reachable by expanding the row).
Instead, a small caption — "Full composite score" — was added under the
Fundamentals label (reusing the exact existing sub-label pattern already
used for "Model fit: X"), so the row reads as the fuller detail behind
Business Trajectory's simple read, not a second, competing
interpretation of the same evidence. This is the smallest change that
resolves the "two overlapping interpretations" risk: position (Business
Trajectory first) plus one caption, not a redesign of `SignalScorecard`.

### 11.3 Unity + ASML results (live-validated in the running app)

| | Unity | ASML |
|---|---|---|
| Revenue | "Revenue growth is accelerating" (IMPROVING; live `growthTrend` rawValue ≈ +0.071) | "Not available" |
| Profitability | "Profitability is improving" (IMPROVING; live `marginTrend` rawValue ≈ +0.632) | "Not available" |
| Fundamentals row | 7/10 Positive, "Full composite score" caption | "Not available" (unchanged) |

Unity's result is real, live SEC EDGAR data, confirmed by loading
`/stocks/U` in a running dev server. ASML's "Not available" is
honest and expected — see §12, a distinct pre-existing gap this phase's
own live validation surfaced and partially fixed (Unity), not a defect
in Business Trajectory's own logic (§12.3 confirms this).

### 11.4 Tests

`src/domain/signals/business-trajectory.test.ts` (14 tests): IMPROVING/
DETERIORATING/STABLE for each line from `rawValue`'s sign; MISSING (never
STABLE) when a component is `MISSING`, `NOT_APPLICABLE`, or absent
entirely; the two lines varying independently in the same result (one
`AVAILABLE` + one `MISSING`; one improving + one deteriorating at once —
no forced pairing, no folded-together verdict); reading components from
both `SCORED` and `INSUFFICIENT_DATA` results; both lines `MISSING` when
the whole `FundamentalsScoreResult` is `undefined`; and cadence-agnostic
behavior (identical handling of a value shaped like Phase I.2's ANNUAL
output vs. QUARTERLY). Full suite: **57 files, 740 tests, all passing.**

### 11.5 What was not touched (per this phase's explicit boundary)

Valuation Context, Recent Material Changes, any AI explanation layer, a
new research dashboard, the decision engine, and Momentum/Portfolio Fit
— none of these were changed. `runDecisionEngine`'s inputs/outputs are
unchanged; `deriveBusinessTrajectory` is called only from the client
shell, downstream of the engine, over its already-computed
`fundamentalsResult` — the engine itself has no Business Trajectory
awareness of any kind.

---

## 12. A Phase I.1 regression, found and fixed by Phase I.3's live validation

This section exists because it is a genuine, real defect that shipped
silently — not a design decision. It is deliberately not folded into §9's
own record; §9 remains an accurate account of what Phase I.1 believed at
the time, and this section corrects it going forward.

### 12.1 What was wrong

Phase I.1 (§9.2 item 2) wired `src/app/stocks/[ticker]/page.tsx` to pass
`seedHolding?.instrument.nativeCurrency` as `fetchLiveFundamentalsResult`'s
`reportingCurrency` argument, reasoning that this was "the instrument's
own known reporting currency... never a ticker-specific branch." That
reasoning conflated two genuinely different things: `InstrumentIdentity
.nativeCurrency` (`src/types/portfolio.ts`) is the **portfolio's own
cost-basis/tracking currency** — the currency the user's holding record
is denominated in — not the **company's SEC reporting currency**. Unity
proves these are not the same thing: `holdings-seed.ts` tracks Unity's
holding in EUR (a European user's cost-basis record for a US stock
bought through a EUR-settling broker), while Unity itself reports to the
SEC in USD. Passing `"EUR"` into a USD-denominated filer's fetch meant
every currency-denominated field silently resolved to nothing —
**Unity's live Fundamentals, and by extension the entire pre-existing
7-dimension Signal Overview row, had been silently broken since Phase
I.1 shipped**, invisible to every automated test in I.1/I.2 (all of
which supplied their own explicit, correct currency directly to the
functions under test, never exercising the real page.tsx wiring against
real data end to end).

### 12.2 How it was found

Phase I.3 was the first of these phases to touch UI, which is what
triggered an actual live-browser validation pass (this repository's own
guidance: UI changes should be exercised in a running app, not verified
by unit tests alone) — Business Trajectory rendered "Not available" for
Unity, which a cross-check against a direct, standalone invocation of
the identical `fetchLiveFundamentalsResult` function (outside the
Next.js request, defaulting to `"USD"`) immediately contradicted: real
`SCORED` data, `growthTrend`/`marginTrend` both present and positive. The
only difference between the two calls was the `reportingCurrency`
argument.

### 12.3 The fix (this phase)

`page.tsx` no longer derives `reportingCurrency` from `instrument
.nativeCurrency` — it calls `fetchLiveFundamentalsResult(ticker,
checkedAt)` and relies on its existing `"USD"` default, applied
uniformly to every ticker (not a ticker-specific branch). This restores
Unity's live Fundamentals (and therefore Business Trajectory) to
correct, real, `SCORED` behavior — confirmed live in the running app
(§11.3). It is a **known, honest regression for ASML specifically**:
ASML's real SEC reporting currency is EUR, so its Fundamentals-derived
evidence (Business Trajectory and the Signal Overview row alike) now
correctly, honestly reads "Not available" again, for a different reason
than §9/§10 solved (currency-source, not currency-support or
annual-cadence — both of those fixes remain correct and are unaffected).

### 12.4 PRODUCT/MODEL decision this leaves open

**There is currently no reliable per-company source of "which currency
does this filer report its financials in" anywhere in this codebase** —
`nativeCurrency` is the wrong field (§12.1), and no other field
represents this today. Candidate directions, none implemented, none
decided:
- Default to `"USD"` for everyone (today's restored state) and treat
  every non-USD-reporting filer as an explicitly later, separate
  capability — consistent with "universal stock coverage is not an MVP
  requirement" (§9.1's own resolved decision), just narrower than ASML
  specifically working end-to-end.
- Have the mapper try a small, fixed, ticker-agnostic list of candidate
  currencies (e.g. USD, then EUR, then GBP) in order, using whichever
  actually resolves real data — genuinely deterministic and non-ticker-
  specific, but a real design change to the currency-resolution contract
  established in §9, not a trivial tweak, and not something this phase
  should decide unilaterally.
- Introduce a proper, explicit "SEC reporting currency" field, separate
  from portfolio `nativeCurrency`, sourced deliberately (not inferred
  from exchange or ticker) — the architecturally cleanest option, and
  the most work.
This is a genuine fork requiring your input before ASML's Fundamentals-
derived evidence can work end-to-end again; not resolved in this phase.

**Resolved in Phase I.3.1 (§13): the second option above** — a
ticker-agnostic, no-guessing currency-discovery pass, not a fixed
candidate list and not a new instrument-level field.

---

## 13. Phase I.3.1 — Reporting-Currency Discovery (implemented)

Status: **implemented, tested, merged, live-validated for both Unity and
ASML.** Closes §12's open decision. `docs/` prefix `phase-i` retained;
this is the architectural fix, not a new phase of scope.

### 13.1 What was wrong, restated precisely

`reportingCurrency` was a caller-supplied argument to `mapEdgarCompanyFacts`/
`fetchLiveFundamentalsResult`. Nothing in this codebase ever reliably knew
that value in advance — §12 found `Instrument.nativeCurrency` (portfolio
cost-basis currency) was the wrong source; there was no *right* source
to substitute it with, because a filer's SEC reporting currency isn't
knowable from anywhere else the codebase already models.

### 13.2 The model implemented

**The mapper discovers its own reporting currency, per cadence, from the
same target financial concepts it already reads for values** — never a
caller input, never a fixed USD/EUR/GBP guess order, never the whole
companyfacts payload.

`discoverReportingCurrency(usGaap, cadence)`
(`src/infrastructure/market-data/sec-edgar/mappers.ts`): for each of the
seven target fields (revenue, operatingIncome, operatingCashFlow, capex,
cash, debtShort, debtLong — the exact fields `resolveQuarterlyFields`/
`resolveAnnualFields` already read) and each of their candidate tags,
inspects every currency-shaped unit key (`isValidCurrency`, ISO
4217-style) present on that tag. A currency counts as evidence only if
it has at least one fact usable for that field's own cadence-appropriate
shape (`hasCadenceUsableFacts` — duration vs. instant, plus the 6/9-month/
FY cumulative tiers for the two cash-flow fields, mirroring
`resolveCashFlowFieldByEnd`'s own derivation inputs exactly). The
distinct currencies found across every target field are collected into
one set:
- size 1 → that is the payload's reporting currency for this cadence.
- size 0 → nothing to derive from → `undefined`.
- size >1 → the payload disagrees with itself (within one field carrying
  two currencies, or across two different fields) → `undefined` — never
  resolved by order, majority, or which field happened to be checked
  first.

`mapEdgarCompanyFacts` runs this once for the quarterly attempt; only if
that yields zero periods does it run again for the annual attempt
(Phase I.2's existing cadence fallback, unchanged) — each attempt's own
discovered currency feeds `resolveQuarterlyFields`/`resolveAnnualFields`
exactly as a caller-supplied one used to. `RawFundamentalsData
.reportingCurrency` is now `string | undefined` (was `string`) — `undefined`
represents "could not be established," never silently defaulted to
`"USD"`.

`fetchLiveFundamentalsResult` and `mapEdgarCompanyFacts` no longer accept
a currency argument at all; `page.tsx`'s call site needs nothing
currency-related. `Instrument`/`nativeCurrency` (`src/types/portfolio.ts`)
is completely untouched — the portfolio cost-basis concept it represents
was never the problem; conflating it with reporting currency was.

### 13.3 Why scanning is scoped to target concepts only, not the whole payload

Verified against ASML's real, live companyfacts payload (CIK 0000937966):
a full scan of every `us-gaap` concept found **three** distinct
currency-shaped unit keys — EUR (549 concepts, the real financials), JPY
(`NotionalAmountOfForeignCurrencyDerivatives`), and USD
(`NotionalAmountOfForeignCurrencyDerivatives`,
`PurchaseCommitmentRemainingMinimumAmountCommitted`,
`UnrecognizedTaxBenefitsReductionsResultingFromLapseOfApplicableStatuteOfLimitations`)
— disclosure-only items in whatever currency their underlying contract
uses, unrelated to ASML's actual reporting currency. None of these three
concepts appear in any of the mapper's seven target tag lists. A
whole-payload scan would have wrongly flagged ASML as multi-currency/
ambiguous; the target-tag-scoped scan correctly finds exactly one
currency (EUR) for every field the mapper actually reads. This is why
"never infer from the whole companyfacts payload" is load-bearing, not
merely cautious — real ASML data would fail an unscoped version of this
rule.

### 13.4 No explicit currency field exists to use instead

Confirmed directly against live SEC APIs during the preceding spike:
`dei` namespace for Unity is `['EntityCommonStockSharesOutstanding',
'EntityPublicFloat']`; for ASML,
`['EntityCommonStockSharesOutstanding', 'EntityNumberOfEmployees',
'EntityPublicFloat']`. `submissions/CIK0000937966.json`'s filer-level
metadata (`fiscalYearEnd`, `stateOfIncorporation`, `category`,
`entityType`, addresses) has no currency field either. Discovery from the
target concepts' own units is the only reliable source that exists.

### 13.5 Tests added

`mappers.test.ts`: Unity-shaped USD discovery; ASML-shaped EUR discovery;
within-one-field ambiguity (a single concept carrying both USD and EUR
facts simultaneously) → `MISSING`; cross-field ambiguity (revenue USD,
operatingIncome EUR) → `MISSING`; a JPY-tagged, non-target concept
(`NotionalAmountOfForeignCurrencyDerivatives`, mirroring ASML's real
payload exactly) correctly ignored while EUR is still discovered from
the real target concepts; a currency present on a target concept but
with zero cadence-usable facts correctly not counted, falling through to
the annual attempt instead. The ASML-shaped fixture block no longer
takes any currency argument and asserts EUR is discovered, not supplied.
`orchestration.test.ts`: end-to-end `SCORED` results for both USD and
EUR fixtures through the real client→mapper→scorer pipeline, no currency
argument anywhere; the ASML-shaped end-to-end test now reaches `SCORED`
with zero currency input. Full suite: **57 files, 739 tests, all
passing.**

### 13.6 Unity + ASML, live-validated in the running app

| | Unity | ASML |
|---|---|---|
| Revenue | "Revenue growth is accelerating" | "Revenue growth is accelerating" |
| Profitability | "Profitability is improving" | "Profitability is improving" |
| Fundamentals row | 7/10 Positive, "Full composite score" | 8/10 Positive, "Full composite score", "Model fit: Unknown" |

**This is the first point in the whole Phase I effort where ASML shows
real, live Business Trajectory and Fundamentals evidence** — every prior
phase's ASML result was either "Not available" (I.1's currency gap, I.2's
cadence gap before the fix, I.3's currency-source regression) or required
a caller to already know EUR (I.1/I.2/I.3's own design). No changes were
needed to `BusinessTrajectoryCard`, `SignalScorecard`, or any other UI
code to make this work — confirming §11's evidence-derivation layer was
already correct; only its upstream data source needed fixing. §11's
Unity + ASML table is now stale in one respect (it recorded ASML as "Not
available," accurately at the time Phase I.3 shipped) — left as a
historical record rather than rewritten, per this document's established
practice of appending corrections rather than editing history.

### 13.7 Preserved future-valuation boundary (no valuation implemented)

`src/domain/market-data/currency-integrity.ts`'s `resolveCurrencyIntegrity`
is unchanged — its inputs (`fundamentals.reportingCurrency`,
`quote.currency`, an optional verified `FxRate`) are unaffected by this
phase; `reportingCurrency` is simply a more trustworthy value now.

### 13.8 What was not touched

Valuation Context, Recent Material Changes, AI, any new UI beyond the
comment/doc updates already described, the decision engine, and
Momentum/Portfolio Fit — none of these were changed in this phase.

---

## 14. Phase I.4 — FundamentalChangeEvidence (implemented)

Status: **implemented, tested, accepted as complete — no code changes
since.** Closes the model-definition spike that preceded it: "Recent
Material Changes" (§2.3's original name) is renamed to
`FundamentalChangeEvidence` once that spike found no honest, threshold-
free way to define general materiality — see §14.1.

### 14.1 Resolved model

No `FundamentalsScoreResult` dependency — `src/domain/signals/
fundamental-change-evidence.ts`'s `deriveFundamentalChangeEvidence`
reads `RawFundamentalsData.periods`/`periodType` directly, one layer
below where `deriveBusinessTrajectory` sits, reusing
`computeRevenueGrowth`/`computeOperatingMargin` (`fundamentals.ts`) at
two cutoffs (`periods` vs. `periods.slice(0, -1)`) rather than
duplicating any calculation. Two independent lines (revenue,
profitability). Status union: `AVAILABLE` (`before`/`after`/
`beforeSign`/`afterSign`/`reversed`/`asOf`), `INSUFFICIENT_HISTORY`
(after computable, before not — never called "newly available," since
that would require comparing against a previous fetch or persisted
state, neither of which exists), `MISSING` (current value itself not
computable). `reversed` is a strict sign comparison only
(`POSITIVE`<->`NEGATIVE`; a `ZERO` transition is never a reversal) — no
magnitude/materiality threshold anywhere, deliberately, since no
existing ruleset or spec defines one (`RULESET.fundamentals`'s anchor
curves calibrate a 0-100 score, not a significance boundary).

### 14.2 What was built

`src/domain/signals/fundamental-change-evidence.ts` + its test file — 22
tests covering both reversal directions, same-sign deterioration/
improvement, both zero-crossing directions (`POSITIVE`->`ZERO`,
`ZERO`->`NEGATIVE`), insufficient history, missing current evidence,
both cadences, and Unity-shaped/ASML-shaped realistic fixtures.

### 14.3 What was not touched

Business Trajectory, any UI, AI, the decision engine — this was domain-
layer only; `FundamentalChangeEvidence` had no consumer at all until §15.

---

## 15. Phase I.5 — Recent Changes Presentation (implemented)

Status: **implemented, tested, live-validated in the running app for
both Unity and ASML.**

### 15.1 The plumbing fix

`fetchLiveFundamentalsResult` (`src/infrastructure/market-data/sec-edgar/orchestration.ts`)
used to compute `mapEdgarCompanyFacts`'s `RawFundamentalsData` and then
discard everything except the scored result — nothing above that layer
could ever reach the raw `periods`/`periodType`
`FundamentalChangeEvidence` needs. It now returns a small
`FundamentalsFetchResult { scoreResult, periods, periodType }` from the
**same** fetch — never a second SEC EDGAR round trip. `scoreResult` is
exactly the same `FundamentalsScoreResult` every existing consumer
already expects; `page.tsx` unpacks it immediately
(`fundamentalsFetch?.scoreResult`) so `initialFundamentalsResult`'s type
and every downstream consumer (`runDecisionEngine`/`EngineInput`/
`EngineOutput`, `SignalScorecard`, `deriveBusinessTrajectory`) is
**completely unchanged** — `periods`/`periodType` are new, additive
props threaded separately (`page.tsx` -> `StockDetailClientShell` ->
`PlaybookClientShell`), consumed only by the new
`deriveFundamentalChangeEvidence` call. The decision engine's own types
were never touched.

### 15.2 Final presentation mapping

| Status | Rendering |
|---|---|
| `AVAILABLE`, not reversed | `{before} → {after}` (e.g. "+16.8% → +23.9%") — numbers only, no annotation |
| `AVAILABLE`, reversed | `{before} → {after}` plus a plain, unstyled line: "Direction changed from {positive/negative} to {positive/negative}" |
| `INSUFFICIENT_HISTORY` | "Insufficient history" (muted, italic) |
| `MISSING` | "Not available" (muted, italic) |

No color or icon varies by `reversed` — every `AVAILABLE` line (reversed
or not) uses the identical neutral icon (`ArrowRight`) and identical
neutral stone styling. `INSUFFICIENT_HISTORY` and `MISSING` are
rendered with distinct copy (never conflated with each other, never
rendered as "stable"/"no change") but identical, muted, non-alarming
styling to each other and to `AVAILABLE`.

### 15.3 UI integration decision

`RecentChangesCard` (`src/components/playbook/RecentChangesCard.tsx`)
is rendered directly below `BusinessTrajectoryCard`, above
`SignalScorecard` — grouping the two Fundamentals-derived "evidence"
cards together, in the order "current direction" then "what changed
most recently." It mirrors `BusinessTrajectoryCard`'s exact shell
(same card border/padding, same heading + one-line subtext pattern,
same `space-y-1` row list) so it reads as a natural sibling, not a new
research dashboard.

### 15.4 Unity + ASML, live-validated in the running app

| | Unity (QUARTERLY) | ASML (ANNUAL) |
|---|---|---|
| Revenue | "+16.8% → +23.9%" (no reversal) | "+2.6% → +15.6%" (no reversal) |
| Profitability | "−69.1% → −5.9%" (no reversal — still negative, improving toward breakeven) | "+31.9% → +34.6%" (no reversal) |

Both are real, live SEC EDGAR data (not fixtures), confirmed by loading
`/stocks/U` and `/stocks/ASML` in a running dev server. Neither
reference stock's current real data happens to include a sign reversal
— that state is real and fully implemented, just not currently observed
live for either stock; it is covered by `fundamental-change-evidence
.test.ts`'s 22 deterministic tests instead ("validate with real evidence
where available").

### 15.5 Tests

`orchestration.test.ts` gained a new describe block confirming
`fetchLiveFundamentalsResult` exposes `periods`/`periodType` alongside
`scoreResult` from a single fetch (`fetch` mock called exactly twice —
ticker list + companyfacts, never a third call) for both a Unity-shaped
`QUARTERLY` fixture and an ASML-shaped `ANNUAL` fixture. No changes were
needed to `fundamental-change-evidence.test.ts` (§14, already complete)
or to any engine-level test — `EngineInput`/`EngineOutput`'s
`FundamentalsScoreResult` type was never touched, so the full existing
suite (engine.test.ts's 37 tests, every `b5.*` validation test, and
`PlaybookClientShell.orchestration.test.ts`'s import-boundary check)
passing unchanged **is** the proof of no effect on engine output, not a
new bespoke test. Full suite: **58 files, 763 tests, all passing.**

### 15.6 What was not touched

`FundamentalChangeEvidence` itself (§14 — not redesigned, no correctness
defect found), Business Trajectory, the decision engine, Momentum,
Portfolio Fit, `ThesisTrajectory`, Valuation Context, any AI
interpretation, and no materiality/significance threshold was
introduced anywhere.

---

## 16. Phase I.4A — Valuation Data Foundation (implemented)

Status: **implemented, tested, live-validated for both reference
stocks.** Closes the four open product/model decisions the 0.30.0
feasibility spike (§0.30.0 entry, `CHANGELOG.md`) surfaced and left
unresolved. Scope: exactly the data plumbing + pure deterministic
derivation needed to produce historically correct EV/Revenue
observations, per this phase's own explicit boundary — no
above/within/below-history classification, no percentile/threshold, no
score, no peers/P-E/DCF/fair value, no interpolation, no AI, no final
Valuation Context UI.

### 16.1 Product/model decisions resolved (inputs to this phase)

- Missing debt remains MISSING; never infer zero debt (already the
  mapper's own §3.6/§9.1 rule — restated here as this formula's own
  required-evidence gate, not a new rule).
- Current + up to 5 completed fiscal-year checkpoints, anchored to
  periods already in `RawFundamentalsData.periods` — never a dense
  independent grid, never synthesized.
- Historical checkpoints use filing/knowledge date (`filingDate`), not
  `periodEndDate`.
- Historical price = latest trading-day price on or before that date —
  never a future bar, never interpolated.
- Historical shares outstanding join fundamentals by SEC accession
  number (`accn`) — the one non-arbitrary alignment key verified live
  for both Unity and ASML in the 0.30.0 spike.
- Historical FX fetched only when `priceCurrency !== reportingCurrency`,
  and always dated to the checkpoint — never today's rate applied
  retroactively.
- Missing required evidence drops that checkpoint entirely; no
  interpolation/backfill.
- Formula: `MarketCap = price * sharesOutstanding`; `EV =
  normalizedMarketCap + totalDebt - cash`; `EV/Revenue = EV /
  TTMRevenue` — normalizing only ever MarketCap (the one figure not
  already in `reportingCurrency`) via `resolveCurrencyIntegrity`, never
  combining currency-denominated figures directly.

### 16.2 What was built

1. **`RawFundamentalsPeriod.accn?: string`** and
   **`RawFundamentalsData.sharesOutstandingByAccession: Record<string,
   DataField<number>>`** (`src/types/fundamentals.ts`) — additive fields.
   `mapEdgarCompanyFacts` (`mappers.ts`) now carries the representative
   fact's own `accn` onto each period and keys every
   `dei:EntityCommonStockSharesOutstanding` fact by its own `accn`
   (`toAccessionMap`), alongside (not instead of) the existing
   latest-only `sharesOutstanding` field.
2. **`src/domain/signals/valuation-checkpoints.ts`** —
   `deriveEvRevenueCheckpoints`. Selects checkpoint periods, joins each
   one's shares by `accn`, selects the price/FX bar on or before
   `filingDate`, calls `resolveCurrencyIntegrity` before ever combining
   MarketCap with totalDebt/cash, and computes the formula above. Reuses
   `computeTrailingTwelveMonthRevenue` (`fundamentals.ts`) unchanged for
   both cadences. Any checkpoint missing required evidence is dropped
   from the returned array — no MISSING placeholder entry.
3. **`src/infrastructure/market-data/valuation-orchestration.ts`** —
   `fetchLiveEvRevenueCheckpoints`, composing the SEC EDGAR fetch
   (`FundamentalsFetchResult` extended with `reportingCurrency`/
   `sharesOutstandingByAccession`, same single fetch as Phase I.5) with
   Twelve Data's historical price `/time_series` and, only when needed, a
   historical FX `/time_series` request for the
   `priceCurrency/reportingCurrency` pair (never the current-only
   `/exchange_rate`, per the 0.30.0 spike's own finding). Never throws;
   **not wired into any page/UI** — the same "built, not yet called from
   anywhere" posture the Phase I.1 currency-integrity boundary had before
   this phase became its first real caller.
4. `scripts/validate-live-ev-revenue-checkpoints.ts` +
   `npm run validate:live-ev-revenue-checkpoints` — developer-only live
   validation, mirroring the existing E.7B/C.8B scripts.

### 16.3 A live-discovered finding: ASML's `fy` tag is per-filing, not per-fact

Live-verified against ASML's real SEC data (not assumed): its most
recent 20-F's own multi-year comparative income-statement disclosure
means every fact that filing reports — including the figures for fiscal
years it is merely restating as comparatives, not newly reporting —
carries **that filing's own** `fy` tag, not the tag of the year each
fact actually describes. Combined with the pre-existing, already-approved
E.7B "latest-filed wins" dedup rule (correct for restated VALUES), this
means several genuinely distinct periods (different `periodEndDate`) can
end up sharing one mislabeled `fiscalYear`/`periodId` — and, more
consequentially, sharing the SAME (latest) `accn`/`filingDate`, since
that identity metadata rides along with whichever fact wins the dedup.

Two separate consequences, both discovered only because Phase I.4A is
the first consumer to ever group or select periods **by** `fiscalYear`
or use `filingDate` as a real point-in-time key — no prior consumer
(Business Trajectory, `FundamentalChangeEvidence`, Recent Changes) does
either; they all use pure array-position windows, which stayed correct
throughout because `periods` itself has always been correctly deduped
and sorted by `periodEndDate` — only the `fiscalYear` LABEL was ever
wrong, silently, since Phase I.1.

1. **Sampling (fixed in this phase).** `selectCheckpointPeriods`
   deliberately selects/orders by the array's own already-guaranteed
   `periodEndDate`-ascending position, never by re-sorting on
   `period.fiscalYear`. This makes checkpoint sampling immune to the
   mislabeling: live-verified, ASML now yields exactly 6 checkpoints
   (current + 5 completed), one per genuinely distinct real fiscal year
   2020-2025 — no year silently dropped, none double-counted.
2. **Checkpoint date/price/shares (found here; CORRECTED SCOPE — see the
   note immediately below — and fixed in §16.7).** Originally reported
   here as affecting only "the two most-recently-superseded fiscal years
   (2023, 2024)." That undercounted it: a direct re-measurement (§16.7)
   of every fetched ASML period's `periodEndDate` → `filingDate` gap
   found the SAME ~2.1-year anachronism on **5 of the 6 selected
   checkpoints — every one except "current."** The two singled out here
   were simply the two that happened to visibly SHARE one identical
   (2026) date/price/shares triple in that live run; the other three
   (2020-2022) each individually inherited their OWN, separately wrong,
   ~2-years-later filing — less visually obvious (no shared duplicate to
   spot) but equally anachronistic. Restated accurately, with the actual
   fix, in §16.7.

> **Correction (Phase I.4A.1, §16.7):** the "2 of 6" scope above was
> wrong — re-measured and found to be 5 of 6. Fixed; see §16.7 for the
> root cause, the fix, and the corrected checkpoint dates. Left
> unedited above (rather than rewritten) so this document keeps an
> honest record of what was actually found at each point, not a
> retroactively-corrected first draft.

### 16.4 Live-validated for both reference stocks

`npm run validate:live-ev-revenue-checkpoints`, live SEC EDGAR + Twelve
Data data (not fixtures):

- **Unity: 0 checkpoints — every one dropped.** Confirmed root cause:
  Unity's live SEC data has never tagged any debt concept
  (`DebtCurrent`/`ShortTermBorrowings`/`LongTermDebtCurrent`/
  `LongTermDebtNoncurrent`/`LongTermDebt`, all absent) across all 25
  fetched periods — exactly the 0.30.0 spike's flagged fork, confirmed
  live, not a defect in this implementation.
- **ASML: 6 checkpoints**, one per real fiscal year 2020-2025, all
  `CONVERTED` (its Twelve Data USD listing normalized to its EUR
  reporting currency via a dated FX bar — confirming the 0.30.0 spike's
  Finding C path is real and reachable). See §16.3/§16.7 for the
  point-in-time accuracy finding and its fix — at the time of THIS run,
  5 of the 6 checkpoints' price/shares were anachronistic; §16.7 fixes
  that for all 6.

### 16.5 Tests

`mappers.test.ts` gained accession-number join-key tests (accn carried
onto a period, `sharesOutstandingByAccession` keyed correctly, an
end-to-end ASML-shaped join). `orchestration.test.ts` (sec-edgar) gained
tests for the two newly-exposed fields. `valuation-checkpoints.test.ts`
(23 tests) covers accession matching, fiscal-year sampling (including
the ASML mislabeled-`fy` regression described in §16.3), no-future-price
selection (including a market-holiday gap), conditional FX fetching,
missing historical FX, missing debt (Unity's real shape), and checkpoint
dropping. `valuation-orchestration.test.ts` (5 tests) covers conditional
FX fetching at the plumbing level and every failure mode. Full suite:
**60 files, 799 tests, all passing**, clean `tsc --noEmit`, clean lint.

### 16.6 What was not touched

Classification (above/within/below historical range), percentile/
threshold logic, a valuation score, peers/P-E/DCF/fair value,
interpolation, AI, and the final Valuation Context UI — all still
genuinely unimplemented, per this phase's own explicit boundary.

### 16.7 Phase I.4A.1 — Point-in-Time Filing Identity Fix (blocking bug, fixed)

Before any I.4B work, the user asked to see the actual ASML pipeline
output table (checkpoint dates, prices, shares, debt, cash, revenue, FX)
and separately asked for §16.3's finding to be re-measured for real
impact rather than taken as scoped. That re-measurement — computing
`periodEndDate` → `filingDate` gap for all 20 fetched ASML periods —
found every one showed the same ~2.1-year gap against the one period
(current) too new to have been swept up by a later comparative
disclosure yet (its own gap: 56 days, the genuine baseline). **5 of the
6 selected checkpoints, not 2, were using anachronistic price/shares.**
Confirmed a blocking point-in-time correctness bug in Phase I.4A, fixed
here.

**Root cause, one layer deeper than §16.3's own diagnosis.**
`RawFundamentalsPeriod.filingDate`/`accn` were drawn from
`buildPeriodsFromFields`'s `representative` fact
(`src/infrastructure/market-data/sec-edgar/mappers.ts`) — selected from
the SAME `end`-keyed map already used for that field's own reported
VALUE. That map is built by `toMapByEnd`, itself fed by
`extractDurationFacts`/`extractInstantFacts`/`extractAnnualInstantFacts`/
`extractFiscalYearCumulativeFacts` (`parsing.ts`), each of which already
calls `dedupeByLatestFiled` (§4.4) internally — collapsing every `end` to
its single latest-filed fact before `mappers.ts` ever sees more than one
candidate. "Latest wins" is the CORRECT rule for a field's reported
VALUE (a restated/most-recently-confirmed figure is the right number),
but reusing that same latest-filed fact for a period's IDENTITY means
identity silently drifts to whichever filing most recently repeated that
period as a multi-year comparative — confirmed directly against SEC
EDGAR (`RevenueFromContractWithCustomerExcludingAssessedTax`, CIK
0000937966, `end=2023-12-31`): three filings (2024-02-14 original,
2025-03-05 comparative, 2026-02-25 comparative) report the identical
value, and the pre-fix mapper kept the LAST one's identity — 787 days
after that period was actually first known.

**First fix attempt failed live validation, restated here so it isn't
repeated.** Adding an earliest-wins `toEarliestByEnd` inside
`mappers.ts`, fed from the OUTPUT of the existing `extractXFacts`
functions, changed nothing — a live re-run showed byte-identical
checkpoint dates to the pre-fix version. Those functions had already
discarded every fact but the latest-filed one per `end`, one layer
upstream in `parsing.ts`, before `toEarliestByEnd` could ever see an
earlier candidate. Isolated with a minimal direct `mapEdgarCompanyFacts`
reproduction (three filings for `end=2023-12-31`, as above) before the
real fix landed.

**Selection rule (the actual fix).** `parsing.ts` gained four exported
"filter-only" functions — `filterDurationFacts`, `filterInstantFacts`,
`filterAnnualInstantFacts`, `filterFiscalYearCumulativeFacts` — each the
existing filter half of its extract* sibling (same cadence/duration
predicate, byte-identical), factored out so the filtered-but-UNDEDUPED
fact array is available to a caller. `mappers.ts`'s
`resolveQuarterlyFields`/`resolveAnnualFields` now build a period's
`identity` maps from `toEarliestByEnd(filterXFacts(...))` — the
genuinely earliest-filed fact per `end` — while every field's reported
VALUE keeps reading, unchanged, from `toMapByEnd(extractXFacts(...))`
(latest-filed). `buildPeriodsFromFields` selects `representative`
(fiscalYear/fiscalQuarter/filingDate/accn) from the `identity` maps in
the same fixed priority order as before (revenue → operatingIncome →
operatingCashFlow → capex → cash → debtShort → debtLong); each field's
own `toDataField` value lookup is untouched.

One documented, narrow exception: `operatingCashFlow`/`capex` keep their
existing (latest-filed) map doing double duty as both value and identity.
Phase E.7D's cumulative-YTD derivation synthesizes some of these facts
from OTHER periods' cumulative figures, so there is no single
well-defined "this fact's own earliest filing" without reworking that
derivation — genuinely out of this fix's scope. Inconsequential in
practice: these two fields sit last in the priority order, behind
revenue/operatingIncome, which resolve for every period this mapper has
been validated against (Unity, ASML). No ticker-specific branch anywhere
— the fix is the shared selection rule alone.

**What stayed the same, deliberately.** Every reported financial VALUE
(and its `asOf`) is unchanged — only which fact supplies a period's
IDENTITY changed, never which fact supplies its figure.
`sharesOutstandingByAccession`'s own join needed no code change — it
already keyed by every distinct `accn` seen (Phase I.4A, §16.2); fixing
which `accn` lands on a period automatically fixes which shares figure
that period's checkpoint joins to.
`valuation-checkpoints.ts`/`valuation-orchestration.ts` are untouched —
they already correctly treated `period.filingDate` as the point-in-time
key; that key was simply wrong before this fix. Unity is structurally
unaffected: it is still dropped on missing debt before price/date
selection is ever reached, and its full existing test suite (mapper,
orchestration, Business Trajectory, Recent Changes,
`FundamentalChangeEvidence`) passes unchanged, since none of those
consumers key anything off `fiscalYear`/`filingDate`/`accn`.

**Corrected ASML checkpoints, live-revalidated** — 6 checkpoints, each
now with its own distinct, genuine filing date 40-65 days after its own
`periodEndDate` (matching the "current" checkpoint's always-correct
56-day baseline):

| fiscal year | checkpoint date | price (USD) | shares | total debt (EUR) | cash (EUR) | TTM revenue (EUR) | FX (USD→EUR) | EV/Revenue |
|---|---|---|---|---|---|---|---|---|
| 2025 (current) | 2026-02-25 | 1,526.51 | 385,417,665 | 4,390,900,000 | 12,916,000,000 | 32,667,300,000 | 0.84692 | 14.992 |
| 2024 | 2025-03-05 | 739.75 | 393,283,720 | 4,687,600,000 | 12,735,900,000 | 28,262,900,000 | 0.92678 | 9.255 |
| 2023 | 2024-02-14 | 924.44 | 393,421,721 | 4,631,600,000 | 7,004,700,000 | 27,558,500,000 | 0.93212 | 12.215 |
| 2022 | 2023-02-15 | 676.81 | 394,589,411 | 4,260,400,000 | 7,268,300,000 | 21,173,400,000 | 0.93620 | 11.666 |
| 2021 | 2022-02-09 | 680.37 | 402,601,613 | 4,584,100,000 | 6,951,800,000 | 18,611,000,000 | 0.87520 | 12.754 |
| 2020 | 2021-02-10 | 566.89 | 416,514,034 | 4,678,200,000 | 6,049,400,000 | 13,978,500,000 | 0.82510 | 13.839 |

Every ratio changed from the pre-fix numbers except "current" (always
correct); 2024 and 2023 changed the most, since those two previously
shared the most anachronistic (2026) price/shares.

**Tests.** `mappers.test.ts` gained a "Phase I.4A.1 point-in-time filing
identity" block (4 tests): the exact ASML three-filing reproduction
above (identity resolves to the 2024-02-14 original, never the 2025 or
2026 comparatives); a value-vs-identity split proof (a genuine
restatement still uses the latest VALUE while identity stays pinned to
the earliest filing — proving these are two independent rules, not one
dedup pass doing both jobs); the QUARTERLY/Unity-shaped equivalent
(extending the existing §4.4 comparative-balance fixture with identity
assertions); and a period whose ONLY fact is a later comparative (no
earlier appearance exists at all) still resolving rather than going
MISSING. Full suite: **60 files, 803 tests, all passing**, clean `tsc
--noEmit`, clean lint.

**Is Phase I.4A now point-in-time correct?** For both reference filers,
yes: every ASML checkpoint's price/shares/FX now dates to that period's
own genuine original filing, and Unity's behavior is unchanged and
unaffected (0 checkpoints, debt never resolves). Not a general proof for
every conceivable filer shape — a filer that never discloses a period on
its own and only ever reports it as someone else's comparative would
still resolve to "earliest of what SEC EDGAR's API actually returns"
(the fourth new test's scenario), which is the correct fallback, not a
claim that a still-more-original disclosure can never exist beyond what
the API surfaces.

### 16.8 Phase I.4B — Minimum Valuation Context (implemented)

Exposes §16.7's now-point-in-time-correct `EvRevenueCheckpoint[]` to the
user for the first time, closing the "built, not yet called from
anywhere" gap `fetchLiveEvRevenueCheckpoints` had carried since §16.2.
Descriptive context only, per the task's explicit boundary: current
EV/Revenue against the median of its own recent completed-fiscal-year
history, described as "Higher"/"Lower"/"In line with recent history" —
no cheap/expensive language, no over/undervalued judgment, no score, no
percentile, no threshold beyond the plain three-way sign comparison the
spec itself specifies. §16's own data pipeline
(`valuation-checkpoints.ts`/`valuation-orchestration.ts`) is untouched —
this phase reads its output, never its logic.

**What was built.** `src/domain/signals/valuation-context.ts` —
`deriveValuationContext(checkpoints)`, pure and deterministic. Requires
at least 3 historical checkpoints (the product spec's own minimum) or
resolves `MISSING`; computes the plain median of the historical
`evToRevenue` values (no interpolation beyond the standard even-count
average); compares current against that median with an exact three-way
sign check to `HIGHER`/`LOWER`/`IN_LINE`. `IN_LINE` requires exact
numeric equality — expected to be rare with real floating-point ratios,
and that rarity is the honest, correct behavior for a threshold-free
comparison, not a gap to paper over with an invented tolerance band.
`src/components/playbook/ValuationContextCard.tsx` mirrors
`RecentChangesCard`/`BusinessTrajectoryCard`'s exact visual language and
restraint: identical card chrome, identical `Minus`-icon "Not available"
state, and deliberately NO color/icon variation by comparison direction
— a `HIGHER` reading is not styled as a warning any more than `LOWER` is
styled as an opportunity, the same precedent `RecentChangesCard`
established for `reversed`.

**The "current" convention — a documented limitation, not a general
rule.** `deriveEvRevenueCheckpoints` (§16.2) always places the current
period's own checkpoint FIRST when it survives, followed by completed
fiscal years most-recent-first — checkpoints are only ever filtered,
never reordered, so this ordering is reliable in every case this phase
actually validates. `deriveValuationContext` reads `checkpoints[0]` as
"current" and the rest as "historical" on that basis. This is not a
provable general rule: if a real filer's own CURRENT-period checkpoint
were the one dropped for missing evidence while its completed years all
survived, `checkpoints[0]` would silently become the most recent
completed year instead, and this module would misreport it as current.
Fixing this generally would mean threading an explicit `isCurrent` flag
through §16's own `EvRevenueCheckpoint` type — deliberately not done
here, per this phase's "do not change the valuation data pipeline"
boundary. Neither reference filer hits this edge case (ASML's current
checkpoint has never been dropped; Unity's whole array is empty
regardless), so it is flagged as a known limitation rather than a bug to
fix now.

**Wired end-to-end.** `src/app/stocks/[ticker]/page.tsx` now also calls
`fetchLiveEvRevenueCheckpoints` — a third parallel live fetch alongside
momentum/fundamentals (SEC EDGAR fundamentals again, plus Twelve Data
historical price/FX; not reusable from the existing fundamentals fetch,
which carries no price/FX data) — and threads
`initialEvRevenueCheckpoints` through `StockDetailClientShell` →
`PlaybookClientShell`, which derives `valuationContext` and renders
`ValuationContextCard` directly below `RecentChangesCard`. A failed
fetch (`undefined`) and a genuinely-empty result (every checkpoint's
required evidence missing) both collapse to `[]` before reaching
`deriveValuationContext`, which already treats both as `MISSING` — the
same "absent" convention every other `initial*` prop in this component
tree already follows.

**Tests.** `valuation-context.test.ts` (10 tests): the empty-array/
Unity-shaped case, the below-minimum (2 historical) case, the exactly-3
and full-5 historical cases, `HIGHER`/`LOWER`/`IN_LINE` (including
exact-equality with no tolerance band), even-count median averaging,
order-independence of the median, and a shape check confirming no
score/percentile/classification field exists on the `AVAILABLE` result.
No new UI component tests — consistent with this codebase's existing
convention of testing presentation-layer cards only through their pure
domain primitive, never rendering them directly (no `.tsx` test exists
anywhere in this repo). Full suite: **61 files, 813 tests, all
passing**, clean `tsc --noEmit`, clean lint (the same two pre-existing,
unrelated `react-hooks/set-state-in-effect` errors as every prior
phase).

**Live-validated** in the running app, both reference stocks, real SEC
EDGAR + Twelve Data data:

- **ASML**: Current **15.0x**, 5-year median **12.2x**, **"Higher than
  recent history"** — consistent with §16.7's own corrected checkpoint
  numbers (current 14.992; historical
  [13.839, 12.754, 11.666, 12.215, 9.255], median 12.215).
- **Unity**: **"Not available"** — debt still never resolves (§9's
  original finding), so `fetchLiveEvRevenueCheckpoints` still returns an
  empty array and `deriveValuationContext` correctly reports `MISSING`,
  exactly as required.
- Incidentally confirmed live that three concurrent Twelve-Data-touching
  fetches on one page load (momentum + the new valuation checkpoints
  call) can trip the provider's per-minute credit cap under real
  conditions — §16.2's existing "never throws, resolves to `undefined`
  on any failure" contract degraded correctly to "Not available" rather
  than an error page; re-verified `AVAILABLE` on retry once the rate
  limit window reset. Not treated as a defect to fix in this phase (no
  caching/backoff/retry logic added) — noted as an observed operational
  characteristic under the free-tier rate limit, not a correctness issue
  with the data itself.

**What was not touched.** Classification (above/within/below historical
range) beyond the plain three-way comparison the spec itself specifies,
percentile/rank, a valuation score, peers/P-E/DCF/fair value,
interpolation, AI — all still genuinely unimplemented, per this phase's
own explicit boundary.
