# Phase H.6 — End-to-End Generic Playbook Validation

Status: **validation/hardening complete**. Source:
`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`,
`docs/phase-h0-playbook-onboarding-product-model.md` through
`docs/phase-h5-ai-assisted-research-design.md`. No new investment rules,
AI decision logic, or product features were introduced — every change in
this document either fixes a defect against behavior H.0–H.5 already
specified, or documents a finding.

This is a real, live validation run — the app was driven end-to-end in an
actual browser against the running dev server (localhost), not simulated.
Every claim below with a concrete number (shares, weight %, prices) was
observed on-screen, not inferred from reading code.

---

## 1. Method

1. Read all Phase H design docs (H.0–H.5) and the H.4/H.5 implementations.
2. Audited the full Playbook rendering path for residual Unity-specific
   assumptions (§3 below).
3. Ran the real ASML flow end-to-end in Chrome against the dev server:
   No Playbook → Create Playbook → Questionnaire (including exercising
   "Get AI help") → Analyze → Review → Confirm → confirmed Playbook page
   → BUY → reload → SELL, with a Unity regression pass interleaved.
4. Fixed every class-C (generic-stock correctness) bug found, verified
   each fix live in the same browser session, then re-ran the full test
   suite, `tsc --noEmit`, lint, and `next build`.

ASML (`instrumentId: "ASML"`, seeded in `holdings-seed.ts`, no seeded
`StockPlaybookConfig`) was used as the non-Unity subject, exactly as the
plan names it.

---

## 2. End-to-end flow — what was actually observed

```
No Playbook (ASML)
  → "No Playbook yet for ASML Holding N.V." — correct empty state,
    Create Playbook entry point
→ Onboarding overlay opens
  → Q1 Investment Role: selected "I'm not sure — help me decide" first
    to exercise Intent Assist; "Get AI help with this" appeared, showed
    "Thinking…", then correctly degraded to "AI assistance isn't
    available right now — you can still choose an option above
    directly." (no ANTHROPIC_API_KEY configured) — Continue stayed
    enabled throughout, never blocked
  → Re-selected a concrete answer (Growth), then Confidence=High,
    Intention=Build, Thesis=No meaningful change
→ Analyze — real 4-row checklist, "Reading the evidence" resolved
→ Review
  → "ASML Holding N.V." (no unresolved items, no discrepancy — ASML's
    weight was not yet overweight, so BUILD intent triggered nothing)
  → Recommended holding 12 shares (see §4 — this number was WRONG
    before an H.6 fix; verified correct after)
  → AI interpretation panel: "AI interpretation isn't available right
    now — the evidence below is unaffected." (fail-soft, confirmed)
  → Reasoning: Fundamentals "Not available" (real SEC EDGAR fetch
    returned no usable data for ASML — an honest MISSING, not a
    fabricated score), Momentum "Positive" (real live Twelve Data
    fetch succeeded), Valuation "Not available" (no pipeline exists,
    by design)
→ Confirm Playbook → confirmed Stock Detail page renders
  → Stance HOLD, Thesis Intact, High confidence, Primary Action "Add to
    position" (ACTIVE), Recommended holding 12 shares — matches Review
    exactly (post-fix)
  → Signal overview: Fundamentals 5/10 Neutral (H.2 §8.1's documented
    compatibility placeholder — correct, not a bug, see §5), Momentum
    7/10 Positive (real), Thesis health 8/10 Intact (matches the
    Thesis Trajectory answer), Position fit 10/10, Concentration
    risk 8/10
→ BUY 3 shares @ €742.50
  → Preview correct: 12→15 shares, weight 14.3%→17.9% (+3.6pp), avg
    cost €680.00→€692.50, still "Within target"
  → Confirmed: header updated live to 15 sh / 17.9%, My Position
    692,50 € avg cost / 8.910 €→11.138 € current value / +7.2%
    unrealized return, Primary Action recalculated (Recommended
    holding dropped to 12 — the position moved past the preferred
    midpoint, so the engine now points back toward it)
→ Reload (full page navigation, not a soft client transition)
  → Every number above survived identically — 15 shares, €692.50 avg
    cost, 17.9% weight, config intact
→ SELL 3 shares @ €742.50
  → Preview correct: 15→12 shares, avg cost unchanged at €692.50
    (SELL never touches weighted-average cost — correct), weight
    17.9%→14.3%, Realized +€150 (+7.2%)
  → Confirmed: back to 12 shares / €692.50 avg cost / 14.3% weight,
    Recommended holding back to 12 (matches current)
→ Unity regression pass (/stocks/U)
  → Header still shows real Unity data: €40.46, +2.1% today, Primary
    market $47.20 USD — unchanged
  → Stance HOLD/GRADUALLY TRIM, Trim Level 1 Active, Severely
    overweight — unchanged
  → Investment thesis / What would change my view? / Latest research
    (Unity Q2 2026 Earnings, Unity 2025 Annual Report) — all still
    render, unchanged
  → Transaction modal title: "Add Transaction — Unity Software Inc."
    (previously "Add Transaction — Unity Software" — now more
    accurate too, since it reads the real security name instead of a
    hand-typed fragment)
```

