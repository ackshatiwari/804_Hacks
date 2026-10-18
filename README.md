# Methane Watch

A weekly map of large methane plumes seen from orbit, and which spots keep
coming back.

> Satellites see methane plumes every week; our map shows where they are and
> which ones keep coming back.

Two caveats we state up front, in the pitch and on the page: **the data runs
about a week behind**, and **locations are approximate (roughly 7 km)**.

## The three parts

**1. Model** — `backend/scripts/train.py` trains a small CNN on Sentinel-5P
(TROPOMI) methane patches, using SRON's detections as plume / no-plume labels,
and reports precision, recall and F1 on weeks it never saw.

**2. Map** — the latest week's plumes. Clicking one opens a card with location,
date observed, emission rate, and the infrastructure type nearby.

**3. Repeat spots** — for each plume, how many times that spot was flagged in
the last 8 weeks ("Seen 4 times in 8 weeks"). Anything within ~15 km counts as
the same spot.

## Why a plume is drawn as a square, not a pin

A TROPOMI pixel is about 7 km across, so a map pin would claim a precision the
instrument does not have. Each plume is drawn as its true footprint instead —
zoom in and the cell converges on its real ground size. Repeat offenders wear
one extra ring per week they were seen.

## Data

Plume detections come from the SRON list published through the
[CAMS Methane Hotspot Explorer](https://sites.ecmwf.int/data/cams/products/methane_emissions/)
(CC-BY 4.0, cite Schuit et al. 2023). Imagery for the model comes from Google
Earth Engine's `COPERNICUS/S5P/OFFL/L3_CH4`.

The map reads the detection list directly, so it runs with no API keys and no
backend. Earth Engine is only needed to train the model.

## Running it

**Map** (no credentials needed):

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

`GET /api/plumes` returns the same weekly feed as JSON.

**Model** (needs an Earth Engine-registered GCP project):

```bash
cd backend
pip install -r requirements.txt
earthengine authenticate
python scripts/build_dataset.py --project <your-gcp-project-id>
python scripts/train.py
```

`build_dataset.py --limit 50` builds a small set first if you want to check the
pipeline before committing to a full download.

## Notes on the numbers

- Splits are **by date**, not at random, so the test set is always weeks the
  model never saw.
- The decision threshold is chosen on validation, never on test.
- The set is imbalanced (3 negatives per plume by default), so we report
  precision / recall / F1 rather than accuracy — always answering "no plume"
  scores 75% accuracy and an F1 of zero.
- **Criticality** (0-100) blends emission rate with how persistent the spot is.
  Rate carries most of the weight because it is measured; the repeat term is a
  capped bonus, so a chronic medium leak can outrank a one-off of the same size
  without ever burying a genuinely huge single plume.
