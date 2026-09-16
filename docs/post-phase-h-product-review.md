# Post–Phase H Product Review

Status: **product review, not a design or architecture document**. No
code changed. Phase H is complete (`docs/phase-h6-end-to-end-validation.md`);
this document evaluates what the completed product actually delivers to
a beginner, using Unity (the original, richest, hand-authored case) and
ASML (the real generic case Phase H built) as the two reference points.
Every claim below was observed live in the running app this session, not
inferred from reading code alone.

**Core question:** *How well does the current product actually help a
beginner understand their investment and make a better-informed
decision?*

**Short answer:** The *decision mechanics* — position sizing, concentration
math, transaction accounting, action-readiness signaling — are genuinely
strong and already deliver real value. The *evidence base* those
mechanics reason over is thin for anything except live price momentum,
and for a company that isn't Unity, the product currently has almost
nothing analytical to say about the company itself. The trust
scaffolding built across H.0–H.5 (provenance, missing≠zero,
model-fit disclosure) is well-designed during onboarding and then
**mostly disappears** once a Playbook is confirmed — which is exactly
the screen a user actually lives on day to day.

---

## 1. Walkthrough — what a beginner actually experiences

```
Portfolio → Stock → Playbook → Research/Evidence → Recommended Holding
→ Primary Action → Action Zones → Transaction → Recalculation
```

**Unity** (the hand-seeded, "complete" case): rich Investment Thesis with
catalysts/risks/thesis-breakers, a "What would change my view?" watch
layer, two research documents, a detailed multi-year transaction
timeline, six-dimension Signal Overview (three of which are real,
computed scores), and Action Zone drawers with primary
trigger/why/do-not-trigger-if/sizing detail. This is what the product
looks like when everything H.0's plan imagined is present.

**ASML** (a real STOCK holding, onboarded live through the actual H.3–H.5
flow this session): a HOLD stance, one Primary Action ("Add to
position"), a Portfolio Fit card, a five-zone Action Framework with the
same drawer-level detail *mechanism* as Unity, a Signal Overview where
Momentum is real (live Twelve Data fetch, "Positive") and Fundamentals/
Valuation both read "Not available"/a flat placeholder, no Investment
Thesis section at all, no research documents, and a "Recent activity"
list containing exactly one entry ("Playbook created") — a BUY and a SELL
executed live against this exact holding in this session do **not**
appear there.

That gap between the two — not any individual bug — is the real finding
of this review: **Unity is the product's demo case, not its generic
case.** ASML is what every other beginner's stock actually looks like
today, and it is a substantially thinner experience.

---

## 2. Evaluation by dimension

### 2.1 Decision usefulness

Using the product's own four questions (`PLAYBOOK_INTERFACE_PRINCIPLES.md`
§1: what should I do / why / what am I waiting for / what happens next):

- **What should I do now?** Clear for both stocks — one Primary Action
  card, unambiguous, matches Interface Principles §4's "one action
  dominates" rule well.
- **Why?** Strong when evidence exists (Portfolio Fit's live weight/
  target numbers), weak when it doesn't — Unity's Trim Level 1 drawer
  cites "Price / valuation reaches the defined trim zone" as its
  Primary Trigger (§2.2 finding **F5** below) even though no valuation
  evidence exists anywhere in the product, for any stock, ever.
- **How much?** Strong — "Current holding → Recommended holding," trim
  sizing suggestions, BUY/SELL previews all give a concrete number, not
  a vague direction.
- **When should I act?** Weak by omission, not by error: the product is
  entirely pull-based. There is no signal, notification, or "come back
  when X happens" mechanism — a user must remember to reopen the app to
  discover a zone became Active. Reasonable for an MVP, but it means the
  "WAITING → READY TO ACT" transition (§5/§6 of Interface Principles)
  never actually notifies anyone.
- **What would change the recommendation?** Excellent for Unity (the
  "What would change my view?" bullish/cautious lists), **entirely
  absent** for every other stock — this capability was never built
  generically, only hand-typed once for Unity.

### 2.2 Trust & explainability

Can a user tell facts from AI interpretation from their own assumptions
from deterministic rules from missing evidence?

**During onboarding: yes, very well.** H.1's `ProposalField<T>`
provenance model (USER/SYSTEM/AI/DETERMINISTIC/MISSING) is real,
consistently applied, and the Review screen visibly distinguishes "what
you told us" from evidence from AI interpretation. This is genuinely
good work.

