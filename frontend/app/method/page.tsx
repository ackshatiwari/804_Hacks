import { readFile } from "node:fs/promises";
import path from "node:path";

import { cacheLife } from "next/cache";

import { Reveal } from "@/components/Reveal";
import {
  LOCATION_PRECISION_KM,
  REPEAT_WINDOW_WEEKS,
  SAME_SPOT_KM,
} from "@/lib/plumes";

export const metadata = { title: "Model & method · Methane Watch" };

const SECTION = "mx-auto w-full max-w-[920px] px-5";

type Metrics = {
  threshold: number;
  test: {
    precision: number;
    recall: number;
    f1: number;
    average_precision: number;
    support: number;
    n: number;
  };
  counts: { train: number; val: number; test: number };
};

/**
 * Model metrics are published by the training run as public/model-metrics.json.
 * Until that file exists the page says so rather than showing placeholder
 * numbers - a method page that invents its own scores is worse than no page.
 */
async function loadMetrics(): Promise<Metrics | null> {
  "use cache";
  cacheLife("hours");

  try {
    const raw = await readFile(
      path.join(process.cwd(), "public", "model-metrics.json"),
      "utf8",
    );
    const m = JSON.parse(raw);
    return typeof m?.test?.f1 === "number" ? (m as Metrics) : null;
  } catch {
    return null;
  }
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
      <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>{label}</span>
      <div className="num display mt-2" style={{ fontSize: "var(--t-34)" }}>{value}</div>
      {note && <p className="mt-2" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", margin: "8px 0 0" }}>{note}</p>}
    </div>
  );
}

function Block({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section className="border-t py-12" style={{ borderColor: "var(--border)" }}>
        <span className="eyebrow eyebrow-accent">{eyebrow}</span>
        <h2 className="heading mt-3" style={{ fontSize: "var(--t-26)" }}>{title}</h2>
        <div className="mt-5 flex flex-col gap-4" style={{ fontSize: "var(--t-15)", color: "var(--text-secondary)", lineHeight: 1.68 }}>
          {children}
        </div>
      </section>
    </Reveal>
  );
}

