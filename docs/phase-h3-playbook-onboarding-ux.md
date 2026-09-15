# Phase H.3 — Playbook Onboarding UX (Design)

Status: **design only, no React implementation**. Source:
`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`,
`docs/phase-h0-playbook-onboarding-product-model.md`,
`docs/phase-h1-playbook-proposal-model.md`,
`docs/phase-h2-deterministic-strategy-mapping.md`,
`docs/PLAYBOOK_INTERFACE_PRINCIPLES.md`.

Existing UI reviewed directly: `AppShell`, `HoldingsTable`, `StockDetailClientShell`,
`PlaybookClientShell`, `StockHeader`, `PrimaryActionCard`, `PositionAndStrategy`,
`ActionZoneDrawer`/`ActionZoneSection`, `SignalScorecard`, `StanceBadge`,
`actionZoneConfig`, `AddTransactionModal`, `HoldingFormModal`.

---

## 0. What already exists, restated only where H.3 depends on it

- `/stocks/[ticker]` currently **404s** (`notFound()`) for any holding
  without a `StockPlaybookConfig` — Unity is the only configured stock
  today (`src/app/stocks/[ticker]/page.tsx:24-26`). There is no "no
  Playbook yet" screen anywhere in the product right now.
- `HoldingsTable`'s Playbook column already distinguishes the case: a
  `STOCK` holding with no config renders a static, non-interactive
  `"No playbook"` label (`HoldingsTable.tsx:145-146`) — nothing happens
  on click today.
- The confirmed-Playbook visual language is a vertical stack of white
  `rounded-lg border-stone-200` cards, uppercase
  `text-stone-400 tracking-widest` micro-labels, `StanceBadge`,
  semantic state colors (teal = positive/build, amber = watch/trim-1,
  orange = caution/trim-2/reduce, red = broken/exit, stone = neutral),
  and a fixed section order: `StockHeader` → `PlaybookStatusBanner` →
  `PrimaryActionCard` → `PositionAndStrategy` → `ActionZoneSection` →
  `SignalScorecard` → `ThesisCard`/`WhatChangesMyView`/`ResearchPreview`
  → `TimelinePreview` (`PlaybookClientShell.tsx:174-216`) — i.e. Decision
  → Reasoning → Evidence, exactly Interface Principles §1.
