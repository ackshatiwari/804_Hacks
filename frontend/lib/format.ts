import type { Plume, Severity } from "./plumes";

/** CSS custom properties, so views never hardcode a hex (Aspen's rule). */
export const SEVERITY_VAR: Record<Severity, string> = {
  low: "var(--sev-low)",
  moderate: "var(--sev-moderate)",
  high: "var(--sev-high)",
  severe: "var(--sev-severe)",
};

export const SEVERITY_SOFT: Record<Severity, string> = {
  low: "var(--sev-low-soft)",
  moderate: "var(--sev-moderate-soft)",
  high: "var(--sev-high-soft)",
  severe: "var(--sev-severe-soft)",
};

/** Literals, only for canvas/SVG/Leaflet contexts that cannot read CSS vars. */
export const SEVERITY_HEX: Record<Severity, string> = {
  low: "#9e9e9e",
  moderate: "#fbbf24",
  high: "#fb923c",
  severe: "#fb7185",
};

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(startIso: string, endIso: string): string {
  const s = new Date(`${startIso}T00:00:00Z`);
  const e = new Date(`${endIso}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "short" };
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const sMonth = sameMonth ? "" : ` ${s.toLocaleDateString("en-GB", opts)}`;
  return `${s.getUTCDate()}${sMonth}–${e.getUTCDate()} ${e.toLocaleDateString("en-GB", opts)} ${e.getUTCFullYear()}`;
}

export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

export function repeatPhrase(p: Plume): string {
  if (p.repeatCount <= 1) return "First sighting in 8 weeks";
  return `Seen ${p.repeatCount} times in 8 weeks`;
}
