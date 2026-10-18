"""Shared plume queries: recent detections with repeat counts."""

from datetime import date as Date, timedelta

import numpy as np

from . import store
from .geo import haversine_km

REPEAT_KM = 15.0
REPEAT_DAYS = 56  # 8 weeks


def with_repeats(plumes, history):
    """Add repeat_count: distinct days in the 8 weeks up to each plume with a detection within REPEAT_KM."""
    if not history:
        return plumes
    h_lat = np.array([h["lat"] for h in history])
    h_lon = np.array([h["lon"] for h in history])
    h_date = np.array([Date.fromisoformat(h["date"]) for h in history])
    for p in plumes:
        d = Date.fromisoformat(p["date"])
        near = (haversine_km(p["lat"], p["lon"], h_lat, h_lon) < REPEAT_KM) \
            & (h_date <= d) & (h_date > d - timedelta(days=REPEAT_DAYS))
        p["repeat_dates"] = sorted({h_date[i].isoformat() for i in np.nonzero(near)[0]})
        p["repeat_count"] = len(p["repeat_dates"])
    return plumes


def recent(days, min_prob):
    """Detections from the `days` days ending at the latest scanned day, with repeat counts."""
    end = store.latest_scanned()
    if end is None:
        return None, None, []
    end_d = Date.fromisoformat(end)
    start = (end_d - timedelta(days=days - 1)).isoformat()
    shown = [p for p in store.detections_between(start, end) if p["prob"] >= min_prob]
    history = store.detections_between((end_d - timedelta(days=REPEAT_DAYS + days)).isoformat(), end)
    return start, end, with_repeats(shown, history)
