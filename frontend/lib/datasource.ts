/**
 * The single data-access boundary for the whole UI.
 *
 * Nothing in app/ or components/ fetches anything directly - they call these
 * four functions. That is the seam for the FastAPI backend: set
 * NEXT_PUBLIC_API_BASE_URL and every read switches to the API with no change
 * to any view.
 *
 * Until that base URL is set, the frontend derives everything from the public
 * CAMS/SRON detection list, which is the dataset build_dataset.py already uses.
 *
 * Expected API shape when the backend lands:
 *   GET {base}/plumes/latest   -> PlumeFeed
 *   GET {base}/hotspots        -> { spots, windowStart, latestDate }
 *   GET {base}/model/metrics   -> ModelMetrics | 404 while untrained
 */

import { cacheLife } from "next/cache";

import {
  buildFeed,
  buildHotspots,
  emptyFeed,
  parseDetections,
  PLUMES_CSV_URL,
  type Hotspot,
  type PlumeFeed,
} from "./plumes";

/** Set to point the frontend at the FastAPI service. Unset = local CSV. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
).replace(/\/$/, "");

export const usingApi = () => API_BASE_URL.length > 0;

/** Where the figures on screen actually came from, for honest labelling. */
export type Provenance = "api" | "dataset";

export type HotspotResult = {
  spots: Hotspot[];
  windowStart: string;
  latestDate: string;
  provenance: Provenance;
  error?: string;
};

export type FeedResult = PlumeFeed & { provenance: Provenance };

/**
 * Model metrics are owned by the backend. The frontend never computes or
 * invents them - if the API has none, the UI says so rather than showing a
 * placeholder that could be mistaken for a real score.
 */
export type ModelMetrics = {
  precision: number;
  recall: number;
  f1: number;
  roc_auc?: number;
  threshold?: number;
  n_test?: number;
};

const TIMEOUT_MS = 30_000;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function readDetectionCsv(): Promise<string | null> {
  try {
    const res = await fetch(PLUMES_CSV_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** The latest week of plumes. */
export async function getWeeklyFeed(): Promise<FeedResult> {
  "use cache";
  cacheLife("hours");

  if (usingApi()) {
    const feed = await getJson<PlumeFeed>("/plumes/latest");
    if (feed) return { ...feed, provenance: "api" };
    return { ...emptyFeed("the API did not respond"), provenance: "api" };
  }

  const csv = await readDetectionCsv();
  if (csv === null) {
    return { ...emptyFeed("could not reach the detection feed"), provenance: "dataset" };
  }
  const detections = parseDetections(csv);
  if (detections.length === 0) {
    return { ...emptyFeed("the detection feed held no usable rows"), provenance: "dataset" };
  }
  return { ...buildFeed(detections), provenance: "dataset" };
}

/** Every spot in the repeat window, ranked by persistence. */
export async function getHotspots(): Promise<HotspotResult> {
  "use cache";
  cacheLife("hours");

  const today = new Date().toISOString().slice(0, 10);

  if (usingApi()) {
    const data = await getJson<Omit<HotspotResult, "provenance">>("/hotspots");
    if (data) return { ...data, provenance: "api" };
    return {
      spots: [],
      windowStart: today,
      latestDate: today,
      provenance: "api",
      error: "the API did not respond",
    };
  }

  const csv = await readDetectionCsv();
  if (csv === null) {
    return {
      spots: [],
      windowStart: today,
      latestDate: today,
      provenance: "dataset",
      error: "could not reach the detection feed",
    };
  }
  return { ...buildHotspots(parseDetections(csv)), provenance: "dataset" };
}

/**
 * Model metrics, if the backend publishes any. Returns null while the model is
 * still being trained - the UI must render that state, never a stand-in.
 */
export async function getModelMetrics(): Promise<ModelMetrics | null> {
  "use cache";
  cacheLife("hours");

  if (!usingApi()) return null;
  const m = await getJson<ModelMetrics>("/model/metrics");
  return m && typeof m.f1 === "number" ? m : null;
}
