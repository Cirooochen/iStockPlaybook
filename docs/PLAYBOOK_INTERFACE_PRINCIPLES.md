# Playbook Interface Principles

## Purpose

This document defines the approved product and UX principles for the
stock-detail experience. The interface is a **personal investment
decision and execution playbook**, not an investment-analysis dashboard.

## 1. Product Model: Playbook-First

The interface should help the user answer, in order: 1. What should I do
now? 2. Why? 3. What conditions am I waiting for? 4. What happens next?

Hierarchy: - **L1 --- Decision / Action:** current position, recommended
holding position, primary action, readiness. - **L2 --- Reasoning:**
Fundamentals, Momentum, Thesis, Portfolio Risk. - **L3 --- Evidence:**
component evidence, research, thesis details, transactions, activity.

Evidence supports the decision; it should not visually compete with it.

## 2. Core Product Loop

``` text
Live data
→ Current position
→ Recommended holding position
→ Primary action
→ Watch deterministic signals
→ WAITING / READY TO ACT
→ Execution guidance
→ User executes externally in broker
→ "I've done this action"
→ Record actual transaction
→ Recalculate position and playbook
→ Next action becomes primary
```

The system guides execution but does not automatically trade.

## 3. Current vs Recommended Holding

Clearly distinguish: - **Current holding:** what the user owns now. -
**Recommended holding position:** the strategic position the playbook
recommends gradually moving toward.

Example:

``` text
Current holding                 902 shares
Recommended holding position    650 shares
```

Recommended holding is a **strategic destination**, not an immediate
instruction such as "Sell 252 shares now." Timing and transaction sizing
belong to the Action Playbook.

## 4. One Primary Action

Only one action should dominate the default experience. Examples: HOLD,
TRIM LEVEL 1, TRIM LEVEL 2, THESIS REVIEW.

The Primary Action Card communicates: - action name; - short
explanation; - expected execution size where applicable; - readiness
state; - required signals.

Future actions remain secondary.

## 5. Signal-Light Model

Executable actions depend on deterministic conditions.

``` text
Concentration condition    ● Ready
Valuation condition        ● Ready
Momentum condition         ○ Waiting

2 of 3 signals ready
```

The model serves two modes: - **Learning:** new users read the
descriptions and learn why the playbook is waiting. - **Scanning:**
experienced users quickly recognize readiness from signal states.

Keep the visual language calm and trustworthy; avoid gamified or
casino-like trading UI.

## 6. Action Lifecycle

``` text
WAITING
→ READY TO ACT
→ ACT
→ EXECUTION INSTRUCTIONS
→ USER EXECUTES IN BROKER
→ CONFIRM ACTUAL TRANSACTION
→ COMPLETED
→ NEXT ACTION
```

### WAITING

When required signals are incomplete, communicate what is missing
without urgency. Do not show a strong execution CTA.

### READY TO ACT

When all required deterministic conditions are satisfied, clearly
communicate readiness and show the **Act** CTA. The system never
executes automatically.

## 7. Action Stack

Only the Primary Action Card is fully visible by default. Future actions
appear as a subtle collapsed card stack.

A control such as **See full playbook** reveals the sequence:

``` text
HOLD                 Completed/history
↓
TRIM LEVEL 1         Current
↓
TRIM LEVEL 2         Future
↓
THESIS REVIEW        Conditional
```

The sequence answers: **What happens after I complete this action?**
Future actions should not compete visually with the current action.

## 8. Execution Detail

When READY TO ACT, **Act** opens an Action Detail modal/sheet that
translates engine logic into simple instructions.

``` text
TRIM — LEVEL 1

SELL
50–100 shares

Price zone
€44–€47

Current price
€45.30
```

Then guide the user: 1. Open the investment/broker app. 2. Find the
stock. 3. Execute the described transaction. 4. Return to the playbook.

Clearly state that the playbook does not execute the trade on the user's
behalf.

Completion CTA: **I've done this action**.

## 9. Confirm the Actual Transaction

"I've done this action" must not assume the recommendation was followed
exactly. Record the real transaction: - shares bought/sold; - actual
execution price; - transaction date.

``` text
Recommended
Sell 50–100 shares at €44–€47

Actual transaction
63 shares
€45.21
Today
```

