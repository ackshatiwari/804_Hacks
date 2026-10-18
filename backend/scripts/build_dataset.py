"""
Build a plume / no-plume methane patch dataset from Sentinel-5P.

Labels: SRON plume detections via CAMS (CC-BY 4.0, cite Schuit et al. 2023).
Imagery: Google Earth Engine COPERNICUS/S5P/OFFL/L3_CH4.

Output (backend/data/methane/):
    {train,val,test}/{plume,no_plume}/<id>.npy  float32 (2, H, W):
        [0] CH4 enhancement in ppb (value - patch median), NaN -> 0
        [1] valid-pixel mask
    .../<id>.png   heatmap preview
    metadata.csv

Setup:  pip install earthengine-api pandas numpy matplotlib requests tqdm
Usage:  python backend/scripts/build_dataset.py --project <gcp-project-id> [--limit 50]
"""

import argparse
import io
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import ee
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests
from tqdm import tqdm

PLUMES_CSV_URL = "https://sites.ecmwf.int/data/cams/products/methane_emissions/data/data.csv"
COLLECTION = "COPERNICUS/S5P/OFFL/L3_CH4"
BAND = "CH4_column_volume_mixing_ratio_dry_air_bias_corrected"
NODATA = -9999.0
SPLIT_QUANTILES = (0.70, 0.85)  # train ends / val ends, by date


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--project", required=True, help="Google Cloud project registered for Earth Engine")
    p.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "methane")
    p.add_argument("--csv", type=Path, help="Local plume CSV instead of downloading")
    p.add_argument("--start", help="Only plumes on/after this date (YYYY-MM-DD)")
    p.add_argument("--limit", type=int, help="Use at most this many plumes (quick test)")
    p.add_argument("--patch", type=int, default=32, help="Patch size in pixels")
    p.add_argument("--pixel-deg", type=float, default=0.07, help="Pixel size in degrees (~7 km)")
    p.add_argument("--neg-per-pos", type=int, default=3, help="No-plume patches per plume patch")
    p.add_argument("--neg-min-dist-km", type=float, default=150.0, help="Min distance from any detection")
    p.add_argument("--min-valid", type=float, default=0.5, help="Min fraction of valid pixels to keep")
    p.add_argument("--workers", type=int, default=8, help="Parallel Earth Engine requests")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_plumes(args):
    src = args.csv or io.StringIO(requests.get(PLUMES_CSV_URL, timeout=60).text)
    df = pd.read_csv(src)
    df.columns = df.columns.str.lower().str.strip()
    missing = {"date", "lat", "lon"} - set(df.columns)
    if missing:
        raise SystemExit(f"Plume CSV missing {missing}. Columns: {list(df.columns)}")

    df = pd.DataFrame({
        "date": pd.to_datetime(df["date"].astype(str), format="%Y%m%d", errors="coerce"),
        "lat": pd.to_numeric(df["lat"], errors="coerce"),
        "lon": pd.to_numeric(df["lon"], errors="coerce"),
    }).dropna()
    if args.start:
        df = df[df["date"] >= pd.Timestamp(args.start)]
    if args.limit:
        df = df.sample(n=min(args.limit, len(df)), random_state=args.seed)
    return df.sort_values("date").reset_index(drop=True)


def near_detection(plumes, lat, lon, date, days, km):
    """True if any detection lies within `km` of (lat, lon) within +/- `days` of `date`."""
    w = plumes[(plumes["date"] - date).abs() <= pd.Timedelta(days=days)]
    if w.empty:
        return False
    lat1, lon1, lat2, lon2 = map(np.radians, (lat, lon, w["lat"].values, w["lon"].values))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return bool((2 * 6371 * np.arcsin(np.sqrt(a)) < km).any())


def fetch_patch(lat, lon, date, args):
    """Raw CH4 patch in ppb (NaN where missing), or None if no data that day."""
    day = ee.Date(date.strftime("%Y-%m-%d"))
    image = (ee.ImageCollection(COLLECTION).filterDate(day, day.advance(1, "day"))
             .select(BAND).mosaic().unmask(NODATA))
    half = args.patch * args.pixel_deg / 2
    request = {
        "expression": image,
        "fileFormat": "NUMPY_NDARRAY",
        "grid": {
            "dimensions": {"width": args.patch, "height": args.patch},
            "affineTransform": {"scaleX": args.pixel_deg, "shearX": 0, "translateX": lon - half,
                                "shearY": 0, "scaleY": -args.pixel_deg, "translateY": lat + half},
            "crsCode": "EPSG:4326",
        },
    }
    for attempt in range(4):
        try:
            raw = np.asarray(ee.data.computePixels(request)[BAND], dtype=np.float32)
            raw[raw <= NODATA + 1] = np.nan
            return raw
        except Exception as e:  # timeouts and network errors are retried
            transient = any(s in str(e).lower() for s in ("too many", "quota", "deadline", "timed out", "unavailable"))
            if isinstance(e, ee.EEException) and not transient:
                return None  # e.g. no overpass that day
            time.sleep(2 ** attempt)
    return None


