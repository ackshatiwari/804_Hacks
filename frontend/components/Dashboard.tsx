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

import { PlumeCard } from "./PlumeCard";
import { PlumeRow } from "./PlumeRow";

// Leaflet touches window on import, so the map is client-only.
const PlumeMap = dynamic(() => import("./PlumeMap"), {
  ssr: false,
  loading: () => (
    <div className="u-mono flex h-full items-center justify-center text-[11px] text-[var(--dimmer)]">
      Loading basemap...
    </div>
  ),
});

type Filter = "all" | "repeat";

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="shrink-0">
      <div className="u-mono text-[19px] leading-none">{value}</div>
      <div className="u-eyebrow mt-1">{label}</div>
    </div>
  );
}

export function Dashboard({ feed }: { feed: PlumeFeed }) {
  const [selected, setSelected] = useState<Plume | null>(null);
  const [flyTarget, setFlyTarget] = useState<Plume | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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
    <div className="flex h-dvh flex-col bg-[var(--void)]">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-[var(--haze)] px-5 py-3">
        <div>
          <h1 className="u-display text-[19px]">Methane Watch</h1>
          <p className="u-mono mt-0.5 text-[10px] text-[var(--dimmer)]">
            Satellites see methane plumes every week. This map shows where they
            are and which ones keep coming back.
          </p>
        </div>
        <div className="flex items-center gap-7">
          <Stat
            value={formatRange(feed.weekStart, feed.latestDate)}
            label="Latest week"
          />
          <Stat value={feed.latest.length} label="Plumes" />
          <Stat value={repeats.length} label="Repeat spots" />
        </div>
      </header>

      {feed.error && (
        <p
          role="status"
          className="u-mono border-b border-[var(--ch4-severe)] bg-[var(--ch4-severe)]/12 px-5 py-2 text-[11px] text-[var(--paper)]"
        >
          Live detections unavailable &mdash; {feed.error}. Showing no plumes
          rather than an empty week.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <section
          className="flex w-full min-h-0 flex-col border-[var(--haze)] md:w-[330px] md:border-r"
          aria-label="Plumes this week, most critical first"
        >
          <div className="flex items-center gap-1 border-b border-[var(--haze)] px-4 py-2">
            {(
              [
                ["all", `All ${feed.latest.length}`],
                ["repeat", `Repeat ${repeats.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className="u-mono cursor-pointer border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] transition-colors"
                style={{
                  borderColor:
                    filter === key ? "var(--haze-bright)" : "transparent",
                  background:
                    filter === key ? "var(--panel-lift)" : "transparent",
                  color: filter === key ? "var(--paper)" : "var(--dimmer)",
                }}
              >
                {label}
              </button>
            ))}
            <span className="u-eyebrow ml-auto">by criticality</span>
          </div>

          <div className="u-scroll min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="u-mono px-4 py-6 text-[11px] text-[var(--dimmer)]">
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

        <main className="relative min-h-[340px] flex-1">
          <PlumeMap
            plumes={shown}
            selected={selected}
            flyTarget={flyTarget}
            onSelect={(p) => pick(p, false)}
          />
          {selected && (
            <PlumeCard plume={selected} onClose={() => setSelected(null)} />
          )}
        </main>
      </div>

      {/* The caveats belong on the page, not only in the pitch. */}
      <footer className="u-mono flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--haze)] px-5 py-2 text-[10px] text-[var(--dimmer)]">
        <span>
          Feed runs {feed.feedLagDays} days behind &middot; locations accurate
          to about {LOCATION_PRECISION_KM} km
        </span>
        <span className="ml-auto">
          Plume detections: SRON via CAMS (CC-BY 4.0, Schuit et al. 2023)
        </span>
      </footer>
    </div>
  );
}
