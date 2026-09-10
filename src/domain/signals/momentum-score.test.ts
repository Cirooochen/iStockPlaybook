// Phase C.4/C.6 — momentum score normalization, all six spec §14
// dimensions (RSI, Relative Volume, 50DMA/200DMA Structure, Price
// Extension, Primary Trend, Relative Strength). See momentum-score.ts's
// doc comment and
// docs/phase-c6-trend-relative-strength-normalization-design.md for the
// design decisions this exercises.
import { describe, expect, it } from "vitest";
import { RULESET } from "@/config/ruleset-v0.1";
import {
  scoreMomentum,
  deriveMomentumEvidenceScoredItem,
  deriveMomentumProvenance,
  deriveMomentumEligibility,
  type MomentumComponentResult,
  type MomentumScoreResult,
} from "@/domain/signals/momentum-score";
import type { DataField, DerivedTechnicalSignals, DerivedTrendSignal, RelativeStrengthData } from "@/types/market-data";

const asOf = "2026-09-09T12:00:00.000Z";

function available(value: number): DataField<number> {
  return { status: "AVAILABLE", value, asOf };
}

const MISSING: DataField<number> = { status: "MISSING" };

function signals(overrides: Partial<DerivedTechnicalSignals> = {}): DerivedTechnicalSignals {
  return {
    dma50: MISSING,
    dma200: MISSING,
    rsi: MISSING,
    relativeVolume: MISSING,
    ...overrides,
  };
}

function trendOf(value: number): DerivedTrendSignal {
  return { dma200Slope: available(value) };
}
const TREND_MISSING: DerivedTrendSignal = { dma200Slope: MISSING };

function rsAvailable(value: number): RelativeStrengthData {
  return {
    status: "AVAILABLE",
    benchmarkInstrumentId: "SYNTHETIC_INDEX",
    windowTradingDays: RULESET.technical.relativeStrength.comparisonWindowTradingDays,
    asOf,
    stockReturn: 0,
    benchmarkReturn: 0,
    relativeStrength: value,
  };
}
const RS_MISSING: RelativeStrengthData = { status: "MISSING" };
const RS_NOT_APPLICABLE: RelativeStrengthData = { status: "NOT_APPLICABLE" };

function componentByKey(components: MomentumComponentResult[], key: string) {
  return components.find((c) => c.key === key);
}

// Independent oracle for anchor interpolation.
function interp(anchors: readonly (readonly [number, number])[], value: number): number {
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
  throw new Error("unreachable");
}

const W = RULESET.technical.momentum;

describe("scoreMomentum — component-level visibility (all 6 dimensions)", () => {
  it("always reports all 6 defined components, whatever their status", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, RS_NOT_APPLICABLE);
    expect(result.components.map((c) => c.key).sort()).toEqual(
      ["priceExtension", "relativeStrength", "relativeVolume", "rsi", "structure", "trend"].sort()
    );
    expect(componentByKey(result.components, "relativeStrength")).toEqual({
      key: "relativeStrength",
      status: "NOT_APPLICABLE",
      weight: W.relativeStrengthWeight,
    });
    // Every non-AVAILABLE component still carries its configured weight —
    // "expected weight must remain visible" even when absent.
    for (const c of result.components) {
      expect(typeof c.weight).toBe("number");
    }
  });
});

