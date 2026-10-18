"use client";

import { SEVERITY_VAR, formatCoords, repeatPhrase } from "@/lib/format";
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
  const color = SEVERITY_VAR[plume.severity];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className="w-full cursor-pointer border-0 border-b px-4 py-3 text-left transition-colors"
      style={{
        borderColor: "var(--border-subtle)",
        background: selected ? "var(--accent-soft)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--hover-wash)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="num shrink-0"
          style={{ fontSize: "var(--t-18)", fontWeight: 600, color }}
        >
          {plume.criticality}
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          style={{ fontSize: "var(--t-14)", fontWeight: 500 }}
        >
          {plume.country}
        </span>
        <span
          className="num shrink-0"
          style={{ fontSize: "var(--t-12)", color: "var(--text-muted)" }}
        >
          {plume.rate} t/h
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className="num truncate"
          style={{ fontSize: "var(--t-12)", color: "var(--text-muted)" }}
        >
          {plume.sourceType} · {formatCoords(plume.lat, plume.lon)}
        </span>
        <HistoryStrip weeks={plume.weeklyHistory} color={color} size={7} />
      </div>

      {plume.repeatCount > 1 && (
        <div style={{ fontSize: "var(--t-12)", color, marginTop: 6 }}>
          {repeatPhrase(plume)}
        </div>
      )}
    </button>
  );
}
