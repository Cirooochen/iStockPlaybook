"use client";

import { useState } from "react";
import type {
  StockSeed,
  ActionZone,
  Scorecard,
  TimelineEntry,
} from "@/types/playbook";
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";
import type { EvRevenueCheckpoint } from "@/domain/signals/valuation-checkpoints";

// Domain
import { applyBuy, applySell } from "@/domain/portfolio/accounting";
import { runDecisionEngine, type MomentumScoreResult, type FundamentalsScoreResult } from "@/domain/engine";

// Sections
import { StockHeader } from "@/components/playbook/StockHeader";
import { PlaybookStatusBanner } from "@/components/playbook/PlaybookStatusBanner";
import { PrimaryActionCard } from "@/components/playbook/PrimaryActionCard";
import { PositionAndStrategy } from "@/components/playbook/PositionAndStrategy";
import { ActionZoneSection } from "@/components/playbook/ActionZoneSection";
import { SignalScorecard } from "@/components/playbook/SignalScorecard";
import { BusinessTrajectoryCard } from "@/components/playbook/BusinessTrajectoryCard";
import { deriveBusinessTrajectory } from "@/domain/signals/business-trajectory";
import { RecentChangesCard } from "@/components/playbook/RecentChangesCard";
import { deriveFundamentalChangeEvidence } from "@/domain/signals/fundamental-change-evidence";
import { ValuationContextCard } from "@/components/playbook/ValuationContextCard";
import { deriveValuationContext } from "@/domain/signals/valuation-context";
import type { FundamentalsModelFit } from "@/domain/playbook/fundamentals-model-fit";
import { TimelinePreview } from "@/components/playbook/TimelinePreview";
import { AddTransactionModal } from "@/components/playbook/AddTransactionModal";
import { pickPrimaryZone } from "@/components/playbook/pickPrimaryZone";

interface Props {
  seed: StockSeed;
  initialZones: ActionZone[];
  initialScorecard: Scorecard;
  initialTimeline: TimelineEntry[];
  initialPortfolioTotalEur: number;
  // Real cash currently available to fund a BUY (G.6).
  availableCashEur: number;
  /**
   * Called after a BUY/SELL is confirmed — the caller (StockDetailClientShell)
   * is responsible for actually updating the real Holding + Cash portfolio
   * state and persisting it (G.6). This component no longer owns a
   * second, ephemeral copy of position/portfolioTotalEur — `seed.position`
   * and `initialPortfolioTotalEur` are themselves always the live values,
   * recomputed by the caller from the real portfolio on every render.
   */
  onTransaction: (type: "BUY" | "SELL", shares: number, priceEur: number) => void;
  /**
   * Live momentum evidence, fetched once server-side per page load
   * (src/app/stocks/[ticker]/page.tsx) — undefined when no live data was
   * fetched or the fetch failed, which runDecisionEngine already treats
   * identically to "no live data available" (Phase D.0/D.1). Not
   * re-fetched on client-side re-renders, same as the other `initial*`
   * props.
   */
  initialMomentumResult?: MomentumScoreResult;
  /**
   * Live fundamentals evidence, fetched once server-side per page load
   * (src/app/stocks/[ticker]/page.tsx) — undefined when no live data was
   * fetched or the fetch failed, which runDecisionEngine already treats
   * identically to "no live data available" (Phase E.3/E.4, mirroring
   * momentumResult exactly). Not re-fetched on client-side re-renders,
   * same as the other `initial*` props.
   */
  initialFundamentalsResult?: FundamentalsScoreResult;
  /**
   * Phase I.5 — the raw periods/periodType behind `initialFundamentalsResult`,
   * from the SAME server-side fetch (docs/phase-i-minimum-research-evidence.md
   * §14 — the plumbing gap that used to discard RawFundamentalsData after
   * scoring). Consumed only by deriveFundamentalChangeEvidence below;
   * runDecisionEngine/EngineInput never see these — the decision engine
   * is unaffected by this prop's existence. `undefined` when the live
   * fetch failed or ticker resolution failed, same as the other
   * `initial*` props; deriveFundamentalChangeEvidence honestly reports
   * MISSING for an empty periods array, so no special-casing is needed
   * at the call site below.
   */
  initialFundamentalsPeriods?: RawFundamentalsPeriod[];
  initialFundamentalsPeriodType?: FundamentalsPeriodType;
  /**
   * Phase I.4B — live EV/Revenue checkpoints (Phase I.4A), from a
   * SEPARATE server-side fetch (src/app/stocks/[ticker]/page.tsx)
   * alongside initialFundamentalsResult. Consumed only by
   * deriveValuationContext below; runDecisionEngine/EngineInput never
   * see these — the decision engine is unaffected. `undefined` when the
   * live fetch failed; an empty array when every candidate checkpoint's
   * required evidence is genuinely missing (Unity's real shape) —
   * deriveValuationContext already treats both as "Not available," so no
   * special-casing is needed at the call site below.
   */
  initialEvRevenueCheckpoints?: EvRevenueCheckpoint[];
  /**
   * Post-Phase-H Trust Cleanup (docs/post-phase-h-product-review.md F4)
   * — the same isUnity-derived signal StockDetailClientShell already
   * computes, threaded through so SignalScorecard can disclose it
   * alongside the Fundamentals row rather than letting an unsupported/
   * limited archetype fit read with the same authority as a confirmed
   * one.
   */
  fundamentalsModelFit: FundamentalsModelFit;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PlaybookClientShell({
  seed,
  initialZones,
  initialScorecard,
  initialTimeline,
  initialPortfolioTotalEur,
  availableCashEur,
  onTransaction,
  initialMomentumResult,
  initialFundamentalsResult,
  initialFundamentalsPeriods,
  initialFundamentalsPeriodType,
  initialEvRevenueCheckpoints,
  fundamentalsModelFit,
}: Props) {
  const { market, strategy, playbook, position } = seed;
  // Always the live value from the caller — see the onTransaction doc
  // comment above for why this is no longer a separate local copy.
  const portfolioTotalEur = initialPortfolioTotalEur;

  // ── Mutable state ──────────────────────────────────────────────────────────
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initialTimeline);
  const [showModal, setShowModal] = useState(false);
  const [suggestedZone, setSuggestedZone] = useState<ActionZone | undefined>(undefined);

