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
│       └── ...                         # SignalScorecard, ThesisCard, etc.
│
├── domain/                     # Pure TypeScript — zero React imports
│   ├── portfolio/
│   │   ├── concentration.ts    # classifyConcentration, calcTrimSizing, calcTargetShares
│   │   └── accounting.ts       # applyBuy, applySell, previewBuy, previewSell
│   └── playbook/
│       ├── hard-constraints.ts # HC-001, HC-002, HC-003
│       ├── stance-rules.ts     # deriveStance (concentration × thesis health matrix)
│       ├── action-zones.ts     # deriveActionZoneState per zone type
│       └── scoring.ts          # calcPositionFitScore, calcConcentrationRiskScore
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
│   └── playbook.ts             # Full TypeScript type system
│
└── lib/
    └── format.ts               # formatEur, formatPct, formatShares
```

## Decision Engine

The playbook engine runs deterministically on every render inside `PlaybookClientShell`. No AI is involved in calculation. The pipeline:

1. **Concentration** — classify weight vs target (`classifyConcentration`)
2. **Hard constraints** — HC-001 (weight > max), HC-002 (thesis broken), HC-003 (sell breaches core)
3. **Stance** — derived from concentration state × thesis health (`deriveStance`)
4. **Action zones** — each zone state derived from concentration + accumulation enabled (`deriveActionZoneState`)
5. **Scorecard** — position fit (spec §9 formula) + concentration risk re-scored (`recalculateScorecard`)
6. **Trim sizing** — L1 = 30%, L2 = 35%, L3 = remainder of tactical inventory

All thresholds live in `src/config/ruleset-v0.1.ts`. Changing a multiplier flows through automatically.

## Transactions

The "+ Transaction" button opens `AddTransactionModal`. On confirm:

- **BUY** — weighted average cost updates, weight recalculates
- **SELL** — avg cost unchanged (weighted-average accounting, not tax-lot), realized gain = `(sellPrice − avgCost) × shares`
- Full engine re-runs immediately, updating stance, zones, scorecard, tactical inventory, and timeline

## Design Skills (Claude Code)

Four Emil Kowalski design skills are installed project-locally under `.claude/skills/`. Advisory only — do not override product specs or architecture.

| Skill | Invoke | Purpose |
|---|---|---|
| `apple-design` | `/apple-design` | Reviews against Apple design principles (WWDC): fluid interfaces, springs, typography, reduced motion |
| `improve-animations` | `/improve-animations` | Full motion audit across 8 categories — produces plans in `plans/` |
| `review-animations` | `/review-animations` | Reviews a specific diff or component against Emil Kowalski's standards |
| `prototype` | `/prototype` | Guides rapid interactive prototyping |

Installed via `npx skills@1.5.23`. Version hashes tracked in `../skills-lock.json`.

## Docs

| File | Content |
|---|---|
| `docs/playbook-decision-engine-spec-v0.1.md` | Full decision engine specification — calculation formulas, scoring, hard rules, AI boundaries |
| `docs/01-mvp-product-spec.md` | MVP product requirements |
| `docs/02-mvp-ux-system-design.md` | UX system design |
| `docs/03-ui-spec.md` | UI specification |

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The Unity playbook is at `/stocks/U`.
