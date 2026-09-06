# Unity Software (NYSE: U) — Personal Investment Playbook

**Status:** Reconstructed baseline  
**Purpose:** Real strategy seed for Personal Stock Playbook prototype  
**Reconstructed:** 2026-09-06

> Historical prices and market signals become stale and must be refreshed before live decisions. This file preserves the durable strategy and latest reliable baseline context rather than inventing missing historical levels.

## 1. Position Baseline

```yaml
company: Unity Software Inc.
ticker: U
primary_exchange: NYSE
isin: US91332U1016
broker: Trade Republic
primary_market_currency: USD
execution_currency: EUR

shares: 902
average_cost_eur: 27.76
reference_price_eur: 40.46
portfolio_weight_pct: 58.6
```

At the historical reference price, the position was approximately €36,496 with an unrealized return of about +45.7%.

## 2. Portfolio Objective

The long-term view on Unity is constructive, but a 58.6% single-stock weight is excessive.

The objective is **not to abandon Unity**. It is to gradually reduce concentration while preserving meaningful long-term participation.

```yaml
current_stance: HOLD_GRADUALLY_TRIM
accumulation: inactive
long_term_core_shares: 600-650
tactical_shares: approximately 250-300
short_term_concentration_goal: below 50%
medium_term_concentration_goal: 40-45%
investment_horizon: 3-5 years
```

## 3. Core vs Tactical Position

### Core
- 600–650 shares.
- Intended for roughly a 3–5 year horizon.
- Preserve while the fundamental thesis remains intact.
- Normal price corrections alone are not sufficient reason to liquidate the core.

### Tactical
- Approximately 250–300 shares.
- Used primarily for concentration management.
- Reduce progressively when price, valuation, momentum and portfolio conditions create favorable opportunities.

This structure avoids an all-or-nothing decision.

## 4. Decision Hierarchy

Do not make decisions from price alone.

```text
Fundamental thesis
→ New company evidence
→ Valuation
→ Portfolio concentration
→ Technical / market structure
→ FX / EUR execution conditions
→ Price
→ Action
```

Controlled actions:

```text
BUILD
ADD SELECTIVELY
HOLD
HOLD / WATCH
HOLD / GRADUALLY TRIM
TRIM
REDUCE RISK
THESIS REVIEW
EXIT / AVOID
```

## 5. Dual-Market Framework

### NYSE U / USD — analysis market

Use the primary NYSE market for:
- price discovery;
- volume;
- technical structure;
- support/resistance;
- momentum;
- institutional behavior;
- valuation reference;
- earnings reactions.

### Trade Republic / EUR — execution market

Use the EUR quote for:
- actual execution;
- EUR proceeds;
- EUR cost basis;
- spread;
- execution timing.

**Rule:** Analyze in USD first, then translate actionable levels into EUR using current FX and execution conditions.

## 6. FX Framework

For a EUR-based investor:

```text
EUR total return
≈ Unity USD equity return
+ USD/EUR FX effect
+ execution/spread effects
```

Expected and realized returns should be decomposed into:
1. Unity share-price return;
2. FX contribution/drag;
3. final EUR return.

Never reuse an old fixed USD→EUR action level without refreshing FX.

## 7. Macro Context

Relevant context includes:
- Federal Reserve / interest-rate expectations;
- US growth expectations;
- growth-equity risk appetite;
- US fiscal/debt conditions;
- USD valuation/currency risk;
- broad technology/software market behavior.

Macro context affects valuation and momentum but should not automatically override company fundamentals.

## 8. Fundamental Thesis

Monitor whether Unity continues improving business quality, monetization and operating execution.

Core signals:
- revenue trajectory;
- Grow / advertising performance;
- Vector / AI-driven monetization progress;
- Create business health;
- adjusted EBITDA / operating leverage;
- free cash flow;
- cost discipline;
- management guidance;
- ecosystem health;
- competitive positioning.

## 9. Thesis Health

Use only:

```text
STRENGTHENING
INTACT
MIXED
WEAKENING
BROKEN
```

**Strengthening:** revenue acceleration, better monetization, Vector progress, margin/FCF expansion, raised guidance, stronger execution.

**Intact:** recovery remains broadly on track with no major thesis breaker.

**Mixed:** meaningful positive and negative evidence coexist.

**Weakening:** repeated misses, growth slowdown, monetization weakness, margin/FCF deterioration, guidance cuts.

**Broken:** the original investment case is no longer supported by evidence.

## 10. Thesis Breakers

Potential triggers include:
- repeated material guidance cuts;
- sustained deterioration in advertising/monetization recovery;
- failure of important monetization initiatives to produce expected business improvement;
- material reversal in margin progress;
- material reversal in free-cash-flow progress;
- major competitive deterioration;
- management execution severe enough to invalidate the recovery case;
- materially increased balance-sheet/liquidity risk.

