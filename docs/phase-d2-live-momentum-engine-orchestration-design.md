# Phase D.2 — Live Momentum → Decision Engine Orchestration Design

Status: DESIGN ONLY — no application code changed. No `MODEL DECISION
REQUIRED` or `ARCHITECTURE CONFLICT` encountered (per
`docs/PHASE-D-INTEGRATION-GUIDE.md` §12's classification, this design is
a **CLEAN INTEGRATION** — existing architecture supports it without
model changes).

## 0. What was read

- `docs/PHASE-D-INTEGRATION-GUIDE.md` — "Evidence is not the decision,"
  preserve existing decision boundaries, deterministic evidence (no
  recomputation/duplicate scoring), `MISSING != 0`, evidence coverage as
  explicit metadata (not confidence), "use the smallest clean
  integration step," stop only on `MODEL DECISION REQUIRED`/
  `ARCHITECTURE CONFLICT`.
- `docs/phase-d0-momentum-scorecard-integration-design.md` — the
  approved, now-implemented (D.1) shape:
  `EngineInput.momentumResult?`/`EngineOutput.momentumResult?:
  MomentumScoreResult`, optional and additive; `scorecard.momentum` uses
  `result.overall` when `SCORED`, otherwise stays at its existing
  pass-through value (§6's documented transitional limitation, unchanged
  here).
- `docs/VALIDATION_PROTOCOL.md` — stop conditions, lean single-artifact
  reporting.
- `scripts/validate-live-market-data.ts` (Phase C.8B) — the **already-
  validated, real, live-tested** pipeline this design reuses verbatim:
  `createTwelveDataClientConfigFromEnv` → `fetchQuote`/
  `fetchDailyTimeSeries`(×2)/`fetchExchangeRate` → `buildRawMarketData`/
  `mapTimeSeriesResponse` → `deriveTechnicalSignals`/`deriveTrendSignal`/
  `computeRelativeStrength` → `scoreMomentum`. Confirmed live-run
  end-to-end in the C.8B checkpoint (Unity, score 7/10, 100% evidence
  coverage).
- `src/components/playbook/PlaybookClientShell.tsx` — the **only**
  `runDecisionEngine` call site in the app; `"use client"`, receives
  `initial*`-prefixed props (`initialZones`, `initialScorecard`,
  `initialTimeline`, `initialPortfolioTotalEur`) that are fetched/fixed
  once per page load, while `position`/`portfolioTotalEur`/`timeline`
  become client-owned mutable state after that.
- `src/app/stocks/[ticker]/page.tsx` — an `async` Next.js App Router
  **Server Component** rendering `PlaybookClientShell` with seed props.
  Currently does no async work beyond `await params`.

## 1. The one architectural fact this design turns on: Server vs. Client Component

`PlaybookClientShell.tsx` starts with `"use client"` — its code ships to
the browser. `page.tsx` has no such directive — it runs **only** on the
server, and Next.js already auto-loads `.env.local` for it natively
(unlike the standalone `tsx scripts/...` execution context, which is why
C.8B's script needed its own `loadDotEnvLocalIfPresent()` — that loader
stays script-only, not reused here). `TWELVE_DATA_API_KEY` has no
`NEXT_PUBLIC_` prefix, so it is already correctly scoped to server-only
access by Next.js convention — but **only if the code that reads it
never executes inside `PlaybookClientShell` or anything it imports**.

This means the live-momentum fetch **must** be orchestrated from
`page.tsx` (or a Server Action/Route Handler — not needed here, see §5),
never from the Client Component. This is not a new boundary invented for
this design — it is the same provider/domain boundary already
established (`src/domain/` never imports `src/infrastructure/`),
extended one layer further: `PlaybookClientShell` (client-side
rendering) must not import `src/infrastructure/market-data/twelve-data/`
either, for a stronger reason than layering hygiene — doing so would
risk the API key reaching the browser bundle.

