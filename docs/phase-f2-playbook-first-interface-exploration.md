# Phase F.2 — Playbook-First Interface Design Exploration

Status: EXPLORATION ONLY. No production component changed, no engine/
domain model changed. Three isolated, interactive HTML prototypes were
built and published as private Artifacts — nothing here replaces or is
wired into `src/components/playbook/*` or `src/app/stocks/[ticker]/page.tsx`.

Source of truth: `docs/PLAYBOOK_INTERFACE_PRINCIPLES.md` (the approved
product model — Decision/Action → Reasoning → Evidence hierarchy, the
WAITING → READY TO ACT → ACT → CONFIRM lifecycle, one primary action,
the signal-light model, semantic states over `/10` scores) and
`docs/phase-f0-dynamic-interface-ux-architecture-review.md` (the audit
that motivated it — evidence outweighing decision, no live/fallback
distinction, dead affordances, jargon leaks).

All three concepts implement the **exact same product model and the
same six required states** — this exploration varies hierarchy,
composition, signal-light rendering, progressive disclosure, and
interaction texture only, per instruction ("not different product
models").

## Data used

Real, current Unity numbers — the same figures the live app renders
today, not invented placeholders:

| Fact | Value | Source |
|---|---|---|
| Current holding | 902 shares (avg cost €27.76, value €36,495, +45.8%) | `unity-seed.ts` / live position card |
| Recommended holding position | **650 shares** | `deriveTargetPosition`'s real `preferredTargetShares` output for Unity's actual core range (600–650) and current 58.6% weight — computed this session, not guessed |
| Trim capacity | preferred 252 shares | same computation — matches the app's existing "Tactical (above core): 252 shares" |
| Portfolio weight / target | 58.6% vs. 40–45% | live |
| Fundamentals | Positive, 75% evidence coverage (`guidance`, `balanceSheet` unavailable) | live E.8 `FundamentalsScoreResult`, converted to semantic per-component states via the engine's own score100→1-10 rounding rule |
| Momentum | Positive, 100% evidence coverage | live E.8 `MomentumScoreResult` (all 6 components AVAILABLE) |
| Thesis / catalysts / risks / breakers | Intact · 5 · 4 · 7 | `unity-seed.ts`'s real thesis content |

The one illustrative choice: Unity's real *currently ACTIVE* zone is
`HOLD` (a no-op "maintain" stance with no waiting/ready lifecycle to
show). All three prototypes instead walk through **Trim — Level 1**
(Unity's real `WATCH`-state zone, with real `50–100` share sizing and a
real two-condition trigger already in `unity-seed.ts`) as "the action
being tracked toward primary," since it's the one real zone with an
actual signal-light gate to demonstrate. This is a demo framing choice,
not a change to what the engine currently reports.

## The six required states, common to all three

1. **Waiting** — 1 of 2 signals ready (concentration ready, valuation
   waiting), no CTA.
2. **Ready to act** — 2 of 2 ready, calm teal CTA appears.
3. **Full action stack** — Hold (active) → Trim L1 (watching) → Trim L2
   (future) → Thesis review (conditional).
4. **Act / execution detail** — SELL 50–100 shares, current price
   €40.46, 4 broker steps, explicit "this playbook never executes
   trades" disclaimer.
5. **Transaction confirmation** — recommended vs. an actual-entry form
   (shares/price/date), then a recalculated preview (902→839 shares,
   58.6%→54.5%) and the next tracked action.
6. **Reasoning / evidence expansion** — Fundamentals/Momentum/Thesis/
   Portfolio risk as semantic-state rows, each expandable to its real
   per-component list with an honest coverage line.

## Concept A — Hero Stack

**Inspect it:** https://claude.ai/code/artifact/60e244bf-85cf-4388-937d-58a9d5ee007d
— use the dark "Inspect state" bar pinned at the top; its six buttons
jump directly to each of the six required states.

**Hierarchy / composition.** Single column, ~640px, centered — a
dominant Primary Action card carries roughly 70% of first-screen visual
weight. Everything else (action stack, reasoning) is compact and
secondary underneath it, matching L1→L2→L3 top-to-bottom.

**Signal-light treatment.** A vertical two-row list inside the primary
card itself (filled dot = ready, hollow = waiting), with a plain-
language tally line ("1 of 2 signals ready") — the signal state lives
*inside* the decision card, not beside it.

**Progressive disclosure.** The action stack is collapsed to one line
per zone by default ("See full playbook" expands all four in place);
reasoning is four small chips that each expand an inline detail panel
directly below themselves, one at a time.

**Interaction.** Acting opens a centered modal/sheet (the heaviest-
weight overlay of the three) that paginates in place: detail → confirm
→ done, closing back to the same page position.

**Strengths.** Closest to "one page, one clear answer" — nothing
competes with the primary card. Cheapest to build from the current
codebase (mostly a reordering + collapsing of what already exists).

**Considerations.** The modal is the most "interruptive" of the three
patterns — it takes over the whole viewport rather than staying
alongside the page.

## Concept B — Signal Rail

**Inspect it:** https://claude.ai/code/artifact/b06bb486-fad2-4025-b1de-aefdceebef22
— same "Inspect state" bar, top-left.

**Hierarchy / composition.** Two-zone layout: a main column (Primary
Action, kept deliberately more compact than Concept A's since detail
moves to the rail) plus a persistent, sticky right-hand rail carrying
Situation and Signal-light. This is the only concept where the
signal-light and "current vs. recommended holding" numbers stay visible
on screen *while* reasoning is being read below — nothing has to be
scrolled back to.

**Signal-light treatment.** Lives in its own rail block, formatted
exactly per the principles doc's own example (aligned dot-list +
tally), separated from the action card entirely.

