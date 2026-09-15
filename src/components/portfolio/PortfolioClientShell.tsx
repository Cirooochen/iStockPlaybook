"use client";

import { useState } from "react";
import { usePortfolioState, PORTFOLIO_BASE_CURRENCY } from "@/lib/use-portfolio-state";
import {
  createHolding,
  updateHolding,
  type HoldingFormInput,
} from "@/domain/portfolio/holding-form";
import type { Holding, HoldingSnapshot } from "@/types/portfolio";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { PortfolioSummaryCards } from "@/components/portfolio/PortfolioSummaryCards";
import { ConcentrationOverview } from "@/components/portfolio/ConcentrationOverview";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { HoldingFormModal } from "@/components/portfolio/HoldingFormModal";

type ModalState = { mode: "add" } | { mode: "edit"; holding: Holding } | null;

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

export function PortfolioClientShell() {
  const { holdings, setHoldings, setManualPrices, configs, quotes, snapshot } = usePortfolioState();
  const [modal, setModal] = useState<ModalState>(null);

  function handleSubmit(input: HoldingFormInput) {
    const nowIso = new Date().toISOString();

    if (modal?.mode === "edit") {
      const instrumentId = modal.holding.instrument.id;
      const updated = updateHolding(modal.holding, input, nowIso);
      setHoldings((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      setManualPrices((prev) => {
        if (input.assetType === "CASH") return omit(prev, instrumentId);
        if (input.currentPriceNative === undefined) {
          // Explicit clear, not a removal — a removed key would fall back
          // to quotesSeed if this instrument happens to be one of the
          // seeded four; `null` forces MISSING regardless.
          return { ...prev, [instrumentId]: null };
        }
        return { ...prev, [instrumentId]: { priceNative: input.currentPriceNative, asOf: nowIso } };
      });
    } else {
      const id = crypto.randomUUID();
      const instrumentId = crypto.randomUUID();
      const holding = createHolding(input, id, instrumentId, PORTFOLIO_BASE_CURRENCY, nowIso);
      setHoldings((prev) => [...prev, holding]);
      if (input.assetType !== "CASH" && input.currentPriceNative !== undefined) {
        setManualPrices((prev) => ({
          ...prev,
          [instrumentId]: { priceNative: input.currentPriceNative!, asOf: nowIso },
        }));
      }
    }

    setModal(null);
  }

  function handleDelete(holdingId: string) {
    const holding = holdings.find((h) => h.id === holdingId);
    setHoldings((prev) => prev.filter((h) => h.id !== holdingId));
    if (holding) {
      setManualPrices((prev) => omit(prev, holding.instrument.id));
    }
  }

  function handleEdit(holdingSnapshot: HoldingSnapshot) {
    const holding = holdings.find((h) => h.id === holdingSnapshot.holdingId);
    if (holding) setModal({ mode: "edit", holding });
  }

  const editingPrice =
    modal?.mode === "edit"
      ? (() => {
          const q = quotes.get(modal.holding.instrument.id);
          return q?.price.status === "AVAILABLE" ? q.price.value : undefined;
        })()
      : undefined;

  return (
    <div>
      <PortfolioHeader snapshot={snapshot} onAddHolding={() => setModal({ mode: "add" })} />
      <PortfolioSummaryCards snapshot={snapshot} configs={configs} />
      <ConcentrationOverview snapshot={snapshot} configs={configs} />
      <HoldingsTable
        snapshot={snapshot}
        configs={configs}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <HoldingFormModal
        isOpen={modal !== null}
        mode={modal?.mode ?? "add"}
        initialHolding={modal?.mode === "edit" ? modal.holding : undefined}
        initialPriceNative={editingPrice}
        onClose={() => setModal(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
