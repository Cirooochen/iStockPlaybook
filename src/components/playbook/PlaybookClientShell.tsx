"use client";

import { useState } from "react";
import type {
  StockSeed,
  ActionZone,
  Scorecard,
  TimelineEntry,
} from "@/types/playbook";

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
import type { FundamentalsModelFit } from "@/domain/playbook/fundamentals-model-fit";
import { ThesisCard } from "@/components/playbook/ThesisCard";
import { WhatChangesMyView } from "@/components/playbook/WhatChangesMyView";
import { ResearchPreview } from "@/components/playbook/ResearchPreview";
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
   * Phase H.6 hardening. ThesisCard/WhatChangesMyView/ResearchPreview are
   * hand-authored, Unity-only content — they import unity-seed.ts
   * directly and take no props of their own (H.0 §5 item 2: out of
   * Phase H's scope to build a per-stock equivalent). Before this flag,
   * they rendered unconditionally for every stock, so a non-Unity user
   * (e.g. an ASML holder) saw Unity's literal thesis text, catalysts, and
   * research-document titles under their own company's Playbook — an H.6
   * audit finding, not a mere missing feature. `false` for any stock
   * other than Unity; the caller (StockDetailClientShell) is the only
   * place that knows which stock this is.
   */
  showHandAuthoredThesisContent: boolean;
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
  showHandAuthoredThesisContent,
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
      <SignalScorecard
        scorecard={derivedScorecard}
        momentumResult={engine.momentumResult}
        fundamentalsResult={engine.fundamentalsResult}
        fundamentalsModelFit={fundamentalsModelFit}
      />
      {showHandAuthoredThesisContent && (
        <>
          <ThesisCard />
          <WhatChangesMyView />
          <ResearchPreview />
        </>
      )}
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
