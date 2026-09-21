// Fundamentals evidence contract — spec §11/§12/§29,
// docs/phase-e0-fundamentals-evidence-contract-design.md §3/§3.1/§3.2/§3.3/§5.1,
// docs/phase-e1d-fundamentals-anchor-calibration-v0.1.md.
// Phase E.1A (raw contract) + E.2 (aggregate scoring shapes below).
// Provider-independent shapes only — no API provider, no AI extraction
// implementation (see the E.0 design doc's explicit non-goals, still true).
//
// The aggregate scoring-engine shapes below (FundamentalsComponentResult /
// FundamentalsEvidenceCoverage / FundamentalsScoreResult /
// FundamentalsComponentDefinition / FundamentalsTemplate) were
// deliberately NOT defined in E.1A, because at that point Growth Trend /
// Margin Trend had no agreed derivation (closed by E.1B) and no v0.1
// dimension had normalization anchors (closed by E.1C/E.1D — all seven
// GROWTH_SOFTWARE dimensions now have an approved metric, shape, and a
// versioned v0.1 anchor/mapping proposal). Every gap that blocked this
// section from being honest is now closed.
import type { DataField } from "@/types/market-data";
import type { ScoreItem } from "@/types/playbook";

// design doc §5.1 — v0.1: exactly one member. A future archetype (bank,
// biotech, ...) adds a member here; nothing in this file otherwise
// depends on which archetype is active.
export type FundamentalsArchetype = "GROWTH_SOFTWARE";

// Phase E.6A — docs/phase-e5-fundamentals-live-evidence-strategy.md §3.
// Whether a RawFundamentalsData's `periods` are quarterly or annual
// reports. Lives on RawFundamentalsData (one field for the whole
// array), not per-period — see FundamentalsPeriodType and §4 there for
// why that's what actually prevents mixing cadences, not a per-period
// tag.
export type FundamentalsPeriodType = "QUARTERLY" | "ANNUAL";

// design doc §3.1/§3.3 (E.0) + docs/phase-e5-fundamentals-live-evidence-
// strategy.md §3 (E.6A) — one reporting period's raw facts. `periods` in
// RawFundamentalsData is ordered oldest-to-newest (matching
// RawMarketData.ohlcv's own convention) — every derivation function in
// src/domain/signals/fundamentals.ts assumes this ordering, now
// alongside RawFundamentalsData.periodType (not per-period) for whether
// that ordering/window logic is quarterly- or annual-cadenced.
export interface RawFundamentalsPeriod {
  // Provider-agnostic DISPLAY/DEBUG label only — e.g. "2026-Q2". Never
  // parsed as a date and never used for fiscal identity; that's
  // fiscalYear/fiscalQuarter/periodEndDate below (E.6A resolution —
  // previously this was the only period-identity field at all).
  periodId: string;
  fiscalYear: number;
  // Present only when the enclosing RawFundamentalsData.periodType is
  // "QUARTERLY" — not required (and not forbidden) when "ANNUAL". See
  // src/domain/signals/fundamentals-validation.ts's
  // hasRequiredFiscalQuarter for the checkable form of this rule.
  fiscalQuarter?: 1 | 2 | 3 | 4;
  // This period's own end date (e.g. "2026-06-30") — distinct from
  // periodId's label. Used for chronological ordering and TTM-window
  // math; NOT itself a freshness/asOf source (see filingDate below and
  // deriveFundamentalsFieldAsOf).
  periodEndDate: string;
  // When the report was actually published — may lag periodEndDate by
  // weeks. The preferred freshness/asOf source (design doc §6) whenever
  // present; optional only because some historical/backfilled records
  // may not carry it, never because it's unimportant.
  filingDate?: string;
  // Phase I.4A — the SEC accession number of the filing this period's
  // representative fact came from (SecEdgarXbrlFact.accn). The join key
  // future Valuation Context work uses to align this period's own
  // historical shares-outstanding fact (RawFundamentalsData
  // .sharesOutstandingByAccession) — verified directly against live SEC
  // data (docs/phase-i-minimum-research-evidence.md's 0.30.0 feasibility
  // spike) that a period's dei:EntityCommonStockSharesOutstanding fact
  // shares the identical accn as that period's revenue/operatingIncome
  // facts, for both Unity and ASML. Optional only because some historical
  // records may not carry it, never because it's unimportant.
  accn?: string;
  revenue: DataField<number>;
  operatingIncome: DataField<number>;
  operatingCashFlow: DataField<number>;
  capitalExpenditures: DataField<number>; // stored as a positive outflow figure — see computeFreeCashFlow's sign convention
  // Balance-sheet snapshot as of this period's end — point-in-time facts,
  // same tier as revenue/operatingIncome (design doc §3.3).
  cashAndEquivalents: DataField<number>;
  totalDebt: DataField<number>; // short-term + long-term interest-bearing debt, combined
}