**Progressive disclosure.** The action stack collapses to a horizontal
breadcrumb ("Hold → **Trim L1** → Trim L2 → Thesis review") with a "See
full playbook" link; reasoning is a vertical stream of rows, each
expanding its own detail in place on click.

**Interaction.** Acting opens a right-side slide-in drawer — **the
exact interaction affordance `ActionZoneDrawer.tsx` already uses in
production today**, deliberately reused rather than reinvented. The
drawer's content re-paginates (detail → confirm → done) without closing.

**Strengths.** The signal-light/situation context never has to be
re-found while scrolling — useful for a returning user re-checking "is
it ready yet." Reuses an already-shipped, already-correct interaction
pattern (the drawer), the smallest interaction-pattern risk of the
three.

**Considerations.** Two-column layouts need a defined narrow-viewport
fallback (this prototype stacks to one column under ~820px, but that's
the one place this concept adds layout complexity the other two don't
have).

## Concept C — Conversational Playbook

**Inspect it:** https://claude.ai/code/artifact/193f6f79-85d3-46ba-96c4-723be7673080
— same "Inspect state" bar.

**Hierarchy / composition.** No bordered cards anywhere — sections are
separated by whitespace and a single rule, read top-to-bottom like a
short briefing: situation sentence → "Next: Trim — Level 1" → reasoning
lines. This is F.0's "excessive dashboard/card behavior" finding
addressed as directly as possible.

**Signal-light treatment.** An inline sentence with dot glyphs
("● Concentration ready · ○ Valuation waiting") rather than any boxed
list — the lightest-weight rendering of the three.

**Progressive disclosure.** Reasoning dimension names are inline text
links; tapping one expands its component list directly beneath the
sentence, pushing content down (no accordion chrome, no card).

**Interaction.** The most distinctive of the three: acting **morphs the
same paragraph block in place** — no modal, no drawer. "Act on this"
replaces the block's own content with execution steps; "I've done this
action" replaces it again with the confirmation form; confirming
resolves it to a plain "Recorded" line, then back to whatever the next
tracked action is. Nothing ever overlays the page.

**Strengths.** The calmest, least "software-like" reading of the three
— closest to principle §14's "calm, precise, trustworthy... not a
trader terminal." Also the most different from today's card-heavy
page, so it's the clearest side-by-side contrast for judging how far to
move.

**Considerations.** In-place morphing is a novel interaction for this
codebase (nothing today does this) — more implementation surface than
reusing A's modal or B's already-shipped drawer. Best suited to a
single primary action; would need a deliberate answer for "more than
one thing to act on at once," which didn't arise here since the
principles doc's own model is one-primary-action-at-a-time.

## Verification note

All three were exercised end-to-end through every one of the six
states before publishing. Mouse-click automation into these nested
Artifact preview iframes proved unreliable in this session's browser
tooling (clicks landing on the host chrome around the preview rather
than inside it) — a testing-tool limitation confirmed by cross-checking
`window.innerWidth`/`devicePixelRatio` and iframe geometry directly,
not a defect in the prototypes. Keyboard (Tab/Enter) interaction, which
is coordinate-independent, was used instead and confirmed every state
transition in Concepts A and B renders and behaves correctly (Waiting
→ Ready → Act detail → Confirm, action-stack expand, evidence expand);
Concept C's identical rendering approach and confirmed initial paint
give equivalent confidence. One real bug was caught and fixed during
this process: Concept A's Act modal was briefly visible by default at
desktop widths before an `opacity`/`pointer-events` fix.