export default async function MethodPage() {
  const m = await loadMetrics();

  return (
    <main className={`${SECTION} py-14`}>
      <Reveal>
        <span className="eyebrow">Model &amp; method</span>
        <h1 className="display mt-4" style={{ fontSize: "clamp(32px, 5.4vw, var(--t-56))" }}>
          How a plume gets on this map.
        </h1>
        <p className="mt-6 max-w-[62ch]" style={{ fontSize: "var(--t-16)", color: "var(--text-secondary)", lineHeight: 1.62 }}>
          Everything here is derived from public data, and every number on the
          site traces back to a detection you can look up. This page says how,
          and where the limits are.
        </p>
      </Reveal>

      <Block eyebrow="Step one" title="Where the detections come from">
        <p>
          Sentinel-5P carries TROPOMI, which measures methane in a column of air
          roughly {LOCATION_PRECISION_KM} km across. SRON analyses that imagery
          and publishes confirmed plume detections through the CAMS Methane
          Hotspot Explorer. We read that list directly — it is the same source
          the model trains against, so the map and the model always describe the
          same events.
        </p>
        <p>
          Each detection carries a date, a location, an estimated emission rate
          in tonnes per hour with its own uncertainty, and the type of
          infrastructure nearby: coal, oil, gas or landfill.
        </p>
      </Block>

      <Block eyebrow="Step two" title="The model">
        <p>
          A small convolutional network learns to tell plume patches from
          no-plume patches. Each training example is a two-channel image: methane
          enhancement in parts per billion, plus a mask marking which pixels had
          a valid retrieval. The mask matters — it lets the network learn to
          distrust a patch that is mostly cloud instead of reading a gap as
          signal.
        </p>
        <p>
          Two choices keep the score honest. Splits are made <strong style={{ color: "var(--text-primary)" }}>by date, not at random</strong>,
          so the test set is always weeks the model has never seen. And the
          decision threshold is chosen on validation data, never on test.
        </p>
        <p>
          The set is deliberately imbalanced — three no-plume patches for every
          plume — so accuracy is close to meaningless here. A model that answers
          &ldquo;no plume&rdquo; every single time scores 75% accuracy and an F1
          of zero. That is why these are the numbers we report:
        </p>
      </Block>

      {m ? (
        <Reveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Precision" value={m.test.precision.toFixed(3)} note="Of the patches called a plume, how many were." />
            <Figure label="Recall" value={m.test.recall.toFixed(3)} note="Of the real plumes, how many were found." />
            <Figure label="F1" value={m.test.f1.toFixed(3)} note="The balance of the two." />
            <Figure label="Avg precision" value={m.test.average_precision.toFixed(3)} note="Area under the precision-recall curve." />
          </div>
          <p className="mt-4" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)" }}>
            Measured on {m.test.n.toLocaleString()} held-out patches
            ({m.test.support.toLocaleString()} real plumes) at a threshold of{" "}
            {m.threshold.toFixed(2)} chosen on validation. Trained on{" "}
            {m.counts.train.toLocaleString()} patches.
          </p>
        </Reveal>
      ) : (
        <Reveal>
          <div className="card p-6">
            <span className="eyebrow" style={{ fontSize: "var(--t-11)" }}>Scores pending</span>
            <p className="mt-3" style={{ fontSize: "var(--t-15)", color: "var(--text-secondary)", lineHeight: 1.6, margin: "12px 0 0" }}>
              The model has not published a scored run yet, so there are no
              precision, recall or F1 figures to show. We would rather leave this
              blank than fill it with numbers nothing produced.
            </p>
            <p className="mt-3" style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", margin: "12px 0 0" }}>
              A training run drops its results at{" "}
              <code style={{ color: "var(--text-secondary)" }}>public/model-metrics.json</code>{" "}
              and this section fills itself in.
            </p>
          </div>
        </Reveal>
      )}

      <Block eyebrow="Step three" title="Scoring a week">
        <p>
          <strong style={{ color: "var(--text-primary)" }}>Criticality</strong> (0&ndash;100) ranks the map. Emission rate carries
          most of the weight because it is a measured quantity; how often the
          spot reoffends adds a capped bonus. The cap is the point — a chronic
          medium leak can outrank a one-off of the same size, but a genuinely
          huge single plume is never buried by it.
        </p>
        <p>
          <strong style={{ color: "var(--text-primary)" }}>Persistence</strong> ranks the hotspots page, and reverses that
          emphasis: weeks seen leads, peak rate modulates. Two spots that look
          alike on the map can sit far apart here, which is the distinction the
          page exists to draw.
        </p>
        <p>
          Two detections within {SAME_SPOT_KM} km are treated as the same
          physical spot, across a {REPEAT_WINDOW_WEEKS}-week window. That radius
          is a judgement call: wide enough to absorb the instrument&rsquo;s own
          pointing error, narrow enough that neighbouring facilities do not merge
          into one.
        </p>
      </Block>

      <Block eyebrow="Limits" title="What this cannot tell you">
        <p>
          <strong style={{ color: "var(--text-primary)" }}>The feed runs about a week behind.</strong> Detections are published
          after processing. This is a record of recent weeks, not a live alarm.
        </p>
        <p>
          <strong style={{ color: "var(--text-primary)" }}>Locations are approximate.</strong> A point is the centre of a{" "}
          {LOCATION_PRECISION_KM} km pixel — enough to identify a field or a
          facility, never a specific piece of equipment.
        </p>
        <p>
          <strong style={{ color: "var(--text-primary)" }}>A detection is an observation, not blame.</strong> The data shows
          methane above infrastructure of a given type. It does not establish who
          is responsible, and we name no companies.
        </p>
        <p>
          <strong style={{ color: "var(--text-primary)" }}>Rates are estimates.</strong> Each carries a reported uncertainty,
          often ±30% or more. Treat every figure on this site as approximate.
        </p>
        <p>
          <strong style={{ color: "var(--text-primary)" }}>Absence is not evidence.</strong> TROPOMI cannot retrieve methane
          through thick cloud, over water, or at high latitudes in winter. A
          quiet region may simply be one the instrument could not read.
        </p>
      </Block>

      <Block eyebrow="Provenance" title="Data and credit">
        <p>
          Plume detections: SRON, published via the CAMS Methane Hotspot
          Explorer, CC-BY 4.0 — cite Schuit et al. 2023. Imagery: Copernicus
          Sentinel-5P / TROPOMI, <code style={{ color: "var(--text-secondary)" }}>COPERNICUS/S5P/OFFL/L3_CH4</code>{" "}
          via Google Earth Engine. Basemap: Esri, HERE, Garmin and OpenStreetMap
          contributors.
        </p>
      </Block>
    </main>
  );
}
