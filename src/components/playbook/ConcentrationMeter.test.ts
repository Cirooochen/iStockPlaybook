import { describe, expect, it } from "vitest";
import {
  clampLabelPosition,
  computeConcentrationLabelLayout,
} from "./ConcentrationMeter";

// Phase H.6 §6.1 regression: the "current" and "target" labels rendered
// on the same row, so their text visually overlapped/interleaved
// whenever currentPct was close to the target midpoint (or the
// container was narrow) — e.g. "14.3065838150289% now" appearing fused
// with "10–18% target". The fix puts them on permanently separate rows
// and rounds currentPct for display; both invariants are asserted here
// independent of any DOM/rendering setup.
describe("computeConcentrationLabelLayout", () => {
  it("always keeps the two labels on separate rows, however close the percentages are", () => {
    // Real ASML case from the H.6 report — current (14.3%) sits almost
    // exactly on the target midpoint (14%).
    const asml = computeConcentrationLabelLayout(14.3, 10, 18);
    expect(asml.current.row).not.toBe(asml.target.row);

    // Real Unity case from the H.6 report.
    const unity = computeConcentrationLabelLayout(58.6, 40, 45);
    expect(unity.current.row).not.toBe(unity.target.row);

    // Adversarial: current sits exactly on the target midpoint.
    const exact = computeConcentrationLabelLayout(42.5, 40, 45);
    expect(exact.current.row).not.toBe(exact.target.row);
  });

  it("rounds the unformatted current-weight float to one decimal place", () => {
    // The exact unrounded value from the H.6 bug report.
    expect(computeConcentrationLabelLayout(14.30635833150289, 10, 18).current.text).toBe(
      "14.3% now"
    );
    expect(computeConcentrationLabelLayout(58.591374438218, 40, 45).current.text).toBe(
      "58.6% now"
    );
  });

  it("preserves the existing target-label text and midpoint calculation", () => {
    const { target } = computeConcentrationLabelLayout(58.6, 40, 45);
    expect(target.text).toBe("40–45% target");
    expect(target.left).toBe(42.5); // (40 + 45) / 2, unclamped range
  });

  it("does not change the underlying concentration numbers, only their display", () => {
    const { current } = computeConcentrationLabelLayout(102.4, 40, 45);
    // Formatting still reflects the real (even if extreme) weight —
    // only the label's on-screen left offset is clamped, per
    // clampLabelPosition, never the reported percentage itself.
    expect(current.text).toBe("102.4% now");
  });
});

describe("clampLabelPosition", () => {
  it("leaves in-range positions unchanged", () => {
    expect(clampLabelPosition(50)).toBe(50);
  });

  it("clamps low positions so the label never clips off the left edge", () => {
    expect(clampLabelPosition(0)).toBe(8);
    expect(clampLabelPosition(-10)).toBe(8);
  });

  it("clamps high positions so the label never clips off the right edge", () => {
    expect(clampLabelPosition(100)).toBe(92);
    expect(clampLabelPosition(150)).toBe(92);
  });
});
