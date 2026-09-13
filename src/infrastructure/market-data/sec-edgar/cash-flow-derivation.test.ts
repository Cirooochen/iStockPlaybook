// Phase E.7D — deriveQuarterlyCashFlowFacts. Fixtures mirror the real
// hazards docs/phase-e7c-edgar-quarterly-cashflow-derivation-design.md
// enumerates, plus this session's live-confirmed Unity shape (§7 there):
// operating cash flow/capex report only Q1 as a genuine single-quarter
// fact, with Q2/Q3/Q4 available only as 6M/9M/FY cumulative facts.
import { describe, expect, it } from "vitest";
import { deriveQuarterlyCashFlowFacts } from "@/infrastructure/market-data/sec-edgar/cash-flow-derivation";
import type { SecEdgarXbrlFact } from "@/infrastructure/market-data/sec-edgar/types";

function fact(overrides: Partial<SecEdgarXbrlFact>): SecEdgarXbrlFact {
  return { start: "2026-01-01", end: "2026-03-31", val: 0, fy: 2026, fp: "Q1", filed: "2026-05-07", ...overrides };
}

// Unity-shaped fiscal-year fixture: only Q1 is a genuine single-quarter
// fact; Q2/Q3/Q4 exist only as 6M/9M/FY cumulative facts.
const Q1 = fact({ start: "2026-01-01", end: "2026-03-31", val: 100, fp: "Q1", filed: "2026-05-07" });
const SIX_MONTH = fact({ start: "2026-01-01", end: "2026-06-30", val: 220, fp: "Q2", filed: "2026-08-06" });
const NINE_MONTH = fact({ start: "2026-01-01", end: "2026-09-30", val: 400, fp: "Q3", filed: "2026-11-05" });
const FISCAL_YEAR = fact({ start: "2026-01-01", end: "2026-12-31", val: 600, fp: "FY", filed: "2027-02-15" });

describe("deriveQuarterlyCashFlowFacts — Q2/Q3/Q4 derivation", () => {
  it("derives Q2 = 6M - Q1, Q3 = 9M - 6M, Q4 = FY - 9M", () => {
    const derived = deriveQuarterlyCashFlowFacts([Q1], [SIX_MONTH], [NINE_MONTH], [FISCAL_YEAR]);

    expect(derived.get("2026-06-30")).toMatchObject({ start: "2026-03-31", end: "2026-06-30", val: 120 }); // 220 - 100
    expect(derived.get("2026-09-30")).toMatchObject({ start: "2026-06-30", end: "2026-09-30", val: 180 }); // 400 - 220
    expect(derived.get("2026-12-31")).toMatchObject({ start: "2026-09-30", end: "2026-12-31", val: 200 }); // 600 - 400
  });

  it("Q4 gets no special/weaker treatment than Q2/Q3 — same alignment gate applies uniformly", () => {
    // Break ONLY the FY/9M alignment (mismatched start) — Q2/Q3 remain derivable, Q4 alone drops to MISSING.
    const misalignedFy = { ...FISCAL_YEAR, start: "2025-01-01" };
    const derived = deriveQuarterlyCashFlowFacts([Q1], [SIX_MONTH], [NINE_MONTH], [misalignedFy]);
    expect(derived.has("2026-06-30")).toBe(true);
    expect(derived.has("2026-09-30")).toBe(true);
    expect(derived.has("2026-12-31")).toBe(false);
  });
});

describe("deriveQuarterlyCashFlowFacts — direct-fact precedence (item 8)", () => {
  it("never overwrites an end that already has a direct single-quarter fact", () => {
    const directQ2 = fact({ start: "2026-04-01", end: "2026-06-30", val: 999, fp: "Q2", filed: "2026-08-06" });
    const derived = deriveQuarterlyCashFlowFacts([Q1, directQ2], [SIX_MONTH], [], []);
    // The derived Q2 (val=120) must NOT appear — the direct fact (val=999) is untouched by this function,
    // and the merge in mappers.ts additionally guards this — this function itself simply never emits that end.
    expect(derived.has("2026-06-30")).toBe(false);
  });
});

describe("deriveQuarterlyCashFlowFacts — missing predecessor", () => {
  it("Q2 stays undetermined (not in the map) when Q1 is absent", () => {
    const derived = deriveQuarterlyCashFlowFacts([], [SIX_MONTH], [], []);
    expect(derived.has("2026-06-30")).toBe(false);
  });

  it("Q3 stays undetermined when the 6-month predecessor is absent, even though Q1 exists", () => {
    const derived = deriveQuarterlyCashFlowFacts([Q1], [], [NINE_MONTH], []);
    expect(derived.has("2026-09-30")).toBe(false);
  });

  it("never falls back to treating the cumulative fact alone as if it were the standalone quarter", () => {
    const derived = deriveQuarterlyCashFlowFacts([], [], [], [FISCAL_YEAR]);
    expect(derived.size).toBe(0);
  });
});

