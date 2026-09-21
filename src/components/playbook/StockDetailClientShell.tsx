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
// longer gates on a static seed config).
//
// v0.1 real-data cleanup — every confirmed config now uses H.4's
// deterministic onboarded builders, with no exceptions: the Unity
// identity check + hand-typed Scorecard/ActionZone/Timeline content this
// comment used to describe here is gone (was: a guardrail to keep
// Unity's pre-H.4 hand-authored content byte-identical; no longer needed
// or desired now that the runtime carries no seed data to preserve).
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { Scorecard, StockSeed, TimelineEntry } from "@/types/playbook";
import type { MomentumScoreResult, FundamentalsScoreResult } from "@/domain/engine";
import type { FundamentalsPeriodType, RawFundamentalsPeriod } from "@/types/fundamentals";
import type { EvRevenueCheckpoint } from "@/domain/signals/valuation-checkpoints";
import { usePortfolioState } from "@/lib/use-portfolio-state";
import { toStockEngineInputs } from "@/domain/portfolio/snapshot";
import { applyTransactionToHoldings } from "@/domain/portfolio/apply-transaction";
import { buildOnboardingBaselineScorecard } from "@/domain/playbook/onboarding-scorecard";
import { buildOnboardedActionZoneTemplates } from "@/domain/playbook/action-zone-templates";
import { deriveFundamentalsModelFit } from "@/domain/playbook/fundamentals-model-fit";
import { PlaybookClientShell } from "@/components/playbook/PlaybookClientShell";
import { PlaybookOnboardingOverlay } from "@/components/playbook/onboarding/PlaybookOnboardingOverlay";

interface Props {
  ticker: string;
  // Used only as a display name if the live holding can't be found at
  // all (e.g. deleted from the Portfolio page, or a ticker that was
  // never a real holding), since at that point there's no live
  // instrument record left to read a name from. v0.1 real-data cleanup:
  // the caller (page.tsx) now just passes the ticker itself — no static
  // seed identity exists to look up a real display name from server-side.
  fallbackName: string;
  // No live quote/USD/daily-change provider exists in this model (brief
  // §9 — pricing boundary explicitly out of scope), and no caller
  // currently populates this (v0.1 real-data cleanup removed the one
  // hand-seeded source it ever had). Kept as a real, honestly-optional
  // mechanism rather than deleted outright: StockHeader already omits the
  // line rather than fabricating one when it's undefined (H.6 hardening),
  // so a future live secondary-market price source could still supply it
  // without any change here. Neither field feeds the engine or any
  // calculation — market.executionPriceEur below is the real, live,
  // one-source-of-truth price.
  legacyMarketColor?: { primaryPriceUsd: number; marketCurrency: string; dailyChangePct: number };
  initialMomentumResult?: MomentumScoreResult;
  initialFundamentalsResult?: FundamentalsScoreResult;
  /**
   * Phase I.5 — the raw periods/periodType behind `initialFundamentalsResult`,
   * from the SAME fetch (docs/phase-i-minimum-research-evidence.md §14) —
   * needed only for PlaybookClientShell's Recent Changes card
   * (FundamentalChangeEvidence reads raw periods directly, never the
   * scored result). Not forwarded to PlaybookOnboardingOverlay below,
   * which has no use for them.
   */
  initialFundamentalsPeriods?: RawFundamentalsPeriod[];
  initialFundamentalsPeriodType?: FundamentalsPeriodType;
  /**
   * Phase I.4B — live EV/Revenue checkpoints (Phase I.4A,
   * fetchLiveEvRevenueCheckpoints), from a SEPARATE live fetch (page.tsx)
   * alongside initialFundamentalsResult — needed only for
   * PlaybookClientShell's Valuation Context card
   * (deriveValuationContext). `undefined` on any fetch failure; an empty
   * array is a distinct, legitimate outcome (every candidate
   * checkpoint's required evidence genuinely missing — Unity's real
   * shape) that deriveValuationContext already treats identically to
   * "Not available." Not forwarded to PlaybookOnboardingOverlay below,
   * which has no use for it.
   */
  initialEvRevenueCheckpoints?: EvRevenueCheckpoint[];
}

export function StockDetailClientShell({
  ticker,
  fallbackName,
  legacyMarketColor,
  initialMomentumResult,
  initialFundamentalsResult,
  initialFundamentalsPeriods,
  initialFundamentalsPeriodType,
  initialEvRevenueCheckpoints,
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
      marketCurrency: legacyMarketColor?.marketCurrency,
      isin: holdingSnapshot.instrument.isin,
      executionCurrency: holdingSnapshot.instrument.nativeCurrency,
    },
    market: {
      executionPriceEur,
      primaryPriceUsd: legacyMarketColor?.primaryPriceUsd,
      dailyChangePct: legacyMarketColor?.dailyChangePct,
      updatedAt: holdingSnapshot.priceNative.asOf,
    },
    position: engineInputs.position,
    strategy: engineInputs.strategy,
    playbook: config.playbook,
  };

  // v0.1 real-data cleanup — no confirmed archetype fit exists for any
  // stock without a real classifier (H.0 §5 item 1, still explicitly out
  // of scope) — every stock, including a real Unity holding, is now
  // honestly UNKNOWN_FIT, matching what every non-seeded stock already
  // showed before this cleanup.
  const fundamentalsModelFit = deriveFundamentalsModelFit(false);
  const initialScorecard: Scorecard = buildOnboardingBaselineScorecard();
  const initialZones = buildOnboardedActionZoneTemplates({
    strategy: config.strategy,
    currentShares: engineInputs.position.shares,
    weightPct: engineInputs.position.portfolioWeightPct,
    portfolioTotalEur: engineInputs.portfolioTotalEur,
    executionPriceEur,
  });
  const initialTimeline: TimelineEntry[] = [
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
    // Phase F "Hero Stack" calls for a single, centered column (~640-760px)
    // carrying the Primary Action as dominant content, rather than the
    // sidebar's full 1240px main-content width (AppShell.tsx) — scoped to
    // this page only so the Portfolio dashboard's own layout is untouched.
    <div className="max-w-[720px] mx-auto">
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
        initialFundamentalsPeriods={initialFundamentalsPeriods}
        initialFundamentalsPeriodType={initialFundamentalsPeriodType}
        initialEvRevenueCheckpoints={initialEvRevenueCheckpoints}
        fundamentalsModelFit={fundamentalsModelFit}
      />
    </div>
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
