# Personal Stock Playbook

A deterministic investment decision tool built with Next.js. Tracks a personal stock portfolio against a written playbook strategy, derives a stance, action zones, and scorecard from pure TypeScript — no AI in the calculation path.

## Architecture

```
src/
├── app/                        # Next.js App Router routes
│   ├── page.tsx                # Portfolio overview (/)
│   └── stocks/[ticker]/        # Stock playbook (/stocks/U)
│       └── page.tsx            # Thin server shell — delegates to PlaybookClientShell
│
├── components/
│   ├── layout/                 # AppShell, sidebar nav
│   ├── portfolio/              # PortfolioHeader, PortfolioSummaryCards, ConcentrationOverview, HoldingsTable
│   └── playbook/               # All playbook-page components
│       ├── PlaybookClientShell.tsx     # Stateful client wrapper — runs engine on every render
│       ├── AddTransactionModal.tsx     # BUY / SELL modal with live preview
│       ├── ActionZoneCard.tsx          # Stateless card button
│       ├── ActionZoneDrawer.tsx        # Right-side slide-in detail panel
│       ├── ActionZoneSection.tsx       # Card list + drawer state
│       ├── actionZoneConfig.ts         # Shared zone label/style config
│       ├── PlaybookStatusBanner.tsx    # Stance, thesis health, confidence
│       ├── PositionAndStrategy.tsx     # My Position + Portfolio Fit cards
│       ├── TimelinePreview.tsx         # Recent activity feed
│       ├── PrimaryActionCard.tsx       # Hero card — the single most relevant action zone right now
│       ├── pickPrimaryZone.ts          # Tie-break: which ACTIVE zone is "the" primary one
│       ├── playbookIcons.ts            # Shared icon families (action/state/reasoning) — see docs/PLAYBOOK_INTERFACE_PRINCIPLES.md §16
│       └── ...                         # SignalScorecard, ThesisCard, etc.
│
├── domain/                     # Pure TypeScript — zero React imports
│   ├── engine.ts                # runDecisionEngine — composition root; EngineOutput, PlaybookSnapshot
│   ├── portfolio/
│   │   ├── concentration.ts    # classifyConcentration, calcTrimSizing, calcTargetShares
│   │   ├── target-position.ts  # deriveTargetPosition — capacity model (spec §21A)
│   │   └── accounting.ts       # applyBuy, applySell, previewBuy, previewSell
│   ├── thesis/
│   │   └── thesis.ts           # deriveThesisHealth, deriveThesisScoreItem — canonical thesis state
│   ├── market-data/
│   │   ├── freshness.ts        # evaluateFreshness — derived on demand, never stored
│   │   └── validation.ts       # structural checks for the raw market-data contract
│   ├── signals/
│   │   ├── signals.ts          # deriveFundamentalsScore / deriveValuationScore / deriveTechnicalScore seam
│   │   ├── momentum.ts         # DMA50/DMA200, RSI (Wilder), relative volume — from raw OHLCV
│   │   ├── trend.ts            # Primary Trend — DMA200 slope over a configurable lookback
│   │   ├── relative-strength.ts # stock vs. benchmark return differential
│   │   ├── momentum-score.ts   # scoreMomentum — 6-dimension anchor-based scoring; MomentumScoreResult
│   │   ├── fundamentals.ts     # deterministic fundamentals derivations (growth, margin, FCF, trends)
│   │   ├── fundamentals-score.ts     # scoreFundamentals — generic, archetype-agnostic engine
│   │   ├── fundamentals-validation.ts # period-metadata structural checks
│   │   └── fundamentals-templates/
│   │       └── growth-software.ts    # GROWTH_SOFTWARE_TEMPLATE (the only v0.1 archetype)
│   └── playbook/
│       ├── hard-constraints.ts # HC-001, HC-002, HC-003
│       ├── stance-rules.ts     # deriveStance (concentration × thesis health matrix)
│       ├── action-zones.ts     # deriveActionZoneState per zone type
│       └── scoring.ts          # calcPositionFitScore, calcConcentrationRiskScore
│
├── infrastructure/
│   └── market-data/
│       ├── twelve-data/         # Twelve Data adapter — client/mapper/orchestration, isolated from domain/
│       └── sec-edgar/           # SEC EDGAR adapter — ticker→CIK, companyfacts, XBRL mapper, cash-flow derivation
│
├── config/
│   └── ruleset-v0.1.ts         # Versioned parameter registry (all thresholds in one place)
│
├── data/
│   ├── unity-seed.ts           # Unity initial position, action zones, scorecard, timeline
│   ├── unity-playbook.md       # Source of truth for Unity strategy parameters
│   └── portfolio-seed.ts       # 5-holding portfolio (Unity, ASML, VWRL, BTC, Other)
│
├── types/
│   ├── playbook.ts             # Full TypeScript type system
│   ├── market-data.ts          # Provider-independent raw/derived market-data contract
│   ├── fundamentals.ts         # Provider-independent raw fundamentals contract + scoring shapes
│   └── evidence-scoring.ts     # EvidenceScoredItem — shared "do we have a score" shape
│
└── lib/
    └── format.ts               # formatEur, formatPct, formatShares
```

