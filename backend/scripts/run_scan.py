"""
Scan recent Sentinel-5P days for methane plumes and store them for the API.

Usage:  python backend/scripts/run_scan.py --project <gcp-project-id> [--days 56] [--rescan]
First run: --days 56 backfills the 8 weeks used for repeat counts. Weekly runs: the default 7.
"""

import argparse
import sys
from datetime import date as Date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import alerts, scan  # noqa: E402
from app.model import Detector  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--project", required=True, help="Google Cloud project registered for Earth Engine")
    p.add_argument("--days", type=int, default=7, help="Number of days to scan, ending at the latest data")
    p.add_argument("--end", type=Date.fromisoformat, help="Last day to scan (default: latest available)")
    p.add_argument("--rescan", action="store_true", help="Re-scan days that are already stored")
    args = p.parse_args()

    scan.init_ee(args.project)
    end = args.end or scan.latest_available_day()
    if end is None:
        raise SystemExit("No recent Sentinel-5P data found in Earth Engine.")
    days = scan.recent_days(end, args.days)
    print(f"Scanning {days[0]} to {days[-1]}")
    scan.scan_days(Detector(), days, rescan=args.rescan)
    print(f"Sent {alerts.send_digests()} alert emails")


if __name__ == "__main__":
    main()