## 2. Proposed shape (additive, smallest)

### 2.1 One new orchestration function

```ts
// src/infrastructure/market-data/twelve-data/orchestration.ts — NEW FILE, illustrative, not implemented.
// Composes the already-validated C.8B pipeline (client -> mappers ->
// domain signals -> scoreMomentum) into one function. Never throws —
// every failure mode (missing credentials, network error, provider
// error, mapping error) is caught internally and converted to
// `undefined`, exactly matching how EngineInput.momentumResult being
// absent already behaves (D.0/D.1) — this is what makes "preserve
// existing fallback behavior" free: there is nothing new to fall back
// to, the SAME already-tested path is reused.
export async function fetchLiveMomentumResult(
  stockSymbol: string,
  benchmarkInstrumentId: string | undefined,
  checkedAt: string // caller-supplied — no ambient clock read inside this function either
): Promise<MomentumScoreResult | undefined> {
  if (!benchmarkInstrumentId) {
    // Relative Strength is NOT_APPLICABLE for this strategy — computeRelativeStrength
    // already models this; still attempt the rest of the pipeline (scoreMomentum
    // handles a NOT_APPLICABLE relativeStrength gracefully, per Phase C.6).
  }
  try {
    const config = createTwelveDataClientConfigFromEnv();
    const historyBars = RULESET.technical.dma200Period + RULESET.technical.trend.dma200SlopeLookbackDays;

    const [quotePayload, stockSeriesPayload, benchmarkSeriesPayload, fxPayload] = await Promise.all([
      fetchQuote(config, stockSymbol),
      fetchDailyTimeSeries(config, stockSymbol, historyBars),
      benchmarkInstrumentId ? fetchDailyTimeSeries(config, benchmarkInstrumentId, historyBars) : Promise.resolve(undefined),
      fetchExchangeRate(config, "USD/EUR"),
    ]);

    const rawMarketData = buildRawMarketData({
      instrumentId: stockSymbol,
      quotePayload,
      timeSeriesPayload: stockSeriesPayload,
      fxPayload,
      checkedAt,
    });
    const benchmarkOhlcv = benchmarkSeriesPayload ? mapTimeSeriesResponse(benchmarkSeriesPayload) : [];

    const technicalSignals = deriveTechnicalSignals(rawMarketData.ohlcv);
    const trendSignal = deriveTrendSignal(rawMarketData.ohlcv);
    const relativeStrength = computeRelativeStrength(rawMarketData.ohlcv, benchmarkInstrumentId, benchmarkOhlcv);

    return scoreMomentum(technicalSignals, rawMarketData.quote.price, trendSignal, relativeStrength);
  } catch (err) {
    // Explicit, developer-visible, server-log-only — never a thrown
    // error reaching page.tsx, never a user-facing UI change (none is
    // in scope). Distinguishing WHICH failure occurred (network vs.
    // provider vs. missing credentials) in this log is worth doing —
    // the distinction itself (C.8B) is preserved; this function just
    // does not propagate it further, per "smallest clean path."
    console.error("[twelve-data] live momentum fetch failed, falling back to existing Scorecard behavior:", err);
    return undefined;
  }
}
```

