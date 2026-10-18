import { getWeeklyFeed } from "@/lib/datasource";

/**
 * The weekly feed as JSON, for the Python side and anyone who wants the data.
 *
 * Returns the latest week of plumes, each already annotated with its repeat
 * count, weekly history and criticality - the same objects the map renders.
 */
export async function GET() {
  const feed = await getWeeklyFeed();
  return Response.json(feed);
}