## Iteration 2 — Semantic Visual Language (§16) applied to Hero Stack

**Hero Stack was chosen** as the direction to carry forward. This
iteration applies `PLAYBOOK_INTERFACE_PRINCIPLES.md`'s newly-added §16
(Semantic Visual Language) inside that one concept — Concepts B and C
were left as originally published; the IA and product model are
unchanged, only Hero Stack's visual language changed.
Inspect it at the same URL: https://claude.ai/code/artifact/60e244bf-85cf-4388-937d-58a9d5ee007d

Four stable icon families were added, each a shared SVG `<symbol>`
reused everywhere that concept appears (never a one-off icon per
instance):

- **Action types** — HOLD (steady flat-line), ADD (plus), TRIM
  (down-arrow), THESIS REVIEW (magnifying glass). Trim Level 1 and
  Level 2 reuse the identical trim icon with only a small level badge
  (`1`/`2`) distinguishing them, per §16.1 — never two separate icons
  for the same action family.
- **Action/signal states** — waiting (hollow circle), ready/completed
  (filled circle + check), locked/future (circle + padlock). Applied
  consistently to the primary action's own Waiting/Ready chip, the
  signal-light rows, the action-stack tags (Active/Watching/Future/
  Conditional), and the transaction-confirmation "Recorded" state —
  the same four glyphs everywhere a lifecycle state appears.
- **Reasoning categories** — Fundamentals (bar chart), Momentum
  (trend arrow), Thesis (bullseye), Portfolio risk (shield), each a
  neutral-ink icon beside its still-fully-spelled-out semantic state
  (Positive/Intact/Elevated stay in text, per §16's guardrail).
- **Instrument identity** — the plain text header became one coherent
  block: a monogram avatar (the approved ticker/logo-fallback, since a
  self-contained Artifact cannot load a real company logo), name +
  ticker + exchange, live position context (902 sh · 58.6% of
  portfolio), and price, all in a single row.

**Read → understand / recognize → scan.** The signal-light rows'
Ready/Waiting text labels were kept but visually de-emphasized (smaller,
lighter) once the icon shape/color reads unambiguously — first-time
users still have the word to read; repeated visits can scan the
icon alone. Action-type icons stay a neutral ink color on purpose
(shape carries "what"); only the state-icon family carries color, so
status color stays restrained to one channel rather than spreading
across every icon on the page.

**A real clarity bug was caught and fixed during this pass**: the
first Trim icon draft (a small chevron + baseline) rendered as a
"wink" at actual size, not a reduce/decrease glyph — replaced with a
plain arrow-down inside the circle, which reads correctly at 18px.
This is exactly the kind of ambiguous-icon risk §16's own guardrail
("do not replace important explanations with ambiguous icons") warns
about, caught by inspecting the rendered result rather than the SVG
source. Recommended holding, execution instructions, evidence
coverage, and every risk/coverage explanation remain full text,
unchanged — icons were added only alongside retained text, never in
place of it.

Verification followed the same pattern as iteration 1: mouse-click
automation into the nested Artifact iframe was intermittently
unreliable in this session's tooling (confirmed, not a new issue);
static rendering of every icon family (header, primary card, full
action stack, and all four reasoning chips) was visually confirmed via
screenshot at actual size, and the Waiting↔Ready icon-swap logic was
verified by direct code review (a small, symmetric function,
unchanged in structure from the already-interaction-tested iteration
1 version).

## Non-goals of this exploration

No visual/brand styling decision is implied — colors and type reuse the
production app's existing Tailwind stone/teal/amber palette and its
`Geist` typeface (via Google Fonts, since these are standalone
Artifacts) purely to stay comparable, not as a proposed redesign. No
engine output changed or newly invented — every number shown is either
already computed by `runDecisionEngine`/`scoreFundamentals`/
`scoreMomentum` today or is real seed content already in `unity-seed.ts`.
No decision was made here about which concept (or which pieces of which
concept) to move forward with — that's the next step, for the user to
judge against the live artifacts directly.