No console errors at any point (checked via Chrome DevTools protocol
after every major transition). No unhandled exception, no crash.

---

## 3. Unity-specific-assumption audit

Every file that imports from `unity-seed.ts` or branches on a hardcoded
ticker/instrument-id was read directly (not just grepped) and classified.

| # | Location | Symptom for a non-Unity stock | Class | Action |
|---|---|---|---|---|
| 1 | `StockHeader.tsx` via `legacyMarketColor` (`page.tsx`→`StockDetailClientShell.tsx`) | Showed "Primary market $47.20 USD" and "+2.1% today" — Unity's literal numbers — under ASML's own Hero Stack | **C** | **Fixed** — §4.1 |
| 2 | `ThesisCard`/`WhatChangesMyView`/`ResearchPreview` (`PlaybookClientShell.tsx`) | Rendered Unity's literal thesis text, catalysts, and research-document titles ("Unity Q2 2026 Earnings") on ASML's confirmed Playbook page | **C** | **Fixed** — §4.2 |
| 3 | `AddTransactionModal.tsx` title | Every stock's transaction modal read "Add Transaction — Unity Software," including ASML's | **C** | **Fixed** — §4.3 |
| 4 | `UNITY_INSTRUMENT_ID` gate (`StockDetailClientShell.tsx`) selecting `unityScorecard`/`unityActionZones`/`unityTimeline` vs. the H.2 deterministic builders | None — correctly scoped, cannot match a non-Unity `instrumentId` (new holdings get `crypto.randomUUID()`) | A | None — intentional, confirmed correct |
| 5 | `WhyThisStance.tsx` (imports `unity-seed.ts`) | None — never imported by `PlaybookClientShell.tsx` or anywhere else; dead code for every stock, Unity included | B | None — flagged for awareness only |
| 6 | `actionZoneConfig.ts` / `action-zone-templates.ts` | None — purely generic type→label maps and parameterized templates, no per-company content or Unity fallback | A/B | None |
| 7 | `src/domain/portfolio/snapshot.ts` (`createStockPlaybookConfig`/`toStockEngineInputs`) | None — confirmed no instrument-specific branching | A/B | None |
| 8 | `stock-playbook-seed.ts` / `portfolio-seed.ts` | None on the live path — `stockPlaybookConfigsSeed` is Unity-only by design (seed data, not a rendering bug); `portfolio-seed.ts` is unused dead code, confirmed via `grep -rln` | A/B | None |
| 9 | `fallbackName` / a holding with no seed at all | None — falls back to the raw ticker string, never a Unity-flavored default; new holdings never get instrument id `"U"` | A/B | None |
| 10 | `HoldingFormModal.tsx`'s "e.g. Unity Software Inc." placeholder | None — cosmetic empty-state example text in the Add Holding form, never persisted or decision-relevant | B | None |

**Every class-C finding was fixed in this session** (§4). No class-C
finding was left unaddressed.

---

## 4. Fixes applied

### 4.1 Non-Unity Hero Stack no longer shows Unity's market data

**Root cause:** `page.tsx` unconditionally read `unitySeed.market.primaryPriceUsd`/`dailyChangePct`/`unitySeed.security.marketCurrency` and passed them as `legacyMarketColor` for every ticker. `StockHeader.tsx` rendered them unconditionally.