## 11. Price Risk vs Thesis Risk

### Price risk
Examples: support break, large drawdown, weak momentum, broad selloff, high volatility.

Default response:

```text
WATCH → REASSESS → CHECK FUNDAMENTALS
```

Not automatically SELL.

### Thesis risk
Examples: guidance deterioration, business KPI deterioration, monetization failure, FCF reversal, structural competitive problem.

Possible response:

```text
THESIS REVIEW → REDUCE RISK → potentially EXIT
```

Thesis risk has more importance for the long-term core.

## 12. Accumulation Rule

Baseline:

```yaml
add_more_unity: false
```

Do not add merely because:
- the stock falls;
- RSI becomes oversold;
- support is reached;
- valuation becomes cheaper.

Re-enable accumulation only after portfolio concentration is materially reduced **and** the thesis remains intact/strengthening **and** valuation/risk-reward is compelling.

Portfolio concentration is a hard constraint.

## 13. Hold Rule

Maintain the core while:
- thesis remains intact;
- management execution remains acceptable;
- key operating metrics remain constructive;
- no major thesis breaker appears.

Short-term volatility should not automatically change the long-term core strategy.

## 14. Trim Framework

Reduce the tactical position progressively rather than trying to call one perfect top.

```text
TRIM LEVEL 1
→ TRIM LEVEL 2
→ further trim until concentration target is approached
```

Potential triggers combine:
- major resistance / price extension;
- stretched valuation;
- excessive momentum;
- price rising faster than earnings expectations;
- portfolio weight remaining excessive;
- strong post-earnings rally;
- deteriorating market risk/reward.

Exact USD price levels are **dynamic** and must be refreshed.

## 15. Tactical Trim Sizing

Total tactical inventory baseline:

```text
~250–300 shares
```

Illustrative staged sizing:

```text
First trim: ~50–100 shares
Second trim: ~75–100 shares
Additional trim: dynamically calculated
```

Exact sizing should use current shares, price, total portfolio value, target concentration and desired core shares.

## 16. Concentration Rules

```text
Historical baseline       58.6%
Short-term objective      <50%
Medium-term objective     ~40–45%
```

The app should dynamically answer:

> How many shares need to be sold at the current price to reach the next concentration target while respecting the desired core?

## 17. Technical Framework

Technical analysis is primarily for tactical timing, not determining the long-term thesis.

Monitor on NYSE U/USD:
- primary trend;
- 50-day moving average;
- 200-day moving average;
- major support/resistance;
- breakout / failed breakout;
- volume;
- relative strength;
- momentum / RSI when useful;
- post-earnings gap behavior.

A constructive technical setup should not cause the app to add to an already oversized position. It can instead help time planned trims.

## 18. Earnings Framework

After material earnings, compare:

```text
Previous expectations
vs Actual results
vs New guidance
```

Review:
- revenue;
- growth;
- Grow/advertising;
- Vector;
- Create;
- margins;
- adjusted EBITDA;
- free cash flow;
- guidance;
- management commentary.

Then answer:
1. What changed?
2. Did the thesis strengthen or weaken?
3. Did reasonable valuation assumptions change?
4. Should trim zones move?
5. Should the core change?
6. Is concentration still the dominant portfolio risk?

## 19. Earnings Decision Matrix

**Strong earnings + strong guidance:** Thesis strengthens. Do not automatically reactivate ADD while concentration remains excessive. Improved earnings power may justify higher trim thresholds.

**Strong price reaction + unchanged fundamentals:** Valuation becomes less attractive; possible tactical trim opportunity.

**Weak quarter + thesis intact:** HOLD / WATCH; determine whether weakness is temporary.

**Weak results + guidance deterioration:** THESIS REVIEW; tactical exposure may need faster reduction.

**Thesis breaker:** Reassess the long-term core.

## 20. Scorecard

Do not collapse everything into one opaque score.

Evaluate:
- Fundamentals
- Valuation
- Momentum
- Thesis Health
- Position Fit
- Concentration Risk
- Macro / Market Context

The key Unity pattern can be:

```text
Company attractiveness     HIGH
Fundamentals                POSITIVE
Momentum                    POSITIVE
Valuation                   NEUTRAL / ELEVATED
Position fit                POOR
Concentration risk          HIGH

Result:
HOLD / GRADUALLY TRIM
```

A good company can still be a poor incremental portfolio decision.

## 21. Playbook Update Triggers

Refresh when:
- new earnings/annual report appears;
- guidance changes materially;
- major company announcement occurs;
- price/technical structure changes materially;
- portfolio weight changes materially;
- a Unity transaction is recorded;
- FX changes materially;
- macro regime changes materially;
- core-position or concentration targets change.