The actual transaction is the source of truth. After confirmation,
recalculate shares, cost basis, P&L, concentration, recommended-holding
relationship, decision engine, and action readiness. The appropriate
next action can then become primary.

## 10. Reasoning Is Secondary

Fundamentals, Momentum, Thesis, and Portfolio Risk explain the playbook.
They support the Primary Action rather than dominate the page.

Prefer semantic states such as **Positive / Neutral / Weak**,
**Intact**, or **High risk** over prominent `/10` scores. Numeric scores
may remain internal to the deterministic engine.

## 11. Evidence and Coverage

Detailed evidence uses progressive disclosure.

``` text
Fundamentals              Positive
Evidence coverage         75%

Revenue Growth            Positive
Growth Trend              Positive
Operating Margin          Positive
Margin Trend              Neutral
FCF Margin                Strong
Guidance                  Not available
Balance Sheet             Not available
```

Core principles: - **Evidence ≠ Decision** - **MISSING ≠ 0** - Evidence
state and evidence availability are separate. - Partial evidence must
not be presented with false precision. - Similar semantic states may
have different evidence coverage.

## 12. Thesis and Watch Layer

The full Investment Thesis should not dominate the default page. Prefer
a concise thesis state, short explanation, and counts/summary of
catalysts, risks, and thesis breakers, with deeper inspection available.

The Watch layer explains what could change the playbook: - more bullish
signals; - more cautious signals; - thesis breakers.

## 13. Research, Transactions, and History

Research, full thesis details, transactions, and activity are deeper
layers. Keep them accessible without competing with the Primary Action.

The default stock experience prioritizes **decision and execution**, not
exhaustive research consumption.

## 14. Visual and Interaction Principles

The interface should feel: - calm; - precise; - trustworthy; - modern; -
financial without resembling a trader terminal; - beginner-friendly
without looking simplistic.

Use strong hierarchy, restrained status color, and progressive
disclosure.

Motion should aid comprehension of meaningful changes such as WAITING →
READY, action completion, next action becoming primary, or playbook
expansion. Avoid decorative motion.

## 15. UX Guardrails

Do not: - return to a dashboard of equally weighted cards; - present
recommended holding as an immediate trade command; - show **Act** before
deterministic conditions are satisfied; - automatically execute
trades; - assume the recommended transaction was executed exactly; -
expose internal engine codes; - treat missing evidence as zero or
bearish evidence; - imply unsupported precision or confidence; - give
future actions equal weight to the current action; - let supporting
scores dominate the playbook.

When analytical completeness conflicts with clarity of the next
decision, prioritize **decision clarity** and provide deeper information
through progressive disclosure.

## 16. Semantic Visual Language

Repeated concepts should develop stable iconography so the interface
gradually moves from reading-first to recognition-first. The goal is
not decoration, and not simply reducing words — it is to reduce reading
effort during repeated use.

- **First-time use:** read → understand.
- **Repeated use:** recognize → scan.

This extends the Signal-Light Model (§5): visual recognition should
help experienced users scan the playbook quickly without sacrificing
comprehension for beginners.

### Stable icon families

1. **Action types** --- HOLD, ADD, TRIM, THESIS REVIEW. Actions within
   the same family (e.g. Trim Level 1 / Level 2) reuse the same core
   icon rather than inventing a separate icon per level.
2. **Action/signal states** --- waiting, ready, completed, locked/future.
   State icons should reduce redundant "Ready"/"Waiting" labels where
   the state is already visually clear.
3. **Reasoning categories** --- Fundamentals, Momentum, Thesis, Portfolio
   Risk. Stable category icons improve recognition, while the semantic
   state labels that matter (Positive, Intact, Elevated, etc. --- §10)
   remain in text.
4. **Instrument identity** --- give the stock header a stronger visual
   anchor. Prefer the company logo when appropriate, with ticker/
   monogram as a reliable fallback. Company identity, ticker/exchange,
   price, and relevant position context should read as one coherent
   instrument identity block.

### Guardrails

Do not: - replace important explanations with ambiguous icons ---
recommended holding, signal meaning, execution instructions, missing
evidence, and risk explanations must remain explicit in text; - use
icons for decoration; - let icon meaning vary across the product; -
let accessibility depend on icon or color alone; - reintroduce
gamified or trading-terminal visual language (§5, §14).

Prefer icon + text while users are still learning the vocabulary, and
keep status color restrained (§14).