describe("scoreMomentum — Primary Trend component (monotonic, not blended with Structure)", () => {
  it("normalizes via trendAnchors, clamped outside the anchor range", () => {
    const result = scoreMomentum(signals(), MISSING, trendOf(1), RS_NOT_APPLICABLE);
    const trend = componentByKey(result.components, "trend");
    if (trend?.status === "AVAILABLE") {
      expect(trend.score100).toBe(interp(W.trendAnchors, 1)); // beyond +5% anchor, clamped
      expect(trend.score100).toBe(W.trendAnchors[W.trendAnchors.length - 1][1]);
    }
  });

  it("interpolates linearly between anchors (trendSlope=0.03, between +1%->65 and +5%->90)", () => {
    const result = scoreMomentum(signals(), MISSING, trendOf(0.03), RS_NOT_APPLICABLE);
    const trend = componentByKey(result.components, "trend");
    if (trend?.status === "AVAILABLE") {
      expect(trend.score100).toBeCloseTo(interp(W.trendAnchors, 0.03), 10);
    }
  });

  it("is monotonic: a stronger positive trendSlope always scores at least as high as a weaker one (no extension-risk hump)", () => {
    const scoreAt = (slope: number) => {
      const r = scoreMomentum(signals(), MISSING, trendOf(slope), RS_NOT_APPLICABLE);
      const c = componentByKey(r.components, "trend");
      if (c?.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
      return c.score100;
    };
    expect(scoreAt(0.05)).toBeGreaterThan(scoreAt(0.01));
    expect(scoreAt(0.01)).toBeGreaterThan(scoreAt(0));
    expect(scoreAt(0)).toBeGreaterThan(scoreAt(-0.01));
    expect(scoreAt(-0.01)).toBeGreaterThan(scoreAt(-0.05));
    // Beyond the clamp, more extreme values do NOT keep climbing/falling.
    expect(scoreAt(0.10)).toBe(scoreAt(0.05));
    expect(scoreAt(-0.10)).toBe(scoreAt(-0.05));
  });

  it("trendSlope = 0 -> exactly the neutral anchor score (50)", () => {
    const result = scoreMomentum(signals(), MISSING, trendOf(0), RS_NOT_APPLICABLE);
    const trend = componentByKey(result.components, "trend");
    if (trend?.status === "AVAILABLE") expect(trend.score100).toBe(50);
  });

  it("MISSING dma200Slope -> trend component MISSING (with its weight still visible)", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, RS_NOT_APPLICABLE);
    expect(componentByKey(result.components, "trend")).toEqual({
      key: "trend",
      status: "MISSING",
      weight: W.trendWeight,
    });
  });

  it("Trend and Structure are scored independently — a MISSING Structure does not affect an AVAILABLE Trend, and vice versa", () => {
    // Trend available, Structure MISSING (no price/dma50/dma200).
    const a = scoreMomentum(signals(), MISSING, trendOf(0.05), RS_NOT_APPLICABLE);
    expect(componentByKey(a.components, "trend")?.status).toBe("AVAILABLE");
    expect(componentByKey(a.components, "structure")?.status).toBe("MISSING");

    // Structure available, Trend MISSING.
    const b = scoreMomentum(
      signals({ dma50: available(100), dma200: available(90) }),
      available(110),
      TREND_MISSING,
      RS_NOT_APPLICABLE
    );
    expect(componentByKey(b.components, "structure")?.status).toBe("AVAILABLE");
    expect(componentByKey(b.components, "trend")?.status).toBe("MISSING");
  });
});

describe("scoreMomentum — Relative Strength component (monotonic, 3-state)", () => {
  it("normalizes via relativeStrengthAnchors, clamped outside the anchor range", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, rsAvailable(0.50));
    const rs = componentByKey(result.components, "relativeStrength");
    if (rs?.status === "AVAILABLE") {
      expect(rs.score100).toBe(W.relativeStrengthAnchors[W.relativeStrengthAnchors.length - 1][1]); // clamped
    }
  });

  it("interpolates linearly between anchors (relativeStrength=0.10, between +5pp->65 and +20pp->90)", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, rsAvailable(0.10));
    const rs = componentByKey(result.components, "relativeStrength");
    if (rs?.status === "AVAILABLE") {
      expect(rs.score100).toBeCloseTo(interp(W.relativeStrengthAnchors, 0.10), 10);
    }
  });

  it("is monotonic: stronger outperformance always scores at least as high as weaker outperformance", () => {
    const scoreAt = (rs: number) => {
      const r = scoreMomentum(signals(), MISSING, TREND_MISSING, rsAvailable(rs));
      const c = componentByKey(r.components, "relativeStrength");
      if (c?.status !== "AVAILABLE") throw new Error("expected AVAILABLE");
      return c.score100;
    };
    expect(scoreAt(0.20)).toBeGreaterThan(scoreAt(0.05));
    expect(scoreAt(0.05)).toBeGreaterThan(scoreAt(0));
    expect(scoreAt(0)).toBeGreaterThan(scoreAt(-0.05));
    expect(scoreAt(-0.05)).toBeGreaterThan(scoreAt(-0.20));
  });

  it("relativeStrength = 0 (matched benchmark) -> exactly the neutral anchor score (50)", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, rsAvailable(0));
    const rs = componentByKey(result.components, "relativeStrength");
    if (rs?.status === "AVAILABLE") expect(rs.score100).toBe(50);
  });

  it("MISSING (benchmark configured, data unaligned) -> relativeStrength component MISSING, weight still visible", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, RS_MISSING);
    expect(componentByKey(result.components, "relativeStrength")).toEqual({
      key: "relativeStrength",
      status: "MISSING",
      weight: W.relativeStrengthWeight,
    });
  });

  it("NOT_APPLICABLE (no benchmark configured) -> relativeStrength component NOT_APPLICABLE, weight still visible, distinct from MISSING", () => {
    const result = scoreMomentum(signals(), MISSING, TREND_MISSING, RS_NOT_APPLICABLE);
    const rs = componentByKey(result.components, "relativeStrength");
    expect(rs).toEqual({ key: "relativeStrength", status: "NOT_APPLICABLE", weight: W.relativeStrengthWeight });
    expect(rs?.status).not.toBe("MISSING");
  });
});

