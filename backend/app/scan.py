"""
Global plume scan: fetch a day of Sentinel-5P CH4, slide the CNN over it, store detections.

Per day:
  1. Fetch the global L3 CH4 mosaic on the training grid (0.07 deg pixels) as 1024 px tiles.
  2. Score every 32x32 window (stride 16) with >= 50% valid pixels.
  3. For each positive window, find the methane peak, re-centre a patch on it and score again,
     so the stored image and confidence are exactly what the model saw, centred like in training.
  4. Merge detections of the same plume (within MERGE_KM), save PNG previews and rows.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date as Date, timedelta

import ee
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.ndimage import uniform_filter

from . import store

COLLECTION = "COPERNICUS/S5P/OFFL/L3_CH4"
BAND = "CH4_column_volume_mixing_ratio_dry_air_bias_corrected"
NODATA = -9999.0
PIXEL_DEG = 0.07
LAT_TOP, LAT_BOTTOM = 72.0, -56.0  # TROPOMI CH4 retrievals are sparse outside this band
WIDTH = round(360 / PIXEL_DEG)
HEIGHT = round((LAT_TOP - LAT_BOTTOM) / PIXEL_DEG)
TILE = 1024
STRIDE = 16
MIN_VALID = 0.5  # same filter as build_dataset.py
MERGE_KM = 30.0


def init_ee(project):
    ee.Initialize(project=project)
    ee.data.setDeadline(120_000)


def latest_available_day():
    """Most recent day with S5P CH4 data in Earth Engine (the OFFL product lags a few days)."""
    recent = ee.ImageCollection(COLLECTION).filterDate(ee.Date(time.time() * 1000).advance(-60, "day"),
                                                       ee.Date(time.time() * 1000))
    ms = recent.aggregate_max("system:time_start").getInfo()
    return Date.fromtimestamp(ms / 1000) if ms else None


def _fetch_tile(image, x0, y0, w, h):
    request = {
        "expression": image,
        "fileFormat": "NUMPY_NDARRAY",
        "grid": {
            "dimensions": {"width": w, "height": h},
            "affineTransform": {"scaleX": PIXEL_DEG, "shearX": 0, "translateX": -180 + x0 * PIXEL_DEG,
                                "shearY": 0, "scaleY": -PIXEL_DEG, "translateY": LAT_TOP - y0 * PIXEL_DEG},
            "crsCode": "EPSG:4326",
        },
    }
    for attempt in range(5):
        try:
            raw = np.asarray(ee.data.computePixels(request)[BAND], dtype=np.float32)
            raw[raw <= NODATA + 1] = np.nan
            return raw
        except Exception as e:
            transient = any(s in str(e).lower() for s in ("too many", "quota", "deadline", "timed out", "unavailable"))
            if isinstance(e, ee.EEException) and not transient:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"tile ({x0}, {y0}) failed after retries")


def fetch_day(day, workers=6):
    """Global (HEIGHT, WIDTH) CH4 grid in ppb with NaN where missing, or None if no overpasses that day."""
    start = ee.Date(day.isoformat())
    images = ee.ImageCollection(COLLECTION).filterDate(start, start.advance(1, "day"))
    if images.size().getInfo() == 0:
        return None
    image = images.select(BAND).mosaic().unmask(NODATA)

    grid = np.full((HEIGHT, WIDTH), np.nan, dtype=np.float32)
    tiles = [(x, y, min(TILE, WIDTH - x), min(TILE, HEIGHT - y))
             for y in range(0, HEIGHT, TILE) for x in range(0, WIDTH, TILE)]
    with ThreadPoolExecutor(workers) as pool:
        for (x, y, w, h), tile in zip(tiles, pool.map(lambda t: _fetch_tile(image, *t), tiles)):
            grid[y:y + h, x:x + w] = tile
    return grid


def pixel_to_latlon(row, col):
    return LAT_TOP - (row + 0.5) * PIXEL_DEG, -180 + (col + 0.5) * PIXEL_DEG


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * np.arcsin(np.sqrt(a))


def _smoothed_enhancement(grid):
    """3x3 NaN-aware mean, used to find plume peaks without chasing single noisy pixels."""
    valid = ~np.isnan(grid)
    total = uniform_filter(np.where(valid, grid, 0.0), size=3, mode="constant")
    count = uniform_filter(valid.astype(np.float32), size=3, mode="constant")
    return np.where(valid & (count > 0), total / np.maximum(count, 1e-6), np.nan)


def _crop(grid, row, col, size):
    r0 = int(np.clip(row - size // 2, 0, grid.shape[0] - size))
    c0 = int(np.clip(col - size // 2, 0, grid.shape[1] - size))
    return grid[r0:r0 + size, c0:c0 + size]


def _save_preview(patch, path):
    fig, ax = plt.subplots(figsize=(4, 4), dpi=64)
    ax.imshow(patch, cmap="inferno", vmin=np.nanpercentile(patch, 2), vmax=np.nanpercentile(patch, 98),
              interpolation="nearest")
    ax.set_axis_off()
    fig.subplots_adjust(0, 0, 1, 1)
    fig.savefig(path, facecolor="#09090b")
    plt.close(fig)


def scan_grid(grid, detector, day):
    """Run the detector over one day's grid; returns (n_windows_scored, detections)."""
    size = detector.patch
    windows = sliding_window_view(grid, (size, size))[::STRIDE, ::STRIDE]
    valid_frac = (~np.isnan(windows)).mean(axis=(2, 3))
    rows, cols = np.nonzero(valid_frac >= MIN_VALID)
    if len(rows) == 0:
        return 0, []

    probs = np.concatenate([detector.predict(np.ascontiguousarray(windows[rows[i:i + 2048], cols[i:i + 2048]]))
                            for i in range(0, len(rows), 2048)])
    hits = np.nonzero(probs >= detector.threshold)[0]

    # Re-centre each positive window on its strongest enhancement and score that patch
    smooth = _smoothed_enhancement(grid)
    candidates = {}
    for k in hits:
        r0, c0 = rows[k] * STRIDE, cols[k] * STRIDE
        win = smooth[r0:r0 + size, c0:c0 + size]
        if np.isnan(win).all():
            continue
        pr, pc = np.unravel_index(np.nanargmax(win), win.shape)
        candidates[(r0 + pr, c0 + pc)] = None
    if not candidates:
        return len(rows), []

    peaks = list(candidates)
    centred = [_crop(grid, r, c, size) for r, c in peaks]
    keep_frac = [float((~np.isnan(p)).mean()) for p in centred]
    centred_probs = detector.predict(np.stack(centred))

    order = np.argsort(-centred_probs)
    kept, kept_ll = [], []
    for i in order:
        if centred_probs[i] < detector.threshold or keep_frac[i] < MIN_VALID:
            continue
        lat, lon = pixel_to_latlon(*peaks[i])
        if kept_ll and (haversine_km(lat, lon, *np.array(kept_ll).T) < MERGE_KM).any():
            continue
        patch = centred[i]
        det_id = f"{day:%Y%m%d}_{lat:+.2f}_{lon:+.2f}"
        _save_preview(patch, store.IMAGE_DIR / f"{det_id}.png")
        kept_ll.append((lat, lon))
        kept.append({"id": det_id, "date": day.isoformat(), "lat": round(lat, 3), "lon": round(lon, 3),
                     "prob": round(float(centred_probs[i]), 4),
                     "peak_ppb": round(float(smooth[peaks[i]] - np.nanmedian(patch)), 1),
                     "valid_frac": round(keep_frac[i], 3)})
    return len(rows), kept


def scan_days(detector, days, log=print, rescan=False):
    """Scan each day in `days` (skipping ones already stored unless rescan); returns detections per day."""
    done = set() if rescan else store.scanned_dates()
    store.IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    results = {}
    for day in days:
        if day.isoformat() in done:
            log(f"{day}: already scanned, skipping")
            continue
        t0 = time.time()
        grid = fetch_day(day)
        if grid is None:
            log(f"{day}: no Sentinel-5P data")
            store.save_day(day.isoformat(), 0, [])
            continue
        t1 = time.time()
        n_windows, dets = scan_grid(grid, detector, day)
        store.save_day(day.isoformat(), n_windows, dets)
        results[day.isoformat()] = len(dets)
        log(f"{day}: {len(dets)} detections from {n_windows} windows "
            f"(fetch {t1 - t0:.0f}s, model {time.time() - t1:.0f}s)")
    return results


def recent_days(end, n):
    return [end - timedelta(days=i) for i in range(n - 1, -1, -1)]
