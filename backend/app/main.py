"""
Methane Watch API: serves stored scan results and can kick off a new scan.

Run:  backend\\venv\\Scripts\\uvicorn app.main:app --reload --app-dir backend
Env:  EE_PROJECT        Google Cloud project for Earth Engine (needed only for POST /api/scan)
      FRONTEND_ORIGINS  comma-separated CORS origins (default http://localhost:3000)
"""

import os
import threading
from contextlib import asynccontextmanager
from datetime import date as Date, timedelta

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import scan, store
from .model import Detector

REPEAT_KM = 15.0
REPEAT_DAYS = 56  # 8 weeks

state = {"detector": None, "scan": {"running": False, "log": [], "error": None}}


@asynccontextmanager
async def lifespan(app):
    state["detector"] = Detector()
    yield


app = FastAPI(title="Methane Watch API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def with_repeats(plumes, history):
    """Add repeat_count: distinct days in the 8 weeks up to each plume with a detection within REPEAT_KM."""
    if not history:
        return plumes
    h_lat = np.array([h["lat"] for h in history])
    h_lon = np.array([h["lon"] for h in history])
    h_date = np.array([Date.fromisoformat(h["date"]) for h in history])
    for p in plumes:
        d = Date.fromisoformat(p["date"])
        near = (scan.haversine_km(p["lat"], p["lon"], h_lat, h_lon) < REPEAT_KM) \
            & (h_date <= d) & (h_date > d - timedelta(days=REPEAT_DAYS))
        p["repeat_dates"] = sorted({h_date[i].isoformat() for i in np.nonzero(near)[0]})
        p["repeat_count"] = len(p["repeat_dates"])
    return plumes


def public(p):
    return {**p, "image_url": f"/api/plumes/{p['id']}/image.png"}


@app.get("/api/health")
def health():
    return {"ok": True, "latest_scanned": store.latest_scanned()}


@app.get("/api/metrics")
def metrics():
    d = state["detector"]
    return {**d.metrics, "threshold": round(d.threshold, 3)}


@app.get("/api/plumes")
def plumes(days: int = Query(7, ge=1, le=REPEAT_DAYS), min_prob: float | None = Query(None, ge=0, le=1)):
    """Detections from the `days` days ending at the latest scanned day."""
    end = store.latest_scanned()
    if end is None:
        return {"start": None, "end": None, "threshold": state["detector"].threshold, "plumes": []}
    end_d = Date.fromisoformat(end)
    start = (end_d - timedelta(days=days - 1)).isoformat()
    cutoff = state["detector"].threshold if min_prob is None else min_prob
    shown = [p for p in store.detections_between(start, end) if p["prob"] >= cutoff]
    history = store.detections_between((end_d - timedelta(days=REPEAT_DAYS + days)).isoformat(), end)
    return {"start": start, "end": end, "threshold": state["detector"].threshold,
            "plumes": [public(p) for p in with_repeats(shown, history)]}


@app.get("/api/plumes/{det_id}")
def plume(det_id: str):
    p = store.get_detection(det_id)
    if p is None:
        raise HTTPException(404, "unknown plume")
    d = Date.fromisoformat(p["date"])
    history = store.detections_between((d - timedelta(days=REPEAT_DAYS)).isoformat(), p["date"])
    return public(with_repeats([p], history)[0])


@app.get("/api/plumes/{det_id}/image.png")
def plume_image(det_id: str):
    path = store.IMAGE_DIR / f"{det_id}.png"
    if store.get_detection(det_id) is None or not path.exists():
        raise HTTPException(404, "no image")
    return FileResponse(path, media_type="image/png")


def _run_scan(days, rescan):
    s = state["scan"]
    try:
        scan.init_ee(os.environ["EE_PROJECT"])
        end = scan.latest_available_day()
        if end is None:
            raise RuntimeError("no recent Sentinel-5P data in Earth Engine")
        scan.scan_days(state["detector"], scan.recent_days(end, days), log=s["log"].append, rescan=rescan)
    except Exception as e:
        s["error"] = str(e)
    finally:
        s["running"] = False


@app.post("/api/scan")
def start_scan(days: int = Query(7, ge=1, le=REPEAT_DAYS), rescan: bool = False):
    """Scan the last `days` days of Sentinel-5P data in the background."""
    if "EE_PROJECT" not in os.environ:
        raise HTTPException(400, "set EE_PROJECT to your Earth Engine Google Cloud project")
    if state["scan"]["running"]:
        raise HTTPException(409, "a scan is already running")
    state["scan"] = {"running": True, "log": [], "error": None}
    threading.Thread(target=_run_scan, args=(days, rescan), daemon=True).start()
    return state["scan"]


@app.get("/api/scan/status")
def scan_status():
    return {**state["scan"], "days": store.summary()}
