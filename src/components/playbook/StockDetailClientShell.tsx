"use client";

// Phase G.5 — bridges the real Portfolio (Holding + PortfolioSnapshot +
// StockPlaybookConfig) to the existing, unmodified Stock Position Engine
// boundary via toStockEngineInputs(). PlaybookClientShell itself (Phase F
// Hero Stack UI) is untouched — this component only assembles the
// StockSeed-shaped props it already expects, from live data instead of a
// static seed file.
//
// Phase G.6 — BUY/SELL confirmed in the Hero Stack now mutate the real
// Holding (+ a real Cash holding) here and persist via usePortfolioState,
// instead of PlaybookClientShell keeping its own ephemeral copy. The
// weighted-average-cost/share-count math is still exactly applyBuy/applySell
// (accounting.ts, untouched) — only WHERE the result is stored changed.
//
// Phase H.4 — holding/config resolution moved from a config-keyed lookup
// (a config was always a required prop) to a TICKER-keyed lookup against
// the live portfolio snapshot, because a config may not exist yet at all:
// a STOCK holding with no config now renders a "No Playbook" state with a
// Create Playbook entry point (docs/phase-h3-playbook-onboarding-ux.md
// §1.1) instead of the route 404ing (src/app/stocks/[ticker]/page.tsx no
// longer gates on a static seed config). Unity's exact existing
// Scorecard/ActionZone/Timeline content is preserved unchanged via an
// identity check (UNITY_INSTRUMENT_ID) — every other confirmed config
// uses H.4's deterministic builders instead.
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Scorecard, StockSeed, TimelineEntry } from "@/types/playbook";
import type { MomentumScoreResult, FundamentalsScoreResult } from "@/domain/engine";
import { usePortfolioState } from "@/lib/use-portfolio-state";
import { toStockEngineInputs } from "@/domain/portfolio/snapshot";
import { applyTransactionToHoldings } from "@/domain/portfolio/apply-transaction";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { buildOnboardedActionZoneTemplates } from "@/domain/playbook/action-zone-templates";
import { unityActionZones, unityScorecard, unityTimeline } from "@/data/unity-seed";
import { PlaybookClientShell } from "@/components/playbook/PlaybookClientShell";
import { PlaybookOnboardingOverlay } from "@/components/playbook/onboarding/PlaybookOnboardingOverlay";

// Matches holdings-seed.ts's Unity instrument id — special-cased ONLY to
// keep Unity's hand-typed Scorecard/ActionZone/Timeline content exactly
// as it was before H.4 (guardrail: "existing Unity behavior must remain
// unchanged"). No other stock is special-cased.
const UNITY_INSTRUMENT_ID = "U";

interface Props {
  ticker: string;
  // Static instrument identity (from holdings-seed.ts) — used only as a
  // display name if the live holding can't be found at all (e.g. deleted
  // from the Portfolio page, or a ticker that was never a real holding),
  // since at that point there's no live instrument record left to read a
  // name from.
  fallbackName: string;
  // No live quote/USD/daily-change provider exists in the new model
  // (brief §9 — pricing boundary explicitly out of scope). These fields
  // have no home there; they're passed through unchanged from the legacy
  // seed purely to keep the Hero Stack's display identical — marketCurrency
  // is paired with primaryPriceUsd (it only ever labels that one figure,
  // see StockHeader), so it must stay "USD", not the new model's EUR-only
  // nativeCurrency, or the label and figure would mismatch. Neither field
  // feeds the engine or any calculation — market.executionPriceEur below
  // is the real, live, one-source-of-truth price. Known, pre-existing
  // limitation carried forward unchanged by H.4: every stock's Hero Stack
  // shows this same Unity-sourced USD/daily-change display data, since no
  // per-stock provider exists yet — not something H.4 was asked to fix.
  legacyMarketColor: { primaryPriceUsd: number; marketCurrency: string; dailyChangePct: number };
  initialMomentumResult?: MomentumScoreResult;
  initialFundamentalsResult?: FundamentalsScoreResult;
}

