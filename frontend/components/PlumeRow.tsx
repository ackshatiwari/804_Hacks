"use client";

import { SEVERITY_COLOR, formatCoords, repeatPhrase } from "@/lib/format";
import type { Plume } from "@/lib/plumes";

import { HistoryStrip } from "./HistoryStrip";

export function PlumeRow({
  plume,
  selected,
  onSelect,
}: {
  plume: Plume;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = SEVERITY_COLOR[plume.severity];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className="w-full cursor-pointer border-0 border-b border-[var(--haze)] bg-transparent px-4 py-3 text-left transition-colors hover:bg-[var(--panel-lift)]"
      style={selected ? { background: "var(--panel-lift)" } : undefined}
    >
      <div className="flex items-baseline gap-3">
        {/* Criticality leads: it is the one number that orders the week. */}
        <span
          className="u-mono shrink-0 text-[17px] font-semibold tabular-nums"
          style={{ color }}
        >
          {plume.criticality}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {plume.country}
        </span>
        <span className="u-mono shrink-0 text-[11px] text-[var(--dim)]">
          {plume.rate} t/h
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="u-mono truncate text-[10px] text-[var(--dimmer)]">
          {plume.sourceType} &middot; {formatCoords(plume.lat, plume.lon)}
        </span>
        <HistoryStrip weeks={plume.weeklyHistory} color={color} size={7} />
      </div>
      {plume.repeatCount > 1 && (
        <div className="u-mono mt-1.5 text-[10px]" style={{ color }}>
          {repeatPhrase(plume)}
        </div>
      )}
    </button>
  );
}
