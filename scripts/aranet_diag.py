#!/usr/bin/env python3
"""Minimal bleak-only Aranet4 history reader + diagnostic.

Bypasses aranet4-python entirely. Connects via bleak, walks through
the documented protocol, prints raw packets so we can see what the
device actually sends. If v2 (poll) returns empty, tries v1 (notify).

Usage:
  /opt/homebrew/bin/python3 scripts/aranet_diag.py <UUID>
"""
from __future__ import annotations

import asyncio
import struct
import sys

from bleak import BleakClient

CHAR_CMD = "f0cd1402-95da-4f4b-9ac8-aa55d312af0c"
CHAR_HIST_V2 = "f0cd2005-95da-4f4b-9ac8-aa55d312af0c"
CHAR_HIST_V1 = "f0cd2003-95da-4f4b-9ac8-aa55d312af0c"
CHAR_TOTAL = "f0cd2001-95da-4f4b-9ac8-aa55d312af0c"
CHAR_INTERVAL = "f0cd2002-95da-4f4b-9ac8-aa55d312af0c"
CHAR_SINCE_UPD = "f0cd2004-95da-4f4b-9ac8-aa55d312af0c"

PARAM_CO2 = 4


async def main(addr: str) -> int:
    print(f"Connecting to {addr}...")
    async with BleakClient(addr, timeout=20.0) as client:
        print(f"  connected: {client.is_connected}")

        # Discovery
        svcs = client.services
        v2_present = svcs.get_characteristic(CHAR_HIST_V2) is not None
        v1_present = svcs.get_characteristic(CHAR_HIST_V1) is not None
        print(f"  v2 char: {v2_present}   v1 char: {v1_present}")

        # Basic metadata
        total = struct.unpack("<H", await client.read_gatt_char(CHAR_TOTAL))[0]
        interval = struct.unpack("<H", await client.read_gatt_char(CHAR_INTERVAL))[0]
        since = struct.unpack("<H", await client.read_gatt_char(CHAR_SINCE_UPD))[0]
        print(f"  total={total} interval={interval}s since_update={since}s")

        # ── V2: write command, then poll reads ────────────────────────────
        if v2_present:
            print("\n[v2 attempt] requesting CO2 from idx=1")
            cmd = struct.pack("<BBH", 0x61, PARAM_CO2, 1)
            await client.write_gatt_char(CHAR_CMD, cmd, response=True)
            await asyncio.sleep(0.2)

            total_rows = 0
            for attempt in range(20):
                packet = await client.read_gatt_char(CHAR_HIST_V2)
                if len(packet) < 10:
                    print(f"  read[{attempt}] short packet ({len(packet)} bytes): {packet.hex()}")
                    await asyncio.sleep(0.1)
                    continue
                h = struct.unpack("<BHHHHB", packet[:10])
                # fields: (unk1, param, start, count, unk2, unk3)
                _, param, start, count, unk2, unk3 = h
                body = packet[10:]
                print(
                    f"  read[{attempt}] param={param} start={start} "
                    f"count={count} unk2={unk2} unk3={unk3} body={len(body)}B"
                )
                if count > 0 and param == PARAM_CO2 and body:
                    vals = [v[0] for v in struct.iter_unpack("<H", body[: (len(body) // 2) * 2])]
                    print(f"    → first values: {vals[:8]}")
                    total_rows += count
                    if start - 1 + count >= total:
                        print("    (reached end of log)")
                        break
                else:
                    await asyncio.sleep(0.2)
            print(f"  v2 collected rows: {total_rows}")

        # ── V1: notification-based fallback ───────────────────────────────
        if v1_present and total_rows == 0:
            print("\n[v1 attempt] subscribing for CO2 notifications")
            notifications = []

            def on_notify(_sender, data: bytearray) -> None:
                notifications.append(bytes(data))

            await client.start_notify(CHAR_HIST_V1, on_notify)
            cmd = struct.pack("<BBHHH", 0x82, PARAM_CO2, 0, 1, total)
            await client.write_gatt_char(CHAR_CMD, cmd, response=True)
            await asyncio.sleep(8.0)  # give it time to stream
            await client.stop_notify(CHAR_HIST_V1)
            print(f"  v1 notifications received: {len(notifications)}")
            for i, n in enumerate(notifications[:5]):
                print(f"    [{i}] {len(n)}B {n[:24].hex()}...")

    return 0


if __name__ == "__main__":
    uuid = sys.argv[1] if len(sys.argv) > 1 else "518BB646-2E6C-7616-E6EC-2073CDBAC613"
    sys.exit(asyncio.run(main(uuid)))