export function StockDetailClientShell({
  ticker,
  fallbackName,
  legacyMarketColor,
  initialMomentumResult,
  initialFundamentalsResult,
}: Props) {
  const { holdings, setHoldings, configs, setConfigs, snapshot } = usePortfolioState();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const holdingSnapshot = snapshot.holdings.find((h) => h.instrument.ticker === ticker);

  if (!holdingSnapshot) {
    return (
      <BackLinkMessage title="Stock not found">
        {fallbackName} isn&rsquo;t in your portfolio right now. Add it as a holding first,
        then you can set up a Playbook for it.
      </BackLinkMessage>
    );
  }

  if (holdingSnapshot.instrument.assetType !== "STOCK") {
    return (
      <BackLinkMessage title="Playbook not available">
        The Stock Playbook only supports STOCK holdings — {holdingSnapshot.instrument.name}{" "}
        is a different asset type.
      </BackLinkMessage>
    );
  }

  const holding = holdings.find((h) => h.id === holdingSnapshot.holdingId);
  const config = configs.find((c) => c.instrumentId === holdingSnapshot.instrument.id);

  if (!config) {
    return (
      <>
        <div className="max-w-lg mx-auto mt-16 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors mb-6"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Portfolio
          </Link>
          <h1 className="text-lg font-semibold text-stone-900 mb-2">
            No Playbook yet for {holdingSnapshot.instrument.name}
          </h1>
          <p className="text-sm text-stone-500 mb-6">
            You own {holdingSnapshot.quantity.toLocaleString("de-DE")} shares. Set up a
            Playbook to get a personalized recommended holding, primary action, and signals
            for this stock.
          </p>
          <button
            onClick={() => setOnboardingOpen(true)}
            className="inline-flex items-center gap-2 bg-teal-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors duration-[160ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97]"
          >
            Create Playbook
          </button>
        </div>

        {onboardingOpen && holding && (
          <PlaybookOnboardingOverlay
            holding={holding}
            holdingSnapshot={holdingSnapshot}
            valuation={snapshot.valuation}
            momentumResult={initialMomentumResult}
            fundamentalsResult={initialFundamentalsResult}
            onClose={() => setOnboardingOpen(false)}
            onConfirm={(newConfig) => {
              setConfigs((prev) => [...prev, newConfig]);
              setOnboardingOpen(false);
            }}
          />
        )}
      </>
    );
  }

  const engineInputs = toStockEngineInputs(snapshot, holdingSnapshot.holdingId, config);

  // Honest fail-safe (design §1.5/§2): null means the holding isn't in the
  // live portfolio anymore, its own value/cost isn't known, or the whole
  // portfolio's valuation isn't COMPLETE — never a fabricated Position.
  if (!engineInputs || holdingSnapshot.priceNative.status !== "AVAILABLE") {
    return (
      <BackLinkMessage title="Playbook unavailable">
        {fallbackName}&rsquo;s Playbook can&rsquo;t be shown right now — either this
        holding is no longer in your portfolio, or the portfolio&rsquo;s valuation is
        incomplete (a holding is unpriced), which also leaves this position&rsquo;s
        weight unknown.
      </BackLinkMessage>
    );
  }

  const executionPriceEur = holdingSnapshot.priceNative.value;
  // Reused so the (rare, multi-cash-holding) edge case is resolved
  // identically wherever it matters: the same holding funds a BUY and
  // receives a SELL's proceeds as the one shown as "available cash".
  const cashHolding = holdings.find((h) => h.instrument.assetType === "CASH");
  const availableCashEur = cashHolding?.quantity ?? 0;

  // An arrow function assigned to `const` — unlike a hoisted `function`
  // declaration, this retains the guard clause's narrowing of
  // engineInputs/holdingSnapshot to non-null for the rest of this render.
  // AddTransactionModal already gates confirm on the same conditions
  // (oversell, insufficient cash) it was given, so a rejection here would
  // only happen if the portfolio changed between renders — silently
  // dropping it is acceptable (the modal already closed the user's
  // intended transaction UI; nothing was recorded either way).
  const handleTransaction = (type: "BUY" | "SELL", shares: number, priceEur: number): void => {
    const result = applyTransactionToHoldings({
      holdings,
      stockHoldingId: holdingSnapshot.holdingId,
      type,
      shares,
      priceEur,
      position: engineInputs.position,
      portfolioTotalEur: engineInputs.portfolioTotalEur,
      executionPriceEur,
      asOf: new Date().toISOString(),
    });
    if (result.ok) setHoldings(result.holdings);
  };

  const seed: StockSeed = {
    security: {
      name: holdingSnapshot.instrument.name,
      ticker: holdingSnapshot.instrument.ticker ?? "",
      exchange: holdingSnapshot.instrument.exchange ?? "",
      marketCurrency: legacyMarketColor.marketCurrency,
      isin: holdingSnapshot.instrument.isin,
      executionCurrency: holdingSnapshot.instrument.nativeCurrency,
    },
    market: {
      executionPriceEur,
      primaryPriceUsd: legacyMarketColor.primaryPriceUsd,
      dailyChangePct: legacyMarketColor.dailyChangePct,
      updatedAt: holdingSnapshot.priceNative.asOf,
    },
    position: engineInputs.position,
    strategy: engineInputs.strategy,
    playbook: config.playbook,
  };

  const isUnity = config.instrumentId === UNITY_INSTRUMENT_ID;
  const initialScorecard: Scorecard = isUnity ? unityScorecard : buildOnboardingBaselineScorecard();
  const initialZones = isUnity
    ? unityActionZones
    : buildOnboardedActionZoneTemplates({
        strategy: config.strategy,
        currentShares: engineInputs.position.shares,
        weightPct: engineInputs.position.portfolioWeightPct,
        portfolioTotalEur: engineInputs.portfolioTotalEur,
        executionPriceEur,
      });
  const initialTimeline: TimelineEntry[] = isUnity
    ? unityTimeline
    : [
        {
          date: new Date(config.playbook.updatedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          type: "PLAYBOOK_UPDATED",
          summary: "Playbook created",
          detail: config.playbook.summary,
        },
      ];

  return (
    <PlaybookClientShell
      seed={seed}
      initialZones={initialZones}
      initialScorecard={initialScorecard}
      initialTimeline={initialTimeline}
      initialPortfolioTotalEur={engineInputs.portfolioTotalEur}
      availableCashEur={availableCashEur}
      onTransaction={handleTransaction}
      initialMomentumResult={initialMomentumResult}
      initialFundamentalsResult={initialFundamentalsResult}
    />
  );
}

function BackLinkMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors mb-6"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Portfolio
      </Link>
      <h1 className="text-lg font-semibold text-stone-900 mb-2">{title}</h1>
      <p className="text-sm text-stone-500">{children}</p>
    </div>
  );
}