**On the confirmed Playbook page: mostly no.** Once a Proposal becomes a
`StockPlaybookConfig`, provenance is deliberately dropped (H.1 §1.2's own
confirmation boundary) — which is the right call for keeping AI out of
production numbers, but it also means the *user-facing* distinctions
disappear along with it:

- Fundamentals' `modelFit` (CONFIRMED/LIMITED/UNKNOWN) is only ever shown
  transiently during Review — the permanent Signal Overview has no trace
  of it. A Fundamentals score of "7/10 Positive" reads with identical
  authority whether the company is a confirmed archetype fit or (as for
  every stock other than Unity) an unclassified fit.
- Valuation's "5/10 Neutral" is styled **identically** to the real,
  computed Fundamentals/Momentum rows next to it — same pill, same
  position, same font weight. The only signal that it's not real is the
  *absence* of an expand chevron, which is easy to miss and explains
  nothing on its own.
- Unity's hand-authored Action Zone prose (frozen at authoring time) is
  rendered with the same visual authority as the live, recomputed
  numbers around it, with no "as of" marker — and H.0's own earlier audit
  already caught this exact content going stale in a real test (a
  weight changed from 58.6% to 55.3%; the zone text still said 58.6%).

### 2.3 Research quality

This is the dimension with the largest gap between product promise and
delivered evidence:

- **Momentum** is the one genuinely broad, live, working pipeline — real
  Twelve Data quotes/history, six components, honest coverage math. It
  worked correctly for both Unity and ASML in this session.
- **Fundamentals** is scored against exactly one archetype
  (`GROWTH_SOFTWARE`), applied to every company regardless of fit, with
  no classifier and no second archetype. Live-observed: it returned
  "Not available" entirely for ASML — a real semiconductor-equipment
  manufacturer, not a growth-software company, is close to the archetype
  it was never designed to fit.
- **Valuation** has no pipeline at all, for any stock, ever. Not "weak" —
  **zero live data source exists.** Every value is the same hardcoded
  placeholder.
