"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AssetType, Holding } from "@/types/portfolio";
import { validateHoldingFormInput, type HoldingFormInput } from "@/domain/portfolio/holding-form";

interface Props {
  isOpen: boolean;
  mode: "add" | "edit";
  // Only used in "edit" mode, to prefill the form.
  initialHolding?: Holding;
  initialPriceNative?: number;
  onClose: () => void;
  onSubmit: (input: HoldingFormInput) => void;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "STOCK", label: "Stock" },
  { value: "ETF", label: "ETF" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

function emptyForm(): {
  assetType: AssetType;
  name: string;
  ticker: string;
  exchange: string;
  isin: string;
  quantity: string;
  averageCostNative: string;
  currentPriceNative: string;
} {
  return {
    assetType: "STOCK",
    name: "",
    ticker: "",
    exchange: "",
    isin: "",
    quantity: "",
    averageCostNative: "",
    currentPriceNative: "",
  };
}

export function HoldingFormModal({
  isOpen,
  mode,
  initialHolding,
  initialPriceNative,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState(emptyForm());
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitted(false);
    if (mode === "edit" && initialHolding) {
      setForm({
        assetType: initialHolding.instrument.assetType,
        name: initialHolding.instrument.name,
        ticker: initialHolding.instrument.ticker ?? "",
        exchange: initialHolding.instrument.exchange ?? "",
        isin: initialHolding.instrument.isin ?? "",
        quantity: String(initialHolding.quantity),
        averageCostNative:
          initialHolding.costBasis.status === "AVAILABLE"
            ? String(initialHolding.costBasis.averageCostNative)
            : "",
        currentPriceNative: initialPriceNative !== undefined ? String(initialPriceNative) : "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [isOpen, mode, initialHolding, initialPriceNative]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const isCash = form.assetType === "CASH";

  const input: HoldingFormInput = {
    assetType: form.assetType,
    name: form.name,
    ticker: form.ticker || undefined,
    exchange: form.exchange || undefined,
    isin: form.isin || undefined,
    quantity: parseFloat(form.quantity),
    averageCostNative: form.averageCostNative === "" ? undefined : parseFloat(form.averageCostNative),
    currentPriceNative: form.currentPriceNative === "" ? undefined : parseFloat(form.currentPriceNative),
  };
  const validation = validateHoldingFormInput(input);

  function handleSubmit() {
    setSubmitted(true);
    if (!validation.valid) return;
    onSubmit(input);
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-stone-900/40 transition-opacity ${
          isOpen
            ? "opacity-100 duration-300 [transition-timing-function:var(--ease-drawer)]"
            : "opacity-0 duration-[200ms] [transition-timing-function:var(--ease-in)] pointer-events-none"
        }`}
        style={{ zIndex: 60 }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "add" ? "Add holding" : "Edit holding"}
        className={`fixed left-1/2 top-1/2 w-full max-w-[480px] bg-white rounded-2xl shadow-2xl transition-[opacity,transform] ${
          isOpen
            ? "opacity-100 duration-300 [transition-timing-function:var(--ease-drawer)]"
            : "opacity-0 duration-[200ms] [transition-timing-function:var(--ease-in)] pointer-events-none"
        }`}
        style={{
          zIndex: 70,
          transform: isOpen ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.95)",
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-800">
            {mode === "add" ? "Add Holding" : `Edit ${initialHolding?.instrument.name ?? "Holding"}`}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-600 transition-colors motion-safe:active:scale-[0.97]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Asset type */}
          <div>
            <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
              Type
            </label>
            <select
              value={form.assetType}
              disabled={mode === "edit"}
              onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value as AssetType }))}
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:bg-stone-50 disabled:text-stone-400"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={isCash ? "Cash (EUR)" : "e.g. Unity Software Inc."}
              autoFocus
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300"
            />
          </div>

          {!isCash && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  Ticker
                </label>
                <input
                  type="text"
                  value={form.ticker}
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  placeholder="e.g. U"
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  Exchange
                </label>
                <input
                  type="text"
                  value={form.exchange}
                  onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value }))}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
              {isCash ? "Cash amount (€)" : "Quantity"}
            </label>
            <input
              type="number"
              min={0}
              step={isCash ? 0.01 : "any"}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              placeholder="0"
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
            />
          </div>

          {!isCash && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  Avg cost / unit (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.averageCostNative}
                  onChange={(e) => setForm((f) => ({ ...f, averageCostNative: e.target.value }))}
                  placeholder="Unknown"
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  Current price (€)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.currentPriceNative}
                  onChange={(e) => setForm((f) => ({ ...f, currentPriceNative: e.target.value }))}
                  placeholder="Unknown"
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
                />
              </div>
            </div>
          )}
          {!isCash && (
            <p className="text-xs text-stone-400 -mt-2">
              Leave price blank if unknown — this holding won&apos;t have a value until priced.
            </p>
          )}

          {submitted && !validation.valid && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <ul className="text-xs text-red-700 list-disc list-inside space-y-0.5">
                {validation.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors motion-safe:active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors motion-safe:active:scale-[0.97] bg-teal-600 text-white hover:bg-teal-700"
          >
            {mode === "add" ? "Add holding" : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}
