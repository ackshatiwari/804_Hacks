export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Plume = {
  id: string;
  date: string;
  lat: number;
  lon: number;
  prob: number;
  peak_ppb: number;
  valid_frac: number;
  repeat_count: number;
  repeat_dates: string[];
  image_url: string;
};

export type PlumesResponse = {
  start: string | null;
  end: string | null;
  threshold: number;
  plumes: Plume[];
};

export type Metrics = {
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  threshold: number;
  n_test: number;
};

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export function formatLatLon(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
