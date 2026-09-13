# Real Portfolio Model Brief

## Purpose

Define the approved product and architecture boundaries for **Phase G
--- Real Portfolio**. The goal is to replace seed portfolio data with
real user holdings while preserving the existing Stock Position Engine
and Playbook.

## 1. Core Boundary

Portfolio supports: - `CASH` - `STOCK` - `ETF` - `CRYPTO` - `OTHER`

All asset types participate in portfolio accounting where data permits:
total value, market value, allocation/weight, concentration, and return.

For v0.1, **only STOCK supports the Playbook**. ETF, CRYPTO, CASH, and
OTHER are portfolio-only and must not require Fundamentals, Momentum,
Thesis, Strategy, Action Zones, or other stock-specific Playbook data.

## 2. Portfolio as Source of Truth

Portfolio-level values should be derived from holdings rather than
duplicated seed totals.

``` text
Holdings + Cash
      +
Live Prices
      +
FX when required
      ↓
Portfolio Snapshot
      ↓
Total Value
Asset Values
Weights
Concentration
Returns
      ↓
Stock Playbook inputs where applicable
```

The existing `portfolioTotalEur` should eventually become a derived
Portfolio output rather than an independently maintained input.

## 3. Explicit Cash

Cash must be an explicit portfolio asset and part of the denominator
used for allocation and concentration.

``` text
Portfolio
├── CASH
├── STOCK
├── ETF
├── CRYPTO
└── OTHER
```

## 4. Transaction Accounting

Preserve the approved convention:

**Portfolio Total = Securities + Cash**

BUY transfers value from cash to a security. SELL transfers value from a
security to cash. Ignoring fees, taxes, market movement and FX during
execution, the transaction itself should not create or destroy portfolio
value.

Deposits and withdrawals are separate future events and must not be
confused with BUY/SELL.

## 5. Holdings and Instrument Identity

Use a provider-independent representation. A holding will likely need: -
id - asset type - instrument identity - quantity - average cost / cost
basis where applicable - currency

Instrument identity may include symbol/ticker, name, exchange, currency,
and external identifiers. Domain types should not depend directly on
Twelve Data, SEC EDGAR, a broker, or another provider.

## 6. Stored vs Derived

Prefer one source of truth. Generally derive: - market value - portfolio
weight - total portfolio value - concentration - unrealized P&L - return
percentage

Typical relationship:

``` text
quantity × resolved market price
→ market value
→ market value / total portfolio value
→ portfolio weight
```

Avoid independent copies that can drift between Portfolio, Position
Engine, and Playbook.

## 7. Existing Stock Position Engine

Preserve the existing Stock Position Engine unless there is a
demonstrated need to change it.

``` text
Portfolio
├── Cash
├── ETF
├── Crypto
├── Other
└── Stock Holding
       ↓
   Position Engine
       ↓
   Stock Playbook
```

Portfolio accounting provides stock market value, total portfolio value,
weight, and concentration. The Playbook remains responsible only for
supported stock analysis/decisions.

## 8. Multi-Currency Boundary

Design cleanly for: - instrument/native currency - transaction currency
where relevant - portfolio reporting/base currency - FX conversion

EUR may remain the v0.1 reporting currency. Converted values should be
derived from native values + FX rather than maintained as separate
truths. Do not choose a new FX provider during G.0 unless required.

## 9. Holdings vs Live Pricing

Holdings answer: - What do I own? - How much? - What did it cost?

Market data answers: - What is it worth now?

``` text
Portfolio Holdings + Market Data → Portfolio Snapshot
```

Do not embed quote providers into holdings. Stock/ETF pricing may reuse
existing infrastructure later. Crypto can use another provider later.
Cash needs no quote in its own currency.

## 10. Portfolio Snapshot

Support a derived snapshot at an evaluation time. It may eventually
contain: - total value - holdings - cash - market value per holding -
portfolio weight - unrealized P&L where available - portfolio return
where available - pricing/freshness metadata where relevant

Exact types are a G.0 design decision. The snapshot is derived, not
another manually maintained source of truth.

## 11. Missing Data

Preserve: - `MISSING != 0` - missing price != zero value - missing cost
basis != zero cost - missing FX != 1:1 conversion - unavailable return
data must not be fabricated

G.0 must define how incomplete pricing affects totals and weights. If
this creates a real model/product fork, surface **MODEL DECISION
REQUIRED** rather than silently choosing a misleading fallback.

## 12. Portfolio Page Goal

The current Portfolio page should eventually show real derived data: -
total portfolio value - unrealized return where supported - holdings
count - largest position - attention state - allocation/concentration -
holdings and weights - Stock Playbook state for supported stocks

Establish the data foundation before redesigning the Portfolio UI.

## 13. Future Input Paths

### v0.1 --- Manual setup

Users can add holdings/cash manually. Ownership and transaction facts
are user-maintained; market values come from live pricing where
available.

### Future --- CSV / statement import

Broker files can be normalized into deterministic transactions. AI may
help interpret formats, but accounting remains deterministic.

### Future --- Broker integration

A broker adapter may later sync holdings/transactions. The core
Portfolio model must not depend on one broker. Direct broker execution
is not required.

## 14. Asset Capabilities

For v0.1:

``` text
CASH      Portfolio ✓   Playbook ✕
STOCK     Portfolio ✓   Playbook ✓
ETF       Portfolio ✓   Playbook ✕
CRYPTO    Portfolio ✓   Playbook ✕
OTHER     Portfolio ✓   Playbook ✕
```

Use the smallest clean capability representation. Avoid both scattered
stock assumptions and premature generalized frameworks.

## 15. Guardrails

Prefer: - one economic source of truth - deterministic accounting -
derived totals/weights - explicit cash - provider-independent domain
models - additive migration from the Position Engine -
Portfolio/Playbook separation - holdings/market-data separation - honest
missing-data handling - small abstractions

Avoid: - replacing Position Engine unnecessarily - forcing all assets
through stock analysis - duplicate values that can drift -
provider/broker APIs in domain types - implicit leftover cash - missing
values treated as zero - premature CSV/broker integration - Portfolio UI
redesign before trustworthy data

## 16. G.0 Goal

G.0 is **design only**. Inspect the real implementation and propose the
smallest clean model for: - Portfolio - instrument identity -
multi-asset holdings - explicit cash - relationship to Stock Position -
transaction accounting - pricing boundary - Portfolio Snapshot - stored
vs derived values - multi-currency - missing-data behavior - migration
from seed portfolio data

Do not implement.

If the existing architecture creates a genuine product/model fork,
report **MODEL DECISION REQUIRED** rather than silently resolving it.
