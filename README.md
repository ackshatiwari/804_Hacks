# Methane Watch — frontend handoff

**Live:** https://methane-watch-murex.vercel.app
**Repo:** `ackshatiwari/804_Hacks` · branch `feat/weekly-hotspot-map` · PR #1
**Scope:** frontend only. `backend/` is byte-identical to `main` — untouched.

> Satellites see methane plumes every week. This map shows where they are and
> which ones keep coming back.

Two caveats are stated on every page: **the feed runs about a week behind**, and
**locations are approximate (~7 km)**.

---

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

No API keys. No backend required. Everything is derived from the public
CAMS/SRON detection list — the same dataset `build_dataset.py` uses.

---

## Pages

| Route | What it is |
|---|---|
| `/` | Scrolling overview. Pinned 3D globe that flies between this week's worst regions. |
| `/map` | Live dashboard — map, plume detail cards, filters, AI panel. |
| `/hotspots` | Every spot in the 8-week window, clustered and ranked by persistence. |
| `/method` | How a detection becomes a map pin, the scoring, the model's scores, the limits. |

Plus `GET /api/plumes` (the weekly feed as JSON) and `POST /api/ai`.

---

## Connecting FastAPI — the only file you need

All data access goes through **`frontend/lib/datasource.ts`**. No page or
component fetches anything directly, so switching to the API requires **no
changes to any view**.

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

With that set, the frontend calls:

| Endpoint | Returns |
|---|---|
| `GET {base}/plumes/latest` | `PlumeFeed` — the latest week of plumes |
| `GET {base}/hotspots` | `{ spots, windowStart, latestDate }` |
| `GET {base}/model/metrics` | `{ precision, recall, f1, roc_auc?, threshold?, n_test? }` |

Unset, every read falls back to the detection CSV. Each result carries
`provenance: "api" | "dataset"` saying which path produced it.

### Types the API should match

```ts
type Plume = {
  id: string;
  date: string;          // ISO, YYYY-MM-DD
  timeUTC: string;
  lat: number; lon: number;
  rate: number;          // tonnes/hour
  uncertainty: number;
  sourceType: "Coal" | "Oil" | "Gas" | "Landfill" | "Unclassified";
  country: string;
  repeatCount: number;   // detections within 15km over 8 weeks
  repeatDays: number;
  weeklyHistory: number[];  // length 8, oldest first
  spotId: string;
  severity: "low" | "moderate" | "high" | "severe";
  criticality: number;   // 0-100
};

type PlumeFeed = {
  latest: Plume[];
  latestDate: string;
  weekStart: string;
  feedLagDays: number;
  totalInWindow: number;
  generatedAt: string;
  error?: string;
};
```

---

## Scoring — the swap point

**`frontend/lib/scoring.ts`** isolates both scores. To use model predictions,
change `scoreCriticality` to read the API's score. Nothing else moves.

- **Criticality** (0–100) ranks the map. Emission rate leads because it is
  measured; repeat count adds a **capped** bonus — so a chronic medium leak can
  outrank a one-off of the same size, but a genuinely huge single plume is never
  buried by persistence.
- **Persistence** (0–100) ranks hotspots and reverses that emphasis: weeks seen
  leads, peak rate modulates.

Both are computed from fields already in the dataset. **The UI says so
explicitly on three pages — neither is presented as a model prediction.**

---

## Model

Metrics published by the backend, rendered on `/method`:

| | |
|---|---|
| Precision | **0.886** |
| Recall | **0.855** |
| F1 | **0.870** |
| ROC-AUC | 0.944 |
| Test set | 646 held-out patches, threshold 0.54 |

These came from `backend/models/metrics.json` and were copied verbatim to
`frontend/public/model-metrics.json`. `getModelMetrics()` prefers the live API
and only falls back to that snapshot — **delete the file once
`GET /model/metrics` is up.**

`/method` shows "scores pending" when no metrics exist rather than a stand-in.

---

## How the data works

