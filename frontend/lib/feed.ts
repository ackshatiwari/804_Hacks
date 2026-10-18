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

/**
 * Fetch the live CAMS plume list and fold it into the weekly feed.
 *
 * Cached with the Cache Components model (`cacheComponents: true` in
 * next.config.ts): the `hours` profile revalidates hourly and expires after a
 * day, which is plenty for a source that publishes roughly daily and already
 * runs about a week behind real time.
 *
 * The parsing and clustering live in `./plumes`, which imports nothing from
 * Next, so that logic stays unit-testable outside the framework.
 */
export async function fetchFeed(): Promise<PlumeFeed> {
  "use cache";
  cacheLife("hours");

  // The page is prerendered at build time, so an upstream outage must not fail
  // the build - it degrades to a feed that says what went wrong.
  try {
    const res = await fetch(PLUMES_CSV_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return emptyFeed(`CAMS returned ${res.status} ${res.statusText}`);
    }
    const detections = parseDetections(await res.text());
    if (detections.length === 0) {
      return emptyFeed("CAMS returned no usable detections");
    }
    return buildFeed(detections);
  } catch (err) {
    return emptyFeed(
      err instanceof Error ? err.message : "could not reach the CAMS feed",
    );
  }
}

/** Every spot in the repeat window, ranked by persistence. */
export async function fetchHotspots(): Promise<{
  spots: Hotspot[];
  windowStart: string;
  latestDate: string;
  error?: string;
}> {
  "use cache";
  cacheLife("hours");

  try {
    const res = await fetch(PLUMES_CSV_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      const today = new Date().toISOString().slice(0, 10);
      return { spots: [], windowStart: today, latestDate: today, error: `CAMS returned ${res.status}` };
    }
    return buildHotspots(parseDetections(await res.text()));
  } catch (err) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      spots: [],
      windowStart: today,
      latestDate: today,
      error: err instanceof Error ? err.message : "could not reach the CAMS feed",
    };
  }
}