- **Company-specific research/thesis** (why do I own this, what could
  break it, what's the latest filing say) exists only for Unity, as
  frozen hand-typed prose. For every other stock the user answers "have
  your reasons changed?" during onboarding and receives nothing
  analytical back, ever.
- **AI** is the one mechanism that could plausibly start closing this
  gap, and by H.5's own deliberate design (not an oversight) it cannot:
  it only interprets *already-computed* evidence, never fetches new
  research. Since Fundamentals/Valuation are largely absent for a
  non-Unity stock, AI has correspondingly little to interpret.

### 2.4 Portfolio usefulness

Genuinely strong where it applies: weighted-average cost accounting,
live concentration math, a cash-aware BUY preview ("Available cash:
€X"), core/tactical share breakdown, and correct weighted-average-cost
preservation on SELL — all verified with real arithmetic in H.6.

The meaningful gap: **only STOCK holdings get any of this.** In the
reference portfolio, ETF (VWRL, 13.1%) and Bitcoin (8.0%) — over a fifth
of total value — plus Cash (6.1%) get a static, non-interactive "No
playbook" label and nothing else. No cross-holding awareness exists
either — a stock's Playbook never factors in that the user may already
carry correlated exposure through a global-equity ETF.

### 2.5 UX

- **"+ Research" header button does nothing.** Clicked live, on both
  Unity and ASML — no modal, no navigation, silent no-op.
- **"No playbook" reads identically** whether a holding is a STOCK that
  simply hasn't been onboarded yet (ASML, before this session) or an
  ETF/crypto/cash position that can *never* get one by design. Nothing
  in the UI tells a beginner which situation they're in.
- **Non-Unity transaction history is invisible on the stock's own page.**
  A real BUY and SELL executed against ASML in this session do not
  appear in "Recent activity" — only the one-time "Playbook created"
  entry does.
- **`ConcentrationMeter` renders overlapping, 15-digit unrounded
  percentage text** (documented as a bug in H.6) on every stock's page,
  Unity included — a small thing, but the kind of visible glitch that
  quietly undermines confidence in everything else the app calculates.
- **Hand-authored copy assumes financial literacy** a beginner may not
  have ("valuation expands faster than earnings power," "stronger
  price / valuation conditions") — fine for an experienced Unity holder,
  not obviously beginner-friendly, and it's the template future
  hand-authored content would presumably follow.
- **Combined stance labels** like "HOLD / GRADUALLY TRIM" name two
  states at once without ever explaining what holding-while-trimming
  means as a single concept.

---

## 3. Findings — gaps worth deciding on

Each finding: the user problem, the evidence for it, why it matters,
what kind of gap it is, a rough effort/dependency read, and what happens
if nothing changes.

### F1 — Valuation doesn't exist as evidence, anywhere, for any stock

**User problem:** "Is this stock expensive right now?" is one of the
most basic questions a beginner investor asks, and the product cannot
answer it — not poorly, not partially, not at all.
**Evidence:** Live-observed "Not available" (ASML) / a flat "5/10
Neutral" placeholder (Unity) for every stock's Valuation row, confirmed
by H.0–H.2's own design docs: no live pipeline was ever built, by
explicit, repeated scope decision.
**Why it matters:** Without it, "should I add more" and "should I trim"
decisions are made on momentum/thesis/concentration alone — a real,
material blind spot for an investing tool, not a cosmetic one.
**Type:** Model/data limitation (a genuine capability gap, correctly
scoped out of every Phase H checkpoint so far, not a regression).
**Effort/dependency:** High — needs a real valuation data source and a
scoring model (mirrors the Fundamentals build-out effort from Phase E).
**If nothing changes:** The product keeps making sizing/timing
recommendations that are silently unconditioned on price relative to
value — the single most-asked beginner question stays unanswerable.

### F2 — Fundamentals' single archetype doesn't generalize past Unity

**User problem:** A beginner who onboards a bank, biotech, REIT,
industrial, or (as demonstrated) semiconductor-equipment company gets no
usable Fundamentals read at all.
**Evidence:** ASML's Fundamentals genuinely returned "Not available" in
this session's live SEC EDGAR fetch — not a hypothetical, an observed
failure for a real, well-known, large-cap company.
**Why it matters:** Fundamentals is one of only two evidence dimensions
that can ever be "real" for a non-Unity stock (the other being
Momentum) — losing it for most companies leaves Momentum alone to
justify most decisions.
**Type:** Model/data limitation — no classifier exists to even detect
archetype mismatch (H.0 explicitly deferred this).
**Effort/dependency:** High — needs either a company-archetype
classifier or additional archetype templates (bank, industrial,
biotech, etc.), each its own validated model.
**If nothing changes:** Fundamentals silently works for "companies that
happen to look like growth software" and silently fails for everyone
else, with no indication to the user of *why* it's missing for their
specific company.

### F3 — No per-stock research/thesis capability beyond Unity's frozen seed

**User problem:** The product asks a beginner "have your reasons for
owning this changed?" (onboarding Q4) but never gives them anything to
compare that answer against — no catalysts, no risks, no "here's what
recent filings actually said."
**Evidence:** `ThesisCard`/`WhatChangesMyView`/`ResearchPreview` only
render for Unity (by design, confirmed in H.6); a non-Unity Playbook
page has no equivalent section at all, verified live on ASML.
**Why it matters:** This is arguably the core "understand your
investment" promise of the product, and today it is fulfilled for
exactly one company.
**Type:** New capability (H.0 explicitly ruled this out of Phase H's
scope, correctly — this is a scoping decision surfacing as a product
gap now that Phase H is otherwise complete, not a bug).
**Effort/dependency:** High, but H.5's AI Evidence Brief is a natural,
already-built starting point — it currently summarizes only structured
Momentum/Fundamentals scores; extending its remit (a real product/model
decision, not an implementation detail) toward genuine company research
would need its own explicit scoping pass.
**If nothing changes:** Every non-Unity Playbook stays evidence-thin on
exactly the dimension — "why do you actually own this" — that most
distinguishes an investing decision tool from a portfolio tracker.

### F4 — Placeholder and model-fit signals vanish after confirmation

**User problem:** A user cannot tell, on the page they actually live on
day to day, which numbers are real assessments and which are
compatibility placeholders or unclassified-fit scores.
**Evidence:** Live-observed: Valuation's "5/10 Neutral" is styled
identically to real Fundamentals/Momentum scores (no label, no
tooltip, only a missing expand-chevron as the sole differentiator);
Fundamentals' `modelFit` (CONFIRMED/LIMITED/UNKNOWN) — carried carefully
through the whole H.1 Proposal schema — has no representation anywhere
on the confirmed `Scorecard`/Signal Overview at all.
**Why it matters:** This directly contradicts the product's own stated
principle ("missing evidence must not become false certainty" — H.0
guardrail #8, Interface Principles §15) on the single screen a
beginner actually trusts for a decision.
**Type:** Model/data limitation intersecting with UX — the underlying
data (modelFit, placeholder status) already exists in the pipeline
(H.2 §8.1); it simply isn't surfaced past onboarding. Closer to UX
debt than a new capability.
**Effort/dependency:** Medium — mostly a `Scorecard`/`SignalScorecard`
UI change plus threading `modelFit`/placeholder-status through to the
confirmed page (the values already exist; H.2 §8.1 explicitly deferred
"making Scorecard fields capable of representing unknown" as future
work).
**If nothing changes:** Every non-Unity Playbook will keep presenting a
fabricated-neutral Valuation score with the same visual confidence as a
real one, indefinitely.

### F5 — Unity's own frozen copy references evidence that doesn't exist

**User problem:** The Trim Level 1 drawer's Primary Trigger reads "Price
/ valuation reaches the defined trim zone while portfolio concentration
remains above 50%" — naming a valuation-based condition as if it's
being actively evaluated, when no valuation evidence has ever existed in
this product (F1).
**Evidence:** Live-observed verbatim in Unity's Action Zone drawer this
session.
**Why it matters:** This is a concrete, first-hand case of the trust
principle in F4 failing in production copy, not just in theory — a
beginner reading this text has no way to know the "valuation" half of
that sentence is not actually checked by anything.
**Type:** Bug-adjacent (misleading hand-authored content) intersecting
with F1's real gap — the honest fix is either to stop implying an
active valuation check in the copy, or to build one.
**Effort/dependency:** Low to reword (a copy-only change to Unity's
seed); the real fix depends on F1.
**If nothing changes:** The most detailed, most-trusted explanation
surface in the product keeps making a claim about the system's own
capability that isn't true.

### F6 — ETF, crypto, and cash holdings get zero Playbook coverage, silently

**User problem:** A beginner with a normal, diversified portfolio (this
reference portfolio: 21% ETF+crypto, 6% cash) gets full decision support
for 71.6% of it and a dead, unexplained "No playbook" label for the
rest.
**Evidence:** Live-observed — clicking "No playbook" on VWRL/BTC/Cash
does nothing; no messaging anywhere explains that this is a permanent,
by-design limit rather than a temporary onboarding gap (which is
exactly what "No playbook" meant for ASML minutes earlier in the same
session).
**Why it matters:** The product's actual coverage of a realistic
portfolio is meaningfully less than 100%, and today nothing tells the
user that — it looks like an oversight, not a scope decision.
**Type:** New capability (STOCK-only was an explicit, correct guardrail
for Phase H — `docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md` guardrail #14
context) — but the *silence* about it is a UX debt problem that can be
fixed independently and immediately.
**Effort/dependency:** The UX fix (explain why, distinguish
"ineligible" from "not yet configured") is low effort. Actually
extending Playbook logic to ETFs/crypto is a much larger, separate
product decision (concentration/core-tactical math, stance rules, and
research all assume single-company evidence).
**If nothing changes:** A meaningful share of most real portfolios stays
permanently, silently unsupported.

### F7 — A stock's own transaction history is invisible after the first confirmation

**User problem:** A user who buys and sells shares of a non-Unity stock
cannot see that history anywhere on that stock's own page.
**Evidence:** Live-observed this session — a real BUY (12→15 shares) and
SELL (15→12 shares) against ASML do not appear in "Recent activity,"
which still shows only "Playbook created."
**Why it matters:** This is a basic expectation for any tool that lets
you record transactions — "what did I do and when" — and it silently
fails for every stock except the one with hand-seeded history.
**Type:** UX debt / incomplete feature — H.4's own changelog explicitly
scoped a "generic single-entry timeline" as a stated minimum, not a
finished feature; this finding confirms the concrete, immediate cost of
that scope reduction.
**Effort/dependency:** Low-medium — `applyTransactionToHoldings`
already runs on every BUY/SELL; this needs the transaction event to also
append a real timeline entry instead of only mutating `Holding`/`Cash`.
**If nothing changes:** Every non-Unity stock's transaction history
stays permanently invisible on the one page a user would look for it.

### F8 — AI-assisted research currently helps no one in this deployment

**User problem:** None of H.5's carefully-built trust/fail-soft AI
scaffolding is doing anything for a real user today.
**Evidence:** Live-verified this session — every AI call degrades to
"AI assistance isn't available right now" / "AI interpretation isn't
available right now," because no `ANTHROPIC_API_KEY` is configured. The
fail-soft path itself works correctly (confirmed via server logs and a
clean UI degrade) — this is an operational gap, not a design flaw.
**Why it matters:** Worth naming explicitly because it changes how this
review should be read: everything said above about AI's current *scope*
limitations (F3's "AI can't research, only interpret") is true
regardless of whether a key is configured, but AI's *potential* value
(explaining evidence, helping with "I'm not sure") is currently zero in
practice, not just scoped-down.
**Type:** Operational/config, not a product or model gap.
**Effort/dependency:** Trivial to turn on (set the env var); the
product-strategy question of whether/how to expand AI's remit (F3) is
separate and much bigger.
**If nothing changes:** H.5 remains real, tested, and completely unused
by any actual user of this deployment.

### Additional smaller observations (not given full write-ups)

- Dead "+ Research" header button — remove it or wire it to something
  real; a non-functional button is worse than no button.
- `ConcentrationMeter`'s overlapping/unrounded percentage text — small
  fix, disproportionate trust cost (a visible calculation glitch next
  to numbers the whole product asks you to trust).
- Hardcoded "Market data updated today, 16:15" regardless of actual
  fetch time — a small, easy, honest-labeling fix.
- Within-dimension contradictions (e.g. Unity's Operating margin 12/100
  next to FCF margin 95/100, both folded into one "Positive" Fundamentals
  score) aren't flagged, despite the product's own stated commitment to
  preserving contradictory signals at the aggregate level.
- Combined stance labels ("HOLD / GRADUALLY TRIM") could use one line of
  explanation of what the combination means.

---

## 4. Grouping

### Fix now (low effort, real user-visible cost today)

- F5 — reword Unity's Trim Level 1/2 copy so it stops implying an
  active valuation check that doesn't exist.
- F6 (UX half only) — explain, in-product, why ETF/crypto/cash show "No
  playbook" and distinguish that from "not yet onboarded."
- `ConcentrationMeter` overlapping/unrounded percentage text.
- Dead "+ Research" button — remove or repurpose.
- Hardcoded "updated today, 16:15" timestamp.

### Important next (real gaps this review validated, meaningful but bounded effort)

- F7 — give every confirmed stock a real, live-appended transaction
  timeline, not just Unity's seeded one.
- F4 — surface `modelFit`/placeholder-vs-real status on the confirmed
  Signal Overview, not only during onboarding.
- Decide F8 — turn AI on for real users (trivial), separately from
  deciding whether to expand its scope.

### Later / only if validated (genuinely new capability, needs its own product decision)

- F1 — a real Valuation evidence pipeline.
- F2 — Fundamentals archetype generalization / classifier.
- F3 — per-stock research/thesis capability (natural extension of
  H.5's Evidence Brief, but a distinct, larger scoping decision).
- F6 (capability half) — actual Playbook-equivalent support for
  ETFs/crypto, if validated as wanted rather than just explained better.
- Re-engagement/alerting (§2.1) and cross-holding awareness (§2.4) —
  real gaps, but neither was asked for by any user in this review; worth
  validating demand before building.

---

## 5. Open product questions before choosing Phase I

These are product-strategy forks, not implementation questions — Phase I
should not be scoped until at least the first three have an answer:

1. **Is Valuation a promise this product must keep, or should the UI
   stop implying it exists** (drop the row/label entirely for now)
   until a real pipeline is built? Leaving it as a silent "Neutral"
   placeholder is the one option this review found no good defense for.
2. **Should Fundamentals be honest about its current scope** ("built for
   growth-software companies; other archetypes coming") rather than
   silently returning "Not available" with no explanation of why?
3. **Is per-stock qualitative research a Phase I priority**, or does the
   product intentionally stay "the user brings their own thesis, the
   system brings the numbers" indefinitely? This is the single biggest
   lever on "research quality" and should be decided deliberately, not
   by default.
4. **Should the product's scope be explicitly "individual stocks only"**
   (and say so), or should ETF/crypto/cash coverage become a real goal?
   Today it is neither — it's an unexplained silent gap.
5. **Should AI's remit expand beyond "interpret existing evidence"**
   toward genuine research (filings, news, company context) — the thing
   that would actually move F1–F3 — or should the deterministic evidence
   gaps be closed first, with AI staying interpretation-only until they
   are? H.5 deliberately chose the conservative answer for v0.1; this
   review found real product pressure to revisit that choice, not a
   flaw in having made it.
