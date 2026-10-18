"""
Email alerts: people subscribe to a point and a radius, and get emailed plumes detected inside it.

Set in backend/.env or the environment:
    ALERT_FROM          e.g. "Methane Watch <you@gmail.com>"
    SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASSWORD
    BREVO_API_KEY       send through Brevo's HTTPS API instead of SMTP (for hosts that block SMTP ports,
                        e.g. Render's free tier); images then load from API_PUBLIC_URL, so it must be public
    SITE_URL (default http://localhost:3000), API_PUBLIC_URL (default http://localhost:8000)
With neither SMTP_HOST nor BREVO_API_KEY, emails are written to backend/data/scans/outbox/ as .eml files.
"""

import html
import json
import os
import re
import secrets
import smtplib
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

from . import plumes as plumes_q
from . import store
from .geo import haversine_km

MILES_PER_KM = 0.621371
MIN_PROB = 0.8  # same default as the map's confidence filter
LOOKBACK_DAYS = 7
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
OUTBOX = store.DATA_DIR / "outbox"


def _load_env_file():
    path = Path(__file__).resolve().parent.parent / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file()


def _env(key, default=None):
    return os.environ.get(key, default)


def subscribe(email, lat, lon, radius_miles):
    if not EMAIL_RE.match(email):
        raise ValueError("invalid email address")
    token = secrets.token_urlsafe(16)
    sub_id = store.add_subscription(email, lat, lon, radius_miles, token)
    return {"id": sub_id, "email": email, "lat": lat, "lon": lon, "radius_miles": radius_miles, "token": token}


def nearby(sub, plumes):
    """Plumes inside the subscription's radius, nearest first, each with distance_miles."""
    out = []
    for p in plumes:
        miles = float(haversine_km(sub["lat"], sub["lon"], p["lat"], p["lon"])) * MILES_PER_KM
        if miles <= sub["radius_miles"]:
            out.append({**p, "distance_miles": round(miles)})
    return sorted(out, key=lambda p: p["distance_miles"])


def _fmt_latlon(lat, lon):
    return f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'W'}"


def _fmt_date(iso):
    d = datetime.fromisoformat(iso)
    return f"{d:%b} {d.day}, {d.year}"


def build_email(sub, plumes, welcome):
    site, api = _env("SITE_URL", "http://localhost:3000"), _env("API_PUBLIC_URL", "http://localhost:8000")
    radius = f"{sub['radius_miles']:g} mi of {_fmt_latlon(sub['lat'], sub['lon'])}"
    n = len(plumes)
    if welcome:
        subject = f"Methane Watch alerts are on: {n} recent plume{'s' * (n != 1)} within {sub['radius_miles']:g} mi"
        intro = (f"You'll get an email whenever our satellite scan detects a methane plume within {radius}. "
                 + (f"Here {'is' if n == 1 else 'are'} the {n} detected in the last week." if n
                    else "Nothing has been detected there in the last week."))
    else:
        subject = f"Methane Watch: {n} new plume{'s' * (n != 1)} within {sub['radius_miles']:g} mi"
        intro = f"Our latest Sentinel-5P scan found {n} new methane plume{'s' * (n != 1)} within {radius}."

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _env("ALERT_FROM") or _env("SMTP_USER") or "alerts@methane-watch.local"
    msg["To"] = sub["email"]

    images, rows, text_rows = [], [], []
    for p in plumes:
        cid = make_msgid(domain="methane-watch")
        path = store.IMAGE_DIR / f"{p['id']}.png"
        # Brevo's API has no inline attachments, so link the image from the (public) API instead
        src = f"{api}/api/plumes/{quote(p['id'])}/image.png" if _env("BREVO_API_KEY") else f"cid:{cid[1:-1]}"
        if path.exists():
            images.append((cid, path.read_bytes()))
        repeat = (f"Seen on {p['repeat_count']} days in 8 weeks" if p.get("repeat_count", 1) >= 2
                  else "First sighting here in 8 weeks")
        link = f"{site}/map?plume={quote(p['id'])}"
        img = (f'<img src="{html.escape(src)}" width="96" height="96" alt="" '
               f'style="display:block;border-radius:6px;background:#18181b">' if path.exists() else "")
        rows.append(f"""
<tr><td style="padding:12px 0;border-top:1px solid #e4e4e7;vertical-align:top;width:108px">{img}</td>
<td style="padding:12px 0 12px 12px;border-top:1px solid #e4e4e7;vertical-align:top;font-size:14px;line-height:20px;color:#27272a">
<b>{_fmt_latlon(p['lat'], p['lon'])}</b> &middot; {p['distance_miles']} mi away<br>
Observed {_fmt_date(p['date'])} &middot; model confidence <b>{round(p['prob'] * 100)}%</b><br>
+{p['peak_ppb']:.0f} ppb above surroundings &middot; {repeat}<br>
<a href="{html.escape(link)}" style="color:#d97706">View on the map</a></td></tr>""")
        text_rows.append(f"- {_fmt_latlon(p['lat'], p['lon'])}, {p['distance_miles']} mi away, {_fmt_date(p['date'])}, "
                         f"confidence {round(p['prob'] * 100)}%, +{p['peak_ppb']:.0f} ppb. {repeat}. {link}")

    unsubscribe = f"{api}/api/alerts/unsubscribe?token={quote(sub['token'])}"
    footer = ("Detections come from a CNN run on Sentinel-5P TROPOMI data (about 7 km pixels). "
              "Not every detection is a confirmed leak; spots seen on several days are the most reliable.")
    msg.set_content(f"{intro}\n\n" + "\n".join(text_rows) + f"\n\n{footer}\n\nUnsubscribe: {unsubscribe}\n")
    msg.add_alternative(f"""<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="padding:20px 24px;background:#09090b;border-radius:12px 12px 0 0;color:#fbbf24;font-weight:bold;font-size:16px">&#9679; Methane Watch</td></tr>
<tr><td style="padding:20px 24px 4px;font-size:15px;line-height:22px;color:#18181b">{html.escape(intro)}</td></tr>
<tr><td style="padding:0 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{''.join(rows)}</table></td></tr>
<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:18px;color:#71717a">{footer}<br><br>
<a href="{html.escape(unsubscribe)}" style="color:#71717a">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>""", subtype="html")
    if not _env("BREVO_API_KEY"):
        html_part = msg.get_payload()[1]
        for cid, data in images:
            html_part.add_related(data, maintype="image", subtype="png", cid=cid)
    return msg


