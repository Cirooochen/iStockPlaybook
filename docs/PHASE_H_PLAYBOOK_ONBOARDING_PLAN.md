# Phase H --- Playbook Onboarding Plan

## Purpose

Turn the Stock Playbook from a Unity-specific configured experience into
a capability users can create for other stocks in their real portfolio.

Core question:

> How does a beginner go from "I own this stock" to "I have a
> personalized, understandable investment playbook" without manually
> configuring the engine?

## Product Goal

``` text
Stock Holding
→ No Playbook
→ Create Playbook
→ Beginner-friendly intent
→ Portfolio + Research context
→ Playbook Proposal
→ Review & Confirm
→ StockPlaybookConfig
→ Deterministic Engine
→ Recommended Holding / Stance / Primary Action / Signals
```

Phase H succeeds when a non-Unity stock can complete this production
flow.

## Responsibility Model

### User

Provides genuinely personal intent that cannot be inferred safely: -
investment role; - confidence/conviction; - current intention; -
approval/rejection/edits of a proposed Playbook.

Beginners should not need to configure internal engine thresholds,
hard-constraint codes, trim internals, or implementation-specific
strategy parameters.

### Portfolio / System

Reuse facts already known: - shares; - average cost; - portfolio value
and weight; - cash and other holdings; - instrument identity; -
transactions where available.

### Market / Research

Provides available evidence: - price; - Fundamentals; - Momentum; -
Valuation; - company evidence; - freshness/coverage.

Missing evidence remains missing.

### AI

May: - help articulate intent; - summarize evidence; - explain
trade-offs; - propose a structured Playbook; - explain/challenge a
proposal; - surface uncertainty.

AI proposes; it does not own production decisions.

### Deterministic Engine

Remains authoritative for: - accounting; - concentration; - hard
constraints; - target-position calculations; - stance; - action-zone
state; - existing numeric decision logic.

## Initial Beginner Intent Hypothesis

H.0 should validate, not assume, that these are sufficient:

1.  **Investment Role**
    -   Long-term core investment
    -   Growth position
    -   Smaller opportunity / tactical position
    -   I'm not sure --- help me decide
2.  **Confidence**
    -   High
    -   Medium
    -   Low
    -   Help me assess it
3.  **Current Intention**
    -   Build the position
    -   Hold what I have
    -   Gradually reduce it
    -   I'm not sure

User intention is an input, not automatically the recommendation.

------------------------------------------------------------------------

# Phase Plan

## H.0 --- Playbook Onboarding Product Model

Define what the system already knows, what the user must provide, what
AI may propose, what deterministic logic owns, and how these concepts
map to the existing Strategy / Playbook / StockPlaybookConfig / Engine.

Deliverable: `docs/phase-h0-playbook-onboarding-product-model.md`

Design only. No UI or implementation. Stop on genuine PRODUCT/MODEL
decisions.

## H.1 --- Playbook Proposal Model

Define a structured, reviewable proposal before an active
StockPlaybookConfig exists.

``` text
User Intent
+ Portfolio Context
+ Research Evidence
+ Deterministic Guardrails
→ Playbook Proposal
```

Distinguish user-provided, system-known, AI-proposed,
deterministic-derived, and missing information.

The product/domain model defines the proposal schema; AI does not
dynamically define it.

## H.2 --- Deterministic Strategy Mapping

Define how an approved proposal becomes valid production configuration.

``` text
Proposal
→ Validation / deterministic mapping
→ Valid StockPlaybookConfig
```

Resolve mapping, validation/clamping, portfolio constraints, target
allocation/core ranges, contradictory intent, and fields AI must never
control directly.

## H.3 --- Onboarding UX

Design the beginner-facing journey:

``` text
No Playbook
→ Create Playbook
→ Intent questions
→ Analyze / Research
→ Proposed Playbook
→ Review
```

Prioritize simple language, low cognitive load, progressive disclosure,
"Help me decide," evidence/recommendation separation, and explicit
review before activation.

## H.4 --- Playbook Creation & Persistence

Turn a confirmed proposal into a persisted StockPlaybookConfig linked
through instrument identity and consumed by the existing Engine.

Holding ownership remains separate.

## H.5 --- AI-Assisted Research & Proposal

Introduce AI only after Proposal and deterministic mapping contracts are
stable.

AI may research, summarize, help with "I'm not sure," propose within the
structured contract, and explain. User confirms; deterministic code
validates and executes.

AI must not silently change an active Playbook's numeric rules.

## H.6 --- End-to-End Validation

Validate a real non-Unity workflow:

``` text
ASML Holding
→ No Playbook
→ Create Playbook
→ Intent
→ Research / Proposal
→ Review & Confirm
→ StockPlaybookConfig
→ Engine
→ Recommended Holding / Stance / Primary Action
→ BUY / SELL
→ Portfolio updates
→ Playbook recalculates
```

Validate persistence, missing evidence, COMPLETE/PARTIAL/UNAVAILABLE
portfolio states, contradictory intent vs risk, existing Unity behavior,
and deterministic/AI boundaries.

------------------------------------------------------------------------

# Cross-Phase Guardrails

1.  Portfolio remains the ownership source of truth.
2.  Engine remains the production decision source of truth.
3.  Holding and StockPlaybookConfig remain separate.
4.  Transactions are facts, not recommendations.
5.  AI proposes; it does not silently control production rules.
6.  User intent is not automatically the recommendation.
7.  Missing != 0.
8.  Missing evidence must not become false certainty.
9.  Evidence coverage and evidence quality/state remain separate.
10. Do not duplicate derived portfolio/position values in Playbook
    config.
11. Do not ask users for information the system already knows.
12. Do not expose engine complexity to beginners without a product
    reason.
13. Preserve explainability: distinguish what the user said, what the
    system observed, and what the system proposes.
14. Broker execution is not required for Phase H.
15. Do not redesign unrelated Portfolio or Phase F interfaces.

# Success Criteria

Phase H is complete when: - a real STOCK holding without a Playbook can
start onboarding; - onboarding collects understandable user intent; -
Portfolio context is reused; - available research can inform a
structured proposal; - the user can review and confirm it; -
confirmation creates/persists a valid StockPlaybookConfig; - the
deterministic Engine consumes it; - the stock receives Recommended
Holding, Stance, Primary Action, and signals; - portfolio transactions
recalculate the Playbook; - at least one non-Unity stock completes the
workflow; - Unity continues working; - AI cannot silently mutate active
deterministic rules.

Product milestone:

> The Stock Playbook is no longer a configured Unity demo. A beginner
> can create and use a personalized Playbook for another stock in their
> own portfolio.