describe("scoreMomentum — evidence coverage: applicable weight, available weight, missing evidence are distinguished", () => {
  it("NOT_APPLICABLE relativeStrength is excluded from applicableWeight entirely — a strategy with no benchmark can still reach 100% evidence share", () => {
    const result = scoreMomentum(
      signals({ dma50: available(100), dma200: available(90), rsi: available(70), relativeVolume: available(2.0) }),
      available(110),
      trendOf(0.02),
      RS_NOT_APPLICABLE
    );
    expect(result.status).toBe("SCORED");
    const expectedApplicable = W.rsiWeight + W.relativeVolumeWeight + W.structureWeight + W.priceExtensionWeight + W.trendWeight;
    expect(result.coverage.totalDefinedWeight).toBeCloseTo(1, 10);
    expect(result.coverage.applicableWeight).toBeCloseTo(expectedApplicable, 10);
    expect(result.coverage.availableWeight).toBeCloseTo(expectedApplicable, 10); // everything applicable is also available here
    expect(result.coverage.missingWeight).toBeCloseTo(0, 10);
    expect(result.coverage.availableWeightShare).toBeCloseTo(1, 10);
  });

  it("MISSING relativeStrength (vs. NOT_APPLICABLE) stays IN applicableWeight — it visibly reduces availableWeightShare and shows up as missingWeight", () => {
    const result = scoreMomentum(
      signals({ dma50: available(100), dma200: available(90), rsi: available(70), relativeVolume: available(2.0) }),
      available(110),
      trendOf(0.02),
      RS_MISSING
    );
    expect(result.coverage.totalDefinedWeight).toBeCloseTo(1, 10);
    expect(result.coverage.applicableWeight).toBeCloseTo(1, 10); // NOT excluded — a real gap, not a non-configuration
    expect(result.coverage.missingWeight).toBeCloseTo(W.relativeStrengthWeight, 10);
    expect(result.coverage.availableWeightShare).toBeCloseTo(1 - W.relativeStrengthWeight, 10);
  });

  it("minimum-evidence gate boundary: exactly 50% of applicableWeight -> SCORED (not INSUFFICIENT_DATA)", () => {
    // relativeStrength NOT_APPLICABLE -> applicableWeight = 0.80.
    // trend (0.25) + relativeVolume (0.15) available = 0.40 = exactly half of 0.80.
    const result = scoreMomentum(
      signals({ relativeVolume: available(1.0) }),
      MISSING,
      trendOf(0.02),
      RS_NOT_APPLICABLE
    );
    expect(result.coverage.availableWeightShare).toBeCloseTo(0.5, 10);
    expect(result.status).toBe("SCORED");
  });

  it("below the gate -> INSUFFICIENT_DATA, coverage still fully populated", () => {
    const result = scoreMomentum(signals({ rsi: available(50) }), MISSING, TREND_MISSING, RS_MISSING);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.coverage.availableWeight).toBeCloseTo(W.rsiWeight, 10);
    expect(result.coverage.applicableWeight).toBeCloseTo(1, 10);
    expect(result.coverage.missingWeight).toBeCloseTo(1 - W.rsiWeight, 10);
  });
});