**Note on the main EUR price:** the large "€742.50" price shown for ASML is *not* this bug — it is ASML's own seeded quote (`market-data-seed.ts`'s `quotesSeed`, a real per-instrument value, not Unity's), consistent with Phase G's documented "no live quote provider wired, seed data supplies the display price" scope. Only the secondary USD line and the daily-change badge were Unity's.

**Fix:**
- `MarketData.primaryPriceUsd`/`.dailyChangePct` and `Security.marketCurrency` (`src/types/playbook.ts`) became optional — the honest "missing" representation this codebase uses everywhere else (`DataField<T>`, `ProposalField<T>`), applied here for the first time to these two display-only fields. Confirmed these never cross the `EngineInput` boundary (`engine.ts` only ever reads `executionPriceEur`), so this does not reopen the type-level "missing signal data" gap `b5.6-contradictions-failure-states.test.ts` protects — that test was updated to scope its check accordingly, with the reasoning documented inline.
- `StockDetailClientShell.tsx`'s `legacyMarketColor` prop became optional.
- `page.tsx` now only supplies it when `staticConfig` is defined — `stockPlaybookConfigsSeed` contains only Unity's config, so this is a reliable, already-computed "is this Unity" signal, not a new one.
- `StockHeader.tsx` omits the "Primary market $X" line and its separator dot, and the daily-change badge, when the data is absent — never a fabricated fallback.

**Verified live:** ASML no longer shows "$47.20 USD"/"+2.1% today"; Unity's page is byte-identical to before.

### 4.2 Non-Unity Playbooks no longer show Unity's thesis/research text

**Root cause:** `ThesisCard`/`WhatChangesMyView`/`ResearchPreview` import `unity-seed.ts` directly, take no props, and were rendered unconditionally in `PlaybookClientShell.tsx`.

