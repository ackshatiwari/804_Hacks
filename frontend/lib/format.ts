import type { Plume, Severity } from "./plumes";

export const SEVERITY_COLOR: Record<Severity, string> = {
  low: "var(--ch4-low)",
  moderate: "var(--ch4-moderate)",
  high: "var(--ch4-high)",
  severe: "var(--ch4-severe)",
};

/** Hex equivalents, for canvas/SVG contexts that cannot read CSS variables. */
export const SEVERITY_HEX: Record<Severity, string> = {
  low: "#2e8b96",
  moderate: "#c9a94e",
  high: "#e07b3c",
  severe: "#e8453a",
};

/** "2026-10-09" -> "9 Oct 2026" */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-10-03", "2026-10-09" -> "3-9 Oct 2026" */
export function formatRange(startIso: string, endIso: string): string {
  const s = new Date(`${startIso}T00:00:00Z`);
  const e = new Date(`${endIso}T00:00:00Z`);
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short" };
  const sMonth = sameMonth ? "" : ` ${s.toLocaleDateString("en-GB", opts)}`;
  return `${s.getUTCDate()}${sMonth}-${e.getUTCDate()} ${e.toLocaleDateString(
    "en-GB",
    opts,
  )} ${e.getUTCFullYear()}`;
}

/** Signed decimal degrees -> "38.58°N, 54.20°E" */
export function formatCoords(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** The headline sentence for a repeat offender. */
export function repeatPhrase(p: Plume): string {
  if (p.repeatCount <= 1) return "First sighting in 8 weeks";
  return `Seen ${p.repeatCount} times in 8 weeks`;
}