**Source:** SRON plume detections via the
[CAMS Methane Hotspot Explorer](https://sites.ecmwf.int/data/cams/products/methane_emissions/)
(CC-BY 4.0, Schuit et al. 2023). ~5,200 detections since July 2024, ~50–75 per week.

**Repeat spots:** detections within **15 km** count as the same place, across an
**8-week** window. Lookups bucket by latitude band rather than scanning the whole
feed — verified identical to a brute-force O(n²) recount, 0/72 mismatches on live data.

**Hotspots:** all in-window detections greedily cluster into physical spots,
strongest-first so each cluster anchors on its biggest plume. Verified: 458
detections partition exactly across 352 spots, no two anchors within 15 km, 6 ms.

---

## The 3D landing page

- **Globe geometry is real.** Coastlines baked from `world-atlas land-110m` into
  `public/coastlines.json` (119 rings, 2,959 points, 32 KB). `lib/earthTexture.ts`
  *fills* those rings onto a canvas at runtime for coloured continents, and the
  sphere's vertices are displaced into terrain from a land mask + noise.
- **Plumes are modelled beads** at their true coordinates, sized by emission
  rate, casting real shadows onto the globe.
- **Scroll drives everything** — camera aim and distance, bead scale-in,
  atmosphere, copy cross-fades. Chapters are built from the live feed
  (`lib/chapters.ts`), so the story changes when the data does.
- **`prefers-reduced-motion` stops all motion.**

> ⚠️ The globe's **terrain is procedural relief, not elevation data**. Plume
> positions on it are real; the mountains are not. This is disclosed on `/method`.

---

## AI analyst — built, currently offline

Four grounded surfaces: **weekly brief**, **explain this plume**, **ask anything**,
**hotspot dossiers**. Groq (`llama-3.3-70b-versatile`).

**It needs `GROQ_API_KEY` and none is set**, so every surface currently renders
"the analyst is offline". Everything else on the page is live data and unaffected.

Security note: the feed is read **server-side** and real rows go into the prompt.
The client can only send a mode, a plume id and a question — never figures — so a
crafted request cannot make the page assert something absent from the data. The
prompts forbid inventing plumes, naming companies, or contradicting the two caveats.

---

## File map

```
frontend/
  app/
    page.tsx              overview (3D scroll stage)
    map/page.tsx          dashboard
    hotspots/page.tsx     repeat offenders
    method/page.tsx       method, model scores, limits
    api/plumes/route.ts   weekly feed as JSON
    api/ai/route.ts       AI analyst
    globals.css           design tokens (dark + [data-skin="light"])
  lib/
    datasource.ts         ← THE ONLY DATA BOUNDARY
    scoring.ts            ← criticality + persistence (model swap point)
    plumes.ts             parsing, clustering, repeat spots, hotspots
    chapters.ts           flythrough stops, built from live data
    earthTexture.ts       globe texture + terrain noise
    format.ts             dates, coordinates, severity colours
    ai.ts                 Groq prompts (grounded)
  components/
    ScrollStage, CinematicGlobe, ClayFigures      landing 3D
    Dashboard, PlumeMap, PlumeRow, PlumeCard      map
    HotspotsTable, HotspotDossier, HistoryStrip   hotspots
    WeeklyBrief, AskPanel, AiProse, useAi         AI
    SiteNav, Reveal
    landing/              ← Akshat's original components, preserved untouched
  public/
    coastlines.json       baked geometry
    model-metrics.json    backend snapshot (delete once API is live)
```

**Dependencies added:** `leaflet`, `react-leaflet`, `three`.

---

## Open items

1. **`GROQ_API_KEY` not set** — AI surfaces are placeholders. Free key at
   console.groq.com/keys, then `vercel env add GROQ_API_KEY production`.
2. **Two landing pages exist.** Akshat's original nine components are preserved
   untouched in `components/landing/`; the live one is the new 3D page. Needs a
   decision on which survives.
3. **Deploy is CLI-based, not git-connected** — merging the PR will *not* update
   the site. Redeploy with `vercel deploy --cwd frontend --prod`, or connect the
   repo in the Vercel dashboard so merges ship automatically.
4. **`backend/requirements.txt` is UTF-16 encoded**, so `pip install -r` cannot
   parse it. Left alone deliberately — it's a backend file.

---

## Credits

Plume detections: SRON via CAMS (CC-BY 4.0, Schuit et al. 2023).
Imagery: Copernicus Sentinel-5P / TROPOMI.
Basemap: Esri, HERE, Garmin, OpenStreetMap contributors.
Coastlines: Natural Earth via `world-atlas`.