**Fix:** Added `showHandAuthoredThesisContent: boolean` to `PlaybookClientShell`'s props; `StockDetailClientShell.tsx` passes its existing `isUnity` value. The three components are now only rendered when true. This is exactly H.0's own resolution (§5 item 2: this content is out of Phase H's scope to build a per-stock equivalent for) made structurally true — rendering nothing for a non-Unity stock, rather than rendering Unity's content, is the honest consequence of that scope decision, not a new feature.

**Verified live:** ASML's confirmed page goes straight from Action Framework/Signal overview to Recent activity — no Investment Thesis / What Would Change My View / Latest Research sections. Unity's page is unchanged.

### 4.3 Transaction modal title is no longer hardcoded to Unity

**Root cause:** `AddTransactionModal.tsx` rendered the literal string `"Add Transaction — Unity Software"` for every stock.

**Fix:** Added a `securityName: string` prop, threaded from `PlaybookClientShell.tsx`'s `seed.security.name` (the same source every other identity label on the page already uses) down to `AddTransactionModal`.

**Verified live:** ASML shows "Add Transaction — ASML Holding N.V."; Unity now shows "Add Transaction — Unity Software Inc." (previously a hand-typed fragment missing "Inc." — this is also a correctness improvement for Unity, not just a parameterization).

### 4.4 Review's Recommended Holding now matches the confirmed page (not Unity-specific)

**Not part of the Unity-hardcoding audit** — this affects every stock, including a hypothetical fresh Unity re-onboarding — but it is a direct, named H.6 validation criterion ("Review matches the confirmed Playbook"), so it is reported and fixed here.

**Root cause, found live:** onboarding ASML as a first-time GROWTH position, Review showed **"Recommended holding 15 shares"**, but the confirmed page's Primary Action Card showed **"Recommended holding 12 shares"** for the identical inputs. Root cause: `PlaybookOnboardingOverlay.tsx`'s Review preview computed shares via `calcTargetShares(...)` against the target range's **max%** (18%), while the real, post-confirmation Engine computes "Recommended holding" via `deriveTargetPosition(...).preferredTargetShares` — a **midpoint-of-range-aware** preferred target (`engine.ts:274`, spec §21A). For a position already near the range's midpoint, the two numbers visibly disagreed. This was H.4's own documented, deliberate scope reduction ("the Review screen's Decision layer shows target/ceiling/core-range/concentration badge rather than a full 5-zone Engine-run preview") — known and accepted at H.4 time, but its concrete impact (a visibly wrong number, not just a missing feature) had not been demonstrated until this live run.

**Fix:** Review's preview now calls the exact same `deriveTargetPosition` function the real Engine calls, with the same inputs (current shares, current weight, portfolio total, price, target range, core range). This is not a new investment rule — it reuses existing, already-in-production deterministic logic — and follows the same pattern `deriveStrategyFieldsFromIntent` already established for the Strategy percentage fields ("shared by the Review preview and the real mapping, so the two can never drift apart").

**Verified live:** re-ran the identical ASML/GROWTH onboarding after the fix — Review now shows "Recommended holding 12 shares," exactly matching the confirmed page.

### 4.5 Onboarding intro screen double-period (beginner UX coherence)

**Found live** during the ASML walkthrough: "Let's build a Playbook for ASML Holding N.V.." (double period — the intro hardcoded a trailing "." after the company name, and "N.V." already ends in one). Not Unity-specific (would affect any "Inc."/"Corp."/"N.V." name), but a direct, visible beginner-UX defect found during this validation.

**Fix:** `IntroScreen` now omits its own trailing period when the name already ends in one.

**Verified live:** "Let's build a Playbook for ASML Holding N.V." — single period.

---

## 5. Validation checklist — each named criterion

| Criterion | Result |
|---|---|
| Beginner UX is coherent | **PASS**, one defect found and fixed (§4.5). Questionnaire, Analyze, Review, and Confirm all read clearly; "Get AI help" and its unavailable state are calm and non-alarming, matching Interface Principles §14. |
| Review matches the confirmed Playbook | **PASS after fix** (§4.4). Verified byte-for-byte on the live recommended-holding number; unresolved-answers/discrepancy logic already matched (shared functions, H.1/H.2 design). |
| AI → User Decision → Deterministic Proposal → Engine boundary holds | **PASS**. Verified at three levels: (1) live browser — AI suggestion cards, when clicked, write through the identical `onSelect` handlers every hand-authored option uses; (2) server log — a real request hit `/api/ai/intent-assist` and `/api/ai/evidence-brief`, failed on missing `ANTHROPIC_API_KEY`, and degraded to `{status:"UNAVAILABLE"}` without any exception reaching the client; (3) the H.5 compile-time `@ts-expect-error` proof and runtime boundary tests (`onboarding-ai-boundary.test.ts`) still pass unmodified. |
| Portfolio / Config / Engine sources of truth remain intact | **PASS**. `Holding[]`/`StockPlaybookConfig[]`/`runDecisionEngine` were not touched by any H.6 fix; BUY/SELL correctly mutated only the real `Holding`/`Cash` state via the existing `applyTransactionToHoldings` path, and the Engine recomputed Stance/Primary Action/Recommended Holding live from that state on every render, exactly as designed. |
| Transactions and persistence recalculate correctly | **PASS**. BUY (12→15, weighted-avg cost €680.00→€692.50, weight 14.3%→17.9%) and SELL (15→12, avg cost unchanged at €692.50, weight back to 14.3%, +€150/+7.2% realized) both verified live with correct arithmetic; a full page reload after BUY preserved every number exactly. |
| Missing/partial/AI-unavailable states fail safely | **PASS**. Live-observed: Fundamentals genuinely `INSUFFICIENT_DATA`/`MISSING` for ASML rendered "Not available" (never a fabricated score); AI Evidence Brief/Intent Assist both degraded to their documented "unavailable" copy with zero effect on Continue/Confirm availability. `PARTIAL`/`UNAVAILABLE` portfolio-valuation states were **not** re-exercised live in this session (would have required un-pricing another seeded holding, risking further demo-state disruption) — coverage for these instead rests on the existing, still-passing automated suite (`materialize-config.test.ts`, `onboarding-integration.test.ts`, the B.5.x validation suite), which is a real but narrower form of validation than a live click-through. |
| Existing Unity behavior does not regress | **PASS**. Full live regression pass (§2) — Stance, Primary Action, Signal overview, Investment Thesis, What Would Change My View, Latest Research, transaction modal, and market-color header all confirmed unchanged (transaction-modal title improved, not merely unchanged). |

---

## 6. Remaining limitations (not fixed — out of this session's scope)

Found during live validation but **not** class-C Unity-hardcoding bugs and
**not** fixed here, per the instruction to scope fixes to what H.0–H.5
already define as correct behavior:

1. **`ConcentrationMeter`'s "X% now" label renders two overlapping,
   unrounded percentage strings** (e.g. "14.3065838150289% now" with a
   second string visibly stacked underneath it) — confirmed present on
   **both** ASML's and Unity's pages, i.e. a pre-existing, generic
   rendering defect unrelated to Phase H or to Unity-specific data. Left
   undiagnosed/unfixed: it does not fit the Unity-hardcoding audit this
   phase scoped, and a proper fix (dedupe render + apply the existing
   `.toFixed()`-style formatting already used elsewhere on this same
   page) deserves its own small, deliberate checkpoint rather than an
   opportunistic fix bundled into this report.
2. **The "Market data updated today, 16:15" timestamp is a hardcoded
   literal for every stock**, not derived from any real fetch time —
   pre-existing (predates Phase H), affects Unity identically, not
   Unity-specific hardcoding in the sense this audit targeted.
3. **`Scorecard.fundamentals`/`.valuation` on a newly confirmed
   Playbook's Signal overview show the H.2 §8.1 compatibility
   placeholder (5/10 Neutral)** without an inline "this is a
   placeholder, not a real assessment" affordance on that row itself —
   this is the documented, already-accepted behavior (H.2 §8.1, H.3
   §6.4: "a true fix... is out of scope for Phase H," and Unity's own
   Valuation row has always worked identically) — restated here only to
   confirm it is still present and was not silently worsened by H.6.
4. **`PARTIAL`/`UNAVAILABLE` portfolio-valuation onboarding paths** were
   validated via the existing automated suite only, not a fresh live
   click-through this session (see §5).

None of these affect Phase H's own success criteria (§7).

---

## 7. Test/build results

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **655/655 passing** (no count change from H.5; one
  pre-existing test, `b5.6-contradictions-failure-states.test.ts`, was
  updated in place to reflect the deliberate, documented
  `MarketData.primaryPriceUsd`/`.dailyChangePct` optionality — see §4.1
  — not skipped, not deleted, still enforces the same protected
  invariant for every other field).
- `npx eslint` on every file touched this session — clean. (The
  project's full-repo lint still surfaces 3 pre-existing
  `react-hooks/set-state-in-effect` errors in
  `AddTransactionModal.tsx`/`HoldingFormModal.tsx`/`use-portfolio-state.ts`
  — confirmed via file mtimes to predate this session and H.5's session
  before it; out of scope per "do not redesign H.3/H.4.")
- `npx next build` — clean; `/api/ai/evidence-brief` and
  `/api/ai/intent-assist` still register as dynamic server routes.
- Live browser session: zero console errors/exceptions across the full
  ASML flow, BUY, reload, SELL, and Unity regression pass.

---

## 8. Is Phase H complete?

**Yes — Phase H's own stated Success Criteria
(`docs/PHASE_H_PLAYBOOK_ONBOARDING_PLAN.md`) are met:**

- ✅ A real STOCK holding without a Playbook can start onboarding (ASML).
- ✅ Onboarding collects understandable user intent (live-verified,
  §4.5's copy fix applied).
- ✅ Portfolio context is reused (shares/cost/weight never re-asked).
- ✅ Available research informs a structured proposal (real live
  Momentum evidence, honest MISSING Fundamentals/Valuation).
- ✅ The user can review and confirm it (Review now matches confirmed,
  §4.4).
- ✅ Confirmation creates/persists a valid `StockPlaybookConfig`
  (survives reload).
- ✅ The deterministic Engine consumes it (Stance/Primary Action/Signal
  overview all live-recomputed).
- ✅ The stock receives Recommended Holding, Stance, Primary Action, and
  signals (ASML: HOLD, Add to position, full Signal overview).
- ✅ Portfolio transactions recalculate the Playbook (BUY/SELL verified).
- ✅ At least one non-Unity stock completes the workflow (ASML, fully).
- ✅ Unity continues working (full regression pass, §2/§5).
- ✅ AI cannot silently mutate active deterministic rules (verified at
  three independent levels, §5).

**Phase H is declared COMPLETE.** The remaining items in §6 are
pre-existing or explicitly-scoped-out limitations, not open Phase H
work — they are natural candidates for a future, separately-scoped
checkpoint (e.g. a "Phase I — Display Hardening" or similar), not a
blocker to closing Phase H itself.
