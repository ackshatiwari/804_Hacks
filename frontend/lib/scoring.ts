/**
 * Severity scoring — the swap point for model predictions.
 *
 * Everything here is derived from fields that already exist in the detection
 * dataset (emission rate, how often a spot reoffends). None of it is a model
 * output, and the UI labels it as such: a score shown as if it came from the
 * CNN when it did not would be worse than showing nothing.
 *
 * To replace this with real predictions, change `scoreCriticality` to read the
 * score the API returns. Nothing else in the frontend needs to move - views
 * only ever see the resulting number and band.
 */

export type Severity = "low" | "moderate" | "high" | "severe";

/** Where a displayed score came from, so the UI can say so plainly. */
export type ScoreSource = "dataset" | "model";

export const SCORE_SOURCE_LABEL: Record<ScoreSource, string> = {
  dataset: "Derived from dataset fields, not a model prediction",
  model: "Predicted by the trained model",
};

/**
 * Criticality, 0-100.
 *
 * Emission rate carries most of the weight because it is a measured quantity;
 * how often the spot reoffends adds a capped bonus. The cap matters: a chronic
 * medium leak can outrank a one-off of the same size, but a genuinely huge
 * single plume is never buried by persistence.
 */
export function scoreCriticality(rate: number, repeatCount: number): number {
  // log10(1 + 200 t/h) is the reference ceiling: ~200 t/h is a genuinely huge
  // plume, well past the feed's 90th percentile (~100 t/h). Anything larger
  // already pins the rate term, so the repeat bonus decides the ordering.
  const RATE_CEILING = Math.log10(1 + 200);
  const rateScore =
    Math.min(1, Math.log10(1 + Math.max(0, rate)) / RATE_CEILING) * 75;
  const repeatScore = Math.min(1, Math.max(0, repeatCount - 1) / 5) * 25;
  return Math.round(rateScore + repeatScore);
}

/**
 * Bands tuned against the live feed so a typical week reads as a handful of
 * genuinely bad events against a mostly moderate background, rather than an
 * all-red map that conveys nothing.
 */
export function severityFor(criticality: number): Severity {
  if (criticality >= 75) return "severe";
  if (criticality >= 58) return "high";
  if (criticality >= 38) return "moderate";
  return "low";
}

/**
 * Persistence, 0-100 — the hotspots ranking.
 *
 * Reverses criticality's emphasis: weeks seen leads, peak rate modulates. Two
 * spots that look alike on the map can sit far apart here, which is the
 * distinction the hotspots page exists to draw.
 */
export function scorePersistence(
  weeksSeen: number,
  windowWeeks: number,
  maxRate: number,
): number {
  return Math.round(
    Math.min(1, weeksSeen / windowWeeks) * 65 +
      Math.min(1, Math.log10(1 + maxRate) / Math.log10(1 + 200)) * 35,
  );
}
