"""
Build a plume / no-plume methane patch dataset from Sentinel-5P (TROPOMI).

Labels come from the SRON plume detections published through the CAMS
Methane Hotspot Explorer (CC-BY 4.0, cite Schuit et al. 2023). Imagery comes
from Google Earth Engine's COPERNICUS/S5P/OFFL/L3_CH4 collection.

Pipeline
    1. Download the cumulative plume CSV (all detections since 2024-05-01).
    2. Plume patches: one PATCH x PATCH window centred on each detection,
       on the day it was observed.
    3. No-plume patches (NEG_PER_POS per plume, split evenly between):
         - random:    random location on a plume date, far from any detection
         - same_spot: a known plume location on a day with no detection there
    4. Drop patches with too many missing pixels (clouds / no retrieval).
    5. Split train / val / test by date (70 / 15 / 15), not at random, so
       recent weeks are never seen during training.

Output (under backend/data/methane/ by default)
    {train,val,test}/{plume,no_plume}/<id>.npy   float32, shape (2, H, W)
        channel 0: CH4 enhancement in ppb (value - patch median), NaN -> 0
        channel 1: valid-pixel mask (1 = retrieval present)
    {train,val,test}/{plume,no_plume}/<id>.png   heatmap preview
    metadata.csv                                 one row per kept sample

Setup
    pip install earthengine-api pandas numpy matplotlib requests
    earthengine authenticate

Usage
    python backend/scripts/build_dataset.py --project <your-gcp-project-id>
    python backend/scripts/build_dataset.py --project <id> --limit 50   # quick test
"""

import argparse
import io
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

import ee
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests

PLUMES_CSV_URL = "https://sites.ecmwf.int/data/cams/products/methane_emissions/data/data.csv"
COLLECTION = "COPERNICUS/S5P/OFFL/L3_CH4"
BAND = "CH4_column_volume_mixing_ratio_dry_air_bias_corrected"
NODATA = -9999.0
EARTH_RADIUS_KM = 6371.0

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--project", required=True, help="Google Cloud project registered for Earth Engine")
    p.add_argument("--out", type=Path, default=BACKEND_ROOT / "data" / "methane")
    p.add_argument("--csv", type=Path, help="Use a local plume CSV instead of downloading it")
    p.add_argument("--patch", type=int, default=32, help="Patch size in pixels")
    p.add_argument("--pixel-deg", type=float, default=0.07, help="Pixel size in degrees (~7 km, TROPOMI native)")
    p.add_argument("--neg-per-pos", type=int, default=3, help="No-plume patches per plume patch")
    p.add_argument("--neg-min-dist-km", type=float, default=150.0,
                   help="No detection may lie this close to a no-plume patch centre (patch is ~224 km wide)")
    p.add_argument("--min-valid", type=float, default=0.5, help="Minimum fraction of valid pixels to keep a patch")
    p.add_argument("--split", type=float, nargs=2, default=[0.70, 0.85],
                   help="Date quantiles where train ends and val ends")
    p.add_argument("--start", help="Only use plumes on/after this date (YYYY-MM-DD)")
    p.add_argument("--end", help="Only use plumes on/before this date (YYYY-MM-DD)")
    p.add_argument("--limit", type=int, help="Use at most this many plumes (for a quick test run)")
    p.add_argument("--workers", type=int, default=8, help="Parallel Earth Engine requests")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


# ---------------------------------------------------------------- labels