## 22. Transaction Feedback Loop

Every transaction should update:
- shares;
- average cost where applicable;
- realized/unrealized P/L;
- position value;
- portfolio weight;
- core vs tactical shares;
- distance to concentration targets.

Then reassess stance, tactical shares remaining, target progress, and next trim sizing.

## 23. Evidence Hierarchy

Prefer:
1. company filings / earnings materials;
2. earnings calls / official guidance;
3. reliable structured financial data;
4. primary NYSE market data;
5. high-quality independent analysis;
6. market commentary / sentiment.

Uploaded reports and personal notes should be attached directly to the Unity workspace.

## 24. AI Rules

The analysis engine must:
- never fabricate market/financial data;
- show data timestamps;
- separate facts from interpretation;
- explain conflicting signals;
- consider concentration before ADD;
- use NYSE USD as the primary market signal;
- translate action levels into EUR for execution;
- account for FX in EUR returns;
- prefer staged trims over calling an exact top;
- not treat technical analysis as deterministic;
- not treat a price decline alone as thesis failure;
- preserve the long-term core unless evidence justifies reassessment;
- state uncertainty explicitly.

## 25. Dynamic Fields — Always Refresh

```yaml
current_usd_price: REFRESH
current_eur_price: REFRESH
eur_usd_fx: REFRESH
market_cap: REFRESH
valuation_multiples: REFRESH
earnings_estimates: REFRESH
50dma: REFRESH
200dma: REFRESH
support_levels: REFRESH
resistance_levels: REFRESH
rsi: REFRESH
volume_structure: REFRESH
latest_quarter: REFRESH
latest_guidance: REFRESH
latest_fundamentals: REFRESH
current_portfolio_value: USER_OR_PORTFOLIO_ENGINE
current_portfolio_weight: RECALCULATE
current_shares: TRANSACTION_LEDGER
```

## 26. Durable vs Dynamic

### Durable strategy
- constructive long-term thesis;
- 3–5 year horizon;
- core 600–650 shares;
- tactical ~250–300 shares;
- reduce concentration;
- short-term target below 50%;
- medium-term target 40–45%;
- no adding while concentration is excessive;
- NYSE/USD for analysis;
- EUR/Trade Republic for execution.

### Dynamic state
- current price;
- current shares;
- current portfolio weight;
- technical levels;
- valuation;
- latest earnings/guidance;
- FX;
- stance confidence;
- action-zone prices.

The app should store these separately.

## 27. Seed Object

```json
{
  "security": {
    "company": "Unity Software Inc.",
    "ticker": "U",
    "exchange": "NYSE",
    "isin": "US91332U1016",
    "market_currency": "USD",
    "execution_currency": "EUR"
  },
  "baseline_position": {
    "shares": 902,
    "average_cost_eur": 27.76,
    "reference_price_eur": 40.46,
    "reference_portfolio_weight": 0.586
  },
  "strategy": {
    "horizon": "3-5Y",
    "stance": "HOLD_GRADUALLY_TRIM",
    "accumulation_enabled": false,
    "core_shares": {"min": 600, "max": 650},
    "tactical_shares": {"min": 250, "max": 300},
    "concentration_targets": {
      "short_term_max": 0.50,
      "medium_term_min": 0.40,
      "medium_term_max": 0.45
    }
  },
  "market_framework": {
    "analysis_market": "NYSE_USD",
    "execution_market": "TRADE_REPUBLIC_EUR",
    "fx_sensitive": true
  }
}
```

## 28. Baseline App Explanation

> Unity's long-term thesis remains constructive, but the position is too large relative to the rest of the portfolio. The current priority is therefore not to increase exposure. Preserve the 600–650-share long-term core while using approximately 250–300 tactical shares to reduce concentration progressively when price and valuation conditions are favorable. Reassess the core only if fundamental evidence materially weakens the investment thesis.

## 29. Core Product Lesson

A generic stock system might say:

```text
Fundamentals improving
Momentum positive
→ BUY
```

The personalized Playbook can say:

```text
Fundamentals improving
Momentum positive
BUT
58.6% portfolio concentration
→ HOLD / GRADUALLY TRIM
```

That distinction is the central product insight behind Personal Stock Playbook.

## 30. Reconstruction Note

This file preserves the durable rules and latest reliable baseline facts available from the previous Unity Playbook context.

It intentionally does **not** invent unavailable historical technical price levels, exact old trim thresholds, earnings figures, or transaction history.

Before using it for a live investment decision, refresh market price, FX, holdings, total portfolio value, latest earnings/guidance, valuation, and technical levels.

For the prototype, use this as a **real strategy seed**, not a live market snapshot.
