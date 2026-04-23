#!/usr/bin/env python3
"""Pull Aranet4 history over BLE using raw bleak GATT reads, and append
readings to per-day rollup files at Bases/Air/Log/{date}.md.

Bypasses aranet4-python entirely — that library's v2 header decoder
rejects every packet on Aranet4 firmware v1.4.14 (the first-byte param
check fails), so we do the GATT protocol ourselves. ~80 lines of
protocol, full reliability.

State (last synced timestamp) lives at ~/.config/septena/aranet-state.json.
Dedup is keyed on HH:MM, so re-runs are idempotent.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import struct
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml
from bleak import BleakClient


VAULT_ROOT = Path.home() / "Documents/septena-data"
AIR_DIR = VAULT_ROOT / "Air" / "Log"
STATE_PATH = Path.home() / ".config/septena/aranet-state.json"
DEFAULT_DEVICE = "518BB646-2E6C-7616-E6EC-2073CDBAC613"

CHAR_CMD       = "f0cd1402-95da-4f4b-9ac8-aa55d312af0c"
CHAR_HIST_V2   = "f0cd2005-95da-4f4b-9ac8-aa55d312af0c"
CHAR_TOTAL     = "f0cd2001-95da-4f4b-9ac8-aa55d312af0c"
CHAR_INTERVAL  = "f0cd2002-95da-4f4b-9ac8-aa55d312af0c"
CHAR_SINCE_UPD = "f0cd2004-95da-4f4b-9ac8-aa55d312af0c"

# Parameter codes for the v2 history request (struct: 0x61, param, start_u16).
PARAM_TEMPERATURE = 1
PARAM_HUMIDITY    = 2
PARAM_PRESSURE    = 3
PARAM_CO2         = 4


# ── YAML rollup helpers ──────────────────────────────────────────────────
def _day_path(day: str) -> Path:
    return AIR_DIR / f"{day}.md"


def _read_day(day: str) -> dict:
    path = _day_path(day)
    if not path.exists():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return {}
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    try:
        fm = yaml.safe_load(parts[1]) or {}
    except Exception:
        return {}
    readings = fm.get("readings") or []
    out: dict = {}
    if isinstance(readings, list):
        for r in readings:
            if isinstance(r, dict):
                t = str(r.get("time") or "").strip()
                if t:
                    out[t] = r
    return out


def _write_day(day: str, readings_by_time: dict) -> None:
    AIR_DIR.mkdir(parents=True, exist_ok=True)
    sorted_readings = [readings_by_time[t] for t in sorted(readings_by_time.keys())]
    fm = {
        "date": day,
        "section": "air",
        "readings": sorted_readings,
    }
    body = (
        "---\n"
        + yaml.safe_dump(fm, sort_keys=False, allow_unicode=True, default_flow_style=False)
        + "---\n"
    )
    _day_path(day).write_text(body, encoding="utf-8")


def _load_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text())
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, default=str))


# ── BLE protocol ────────────────────────────────────────────────────────
async def _fetch_param(client: BleakClient, param: int, total: int) -> list[int]:
    """Request history for one param. Returns a list of length `total`
    (indexed 0..total-1) with raw values — callers scale them."""
    cmd = struct.pack("<BBH", 0x61, param, 1)
    await client.write_gatt_char(CHAR_CMD, cmd, response=True)
    await asyncio.sleep(0.15)

    # Element size: humidity is 1 byte, everything else is 2 bytes.
    elem = 1 if param == PARAM_HUMIDITY else 2
    fmt = "<B" if param == PARAM_HUMIDITY else "<H"

    values = [None] * total  # indexed 0..total-1
    filled = 0
    stalls = 0
    while filled < total and stalls < 40:
        packet = await client.read_gatt_char(CHAR_HIST_V2)
        if len(packet) < 10:
            stalls += 1
            await asyncio.sleep(0.1)
            continue
        # Header layout on fw v1.4.14: <BHHHHB> =
        #   (param, interval, total, ago, start, count).
        # `start` is 1-indexed. `count` is items in THIS packet.
        _, _interval, _total, _ago, start, count = struct.unpack("<BHHHHB", packet[:10])
        body = packet[10:]
        if count == 0 or not body:
            stalls += 1
            await asyncio.sleep(0.1)
            continue
        # Parse `count` elements of `elem` bytes each.
        expected = count * elem
        body = body[:expected]
        parsed = [v[0] for v in struct.iter_unpack(fmt, body)]
        for i, v in enumerate(parsed):
            idx = start - 1 + i
            if 0 <= idx < total and values[idx] is None:
                values[idx] = v
                filled += 1
        stalls = 0  # made progress

    return [v for v in values]


async def _pull(device: str, since: datetime | None) -> tuple[int, int, datetime | None]:
    async with BleakClient(device, timeout=20.0) as client:
        total = struct.unpack("<H", await client.read_gatt_char(CHAR_TOTAL))[0]
        interval = struct.unpack("<H", await client.read_gatt_char(CHAR_INTERVAL))[0]
        since_update = struct.unpack("<H", await client.read_gatt_char(CHAR_SINCE_UPD))[0]
        print(f"  device: total={total} interval={interval}s since_update={since_update}s", flush=True)

        now_utc = datetime.now(timezone.utc).replace(microsecond=0)
        # Reconstruct each index's timestamp (mirrors aranet4._log_times).
        start_ts = now_utc - timedelta(seconds=((total - 1) * interval) + since_update)
        timestamps = [start_ts + timedelta(seconds=interval * i) for i in range(total)]

        print("  pulling co2...", flush=True)
        co2 = await _fetch_param(client, PARAM_CO2, total)
        print("  pulling temp...", flush=True)
        temp = await _fetch_param(client, PARAM_TEMPERATURE, total)
        print("  pulling humidity...", flush=True)
        hum = await _fetch_param(client, PARAM_HUMIDITY, total)
        print("  pulling pressure...", flush=True)
        pres = await _fetch_param(client, PARAM_PRESSURE, total)

    per_day: dict[str, dict] = {}
    seen = 0
    newest: datetime | None = None
    for i in range(total):
        ts_local = timestamps[i].astimezone()
        if since is not None and ts_local <= since:
            continue
        if co2[i] is None:
            continue
        seen += 1
        day = ts_local.date().isoformat()
        reading = {
            "time": ts_local.strftime("%H:%M"),
            "co2_ppm": int(co2[i]) if co2[i] is not None else None,
            "temp_c": round(temp[i] / 20.0, 1) if temp[i] is not None else None,
            "humidity_pct": int(hum[i]) if hum[i] is not None else None,
            "pressure_hpa": round(pres[i] / 10.0, 1) if pres[i] is not None else None,
        }
        per_day.setdefault(day, {})[reading["time"]] = reading
        if newest is None or ts_local > newest:
            newest = ts_local

    written = 0
    for day, new_by_time in per_day.items():
        existing = _read_day(day)
        merged = {**existing, **new_by_time}
        added = len(merged) - len(existing)
        if added > 0:
            _write_day(day, merged)
            written += added
    return written, seen, newest


async def main_async(device: str, full: bool) -> int:
    state = _load_state()
    since_str = state.get("last_synced_at") if not full else None
    since: datetime | None = None
    if since_str:
        try:
            since = datetime.fromisoformat(since_str)
        except ValueError:
            pass

    print(f"Pulling from {device} (since={since})...", flush=True)
    try:
        written, seen, newest = await _pull(device, since)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if newest is not None:
        state["last_synced_at"] = newest.isoformat()
    state["device"] = device
    state["last_run_at"] = datetime.now().astimezone().isoformat()
    state["last_run_written"] = written
    state["last_run_seen"] = seen
    _save_state(state)

    print(f"Done. seen={seen} written={written} newest={newest}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Aranet4 → Septena Air log poller (raw bleak)")
    ap.add_argument("--device", default=DEFAULT_DEVICE, help="BLE address / macOS UUID")
    ap.add_argument("--full", action="store_true", help="Ignore last_synced_at and pull everything on-device")
    args = ap.parse_args()
    return asyncio.run(main_async(args.device, args.full))


if __name__ == "__main__":
    sys.exit(main())
