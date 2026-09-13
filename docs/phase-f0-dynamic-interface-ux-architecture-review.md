# Phase F.0 — Dynamic Product Interface UX Architecture Review

Status: REVIEW / DESIGN ONLY. No component changed, no engine model
changed. This is a product review of the *existing, live* stock-detail
page — every finding below is grounded in the actual current source
(`src/components/playbook/*`) and a live render of
`http://localhost:3001/stocks/U`, not a hypothetical redesign.

## Why now

The engine has grown fast (D.0–D.5 momentum, E.1–E.8 fundamentals) while
the interface has not been revisited since it was still a mostly-static
mock. The page now genuinely mixes live, partial, and static-seed data —
but visually treats all of it identically. That gap, not any single
missing feature, is this review's central finding.

## Primary user goal (the test every section below is measured against)

> A beginner investor opens a stock and needs to quickly understand:
> 1. What is my situation?
> 2. What should I do?
> 3. Why?
> 4. What should I watch next?

## 0. What the page currently is, in rendering order

1. Ticker/price header + Transaction/Research buttons
2. Playbook banner — stance headline, thesis badge, confidence, a static
   summary sentence, two dead buttons ("Why this stance?", "View changes")
3. Two side-by-side cards — **My position** / **Portfolio fit**
4. **Your Action Framework** — 5 always-visible zone cards (ADD / HOLD /
   TRIM-1 / TRIM-2 / THESIS REVIEW), each collapsible into a detail drawer
5. **"Why this stance?"** — a second, full section with this exact same
   heading, plus a dead "See evidence" button
6. **Signal overview** — 6 score rows (Fundamentals, Valuation, Momentum,
   Thesis health, Position fit, Concentration risk) + a 3-column
   conclusions strip
7. **Investment thesis** — horizon, thesis text, Catalysts / Risks /
   Thesis breakers (3 columns)
8. **What would change my view?** — bullish / cautious bullets
9. **Latest research** — 2 static document rows
10. **Recent activity** — transaction timeline
11. Add Transaction modal (on demand)

Every one of these is an independently bordered white card of roughly
equal visual weight. Nothing on the page is visually marked as *the*
answer.

## 1. Information hierarchy

**What belongs above the fold** (mapped directly to the 4 questions):
a one-line situation summary (price, position value, return, weight),
the decision (stance) in plain language with **one** concrete next
action, the top 2–3 reasons behind it, and a "watch next" flag. That is
roughly four short blocks. Today, section 2 (situation) is split across
the header *and* two separate cards (3), the decision is stated once in
the banner but re-litigated by 5 always-open action-zone cards (4), and
"why" is answered nowhere near the decision — it's a scroll away, in a
duplicate-titled card, and disconnected from it.

**What should be secondary/detail**: the full Signal overview breakdown,
per-dimension momentum/fundamentals detail (not currently shown at all
— see §4), the core/tactical/target-shares math, the thesis
catalysts/risks/breakers essay, research documents, and the full
transaction timeline. These are all things a user consults *after*
getting the headline answer, not things that should compete with it for
first-screen attention.

**What should not be exposed directly, at any tier**: raw engine
identifiers and internal vocabulary. Confirmed present today:
`"HC001"`/`"HC002"` codes rendered verbatim inside the ADD zone drawer's
"why inactive" list, and `"HC-003 — Core position constraint"` rendered
verbatim as a warning heading in the Add Transaction modal. These are
Decision Engine constraint codes, not product language — a beginner (or
anyone) has no way to know what "HC001" means without reading the
source. Latent risk, not yet triggered: component keys
(`revenueGrowth`, `rsi`, ...), status enums (`MISSING`,
`NOT_APPLICABLE`, `INSUFFICIENT_DATA`), and raw `score100`/weight
fractions are sitting in `EngineOutput.momentumResult`/
`fundamentalsResult` completely unused by the UI today (§4) — exactly
the shape someone would naively dump verbatim if asked to "show the
detail" later. Any future drill-in must translate every one of these to
plain language before it reaches a screen; none should ever appear as
raw identifiers.

## 2. Decision vs. evidence

