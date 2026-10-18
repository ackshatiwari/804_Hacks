# Methane Watch — frontend

A weekly map of large methane plumes seen from orbit, and which spots keep
coming back.

> Satellites see methane plumes every week; our map shows where they are and
> which ones keep coming back.

Two caveats are stated in the pitch and on every page: **the data runs about a
week behind**, and **locations are approximate (roughly 7 km)**.

## Run it

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

No API keys and no backend are required. The frontend derives everything from
the public CAMS/SRON detection list — the same dataset `build_dataset.py` uses.

## Pages

| Route | What it is |
|---|---|
| `/` | Scrolling overview: the pitch, live counts, why plumes are drawn as squares |
| `/map` | Live dashboard — map, plume detail cards, filters |
| `/hotspots` | Every spot in the 8-week window, clustered and ranked by persistence |
| `/method` | How a detection becomes a map pin, the scoring, and the limits |

## Connecting the FastAPI backend

All data access goes through one module, `lib/datasource.ts`. No page or
component fetches anything directly, so switching to the API needs no changes
to any view:

```bash
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

With that set, the frontend calls:

| Endpoint | Returns |
|---|---|
| `GET {base}/plumes/latest` | `PlumeFeed` — the latest week of plumes |
| `GET {base}/hotspots` | `{ spots, windowStart, latestDate }` |
| `GET {base}/model/metrics` | `{ precision, recall, f1, roc_auc?, threshold?, n_test? }` |

Unset, every read falls back to the detection CSV. `provenance` on each result
says which path produced the data.

`/method` renders model metrics only when `GET /model/metrics` returns them. If
the backend has none it says scores are pending — it never shows a stand-in.

## Scoring

`lib/scoring.ts` is the swap point for model predictions. Both scores are
computed from fields already in the detection dataset, and the UI labels them
as such wherever they appear — **neither is a model prediction**.

- **Criticality** (0–100) ranks the map. Emission rate leads because it is
  measured; repeat count adds a capped bonus.
- **Persistence** (0–100) ranks hotspots and reverses that emphasis: weeks seen
  leads, peak rate modulates.

To use real predictions, change `scoreCriticality` to read the score the API
returns. Nothing else moves — views only ever see the number and the band.

## Why squares, not pins

A TROPOMI pixel is about 7 km across, so a pin would claim a precision the
instrument does not have. Each plume draws as its true footprint and converges
on real ground scale as you zoom in. Repeat offenders wear one extra ring per
week they were seen.

## Layout

```
frontend/
  app/
    page.tsx              overview
    map/page.tsx          dashboard
    hotspots/page.tsx     repeat offenders
    method/page.tsx       method and limits
    api/plumes/route.ts   the weekly feed as JSON
    api/ai/route.ts       optional AI analyst
    globals.css           design tokens
  components/             views
  lib/
    datasource.ts         the only data-access boundary
    plumes.ts             parsing, clustering, repeat spots
    scoring.ts            criticality and persistence
    format.ts             dates, coordinates, severity colours
```

## Data

Plume detections: SRON via the
[CAMS Methane Hotspot Explorer](https://sites.ecmwf.int/data/cams/products/methane_emissions/)
(CC-BY 4.0, Schuit et al. 2023). Imagery: Copernicus Sentinel-5P / TROPOMI.
Basemap: Esri, HERE, Garmin, OpenStreetMap contributors.
