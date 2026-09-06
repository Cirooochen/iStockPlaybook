import { unityViewChanges } from "@/data/unity-seed";

export function WhatChangesMyView() {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-stone-700 mb-5">
        What would change my view?
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* More bullish */}
        <div>
          <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-3">
            More bullish
          </p>
          <ul className="space-y-2">
            {unityViewChanges.moreBullish.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-stone-600"
              >
                <span className="text-teal-400 mt-0.5">+</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* More cautious */}
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">
            More cautious
          </p>
          <ul className="space-y-2">
            {unityViewChanges.moreCautious.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-stone-600"
              >
                <span className="text-amber-400 mt-0.5">–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