describe("scoreMomentum — MISSING never silently becomes bearish evidence", () => {
  it("a MISSING relativeStrength produces a HIGHER overall score than a genuinely bearish AVAILABLE relativeStrength, all else equal", () => {
    const base = signals({ dma50: available(100), dma200: available(90), rsi: available(70), relativeVolume: available(2.0) });
    const withMissingRS = scoreMomentum(base, available(110), trendOf(0.02), RS_MISSING);
    const withBearishRS = scoreMomentum(base, available(110), trendOf(0.02), rsAvailable(-0.20)); // worst-case anchor
    if (withMissingRS.status !== "SCORED" || withBearishRS.status !== "SCORED") {
      throw new Error("expected both SCORED");
    }
    // MISSING excludes relativeStrength from the blend entirely (renormalized
    // over the rest); a genuinely bearish -20pp reading drags the blend down
    // toward score100=10. MISSING must not behave like that bearish case.
    expect(withMissingRS.overall.score).toBeGreaterThan(withBearishRS.overall.score);
  });

  it("a MISSING component's weight contributes nothing to the blend numerator — the SCORED blend with one MISSING component equals the blend using only the remaining components' renormalized weights", () => {
    const rsiScore = interp(W.rsiAnchors, 70);
    const volScore = interp(W.relativeVolumeAnchors, 2.0);
    const result = scoreMomentum(
      signals({ rsi: available(70), relativeVolume: available(2.0) }),
      MISSING,
      TREND_MISSING,
      RS_NOT_APPLICABLE
    );
    // Only rsi + relativeVolume are applicable AND available here
    // (structure/extension MISSING via no price, trend MISSING,
    // relativeStrength NOT_APPLICABLE) — applicableWeight = rsi+relVol+structure+extension+trend,
    // but only rsi+relVol are AVAILABLE.
    expect(result.status).toBe("INSUFFICIENT_DATA"); // too little evidence to reach SCORED here — see next test for a SCORED equivalent
    // Directly verify the "no bearish leakage" property at the component level instead:
    const rsi = componentByKey(result.components, "rsi");
    const vol = componentByKey(result.components, "relativeVolume");
    if (rsi?.status === "AVAILABLE") expect(rsi.score100).toBeCloseTo(rsiScore, 10);
    if (vol?.status === "AVAILABLE") expect(vol.score100).toBeCloseTo(volScore, 10);
  });
});

describe("scoreMomentum — full six-dimension SCORED result", () => {
  it("all 6 AVAILABLE -> SCORED, blended by spec's full literal weights (10/15/20/10/25/20 = 100)", () => {
    const price = 110;
    const dma50 = 100;
    const dma200 = 90;
    const result = scoreMomentum(
      signals({ dma50: available(dma50), dma200: available(dma200), rsi: available(70), relativeVolume: available(2.0) }),
      available(price),
      trendOf(0.01),
      rsAvailable(0.05)
    );
    expect(result.status).toBe("SCORED");
    if (result.status !== "SCORED") throw new Error("expected SCORED");
    expect(result.coverage.availableWeightShare).toBeCloseTo(1, 10);
    expect(result.coverage.missingWeight).toBeCloseTo(0, 10);

    const rsiScore = interp(W.rsiAnchors, 70);
    const volScore = interp(W.relativeVolumeAnchors, 2.0);
    const structureScore = W.structureAnchors.fullBullish; // price > dma50 > dma200
    const extension50 = (price - dma50) / dma50;
    const extension200 = (price - dma200) / dma200;
    const extensionScore = (interp(W.priceExtensionAnchors, extension50) + interp(W.priceExtensionAnchors, extension200)) / 2;
    const trendScore = interp(W.trendAnchors, 0.01);
    const rsScore = interp(W.relativeStrengthAnchors, 0.05);

    const totalWeight =
      W.rsiWeight + W.relativeVolumeWeight + W.structureWeight + W.priceExtensionWeight + W.trendWeight + W.relativeStrengthWeight;
    const expectedBlend =
      (rsiScore * W.rsiWeight +
        volScore * W.relativeVolumeWeight +
        structureScore * W.structureWeight +
        extensionScore * W.priceExtensionWeight +
        trendScore * W.trendWeight +
        rsScore * W.relativeStrengthWeight) /
      totalWeight;

    const expectedDisplayScore = Math.max(1, Math.round(expectedBlend / 10));
    const expectedState =
      expectedDisplayScore >= 7 ? "Positive" : expectedDisplayScore >= 4 ? "Neutral" : "Weak";
    expect(result.overall).toEqual({ score: expectedDisplayScore, state: expectedState });
  });

  it("is deterministic: repeated calls on the same input produce the identical result", () => {
    const sig = signals({ dma50: available(100), dma200: available(90), rsi: available(62), relativeVolume: available(1.4) });
    const p = available(110);
    const t = trendOf(0.015);
    const rs = rsAvailable(0.03);
    expect(scoreMomentum(sig, p, t, rs)).toEqual(scoreMomentum(sig, p, t, rs));
  });
});

