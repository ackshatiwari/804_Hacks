"use client";

import {
  SEVERITY_COLOR,
  formatCoords,
  formatDate,
  repeatPhrase,
} from "@/lib/format";
import { LOCATION_PRECISION_KM, SAME_SPOT_KM, type Plume } from "@/lib/plumes";

import { HistoryStrip } from "./HistoryStrip";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="u-eyebrow">{label}</div>
      <div className="u-mono mt-1 text-[13px]">{value}</div>
    </div>
  );
}

export function PlumeCard({
  plume,
  onClose,
}: {
  plume: Plume;
  onClose: () => void;
}) {
  const color = SEVERITY_COLOR[plume.severity];
  return (
    <aside
      className="u-scroll absolute inset-x-3 bottom-3 z-[1000] max-h-[82%] overflow-y-auto border border-[var(--haze)] bg-[var(--ground)]/97 p-4 backdrop-blur-sm sm:inset-x-auto sm:right-3 sm:w-[310px]"
      aria-label={`Plume detail, ${plume.country}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="u-eyebrow" style={{ color }}>
            {plume.severity}
          </div>
          <h2 className="u-display mt-1 text-[21px]">{plume.country}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close plume detail"
          className="cursor-pointer border border-[var(--haze)] bg-transparent px-2 py-1 text-[11px] text-[var(--dim)] transition-colors hover:border-[var(--haze-bright)] hover:text-[var(--paper)]"
        >
          Close
        </button>
      </div>

      {/* The two measured quantities, given the most room. */}
      <div className="mt-4 flex items-end gap-5 border-y border-[var(--haze)] py-3">
        <div>
          <div className="u-eyebrow">Emission rate</div>
          <div className="u-mono mt-1 text-[26px] leading-none" style={{ color }}>
            {plume.rate}
            <span className="ml-1 text-[12px] text-[var(--dim)]">t/h</span>
          </div>
          {plume.uncertainty > 0 && (
            <div className="u-mono mt-1 text-[10px] text-[var(--dimmer)]">
              &plusmn;{plume.uncertainty} t/h
            </div>
          )}
        </div>
        <div>
          <div className="u-eyebrow">Criticality</div>
          <div className="u-mono mt-1 text-[26px] leading-none">
            {plume.criticality}
            <span className="ml-1 text-[12px] text-[var(--dim)]">/100</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="u-eyebrow">Repeat history</div>
        <div className="mt-2 flex items-center gap-3">
          <HistoryStrip weeks={plume.weeklyHistory} color={color} size={11} />
          <span className="u-mono text-[11px]" style={{ color }}>
            {repeatPhrase(plume)}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--dimmer)]">
          One square per week, oldest first. Detections within {SAME_SPOT_KM} km
          count as the same spot.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-4 border-t border-[var(--haze)] pt-4">
        <Field label="Observed" value={formatDate(plume.date)} />
        <Field label="Time (UTC)" value={plume.timeUTC || "--"} />
        <Field label="Infrastructure" value={plume.sourceType} />
        <Field label="Location" value={formatCoords(plume.lat, plume.lon)} />
      </div>

      <p className="mt-4 border-t border-[var(--haze)] pt-3 text-[11px] leading-relaxed text-[var(--dimmer)]">
        Location is the centre of a TROPOMI pixel, so it is accurate to roughly{" "}
        {LOCATION_PRECISION_KM} km &mdash; it points at a facility, not a valve.
      </p>
    </aside>
  );
}