  // ── Engine pipeline — runs deterministically on every render ───────────────
  // The shell only renders engine output; it does not orchestrate domain calls.

  const engine = runDecisionEngine({
    position,
    portfolioTotalEur,
    executionPriceEur: market.executionPriceEur,
    strategy,
    thesisHealth: playbook.thesisHealth,
    scorecard: initialScorecard,
    actionZoneTemplates: initialZones,
    momentumResult: initialMomentumResult,
    fundamentalsResult: initialFundamentalsResult,
  });

  // Phase I.3 — a pure presentation-layer read of the engine's own
  // already-computed fundamentalsResult (no new fetch, no engine change).
  // See src/domain/signals/business-trajectory.ts's doc comment for why
  // this reads growthTrend/marginTrend directly rather than adding a new
  // aggregate score.
  const businessTrajectory = deriveBusinessTrajectory(engine.fundamentalsResult);

  // Phase I.5 — reads raw periods directly (never engine.fundamentalsResult
  // or any scored value), per src/domain/signals/fundamental-change-evidence.ts's
  // own doc comment on why this bypasses the scoring/template layer
  // entirely. An empty array/default periodType when the live fetch
  // failed correctly and honestly resolves to MISSING for both lines —
  // computeRevenueGrowth/computeOperatingMargin already treat an empty
  // periods array as MISSING, so no special-casing is needed here.
  const fundamentalChangeEvidence = deriveFundamentalChangeEvidence(
    initialFundamentalsPeriods ?? [],
    initialFundamentalsPeriodType ?? "QUARTERLY"
  );

  // Phase I.4B — reads the live EV/Revenue checkpoints directly (never
  // engine.fundamentalsResult), same "bypass the scoring/template layer
  // entirely" pattern as fundamentalChangeEvidence above. A failed fetch
  // (undefined) and a genuinely-empty result (Unity's real shape, every
  // checkpoint dropped for missing debt) collapse to the same []
  // input — deriveValuationContext already resolves both to MISSING.
  const valuationContext = deriveValuationContext(initialEvRevenueCheckpoints ?? []);