## Decision Engine

`runDecisionEngine()` (`src/domain/engine.ts`) is the single composition root. `PlaybookClientShell` calls it once per render and renders its output — it does not sequence domain calls itself. No AI is involved in calculation. The pipeline:

1. **Thesis** — canonical thesis health (`deriveThesisHealth`, `src/domain/thesis/thesis.ts`) — the only source of truth; the scorecard's thesis score is derived from it (`deriveThesisScoreItem`), never independently seeded
2. **Signals** — fundamentals / valuation / technical (`deriveSignals`, `src/domain/signals/signals.ts`) — momentum and fundamentals use the live-scored value when `SCORED` evidence was supplied (see "Signal & Fundamentals Evidence" below), otherwise the seed pass-through; valuation remains seed-only
3. **Concentration** — classify weight vs target (`classifyConcentration`)
4. **Hard constraints** — HC-001 (weight > max), HC-002 (thesis broken), HC-003 (sell breaches core — enforced in `AddTransactionModal`, blocks Confirm)
5. **Stance** — derived from concentration state × thesis health (`deriveStance`) — `HOLD_GRADUALLY_TRIM` (severely overweight) and `HOLD_TRIM` (overweight) are distinct stances
6. **Action zones** — each zone state derived from concentration + accumulation enabled (`deriveActionZoneState`)
7. **Scorecard** — position fit (spec §9 formula) + concentration risk + thesis health re-scored (`recalculateScorecard`)
8. **Trim sizing** — L1 = 30%, L2 = 35%, L3 = remainder of tactical inventory

`EngineOutput` is grouped by layer:

```ts
{
  concentration: { state, targetShares, sharesToTarget, tacticalInventory, trimSizing },
  thesis: { health },
  constraints: { hc001, hc002, fired, accumulationEnabled },
  stance,
  actionZones,
  scorecard,
  targetPosition,     // spec §21A capacity model — complements concentration, doesn't replace it
  momentumResult,     // full MomentumScoreResult when live evidence was supplied — canonical evidence source
  fundamentalsResult, // full FundamentalsScoreResult when live evidence was supplied — canonical evidence source
}
```

All thresholds live in `src/config/ruleset-v0.1.ts`. Changing a multiplier flows through automatically.

`EngineInput.momentumResult`/`fundamentalsResult` are optional — when
supplied and `SCORED`, `scorecard.momentum`/`.fundamentals` use the
live value; when absent or `INSUFFICIENT_DATA`, the legacy seed
pass-through is preserved unchanged, never fabricated. Evidence never
directly drives stance/hard constraints/concentration/sizing — the one
exception is a narrow, defensive-only gate: confirmed weak live
momentum can additionally disable the ADD action zone (never grant it,
never override HC-001/002/thesis). See `docs/PHASE-D-INTEGRATION-GUIDE.md`
for the "evidence is not the decision" boundary this follows.

## Transactions

The "+ Transaction" button opens `AddTransactionModal`. On confirm:

- **BUY** — weighted average cost updates, weight recalculates
- **SELL** — avg cost unchanged (weighted-average accounting, not tax-lot), realized gain = `(sellPrice − avgCost) × shares`
- Confirm is disabled while HC-003 is triggered (sell would breach the core-share minimum) — not just a warning banner
- Full engine re-runs immediately, updating stance, zones, scorecard, tactical inventory, and timeline

## Signal & Fundamentals Evidence

Two independent, deterministic evidence engines feed the Scorecard —
neither ever assigns a stance, bypasses a hard constraint, or fabricates
a score when data is missing:

- **Momentum** (`src/domain/signals/momentum-score.ts`) — six spec §14
  dimensions (Primary Trend, 50/200DMA Structure, Relative Strength,
  Volume Confirmation, RSI, Price Extension), each independently
  `AVAILABLE`/`MISSING`, blended only over available evidence, with a
  minimum-evidence gate (`INSUFFICIENT_DATA` instead of a fabricated
  low-confidence score). Wired to live Twelve Data prices via
  `fetchLiveMomentumResult` (`src/infrastructure/market-data/
  twelve-data/orchestration.ts`) — see "Live Market Data" below.
- **Fundamentals** (`src/domain/signals/fundamentals-score.ts`) — a
  generic, archetype-agnostic engine consuming a `FundamentalsTemplate`
  (currently one archetype, `GROWTH_SOFTWARE_TEMPLATE`): Revenue
  Growth, Growth Trend, Operating Margin, Margin Trend, FCF Margin,
  Guidance, and Balance Sheet (net-cash-to-revenue). Wired to live SEC
  EDGAR structured XBRL data (`fetchLiveFundamentalsResult`,
  `src/infrastructure/market-data/sec-edgar/orchestration.ts`) — a
  free, $0/month v0.1 provider, per
  `docs/phase-e7a-sec-edgar-structured-fundamentals-adapter-design.md`
  and `docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md`
  (cumulative-fact quarterly cash-flow derivation). Guidance is not
  AI-extracted in v0.1 — it stays `MISSING` from EDGAR alone, never
  fabricated. See "Live Fundamentals Data" below.

