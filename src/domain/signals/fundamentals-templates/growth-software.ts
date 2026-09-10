// GROWTH_SOFTWARE fundamentals template — the only v0.1 archetype. Phase
// E.2. docs/phase-e0-fundamentals-evidence-contract-design.md §5.1,
// docs/phase-e1d-fundamentals-anchor-calibration-v0.1.md.
//
// Every weight/anchor below is a VERSIONED V0_1_INVESTMENT_HYPOTHESIS
// (Revenue Growth's anchors and Guidance's mapping are the two
// SPEC_DEFINED exceptions — see RULESET.fundamentals.growthSoftware's
// own doc comment and docs/phase-e1d-fundamentals-anchor-calibration-
// v0.1.md §3 for the full per-dimension source-category breakdown). Not
// empirically validated, not tuned to Unity or any other specific
// company.
//
// This is the ONLY archetype-specific fundamentals file in the codebase
// — src/domain/signals/fundamentals-score.ts's generic engine never
// names a dimension by key.
import type { FundamentalsComponentDefinition, FundamentalsComponentScore, FundamentalsTemplate } from "@/types/fundamentals";
import type { DataField } from "@/types/market-data";
import { RULESET } from "@/config/ruleset-v0.1";
import {
  computeRevenueGrowth,
  computeGrowthTrend,
  computeOperatingMargin,
  computeMarginTrend,
  computeFcfMargin,
  computeNetCashToRevenue,
  mapGuidanceEvidenceToScore,
} from "@/domain/signals/fundamentals";

type Anchor = readonly [input: number, score: number];

// Bounded continuous normalization via piecewise-linear interpolation —
// the same mechanism momentum-score.ts's interpolateAnchors implements,
// restated locally rather than imported/shared (that function isn't
// exported — same "small pure helper, not worth a shared module"
// precedent this codebase already follows for toScoreItem). Clamped
// outside the anchor range to the first/last anchor's score — this is
// what gives Balance Sheet's curve its approved plateau (and floor) for
// free, with no special-case logic (docs/phase-e1c-fundamentals-
// normalization-design.md §7.1).
function interpolateAnchors(anchors: readonly Anchor[], value: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  /* istanbul ignore next -- unreachable: value is bounded by the checks above */
  return last[1];
}

// Shared plumbing for every numeric (anchor-scored) dimension below —
// MISSING raw evidence propagates as MISSING, never a fabricated score.
function scoreFromAnchors(anchors: readonly Anchor[], raw: DataField<number>): FundamentalsComponentScore {
  if (raw.status === "MISSING") return { status: "MISSING" };
  return { status: "AVAILABLE", rawValue: raw.value, score100: interpolateAnchors(anchors, raw.value), asOf: raw.asOf };
}

const W = RULESET.fundamentals.growthSoftware;

const revenueGrowth: FundamentalsComponentDefinition = {
  key: "revenueGrowth",
  weight: W.revenueGrowthWeight,
  score: (raw) => scoreFromAnchors(W.revenueGrowthAnchors, computeRevenueGrowth(raw.periods)),
};

const growthTrend: FundamentalsComponentDefinition = {
  key: "growthTrend",
  weight: W.growthTrendWeight,
  score: (raw) => scoreFromAnchors(W.growthTrendAnchors, computeGrowthTrend(raw.periods)),
};

const operatingMargin: FundamentalsComponentDefinition = {
  key: "operatingMargin",
  weight: W.operatingMarginWeight,
  score: (raw) => scoreFromAnchors(W.operatingMarginAnchors, computeOperatingMargin(raw.periods)),
};

const marginTrend: FundamentalsComponentDefinition = {
  key: "marginTrend",
  weight: W.marginTrendWeight,
  score: (raw) => scoreFromAnchors(W.marginTrendAnchors, computeMarginTrend(raw.periods)),
};

const fcfMargin: FundamentalsComponentDefinition = {
  key: "fcfMargin",
  weight: W.fcfMarginWeight,
  score: (raw) => scoreFromAnchors(W.fcfMarginAnchors, computeFcfMargin(raw.periods)),
};

const balanceSheet: FundamentalsComponentDefinition = {
  key: "balanceSheet",
  weight: W.balanceSheetWeight,
  score: (raw) => scoreFromAnchors(W.netCashToRevenueAnchors, computeNetCashToRevenue(raw.periods)),
};

// Guidance — spec §12's discrete mapping (mapGuidanceEvidenceToScore),
// not an anchor curve. MISSING raw guidanceEvidence propagates as
// MISSING, exactly like every other dimension — never fabricated.
const guidance: FundamentalsComponentDefinition = {
  key: "guidance",
  weight: W.guidanceWeight,
  score: (raw) => {
    if (raw.guidanceEvidence.status === "MISSING") return { status: "MISSING" };
    return {
      status: "AVAILABLE",
      rawValue: raw.guidanceEvidence.value,
      score100: mapGuidanceEvidenceToScore(raw.guidanceEvidence.value),
      asOf: raw.guidanceEvidence.asOf,
    };
  },
};

export const GROWTH_SOFTWARE_TEMPLATE: FundamentalsTemplate = {
  archetype: "GROWTH_SOFTWARE",
  components: [revenueGrowth, growthTrend, operatingMargin, marginTrend, fcfMargin, guidance, balanceSheet],
  minimumAvailableWeightShare: W.minimumAvailableWeightShare,
};
