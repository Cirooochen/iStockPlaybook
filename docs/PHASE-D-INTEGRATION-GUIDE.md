# Phase D — Integration Guide

## Purpose

Phase D integrates validated evidence modules into the Playbook decision
system.

The goal is not to redesign the validated Phase B decision model.

The goal is to connect new evidence to it cleanly, incrementally, and
without losing information.

---

## 1. Core Principle

**Evidence is not the decision.**

Signals such as:

- Momentum
- Fundamentals
- Valuation
- Thesis

provide evidence to the Playbook.

They must not independently produce BUY / SELL / TRIM decisions.

Final decisions remain the responsibility of the composed decision system.

---

## 2. Preserve Existing Decision Boundaries

New evidence must not bypass:

- concentration state
- target-position capacity
- thesis state
- hard constraints
- core protection
- existing stance rules

Example:

Strong momentum + severe overweight

does not automatically mean BUY or HOLD.

The Playbook may still conclude:

`HOLD_GRADUALLY_TRIM`

Likewise:

Weak momentum + healthy concentration

does not automatically mean SELL.

---

## 3. Deterministic Evidence

Where deterministic models already exist, use their outputs directly.

Do not:

- recompute signals inside the Decision Engine
- ask AI to reinterpret numeric signals before integration
- silently change normalization
- introduce duplicate scoring models

The same inputs should produce the same Playbook evidence.

---

## 4. Missing Evidence Semantics

Always preserve:

`MISSING != 0`

Missing evidence must never silently become bearish evidence.

Also preserve the distinction between:

### AVAILABLE

Evidence exists and can contribute to scoring.

### MISSING

Evidence is expected but unavailable.

Its absence should remain visible.

### NOT_APPLICABLE

The evidence is not required for this strategy/configuration.

It should not be treated as missing.

### INSUFFICIENT_DATA

There is not enough evidence to produce a reliable aggregate result.

Do not fabricate a score.

---

## 5. Evidence Coverage

Evidence coverage describes how much expected evidence is actually
available.

It is not automatically the same thing as confidence.

For v0.1, prefer keeping evidence coverage as explicit metadata rather than
introducing a general confidence model.

A future confidence model requires its own design and validation.

---

## 6. Preserve Contradictory Signals

Do not force all evidence into a single bullish/bearish narrative.

Examples of valid states:

- strong momentum + expensive valuation
- strong fundamentals + weak momentum
- healthy thesis + severe concentration
- strong momentum + excessive price extension
- weakening thesis + attractive valuation

Contradiction is useful information.

The architecture should preserve it until the appropriate decision layer
resolves it.

---

## 7. Scorecard Integration

The Scorecard is the preferred first integration point for normalized
evidence.

When integrating a validated evidence module:

1. consume its existing result
2. preserve its component metadata where relevant
3. preserve missing/applicability semantics
4. avoid unnecessary re-normalization
5. avoid information loss

Do not create a second version of the same evidence inside the Scorecard.

---

## 8. Stance Integration

Do not automatically make every new Scorecard dimension a direct stance
dependency.

Prefer incremental integration:

Evidence
→ Scorecard
→ validated decision rules
→ Stance

A new direct stance dependency requires an explicit model decision.

---

## 9. Hard Constraints Remain Authoritative

Evidence must not override hard constraints.

Examples:

- positive momentum must not bypass concentration protection
- attractive valuation must not bypass core/position rules
- AI-generated thesis interpretation must not bypass deterministic
  constraints

Hard constraints and strategic capacity remain separate concepts from
evidence quality.

---

## 10. AI Boundary

AI may eventually help with:

- interpreting reports
- extracting qualitative evidence
- explaining Playbook decisions
- summarizing contradictions
- challenging a thesis

AI should not silently:

- change deterministic weights
- change thresholds
- alter position accounting
- override hard constraints
- fabricate missing market evidence

AI explanation and deterministic decision computation should remain
separable.

---

## 11. Integration Strategy

Use the smallest clean integration step.

For each new evidence module:

1. verify its output contract
2. connect it to the Scorecard
3. validate missing-data behavior
4. validate contradictory-signal behavior
5. only then consider decision/stance influence

Avoid large cross-layer refactors unless an actual architecture conflict is
demonstrated.

---

## 12. Model Changes vs Implementation Changes

Classify findings as:

### CLEAN INTEGRATION
Existing architecture supports the evidence without model changes.

### IMPLEMENTATION GAP
The intended model is clear, but code wiring is missing or incorrect.

### MODEL DECISION REQUIRED
Multiple legitimate behaviors exist and product/model semantics must be
chosen explicitly.

### ARCHITECTURE CONFLICT
Existing boundaries cannot represent the intended behavior cleanly.

Stop for review on MODEL DECISION REQUIRED or ARCHITECTURE CONFLICT.

Do not silently resolve them during implementation.

---

## 13. Phase D Validation Principle

Every integration checkpoint should answer:

- What evidence entered the system?
- Where did it enter?
- Was any information lost?
- How was missing evidence handled?
- Did it alter stance?
- Could it bypass existing constraints?
- Were contradictory signals preserved?
- Did any existing Phase B semantics change?

Normal PASS results do not require redesign.

---

## 14. Current Starting Point

Phase C produced a validated six-dimension Momentum Model:

- Primary Trend
- 50DMA / 200DMA Structure
- Relative Strength
- RSI
- Relative Volume
- Price Extension

The model provides:

- normalized component scores
- component weights
- aggregate momentum score
- applicable weight
- available weight
- missing weight
- evidence coverage
- explicit MISSING / NOT_APPLICABLE semantics

It has been validated end-to-end using real market data.

Phase D begins by integrating this existing Momentum result into the
Scorecard without changing its formulas or weights.

---

## 15. Out of Scope Unless Explicitly Started

Do not introduce these opportunistically during another Phase D checkpoint:

- general confidence model
- HC-004 / HC-005
- new momentum formulas
- momentum backtesting/calibration
- API-provider redesign
- UI redesign
- AI-generated trading decisions
- fundamentals implementation
- valuation implementation

Each requires its own checkpoint.