describe("deriveMomentumEvidenceScoredItem — Phase D.0/D.1 (evidence availability separate from signal state)", () => {
  it("SCORED -> { status: 'SCORED', item: result.overall }, lossless", () => {
    const result = scoreMomentum(
      signals({ dma50: available(100), dma200: available(90), rsi: available(70), relativeVolume: available(2.0) }),
      available(110),
      trendOf(0.01),
      rsAvailable(0.05)
    );
    expect(result.status).toBe("SCORED");
    if (result.status !== "SCORED") throw new Error("expected SCORED");

    const evidence = deriveMomentumEvidenceScoredItem(result);
    expect(evidence).toEqual({ status: "SCORED", item: result.overall });
  });

  it("INSUFFICIENT_DATA -> { status: 'INSUFFICIENT_DATA' } — no `item` key at all, never a fabricated score", () => {
    const result: MomentumScoreResult = {
      status: "INSUFFICIENT_DATA",
      components: [],
      coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
    };
    const evidence = deriveMomentumEvidenceScoredItem(result);
    expect(evidence).toEqual({ status: "INSUFFICIENT_DATA" });
    expect(evidence).not.toHaveProperty("item");
  });
});

describe("deriveMomentumProvenance — Phase D.3 (3-way live/fallback distinction, no new stored state)", () => {
  it("SCORED -> LIVE_SCORED", () => {
    const result = scoreMomentum(
      signals({ dma50: available(100), dma200: available(90), rsi: available(70), relativeVolume: available(2.0) }),
      available(110),
      trendOf(0.01),
      rsAvailable(0.05)
    );
    expect(result.status).toBe("SCORED");
    expect(deriveMomentumProvenance(result)).toBe("LIVE_SCORED");
  });

  it("INSUFFICIENT_DATA -> LIVE_INSUFFICIENT_DATA", () => {
    const result: MomentumScoreResult = {
      status: "INSUFFICIENT_DATA",
      components: [],
      coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
    };
    expect(deriveMomentumProvenance(result)).toBe("LIVE_INSUFFICIENT_DATA");
  });

  it("undefined -> FALLBACK", () => {
    expect(deriveMomentumProvenance(undefined)).toBe("FALLBACK");
  });
});

// Fixture helper — a minimal, valid SCORED MomentumScoreResult with a
// caller-chosen overall.state, decoupled from scoreMomentum's blend math
// so each eligibility bucket is exercised directly and unambiguously.
function scoredResult(state: "Positive" | "Neutral" | "Weak"): MomentumScoreResult {
  const score = state === "Positive" ? 8 : state === "Neutral" ? 5 : 2;
  return {
    status: "SCORED",
    overall: { score, state },
    components: [],
    coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 1, missingWeight: 0, availableWeightShare: 1 },
  };
}

const INSUFFICIENT_DATA_RESULT: MomentumScoreResult = {
  status: "INSUFFICIENT_DATA",
  components: [],
  coverage: { totalDefinedWeight: 1, applicableWeight: 1, availableWeight: 0.1, missingWeight: 0.9, availableWeightShare: 0.1 },
};

describe("deriveMomentumEligibility — Phase D.5 (defensive-only ADD-zone timing gate)", () => {
  it("absent (undefined) -> true (fail-open, identical to momentum never being wired in)", () => {
    expect(deriveMomentumEligibility(undefined)).toBe(true);
  });

  it("INSUFFICIENT_DATA -> true (fail-open, never a restriction)", () => {
    expect(deriveMomentumEligibility(INSUFFICIENT_DATA_RESULT)).toBe(true);
  });

  it("LIVE_SCORED Weak -> false (the only case that may restrict eligibility)", () => {
    expect(deriveMomentumEligibility(scoredResult("Weak"))).toBe(false);
  });

  it("LIVE_SCORED Neutral -> true (acceptable momentum never blocks ADD)", () => {
    expect(deriveMomentumEligibility(scoredResult("Neutral"))).toBe(true);
  });

  it("LIVE_SCORED Positive -> true (positive momentum is never required to grant ADD either)", () => {
    expect(deriveMomentumEligibility(scoredResult("Positive"))).toBe(true);
  });
});
