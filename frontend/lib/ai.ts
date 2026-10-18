/**
 * Groq-backed generation for the four AI surfaces.
 *
 * Every mode is grounded: the feed is fetched server-side and the real rows are
 * put in the prompt, so the model summarises data it was handed rather than
 * recalling anything about methane from training. The client sends a mode and
 * an id, never the figures themselves - otherwise a crafted request could make
 * the page state things that are not in the data.
 */

import type { Plume, PlumeFeed } from "./plumes";
import { REPEAT_WINDOW_WEEKS, SAME_SPOT_KM } from "./plumes";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export type AiMode = "brief" | "explain" | "chat" | "dossier";

export class AiUnavailable extends Error {}

const GROUND_RULES = `You are the analyst voice of Methane Watch, a weekly map of methane plumes detected from orbit by Sentinel-5P (TROPOMI), labelled by SRON and published through CAMS.

Rules you must follow:
- Use ONLY the figures given to you below. Never invent a plume, a rate, a country or a date.
- If the data cannot answer something, say so plainly in one sentence.
- Two caveats are always true and you must not contradict them: the feed runs about a week behind real time, and each location is the centre of a ~7 km satellite pixel, so it points at a facility or field, not a specific valve.
- A detection is an observation of a plume, not proof of who is responsible. Never accuse a named company. Describing the infrastructure type and country is fine.
- Emission rates are estimates with real uncertainty; say "about" or "roughly" rather than implying precision.
- Plain language, British spelling, no marketing tone, no emoji, no headings unless asked. Short sentences.`;

/** A compact text table of the week - cheaper and clearer than raw JSON. */
function renderFeed(feed: PlumeFeed, limit = 40): string {
  const rows = feed.latest
    .slice(0, limit)
    .map(
      (p) =>
        `${p.criticality}\t${p.severity}\t${p.rate}t/h±${p.uncertainty}\t${p.sourceType}\t${p.country}\t${p.lat.toFixed(2)},${p.lon.toFixed(2)}\t${p.date}\tseen ${p.repeatCount}x/${p.repeatDays}d in ${REPEAT_WINDOW_WEEKS}wk`,
    )
    .join("\n");

  const repeats = feed.latest.filter((p) => p.repeatCount > 1).length;
  return `Week ${feed.weekStart} to ${feed.latestDate}. ${feed.latest.length} plumes, ${repeats} of them at spots flagged more than once in the last ${REPEAT_WINDOW_WEEKS} weeks. ${feed.totalInWindow} detections in the whole ${REPEAT_WINDOW_WEEKS}-week window. Feed is ${feed.feedLagDays} days behind today.
Criticality is 0-100, blending emission rate with how persistent the spot is. Detections within ${SAME_SPOT_KM} km count as the same spot.

score\tseverity\trate\tinfrastructure\tcountry\tlat,lon\tobserved\trepeat
${rows}${feed.latest.length > limit ? `\n(${feed.latest.length - limit} more not listed)` : ""}`;
}

function renderPlume(p: Plume): string {
  return `Plume detail:
- Country: ${p.country}
- Infrastructure type nearby: ${p.sourceType}
- Emission rate: about ${p.rate} tonnes/hour (reported uncertainty ±${p.uncertainty})
- Observed: ${p.date} at ${p.timeUTC || "unknown time"} UTC
- Location: ${p.lat.toFixed(2)}, ${p.lon.toFixed(2)} (centre of a ~7 km pixel)
- Criticality: ${p.criticality}/100 (${p.severity})
- This spot was flagged ${p.repeatCount} time(s) across ${p.repeatDays} day(s) in the last ${REPEAT_WINDOW_WEEKS} weeks
- Weekly cadence, oldest week first: [${p.weeklyHistory.join(", ")}]`;
}

function promptFor(
  mode: AiMode,
  feed: PlumeFeed,
  plume: Plume | null,
  question: string,
): { system: string; user: string; maxTokens: number } {
  const week = renderFeed(feed);

  switch (mode) {
    case "brief":
      return {
        system: GROUND_RULES,
        maxTokens: 420,
        user: `${week}

Write the weekly brief: 3 short paragraphs, no headings.
1. What this week looks like overall - how many plumes, where the worst emissions are, which infrastructure dominates.
2. The spots that keep coming back, named by country and type, with how often they were seen.
3. One sentence on what a reader should take from it, then one sentence restating the two caveats.`,
      };

    case "explain":
      return {
        system: GROUND_RULES,
        maxTokens: 300,
        user: `${renderPlume(plume!)}

For context, this week had ${feed.latest.length} plumes and the highest criticality was ${feed.latest[0]?.criticality ?? "n/a"}.

In 3-4 sentences: what this detection likely represents given the infrastructure type, how its size compares with a typical plume in this feed (the median is around 32 t/h), whether its repeat pattern suggests a one-off release or an ongoing leak, and what the ~7 km location precision means for pinning it down.`,
      };

    case "dossier":
      return {
        system: GROUND_RULES,
        maxTokens: 460,
        user: `${renderPlume(plume!)}

This is a repeat offender profile. Cover, in short labelled lines:
- Pattern: what the weekly cadence shows - steady, intermittent, or a recent onset.
- Scale: how its rate sits against this week's feed.
- Context: what ${plume!.sourceType} infrastructure in ${plume!.country} typically implies for methane, hedged appropriately.
- Watch for: what would change the picture over the next few weeks.
Keep each to one or two sentences.`,
      };

    case "chat":
      return {
        system: `${GROUND_RULES}

Answer questions about the week's data below. If a question needs a figure that is not in the table, say which figure is missing instead of estimating. Keep answers under 120 words unless asked to expand.`,
        maxTokens: 420,
        user: `${week}

Question: ${question}`,
      };
  }
}

export async function generate(
  mode: AiMode,
  feed: PlumeFeed,
  plume: Plume | null,
  question = "",
): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new AiUnavailable(
      "No GROQ_API_KEY is set, so the analyst is offline. Everything else on this page is live data and works without it.",
    );
  }

  const { system, user, maxTokens } = promptFor(mode, feed, plume, question);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw new AiUnavailable(
      err instanceof Error && err.name === "TimeoutError"
        ? "The analyst took too long to respond."
        : "Could not reach the analyst.",
    );
  }

  if (res.status === 429) {
    // Groq's free tier is 100K tokens/day and resets daily, so this is worth
    // distinguishing from a real failure - it heals on its own.
    throw new AiUnavailable(
      "Daily AI quota is spent. It resets every 24 hours; the rest of the page is unaffected.",
    );
  }
  if (!res.ok) {
    throw new AiUnavailable(`The analyst returned ${res.status}.`);
  }

  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new AiUnavailable("The analyst returned an empty response.");
  return text;
}
