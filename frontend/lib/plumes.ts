/**
 * Methane plume data layer.
 *
 * Detections come from the SRON plume list published through the CAMS Methane
 * Hotspot Explorer (CC-BY 4.0, cite Schuit et al. 2023) - the same labels
 * `backend/scripts/build_dataset.py` trains the CNN against, so the map and the
 * model always describe the same events.
 *
 * Two caveats belong in the pitch and in the UI:
 *   - the feed runs ~1 week behind real time
 *   - locations are approximate (TROPOMI pixels are ~7 km)
 */

export const PLUMES_CSV_URL =
  "https://sites.ecmwf.int/data/cams/products/methane_emissions/data/data.csv";

/** Two detections this close are treated as the same physical spot. */
export const SAME_SPOT_KM = 15;
/** How far back "keeps coming back" looks. */
export const REPEAT_WINDOW_WEEKS = 8;
/** TROPOMI pixel size, i.e. how precise a single location can be. */
export const LOCATION_PRECISION_KM = 7;

const EARTH_RADIUS_KM = 6371;

export type SourceType = "Coal" | "Oil" | "Gas" | "Landfill" | "Unclassified";

export type Detection = {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  timeUTC: string;
  lat: number;
  lon: number;
  /** Emission rate in tonnes per hour. */
  rate: number;
  /** Reported uncertainty on `rate`, same units. */
  uncertainty: number;
  sourceType: SourceType;
  country: string;
};

export type Severity = "low" | "moderate" | "high" | "severe";

export type Plume = Detection & {
  /** Detections within SAME_SPOT_KM over the repeat window, this one included. */
  repeatCount: number;
  /** Distinct days this spot was flagged over the repeat window. */
  repeatDays: number;
  /**
   * Detections at this spot per week over the repeat window, oldest first.
   * Length is REPEAT_WINDOW_WEEKS. Drives the "keeps coming back" strip.
   */
  weeklyHistory: number[];
  /** Stable id for the spot, shared by every detection that falls on it. */
  spotId: string;
  severity: Severity;
  /** 0-100. Blends emission rate with how persistent the spot is. */
  criticality: number;
};

export type PlumeFeed = {
  /** Plumes in the most recent week of data. */
  latest: Plume[];
  /** Newest detection date in the feed, ISO. */
  latestDate: string;
  /** Start of the "latest week" window, ISO. */
  weekStart: string;
  /** Days between the newest detection and now - the pitch's "~1 week behind". */
  feedLagDays: number;
  totalInWindow: number;
  generatedAt: string;
  /** Set when the upstream feed could not be read; the page says so instead of rendering an empty map as if the week were quiet. */
  error?: string;
};

// ---------------------------------------------------------------- geometry

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Degrees of longitude in SAME_SPOT_KM at this latitude. Used to bucket
 * detections so the repeat search is not O(n^2) over the whole feed.
 */
function lonDegreesFor(km: number, lat: number): number {
  const scale = Math.cos(lat * (Math.PI / 180));
  if (scale < 1e-6) return 360;
  return km / (111.32 * scale);
}

// ---------------------------------------------------------------- parsing