This function calls **only already-existing, unmodified** exports —
`createTwelveDataClientConfigFromEnv`, `fetchQuote`,
`fetchDailyTimeSeries`, `fetchExchangeRate`, `buildRawMarketData`,
`mapTimeSeriesResponse` (all Phase C.8A/C.8B), `deriveTechnicalSignals`,
`deriveTrendSignal`, `computeRelativeStrength`, `scoreMomentum` (Phase
C.3–C.6). Nothing about the Twelve Data adapter or the Decision Engine
is redesigned — this is purely a new composition, matching
`docs/PHASE-D-INTEGRATION-GUIDE.md` §3 ("use their outputs directly...
do not introduce duplicate scoring models").

### 2.2 One new prop, threaded through unchanged components

```ts
// src/app/stocks/[ticker]/page.tsx — illustrative
const checkedAt = new Date().toISOString(); // the orchestration boundary, not a domain function — same precedent as C.8B's script
const initialMomentumResult = await fetchLiveMomentumResult(
  unitySeed.security.ticker,
  unitySeed.strategy.benchmarkInstrumentId,
  checkedAt
);

return (
  <PlaybookClientShell
    seed={unitySeed}
    initialZones={unityActionZones}
    initialScorecard={unityScorecard}
    initialTimeline={unityTimeline}
    initialPortfolioTotalEur={portfolioSeed.totalValueEur}
    initialMomentumResult={initialMomentumResult} // NEW, optional
  />
);
```

```ts
// src/components/playbook/PlaybookClientShell.tsx — illustrative
interface Props {
  // ...existing props, unchanged...
  initialMomentumResult?: MomentumScoreResult; // NEW
}

const engine = runDecisionEngine({
  position,
  portfolioTotalEur,
  executionPriceEur: market.executionPriceEur,
  strategy,
  thesisHealth: playbook.thesisHealth,
  scorecard: initialScorecard,
  actionZoneTemplates: initialZones,
  momentumResult: initialMomentumResult, // NEW — the only new line in the existing call site
});
```

`initialMomentumResult` follows the same naming convention as
`initialZones`/`initialScorecard`/`initialTimeline`/
`initialPortfolioTotalEur` — fetched/computed once per page load,
**not** re-fetched on client-side re-renders (BUY/SELL only change
`position`/`portfolioTotalEur`/`timeline`, exactly as today; momentum
data has no reason to change within one session's interactions with
it). `MomentumScoreResult`/`MomentumComponentResult`/
`MomentumEvidenceCoverage`/`ScoreItem` are all plain data (no functions,
no class instances — confirmed by inspection) — safe to pass as a
Server → Client Component prop under Next.js's serialization
constraint.

### 2.3 Confirmed non-conflict with the existing architectural guardrail

`PlaybookClientShell.orchestration.test.ts` statically asserts the shell
imports `@/domain/engine` and never imports
`@/domain/portfolio/concentration`, `@/domain/playbook/*`,
`@/domain/thesis/thesis`, or `@/domain/signals/*` directly. This design
adds **zero** new imports to `PlaybookClientShell.tsx` — it only gains a
new prop and passes it through to the single existing
`runDecisionEngine(...)` call. The guardrail is not touched and is not
expected to need updating.

## 3. Preserved boundaries (explicit checklist, per the task's requirements)

- **Provider/domain boundaries** — `fetchLiveMomentumResult` lives in
  `src/infrastructure/market-data/twelve-data/`, imports FROM
  `src/domain/signals/*` (the normal, already-established direction —
  `src/domain/validation/*` never imports infrastructure, confirmed
  unchanged; `scripts/validate-live-market-data.ts` already does this
  exact same import direction). `PlaybookClientShell` (client-side) never
  imports `src/infrastructure/` at all — only receives its already-
  computed, plain-data result as a prop.
- **Explicit missing/error handling** — preserved exactly as C.8B
  validated it: a network failure, a `TwelveDataApiError`, and a missing
  API key are still three distinguishable things **inside**
  `fetchLiveMomentumResult` (each hits a different branch of the
  existing client/mapper error handling before the catch-all) — this
  design does not collapse that distinction, it only stops propagating
  it past the orchestration boundary (logged, not thrown further),
  which is a deliberate, scoped choice (§4), not a silent loss.
- **Existing fallback behavior** — preserved *exactly*, not
  reimplemented: any `fetchLiveMomentumResult` failure returns
  `undefined`, which is the **identical, already-tested** "absent"
  path D.1 built and tested (`scorecard.momentum` stays at its existing
  pass-through value, `EngineOutput.momentumResult` stays `undefined`).
  No new fallback logic exists anywhere in this design.
- **No stance/action-zone influence** — unchanged; D.1 already confirmed
  `momentumResult` doesn't reach `deriveStance`/`deriveActionZoneState`,
  and this design adds no new engine-side consumption of it.
- **Twelve Data adapter / Decision Engine not redesigned** — confirmed:
  every function `fetchLiveMomentumResult` calls already exists,
  unmodified; `EngineInput`/`EngineOutput`/`runDecisionEngine` are not
  touched again after D.1 (only `PlaybookClientShell`/`page.tsx` gain
  the new prop/call argument).

## 4. Explicit non-goals of this design (deferred, not decided here)

- **No caching / revalidation strategy.** Next.js Server Components
  re-run per request by default; a naive implementation calls Twelve
  Data on every page load. C.7's rate-limit analysis showed this is
  trivial for occasional single-page loads (~4 credits) but would need a
  real strategy (Next's `fetch` cache/`revalidate` options, or an
  explicit refresh interval) before this sees real traffic. Not designed
  here — a natural next checkpoint, not a blocker for D.2's scope.
- **No timeout/retry policy** for the live fetch — a slow Twelve Data
  response would slow the whole page render. Worth a future robustness
  pass; not invented silently here.
- **No user-facing UI signal** for "live vs. fallback momentum data" —
  `EngineOutput.momentumResult` (and, transitively,
  `PlaybookClientShell`) already carries enough information for a future
  UI to show this, but no UI change is designed or implied here. This is
  the same class of limitation D.0 §6 already documented (canonical
  truth lives on `momentumResult`, not `Scorecard.momentum` alone) —
  now also true of "was live data fetched at all," not just "was it
  sufficient."
- **No live `executionPriceEur` wiring.** `EngineInput.executionPriceEur`
  (EUR, used for target-position/concentration sizing) stays the static
  seed value. The USD quote price `scoreMomentum` uses internally for
  Structure/Extension is fully encapsulated inside
  `fetchLiveMomentumResult` — it is not re-exposed or reused for
  anything else. Wiring a live, FX-converted execution price is a
  separate, later integration (would need its own currency-conversion
  design), not attempted here.
- **No portfolio-wide refresh, no interactive "refetch" trigger** — a
  client-triggered refresh would need a Route Handler/Server Action (to
  keep the key server-side while allowing client-initiated re-fetches);
  not designed here since nothing in this checkpoint asks for
  interactivity, only the initial page-load path.
- **No code written** — every snippet above is illustrative.

## 5. Why a Route Handler/Server Action isn't needed for this scope

Considered and set aside, not because it's wrong, but because it's not
the smallest option for what's asked: `page.tsx` is already an `async`
Server Component that can `await` directly. A Route Handler would only
be justified once client-side code needs to *trigger* a fetch (the
explicitly-out-of-scope "interactive refresh" case above). Introducing
one now would be extra surface area for no present benefit — not "the
smallest clean path."

## 6. Architecture conflict check

None found. `fetchLiveMomentumResult` is additive (new file, new
function), the two new props (`initialMomentumResult` /
`momentumResult` argument) are optional and reuse D.1's already-shipped
`EngineInput.momentumResult` field verbatim, and the Server/Client
Component split this design relies on (§1) is Next.js's own existing
architecture for this app, not something introduced or bent here.

## 7. Recommended next step

Not implemented here, per instruction. A D.3 implementation would be
mechanical: create `orchestration.ts` (§2.1), add the one prop to
`page.tsx` and `PlaybookClientShell.tsx` (§2.2), and add tests — a
fixture-based test for `fetchLiveMomentumResult`'s catch-all/fallback
behavior (mirroring `client.test.ts`'s mocked-`fetch` approach; live
network calls stay a manual validation step, per C.8B's own established
convention) plus confirming `PlaybookClientShell.orchestration.test.ts`
still passes unmodified. Caching/timeout/UI-signal work (§4) would each
be their own, later checkpoint.
