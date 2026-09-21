interface Props {
  currentPct: number;
  targetMinPct: number;
  targetMaxPct: number;
}

// Keeps both labels' centered text fully inside the meter's own width,
// regardless of container size (responsive) — independent of the
// row-stacking below, which is what actually prevents the two labels
// from ever overlapping each other.
export function clampLabelPosition(pct: number): number {
  return Math.min(Math.max(pct, 8), 92);
}

// Phase H.6 §6.1 bug: the "current" and "target" labels were both
// absolutely positioned on the same row, so whenever currentPct and the
// target midpoint were close together (or the container was narrow),
// their text visually overlapped/interleaved. Pulled out as a pure
// function so the "always on separate rows" invariant — the actual
// fix — has a regression test independent of any DOM/rendering setup.
export interface ConcentrationLabelLayout {
  current: { left: number; row: 0 | 1; text: string };
  target: { left: number; row: 0 | 1; text: string };
}

export function computeConcentrationLabelLayout(
  currentPct: number,
  targetMinPct: number,
  targetMaxPct: number
): ConcentrationLabelLayout {
  const targetMidPct = (targetMinPct + targetMaxPct) / 2;
  return {
    current: {
      left: clampLabelPosition(currentPct),
      row: 0,
      text: `${currentPct.toFixed(1)}% now`,
    },
    target: {
      left: clampLabelPosition(targetMidPct),
      row: 1,
      text: `${targetMinPct}–${targetMaxPct}% target`,
    },
  };
}

export function ConcentrationMeter({
  currentPct,
  targetMinPct,
  targetMaxPct,
}: Props) {
  const targetMidPct = (targetMinPct + targetMaxPct) / 2;
  const labels = computeConcentrationLabelLayout(currentPct, targetMinPct, targetMaxPct);

  return (
    <div>
      <p className="text-xs text-stone-400 mb-2">Portfolio weight</p>
      <div className="relative h-4 bg-stone-100 rounded-full overflow-visible mb-3">
        {/* Target zone */}
        <div
          className="absolute top-0 h-full bg-teal-100 rounded-sm bar-grow-in"
          style={{
            left: `${targetMinPct}%`,
            width: `${targetMaxPct - targetMinPct}%`,
          }}
        />
        {/* Current bar */}
        <div
          className="absolute top-0 left-0 h-full bg-amber-400 rounded-full bar-grow-in"
          style={{ width: `${Math.min(currentPct, 100)}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-teal-500 opacity-60"
          style={{ left: `${targetMidPct}%` }}
        />
        {/* Current marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-amber-600"
          style={{ left: `${Math.min(currentPct, 99.5)}%` }}
        />
      </div>
      {/* Labels — stacked on their own row each so the two floating,
          independently-positioned labels can never overlap no matter how
          close currentPct and targetMidPct are (the Phase H.6 bug: at
          narrow widths, or when the two percentages are close, the same
          horizontal band was shared, producing overlapping/interleaved
          text). Each still sits near its own marker on the bar above. */}
      <div className="relative h-8">
        <div
          className="absolute top-0 text-xs text-amber-700 font-semibold transform -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${labels.current.left}%` }}
        >
          {labels.current.text}
        </div>
        <div
          className="absolute top-4 text-xs text-teal-600 font-medium transform -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${labels.target.left}%` }}
        >
          {labels.target.text}
        </div>
      </div>
    </div>
  );
}