def process(s, args):
    """Fetch and save one sample; returns it with valid_frac, or None if rejected."""
    path = args.out / s["split"] / s["label"] / f"{s['id']}.npy"
    if path.exists():  # resume; a file cut off by Ctrl+C is re-fetched
        try:
            return {**s, "valid_frac": round(float(np.load(path)[1].mean()), 3)}
        except Exception:
            path.unlink()

    raw = fetch_patch(s["lat"], s["lon"], pd.Timestamp(s["date"]), args)
    if raw is None:
        return None
    valid = ~np.isnan(raw)
    if valid.mean() < args.min_valid:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    enhancement = np.where(valid, raw - np.nanmedian(raw), 0.0)
    np.save(path, np.stack([enhancement, valid]).astype(np.float32))

    fig, ax = plt.subplots(figsize=(2, 2), dpi=64)
    ax.imshow(raw, cmap="inferno", vmin=np.nanpercentile(raw, 2), vmax=np.nanpercentile(raw, 98))
    ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    fig.savefig(path.with_suffix(".png"))
    plt.close(fig)
    return {**s, "valid_frac": round(float(valid.mean()), 3)}


def sample(kind, label, lat, lon, date, cuts, idx):
    split = "train" if date <= cuts[0] else "val" if date <= cuts[1] else "test"
    return {"id": f"{kind}_{date:%Y%m%d}_{lat:+.2f}_{lon:+.2f}_{idx}", "label": label, "kind": kind,
            "split": split, "date": date.strftime("%Y-%m-%d"), "lat": round(lat, 4), "lon": round(lon, 4)}


def negative_candidate(kind, plumes, rng, args, cuts, idx):
    """random: random place on a plume date. same_spot: a plume location on a no-detection day."""
    first, last = plumes["date"].min(), plumes["date"].max()
    for _ in range(100):
        if kind == "random":
            date = plumes["date"].iloc[rng.integers(len(plumes))]
            lat, lon, days = float(rng.uniform(-56, 70)), float(rng.uniform(-178, 178)), 7
        else:
            p = plumes.iloc[rng.integers(len(plumes))]
            date = p["date"] + pd.Timedelta(days=int(rng.integers(7, 57)) * rng.choice([-1, 1]))
            lat, lon, days = p["lat"], p["lon"], 1
            if not first <= date <= last:
                continue
        if not near_detection(plumes, lat, lon, date, days, args.neg_min_dist_km):
            return sample(kind, "no_plume", lat, lon, date, cuts, idx)
    return None


def collect_negatives(kind, quota, plumes, rng, args, cuts, pool, idx):
    """Generate candidates in batches until `quota` valid patches are saved."""
    kept = []
    with tqdm(total=quota, desc=f"no_plume ({kind})", unit="patch") as bar:
        for _ in range(10):
            need = quota - len(kept)
            if need <= 0:
                break
            batch = [c for i in range(need * 2)
                     if (c := negative_candidate(kind, plumes, rng, args, cuts, idx + i))]
            idx += need * 2
            for f in as_completed([pool.submit(process, s, args) for s in batch]):
                r = f.result()
                if r and len(kept) < quota:
                    kept.append(r)
                    bar.update(1)
    return kept, idx


def main():
    args = parse_args()
    rng = np.random.default_rng(args.seed)
    ee.Initialize(project=args.project)
    ee.data.setDeadline(60_000)  # ms; a hung request fails instead of blocking forever

    plumes = load_plumes(args)
    if plumes.empty:
        raise SystemExit("No plumes to process.")
    cuts = [plumes["date"].quantile(q) for q in SPLIT_QUANTILES]
    print(f"{len(plumes)} plumes, {plumes['date'].min():%Y-%m-%d} to {plumes['date'].max():%Y-%m-%d}")
    print(f"Split: train <= {cuts[0]:%Y-%m-%d} < val <= {cuts[1]:%Y-%m-%d} < test")

    positives = [sample("plume", "plume", r.lat, r.lon, r.date, cuts, i)
                 for i, r in enumerate(plumes.itertuples())]

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(process, s, args) for s in positives]
        results = [f.result() for f in tqdm(as_completed(futures), total=len(futures), desc="plume", unit="patch")]
        kept = [r for r in results if r]
        print(f"Kept {len(kept)}/{len(positives)} plume patches (rest: no data or too few valid pixels)")

        n_neg = len(kept) * args.neg_per_pos
        neg_random, idx = collect_negatives("random", n_neg // 2, plumes, rng, args, cuts, pool, 0)
        neg_spot, _ = collect_negatives("same_spot", n_neg - n_neg // 2, plumes, rng, args, cuts, pool, idx)

    meta = pd.DataFrame(kept + neg_random + neg_spot)
    meta["path"] = meta["split"] + "/" + meta["label"] + "/" + meta["id"] + ".npy"
    args.out.mkdir(parents=True, exist_ok=True)
    meta.to_csv(args.out / "metadata.csv", index=False)
    print(meta.groupby(["split", "label"]).size().unstack(fill_value=0))
    print(f"Saved to {args.out}")


if __name__ == "__main__":
    main()
