import type {
  StockSeed,
  ActionZone,
  Scorecard,
  ResearchDocument,
  TimelineEntry,
} from "@/types/playbook";

export const unitySeed: StockSeed = {
  security: {
    name: "Unity Software Inc.",
    ticker: "U",
    exchange: "NYSE",
    marketCurrency: "USD",
    isin: "US91332U1016",
    executionCurrency: "EUR",
  },
  market: {
    executionPriceEur: 40.46,
    primaryPriceUsd: 47.20,
    dailyChangePct: 2.1,
    updatedAt: "2026-09-04T16:15:00+02:00",
  },
  position: {
    shares: 902,
    averageCostEur: 27.76,
    valueEur: 36494.92,
    unrealizedReturnPct: 45.75,
    portfolioWeightPct: 58.6,
  },
  strategy: {
    horizon: "3–5 years",
    shortTermMaxWeightPct: 50,
    mediumTermTargetMinPct: 40,
    mediumTermTargetMaxPct: 45,
    coreSharesMin: 600,
    coreSharesMax: 650,
    tacticalSharesMin: 250,
    tacticalSharesMax: 300,
    // Spec §14 Relative Strength benchmark (docs/phase-c5-trend-relative-
    // strength-data-contract.md §4) — a broad US market ETF, provided as
    // config data, never hardcoded inside domain logic
    // (computeRelativeStrength takes this as a parameter). Phase C.8B.
    benchmarkInstrumentId: "SPY",
  },
  playbook: {
    stance: "HOLD_GRADUALLY_TRIM",
    confidence: "MEDIUM",
    thesisHealth: "INTACT",
    version: 6,
    updatedAt: "2026-09-04T16:18:00+02:00",
    summary:
      "The operating thesis remains constructive, but your position is still materially above your preferred portfolio concentration.",
  },
};

export const unityActionZones: ActionZone[] = [
  {
    type: "ADD",
    state: "INACTIVE",
    title: "Do not add",
    summary:
      "Do not add while Unity remains above your defined concentration threshold.",
    primaryTrigger:
      "Portfolio exposure must fall materially below target before accumulation is reconsidered.",
    suggestedAction: "No action — do not increase exposure.",
    whyBullets: [
      "Current portfolio weight: 58.6%",
      "Short-term target: below 50%",
      "Additional buying would worsen single-stock concentration",
      "Thesis attractiveness does not override portfolio risk",
    ],
    doNotTriggerIf: [
      "Portfolio exposure remains above your accumulation threshold",
      "Valuation remains elevated relative to earnings expectations",
    ],
  },
  {
    type: "HOLD",
    state: "ACTIVE",
    title: "Maintain long-term core",
    summary: "Hold 600–650 shares while the thesis remains intact.",
    primaryTrigger:
      "Operating thesis remains intact and guidance remains constructive.",
    suggestedAction: "No action required. Maintain the long-term core position.",
    whyBullets: [
      "Long-term upside case remains valid",
      "Operating thesis remains constructive",
      "Position is meaningfully profitable",
      "Core position: 600–650 shares",
    ],
    doNotTriggerIf: [
      "Thesis-break condition emerges",
      "Management materially cuts forward guidance",
    ],
  },
  {
    type: "TRIM_1",
    state: "WATCH",
    title: "Trim Level 1",
    summary:
      "Use stronger price / valuation conditions to reduce concentration.",
    suggestedShares: "50–100",
    primaryTrigger:
      "Price / valuation reaches the defined trim zone while portfolio concentration remains above 50%.",
    suggestedAction: "Consider selling 50–100 tactical shares.",
    whyBullets: [
      "Current portfolio weight: 58.6%",
      "Short-term target: below 50%",
      "Long-term core: 600–650 shares",
      "Tactical inventory remains available (approx. 250–300 shares)",
    ],
    doNotTriggerIf: [
      "Earnings materially improve the valuation range",
      "Portfolio weight falls below target beforehand",
      "You change the core-position strategy",
    ],
  },
  {
    type: "TRIM_2",
    state: "WATCH",
    title: "Trim Level 2",
    summary: "Trim further if valuation expands faster than earnings power.",
    suggestedShares: "75–100",
    primaryTrigger:
      "Further price appreciation without a comparable increase in earnings power or forward expectations.",
    suggestedAction: "Consider selling another 75–125 tactical shares.",
    whyBullets: [
      "Valuation has expanded relative to earnings power",
      "Concentration management remains the priority",
      "Preserve the 600–650-share long-term core",
      "Tactical shares available for further reduction",
    ],
    doNotTriggerIf: [
      "Earnings upgrade justifies the valuation expansion",
      "Concentration has already fallen to target range",
      "Thesis materially strengthens",
    ],
  },
  {
    type: "THESIS_REVIEW",
    state: "CONDITIONAL",
    title: "Review thesis",
    summary: "Triggered by business deterioration, not price alone.",
    primaryTrigger:
      "One or more thesis-break conditions emerge in company fundamentals.",
    suggestedAction:
      "Reassess the full position and thesis. Do not automatically sell on price decline alone.",
    whyBullets: [
      "Management materially cuts guidance",
      "Monetization or advertising recovery weakens persistently",
      "Margin / FCF progress reverses",
      "Major competitive deterioration in core markets",
      "Balance-sheet or liquidity risk increases materially",
      "Execution risk rises to the point of invalidating the recovery case",
    ],
    doNotTriggerIf: [
      "Decline is purely price-driven without fundamental deterioration",
      "Short-term volatility without thesis-break evidence",
    ],
  },
];

