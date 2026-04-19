"""Calendar — today's + upcoming events.

Tries macOS Calendar via `osascript` first (no extra deps, but requires
the user to grant Calendar access on first run; the prompt comes from
macOS itself the first time the script runs). Falls back to a small set
of fake events so the tile still has something to render and the user
can decide whether to wire up a real source later.

`source` in settings forces the path:
- "auto" — try macOS, fall back to fake on any error
- "fake" — always return demo data (useful when osascript prompts get in the way)
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter

from api import logger
from api.routers.settings import _load_settings

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

OSASCRIPT_TIMEOUT = 5.0

# JavaScript for Automation — list events from every Calendar between
# now and +7 days. Output is a JSON array of {title, start, end, calendar,
# all_day, location} so the Python side just json.loads().
_JXA_SCRIPT = r"""
ObjC.import('Foundation');
var Calendar = Application('Calendar');
Calendar.includeStandardAdditions = false;
var now = new Date();
var horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
var out = [];
var cals = Calendar.calendars();
for (var i = 0; i < cals.length; i++) {
  var cal = cals[i];
  var events;
  try {
    events = cal.events.whose({
      _and: [
        { startDate: { _greaterThan: now } },
        { startDate: { _lessThan: horizon } }
      ]
    })();
  } catch (e) { continue; }
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    try {
      out.push({
        title: ev.summary(),
        start: ev.startDate().toISOString(),
        end: ev.endDate().toISOString(),
        calendar: cal.name(),
        all_day: ev.alldayEvent(),
        location: ev.location() || ""
      });
    } catch (e) { /* skip */ }
  }
}
JSON.stringify(out);
"""


def _macos_events() -> List[Dict[str, Any]]:
    """Run the JXA script. Returns [] (and logs a warning) on any error."""
    try:
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", _JXA_SCRIPT],
            capture_output=True,
            text=True,
            timeout=OSASCRIPT_TIMEOUT,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        logger.warning("calendar: osascript unavailable or timed out: %s", exc)
        return []
    if result.returncode != 0:
        logger.info("calendar: osascript exit=%s stderr=%s", result.returncode, result.stderr.strip())
        return []
    try:
        return json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        logger.warning("calendar: osascript output unparseable: %s", exc)
        return []


def _fake_events() -> List[Dict[str, Any]]:
    """Demo set — three illustrative events spread across today + tomorrow.
    Always anchored to "now" so the tile shows something useful even on a
    fresh install. Times use the local timezone (naive isoformat)."""
    now = datetime.now().replace(microsecond=0, second=0)
    samples = [
        ("Standup",          now.replace(hour=10, minute=0),  60, "Work"),
        ("Lunch w/ Sam",     now.replace(hour=13, minute=0),  60, "Personal"),
        ("Deep work block",  now.replace(hour=15, minute=0),  90, "Work"),
        ("Yoga",             (now + timedelta(days=1)).replace(hour=8, minute=0), 60, "Personal"),
    ]
    out = []
    for title, start, mins, cal in samples:
        if start < now - timedelta(hours=1):
            start = start + timedelta(days=1)
        end = start + timedelta(minutes=mins)
        out.append({
            "title": title,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "calendar": cal,
            "all_day": False,
            "location": "",
        })
    return out


def _normalize(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Trim past events, sort by start time, cap at 20."""
    now = datetime.now().astimezone()
    cleaned: List[Dict[str, Any]] = []
    for ev in events:
        try:
            start_str = str(ev.get("start") or "")
            end_str = str(ev.get("end") or "")
            # JXA's toISOString is UTC ("Z"); fromisoformat handles "+00:00".
            start_iso = start_str.replace("Z", "+00:00")
            end_iso = end_str.replace("Z", "+00:00")
            start_dt = datetime.fromisoformat(start_iso)
            end_dt = datetime.fromisoformat(end_iso) if end_iso else start_dt
            if start_dt.tzinfo is None:
                start_dt = start_dt.astimezone()
                end_dt = end_dt.astimezone()
        except Exception:  # noqa: BLE001
            continue
        if end_dt < now:
            continue
        cleaned.append({
            "title": str(ev.get("title") or "(no title)"),
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
            "calendar": str(ev.get("calendar") or ""),
            "all_day": bool(ev.get("all_day")),
            "location": str(ev.get("location") or ""),
        })
    cleaned.sort(key=lambda e: e["start"])
    return cleaned[:20]


@router.get("")
def calendar_today() -> Dict[str, Any]:
    settings = _load_settings()
    cfg = settings.get("calendar") or {}
    source = cfg.get("source") or "auto"

    used = "fake"
    events: List[Dict[str, Any]] = []
    if source != "fake":
        raw = _macos_events()
        if raw:
            events = _normalize(raw)
            used = "macos"
    if not events:
        events = _normalize(_fake_events())
        used = "fake"

    today = datetime.now().date().isoformat()
    today_events = [e for e in events if e["start"].startswith(today)]
    return {
        "source": used,
        "today": today,
        "today_count": len(today_events),
        "events": events,
    }
