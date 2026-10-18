"use client";

import { useMemo, useState } from "react";

import { SEVERITY_SOFT, SEVERITY_VAR, formatCoords, formatDate } from "@/lib/format";
import { REPEAT_WINDOW_WEEKS, type Hotspot, type Plume } from "@/lib/plumes";

import { HistoryStrip } from "./HistoryStrip";
import { HotspotDossier } from "./HotspotDossier";

type Band = "chronic" | "active" | "all";

const BANDS: [Band, string][] = [
  ["chronic", "Chronic"],
  ["active", "Active this week"],
  ["all", "All spots"],
];

export function HotspotsTable({
  spots,
  thisWeek,
}: {
  spots: Hotspot[];
  thisWeek: Plume[];
}) {
  const [band, setBand] = useState<Band>("chronic");
  const [type, setType] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const types = useMemo(
    () => ["All", ...new Set(spots.map((s) => s.sourceType))].sort(),
    [spots],
  );

  const rows = useMemo(() => {
    let r = spots;
    if (band === "chronic") r = r.filter((s) => s.weeksSeen >= 3);
    if (band === "active") r = r.filter((s) => s.activeThisWeek);
    if (type !== "All") r = r.filter((s) => s.sourceType === type);
    return r.slice(0, 120);
  }, [spots, band, type]);

  /** The current-week detection nearest this spot, for grounding the dossier. */
  const plumeIdFor = (s: Hotspot): string | null => {
    if (!s.activeThisWeek) return null;
    let best: Plume | null = null;
    for (const p of thisWeek) {
      const d = Math.hypot(p.lat - s.lat, p.lon - s.lon);
      if (!best || d < Math.hypot(best.lat - s.lat, best.lon - s.lon)) best = p;
    }
    return best?.id ?? null;
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {BANDS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className="btn"
            aria-pressed={band === k}
            onClick={() => setBand(k)}
          >
            {label}
          </button>
        ))}

        <span className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

        <label className="flex items-center gap-2">
          <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
            Infrastructure
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-2.5 py-1.5"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-btn)",
              color: "var(--text-primary)",
              fontSize: "var(--t-13)",
              fontFamily: "var(--font-body)",
            }}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <span className="ml-auto" style={{ fontSize: "var(--t-13)", color: "var(--text-muted)" }}>
          {rows.length} {rows.length === 1 ? "spot" : "spots"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="card p-8" style={{ color: "var(--text-muted)", fontSize: "var(--t-14)" }}>
          Nothing matches that filter in the last {REPEAT_WINDOW_WEEKS} weeks.
        </p>
      ) : (
        <div className="card overflow-hidden">
          {rows.map((s) => {
            const color = SEVERITY_VAR[s.severity];
            const isOpen = open === s.id;
            return (
              <div key={s.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-5 py-3.5 text-left"
                >
                  <span className="num display shrink-0" style={{ fontSize: "var(--t-21)", color, width: 42 }}>
                    {s.persistence}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: "var(--t-15)", fontWeight: 500 }}>
                      {s.country}
                      {s.activeThisWeek && (
                        <span className="ml-2" style={{ fontSize: "var(--t-11)", color: "var(--accent)", fontWeight: 600 }}>
                          ACTIVE
                        </span>
                      )}
                    </span>
                    <span className="block truncate" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", marginTop: 2 }}>
                      {s.sourceType} · {formatCoords(s.lat, s.lon)}
                    </span>
                  </span>

                  <span className="shrink-0 max-md:hidden">
                    <HistoryStrip weeks={s.weeklyHistory} color={color} size={8} />
                  </span>

                  <span className="num shrink-0 text-right max-sm:hidden" style={{ fontSize: "var(--t-13)", width: 92, color: "var(--text-secondary)" }}>
                    {s.weeksSeen}/{REPEAT_WINDOW_WEEKS} weeks
                  </span>

                  <span className="num shrink-0 text-right" style={{ fontSize: "var(--t-15)", width: 84 }}>
                    {s.maxRate} t/h
                  </span>

                  <span aria-hidden className="shrink-0" style={{ color: "var(--text-muted)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}>
                    ›
                  </span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5" style={{ background: "var(--bg-primary)" }}>
                    <div className="grid gap-5 pt-4 md:grid-cols-[1fr_1.3fr]">
                      <dl className="m-0 grid grid-cols-2 gap-y-4">
                        {[
                          ["Detections", `${s.detections} in ${REPEAT_WINDOW_WEEKS} weeks`],
                          ["Weeks seen", `${s.weeksSeen} of ${REPEAT_WINDOW_WEEKS}`],
                          ["Peak rate", `${s.maxRate} t/h`],
                          ["Typical rate", `${s.meanRate} t/h`],
                          ["First seen", formatDate(s.firstSeen)],
                          ["Last seen", formatDate(s.lastSeen)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
                              {k}
                            </dt>
                            <dd className="num" style={{ fontSize: "var(--t-14)", margin: "3px 0 0" }}>
                              {v}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <div className="rounded-[var(--radius-lg)] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
                        <span className="eyebrow eyebrow-accent" style={{ marginBottom: 10 }}>
                          Dossier
                        </span>
                        <HotspotDossier plumeId={plumeIdFor(s)} label={`${s.sourceType} in ${s.country}`} />
                      </div>
                    </div>

                    <span
                      className="sev mt-4 inline-flex"
                      style={{ "--sev-color": color, "--sev-soft": SEVERITY_SOFT[s.severity] } as React.CSSProperties}
                    >
                      peak severity: {s.severity}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
