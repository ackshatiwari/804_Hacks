"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { formatRange } from "@/lib/format";
import {
  LOCATION_PRECISION_KM,
  REPEAT_WINDOW_WEEKS,
  type Plume,
  type PlumeFeed,
} from "@/lib/plumes";

import { AskPanel } from "./AskPanel";
import { PlumeCard } from "./PlumeCard";
import { PlumeRow } from "./PlumeRow";
import { WeeklyBrief } from "./WeeklyBrief";

// Leaflet touches window on import, so the map is client-only.
const PlumeMap = dynamic(() => import("./PlumeMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full items-center justify-center"
      style={{ fontSize: "var(--t-13)", color: "var(--text-muted)" }}
    >
      Loading basemap…
    </div>
  ),
});

type Filter = "all" | "repeat";

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="shrink-0">
      <div className="num display" style={{ fontSize: "var(--t-21)" }}>
        {value}
      </div>
      <span className="eyebrow" style={{ marginTop: 4, fontSize: "var(--t-11)" }}>
        {label}
      </span>
    </div>
  );
}

export function Dashboard({ feed }: { feed: PlumeFeed }) {
  const [selected, setSelected] = useState<Plume | null>(null);
  const [flyTarget, setFlyTarget] = useState<Plume | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [asking, setAsking] = useState(false);

  const repeats = useMemo(
    () => feed.latest.filter((p) => p.repeatCount > 1),
    [feed.latest],
  );
  const shown = filter === "repeat" ? repeats : feed.latest;

  const pick = (p: Plume, fly: boolean) => {
    setSelected(p);
    if (fly) setFlyTarget(p);
  };

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <header
        className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b px-5 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat value={formatRange(feed.weekStart, feed.latestDate)} label="Latest week" />
        <Stat value={feed.latest.length} label="Plumes" />
        <Stat value={repeats.length} label="Repeat spots" />
        <Stat value={feed.totalInWindow} label={`${REPEAT_WINDOW_WEEKS}-week detections`} />
      </header>

      {feed.error && (
        <p
          role="status"
          className="border-b px-5 py-2"
          style={{
            borderColor: "var(--sev-severe)",
            background: "var(--sev-severe-soft)",
            fontSize: "var(--t-13)",
            margin: 0,
          }}
        >
          Live detections unavailable — {feed.error}.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <section
          className="flex min-h-0 w-full flex-col border-r md:w-[372px]"
          style={{ borderColor: "var(--border)" }}
          aria-label="Plumes this week, most critical first"
        >
          <div className="scroll max-h-[38%] shrink-0 overflow-y-auto border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
            <WeeklyBrief compact />
          </div>

          <div
            className="flex items-center gap-1.5 border-b px-4 py-2.5"
            style={{ borderColor: "var(--border)" }}
          >
            {(
              [
                ["all", `All ${feed.latest.length}`],
                ["repeat", `Repeat ${repeats.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="btn"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                style={{ fontSize: "var(--t-12)" }}
              >
                {label}
              </button>
            ))}
            <span className="eyebrow ml-auto" style={{ fontSize: "var(--t-11)" }}>
              by criticality
            </span>
          </div>

          <div className="scroll min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-4 py-6" style={{ fontSize: "var(--t-13)", color: "var(--text-muted)" }}>
                No repeat spots this week. Every plume is a first sighting in{" "}
                {REPEAT_WINDOW_WEEKS} weeks.
              </p>
            ) : (
              shown.map((p) => (
                <PlumeRow
                  key={p.id}
                  plume={p}
                  selected={selected?.id === p.id}
                  onSelect={() => pick(p, true)}
                />
              ))
            )}
          </div>
        </section>

        <main className="relative min-h-[360px] flex-1">
          <PlumeMap
            plumes={shown}
            selected={selected}
            flyTarget={flyTarget}
            onSelect={(p) => pick(p, false)}
          />

          {!asking && (
            <button
              type="button"
              className="btn btn-accent absolute bottom-3 left-3 z-[1000]"
              onClick={() => setAsking(true)}
            >
              Ask about this week
            </button>
          )}
          {asking && <AskPanel onClose={() => setAsking(false)} />}

          {selected && <PlumeCard plume={selected} onClose={() => setSelected(null)} />}
        </main>
      </div>

      <footer
        className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-5 py-2"
        style={{ borderColor: "var(--border)", fontSize: "var(--t-11)", color: "var(--text-muted)" }}
      >
        <span>
          Feed runs {feed.feedLagDays} days behind · locations accurate to about{" "}
          {LOCATION_PRECISION_KM} km
        </span>
        <span>
          Criticality is derived from dataset fields (rate and repeat count) —
          it is not a model prediction.
        </span>
        <span className="ml-auto">
          Plume detections: SRON via CAMS (CC-BY 4.0, Schuit et al. 2023)
        </span>
      </footer>
    </div>
  );
}