/** Minimal CSV split that tolerates quoted fields containing commas. */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** "20261009" -> "2026-10-09" */
function isoDate(yyyymmdd: string): string | null {
  const s = yyyymmdd.trim();
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

const SOURCE_TYPES: SourceType[] = [
  "Coal",
  "Oil",
  "Gas",
  "Landfill",
  "Unclassified",
];

export function parseDetections(csv: string): Detection[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iId = col("id");
  const iDate = col("date");
  const iTime = col("time_utc");
  const iLat = col("lat");
  const iLon = col("lon");
  const iRate = col("source_rate_t/h");
  const iUnc = col("uncertainty_t/h");
  const iType = col("source_type");
  const iCountry = col("source_country");

  if (iDate < 0 || iLat < 0 || iLon < 0) {
    throw new Error(
      `Plume CSV is missing date/lat/lon. Columns found: ${header.join(", ")}`,
    );
  }

  const out: Detection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitRow(lines[i]);
    const date = isoDate(f[iDate] ?? "");
    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    if (!date || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const rawType = (f[iType] ?? "").trim();
    const sourceType = (SOURCE_TYPES as string[]).includes(rawType)
      ? (rawType as SourceType)
      : "Unclassified";

    out.push({
      id: (f[iId] ?? `${date}-${lat}-${lon}-${i}`).trim(),
      date,
      timeUTC: (f[iTime] ?? "").trim(),
      lat,
      lon,
      rate: Number(f[iRate]) || 0,
      uncertainty: Number(f[iUnc]) || 0,
      sourceType,
      country: (f[iCountry] ?? "").trim() || "Unknown",
    });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------- scoring

/**
 * Criticality blends how big the plume is with how often the spot reoffends.
 *
 * Rate carries most of the weight because it is a measured quantity; the
 * repeat term is a bounded bonus so a persistent medium leak outranks a
 * one-off medium leak without ever swamping a genuinely huge single plume.
 * Both halves are capped, so the score stays in 0-100.
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

export function severityFor(criticality: number): Severity {
  // Tuned against the live feed so a typical week reads as a handful of
  // genuinely bad events against a mostly moderate background, rather than
  // an all-red map that conveys nothing.
  if (criticality >= 75) return "severe";
  if (criticality >= 58) return "high";
  if (criticality >= 38) return "moderate";
  return "low";
}

// ---------------------------------------------------------------- feed

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Build the weekly feed: the most recent week of plumes, each annotated with
 * how many times its spot was flagged over the preceding REPEAT_WINDOW_WEEKS.
 */
export function emptyFeed(error: string, now: Date = new Date()): PlumeFeed {
  const feed = buildFeed([], now);
  return { ...feed, error };
}

export function buildFeed(
  detections: Detection[],
  now: Date = new Date(),
): PlumeFeed {
  const generatedAt = now.toISOString();
  if (detections.length === 0) {
    const today = generatedAt.slice(0, 10);
    return {
      latest: [],
      latestDate: today,
      weekStart: today,
      feedLagDays: 0,
      totalInWindow: 0,
      generatedAt,
    };
  }

  const latestDate = detections[detections.length - 1].date;
  const weekStart = addDays(latestDate, -6);
  const windowStart = addDays(latestDate, -(REPEAT_WINDOW_WEEKS * 7 - 1));

  // Everything inside the 8-week repeat window, bucketed by latitude band so
  // each lookup only scans nearby rows.
  const inWindow = detections.filter((d) => d.date >= windowStart);
  const latBandDeg = SAME_SPOT_KM / 111.32;
  const buckets = new Map<number, Detection[]>();
  for (const d of inWindow) {
    const band = Math.floor(d.lat / latBandDeg);
    for (const b of [band - 1, band, band + 1]) {
      let arr = buckets.get(b);
      if (!arr) buckets.set(b, (arr = []));
      arr.push(d);
    }
  }

  const neighbours = (d: Detection): Detection[] => {
    const candidates = buckets.get(Math.floor(d.lat / latBandDeg)) ?? [];
    const lonTol = lonDegreesFor(SAME_SPOT_KM, d.lat);
    return candidates.filter((c) => {
      let dLon = Math.abs(c.lon - d.lon);
      if (dLon > 180) dLon = 360 - dLon; // antimeridian
      if (dLon > lonTol) return false;
      return haversineKm(d.lat, d.lon, c.lat, c.lon) <= SAME_SPOT_KM;
    });
  };

  const latest: Plume[] = detections
    .filter((d) => d.date >= weekStart)
    .map((d) => {
      const near = neighbours(d);
      const repeatCount = near.length;
      const repeatDays = new Set(near.map((n) => n.date)).size;

      // Bucket this spot's detections into the 8 weeks ending at latestDate,
      // oldest first, so the card can show the cadence and not just a total.
      const weeklyHistory = new Array<number>(REPEAT_WINDOW_WEEKS).fill(0);
      for (const n of near) {
        const weeksAgo = Math.floor(daysBetween(n.date, latestDate) / 7);
        const idx = REPEAT_WINDOW_WEEKS - 1 - weeksAgo;
        if (idx >= 0 && idx < REPEAT_WINDOW_WEEKS) weeklyHistory[idx] += 1;
      }
      const criticality = scoreCriticality(d.rate, repeatCount);
      return {
        ...d,
        repeatCount,
        repeatDays,
        weeklyHistory,
        // Round to ~0.1 deg so the same physical site keeps one id across weeks.
        spotId: `${d.lat.toFixed(1)},${d.lon.toFixed(1)}`,
        criticality,
        severity: severityFor(criticality),
      };
    })
    .sort((a, b) => b.criticality - a.criticality);

  return {
    latest,
    latestDate,
    weekStart,
    feedLagDays: Math.max(0, daysBetween(latestDate, generatedAt.slice(0, 10))),
    totalInWindow: inWindow.length,
    generatedAt,
  };
}

// ---------------------------------------------------------------- hotspots

export type Hotspot = {
  id: string;
  lat: number;
  lon: number;
  country: string;
  sourceType: SourceType;
  /** Detections at this spot across the repeat window. */
  detections: number;
  /** Distinct weeks it was seen in, out of REPEAT_WINDOW_WEEKS. */
  weeksSeen: number;
  weeklyHistory: number[];
  maxRate: number;
  meanRate: number;
  firstSeen: string;
  lastSeen: string;
  /** True if it also appears in the most recent week. */
  activeThisWeek: boolean;
  severity: Severity;
  /** 0-100, persistence-weighted: this page is about chronic emitters. */
  persistence: number;
};

/**
 * Cluster every detection in the repeat window into physical spots.
 *
 * Greedy single-pass clustering: detections are taken strongest-first, and each
 * one either joins a spot within SAME_SPOT_KM or starts a new one. Strongest
 * first means a cluster is anchored on its biggest plume rather than on whichever
 * row happened to come first, which keeps centroids on the actual source.
 */
export function buildHotspots(
  detections: Detection[],
  now: Date = new Date(),
): { spots: Hotspot[]; windowStart: string; latestDate: string } {
  if (detections.length === 0) {
    const today = now.toISOString().slice(0, 10);
    return { spots: [], windowStart: today, latestDate: today };
  }

  const latestDate = detections[detections.length - 1].date;
  const windowStart = addDays(latestDate, -(REPEAT_WINDOW_WEEKS * 7 - 1));
  const weekStart = addDays(latestDate, -6);
  const inWindow = detections
    .filter((d) => d.date >= windowStart)
    .sort((a, b) => b.rate - a.rate);

  const clusters: { anchor: Detection; members: Detection[] }[] = [];
  const latBandDeg = SAME_SPOT_KM / 111.32;
  const byBand = new Map<number, number[]>(); // lat band -> cluster indices

  for (const d of inWindow) {
    const band = Math.floor(d.lat / latBandDeg);
    let found = -1;
    for (const b of [band - 1, band, band + 1]) {
      for (const ci of byBand.get(b) ?? []) {
        const a = clusters[ci].anchor;
        if (haversineKm(d.lat, d.lon, a.lat, a.lon) <= SAME_SPOT_KM) {
          found = ci;
          break;
        }
      }
      if (found >= 0) break;
    }

    if (found >= 0) {
      clusters[found].members.push(d);
    } else {
      const ci = clusters.length;
      clusters.push({ anchor: d, members: [d] });
      const b = Math.floor(d.lat / latBandDeg);
      for (const bb of [b - 1, b, b + 1]) {
        const arr = byBand.get(bb);
        if (arr) arr.push(ci);
        else byBand.set(bb, [ci]);
      }
    }
  }

  const spots: Hotspot[] = clusters.map(({ anchor, members }) => {
    const weeklyHistory = new Array<number>(REPEAT_WINDOW_WEEKS).fill(0);
    for (const m of members) {
      const idx =
        REPEAT_WINDOW_WEEKS - 1 - Math.floor(daysBetween(m.date, latestDate) / 7);
      if (idx >= 0 && idx < REPEAT_WINDOW_WEEKS) weeklyHistory[idx] += 1;
    }

    const rates = members.map((m) => m.rate);
    const dates = members.map((m) => m.date).sort();
    const weeksSeen = weeklyHistory.filter((n) => n > 0).length;
    const maxRate = Math.max(...rates);

    // Majority infrastructure type at the spot, not just the anchor's.
    const typeCounts = new Map<SourceType, number>();
    for (const m of members) {
      typeCounts.set(m.sourceType, (typeCounts.get(m.sourceType) ?? 0) + 1);
    }
    const sourceType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Persistence-weighted: weeks seen leads, magnitude modulates. The map
    // ranks by criticality; this page is explicitly about chronic emitters.
    const persistence = Math.round(
      Math.min(1, weeksSeen / REPEAT_WINDOW_WEEKS) * 65 +
        Math.min(1, Math.log10(1 + maxRate) / Math.log10(1 + 200)) * 35,
    );

    return {
      id: `${anchor.lat.toFixed(2)},${anchor.lon.toFixed(2)}`,
      lat: anchor.lat,
      lon: anchor.lon,
      country: anchor.country,
      sourceType,
      detections: members.length,
      weeksSeen,
      weeklyHistory,
      maxRate,
      meanRate: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length),
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      activeThisWeek: dates[dates.length - 1] >= weekStart,
      severity: severityFor(scoreCriticality(maxRate, members.length)),
      persistence,
    };
  });

  spots.sort(
    (a, b) => b.persistence - a.persistence || b.detections - a.detections,
  );
  return { spots, windowStart, latestDate };
}
