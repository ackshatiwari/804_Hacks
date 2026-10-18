"""
Methane Watch API: serves stored scan results, email alert sign-ups, and can kick off a new scan.

Run:  backend\\venv\\Scripts\\uvicorn app.main:app --reload --app-dir backend
Serving needs only requirements-server.txt; torch and Earth Engine load only when a scan starts.
Env:  EE_PROJECT        Google Cloud project for Earth Engine (needed only for POST /api/scan)
      FRONTEND_ORIGINS  comma-separated CORS origins (default http://localhost:3000)
      SMTP_* etc.       email settings, see app/alerts.py
"""

import json
import os
import threading
from datetime import date as Date, timedelta

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from . import alerts, store
from . import plumes as plumes_q

METRICS = json.loads((store.DATA_DIR.parent.parent / "models" / "metrics.json").read_text())
state = {"scan": {"running": False, "log": [], "error": None}}

app = FastAPI(title="Methane Watch API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("FRONTEND_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def public(p):
    return {**p, "image_url": f"/api/plumes/{p['id']}/image.png"}


@app.get("/api/health")
def health():
    return {"ok": True, "latest_scanned": store.latest_scanned()}


@app.get("/api/metrics")
def metrics():
    return METRICS


@app.get("/api/plumes")
def plumes(days: int = Query(7, ge=1, le=plumes_q.REPEAT_DAYS), min_prob: float | None = Query(None, ge=0, le=1)):
    """Detections from the `days` days ending at the latest scanned day (all stored ones pass the model threshold)."""
    start, end, shown = plumes_q.recent(days, min_prob or 0.0)
    return {"start": start, "end": end, "threshold": METRICS["threshold"], "plumes": [public(p) for p in shown]}


@app.get("/api/plumes/{det_id}")
def plume(det_id: str):
    p = store.get_detection(det_id)
    if p is None:
        raise HTTPException(404, "unknown plume")
    d = Date.fromisoformat(p["date"])
    history = store.detections_between((d - timedelta(days=plumes_q.REPEAT_DAYS)).isoformat(), p["date"])
    return public(plumes_q.with_repeats([p], history)[0])


@app.get("/api/plumes/{det_id}/image.png")
def plume_image(det_id: str):
    path = store.IMAGE_DIR / f"{det_id}.png"
    if store.get_detection(det_id) is None or not path.exists():
        raise HTTPException(404, "no image")
    return FileResponse(path, media_type="image/png")


class AlertSignup(BaseModel):
    email: str = Field(max_length=254)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius_miles: float = Field(gt=0, le=1000)


@app.post("/api/alerts")
def create_alert(body: AlertSignup):
    """Subscribe to plumes within radius_miles of a point; sends a welcome email with recent matches."""
    try:
        sub = alerts.subscribe(body.email.strip(), body.lat, body.lon, body.radius_miles)
    except ValueError as e:
        raise HTTPException(422, str(e))
    try:
        found, delivery = alerts.send_welcome(sub)
    except Exception as e:
        store.delete_subscription(sub["token"])
        raise HTTPException(502, f"couldn't send the email: {e}")
    return {"radius_miles": sub["radius_miles"], "matches": len(found), "delivery": delivery}


@app.get("/api/alerts/unsubscribe", response_class=HTMLResponse)
def unsubscribe(token: str):
    done = store.delete_subscription(token)
    message = "You're unsubscribed from Methane Watch alerts." if done else "This alert was already removed."
    return f"<!doctype html><title>Methane Watch</title><body style='font-family:sans-serif;padding:40px'><p>{message}</p>"


@app.post("/api/alerts/send")
def send_alerts():
    """Email every subscriber their unsent nearby plumes now (also runs after each scan)."""
    log = []
    return {"emails_sent": alerts.send_digests(log=log.append), "log": log}


def _run_scan(days, rescan):
    s = state["scan"]
    try:
        from . import scan
        from .model import Detector  # imported here so serving the API doesn't need torch or Earth Engine

        scan.init_ee(os.environ["EE_PROJECT"])
        end = scan.latest_available_day()
        if end is None:
            raise RuntimeError("no recent Sentinel-5P data in Earth Engine")
        scan.scan_days(Detector(), scan.recent_days(end, days), log=s["log"].append, rescan=rescan)
        alerts.send_digests(log=s["log"].append)
    except Exception as e:
        s["error"] = str(e)
    finally:
        s["running"] = False


@app.post("/api/scan")
def start_scan(days: int = Query(7, ge=1, le=plumes_q.REPEAT_DAYS), rescan: bool = False):
    """Scan the last `days` days of Sentinel-5P data in the background, then send alert emails."""
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