export const unityScorecard: Scorecard = {
  fundamentals: { score: 8, state: "Positive" },
  valuation: { score: 5, state: "Neutral" },
  momentum: { score: 7, state: "Positive" },
  thesisHealth: { score: 8, state: "Intact" },
  positionFit: { score: 3, state: "Weak" },
  concentrationRisk: { score: 4, state: "Elevated" },
};

export const unityThesis = {
  text: "Unity can continue its operating recovery through improved monetization, ad-tech execution, cost discipline, and stronger cash-flow generation.",
  horizon: "3–5 years",
  catalysts: [
    "Grow: advertising platform recovery and monetization improvement",
    "Vector: AI-driven monetization progress and adoption",
    "Create: engine business health and developer ecosystem",
    "Operating margin and adjusted EBITDA expansion",
    "Free cash flow generation improvement and cost discipline",
  ],
  risks: [
    "Execution setbacks in product development",
    "Competitive pressure in the gaming engine market",
    "Valuation expansion without matching earnings growth",
    "Advertising cycle weakness",
  ],
  thesisBreakers: [
    "Repeated material forward guidance cuts",
    "Sustained deterioration in advertising and monetization recovery",
    "Failure of key monetization initiatives (Grow, Vector) to produce expected results",
    "Reversal in margin or free-cash-flow trajectory",
    "Major competitive deterioration in core markets",
    "Management execution severe enough to invalidate the recovery case",
    "Materially increased balance-sheet or liquidity risk",
  ],
};

export const unityViewChanges = {
  moreBullish: [
    "Earnings expectations increase materially",
    "Monetization improves faster than expected",
    "Free cash flow and margin expand further",
    "Valuation does not expand at the same pace as earnings",
  ],
  moreCautious: [
    "Forward guidance is cut",
    "Product execution weakens",
    "Cash-flow progress reverses",
    "Concentration increases further before any trimming",
  ],
};

export const unityResearch: ResearchDocument[] = [
  {
    id: "1",
    title: "Unity Q2 2026 Earnings",
    type: "Earnings",
    period: "Q2 2026",
    status: "Processed",
    playbookImpact: "Thesis intact",
    processedAt: "2026-08-14",
  },
  {
    id: "2",
    title: "Unity 2025 Annual Report",
    type: "Annual report",
    period: "FY 2025",
    status: "Processed",
    playbookImpact: "Baseline",
    processedAt: "2026-03-10",
  },
];

export const unityTimeline: TimelineEntry[] = [
  {
    date: "04 Sep 2026",
    type: "PLAYBOOK_UPDATED",
    summary: "Playbook updated",
    detail: "Concentration remains elevated. Stance confirmed: HOLD / TRIM.",
  },
  {
    date: "18 Aug 2026",
    type: "STANCE_CHANGE",
    summary: "Stance changed to HOLD / TRIM",
    detail: "Portfolio concentration reached 58.6%, above medium-term target.",
  },
  {
    date: "12 Jul 2026",
    type: "BUY",
    summary: "BUY — 50 shares @ €31.40",
    detail: "Initial position added to tactical inventory.",
  },
  {
    date: "08 May 2026",
    type: "BUY",
    summary: "BUY — 152 shares @ €36.30",
  },
  {
    date: "14 Feb 2026",
    type: "BUY",
    summary: "BUY — 200 shares @ €31.90",
  },
];

export const whyThisStance = {
  supporting: [
    "Operating thesis remains constructive",
    "Long-term upside case remains valid",
  ],
  constraints: [
    "Unity is 58.6% of the portfolio",
    "Position exceeds your medium-term target of 40–45%",
    "Adding would worsen single-stock concentration",
  ],
};
