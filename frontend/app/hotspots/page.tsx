import { Suspense } from "react";

import { HotspotsTable } from "@/components/HotspotsTable";
import { getHotspots, getWeeklyFeed } from "@/lib/datasource";
import { formatRange } from "@/lib/format";
import { REPEAT_WINDOW_WEEKS, SAME_SPOT_KM } from "@/lib/plumes";

export const metadata = { title: "Hotspots · Methane Watch" };

async function Body() {
  const [{ spots, windowStart, latestDate, error }, feed] = await Promise.all([
    getHotspots(),
    getWeeklyFeed(),
  ]);

  const chronic = spots.filter((s) => s.weeksSeen >= 3).length;
  const active = spots.filter((s) => s.activeThisWeek).length;

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 py-12">
      <span className="eyebrow eyebrow-accent">
        {error ? "Live feed unavailable" : `${formatRange(windowStart, latestDate)}`}
      </span>
      <h1 className="display mt-4" style={{ fontSize: "clamp(32px, 5vw, var(--t-56))" }}>
        The spots that keep coming back.
      </h1>
      <p className="mt-5 max-w-[62ch]" style={{ fontSize: "var(--t-16)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Every detection from the last {REPEAT_WINDOW_WEEKS} weeks, clustered into
        physical spots — anything within {SAME_SPOT_KM} km counts as the same
        place. Ranked by persistence, so a chronic leak outranks a single bad day.
      </p>

      {error ? (
        <p
          role="status"
          className="card mt-8 p-5"
          style={{ borderColor: "var(--sev-severe)", background: "var(--sev-severe-soft)", fontSize: "var(--t-14)" }}
        >
          Could not read the detection feed — {error}.
        </p>
      ) : (
        <>
          <dl className="mt-10 mb-10 flex flex-wrap gap-x-12 gap-y-6">
            {[
              [spots.length, "spots tracked"],
              [chronic, "seen 3+ weeks"],
              [active, "active this week"],
            ].map(([v, l]) => (
              <div key={String(l)}>
                <dt className="num display" style={{ fontSize: "var(--t-34)" }}>{v}</dt>
                <dd className="eyebrow" style={{ margin: "6px 0 0", fontSize: "var(--t-11)" }}>{l}</dd>
              </div>
            ))}
          </dl>

          <HotspotsTable spots={spots} thisWeek={feed.latest} />

          <p className="mt-8" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Persistence weights how many weeks a spot appeared over how large its
            peak plume was — the opposite emphasis to the map&rsquo;s criticality
            score, which leads on emission rate. Showing at most 120 spots.
          </p>
          <p className="mt-2" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Both scores are computed from fields already present in the
            detection dataset. Neither is a model prediction.
          </p>
        </>
      )}
    </main>
  );
}

export default function HotspotsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-5 py-28" style={{ color: "var(--text-muted)" }}>
          Clustering the last {REPEAT_WINDOW_WEEKS} weeks of detections…
        </div>
      }
    >
      <Body />
    </Suspense>
  );
}
