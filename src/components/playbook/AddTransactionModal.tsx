"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Position, Strategy, ThesisHealth } from "@/types/playbook";
import type { TrimSizing } from "@/domain/portfolio/concentration";
import {
  classifyConcentration,
  concentrationLabel,
  concentrationStyle,
  calcTargetShares,
} from "@/domain/portfolio/concentration";
import {
  previewBuy,
  previewSell,
  calcPortfolioTotalAfterBuy,
  calcPortfolioTotalAfterSell,
} from "@/domain/portfolio/accounting";
import { checkHC003 } from "@/domain/playbook/hard-constraints";

type TransactionType = "BUY" | "SELL";
type InputMode = "BY_SHARES" | "BY_AMOUNT";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (type: TransactionType, shares: number, priceEur: number) => void;
  position: Position;
  strategy: Strategy;
  currentPriceEur: number;
  portfolioTotalEur: number;
  trimSizing: TrimSizing;
  thesisHealth: ThesisHealth;
}

export function AddTransactionModal({
  isOpen,
  onClose,
  onConfirm,
  position,
  strategy,
  currentPriceEur,
  portfolioTotalEur,
  trimSizing,
  thesisHealth,
}: Props) {
  const [type, setType] = useState<TransactionType>("BUY");
  const [mode, setMode] = useState<InputMode>("BY_SHARES");
  const [sharesInput, setSharesInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [priceInput, setPriceInput] = useState(currentPriceEur.toFixed(2));

  useEffect(() => {
    if (isOpen) {
      setType("BUY");
      setMode("BY_SHARES");
      setSharesInput("");
      setAmountInput("");
      setPriceInput(currentPriceEur.toFixed(2));
    }
  }, [isOpen, currentPriceEur]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const price = parseFloat(priceInput) || 0;
  const sharesFromShares = parseInt(sharesInput, 10) || 0;
  const sharesFromAmount =
    price > 0 ? Math.floor((parseFloat(amountInput) || 0) / price) : 0;
  const shares = mode === "BY_SHARES" ? sharesFromShares : sharesFromAmount;

  const oversell = type === "SELL" && shares > position.shares;
  const isValid = price > 0 && shares > 0 && !oversell;

  // HC-003 protects the core minimum — meaningless without a core range.
  const hc003 =
    type === "SELL" && shares > 0 && !oversell && strategy.coreSharesMin !== undefined
      ? checkHC003(shares, position.shares, strategy.coreSharesMin, thesisHealth)
      : null;

  const canConfirm = isValid && !hc003?.triggered;

  const preview = (() => {
    if (!isValid) return null;
    if (type === "BUY") {
      const newPos = previewBuy(
        position,
        { shares, priceEur: price },
        currentPriceEur,
        portfolioTotalEur
      );
      return { position: newPos, realizedGainEur: null, realizedGainPct: null };
    }
    const result = previewSell(
      position,
      { shares, priceEur: price },
      currentPriceEur,
      portfolioTotalEur
    );
    return result;
  })();

  const previewConcentration =
    preview
      ? classifyConcentration(
          preview.position.portfolioWeightPct,
          strategy.mediumTermTargetMaxPct
        )
      : null;

  const previewNewPortfolioTotal = preview
    ? type === "BUY"
      ? calcPortfolioTotalAfterBuy(portfolioTotalEur)
      : calcPortfolioTotalAfterSell(portfolioTotalEur)
    : null;

  const previewTargetShares =
    preview && previewNewPortfolioTotal !== null
      ? calcTargetShares(
          previewNewPortfolioTotal,
          strategy.mediumTermTargetMaxPct,
          currentPriceEur
        )
      : null;

  const weightDelta = preview
    ? preview.position.portfolioWeightPct - position.portfolioWeightPct
    : 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(type, shares, price);
  }

  return (
    <>
      {/* Scrim */}
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

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add transaction"
        className={`fixed left-1/2 top-1/2 w-full max-w-[480px] bg-white rounded-2xl shadow-2xl transition-[opacity,transform] ${
          isOpen
            ? "opacity-100 duration-300 [transition-timing-function:var(--ease-drawer)]"
            : "opacity-0 duration-[200ms] [transition-timing-function:var(--ease-in)] pointer-events-none"
        }`}
        style={{
          zIndex: 70,
          transform: isOpen
            ? "translate(-50%, -50%) scale(1)"
            : "translate(-50%, -50%) scale(0.95)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-800">
            Add Transaction — Unity Software
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
          {/* BUY / SELL */}
          <div className="flex rounded-lg border border-stone-200 p-0.5 bg-stone-50">
            {(["BUY", "SELL"] as TransactionType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors duration-[140ms] [transition-timing-function:var(--ease-out)] motion-safe:active:scale-[0.97] ${
                  type === t
                    ? t === "BUY"
                      ? "bg-teal-600 text-white"
                      : "bg-orange-600 text-white"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* By shares / By amount */}
          <div className="flex rounded-lg border border-stone-200 p-0.5 bg-stone-50">
            {(["BY_SHARES", "BY_AMOUNT"] as InputMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors duration-[140ms] [transition-timing-function:var(--ease-out)] ${
                  mode === m
                    ? "bg-white text-stone-800 shadow-sm border border-stone-200"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {m === "BY_SHARES" ? "By shares" : "By amount (€)"}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            {mode === "BY_SHARES" ? (
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  {type === "BUY" ? "Shares to buy" : "Shares to sell"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={type === "SELL" ? position.shares : undefined}
                  value={sharesInput}
                  onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
                />
                {type === "SELL" && (
                  <p className="text-xs text-stone-400 mt-1">
                    Available:{" "}
                    {position.shares.toLocaleString("de-DE")} shares
                  </p>
                )}
                {oversell && (
                  <p className="text-xs text-red-500 mt-1">
                    Cannot sell more than {position.shares} shares held.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                  {type === "BUY" ? "Amount to invest (€)" : "Amount to receive (€)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
                />
                {sharesFromAmount > 0 && price > 0 && (
                  <p className="text-xs text-stone-400 mt-1">
                    = {sharesFromAmount} whole shares
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-stone-400 uppercase tracking-widest mb-1.5">
                Price per share (€)
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 tabular-nums"
              />
            </div>

            {/* Trim quick-fill for SELL */}
            {type === "SELL" && trimSizing.maxTacticalTrim > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-stone-400">Trim suggestions:</span>
                {[
                  { label: `L1 — ${trimSizing.level1} shares`, value: trimSizing.level1 },
                  { label: `L2 — ${trimSizing.level2} shares`, value: trimSizing.level2 },
                ]
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <button
                      key={s.label}
                      onClick={() => {
                        setMode("BY_SHARES");
                        setSharesInput(String(s.value));
                      }}
                      className="text-xs text-stone-500 border border-stone-200 px-2 py-0.5 rounded hover:bg-stone-50 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* HC-003 warning */}
          {hc003?.triggered && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-[11px] font-medium text-amber-600 uppercase tracking-widest mb-1">
                HC-003 — Core position constraint
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                {hc003.description}
              </p>
            </div>
          )}

          {/* Live preview */}
          {preview && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-4 space-y-3">
              <p className="text-[11px] font-medium text-stone-400 uppercase tracking-widest">
                After this transaction
              </p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Shares</p>
                  <p className="text-sm font-semibold text-stone-800 tabular-nums">
                    {position.shares.toLocaleString("de-DE")} →{" "}
                    {preview.position.shares.toLocaleString("de-DE")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Avg cost</p>
                  <p className="text-sm font-semibold text-stone-800 tabular-nums">
                    €{position.averageCostEur.toFixed(2)} →{" "}
                    €{preview.position.averageCostEur.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Weight</p>
                  <p className="text-sm font-semibold text-stone-800 tabular-nums">
                    {position.portfolioWeightPct.toFixed(1)}% →{" "}
                    {preview.position.portfolioWeightPct.toFixed(1)}%{" "}
                    <span
                      className={`text-xs ${weightDelta > 0 ? "text-orange-600" : "text-teal-600"}`}
                    >
                      ({weightDelta > 0 ? "+" : ""}
                      {weightDelta.toFixed(1)} pp)
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Concentration</p>
                  {previewConcentration && (
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded border inline-block ${concentrationStyle[previewConcentration].text} ${concentrationStyle[previewConcentration].bg} ${concentrationStyle[previewConcentration].border}`}
                    >
                      {concentrationLabel[previewConcentration]}
                    </span>
                  )}
                </div>
              </div>

              {previewTargetShares !== null && preview.position.shares > 0 && (
                <p className="text-xs text-stone-400 pt-2 border-t border-stone-200">
                  To reach {strategy.mediumTermTargetMaxPct}% target:{" "}
                  <span className="font-medium text-stone-600">
                    sell{" "}
                    {Math.max(0, preview.position.shares - previewTargetShares)}{" "}
                    more shares
                  </span>
                </p>
              )}

              {preview.realizedGainEur !== null && (
                <p className="text-xs pt-2 border-t border-stone-200">
                  <span className="text-stone-400">Realized: </span>
                  <span
                    className={
                      (preview.realizedGainEur ?? 0) >= 0
                        ? "font-medium text-teal-700"
                        : "font-medium text-red-700"
                    }
                  >
                    {(preview.realizedGainEur ?? 0) >= 0 ? "+" : ""}€
                    {Math.abs(preview.realizedGainEur ?? 0).toLocaleString(
                      "de-DE",
                      { minimumFractionDigits: 0, maximumFractionDigits: 0 }
                    )}{" "}
                    ({(preview.realizedGainPct ?? 0) >= 0 ? "+" : ""}
                    {(preview.realizedGainPct ?? 0).toFixed(1)}%)
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors motion-safe:active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors motion-safe:active:scale-[0.97] ${
              canConfirm
                ? type === "BUY"
                  ? "bg-teal-600 text-white hover:bg-teal-700"
                  : "bg-orange-600 text-white hover:bg-orange-700"
                : "bg-stone-100 text-stone-400 cursor-not-allowed"
            }`}
          >
            Confirm {type}
          </button>
        </div>
      </div>
    </>
  );
}