  const {
    concentration,
    thesis,
    constraints,
    stance: derivedStance,
    actionZones: derivedZones,
    scorecard: derivedScorecard,
    targetPosition,
  } = engine;
  const { state: concentrationState, targetShares, sharesToTarget, tacticalInventory, trimSizing } =
    concentration;
  const thesisHealth = thesis.health;
  const firedConstraints = constraints.fired;
  const primaryZone = pickPrimaryZone(derivedZones);

  // ── Transaction handler ────────────────────────────────────────────────────

  function handleTransaction(
    type: "BUY" | "SELL",
    shares: number,
    priceEur: number
  ) {
    const date = formatDate(new Date());

    // Preview-only, for this session's local timeline entry text — the
    // actual accounting mutation (real Holding + Cash, persisted) happens
    // in onTransaction below. Same pure functions/formulas as before
    // (deterministic accounting preserved), just no longer stored as this
    // component's own position/portfolioTotalEur state.
    if (type === "BUY") {
      const newPos = applyBuy(
        position,
        { shares, priceEur },
        market.executionPriceEur,
        portfolioTotalEur
      );
      const entry: TimelineEntry = {
        date,
        type: "BUY",
        summary: `BUY — ${shares} shares @ €${priceEur.toFixed(2)}`,
        detail: `Avg cost €${newPos.averageCostEur.toFixed(2)} · Weight: ${newPos.portfolioWeightPct.toFixed(1)}%`,
      };
      setTimeline((prev) => [entry, ...prev]);
    } else {
      const { position: newPos, realizedGainEur, realizedGainPct } = applySell(
        position,
        { shares, priceEur },
        market.executionPriceEur,
        portfolioTotalEur
      );
      const sign = realizedGainEur >= 0 ? "+" : "";
      const entry: TimelineEntry = {
        date,
        type: "SELL",
        summary: `SELL — ${shares} shares @ €${priceEur.toFixed(2)}`,
        detail: `Realized: ${sign}€${Math.abs(realizedGainEur).toFixed(0)} (${sign}${realizedGainPct.toFixed(1)}%) · Weight: ${newPos.portfolioWeightPct.toFixed(1)}%`,
      };
      setTimeline((prev) => [entry, ...prev]);
    }

    onTransaction(type, shares, priceEur);
    setShowModal(false);
  }

  return (
    <>
      <StockHeader
        seed={seed}
        position={position}
        onAddTransaction={() => {
          setSuggestedZone(undefined);
          setShowModal(true);
        }}
      />
      <PlaybookStatusBanner seed={seed} stance={derivedStance} thesisHealth={thesisHealth} />
      <PrimaryActionCard
        zone={primaryZone}
        currentShares={position.shares}
        recommendedShares={targetPosition.preferredTargetShares}
        onAct={() => {
          setSuggestedZone(primaryZone);
          setShowModal(true);
        }}
      />
      <PositionAndStrategy
        position={position}
        strategy={strategy}
        targetShares={targetShares}
        sharesToTarget={sharesToTarget}
        tacticalInventory={tacticalInventory}
        concentrationState={concentrationState}
      />
      <ActionZoneSection
        zones={derivedZones}
        trimSizing={trimSizing}
        firedConstraints={firedConstraints}
      />
      <BusinessTrajectoryCard trajectory={businessTrajectory} />
      <RecentChangesCard evidence={fundamentalChangeEvidence} />
      <ValuationContextCard context={valuationContext} />
      <SignalScorecard
        scorecard={derivedScorecard}
        momentumResult={engine.momentumResult}
        fundamentalsResult={engine.fundamentalsResult}
        fundamentalsModelFit={fundamentalsModelFit}
      />
      <TimelinePreview timeline={timeline} />

      <AddTransactionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleTransaction}
        securityName={seed.security.name}
        position={position}
        strategy={strategy}
        currentPriceEur={market.executionPriceEur}
        portfolioTotalEur={portfolioTotalEur}
        availableCashEur={availableCashEur}
        trimSizing={trimSizing}
        thesisHealth={thesisHealth}
        suggestedZone={suggestedZone}
      />
    </>
  );
}