export interface RawFundamentalsData {
  instrumentId: string; // provider-agnostic identifier, not necessarily the UI ticker
  // Phase E.6A — applies to every entry in `periods`; the type-level
  // guarantee against silently mixing quarterly and annual periods in
  // one array (design doc §4). Quarterly is preferred whenever a
  // provider offers both, per the same design doc section — not
  // re-decided per instrument.
  periodType: FundamentalsPeriodType;
  periods: RawFundamentalsPeriod[]; // as much history as the provider returns, oldest-to-newest (by periodEndDate); length not fixed by this contract
  guidanceEvidence: DataField<GuidanceEvidence>; // AI-extracted, not provider-supplied — see GuidanceEvidence
  checkedAt: string; // when this fetch attempt happened, even if everything inside is MISSING
  // Phase I.1, corrected by Phase I.3.1 — the ISO 4217-style currency
  // every currency-denominated DataField in `periods` (revenue,
  // operatingIncome, operatingCashFlow, capitalExpenditures,
  // cashAndEquivalents, totalDebt) is expressed in. One value for the
  // whole payload (a filer reports in one currency, same as periodType)
  // — never per-period. This is the authoritative input any future
  // calculation combining these figures with a currency-denominated
  // price MUST check before combining them — see
  // src/domain/market-data/currency-integrity.ts.
  //
  // `undefined` means the mapper could not establish a single, trustworthy
  // currency for this payload's own target financial concepts — either
  // none of them had any usable data (nothing to derive from), or more
  // than one currency appeared across them (an internally inconsistent
  // payload). Both cases leave `periods` empty too; this is never guessed
  // from a fixed candidate order, a majority, or the instrument's ticker.
  //
  // Phase I.1 originally made this a caller-supplied parameter, reasoning
  // an instrument's own "reporting currency" was already known — that
  // was wrong (docs/phase-i-minimum-research-evidence.md §12/§13):
  // Instrument.nativeCurrency (src/types/portfolio.ts) is the PORTFOLIO's
  // own cost-basis/tracking currency, a different concept, and nothing
  // else in this codebase reliably knew a filer's actual SEC reporting
  // currency in advance. The mapper now DISCOVERS this value itself, from
  // the currency units actually present on the specific financial
  // concepts it already reads — see mappers.ts's discoverReportingCurrency.
  reportingCurrency: string | undefined;
  // Phase I.1 — the most recently reported shares-outstanding fact (SEC
  // EDGAR's "dei" namespace, not currency-denominated — unit is a share
  // count). A single "latest known" fact, not a historical series —
  // aligning a fuller shares-outstanding history against fiscal periods
  // is deferred to the future Valuation Context work this document does
  // not yet implement. MISSING, never fabricated, when no such fact
  // resolves (e.g. today, for any filer whose facts are exclusively
  // annual/FY-tagged — see the mapper's own doc comment).
  sharesOutstanding: DataField<number>;
  // Phase I.4A — every dei:EntityCommonStockSharesOutstanding fact this
  // payload carries, keyed by its own filing's SEC accession number
  // (`accn`) rather than collapsed to a single latest value. This is the
  // historical shares-outstanding series a future Valuation Context
  // checkpoint needs (see RawFundamentalsPeriod.accn) — deliberately
  // keyed by accn, not periodEndDate: a shares-outstanding fact's "as of"
  // date is the filing's cover-page date, not a fiscal period end (same
  // reasoning as `sharesOutstanding` above), so an accession-number join
  // is the only non-arbitrary alignment key (verified live for both
  // Unity and ASML — docs/phase-i-minimum-research-evidence.md's 0.30.0
  // feasibility spike). A plain object, not a Map, so this stays
  // JSON-serializable across a Server Component boundary. Empty when no
  // dei fact resolves — never fabricated.
  sharesOutstandingByAccession: Record<string, DataField<number>>;
}