- Two existing modal/drawer patterns already establish motion and
  chrome conventions to reuse: a centered scale-in dialog
  (`AddTransactionModal`) and a right-edge slide-in drawer
  (`ActionZoneDrawer`), both using the project's `--ease-drawer`/
  `--ease-in`/`--ease-out` tokens, a scrim, and a top-right `×`
  (`lucide-react`'s `X`).
- H.2's compatibility-placeholder `Scorecard` values (§8.1) exist
  **only** to satisfy the legacy `ScoreItem` type once a config is
  persisted. They must never reach this onboarding UI — see §6.4.

---

## 1. Screen sequence

```
STOCK holding, no config
        │
        ▼
 "No Playbook" state (Stock Detail route, inside AppShell)
        │  [Create Playbook]
        ▼
 ── full-screen overlay, AppShell chrome suppressed ──────────────
        │
        ▼
 Intro                                            (brief, skippable by Continue)
        │
        ▼
 Q1 Investment Role
        │
        ├─(role = LONG_TERM_CORE)──▶ Q1a Core Protection
        │                                   │
        ▼◀──────────────────────────────────┘
 Q2 Confidence
        │
        ▼
 Q3 Current Intention
        │
        ▼
 Q4 Thesis trajectory
        │
        ▼
 Analyze  (portfolio context + live research evidence + guardrail check)
        │
        ▼
 Proposed Playbook — Review        (Playbook visual language, not a questionnaire)
        │
        ├─(any HARD discrepancy)───▶ blocked, "Change your answer" → jumps back into Q1–Q4
        ├─(SOFT discrepancy)───────▶ requires explicit acknowledgment
        ▼
 Confirm
        │
        ▼
 ── overlay closes ────────────────────────────────────────────────
        │
        ▼
 Real Stock Detail page (StockPlaybookConfig persisted, full Hero Stack, live Engine)
```

5 or 6 questionnaire screens depending on Investment Role (the Core
Protection follow-up only exists for `LONG_TERM_CORE`) plus Intro,
Analyze, and Review — 8–9 screens total, matching "preferably one
meaningful question per screen" while keeping the whole flow short.

### 1.1 Entry point — design decision, stated plainly

`/stocks/[ticker]` is extended with a **third** outcome alongside its
existing two (`config` found → Hero Stack; holding missing/unpriced →
"Playbook unavailable", `StockDetailClientShell.tsx:71-89`): **holding
found, `assetType === "STOCK"`, no config** → a "No Playbook" state,
reusing the same back-link and minimal centered-text treatment as the
existing "Playbook unavailable" screen, with one addition — a primary
**Create Playbook** button. `HoldingsTable`'s "No playbook" cell becomes
a link to this same route instead of static text (mirroring exactly how
it already links to `/stocks/{ticker}` when a config *does* exist), so
there is exactly one entry surface, not two competing ones.

Rationale for landing on the Stock Detail route rather than opening the
overlay directly from the Portfolio table: it matches the phase plan's
own diagram (`Stock Holding → No Playbook → Create Playbook`, plan
line 17-19) as a **stock-level state**, not a table-row affordance, and
it gives a stable, linkable/bookmarkable URL for "this stock has no
Playbook yet" — useful if onboarding is closed partway through and the
user navigates back later.

### 1.2 The full-screen overlay mechanism — design decision, stated plainly

"Full viewport, temporarily removing normal app navigation" is achieved
as a **client-rendered full-viewport layer** (`fixed inset-0`, its own
stacking context above `AppShell`'s sidebar), mounted via local state on
the Stock Detail client shell — the same "modal state lives in the
page's client shell" pattern already used twice
(`PortfolioClientShell`'s `modal` state, `PlaybookClientShell`'s
`showModal`). This avoids inventing a second routing/layout mechanism
next to the one `AppShell` already owns, and keeps the whole onboarding
flow client-side and instant to open/close — no navigation, no new
Next.js route segment. `AppShell`'s sidebar is simply painted over, not
structurally removed; from the user's perspective the app chrome is
gone for the duration of onboarding, which is what the direction asks
for.

---

## 2. Questionnaire layout pattern

Every questionnaire screen (Intro, Q1, Q1a, Q2, Q3, Q4) shares one
layout:

```
┌──────────────────────────────────────────────────────────┐
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ×  │  ← thin top progress bar + close
│                                                            │
│                                                            │
│                     How do you see this                    │
│                        position?                           │
│                                                            │
│         This shapes how much of your portfolio we          │
│           think this stock should take up.                 │
│                                                            │
│        ┌────────────────────────────────────────┐          │
│        │  ●  A long-term core holding            │          │
│        │     You plan to hold this for years,     │          │
│        │     and it's meant to be one of your      │          │
│        │     bigger positions.                     │          │
│        └────────────────────────────────────────┘          │
│        ┌────────────────────────────────────────┐          │
│        │  ○  A growth position                    │          │
│        │     ...                                   │          │
│        └────────────────────────────────────────┘          │
│        ┌────────────────────────────────────────┐          │
│        │  ○  A smaller, tactical position          │          │
│        └────────────────────────────────────────┘          │
│        ┌────────────────────────────────────────┐          │
│        │  ○  I'm not sure — help me decide         │          │
│        └────────────────────────────────────────┘          │
│                                                            │
│                                          [ Continue → ]     │
└──────────────────────────────────────────────────────────┘
```

- **Column width**: narrow and centered (roughly matching
  `AddTransactionModal`'s `max-w-[480px]`, slightly wider — content is
  reading-first here, not form-dense).
- **Answer rows**: full-width selectable cards, `rounded-xl
  border-stone-200`, a radio dot, a bold short label line, one
  muted `text-stone-500` explanatory line underneath. Selected state:
  `border-teal-600` + `bg-teal-50/40`, matching the product's existing
  teal-as-affirmative convention (BUY button, ADD zone, StanceBadge
  `BUILD`). No numeric scores, no icons borrowed from
  `playbookIcons.ts` here — those belong to the *result* (Reasoning/
  Evidence layers), not to the *intent* questions, keeping the two
  registers visually distinct.
- **One "Continue" button**, bottom-right, disabled until an option is
  chosen. No "Back" button is drawn on screen 1; every subsequent
  screen gets a small `←` text link near the progress bar (not a
  full button) so the flow still reads as forward-moving.
- **"Help me decide" / "Help me assess" / "I'm not sure"** rows are
  styled identically to the other options (not visually demoted to a
  disabled-looking "skip" link) — Interface Principles §15 already
  warns against implying false precision or second-class treatment for
  honest uncertainty. Selecting one still enables Continue; the
  question simply remains unresolved (§4).

### 2.1 Progress indicator

A single thin bar at the very top (not "Step 3 of 7" text), filled
proportionally to `questionsAnswered / questionsRemainingEstimate`.
Because Q1a is conditional, the denominator is recomputed the moment
Investment Role is answered (4 or 5 questions after Intro) rather than
committing to a number before that's known — this keeps the bar
monotonic and avoids a visible "jump backwards" once the true count is
known. No numeric label anywhere; the bar communicates "you're
progressing" without the precision-of-a-fixed-form feeling the
direction explicitly asks to avoid.

### 2.2 Close behavior

`×` top-right on every screen, including Analyze and Review. Clicking
it **discards** the in-progress proposal immediately (no confirmation
dialog) and returns to the "No Playbook" Stock Detail state. No draft
is persisted across a close — reopening **Create Playbook** later
starts over. This mirrors the existing precedent of
`AddTransactionModal`/`HoldingFormModal`, neither of which persists a
draft either, and keeps this design from introducing a new persistence
concept (a saved partial `PlaybookProposal`) that no phase before H.3
scoped. If real usage later shows this is frustrating, a draft-save
capability is a small, additive follow-up — not a reason to add
complexity here.

---

## 3. Question content

Wording throughout speaks in the user's language, never engine/type
names (`Strategy`, `ActionZone`, `ThesisHealth`, `Stance`, hard
constraint codes) — Interface Principles §15 / H.0 guardrail #12.

### Intro

> **Let's build a Playbook for {companyName}.**
> A few short questions about how you think about this investment —
> then we'll show you a proposed Playbook based on your answers and
> your portfolio.
>
> [ Start → ]

### Q1 — Investment Role

> **How do you see this position?**
> This shapes how much of your portfolio we think this stock should
> take up.

| Option | Sub-text |
|---|---|
| A long-term core holding | You plan to hold this for years, and it's meant to be one of your bigger positions. |
| A growth position | You believe in this company's growth and want meaningful exposure, without making it a cornerstone. |
| A smaller, tactical position | You're testing the idea or taking a smaller, opportunistic stake. |
| I'm not sure — help me decide | We'll suggest a starting point you can revisit any time. |

*(→ `InvestmentRole`: `LONG_TERM_CORE` / `GROWTH` / `TACTICAL` /
unresolved)*

### Q1a — Core Protection (only if Q1 = "A long-term core holding") — RESOLVED

> **How much of this do you think of as permanent?**
> Some investors keep a portion they never plan to sell, no matter what
> happens short-term. Marking that portion protects it from your
> Playbook's trim suggestions later on.

| Option | Sub-text | Maps to `fractionOfCurrentHolding` |
|---|---|---|
| Most of it | A small part could flex; most is permanent. | 0.75 |
| About half | Half core, half open to tactical moves. | 0.50 |
| A smaller part | Only a portion is truly long-term. | 0.25 |
| I'm not sure yet | We'll leave this open — you can decide before this applies. | *(none — stays unresolved)* |

Three coarse, evenly-spaced buckets — not four: **"All of it" is
deliberately removed** (§11). No custom percentage or share-count input
is offered in v0.1 — a user whose intent doesn't fit one of the three
buckets still has "I'm not sure yet," which stays honestly unresolved
rather than forcing a false-precision choice.

This is the one beginner-facing question H.0 called for in place of a
raw `coreSharesMin`/`Max` input. The answer wording is UX copy in this
document's scope; the fraction each answer maps to is a named,
versioned v0.1 product-policy hypothesis (`RULESET.strategyDefaults
.corePortionBuckets`, alongside H.2's other versioned constants), not a
universal investment rule or a recommendation — approved in §11.

*(→ `CorePortionInput`: `PROVIDED` with the chosen fraction, or
`MISSING` for "I'm not sure yet")*

### Q2 — Confidence

> **How confident are you in this investment?**
> Be honest — this isn't about being right. It helps the Playbook know
> how much doubt or volatility to expect from you.

Options: **High** / **Medium** / **Low** / **Help me assess**

### Q3 — Current Intention

> **What do you want to do with this position right now?**
> This is your starting intention — later we'll flag if it looks at
> odds with your actual portfolio.

Options: **Build the position** / **Hold what I have** / **Gradually
reduce it** / **I'm not sure**

### Q4 — Thesis trajectory (always asked, never conditional)

> **Have your reasons for owning this changed?**
> Think back to why you first bought it. Do those reasons still hold
> up today?

Options (exact H.1-approved mapping): **Getting stronger** / **No
meaningful change** / **Some doubts** / **Getting weaker** / **My
original reasons no longer hold** / **I'm not sure**

### 3.1 Branching rule when Investment Role is left unresolved

If Q1 = "I'm not sure — help me decide," Q1a (Core Protection) is
**skipped** — there is nothing to make conditional on yet, so treating
it as `NOT_APPLICABLE` for flow purposes is the only coherent choice.
`investmentRole` itself remains unresolved and still blocks
confirmation at Review (§5) regardless of this skip — skipping Q1a
does not silently resolve Q1.

---

## 4. Analyze transition

A brief, real (not simulated) loading screen — it is genuinely waiting
on the same live evidence fetches the confirmed Stock Detail page
already performs server-side (`fetchLiveMomentumResult`,
`fetchLiveFundamentalsResult`, both already fail-soft: never throw,
resolve to "no data" on any failure per Phase D/E precedent).

```
┌──────────────────────────────────────────────┐
│                                          ×    │
│                                                │
│              Building your proposal            │
│                                                │
│   ✓  Understanding what you told us            │
│   ✓  Checking your portfolio                   │
│   ⋯  Gathering market evidence                 │
│                                                │
└──────────────────────────────────────────────┘
```

Three checklist rows, each turning from a spinner to a checkmark as it
resolves — deliberately not a single generic spinner, so the screen
itself teaches the "what you told us → what the system knows → what we
propose" transition the direction calls for, rather than only implying
it. If market evidence fails or is slow, its row simply shows
"Not available" rather than blocking — the flow always continues to
Review; missing evidence is a normal, honestly-representable outcome
(H.0/H.1), never a failure state for the onboarding flow itself.

---

## 5. Proposed Playbook — Review

Structurally distinct from the questionnaire: no progress bar, no
option cards. Same overlay, same `×`, but the content column widens
(closer to the confirmed Playbook page's card-stack width) and switches
to the existing Playbook visual language wholesale — reusing card
chrome, micro-label style, `StanceBadge`, `concentrationStyle`,
`ConcentrationMeter` — so a user who later sees the real Playbook page
recognizes the shapes.

Section order follows Interface Principles §1 (Decision → Reasoning →
Evidence), adapted for a **preview of a not-yet-confirmed proposal**:

```
┌─────────────────────────────────────────────────────────────┐
│ ← Edit answers                                          ×   │
│                                                               │
│  [T]  Company Name · TICKER · Exchange                       │
│       €123.45 · 250 sh · 12.3% of portfolio (today)           │
│                                                               │
│  WHAT YOU TOLD US                                             │
│  Long-term core · ~75% permanent · High confidence ·          │
│  Build the position · Reasons unchanged            [Edit]     │
│                                                               │
│  ⚠ Thesis: not resolved yet — this must be answered  [Decide] │  (only if unresolved fields remain)
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│                                                               │
│  RECOMMENDED HOLDING (PROPOSED)                                │
│  Current holding            250 shares                        │
│  Recommended holding         ≈340 shares                       │
│  Target range 20–30% of portfolio · Buy up to 35%              │
│  ┌──────────────────────────────┐                              │
│  │ ██████████░░░░░░░░░░░░░░░░░░ │  Within target                │
│  └──────────────────────────────┘                              │
│                                                               │
│  (if a discrepancy exists — see §6 — it renders here,          │
│   between Decision and Reasoning, never as a form error)       │
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│                                                               │
│  REASONING                                                     │
│  Fundamentals        Positive         Model fit: Limited ⓘ     │
│  Momentum            Not available                             │
│  Valuation           Not available                             │
│  Thesis (your answer) Reasons unchanged → Intact                │
│  Position fit        —  (depends on confirming this Playbook)   │
│                                                               │
│  ▸ See evidence detail                                         │
│                                                               │
│                              [ Back ]   [ Confirm Playbook ]   │
└─────────────────────────────────────────────────────────────┘
```

### 5.1 "What you told us" strip

A single compact row of plain-language chips, one per answered
question, in question order. Each has a small inline **Edit** control
that jumps straight back into that specific questionnaire screen
(pre-filled with the existing answer) and returns to Review afterward —
not a restart of the whole flow. An unresolved answer renders as its
own visually distinct (amber, `⚠`) row with a **Decide** link instead of
being silently folded into the summary line — directly enforcing "Not
sure" never becomes a silent default, made visible at the one screen
where the user is about to confirm.

### 5.2 Decision layer — Recommended Holding stays primary

This section is the direct proposal-preview analog of the confirmed
page's `PrimaryActionCard` "Current holding → Recommended holding"
line (Interface Principles §3) — computed the same way (target
allocation range + resolved core position, per H.2 §2/§3), rendered
with the same "current → recommended, strategic destination, not an
order" framing, labeled **(proposed)** so it's never mistaken for a
live, confirmed recommendation. `concentrationStateIfConfirmedNow`
(H.1) drives the same `concentrationStyle`/`concentrationLabel` badge
and `ConcentrationMeter` bar already used on the real page — literally
the same component, fed proposal data instead of live engine data.

No `ActionZone`/Primary Action card is shown here — there is no
confirmed `Stance` yet, and inventing a pre-confirmation "primary
action" would blur exactly the confirmation boundary H.1 built
`ProposalField` to protect. What *is* shown is a single generic line
naming the zone the proposal would start in — **stated as fact, not
probability**, whenever it is genuinely computable:

- **When `portfolioContext.valuation.state === COMPLETE`** (the only
  case in which `concentrationStateIfConfirmedNow`, and therefore
  `deriveActionZoneState`, has real numbers to work from) — by the time
  Confirm is reachable at all, every required user answer is resolved
  (§6.1 blocks otherwise), so the same deterministic function the real
  Engine uses can be run directly against the proposed `Strategy` +
  resolved `ThesisHealth` + `concentrationStateIfConfirmedNow`. The
  result is **not a guess** and must not be hedged with "likely" —
  render it plainly: "This would start in your **Hold** zone" /
  **Add** zone / etc.
- **When valuation is `PARTIAL` or `UNAVAILABLE`** — concentration
  state genuinely cannot be classified (G.1's own rule: PARTIAL
  valuation never feeds concentration/Playbook inputs), so this line
  is honestly unavailable, not estimated: "Which zone this would start
  in isn't known yet — your portfolio's valuation is incomplete right
  now," mirroring the wording `StockDetailClientShell`'s existing
  "Playbook unavailable" state already uses for the identical
  underlying condition, rather than inventing new phrasing for the
  same fact.

The earlier draft of this section used "would likely start in" for
every case, which understated a computation that is actually
deterministic whenever it can run at all, and had no answer for the
PARTIAL/UNAVAILABLE case — corrected above.

### 5.3 Reasoning layer

Same six-row shape as `SignalScorecard`, same semantic-state-first
language (Positive/Neutral/Weak/Elevated/Intact), but **reads directly
from `ResearchEvidence`, not from any placeholder `Scorecard`** — see
§6.4. `positionFit`/`concentrationRisk` rows show `—` with a short
note ("depends on confirming this Playbook") rather than a score,
since both are meaningless before a `Strategy` exists to measure
against.

The Fundamentals row carries its model-fit tag as a **separate, visually
secondary** element next to (never blended into) the state pill — an
`ⓘ` affordance reveals one sentence explaining what "Limited fit" means
in plain language on hover/tap. This is the direct UI expression of
H.0/H.2's "model fit is independent of score and coverage" rule.

### 5.4 Evidence layer

"See evidence detail" expands using the exact same progressive-
disclosure interaction `SignalScorecard` already has (component rows,
"Not available" for missing components, coverage percentage) — no new
pattern invented.

### 5.5 Footer

**Back** (returns to Q4, the last questionnaire screen — a linear
undo, not a jump) and **Confirm Playbook** (primary, teal, matching
the product's `BUY`/affirmative color). Disabled whenever any required
field is unresolved or any `HARD` discrepancy is present (§6).

---

## 6. Discrepancy, unresolved-answer, and missing-evidence states

All three are **explanatory, not form validation** — no red input
borders, no generic "This field is required" text anywhere in this
flow.

### 6.1 Unresolved answers ("Not sure" / "Help me decide" / "Help me assess")

Rendered in the "What you told us" strip (§5.1) as its own amber row
with a one-line explanation of *what* remains open and a **Decide**
link — never merged into the summary sentence, never silently treated
as the nearest default (e.g. "Not sure" on Thesis never renders as if
it were "No meaningful change"). Confirm stays disabled while any exist.

### 6.2 HARD discrepancies

Rendered as a distinct callout card between the Decision and Reasoning
sections — deliberately positioned where the user is looking at the
proposed position, since that's what the conflict is about:

```
┌───────────────────────────────────────────────────┐
│  This doesn't quite add up yet                      │
│                                                       │
│  You said you want to build this position, but it's  │
│  already above the level your proposed strategy       │
│  would allow buying more at (35% ceiling; you're at    │
│  38.6%).                                              │
│                                                       │
│  [ Change your answer ]                               │
└───────────────────────────────────────────────────┘
```

Its message is exactly H.2 §6.1's deterministic template, filled with
live numbers — never freeform, never AI-authored. The single action
jumps directly to the conflicting question (`Current Intention` in this
example). **Confirm Playbook stays disabled** until the user actually
changes that answer (H.2 §6.2 — Hard discrepancies have no
acknowledgment path).

### 6.3 SOFT discrepancies

A calmer, stone/amber-toned card with the same message-template
discipline, but instead of a single blocking action it ends in an
explicit checkbox:

```
┌───────────────────────────────────────────────────┐
│  Worth double-checking                               │
│                                                       │
│  You said you want to gradually reduce this position, │
│  but it's currently within your proposed target range │
│  already.                                             │
│                                                       │
│  ☐ I understand — continue anyway                     │
└───────────────────────────────────────────────────┘
```

Confirm stays disabled until the box is checked — an explicit,
recorded acknowledgment (H.2 §6.2), not merely having scrolled past it.

### 6.4 Missing evidence — never Neutral

The Review screen's Reasoning layer (§5.3) reads live `ResearchEvidence`
directly (`SCORED` / `INSUFFICIENT_DATA` / `MISSING`), rendering
"Not available" for anything not `SCORED` — **it never reads the
persisted `Scorecard`'s compatibility-placeholder value** (H.2 §8.1),
because that placeholder exists solely to satisfy the legacy
`ScoreItem` type at materialization time and has no business appearing
pre-confirmation, where the honest, ungated evidence status is directly
available. Valuation in particular always renders "Not available" here
— never a "Neutral" pill — since no deterministic valuation pipeline
exists for any stock (H.0 §0.3, H.2 §8).

Once confirmed, the *real* Stock Detail page's `SignalScorecard`
behaves exactly as it does for Unity today: the placeholder score
renders, but only ever alongside its true status metadata, per H.2
§8.1's existing rule. H.3 does not change that component or its rule —
it only makes sure the *pre-confirmation* Review screen never reaches
for the same placeholder before it has any reason to exist.

---

## 7. Confirmation behavior

**Confirm Playbook** performs H.2's deterministic mapping
(`PlaybookProposal → StockPlaybookConfig`) synchronously — no network
call, since every input (user answers, portfolio context, already-
fetched research evidence) is already in hand. The overlay then shows a
brief (under a second) success transition — "Playbook created" with a
checkmark, matching Interface Principles §14's "motion should aid
comprehension of meaningful state changes" — before closing and
returning the user to `/stocks/{ticker}`, now rendering the full,
unmodified Hero Stack UI via the existing live Engine pipeline
(`StockDetailClientShell` → `toStockEngineInputs` → `runDecisionEngine`
→ `PlaybookClientShell`). No proposal-preview value computed during
Review is reused past this point — the live Engine recomputes
everything from the persisted `StockPlaybookConfig`, exactly as it
already does for Unity, keeping Engine as the sole decision source of
truth (guardrail #2).

---

## 8. ActionZone copy principles for newly onboarded stocks

Directly operationalizes H.2 §9's parameter contract into UI copy
rules, for the zones a newly confirmed `StockPlaybookConfig` will show
on the real Stock Detail page (not shown as full zone cards during
onboarding — only previewed in outline, §5.2):

- Every zone's `title`/`summary`/`whyBullets` is built from a **fixed
  template per `(zoneType, zoneState)`**, substituting only values the
  Engine already computes (current weight, target shares, ceiling %,
  trim levels) — never a per-stock hand-typed sentence, so it can never
  go stale the way Unity's frozen copy already has.
- Templates draw only on kinds (1) generic boilerplate and (2) live
  numeric facts (H.2 §9.2) — e.g.:
  - **ADD** (`ACTIVE`): "Buying more would move you toward your
    {targetSharesLabel}-share target. You're currently at {weightPct}%,
    within your {maxAllocationPct}% target range."
  - **HOLD** (`ACTIVE`): "No action needed right now — your position
    sits within its target range."
  - **TRIM_1**/**TRIM_2**: "Selling {levelShares} shares would bring you
    back toward your {maxAllocationPct}% target."
  - **THESIS_REVIEW**: "Your thesis needs a fresh look before any other
    action makes sense."
- **Never generated**: any sentence implying analytical judgment about
  the company itself ("valuation looks stretched," "earnings momentum
  is fading") — H.2 §9.2's kind (3) category has no deterministic
  source and is simply absent for these stocks, not approximated.
  Unity's existing hand-typed zones may keep this richer language for
  now (H.0 §15 — not redesigning what already works); a newly onboarded
  stock's zones will visibly look plainer, which is the honest
  consequence of not fabricating analysis that doesn't exist yet.
- Missing evidence is never woven into zone prose as if it were a
  neutral fact ("momentum is steady") — if a template would otherwise
  reference momentum/fundamentals/valuation and that evidence is
  missing, the template omits that clause entirely rather than
  filling it with a placeholder value.

---

## 9. Guardrail and instruction compliance checklist

| Requirement | How this design satisfies it |
|---|---|
| Beginner language, not domain terms | §3 — every question/option in plain English; no `Strategy`/`ActionZone`/`ThesisHealth`/HC-codes surfaced |
| Don't ask what Portfolio already knows | §3 — no shares/cost/weight/cash question anywhere; all sourced from `portfolioContext` |
| "Not sure" never silently defaults | §3 options always offered at parity; §5.1/§6.1 keep it visibly unresolved and blocking |
| What-you-told-us → what-system-knows → what-we-propose | §4 (Analyze checklist) then §5 (Review's "What you told us" → Decision/Reasoning/Evidence) |
| Review is not another questionnaire | §5 — different layout system entirely, reusing confirmed-Playbook chrome |
| Decision → Reasoning → Evidence preserved | §5.2 → §5.3 → §5.4 |
| Recommended Holding stays primary | §5.2 |
| Discrepancies explanatory, not form errors | §6.2/§6.3 — prose callouts with a single clear action, never inline field errors |
| HARD blocks, SOFT requires acknowledgment | §6.2/§6.3, directly implementing H.2 §6.2 |
| Missing ≠ Neutral | §6.4 — Review reads raw evidence status, never the compatibility placeholder |
| Model fit secondary and separate | §5.3 — distinct tag next to, never blended into, the state pill |
| Deterministic, generic ActionZone copy | §8 |
| No pixel-perfect spec / no new design system | Uses only existing tokens, colors, and component shapes throughout |

---

## 10. Design judgment calls made without stopping (stated for visibility, not blocking)

Per this task's instruction to use judgment for copy and minor visual
details and stop only on genuine product/UX decisions, the following
were decided directly rather than asked about — each is easily
reversible and doesn't touch the deterministic domain model from
H.1/H.2:

1. Entry point is the Stock Detail route's new "No Playbook" state
   (§1.1), not a Portfolio-table-triggered overlay.
2. The overlay is a client-rendered full-viewport layer, not a new
   routed page (§1.2).
3. No draft persistence — closing discards progress (§2.2).
4. Unresolved Investment Role skips the conditional Core Protection
   question rather than blocking further progress (§3.1).
5. The Review screen's four answer-summary/discrepancy/evidence
   copy templates (exact prose, not the underlying data they render).

None of these touch the resolved H.2 numeric policies (role
allocation ranges, ceiling buffer, core band width, discrepancy
severities) — those are simply consumed as-is. The Core Protection
answer-to-fraction mapping was **not** in this list — see §11: it was a
new numeric input rule, not copy, and required explicit sign-off before
H.4 could rely on it. That sign-off is now recorded below.

---

## 11. PRODUCT/MODEL DECISION — RESOLVED

### Core Protection answer → `fractionOfCurrentHolding` mapping

**Approved mapping (v0.1, named/versioned policy hypothesis, not a
universal investment rule or recommendation):**

| Answer | Fraction |
|---|---|
| Most of it | 0.75 |
| About half | 0.50 |
| A smaller part | 0.25 |
| I'm not sure yet | *(unresolved — no number, never silently defaulted)* |

**"All of it" is removed** from the beginner-facing options (§3, Q1a)
— Core Protection represents the portion of the current holding the
user wants to preserve as a long-term protected core, not a precise
allocation calculation, and a fourth "100%" bucket implied a precision
this question isn't meant to carry. Three coarse buckets were chosen
deliberately over four or a continuous input:

- easy for a beginner to reason about at a glance;
- avoids implying false precision in what is fundamentally a fuzzy,
  personal judgment;
- preserves visible room between the protected core and the tactical
  (non-core) portion of the same holding, which a "100% protected"
  answer would collapse to zero;
- composes naturally with H.2's existing ±8% core band (§3 of that
  document) — e.g. "About half" of 1,000 shares centers at 500, banded
  to roughly 460–540, a sensible range regardless of position size.

**No custom percentage/share input is added in v0.1** — a user whose
intent falls outside the three buckets uses "I'm not sure yet," which
stays honestly unresolved (§6.1) rather than forcing a falsely precise
choice.

**Relationship to H.2, restated:** H.2 §3 only defines what happens
*after* a fraction exists (`coreCenterShares = fractionOfCurrentHolding
× currentShares`, then the ±8% band) and never specified how a
qualitative answer produces one — this decision fills exactly that
gap, as its own named v0.1 constant
(`RULESET.strategyDefaults.corePortionBuckets`), consistent with but
independent from H.2's own versioned numbers.
