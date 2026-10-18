import Link from "next/link";
import { Suspense } from "react";

import { Reveal } from "@/components/Reveal";
import { SEVERITY_SOFT, SEVERITY_VAR, formatRange } from "@/lib/format";
import { getWeeklyFeed } from "@/lib/datasource";
import {
  LOCATION_PRECISION_KM,
  REPEAT_WINDOW_WEEKS,
  SAME_SPOT_KM,
  type PlumeFeed,
} from "@/lib/plumes";

const SECTION = "mx-auto w-full max-w-[1100px] px-5";

function Hero({ feed }: { feed: PlumeFeed }) {
  const repeats = feed.latest.filter((p) => p.repeatCount > 1).length;
  return (
    <section className="grid-ground border-b" style={{ borderColor: "var(--border)" }}>
      <div className={`${SECTION} py-20 md:py-28`}>
        <Reveal>
          <span className="eyebrow eyebrow-accent">
            {feed.error ? "Live feed unavailable" : `Week of ${formatRange(feed.weekStart, feed.latestDate)}`}
          </span>
        </Reveal>

        <Reveal delay={60}>
          <h1
            className="display mt-5 max-w-[16ch]"
            style={{ fontSize: "clamp(40px, 7.2vw, var(--t-72))" }}
          >
            Satellites see methane plumes every week.
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p
            className="mt-6 max-w-[54ch]"
            style={{ fontSize: "var(--t-18)", color: "var(--text-secondary)", lineHeight: 1.55 }}
          >
            This map shows where they are — and which ones keep coming back.
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/map" className="btn btn-accent no-underline" style={{ fontSize: "var(--t-14)", padding: "10px 18px" }}>
              Open the live map
            </Link>
            <Link href="/method" className="btn no-underline" style={{ fontSize: "var(--t-14)", padding: "10px 18px" }}>
              How it works
            </Link>
          </div>
        </Reveal>

        <Reveal delay={240}>
          <dl className="mt-14 flex flex-wrap gap-x-12 gap-y-6">
            {[
              [feed.latest.length, "plumes this week"],
              [repeats, "spots seen before"],
              [feed.totalInWindow, `detections in ${REPEAT_WINDOW_WEEKS} weeks`],
              [`${LOCATION_PRECISION_KM} km`, "location precision"],
            ].map(([value, label]) => (
              <div key={String(label)}>
                <dt className="num display" style={{ fontSize: "var(--t-44)" }}>
                  {value}
                </dt>
                <dd className="eyebrow" style={{ margin: "6px 0 0", fontSize: "var(--t-11)" }}>
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

function Parts() {
  const parts = [
    {
      k: "Model",
      t: "A CNN trained on the satellite imagery",
      d: "A small convolutional network learns plume from no-plume on Sentinel-5P patches, using SRON's detections as labels. Splits are by date, so the reported score describes weeks the model never saw.",
    },
    {
      k: "Map",
      t: "The latest week, as the instrument saw it",
      d: "Every plume in the most recent week of data, ranked by a criticality score that blends emission rate with how persistent the spot is. Click one for the full record.",
    },
    {
      k: "Repeat spots",
      t: "The ones that keep coming back",
      d: `For each plume, how many times that spot was flagged in the last ${REPEAT_WINDOW_WEEKS} weeks. Anything within ${SAME_SPOT_KM} km counts as the same spot — so a chronic leak stops looking like a series of unrelated events.`,
    },
  ];

  return (
    <section className={`${SECTION} py-20 md:py-24`}>
      <Reveal>
        <span className="eyebrow">Three parts</span>
        <h2 className="heading mt-4 max-w-[20ch]" style={{ fontSize: "var(--t-34)" }}>
          One week of data, read three ways.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {parts.map((p, i) => (
          <Reveal key={p.k} delay={i * 80}>
            <article className="card h-full p-6">
              <span className="eyebrow eyebrow-accent">{p.k}</span>
              <h3 className="heading mt-3" style={{ fontSize: "var(--t-18)" }}>
                {p.t}
              </h3>
              <p className="mt-3" style={{ fontSize: "var(--t-14)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {p.d}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Footprint() {
  return (
    <section className="border-y" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className={`${SECTION} grid items-center gap-12 py-20 md:grid-cols-2 md:py-24`}>
        <Reveal>
          <span className="eyebrow">Why squares, not pins</span>
          <h2 className="heading mt-4" style={{ fontSize: "var(--t-34)" }}>
            A pin would claim a precision the instrument doesn&rsquo;t have.
          </h2>
          <p className="mt-5" style={{ fontSize: "var(--t-15)", color: "var(--text-secondary)", lineHeight: 1.65 }}>
            A TROPOMI pixel is about {LOCATION_PRECISION_KM} km across. So every
            plume is drawn as its true footprint instead of a dot — zoom in and
            the cell converges on its real size on the ground. Spots that
            reoffend wear one extra ring for each week they were seen.
          </p>
          <p className="mt-4" style={{ fontSize: "var(--t-15)", color: "var(--text-secondary)", lineHeight: 1.65 }}>
            It points at a facility or a field. Never at a valve.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div
            className="flex items-center justify-center rounded-[var(--radius-lg)] border p-10"
            style={{ borderColor: "var(--border)", background: "var(--bg-primary)", minHeight: 260 }}
          >
            <div className="flex items-end gap-10">
              <figure className="m-0 flex flex-col items-center gap-4">
                <span
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 2,
                    background: "rgba(251,113,133,0.5)",
                    boxShadow: "0 0 0 1px var(--sev-severe), 0 0 22px 2px rgba(251,113,133,0.4)",
                  }}
                />
                <figcaption className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
                  One-off
                </figcaption>
              </figure>

              <figure className="m-0 flex flex-col items-center gap-4">
                <span className="relative inline-block" style={{ width: 54, height: 54 }}>
                  <span
                    className="absolute"
                    style={{
                      inset: 0,
                      borderRadius: 2,
                      background: "rgba(251,113,133,0.5)",
                      boxShadow: "0 0 0 1px var(--sev-severe), 0 0 22px 2px rgba(251,113,133,0.4)",
                    }}
                  />
                  {[6, 12, 18].map((o) => (
                    <span
                      key={o}
                      className="absolute"
                      style={{
                        inset: -o,
                        border: "1px solid var(--sev-severe)",
                        borderRadius: 3,
                        opacity: 0.5 - o * 0.018,
                      }}
                    />
                  ))}
                </span>
                <figcaption className="eyebrow" style={{ fontSize: "var(--t-11)" }}>
                  Seen 4 weeks
                </figcaption>
              </figure>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TopThisWeek({ feed }: { feed: PlumeFeed }) {
  const top = feed.latest.slice(0, 5);
  if (top.length === 0) return null;

  return (
    <section className={`${SECTION} py-20 md:py-24`}>
      <Reveal>
        <span className="eyebrow">Worst this week</span>
        <h2 className="heading mt-4" style={{ fontSize: "var(--t-34)" }}>
          Ranked by criticality.
        </h2>
        <p className="mt-4 max-w-[60ch]" style={{ fontSize: "var(--t-15)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Emission rate carries most of the weight, because it is measured. How
          often the spot reoffends adds a capped bonus — enough that a chronic
          medium leak can outrank a one-off of the same size.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <div className="card mt-10 overflow-hidden">
          {top.map((p, i) => (
            <Link
              key={p.id}
              href="/map"
              className="flex items-center gap-4 border-b px-5 py-4 no-underline transition-colors last:border-b-0"
              style={{ borderColor: "var(--border-subtle)", color: "inherit" }}
            >
              <span className="num display shrink-0" style={{ fontSize: "var(--t-26)", color: SEVERITY_VAR[p.severity], width: 48 }}>
                {p.criticality}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: "var(--t-15)", fontWeight: 500 }}>
                  {p.country}
                </span>
                <span className="block truncate" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", marginTop: 2 }}>
                  {p.sourceType} ·{" "}
                  {p.repeatCount > 1 ? `seen ${p.repeatCount}× in ${REPEAT_WINDOW_WEEKS} weeks` : "first sighting"}
                </span>
              </span>
              <span
                className="sev shrink-0 max-sm:hidden"
                style={{ "--sev-color": SEVERITY_VAR[p.severity], "--sev-soft": SEVERITY_SOFT[p.severity] } as React.CSSProperties}
              >
                {p.severity}
              </span>
              <span className="num shrink-0" style={{ fontSize: "var(--t-15)", width: 78, textAlign: "right" }}>
                {p.rate} t/h
              </span>
              <span aria-hidden style={{ color: "var(--text-muted)", fontSize: "var(--t-15)" }}>
                ›
              </span>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Caveats({ feed }: { feed: PlumeFeed }) {
  return (
    <section className="border-t" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
      <div className={`${SECTION} py-20 md:py-24`}>
        <Reveal>
          <span className="eyebrow">What this can and cannot tell you</span>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              {
                t: `The feed runs about a week behind`,
                d: `Detections are published after processing. Right now the newest observation is ${feed.feedLagDays} days old, so this is a record of recent weeks, not a live alarm.`,
              },
              {
                t: `Locations are approximate`,
                d: `Each point is the centre of a ~${LOCATION_PRECISION_KM} km pixel. Good enough to identify a field or facility, never a specific piece of equipment.`,
              },
              {
                t: "A detection is an observation, not blame",
                d: "The data says methane was seen above infrastructure of a given type. It does not establish who is responsible, and we name no companies.",
              },
              {
                t: "Rates are estimates with real uncertainty",
                d: "Every plume carries a reported uncertainty, often ±30% or more. Treat the numbers as approximate throughout.",
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}>
                <article className="h-full rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
                  <h3 className="heading" style={{ fontSize: "var(--t-16)" }}>
                    {c.t}
                  </h3>
                  <p className="mt-2.5" style={{ fontSize: "var(--t-14)", color: "var(--text-secondary)", lineHeight: 1.6, margin: "10px 0 0" }}>
                    {c.d}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

async function Page_() {
  const feed = await getWeeklyFeed();
  return (
    <main>
      <Hero feed={feed} />
      <Parts />
      <Footprint />
      <TopThisWeek feed={feed} />
      <Caveats feed={feed} />
      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className={`${SECTION} flex flex-wrap gap-x-6 gap-y-2 py-8`} style={{ fontSize: "var(--t-12)", color: "var(--text-muted)" }}>
          <span>Plume detections: SRON via CAMS (CC-BY 4.0, Schuit et al. 2023)</span>
          <span>Imagery: Copernicus Sentinel-5P / TROPOMI</span>
          <a href="https://github.com/ackshatiwari/804_Hacks" target="_blank" rel="noreferrer" className="ml-auto no-underline" style={{ color: "var(--text-secondary)" }}>
            Source on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className={`${SECTION} py-28`} style={{ color: "var(--text-muted)" }}>Loading this week&rsquo;s detections…</div>}>
      <Page_ />
    </Suspense>
  );
}
