// Phase E.7B — extractDurationFacts / extractInstantFacts / parseFiscalQuarter.
import { describe, expect, it } from "vitest";
import { extractDurationFacts, extractInstantFacts, parseFiscalQuarter } from "@/infrastructure/market-data/sec-edgar/parsing";

describe("extractDurationFacts", () => {
  it("accepts a ~91-day single-quarter fact and rejects ~182-day/~365-day facts", () => {
    const facts = [
      { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", filed: "2026-05-07" }, // 89 days
      { start: "2026-01-01", end: "2026-07-02", val: 200, fy: 2026, fp: "Q2", filed: "2026-08-06" }, // ~182 days
      { start: "2025-01-01", end: "2025-12-31", val: 400, fy: 2025, fp: "FY", filed: "2026-02-01" }, // ~365 days, also FY
    ];
    const result = extractDurationFacts(facts);
    expect(result).toHaveLength(1);
    expect(result[0].end).toBe("2026-03-31");
  });

  it("drops a fact missing `start` (cannot compute duration) rather than assuming it's single-quarter", () => {
    const facts = [{ end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", filed: "2026-05-07" }];
    expect(extractDurationFacts(facts)).toEqual([]);
  });

  it("dedupes two facts with identical (start,end) by latest `filed`", () => {
    const facts = [
      { start: "2026-01-01", end: "2026-03-31", val: 100, fy: 2026, fp: "Q1", filed: "2026-05-07" },
      { start: "2026-01-01", end: "2026-03-31", val: 105, fy: 2026, fp: "Q1", filed: "2026-08-06" }, // later-filed restatement
    ];
    const result = extractDurationFacts(facts);
    expect(result).toHaveLength(1);
    expect(result[0].val).toBe(105);
  });
});

describe("extractInstantFacts", () => {
  it("passes instant facts through unfiltered by duration (no `start` field expected)", () => {
    const facts = [{ end: "2026-03-31", val: 500, fy: 2026, fp: "Q1", filed: "2026-05-07" }];
    expect(extractInstantFacts(facts)).toHaveLength(1);
  });

  it("excludes fp='FY' facts even though they carry no duration to filter on", () => {
    const facts = [
      { end: "2025-12-31", val: 500, fy: 2025, fp: "FY", filed: "2026-02-01" },
      { end: "2026-03-31", val: 600, fy: 2026, fp: "Q1", filed: "2026-05-07" },
    ];
    const result = extractInstantFacts(facts);
    expect(result).toHaveLength(1);
    expect(result[0].end).toBe("2026-03-31");
  });

  it("dedupes by `end` alone, keeping the latest-filed value", () => {
    const facts = [
      { end: "2025-12-31", val: 2055840000, fy: 2025, fp: "Q4", filed: "2026-05-07" },
      { end: "2025-12-31", val: 2055840000, fy: 2026, fp: "Q1", filed: "2026-08-06", frame: "CY2025Q4I" },
    ];
    const result = extractInstantFacts(facts);
    expect(result).toHaveLength(1);
    expect(result[0].filed).toBe("2026-08-06");
  });
});

describe("parseFiscalQuarter", () => {
  it("parses Q1-Q4", () => {
    expect(parseFiscalQuarter("Q1")).toBe(1);
    expect(parseFiscalQuarter("Q2")).toBe(2);
    expect(parseFiscalQuarter("Q3")).toBe(3);
    expect(parseFiscalQuarter("Q4")).toBe(4);
  });

  it("returns null, never a fabricated quarter, for FY or an unrecognized value", () => {
    expect(parseFiscalQuarter("FY")).toBeNull();
    expect(parseFiscalQuarter("bogus")).toBeNull();
  });
});
