"use client";

import { useState } from "react";
import type {
  StockSeed,
  ActionZone,
  Scorecard,
  TimelineEntry,
} from "@/types/playbook";

// Domain
import {
  applyBuy,
  applySell,
  calcPortfolioTotalAfterBuy,
  calcPortfolioTotalAfterSell,
} from "@/domain/portfolio/accounting";
import { runDecisionEngine, type MomentumScoreResult, type FundamentalsScoreResult } from "@/domain/engine";

// Sections
import { StockHeader } from "@/components/playbook/StockHeader";
import { PlaybookStatusBanner } from "@/components/playbook/PlaybookStatusBanner";
import { PrimaryActionCard } from "@/components/playbook/PrimaryActionCard";
import { PositionAndStrategy } from "@/components/playbook/PositionAndStrategy";
import { ActionZoneSection } from "@/components/playbook/ActionZoneSection";
import { SignalScorecard } from "@/components/playbook/SignalScorecard";
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
  initialMomentumResult,
  initialFundamentalsResult,
}: Props) {
  const { market, strategy, playbook } = seed;

  // ── Mutable state ──────────────────────────────────────────────────────────
  const [position, setPosition] = useState(seed.position);
  const [portfolioTotalEur, setPortfolioTotalEur] = useState(initialPortfolioTotalEur);
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
      // Cash → Security — funded from existing portfolio cash, total unchanged.
      setPortfolioTotalEur((prev) => calcPortfolioTotalAfterBuy(prev));
      setPosition(newPos);
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
      // Sale proceeds become cash — still part of the tracked portfolio total.
      setPortfolioTotalEur((prev) => calcPortfolioTotalAfterSell(prev));
      setPosition(newPos);
      setTimeline((prev) => [entry, ...prev]);
    }

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
      />
      <ThesisCard />
      <WhatChangesMyView />
      <ResearchPreview />
      <TimelinePreview timeline={timeline} />

      <AddTransactionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleTransaction}
        position={position}
        strategy={strategy}
        currentPriceEur={market.executionPriceEur}
        portfolioTotalEur={portfolioTotalEur}
        trimSizing={trimSizing}
        thesisHealth={thesisHealth}
        suggestedZone={suggestedZone}
      />
    </>
  );
}