The page currently gives evidence **equal or greater** visual weight
than the decision it's supposed to support. The **Signal overview**
card — six raw 1–10 scores with progress bars, immediately below the
Action Framework — is a second, unexplained dashboard a user must
self-interpret into "so what do I do." Nothing frames *why* these six
numbers matter or how they relate to the stance already stated above.
Worse, its bottom "conclusions" strip
(`Company attractiveness: High / Valuation: Elevated / Position fit: Poor`)
is **hardcoded JSX text with no data binding at all** — confirmed
directly in `SignalScorecard.tsx`: those three strings never read from
`scorecard` or any prop. It will always show "High / Elevated / Poor"
regardless of the real state. That's not just unhelpful — it's a
conclusions panel that is *definitionally* incapable of being correct
except by coincidence.

The Action Framework compounds the same problem in the other direction:
five zone cards are shown as if the user must survey a whole framework
and figure out which applies, when in fact only one stance is active at
a time. The evidence *for* that one applicable zone is what belongs on
screen; the other four are legitimately secondary (a beginner does not
need to see "TRIM-2" and "THESIS REVIEW" cards to understand what to do
today).

**Where evidence should sit**: directly underneath/inside the decision,
as 2–3 plain-language reasons ("Revenue growth is strong and
accelerating", "You're above your target portfolio weight"), each
optionally expandable to the underlying number — not as a parallel,
equal-weight dashboard the user has to reconcile against the decision
themselves.

## 3. Portfolio context

Taken alone, **My position** / **Portfolio fit** are two clear, well-
labeled cards. Three problems surface once they're read against the
rest of the page:

- **The same fact is shown twice, and the two instances disagree.**
  The position card computes and displays `+45.8%` return (from the
  live `unrealizedReturnPct: 45.75`, rounded). The static
  `whyThisStance` seed copy — rendered in its own card further down —
  says `"Position is meaningfully profitable (+45.7%)"`. Same
  underlying fact, two places, two different numbers, confirmed live.
  This is exactly the kind of small inconsistency that quietly erodes
  trust in every other number on the page once a user notices it.
- **Concentration risk is shown twice** — once as a badge/meter inside
  Portfolio fit, once as a `"2/10 Elevated"` row inside Signal overview
  — with two different visual languages (a labeled badge+bar vs. a
  generic score row) for one fact.
- **The engine already computes a newer, more complete position model
  (`EngineOutput.targetPosition`, spec §21A) that the UI never reads.**
  The page still displays the older concentration-only target-shares/
  core-tactical math. Two overlapping mental models exist inside the
  engine today; only one reaches the screen. That's fine *as long as
  it's a deliberate, documented choice* — right now it looks like an
  oversight, not a decision.

**How these should relate visually**: current shares, target, core
range, and trim capacity describe *one* underlying idea — "where you
are on a spectrum from too-small to too-large" — and would communicate
far better as a single position gauge/range visual (current position
marked against core-min/core-max/target/hard-cap) than as three
separate numeric blocks a reader has to mentally combine.

## 4. Momentum + Fundamentals

This is the area most exposed to **false precision**, and it's the
newest live data on the page. Today both dimensions collapse to a
single number in Signal overview (`Momentum 7/10 Positive`,
`Fundamentals 7/10 Positive`) with **zero indication of evidence
coverage**. Fundamentals' live Unity result (Phase E.8) is `SCORED` at
75% `availableWeightShare` — 2 of 7 components (`guidance`,
`balanceSheet`) are `MISSING` — and momentum can just as easily land at
partial coverage on a thinner-history instrument. A bare "7/10" implies
identical confidence whether it's built on 7-of-7 or 4-of-7 available
signals. There is also currently **no way to tell live from fallback**:
`runDecisionEngine` silently uses the static seed value whenever
`momentumResult`/`fundamentalsResult` is absent or `INSUFFICIENT_DATA`
— visually indistinguishable from a genuine live `SCORED` result. A
user has no way to know, from the screen alone, whether "7/10" is a
fresh computation or last week's seed fallback.

Recommended shape for this (a future design/implementation phase, not
decided here): the score and state should *always* render with a
lightweight coverage qualifier whenever coverage is < 100% (e.g. "based
on 5 of 7 signals"), and every score should carry a plain visual tag for
its provenance (live vs. not-yet-available) rather than looking
uniformly authoritative. Component-level detail (the seven fundamentals
dimensions, six momentum dimensions) should exist behind an explicit
drill-in, using plain-language dimension names — never the raw
`component.key` strings, `status` enum values, or `score100` — mirroring
the collapse-then-drawer pattern the Action Zone cards already use
correctly. Consider whether the primary display should even be a bare
integer: a coarser band (e.g. Strong / Solid / Mixed / Weak) communicates
less false certainty than "7/10" for a heuristic, partial-evidence score,
with the number available as secondary detail for anyone who wants it.

## 5. Progressive disclosure

The codebase already contains one genuinely good progressive-disclosure
pattern — `ActionZoneCard` collapses to a state badge + one summary
line, expanding to a full drawer only on click. That pattern is not
applied anywhere else: `WhyThisStance`, Signal overview, the thesis
essay, and the catalysts/risks/breakers lists are all fully expanded,
always, regardless of whether the user asked for that depth. The fix
here is largely **consistency, not invention**: apply the existing
collapse → drawer template to Momentum, Fundamentals, and "Why" instead
of leaving Action Zones as the one place that gets it right.

A beginner's first screen should be short: situation, decision, top
reasons, one watch-next flag. Everything else — full scorecard with
component drill-in, full portfolio math, thesis detail, research
documents, transaction history — should be one deliberate tap away, not
pre-expanded. Nothing here needs to be deleted or hidden permanently;
almost every current card earns a place in the *detail* tier.

## 6. Current UX problems (concrete)

**Duplication**
- "Why this stance?" appears as both a banner button and a full
  section heading — two separate, both-inert affordances for the same
  idea.
- Concentration risk appears in both Portfolio fit and Signal overview.
- Position return appears twice with **conflicting values** (+45.8%
  live vs. +45.7% static) — a confirmed, live bug-as-UX-smell.

**Weak hierarchy** — the evidence dashboard (Signal overview) and the
decision (banner) compete for top billing rather than one supporting
the other; five action-zone cards are shown for one active stance.

**Jargon** — `HC001`/`HC002`/`HC-003` constraint codes leak verbatim
into the ADD drawer and the transaction modal; `SignalState` values
(`"Elevated"`, `"Intact"`) are reused across unrelated concepts
(concentration vs. thesis health) with no legend, so the same word means
different things in different rows of the same card.

**Unclear actions** — "Why this stance?", "View changes", and "See
evidence" all have no `onClick` handler. They render as buttons, invite
a tap, and do nothing. This damages trust in every other affordance on
the page, including the ones that do work (the zone-card drawers).

**Misleading confidence** — no visual distinction anywhere between a
live, current, evidence-backed score and a static seed fallback
(§4); the Signal overview's bottom conclusions strip is fixed text
presented as if freshly computed (§2).

**Excessive dashboard/card behavior** — roughly ten independently
bordered, equally-weighted white cards stacked vertically. No card is
visually "the answer." The page currently reads as a control panel to
be audited, not a briefing to be read.

## 7. Candidate information architectures

### Option A — Answer-first stack

**First-screen hierarchy**: (1) one-line situation strip — price,
position value/return, portfolio weight; (2) decision card — stance +
one concrete next action + an evidence-coverage qualifier; (3) why —
top 2–3 plain-language reasons, live-derived; (4) watch next — live-
derived from current `MISSING`/`INSUFFICIENT_DATA` evidence gaps and
proximity to a thesis-breaker, not static copy. Everything else (full
Action Framework, full Signal overview with drill-in, portfolio/position
detail, thesis essay, research, timeline) collapsed by default below
this block.

**Main user flow**: read top-to-bottom, get all four answers in one
short pass; tap any collapsed section only when more depth is wanted.

**Strengths**: maps 1:1 onto the stated primary goal — each question
gets exactly one dedicated slot in a fixed order; minimizes competing
cards; puts the coverage/false-precision fix (§4) right next to the one
number it qualifies; reuses the zone-card collapse/drawer pattern that
is *already proven correct* in this codebase, rather than inventing a
new interaction model.

**Risks**: needs new synthesis logic that doesn't exist yet — a single
"top reasons" deriver and a live "watch next" deriver both have to be
designed carefully (a later phase's scope) to avoid re-introducing the
static/live drift this review just flagged twice; collapsing so much by
default may feel like information is being hidden from a user who
currently expects the full dashboard on arrival.

### Option B — Two-tier Overview / Detail

**First-screen hierarchy**: a persistent situation+decision header
(same content as Option A's top block), followed by a segmented control
— **Overview** (default: why + watch-next + the one currently-relevant
action zone) vs. **Detail** (everything else: full Signal overview with
per-dimension drill-in, full portfolio/position math, thesis essay,
research, timeline).

**Main user flow**: land on Overview, get the four answers plus the one
relevant action; explicitly switch to Detail when evidence/dashboard
depth is wanted.

**Strengths**: a clean two-audience mental model that scales well as
more live detail gets added later (per-dimension momentum/fundamentals,
the `targetPosition` model) without further crowding page one; explicit
user choice rather than implicit scroll-based discovery; most of today's
existing cards move into Detail largely unchanged, so it's a smaller
migration than a full rewrite.

**Risks**: content behind a tab can go undiscovered — a beginner may
never find Detail, or an advanced/frequent user may resent an extra tap
for numbers they check daily; doubles the surface that must stay
consistent (two views of related data can drift from each other, the
same class of bug already found between the banner and the position
card); requires deciding what, if anything, is deliberately duplicated
across both tabs.

### Option C — Guided narrative sequence

**First-screen hierarchy**: four short, explicitly labeled sections
using the user's own questions as headers — "Your situation" / "What to
do" / "Why" / "What to watch" — each a brief plain-language passage,
followed by a single "Show full analysis" affordance that reveals
everything else as one continuous detail scroll.

**Main user flow**: read a short guided story top-to-bottom, answerable
in one glance per section; keep scrolling into "full analysis" only if
wanted.

**Strengths**: the most beginner-friendly framing — it literally answers
the stated questions, in the user's own words, in order; requires the
least new IA vocabulary (no tabs, no drawers to design) beyond writing
good synthesis copy per section.

**Risks**: the weakest option for a returning/advanced user who wants
fast, dense re-scanning of familiar numbers — narrative prose reads well
once but is slower to re-scan on a fifth visit than a compact layout;
"full analysis" as one long undifferentiated scroll risks silently
recreating today's exact problem if not sub-organized carefully; highest
temptation to leave sections as static hand-authored prose rather than
live-derived — the same trap this review already caught twice
(`WhyThisStance`, `WhatChangesMyView` are both 100% static today).

## 8. Recommended direction

**Option A — Answer-first stack.** It is the most direct match for the
stated goal (one slot per question, in the same order the goal states
them), it is the smallest structural change (a reordering and
consistent collapsing of content that mostly already exists, versus
Option B's new tab paradigm or Option C's prose rewrite), and it extends
a pattern this codebase has already proven works —
`ActionZoneCard`'s collapse-then-drawer — to the rest of the page
instead of introducing a second interaction model alongside it. Its one
real cost, the need for new "top reasons" and "watch next" synthesis
logic, is unavoidable under *any* of the three options (Option B needs
the same synthesis for its Overview tab; Option C needs it for its "Why"
and "What to watch" sections) — so it isn't a reason to prefer B or C,
just a dependency to scope explicitly into the next phase.

## Non-goals of this review

No visual design (color, type, spacing) proposed. No component written
or changed. No engine/domain-model change proposed or implied — every
finding above is about how already-computed data is (or isn't)
surfaced, never about changing what's computed. The two data-model gaps
noted in passing (`EngineOutput.targetPosition` and per-dimension
momentum/fundamentals detail going unused) are existing engine output,
not new engine work — wiring them into whichever IA is chosen is a
future implementation phase's scope, not this one's.
