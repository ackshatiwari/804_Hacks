"""SQLite storage for scan results. Patch previews live next to the database as PNGs."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "scans"
DB_PATH = DATA_DIR / "scans.db"
IMAGE_DIR = DATA_DIR / "images"

SCHEMA = """
CREATE TABLE IF NOT EXISTS scanned_days (
    date TEXT PRIMARY KEY,
    n_windows INTEGER NOT NULL,
    n_detections INTEGER NOT NULL,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS detections (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    prob REAL NOT NULL,
    peak_ppb REAL NOT NULL,
    valid_frac REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS detections_date ON detections (date);
"""


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    try:
        yield con
        con.commit()
    finally:
        con.close()


def scanned_dates():
    with connect() as con:
        return {r["date"] for r in con.execute("SELECT date FROM scanned_days")}


def save_day(date, n_windows, detections):
    """Replace one day's detections; `detections` are dicts matching the detections table."""
    with connect() as con:
        con.execute("DELETE FROM detections WHERE date = ?", (date,))
        con.executemany("INSERT INTO detections VALUES (:id, :date, :lat, :lon, :prob, :peak_ppb, :valid_frac)",
                        detections)
        con.execute("INSERT OR REPLACE INTO scanned_days (date, n_windows, n_detections) VALUES (?, ?, ?)",
                    (date, n_windows, len(detections)))


def detections_between(start, end):
    with connect() as con:
        rows = con.execute("SELECT * FROM detections WHERE date BETWEEN ? AND ? ORDER BY date, prob DESC",
                           (start, end))
        return [dict(r) for r in rows]


def get_detection(det_id):
    with connect() as con:
        row = con.execute("SELECT * FROM detections WHERE id = ?", (det_id,)).fetchone()
        return dict(row) if row else None


def latest_scanned():
    with connect() as con:
        return con.execute("SELECT MAX(date) FROM scanned_days").fetchone()[0]


def summary():
    with connect() as con:
        rows = con.execute("SELECT * FROM scanned_days ORDER BY date").fetchall()
        return [dict(r) for r in rows]
