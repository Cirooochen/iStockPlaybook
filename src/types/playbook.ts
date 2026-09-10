export type Stance =
  | "HOLD_GRADUALLY_TRIM"
  | "HOLD_TRIM"
  | "HOLD"
  | "BUILD"
  | "ADD"
  | "REDUCE_RISK"
  | "THESIS_REVIEW"
  | "EXIT";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type ThesisHealth =
  | "STRENGTHENING"
  | "INTACT"
  | "MIXED"
  | "WEAKENING"
  | "BROKEN";

export type ActionZoneType = "ADD" | "HOLD" | "TRIM_1" | "TRIM_2" | "THESIS_REVIEW";

export type ActionZoneState = "ACTIVE" | "INACTIVE" | "WATCH" | "CONDITIONAL";

export type SignalState =
  | "Positive"
  | "Neutral"
  | "Weak"
  | "Elevated"
  | "Intact";

export interface ActionZone {
  type: ActionZoneType;
  state: ActionZoneState;
  title: string;
  summary: string;
  suggestedShares?: string;
  primaryTrigger?: string;
  suggestedAction?: string;
  whyBullets?: string[];
  doNotTriggerIf?: string[];
}

export interface ScoreItem {
  score: number;
  state: SignalState;
}

export interface Scorecard {
  fundamentals: ScoreItem;
  valuation: ScoreItem;
  momentum: ScoreItem;
  thesisHealth: ScoreItem;
  positionFit: ScoreItem;
  concentrationRisk: ScoreItem;
}

export interface Security {
  name: string;
  ticker: string;
  exchange: string;
  marketCurrency: string;
  isin?: string;
  executionCurrency?: string;
}

export interface MarketData {
  executionPriceEur: number;
  primaryPriceUsd: number;
  dailyChangePct: number;
  updatedAt: string;
}

export interface Position {
  shares: number;
  averageCostEur: number;
  valueEur: number;
  unrealizedReturnPct: number;
  portfolioWeightPct: number;
}

export interface Strategy {
  horizon: string;
  shortTermMaxWeightPct: number;
  mediumTermTargetMinPct: number;
  mediumTermTargetMaxPct: number;
  // Optional as a pair — spec §21A: both present = a core-share strategy,
  // both absent = a weight-target-only strategy. Providing only one is an
  // invalid configuration, rejected by resolveCoreShareRange
  // (src/domain/portfolio/target-position.ts), not silently coerced here.
  coreSharesMin?: number;
  coreSharesMax?: number;
  tacticalSharesMin: number;
  tacticalSharesMax: number;
  // Optional explicit preferred position size within the target weight
  // range, spec §21A. Used only when no core range is configured — see
  // deriveTargetPosition's no-core preferred-target behavior.
  preferredTargetWeightPct?: number;
  // Optional benchmark for spec §14's Relative Strength dimension
  // (docs/phase-c5-trend-relative-strength-data-contract.md §4) — a
  // provider-agnostic identifier (never a hardcoded symbol), same
  // convention as RawMarketData.instrumentId. Absent means Relative
  // Strength is structurally NOT_APPLICABLE for this strategy, not
  // MISSING — see computeRelativeStrength
  // (src/domain/signals/relative-strength.ts).
  benchmarkInstrumentId?: string;
}

export interface Playbook {
  stance: Stance;
  confidence: Confidence;
  thesisHealth: ThesisHealth;
  version: number;
  updatedAt: string;
  summary: string;
}

export interface StockSeed {
  security: Security;
  market: MarketData;
  position: Position;
  strategy: Strategy;
  playbook: Playbook;
}

export interface PortfolioHolding {
  security: Security;
  market: MarketData;
  position: Position;
  playbookStance: Stance;
  playbookReason: string;
  attentionState: "ACTION" | "WATCH" | "STABLE" | "UPDATE_NEEDED";
}

export interface Portfolio {
  totalValueEur: number;
  unrealizedReturnEur: number;
  unrealizedReturnPct: number;
  updatedAt: string;
  holdings: PortfolioHolding[];
}

export interface ResearchDocument {
  id: string;
  title: string;
  type: string;
  period: string;
  status: "Processed" | "Processing" | "Failed";
  playbookImpact: string;
  processedAt: string;
}

export interface TimelineEntry {
  date: string;
  type: "PLAYBOOK_UPDATED" | "BUY" | "SELL" | "THESIS_EDIT" | "STANCE_CHANGE";
  summary: string;
  detail?: string;
}
