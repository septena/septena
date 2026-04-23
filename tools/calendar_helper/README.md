# Calendar Helper

Tiny Obj-C CLI bundled as `CalendarHelper.app`. Reads EventKit and prints
upcoming events as JSON. Exists because macOS 14+ only grants full Calendar
read access to signed bundles with `NSCalendarsFullAccessUsageDescription`
in their Info.plist — a bare `python3` or `osascript` call is capped at
write-only, so `/api/calendar` can't read events directly.

## Build

```
./build.sh
```

Produces `CalendarHelper.app/`. Run once manually to trigger the macOS
access prompt:

```
open -W ./CalendarHelper.app --env SEPTENA_CAL_OUT=/tmp/out.json
cat /tmp/out.json
```

Grant Calendar access when prompted. The grant persists in TCC so future
runs are silent. The Septena backend (`api/routers/calendar.py`) invokes
the same binary via `open -W` on every `/api/calendar` request.

## Env vars

- `SEPTENA_CAL_DAYS` — horizon in days (default 7)
- `SEPTENA_CAL_OUT`  — file to write JSON to (required when launched via
  `open -W` since stdout is lost)