def _send_brevo(msg):
    name, address = parseaddr(msg["From"])
    payload = {
        "sender": {"name": name or "Methane Watch", "email": address},
        "to": [{"email": msg["To"]}],
        "subject": msg["Subject"],
        "htmlContent": msg.get_body(("html",)).get_content(),
        "textContent": msg.get_body(("plain",)).get_content(),
    }
    req = Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(payload).encode(), method="POST",
                  headers={"api-key": _env("BREVO_API_KEY"), "content-type": "application/json",
                           "accept": "application/json"})
    with urlopen(req, timeout=30) as res:
        res.read()


def deliver(msg):
    """Send via Brevo or SMTP if configured; otherwise save to the outbox. Returns 'brevo', 'smtp' or 'outbox'."""
    if _env("BREVO_API_KEY"):
        _send_brevo(msg)
        return "brevo"
    host = _env("SMTP_HOST")
    if not host:
        OUTBOX.mkdir(parents=True, exist_ok=True)
        name = f"{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(3)}.eml"
        (OUTBOX / name).write_bytes(bytes(msg))
        return "outbox"
    port = int(_env("SMTP_PORT", "587"))
    smtp = smtplib.SMTP_SSL(host, port, timeout=30) if port == 465 else smtplib.SMTP(host, port, timeout=30)
    with smtp:
        if port != 465:
            smtp.starttls()
        if _env("SMTP_USER"):
            smtp.login(_env("SMTP_USER"), _env("SMTP_PASSWORD", ""))
        smtp.send_message(msg)
    return "smtp"


def send_welcome(sub):
    _, _, recent = plumes_q.recent(LOOKBACK_DAYS, MIN_PROB)
    found = nearby(sub, recent)
    delivery = deliver(build_email(sub, found, welcome=True))
    store.mark_sent(sub["id"], [p["id"] for p in found])
    return found, delivery


def send_digests(log=print):
    """Email every subscriber the plumes near them that they haven't been sent yet. Returns emails sent."""
    _, _, recent = plumes_q.recent(LOOKBACK_DAYS, MIN_PROB)
    sent = 0
    for sub in store.subscriptions():
        already = store.sent_ids(sub["id"])
        found = [p for p in nearby(sub, recent) if p["id"] not in already]
        if not found:
            continue
        try:
            delivery = deliver(build_email(sub, found, welcome=False))
        except Exception as e:  # one bad address shouldn't stop the rest
            log(f"alert to {sub['email']} failed: {e}")
            continue
        store.mark_sent(sub["id"], [p["id"] for p in found])
        sent += 1
        log(f"alert to {sub['email']}: {len(found)} plumes ({delivery})")
    return sent
