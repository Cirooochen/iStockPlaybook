// Versioned parameter registry — spec §32
// All thresholds live here. Never scatter magic numbers through application code.
export const RULESET_VERSION = "0.1";

export const RULESET = {
  version: RULESET_VERSION,
  concentration: {
    // §8 — concentration state multipliers relative to target_max
    moderateMultiplier: 1.15, // target × 1.15 → MODERATELY_OVERWEIGHT boundary
    severeMultiplier: 1.30,   // target × 1.30 → SEVERELY_OVERWEIGHT boundary
  },
  trimStaging: {
    // §21 — staging fractions of max tactical trim
    level1Fraction: 0.30,
    level2Fraction: 0.35,
    // level3 = remainder
  },
  positionFit: {
    // §9 — position fit score formula coefficient
    // score = max(0, 100 − penaltyCoefficient × excess_ratio)
    penaltyCoefficient: 200,
  },
  confidence: {
    // §24 — confidence classification thresholds
    mediumThreshold: 0.55,
    highThreshold: 0.80,
  },
  // Phase H.2/H.3 — Playbook Onboarding deterministic strategy mapping
  // (docs/phase-h2-deterministic-strategy-mapping.md,
  // docs/phase-h3-playbook-onboarding-ux.md §11). Every number here is a
  // named, versioned v0.1 POLICY HYPOTHESIS, explicitly approved by the
  // user during H.2/H.3 — not derived from Unity's own configuration and
  // not a universal investment rule or recommendation.
  strategyDefaults: {
    // docs/phase-h2-deterministic-strategy-mapping.md §2 — per-role
    // target allocation range. accumulationCeilingPct is DERIVED from
    // maxPct (below), never an independent per-role number.
    roleTargetAllocation: {
      LONG_TERM_CORE: { minPct: 20, maxPct: 30 },
      GROWTH: { minPct: 10, maxPct: 18 },
      TACTICAL: { minPct: 3, maxPct: 8 },
    },
    // accumulationCeilingPct = targetAllocationRange.maxPct + this buffer.
    accumulationCeilingBufferPct: 5,
    // docs/phase-h2-deterministic-strategy-mapping.md §3 — symmetric
    // percentage band around coreCenterShares (= corePortion fraction ×
    // current shares at confirmation time). Deliberately NOT derived from
    // Unity's own (undocumented, ≈±4%) 600–650 core range.
    coreBandHalfWidthPct: 0.08,
    // docs/phase-h3-playbook-onboarding-ux.md §11 — Core Protection
    // question's qualitative-answer → fraction mapping. Three coarse
    // buckets only ("All of it" deliberately removed) — Core Protection
    // represents a fuzzy, personal judgment about what portion of a
    // holding is permanent, not a precise allocation calculation. No
    // custom percentage/share input exists in v0.1; "I'm not sure yet"
    // stays unresolved rather than forcing a falsely precise choice.
    corePortionBuckets: {
      MOST_OF_IT: 0.75,
      ABOUT_HALF: 0.50,
      A_SMALLER_PART: 0.25,
    },
  },
  // docs/phase-h2-deterministic-strategy-mapping.md §8.1 — exists ONLY
  // because the legacy ScoreItem type has no "unknown" representation.
  // Used for a newly onboarded stock's Scorecard dimensions that have no
  // live evidence (or no evidence pipeline at all, e.g. valuation) — this
  // is NOT a claim of a real Neutral assessment. The real evidence status
  // (SCORED/INSUFFICIENT_DATA/MISSING, plus fundamentals' modelFit) must
  // always be read from ResearchEvidence/EngineOutput alongside it, never
  // inferred from this placeholder value.
  compatibilityPlaceholders: {
    scorecardItem: { score: 5, state: "Neutral" },
  },
  technical: {
    // §14 — Technical/Momentum Engine. Phase C.3: lookback windows for the
    // derived signals in src/domain/signals/momentum.ts. dma50Period/
    // dma200Period are the standard, unambiguous SMA window lengths.
    // relativeVolumeWindow is this contract's own explicit convention (see
    // momentum.ts's doc comment) — not a universally standardized value.
    dma50Period: 50,
    dma200Period: 200,
    relativeVolumeWindow: 20,
    // Approved 2026-09-09 (Phase C.3 resolution): Wilder's original (1978)
    // smoothing — see src/domain/signals/momentum.ts's computeRsi doc
    // comment for the full formula and edge cases.
    rsiPeriod: 14,
    // Phase C.4/C.6 — DerivedTechnicalSignals (+ explicit current price,
    // trend, relative strength) -> momentum score normalization. v0.1
    // hypothesis throughout, same caveat as spec §24's confidence weights
    // ("these weights are hypotheses"). All 6 of spec §14's named
    // dimensions are now implemented — see
    // src/domain/signals/momentum-score.ts's doc comment.
    momentum: {
      // Component weights: spec §14's own literal percentages for all six
      // dimensions (Momentum/RSI 10%, Volume Confirmation 15%, 50DMA/
      // 200DMA Structure 20%, Price Extension 10%, Primary Trend 25%,
      // Relative Strength 20% — summing to exactly 1.00, spec's full
      // original weighting) used AS-IS, not pre-renormalized —
      // scoreMomentum() renormalizes over whichever components are
      // AVAILABLE/applicable at blend time, so these stay traceable to
      // spec's literal numbers rather than hand-computed ratios.
      rsiWeight: 0.10,
      relativeVolumeWeight: 0.15,
      structureWeight: 0.20,
      priceExtensionWeight: 0.10,
      // Approved 2026-09-10 (Phase C.6 resolution).
      trendWeight: 0.25,
      relativeStrengthWeight: 0.20,
      // Minimum fraction of the APPLICABLE weight total (spec §14's full
      // 1.00, minus any NOT_APPLICABLE component's weight — see
      // scoreMomentum's coverage.applicableWeight) that must be backed by
      // AVAILABLE components before a real score is produced (goal 4 — a
      // minimum-evidence gate). Below this, scoreMomentum() returns
      // INSUFFICIENT_DATA instead of a thin, low-evidence number. A
      // proportional share, so it scales naturally as dimensions are
      // added or become inapplicable.
      minimumAvailableWeightShare: 0.5,
      // RSI anchor-based normalization — same bounded continuous
      // interpolation pattern as spec §11's revenue-growth anchors,
      // operationalizing spec §14's own prose: 50–70 constructive, >80
      // "strong but extended" (extension risk — score is discounted, not
      // simply the highest), <30 oversold (NOT automatically bullish —
      // never inverted to a high score). Anchors sit at spec's own named
      // breakpoints (30/50/70/80).
      rsiAnchors: [
        [0, 20],
        [30, 35],
        [50, 60],
        [70, 85],
        [80, 70],
        [100, 45],
      ],
      // Relative volume anchor-based normalization: 1.0 = normal volume
      // (neutral baseline), scaled up/down from there. No spec-given
      // anchors exist for this dimension (unlike RSI) — this is this
      // contract's own explicit, documented v0.1 hypothesis, not a named
      // industry-standard curve.
      relativeVolumeAnchors: [
        [0, 20],
        [0.5, 40],
        [1.0, 50],
        [2.0, 75],
        [3.0, 90],
      ],
      // 50DMA/200DMA Structure: spec §14 defines this as PRICE-relative
      // ("price > 50DMA > 200DMA -> constructive"), considering all three
      // pairwise relationships (price-vs-50DMA, price-vs-200DMA,
      // 50DMA-vs-200DMA) together. Of the 3! = 6 real-number orderings of
      // (price, dma50, dma200) — 2 of the 8 raw true/false combinations are
      // mathematically impossible by transitivity — this table scores each
      // ordering explicitly, symmetric around a neutral 50 (see
      // momentum-score.ts's scoreStructure for exactly which comparisons
      // map to which key):
      structureAnchors: {
        fullBullish: 90, // price > dma50 > dma200 — spec's explicit "constructive" example
        priceStrongRegimeBearish: 70, // price > dma200 > dma50 — strong bounce, MA regime not yet confirmed bullish
        pullbackInUptrend: 60, // dma50 > price > dma200 — healthy pullback within a bullish MA regime
        bounceInDowntrend: 40, // dma200 > price > dma50 — early recovery attempt within a bearish MA regime
        breakdownInUptrend: 30, // dma50 > dma200 > price — price broke down within a still-bullish MA regime
        fullBearish: 10, // dma200 > dma50 > price — mirror of fullBullish, most bearish
      },
      // Price Extension: spec §14's own ratios,
      // extension_50dma = (price - dma50) / dma50 and
      // extension_200dma = (price - dma200) / dma200. Each is normalized
      // independently via this SAME anchor curve, then averaged with equal
      // weight (a v0.1 hypothesis — spec gives no basis to weight one MA's
      // extension over the other). Hump-shaped like the RSI curve, for the
      // same reason: a modest positive extension is constructive, but a
      // large one carries mean-reversion/pullback risk rather than simply
      // scoring higher the further price runs from the average.
      priceExtensionAnchors: [
        [-0.20, 15],
        [-0.05, 35],
        [0, 50],
        [0.05, 75],
        [0.15, 60],
        [0.30, 35],
      ],
      // Primary Trend anchor-based normalization — approved 2026-09-10
      // (Phase C.6 resolution, docs/phase-c6-trend-relative-strength-normalization-design.md
      // §3). Monotonic (NOT hump-shaped like RSI/Extension) — a rising
      // 200DMA has no "too extended" ceiling in this design, so stronger
      // positive trendSlope simply scores higher, all the way to the
      // clamp. Symmetric around a neutral 50 at trendSlope = 0. Domain is
      // narrower than relativeStrengthAnchors below, reflecting DMA200's
      // inherently slow-moving nature relative to a 63-day return
      // differential.
      trendAnchors: [
        [-0.05, 10],
        [-0.01, 35],
        [0, 50],
        [0.01, 65],
        [0.05, 90],
      ],
      // Relative Strength anchor-based normalization — approved
      // 2026-09-10 (Phase C.6 resolution, same doc §4). Monotonic, same
      // reasoning as trendAnchors. Wider domain than trendAnchors,
      // reflecting a 63-trading-day return differential's typically
      // larger magnitude than a 20-day DMA200 percentage change.
      relativeStrengthAnchors: [
        [-0.20, 10],
        [-0.05, 35],
        [0, 50],
        [0.05, 65],
        [0.20, 90],
      ],
    },
    // Phase C.5 resolution (2026-09-10) — approved v0.1 Primary Trend
    // convention: percentage change of DMA200 over this lookback
    // (trendSlope = DMA200_current / DMA200_lookbackAgo - 1).
    trend: {
      // 20 trading days (~1 month) is a v0.1 HYPOTHESIS, not an
      // empirically validated value — see
      // docs/phase-c5-trend-relative-strength-data-contract.md §3.
      dma200SlopeLookbackDays: 20,
    },
    // Phase C.5 resolution — approved v0.1 Relative Strength convention:
    // return differential over a single configured aligned window
    // (relativeStrength = stockReturn - benchmarkReturn).
    relativeStrength: {
      // 63 trading days (~1 quarter) is a v0.1 HYPOTHESIS, not
      // empirically validated — see
      // docs/phase-c5-trend-relative-strength-data-contract.md §4.
      comparisonWindowTradingDays: 63,
    },
  },
  // §11 — Fundamental Engine. Phase E.0-E.1D. GROWTH_SOFTWARE is the only
  // v0.1 archetype (docs/phase-e0-fundamentals-evidence-contract-design.md
  // §5.1) — a future archetype (bank, biotech, ...) adds its own sibling
  // key here, not a variant of this one.
  //
  // Every anchor/weight below is a VERSIONED V0_1_INVESTMENT_HYPOTHESIS
  // unless explicitly marked SPEC_DEFINED — see
  // docs/phase-e1d-fundamentals-anchor-calibration-v0.1.md, whose own
  // top-of-file disclaimer applies here verbatim: none of this is
  // empirically validated, none of it is tuned to Unity or any other
  // specific company, same caveat spec's own line 6 states for every
  // v0.1 numeric parameter in this project.
  //
  // Per instruction, each dimension keeps its OWN anchor array even where
  // the current v0.1 proposal happens to use identical numbers to another
  // dimension (revenueGrowthAnchors / operatingMarginAnchors /
  // fcfMarginAnchors are NOT aliased to one shared constant, and
  // growthTrendAnchors / marginTrendAnchors are NOT aliased to each
  // other) — so recalibrating one dimension later never silently moves
  // another.
  fundamentals: {
    growthSoftware: {
      // Weights — spec §11's own literal percentages, verbatim, summing
      // to exactly 1.00 (confirmed docs/phase-e1d-fundamentals-anchor-
      // calibration-v0.1.md §1). SPEC_DEFINED.
      revenueGrowthWeight: 0.20,
      growthTrendWeight: 0.10,
      operatingMarginWeight: 0.15,
      marginTrendWeight: 0.10,
      fcfMarginWeight: 0.20,
      guidanceWeight: 0.15,
      balanceSheetWeight: 0.10,
      // Minimum fraction of applicable weight that must be backed by
      // AVAILABLE components before scoreFundamentals() produces a real
      // score — same mechanism/role as
      // technical.momentum.minimumAvailableWeightShare above, its own
      // independent v0.1 hypothesis for this archetype.
      minimumAvailableWeightShare: 0.5,
      // Revenue Growth — SPEC_DEFINED. Spec §11's own worked example,
      // cited verbatim. Asymmetric: 0% growth is already below neutral
      // for this archetype — a growth-software company needs real
      // growth to be unremarkable.
      revenueGrowthAnchors: [
        [-0.10, 0],
        [0, 30],
        [0.10, 50],
        [0.20, 70],
        [0.30, 85],
        [0.40, 100],
      ],
      // Operating Margin — EXISTING_MODEL_PRECEDENT (docs/phase-e1d-
      // fundamentals-anchor-calibration-v0.1.md §3.3): reuses Revenue
      // Growth's exact curve wholesale, not just its shape — "higher is
      // better, low-double-digits roughly neutral" applies to both for
      // the same archetype reasons, and no basis exists here to argue
      // they should diverge. A deliberately independent constant from
      // revenueGrowthAnchors (kept separate per instruction) so a future
      // recalibration of one never silently moves the other.
      operatingMarginAnchors: [
        [-0.10, 0],
        [0, 30],
        [0.10, 50],
        [0.20, 70],
        [0.30, 85],
        [0.40, 100],
      ],
      // FCF Margin — EXISTING_MODEL_PRECEDENT, same reasoning/curve as
      // Operating Margin above (design doc §3.5) — independent constant,
      // not aliased.
      fcfMarginAnchors: [
        [-0.10, 0],
        [0, 30],
        [0.10, 50],
        [0.20, 70],
        [0.30, 85],
        [0.40, 100],
      ],
      // Growth Trend — EXISTING_MODEL_PRECEDENT: technical.momentum's own
      // trendAnchors shape, geometrically scaled x3 in domain (design
      // doc §3.2) — quarterly fundamentals deltas plausibly swing more
      // than a 20-trading-day DMA200 percentage change. Monotonic,
      // symmetric around neutral (50) at delta = 0.
      growthTrendAnchors: [
        [-0.15, 10],
        [-0.03, 35],
        [0, 50],
        [0.03, 65],
        [0.15, 90],
      ],
      // Margin Trend — EXISTING_MODEL_PRECEDENT, same shape as Growth
      // Trend (design doc §3.4) — independent constant, not aliased: no
      // basis exists to argue growth-rate deltas and margin deltas have
      // different typical volatility for this archetype, so sharing the
      // same NUMBERS is a deliberate choice, but each dimension keeps its
      // own named array per instruction.
      marginTrendAnchors: [
        [-0.15, 10],
        [-0.03, 35],
        [0, 50],
        [0.03, 65],
        [0.15, 90],
      ],
      // Balance Sheet (netCashToRevenue) — V0_1_INVESTMENT_HYPOTHESIS,
      // the one genuinely new curve (design doc §3.7): monotonic-then-
      // plateau, approved docs/phase-e1c-fundamentals-normalization-
      // design.md §7.1 — never declines. Breakeven (net cash = net debt)
      // lands on neutral (50), mirroring trendAnchors/
      // relativeStrengthAnchors' own "metric = 0 -> score 50" convention.
      // The plateau (any value >= 0.75 clamps to 85) and the floor (any
      // value <= -0.50 clamps to 10) are both free consequences of
      // interpolateAnchors' existing clamping behavior — no special-case
      // logic needed.
      netCashToRevenueAnchors: [
        [-0.50, 10],
        [-0.15, 30],
        [0, 50],
        [0.30, 70],
        [0.75, 85],
      ],
      // Guidance's spec §12 mapping is a discrete lookup
      // (mapGuidanceEvidenceToScore, src/domain/signals/fundamentals.ts),
      // not an anchor curve — no config entry needed here.
    },
  },
} as const;
