# Minimum Research Model for a Generic Stock Playbook

Status: **product/model definition, not a design or implementation
document**. No code changed. Builds directly on
`docs/post-phase-h-product-review.md`'s findings; does not define
Phase I and does not reopen H.0–H.6.

**Core question:** *What is the minimum evidence a beginner should
understand before deciding whether to Build, Hold, or Reduce a stock
position?*

Unity and ASML are used throughout as the two reference cases — Unity
because it is the only stock with a complete, hand-authored evidence
set, ASML because it is the real, live, generic case Phase H actually
produced.

---

## 0. What was read

- `docs/post-phase-h-product-review.md` — the seven findings that
  motivate this document, especially F1 (no Valuation), F2 (Fundamentals
  doesn't generalize), F3 (no per-stock research), F4 (placeholder/
  model-fit invisibility), F5 (frozen copy references evidence that
  doesn't exist).
- Momentum: `src/domain/signals/momentum-score.ts`,
  `src/config/ruleset-v0.1.ts`'s `technical.momentum` block, and the
  live orchestration (`twelve-data/orchestration.ts`) — confirmed, not
  re-derived: six components (RSI, Relative Volume, 50/200DMA Structure,
  Price Extension, Primary Trend, Relative Strength), live for any
  Twelve-Data-covered ticker, honest coverage math, `SCORED`/
  `INSUFFICIENT_DATA` discriminated result.
- Fundamentals: `docs/phase-e0-fundamentals-evidence-contract-design.md`,
  `src/types/fundamentals.ts`, `fundamentals-score.ts`,
  `sec-edgar/mappers.ts`/`orchestration.ts`/`ticker-resolver.ts`.
  Confirmed two things not previously stated this precisely: (1)
  `guidanceEvidence` is **unconditionally hardcoded to `MISSING`** in
  the live mapper — "Path B (AI extraction) is a separate, later
  checkpoint" that was never built, so Guidance is permanently absent
  for every stock, not just ones with thin coverage; (2) the live
  pipeline only ever resolves a company if its ticker appears in SEC's
  own `company_tickers.json` registrant list, and even then depends on
  the filer having tagged the specific US-GAAP XBRL concepts the mapper
  looks for — foreign private issuers reporting under IFRS (ASML's
  actual situation) are exactly the population most likely to fail this
  silently, which is the concrete, demonstrated reason ASML's
  Fundamentals read "Not available" live in H.6.
- Thesis: `src/domain/thesis/thesis.ts` (read in full — three functions,
  ~40 lines). Confirmed precisely: `deriveThesisHealth` is a **literal
  identity pass-through** ("Phase D will replace... For now it returns
  the seed value unchanged") — there has never been a "Thesis Engine" in
  this codebase, only a mechanical `ThesisHealth → ScoreItem` relabeling
  and an add-eligibility gate. No dedicated Thesis design doc exists
  anywhere in `docs/` (confirmed via search) — Thesis has only ever been
  touched by validation reports (B.5.4b/B.5.5) and H.1's
  `ThesisTrajectory` onboarding mapping. Today, Thesis Health is **100%
  a stored user opinion**, never a computed or researched signal.
- AI research: `docs/phase-h5-ai-assisted-research-design.md` (this
  session's own prior work) — Evidence Brief interprets
  already-computed structured evidence only; Intent Assist helps resolve
  unresolved intent questions using the same evidence; neither fetches,
  reads, or extracts from any external document. This boundary was a
  deliberate v0.1 scope decision (§8), not an oversight, and this
  document does not reopen it — it only asks, per area below, where
  that boundary currently limits the research model.

---

## 1. Challenging the candidate areas

The brief's six candidates are a reasonable starting point but are not
all peers of each other, and one pair should merge. Three adjustments,
each justified below:

### 1.1 Portfolio Fit is not "research" — it's the one area already done

The other five candidates are all evidence **about the company**.
Portfolio Fit is evidence **about the user's own position relative to
their own portfolio** — current weight, target range, core/tactical
split, concentration state. It is also, by a wide margin, the most
mature part of the product: fully deterministic, fully tested, verified
correct on both BUY and SELL in H.6, and needs no new evidence source of
any kind. It stays in the model (a beginner absolutely needs it to
decide "how much"), but it should not be planned or resourced alongside
the other five — there is no gap here to close.

### 1.2 Thesis and Risks/What Changed should be one area, not two

Both currently draw on the same underlying need (a small set of
company-specific, qualitative statements: why you own it, what would
change your mind) and both are implemented today as exactly one thing —
Unity's single frozen hand-typed block (`ThesisCard` +
`WhatChangesMyView`, confirmed still true post-H.6). Splitting them into
two research pipelines would double the evidence-gathering problem
without a corresponding product reason: a beginner's real question is
"do the reasons I own this still hold, and what would tell me they
don't" — one question with two tenses (current state / forward watch
list), not two questions. §2.4 below treats them as one area with two
parts.

### 1.3 Momentum is supporting evidence, not a peer decision input

Momentum answers "how has the market been treating this stock lately" —
genuinely useful for **timing** ("don't chase a stock that just ran up
sharply," §14's own Price Extension dimension exists for exactly this),
but only weakly connected to the actual Build/Hold/Reduce judgment,
which should be dominated by business health, valuation, thesis, and
portfolio fit. Today's Signal Overview gives Momentum the exact same
visual weight as Fundamentals — a "peer" dimension — despite being
considerably less relevant to "should I own this company" than to "is
now an unusually stretched moment to act." It is also, not coincidentally,
the one dimension that already works broadly and well, which makes it
easy to over-trust simply because it's the most *present* signal, not
because it's the most *decision-relevant* one. It stays in the model as
supporting/contextual evidence, not as one of the primary pillars a
beginner's decision should rest on.

**Resulting model: five areas**, not six — Business Health, Valuation,
Thesis & Watch, Portfolio Fit (already complete), plus Momentum
recast as supporting/contextual rather than a primary pillar.

---

## 2. The five areas

### 2.1 Business Health (was "Fundamentals")

**Beginner question:** *Is the business itself doing well — growing,
profitable, generating cash?*

**Minimum evidence required:** Far less than what's already built.
Three headline signals, not seven finely parsed dimensions: (1) is
revenue growing, and is that growth accelerating or decelerating; (2)
is the business profitable (or improving toward profitability), and is
that trend improving or worsening; (3) is it generating real cash, not
just accounting profit. That's the beginner-relevant core of what's
today spread across Revenue Growth, Growth Trend, Operating Margin,
Margin Trend, and FCF Margin. Guidance and Balance Sheet health are
genuinely useful *additions*, not part of the minimum.

**What can be deterministic:** All of it, when the underlying company
facts are available — this is already a solved problem for a US-GAAP
XBRL filer (confirmed: Unity's own numbers are computed, not hand-typed,
same pipeline as ASML's would-be numbers). No judgment call is needed to
turn "revenue up 24% YoY" into a normalized score.

**What may require AI/research:** Two things, both explicitly deferred
by H.5, not solved by it: (a) extracting qualitative guidance/outlook
language from earnings reports into the structured
`{direction, magnitude}` shape the original spec already designed for
this (§12) — today `guidanceEvidence` is unconditionally `MISSING`,
permanently, for every stock; (b) classifying which archetype a company
actually is, so "business health" isn't silently scored against a
growth-software template for a semiconductor-equipment manufacturer.
Neither is AI *interpreting existing evidence* (H.5's current scope) —
both are AI *producing new structured evidence*, a materially different
and larger capability.

**How missing evidence should be represented:** Already correct where
it's honestly missing (`INSUFFICIENT_DATA`, per-component `MISSING`,
coverage %) — this part of the model does not need fixing. What needs
fixing is downstream: once confirmed, the Scorecard shows a single
"7/10 Positive" with no trace of *how much* of that 75% coverage was
real vs. archetype-mismatched (product review F4) — the fix belongs
there, not in this area's own evidence representation.

**Do we already support it today?** Partially, and unevenly. Live,
real, computed for any SEC-XBRL-tagged US-GAAP filer (Unity: yes,
confirmed working). Silently absent for foreign private issuers and
anyone SEC's ticker list doesn't resolve cleanly (ASML: confirmed
"Not available" live, for exactly this reason). Guidance: never, for
anyone, by explicit unfinished design. Archetype fit: never classified,
for anyone but Unity's own hand-confirmed case.

### 2.2 Valuation

**Beginner question:** *Is this stock expensive or cheap right now,
relative to what the business is actually worth?*

**Minimum evidence required:** One simple, well-chosen ratio, not a
comps table. A single price-to-something-fundamental metric (e.g.
forward P/E, or EV/Revenue for a not-yet-profitable growth company)
compared against the stock's own recent history is enough to answer
"expensive or cheap *for this stock*" — which is the beginner-relevant
question, not "expensive or cheap versus five hand-picked peers,"
which is a materially harder, more judgment-laden comps exercise this
model should not attempt.

**What can be deterministic:** The ratio math itself, entirely — once a
price and a fundamental denominator both exist. This is arithmetic, not
judgment.

**What may require AI/research:** Nothing, for the minimum version above
— it's a pure function of two numbers this product either already has
(price) or is building toward (§2.1's Business Health). AI's only
legitimate role here (matching H.5's existing interpret-only boundary)
is explaining what a computed ratio means in plain language, never
computing or estimating the ratio itself.

**How missing evidence should be represented:** This is the one place
the current product actively gets it wrong, and it's the single sharpest
finding in the product review (F4): a fabricated "5/10 Neutral" is shown
with the same visual authority as a real score, for every stock,
forever. The correct representation is the one this codebase already
uses everywhere else — an honest `MISSING`/"Not available," never a
placeholder number — until a real pipeline exists.

**Do we already support it today?** No. Zero live pipeline, for any
stock, ever — not weak, not partial, structurally absent. This is the
one area where "do we support it" and "should we build it" are both
genuinely open, not just under-built.

### 2.3 Thesis & Watch List (merged, §1.2)

**Beginner question:** *Do the reasons I bought this still hold up, and
what would tell me if they stopped?*

**Minimum evidence required:** Small and deliberately narrow — 2-4
short, plain-language statements: why the user believes this today
(their own words, already captured at onboarding via Q4's
`ThesisTrajectory` answer, currently discarded after materialization
except as one rolled-up state), one or two things that would make the
case *stronger*, and one or two things that would make it *weaker*.
This does not need to be an equity-research-grade risk-factor section —
the entire "Thesis breakers"/"catalysts"/"risks" three-column layout
Unity currently has is more machinery than a minimum model needs; three
or four sentences a beginner would actually read is the real target.

**What can be deterministic:** Two genuinely useful things, both free —
this area does not require new evidence infrastructure to get partial
value: (1) `ThesisTrajectory`, the user's own onboarding answer, is
already captured and already maps deterministically to `ThesisHealth`
(H.1/H.2, unchanged) — it is simply discarded from display after
confirmation today, which is a pure UX-debt fix, not a research gap;
(2) some of "what changed" is *already computed* as Business Health's
own trend deltas (Growth Trend, Margin Trend) — a plain-language digest
of "margins have been improving/worsening" needs no new evidence source,
only a template over data §2.1 already produces.

**What may require AI/research:** The genuinely new part — turning a
recent filing or earnings call into 1-2 sentences of "what actually
changed" and helping the user judge whether their stated thesis still
holds against it. This is squarely H.5's original spec ancestor (§15's
Thesis Engine contract: `state, confidence, supporting_evidence,
contradicting_evidence, unknowns`, already designed, never built) and
is a real, deliberate extension of AI's current remit — it requires AI
to read source material, not just interpret already-structured scores,
which is outside H.5 v0.1's explicit boundary and would need its own
scoping decision (§4).

**How missing evidence should be represented:** Cleanly solvable with
the existing `MISSING`/absent pattern — for a stock with no watch-list
content yet, show nothing (as H.6 already fixed) rather than another
stock's content, and show the user's own onboarding answer honestly
rather than silently dropping it.

**Do we already support it today?** The user-input half: yes, fully,
already deterministic, just not displayed past onboarding. The
research half: no — zero for every stock except Unity's frozen,
hand-typed, demonstrably-goes-stale block.

### 2.4 Portfolio Fit — already complete, no gap to close

**Beginner question:** *How does this fit with the rest of what I own,
and how much of it should I actually have?*

**Minimum evidence required:** Already exactly right — current weight,
target range, concentration state, core/tactical split. Nothing to add.

**What can be deterministic:** All of it, and it already is.

**What may require AI/research:** Nothing for the core numbers. The one
legitimate extension — noting that a stock's exposure overlaps with a
broader holding like a global-equity ETF — is a real but separate
capability (cross-holding correlation), not a gap in this area's own
evidence, and not part of a *minimum* model.

**How missing evidence should be represented:** Already correct — the
`PARTIAL`/`UNAVAILABLE` portfolio-valuation states are handled honestly
throughout (confirmed in H.6).

**Do we already support it today?** Yes, completely, for every STOCK
holding. (Its own real gap — no equivalent for ETF/crypto/cash — is a
portfolio-scope question the product review already raised as F6, not a
research-model question this document should re-litigate.)

### 2.5 Momentum — supporting evidence, keep as-is

**Beginner question:** *Is now an unusually stretched moment to act, one
way or the other?*

**Minimum evidence required:** Already more than sufficient — six
components is arguably generous for "supporting context," not a gap.

**What can be deterministic:** All of it, and it already is, live, for
any covered ticker.

**What may require AI/research:** Nothing to compute. AI's only role is
explaining what a momentum reading means for a beginner's timing
question ("this has run up quickly recently — some investors would wait
for a pullback"), which is squarely within H.5's existing Evidence Brief
scope today.

**How missing evidence should be represented:** Already correct
(`INSUFFICIENT_DATA`, per-component visibility, coverage %) — no change
needed.

**Do we already support it today?** Yes, fully, broadly, for both
reference stocks. The only open question (§1.3) is whether it should
keep the same visual/decision weight as Business Health and Valuation on
the Signal Overview, or be presented as clearly secondary/contextual —
a presentation decision, not a research-model gap.

---

## 3. Overlap between areas

- **Valuation structurally depends on Business Health.** A price-to-
  fundamental ratio cannot exist without a trustworthy fundamental
  denominator — which means Valuation's own build-out is sequenced
  *after*, not parallel to, closing Business Health's filer-coverage
  gap (§2.1). Building Valuation on top of today's unreliable
  Fundamentals coverage would just produce a second unreliable number.
- **Thesis & Watch can partially reuse Business Health's own trend
  data** (§2.3) — "what changed" doesn't need a wholly separate evidence
  pipeline; some of it is a presentation layer over data that already
  exists.
- **Momentum and Valuation are both price-derived** but answer different
  questions (trend vs. level-relative-to-fundamentals) — no reason to
  merge them, but they can share the same underlying raw price/history
  fetch, which they already do via the live Twelve Data pipeline.
- **Thesis already gates Portfolio Fit's own action logic**
  (`isThesisEligibleForAdd`, HC-002) — this integration point already
  exists and works; it is not a gap.
- **AI overlaps every area identically, on purpose:** an interpretation
  layer over already-computed evidence, never an evidence source of its
  own (H.5's boundary, unchanged by this document). Where an area's
  "what may require AI/research" column asks for something AI cannot do
  under that boundary today (Guidance extraction, archetype
  classification, thesis-vs-filing comparison), that is flagged
  explicitly above as a scope question, not silently assumed solved.

---

## 4. Evidence we deliberately do NOT need

Named explicitly, since "avoid a professional equity-research terminal"
is easy to violate by accretion:

- Full multi-year historical financial statements — trend direction (up/
  down/accelerating) is the beginner-relevant signal, not the statements
  themselves.
- Peer/comparable-company valuation tables ("comps") — a materially
  harder, more judgment-laden exercise than "is this stock cheap
  relative to its own recent history."
- Analyst price targets or consensus estimates — invites false precision
  and a paid-data-vendor dependency for a beginner-facing signal that
  doesn't clearly improve the Build/Hold/Reduce decision.
- Chart-pattern technical analysis (head-and-shoulders, Fibonacci
  retracements, etc.) — the wrong tool for a long-horizon Build/Hold/
  Reduce decision, not merely "not minimal."
- Options/derivatives positioning or implied volatility — irrelevant to
  a beginner long-only stock decision.
- Full 10-K/20-F risk-factor boilerplate — the *right* minimum is 1-2
  curated, company-specific risks that would actually change the
  thesis, not the dozens of generic legal disclosures every filer
  includes.
- Segment-level revenue breakdowns — too granular for "should I hold."
- Macro/rates/sector-rotation commentary — real, but disproportionate
  complexity for the decision this product actually supports.
- Real-time/intraday price or volume — already correctly avoided
  (daily-bar based); no reason to reconsider.
- ESG scores, insider-transaction feeds, short-interest data — genuine
  professional-analyst signals, not part of a beginner minimum.

---

## 5. Which current gaps actually prevent a trustworthy generic Playbook

Not every gap above is equally serious. Distinguishing **"breaks trust"**
(shows something false with confidence) from **"limits usefulness"**
(honestly shows less than ideal) matters, because the fix for the first
kind is urgent and the fix for the second kind is a genuine, separately-
schedulable product investment:

**Actually breaks trust — silent false certainty, not honest absence:**
1. Valuation's fabricated "5/10 Neutral," shown with the same authority
   as a real score, on every stock's confirmed page, forever (§2.2,
   product review F4). This is the one finding in this whole document
   that should not wait for a "minimum research model" to be built
   before being addressed — it can be fixed today by showing an honest
   absence instead of a number, independent of whether/when a real
   Valuation pipeline is ever built.
2. Fundamentals' archetype-fit status, carefully modeled all the way
   through H.1's onboarding Proposal, disappearing entirely on the
   confirmed page (§2.1, product review F4) — same failure mode as #1,
   already fully specified, only needs threading through.
3. Unity's own frozen copy naming a "valuation" trigger condition that
   has never once been evaluated by anything in this system (product
   review F5) — a concrete production instance of #1, not a
   hypothetical.

**Limits usefulness, but is honestly represented — real, but not
urgent in the same way:**
- Business Health's filer-coverage gap for non-US-GAAP companies (§2.1)
  — shows "Not available," which is honest, just narrower than it
  should be.
- No Valuation pipeline at all (§2.2) — once #1 above is fixed (honest
  absence instead of fabrication), this becomes a real but non-urgent
  capability gap, not a trust problem.
- No Thesis & Watch research beyond Unity (§2.3) — the product is
  honestly thinner here for other stocks, not misleading about it (once
  the sections are correctly hidden, as H.6 already fixed).
- Guidance permanently `MISSING` (§2.1) — honestly represented as
  missing today; a genuine capability gap, not a trust problem.

**The practical implication:** a "trustworthy generic Playbook" does not
require closing every evidence gap in this document — it requires
closing exactly the three items in the first list, all of which are
about *how existing gaps are shown*, not about building new evidence
pipelines. The larger research build-out (§2.1's filer coverage, §2.2's
real Valuation, §2.3's real Thesis research) genuinely improves the
product but is not, on its own, what stands between the current product
and a trustworthy one.

---

## 6. Summary table

| Area | Minimum beginner question | Deterministic today | Needs new AI/research capability | Missing-evidence handling | Support today |
|---|---|---|---|---|---|
| Business Health | Is the business growing, profitable, cash-generating? | Yes, when data resolves | Guidance extraction; archetype classification | Correct at the evidence layer; broken at the display layer (F4) | Partial — works for US-GAAP filers (Unity), silently thin for others (ASML) |
| Valuation | Is this cheap or expensive right now? | Yes, once a denominator exists | No — pure arithmetic once inputs exist | **Wrong today** — fabricated placeholder shown as real | None — zero pipeline |
| Thesis & Watch | Do my reasons still hold, what would change them? | User's own answer, already captured | Yes — reading filings to compare against the stated thesis | Correct pattern exists, not applied post-confirmation | User half: yes. Research half: Unity only |
| Portfolio Fit | How does this fit my whole portfolio, how much should I have? | Yes, fully | No | Already correct | Complete |
| Momentum (supporting) | Is now a stretched moment to act? | Yes, fully, live | No | Already correct | Complete, arguably over-weighted in presentation |

---

## 7. Product/model decisions this document surfaces, not resolves

These are genuine forks the next planning step needs an answer to —
none of them is decided here:

1. **Fix the two silent-false-certainty issues (§5, items 1-2) now, as
   their own small, isolated change — independent of any larger
   research build-out?** This document's own analysis suggests yes,
   but it's a product call, not an inevitability.
2. **Is a real Valuation pipeline worth building at all**, given the
   "smallest useful model" framing — and if so, at what fidelity (one
   simple ratio vs. something richer)? This document recommends the
   simple version; whether to build it now, later, or not at all is
   open.
3. **Should Business Health's scope be stated honestly** ("works well
   for US-GAAP filers; other companies show as unavailable") rather than
   silently degrading — a copy/expectation-setting decision that doesn't
   require new evidence infrastructure to make.
4. **How far should Thesis & Watch's AI extension go** — plain-
   language trend digest only (needs nothing new), vs. real filing-
   reading (a genuine, larger extension of H.5's current interpret-only
   boundary, previously deferred deliberately)?
5. **Should Momentum's presentation weight change** — from a full peer
   dimension to a clearly secondary/contextual signal — independent of
   any evidence-gathering work, since the underlying pipeline is already
   complete?