def load_plumes(args):
    if args.csv:
        df = pd.read_csv(args.csv)
    else:
        print(f"Downloading plume list from {PLUMES_CSV_URL}")
        resp = requests.get(PLUMES_CSV_URL, timeout=60)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))

    # Column names per the CAMS docs (date, lat, lon); match case-insensitively
    # in case the file header differs slightly.
    cols = {c.lower().strip(): c for c in df.columns}
    for needed in ("date", "lat", "lon"):
        if needed not in cols:
            raise SystemExit(f"Plume CSV has no '{needed}' column. Columns found: {list(df.columns)}")

    out = pd.DataFrame({
        "date": pd.to_datetime(df[cols["date"]].astype(str), format="%Y%m%d", errors="coerce"),
        "lat": pd.to_numeric(df[cols["lat"]], errors="coerce"),
        "lon": pd.to_numeric(df[cols["lon"]], errors="coerce"),
    })
    for extra in ("source_rate_t/h", "source_type", "source_country"):
        if extra in cols:
            out[extra] = df[cols[extra]]

    out = out.dropna(subset=["date", "lat", "lon"])
    if args.start:
        out = out[out["date"] >= pd.Timestamp(args.start)]
    if args.end:
        out = out[out["date"] <= pd.Timestamp(args.end)]
    out = out.sort_values("date").reset_index(drop=True)
    if args.limit:
        out = out.sample(n=min(args.limit, len(out)), random_state=args.seed).sort_values("date").reset_index(drop=True)

    print(f"{len(out)} plume detections from {out['date'].min():%Y-%m-%d} to {out['date'].max():%Y-%m-%d}")
    return out


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def near_detection(plumes, lat, lon, date, days, km):
    """True if any detection lies within `km` of (lat, lon) within +/- `days` of `date`."""
    window = plumes[(plumes["date"] - date).abs() <= pd.Timedelta(days=days)]
    if window.empty:
        return False
    return bool((haversine_km(lat, lon, window["lat"].values, window["lon"].values) < km).any())


# ---------------------------------------------------------------- imagery

def fetch_patch(lat, lon, date, args, retries=4):
    """Return the raw CH4 patch (ppb, NaN where missing), or None if there is no data that day."""
    day = ee.Date(date.strftime("%Y-%m-%d"))
    image = (ee.ImageCollection(COLLECTION)
             .filterDate(day, day.advance(1, "day"))
             .select(BAND)
             .mosaic()
             .unmask(NODATA))
    half = args.patch * args.pixel_deg / 2
    request = {
        "expression": image,
        "fileFormat": "NUMPY_NDARRAY",
        "grid": {
            "dimensions": {"width": args.patch, "height": args.patch},
            "affineTransform": {
                "scaleX": args.pixel_deg, "shearX": 0, "translateX": lon - half,
                "shearY": 0, "scaleY": -args.pixel_deg, "translateY": lat + half,
            },
            "crsCode": "EPSG:4326",
        },
    }
    for attempt in range(retries):
        try:
            arr = ee.data.computePixels(request)
            break
        except ee.EEException as e:
            msg = str(e).lower()
            transient = any(s in msg for s in ("too many requests", "quota", "deadline", "timed out", "unavailable"))
            if not transient or attempt == retries - 1:
                return None  # e.g. no overpass that day -> mosaic has no bands
            time.sleep(2 ** attempt)
        except requests.exceptions.RequestException:
            if attempt == retries - 1:
                return None
            time.sleep(2 ** attempt)

    raw = np.asarray(arr[BAND], dtype=np.float32)
    raw[raw <= NODATA + 1] = np.nan
    return raw


def to_channels(raw):
    valid = ~np.isnan(raw)
    enhancement = np.where(valid, raw - np.nanmedian(raw), 0.0)
    return np.stack([enhancement, valid.astype(np.float32)]).astype(np.float32)


def save_preview(raw, path):
    fig, ax = plt.subplots(figsize=(2, 2), dpi=64)
    vmin, vmax = np.nanpercentile(raw, [2, 98])
    ax.imshow(raw, cmap="inferno", vmin=vmin, vmax=vmax, interpolation="nearest")
    ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    fig.savefig(path)
    plt.close(fig)


# ---------------------------------------------------------------- samples

def split_for(date, cuts):
    if date <= cuts[0]:
        return "train"
    if date <= cuts[1]:
        return "val"
    return "test"


def make_sample(kind, label, lat, lon, date, cuts, idx, extra=None):
    split = split_for(date, cuts)
    sample_id = f"{kind}_{date:%Y%m%d}_{lat:+.2f}_{lon:+.2f}_{idx}"
    s = {"id": sample_id, "label": label, "kind": kind, "split": split,
         "date": date.strftime("%Y-%m-%d"), "lat": round(lat, 4), "lon": round(lon, 4)}
    if extra:
        s.update(extra)
    return s


