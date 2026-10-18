"use client";

import {
  SEVERITY_SOFT,
  SEVERITY_VAR,
  formatCoords,
  formatDate,
  repeatPhrase,
} from "@/lib/format";
import { LOCATION_PRECISION_KM, SAME_SPOT_KM, type Plume } from "@/lib/plumes";

import { AiFootnote, AiProse, AiStatus } from "./AiProse";
import { HistoryStrip } from "./HistoryStrip";
import { useAi } from "./useAi";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
        {label}
      </span>
      <div className="num" style={{ fontSize: "var(--t-14)", marginTop: 3 }}>
        {value}
      </div>
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
  const color = SEVERITY_VAR[plume.severity];
  const ai = useAi("explain");

  return (
    <aside
      className="card scroll absolute inset-x-3 bottom-3 z-[1000] max-h-[84%] overflow-y-auto p-4 sm:inset-x-auto sm:right-3 sm:w-[336px]"
      style={{ boxShadow: "var(--shadow-lg)" }}
      aria-label={`Plume detail, ${plume.country}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className="sev"
            style={
              {
                "--sev-color": color,
                "--sev-soft": SEVERITY_SOFT[plume.severity],
              } as React.CSSProperties
            }
          >
            <span className="dot" style={{ "--sev-color": color } as React.CSSProperties} />
            {plume.severity}
          </span>
          <h2 className="heading" style={{ fontSize: "var(--t-21)", marginTop: 8 }}>
            {plume.country}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="btn btn-quiet">
          Close
        </button>
      </div>

      <div
        className="mt-4 flex items-end gap-6 border-y py-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div>
          <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
            Emission rate
          </span>
          <div className="num display" style={{ fontSize: "var(--t-34)", color, marginTop: 4 }}>
            {plume.rate}
            <span style={{ fontSize: "var(--t-13)", color: "var(--text-muted)", marginLeft: 4 }}>
              t/h
            </span>
          </div>
          {plume.uncertainty > 0 && (
            <div className="num" style={{ fontSize: "var(--t-11)", color: "var(--text-muted)", marginTop: 3 }}>
              ±{plume.uncertainty} t/h
            </div>
          )}
        </div>
        <div>
          <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
            Criticality
          </span>
          <div className="num display" style={{ fontSize: "var(--t-34)", marginTop: 4 }}>
            {plume.criticality}
            <span style={{ fontSize: "var(--t-13)", color: "var(--text-muted)", marginLeft: 4 }}>
              /100
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
          Repeat history
        </span>
        <div className="mt-2 flex items-center gap-3">
          <HistoryStrip weeks={plume.weeklyHistory} color={color} size={11} />
          <span style={{ fontSize: "var(--t-12)", color }}>{repeatPhrase(plume)}</span>
        </div>
        <p style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
          One square per week, oldest first. Detections within {SAME_SPOT_KM} km
          count as the same spot.
        </p>
      </div>

      <div
        className="mt-4 grid grid-cols-2 gap-y-4 border-t pt-4"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <Field label="Observed" value={formatDate(plume.date)} />
        <Field label="Time (UTC)" value={plume.timeUTC || "—"} />
        <Field label="Infrastructure" value={plume.sourceType} />
        <Field label="Location" value={formatCoords(plume.lat, plume.lon)} />
      </div>

      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
        {!ai.text && !ai.loading && !ai.error && (
          <button
            type="button"
            className="btn"
            onClick={() => ai.run({ plumeId: plume.id })}
          >
            Explain this plume
          </button>
        )}
        <AiStatus loading={ai.loading} error={ai.error} label="Reading this detection" />
        {ai.text && (
          <div className="flex flex-col gap-2">
            <span className="eyebrow eyebrow-accent" style={{ fontSize: "var(--t-11)" }}>
              Analyst note
            </span>
            <AiProse text={ai.text} />
            <AiFootnote />
          </div>
        )}
      </div>

      <p
        className="mt-4 border-t pt-3"
        style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", borderColor: "var(--border-subtle)", lineHeight: 1.55 }}
      >
        Location is the centre of a TROPOMI pixel, so it is accurate to roughly{" "}
        {LOCATION_PRECISION_KM} km — it points at a facility, not a valve.
      </p>
    </aside>
  );
}
