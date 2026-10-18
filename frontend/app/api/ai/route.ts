import { AiUnavailable, generate, type AiMode } from "@/lib/ai";
import { getWeeklyFeed } from "@/lib/datasource";

const MODES: AiMode[] = ["brief", "explain", "chat", "dossier"];

/**
 * All four AI surfaces. The feed is read server-side and the caller may only
 * name a mode, a plume id and a question - never the figures - so the page can
 * never be made to assert something that is not in the data.
 */
export async function POST(req: Request) {
  let body: { mode?: string; plumeId?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const mode = body.mode as AiMode;
  if (!MODES.includes(mode)) {
    return Response.json(
      { error: `mode must be one of ${MODES.join(", ")}.` },
      { status: 400 },
    );
  }

  const question = (body.question ?? "").slice(0, 600);
  if (mode === "chat" && !question.trim()) {
    return Response.json({ error: "Ask a question first." }, { status: 400 });
  }

  const feed = await getWeeklyFeed();
  if (feed.error) {
    return Response.json(
      { error: `No live data to summarise - ${feed.error}` },
      { status: 503 },
    );
  }

  let plume = null;
  if (mode === "explain" || mode === "dossier") {
    plume = feed.latest.find((p) => p.id === body.plumeId) ?? null;
    if (!plume) {
      return Response.json(
        { error: "That plume is not in the current week." },
        { status: 404 },
      );
    }
  }

  try {
    return Response.json({ text: await generate(mode, feed, plume, question) });
  } catch (err) {
    if (err instanceof AiUnavailable) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json(
      { error: "The analyst failed unexpectedly." },
      { status: 500 },
    );
  }
}