def process(sample, args):
    """Fetch + save one sample. Returns the sample with valid_frac set, or None if rejected."""
    folder = args.out / sample["split"] / sample["label"]
    npy_path = folder / f"{sample['id']}.npy"

    if npy_path.exists():  # resume
        valid_frac = float(np.load(npy_path)[1].mean())
        return {**sample, "valid_frac": round(valid_frac, 3), "path": npy_path.relative_to(args.out).as_posix()}

    raw = fetch_patch(sample["lat"], sample["lon"], pd.Timestamp(sample["date"]), args)
    if raw is None:
        return None
    valid_frac = float((~np.isnan(raw)).mean())
    if valid_frac < args.min_valid:
        return None

    folder.mkdir(parents=True, exist_ok=True)
    np.save(npy_path, to_channels(raw))
    save_preview(raw, npy_path.with_suffix(".png"))
    return {**sample, "valid_frac": round(valid_frac, 3), "path": npy_path.relative_to(args.out).as_posix()}


def run_batch(samples, args, pool):
    return [r for r in pool.map(lambda s: process(s, args), samples) if r is not None]


def random_negative(plumes, dates, rng, args, cuts, idx):
    for _ in range(100):
        date = dates[rng.integers(len(dates))]
        lat = float(rng.uniform(-56, 70))
        lon = float(rng.uniform(-178, 178))
        if not near_detection(plumes, lat, lon, date, days=7, km=args.neg_min_dist_km):
            return make_sample("random", "no_plume", lat, lon, date, cuts, idx)
    return None


def same_spot_negative(plumes, rng, args, cuts, idx, first, last):
    for _ in range(100):
        p = plumes.iloc[rng.integers(len(plumes))]
        offset = int(rng.integers(7, 57)) * (1 if rng.random() < 0.5 else -1)
        date = p["date"] + timedelta(days=offset)
        if not (first <= date <= last):
            continue
        if not near_detection(plumes, p["lat"], p["lon"], date, days=1, km=args.neg_min_dist_km):
            return make_sample("same_spot", "no_plume", p["lat"], p["lon"], date, cuts, idx)
    return None


def collect_negatives(kind, quota, plumes, rng, args, cuts, pool, start_idx):
    """Keep generating candidates until `quota` valid patches are saved (or we give up)."""
    dates = plumes["date"].tolist()
    first, last = plumes["date"].min(), plumes["date"].max()
    kept, idx, rounds = [], start_idx, 0
    while len(kept) < quota and rounds < 10:
        need = quota - len(kept)
        batch = []
        for _ in range(need * 2):
            if kind == "random":
                s = random_negative(plumes, dates, rng, args, cuts, idx)
            else:
                s = same_spot_negative(plumes, rng, args, cuts, idx, first, last)
            idx += 1
            if s:
                batch.append(s)
        kept.extend(run_batch(batch, args, pool)[:need])
        rounds += 1
        print(f"  {kind}: {len(kept)}/{quota}")
    return kept, idx


# ---------------------------------------------------------------- main

def main():
    args = parse_args()
    rng = np.random.default_rng(args.seed)

    ee.Initialize(project=args.project)
    plumes = load_plumes(args)
    if plumes.empty:
        raise SystemExit("No plumes to process.")

    cuts = [plumes["date"].quantile(q) for q in args.split]
    print(f"Split by date: train <= {cuts[0]:%Y-%m-%d} < val <= {cuts[1]:%Y-%m-%d} < test")

    extra_cols = [c for c in plumes.columns if c not in ("date", "lat", "lon")]
    positives = [
        make_sample("plume", "plume", r["lat"], r["lon"], r["date"], cuts, i, {c: r[c] for c in extra_cols})
        for i, r in plumes.iterrows()
    ]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        print(f"Fetching {len(positives)} plume patches...")
        kept_pos = run_batch(positives, args, pool)
        print(f"  kept {len(kept_pos)} (rest had no data or < {args.min_valid:.0%} valid pixels)")

        n_neg = len(kept_pos) * args.neg_per_pos
        n_random = n_neg // 2
        print(f"Fetching {n_neg} no-plume patches...")
        neg_random, idx = collect_negatives("random", n_random, plumes, rng, args, cuts, pool, 0)
        neg_spot, _ = collect_negatives("same_spot", n_neg - n_random, plumes, rng, args, cuts, pool, idx)

    meta = pd.DataFrame(kept_pos + neg_random + neg_spot)
    args.out.mkdir(parents=True, exist_ok=True)
    meta.to_csv(args.out / "metadata.csv", index=False)

    print("\nDone. Samples per split:")
    print(meta.groupby(["split", "label"]).size().unstack(fill_value=0))
    print(f"\nMetadata: {args.out / 'metadata.csv'}")


if __name__ == "__main__":
    main()
