// Fundamentals display honesty — Post-Phase-H Trust Cleanup
// (docs/post-phase-h-product-review.md F4,
// docs/minimum-research-model.md §2.1/§5). H.1's onboarding Proposal
// schema (`ResearchEvidence.fundamentals.modelFit`) already carried this
// disclosure carefully through Review, but nothing carried it past
// confirmation — so an unsupported/limited archetype fit could read with
// the exact same authority as a confirmed one on the page a user
// actually lives on. This module is the single source of truth for that
// disclosure on BOTH the onboarding Review screen and the confirmed
// Playbook page, so the two can never drift apart.
//
// No archetype classifier is added here or anywhere (H.0 §5 item 1,
// explicitly out of Phase H's scope, unchanged by this cleanup) — this
// is the exact same static, instrument-id-keyed rule already used by
// PlaybookOnboardingOverlay.tsx (hardcoded "UNKNOWN_FIT") and
// StockDetailClientShell.tsx's own UNITY_INSTRUMENT_ID check: Unity is
// the only stock ever confirmed to fit the GROWTH_SOFTWARE archetype
// (its original hand-authored config); every other stock is honestly
// UNKNOWN_FIT. `LIMITED_FIT` is reserved for a case this codebase does
// not yet produce (H.1 §2.4) — it would require an actual classification
// signal, not introduced here.
export type FundamentalsModelFit = "CONFIRMED_FIT" | "LIMITED_FIT" | "UNKNOWN_FIT";

export function deriveFundamentalsModelFit(isConfirmedArchetypeFit: boolean): FundamentalsModelFit {
  return isConfirmedArchetypeFit ? "CONFIRMED_FIT" : "UNKNOWN_FIT";
}

export function fundamentalsModelFitLabel(fit: FundamentalsModelFit): string {
  if (fit === "CONFIRMED_FIT") return "Confirmed";
  if (fit === "LIMITED_FIT") return "Limited";
  return "Unknown";
}

// Fundamentals false-certainty follow-up
// (docs/post-phase-h-product-review.md F4, this session's own fix).
// `Scorecard.fundamentals` is never null — the legacy compatibility
// placeholder (H.2 §8.1) still fills that required `ScoreItem` slot
// internally, and stays exactly as it is; changing that internal type
// isn't necessary to fix what a user sees. Whether the number behind it
// is REAL is a separate question, answered only by the live evidence
// result, never by the always-present ScoreItem shape. The single,
// shared, testable predicate for that question — used by
// SignalScorecard.tsx to decide whether to show the score/pill or an
// honest "Not available," and reused here so the display logic and its
// test coverage can never drift apart (SignalScorecard.tsx itself has no
// render-test coverage in this project — see
// docs/phase-h6-end-to-end-validation.md's "Known limitations").
export function isFundamentalsResultScored(
  fundamentalsResult: { status: "SCORED" | "INSUFFICIENT_DATA" } | undefined
): boolean {
  return fundamentalsResult?.status === "SCORED";
}
