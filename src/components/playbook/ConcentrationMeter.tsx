interface Props {
  currentPct: number;
  targetMinPct: number;
  targetMaxPct: number;
}

export function ConcentrationMeter({
  currentPct,
  targetMinPct,
  targetMaxPct,
}: Props) {
  const targetMidPct = (targetMinPct + targetMaxPct) / 2;

  return (
    <div>
      <p className="text-xs text-stone-400 mb-2">Portfolio weight</p>
      <div className="relative h-4 bg-stone-100 rounded-full overflow-visible mb-3">
        {/* Target zone */}
        <div
          className="absolute top-0 h-full bg-teal-100 rounded-sm"
          style={{
            left: `${targetMinPct}%`,
            width: `${targetMaxPct - targetMinPct}%`,
          }}
        />
        {/* Current bar */}
        <div
          className="absolute top-0 left-0 h-full bg-amber-400 rounded-full"
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
      {/* Labels */}
      <div className="relative h-4">
        <div
          className="absolute text-xs text-teal-600 font-medium transform -translate-x-1/2"
          style={{ left: `${targetMidPct}%` }}
        >
          {targetMinPct}–{targetMaxPct}% target
        </div>
        <div
          className="absolute text-xs text-amber-700 font-semibold transform -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.min(currentPct, 95)}%` }}
        >
          {currentPct}% now
        </div>
      </div>
    </div>
  );
}