describe("deriveQuarterlyCashFlowFacts — fiscal-year-start mismatch", () => {
  it("does not derive when the two cumulative facts anchor to different fiscal-year starts", () => {
    const wrongStartSixMonth = { ...SIX_MONTH, start: "2025-01-01" };
    const derived = deriveQuarterlyCashFlowFacts([Q1], [wrongStartSixMonth], [], []);
    expect(derived.has("2026-06-30")).toBe(false);
  });
});

describe("deriveQuarterlyCashFlowFacts — invalid duration gap", () => {
  it("does not derive when the resulting gap falls outside the 80-100 day single-quarter window", () => {
    // A 6-month fact ending only ~40 days after Q1 (fiscal-year-end-change stub period, not a genuine quarter gap).
    const stubSixMonth = { ...SIX_MONTH, end: "2026-05-10" };
    const derived = deriveQuarterlyCashFlowFacts([Q1], [stubSixMonth], [], []);
    expect(derived.has("2026-05-10")).toBe(false);
  });

  it("rejects a gap that is too long (e.g. a skipped quarter) just as it rejects one too short", () => {
    const tooLongSixMonth = { ...SIX_MONTH, end: "2026-08-15" };
    const derived = deriveQuarterlyCashFlowFacts([Q1], [tooLongSixMonth], [], []);
    expect(derived.has("2026-08-15")).toBe(false);
  });
});

describe("deriveQuarterlyCashFlowFacts — amendment / latest-filed behavior", () => {
  it("derivation reflects whichever restated cumulative facts the caller already resolved to a single candidate", () => {
    // Callers pass already-deduped (latest-filed) fact arrays (parsing.ts) — this function trusts
    // exactly one candidate per tier/start; a restated 6-month value simply changes the input here.
    const restatedSixMonth = { ...SIX_MONTH, val: 250 };
    const derived = deriveQuarterlyCashFlowFacts([Q1], [restatedSixMonth], [], []);
    expect(derived.get("2026-06-30")).toMatchObject({ val: 150 }); // 250 - 100
  });

  it("is unresolvable (not derived) when more than one candidate lands in the same tier for the same start — genuine ambiguity, never guessed", () => {
    const ambiguousSixMonthA = { ...SIX_MONTH, val: 220 };
    const ambiguousSixMonthB = { ...SIX_MONTH, end: "2026-07-01", val: 230 }; // still within the 6-month window, different end
    const derived = deriveQuarterlyCashFlowFacts([Q1], [ambiguousSixMonthA, ambiguousSixMonthB], [], []);
    expect(derived.has("2026-06-30")).toBe(false);
    expect(derived.has("2026-07-01")).toBe(false);
  });
});

describe("deriveQuarterlyCashFlowFacts — derived asOf semantics", () => {
  it("asOf (via `filed`) is the LATER of the two contributing facts' filed dates, not the earlier one", () => {
    const earlyQ1 = { ...Q1, filed: "2026-05-01" };
    const lateSixMonth = { ...SIX_MONTH, filed: "2026-08-20" };
    const derived = deriveQuarterlyCashFlowFacts([earlyQ1], [lateSixMonth], [], []);
    expect(derived.get("2026-06-30")?.filed).toBe("2026-08-20");
  });

  it("still resolves a filed date even when the predecessor's filed is later than the current fact's (defensive, order-independent max)", () => {
    const lateQ1 = { ...Q1, filed: "2026-09-01" };
    const earlySixMonth = { ...SIX_MONTH, filed: "2026-08-06" };
    const derived = deriveQuarterlyCashFlowFacts([lateQ1], [earlySixMonth], [], []);
    expect(derived.get("2026-06-30")?.filed).toBe("2026-09-01");
  });
});

describe("deriveQuarterlyCashFlowFacts — negative values preserved unclamped", () => {
  it("preserves a negative derived value exactly as computed, never clamped or dropped", () => {
    // Cumulative decreases quarter-over-quarter (e.g. a large one-time disposal proceeds) —
    // a legitimate negative incremental value.
    const decreasingSixMonth = { ...SIX_MONTH, val: 50 }; // 50 - 100 = -50
    const derived = deriveQuarterlyCashFlowFacts([Q1], [decreasingSixMonth], [], []);
    expect(derived.get("2026-06-30")).toMatchObject({ val: -50 });
  });
});