Both reuse the same `MISSING != 0` semantics (`DataField<T>`,
`src/types/market-data.ts`), the same anchor-based 0–100 normalization
pattern, and the same `EvidenceScoredItem` seam into the Scorecard. All
non-spec-given numeric anchors/weights are versioned v0.1 hypotheses,
not empirically validated — see each phase design doc under `docs/`.

## Live Market Data

The momentum pipeline can pull real prices/history from
[Twelve Data](https://twelvedata.com). Create `.env.local` in the
project root with:

```
TWELVE_DATA_API_KEY=your-key-here
```

`.env.local` is gitignored and never committed. Without a key
configured, `fetchLiveMomentumResult` fails closed — the app falls back
to the existing seed `scorecard.momentum` value, never a thrown error.
A one-off manual validation script (not part of the test suite, since
it makes real network calls) confirms the live pipeline end-to-end:

```bash
npm run validate:live-market-data
```

## Live Fundamentals Data

The Fundamentals evidence engine pulls real structured XBRL data from
[SEC EDGAR](https://www.sec.gov/edgar) — free, no API key, but SEC's
fair-access policy requires an identifying User-Agent. Add to
`.env.local`:

```
SEC_EDGAR_USER_AGENT=<app name> <contact email>
```

Without it configured, `fetchLiveFundamentalsResult` fails closed —
same "never throw, fall back to the existing seed value" contract
`fetchLiveMomentumResult` already follows. A one-off manual validation
script confirms the live pipeline end-to-end (ticker→CIK resolution,
companyfacts fetch, XBRL mapping, quarterly cash-flow derivation):

```bash
npm run validate:live-sec-edgar-fundamentals
```

## Design Skills (Claude Code)

Four Emil Kowalski design skills are installed project-locally under `.claude/skills/`. Advisory only — do not override product specs or architecture.

| Skill | Invoke | Purpose |
|---|---|---|
| `apple-design` | `/apple-design` | Reviews against Apple design principles (WWDC): fluid interfaces, springs, typography, reduced motion |
| `improve-animations` | `/improve-animations` | Full motion audit across 8 categories — produces plans in `plans/` |
| `review-animations` | `/review-animations` | Reviews a specific diff or component against Emil Kowalski's standards |
| `prototype` | `/prototype` | Guides rapid interactive prototyping |

Installed via `npx skills@1.5.23`. Version hashes tracked in `../skills-lock.json`.

## Testing

```bash
npm test
```

Vitest (`vitest.config.ts`), no jsdom — every test is a pure-function domain test, no React rendering (485 tests across 36 files). Covers the engine pipeline end-to-end (Unity baseline, BUY/SELL, overweight concentration, hard-constraint-disabled ADD, HOLD/TRIM stance, tactical trim sizing), the thesis/signals/momentum/fundamentals seams, the Twelve Data and SEC EDGAR adapters (mocked HTTP, no live calls), Phase B.5's full algorithm-validation suite (`src/domain/validation/`), and a static guardrail proving `PlaybookClientShell` never imports individual domain modules directly.

## Docs

`docs/` holds one design/validation doc per checkpoint — the full
decision trail (why a rule is shaped the way it is), not just the
current state. Start here:

| File | Content |
|---|---|
| `docs/playbook-decision-engine-spec-v0.1.md` | Full decision engine specification — calculation formulas, scoring, hard rules, AI boundaries |
| `docs/VALIDATION_PROTOCOL.md` | The checkpoint process every phase since B.5 follows — classification taxonomy, stop conditions, reporting format |
| `docs/PHASE-D-INTEGRATION-GUIDE.md` | The "evidence is not the decision" boundary governing how Momentum/Fundamentals integrate with Scorecard/stance/action zones |
| `docs/phase-b5-algorithm-validation.md` | Phase B.5 roadmap + closeout — every deferred item, resolved or still open |
| `docs/PLAYBOOK_INTERFACE_PRINCIPLES.md` | UI/UX principles governing the stock-detail page, including §16 Semantic Visual Language (stable icon families for actions/states/reasoning) |
| `docs/REAL_PORTFOLIO_MODEL_BRIEF.md` | Product/architecture brief for Phase G — replacing seed portfolio data with real multi-asset holdings |
| `docs/phase-g0-real-portfolio-data-model.md` | Phase G.0 — real Portfolio/Holding/Transaction data model **design** (not yet implemented) |

Everything else in `docs/` (and `docs/validation/`) is a per-checkpoint
design or validation record (`phase-c*`, `phase-d*`, `phase-e*`,
`phase-f*`, `phase-g*`), each self-contained and cross-referenced from
the ones that build on it.

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Unity playbook is at `/stocks/U`.