// design doc §3.2, spec §12/§29 — the AI-extraction OUTPUT contract,
// scoped down to just what the Guidance dimension needs. AI's role stops
// here: it may only produce this structured fact, never the final score
// (see mapGuidanceEvidenceToScore in src/domain/signals/fundamentals.ts).
export interface GuidanceEvidence {
  direction: "RAISED" | "REITERATED" | "MIXED" | "LOWERED";
  magnitude: "MATERIAL" | "SMALL" | null; // null when direction is REITERATED/MIXED — spec §12's table has no magnitude branch for those
  evidence: string[]; // supporting excerpts/citations — never used to compute the score itself
}

// ── Phase E.2 — aggregate scoring shapes (design doc §5.1/§6) ────────────
// Mirrors MomentumComponentResult/MomentumEvidenceCoverage/
// MomentumScoreResult (src/domain/signals/momentum-score.ts) exactly —
// component-level visibility on every branch, MISSING != 0, an
// applicable/available/missing weight split, and a SCORED/
// INSUFFICIENT_DATA aggregate discriminated union. See design doc §5.1
// for why FundamentalsComponentKey is `string` here (archetype-scoped,
// not a single cross-archetype union) rather than a fixed literal union
// like MomentumComponentKey — a bank archetype's keys share nothing with
// GROWTH_SOFTWARE's, so no single closed union could describe both.

// Archetype-scoped, not a cross-archetype global union — deliberately
// `string` at this generic layer, but NOT "arbitrary": every concrete
// FundamentalsTemplate (e.g. GROWTH_SOFTWARE_TEMPLATE) defines its own
// closed set of literal keys internally and widens them only when
// constructing this shape — design doc §5.1.
export type FundamentalsComponentKey = string;

// The per-call result a FundamentalsComponentDefinition.score(...)
// returns (see below) — deliberately a STANDALONE discriminated union,
// not derived via `Omit<FundamentalsComponentResult, "key"|"weight">`.
// TypeScript's `Omit` does not distribute over a union's branches (it
// widens to only the keys common to every branch first), so applying it
// to a discriminated union collapses the AVAILABLE-only fields
// (`rawValue`/`score100`/`asOf`) away entirely rather than preserving
// them per branch. FundamentalsComponentResult below is built FROM this
// type via intersection instead, which DOES distribute correctly.
export type FundamentalsComponentScore =
  | { status: "AVAILABLE"; rawValue: number | GuidanceEvidence; score100: number; asOf: string }
  | { status: "MISSING" }
  | { status: "NOT_APPLICABLE" };

// `weight` is carried on every status (not just AVAILABLE), same as
// MomentumComponentResult — a caller can always see how much evidence a
// MISSING or NOT_APPLICABLE component was worth, not just that it was
// absent. `rawValue` is `number` for every v0.1 GROWTH_SOFTWARE
// dimension except Guidance, whose raw evidence is a GuidanceEvidence
// struct, not a number.
export type FundamentalsComponentResult = FundamentalsComponentScore & {
  key: FundamentalsComponentKey;
  weight: number;
};

export interface FundamentalsEvidenceCoverage {
  totalDefinedWeight: number;
  applicableWeight: number;
  availableWeight: number;
  missingWeight: number;
  availableWeightShare: number;
}

export type FundamentalsScoreResult =
  | {
      status: "SCORED";
      overall: ScoreItem;
      components: FundamentalsComponentResult[];
      coverage: FundamentalsEvidenceCoverage;
    }
  | {
      status: "INSUFFICIENT_DATA";
      components: FundamentalsComponentResult[];
      coverage: FundamentalsEvidenceCoverage;
    };

// One archetype's full configuration — component keys, weights, and each
// dimension's own raw-evidence-to-score100 logic, owned together as one
// unit (design doc §5.1). `score` deliberately returns only the
// per-call part of FundamentalsComponentResult — `key`/`weight` are
// already known from this definition, so the generic engine
// (scoreFundamentals, src/domain/signals/fundamentals-score.ts) supplies
// them when assembling the final component result.
export interface FundamentalsComponentDefinition {
  key: FundamentalsComponentKey;
  weight: number;
  score(raw: RawFundamentalsData): FundamentalsComponentScore;
}

export interface FundamentalsTemplate {
  archetype: FundamentalsArchetype;
  components: readonly FundamentalsComponentDefinition[]; // weights should sum to 1.0 — validated by tests, not the engine itself
  minimumAvailableWeightShare: number; // the INSUFFICIENT_DATA gate threshold — archetype-specific, not global
}
