import { cacheLife } from "next/cache";

import { buildFeed, parseDetections, PLUMES_CSV_URL, type PlumeFeed } from "./plumes";

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

  const res = await fetch(PLUMES_CSV_URL);
  if (!res.ok) {
    throw new Error(`CAMS plume feed returned ${res.status} ${res.statusText}`);
  }
  return buildFeed(parseDetections(await res.text()));
}
