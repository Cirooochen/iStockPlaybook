import { whyThisStance } from "@/data/unity-seed";
import { formatPct } from "@/lib/format";

interface Props {
  // Live position return — the canonical source (PositionAndStrategy
  // renders the same value via the same formatPct helper). Never a
  // second, static copy of this number (Phase F.1A).
  unrealizedReturnPct: number;
}

export function WhyThisStance({ unrealizedReturnPct }: Props) {
  const supporting = [
    ...whyThisStance.supporting,
    `Position is meaningfully profitable (${formatPct(unrealizedReturnPct)})`,
  ];

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-5">
        Why this stance?
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Supporting */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
            Supporting
          </p>
          <ul className="space-y-2">
            {supporting.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                <span className="text-teal-500 mt-0.5 font-medium">+</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Constraints */}
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
            Constraints
          </p>
          <ul className="space-y-2">
            {whyThisStance.constraints.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                <span className="text-amber-500 mt-0.5 font-medium">–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
