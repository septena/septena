# Health Data Sources — Integration Spec

**Setup assumptions:** macOS host on the same LAN / Tailnet as an iOS
device. Defaults shown assume Setlist's standard `SETLIST_INTEGRATIONS_DIR`
location (`~/.config/openclaw/`); substitute your own if you've overridden
that env var.

---

## 1. Apple Health → Health Auto Export Webhook

**Architecture:** Apple Health app → Health Auto Export iOS app → POSTs JSON to local webhook → saved to disk

**Webhook endpoint (local HTTP):**
```
http://<your-mac-hostname-or-tailscale-ip>:9876
```
Use `hostname.local` (Bonjour), a LAN IP, or a Tailscale IP — whatever
the iOS device can reach.

**Receiver:** any HTTP server that writes the POST body to `latest.json`.
A minimal FastAPI/Flask/aiohttp script (~20 lines) is enough — Setlist
doesn't ship one opinionated helper.

**Storage directory:**
```
$SETLIST_INTEGRATIONS_DIR/health_auto_export/
├── latest.json                  # Most recent full export (refreshed throughout day)
├── health_export_YYYY-MM-DD.json  # Optional timestamped snapshots (for history)
```

**Data freshness:** `latest.json` is overwritten each time the iOS app fires a webhook (typically on each HealthKit change — workouts trigger immediately, daily summaries overnight).

**Metric names in `latest.json`:**
```
active_energy
apple_exercise_time
apple_stand_hour
apple_stand_time
apple_sleeping_wrist_temperature  (some days only)
basal_energy_burned
blood_oxygen_saturation
cardio_recovery
flights_climbed
heart_rate                   (per-minute readings — very large dataset)
heart_rate_variability
physical_effort
respiratory_rate
resting_heart_rate
sleep_analysis
step_count
time_in_daylight
vo2_max
walking_running_distance
walking_speed
walking_step_length
walking_asymmetry_percentage   (some days only)
walking_double_support_percentage
```

**NOT included in Apple Health export:**
- Weight / body mass (this comes from Withings separately — see §2)
- Body fat %
- Bone mass, muscle mass

**How to read in code:**
```python
import json
with open("$SETLIST_INTEGRATIONS_DIR/health_auto_export/latest.json") as f:
    d = json.load(f)
metrics = {m["name"]: m for m in d["data"]["data"]["metrics"]}

# Latest HRV (7-day average)
hrv_vals = [x["qty"] for x in metrics["heart_rate_variability"]["data"]
            if x.get("qty") and x["date"] >= "2026-04-05"]
avg_hrv = round(sum(hrv_vals)/len(hrv_vals), 1)

# Yesterday's steps
cutoff = "2026-04-11"
steps = int(sum(
    float(x["qty"]) for x in metrics["step_count"]["data"]
    if x.get("date","").startswith(cutoff)
))
```

---

## 2. Withings Body Composition Scale

**OAuth app:** `https://wbsapi.withings.net/v2/oauth2`
**Auth endpoint:** `https://account.withings.com/oauth2_user/authorize2`

**Credentials (single source of truth):**
```
~/.config/openclaw/withings/
├── credentials.json   ← client_id + client_secret
└── token.json        ← access_token + refresh_token (auto-refreshed)
```

```json
{
  "client_id": "<REDACTED — see ~/.config/openclaw/withings/credentials.json>",
  "client_secret": "<REDACTED — see ~/.config/openclaw/withings/credentials.json>"
}
```

> ⚠️ **Never commit real credentials.** The actual `client_id`/`client_secret`
> live in `~/.config/openclaw/withings/credentials.json` on this machine
> only. Treat them like passwords — if either is accidentally pushed, rotate
> immediately via the Withings developer console.

**Token expiry:** Access tokens expire in 3 hours. All scripts must use the refresh token automatically — no manual re-auth needed unless refresh fails with 503.

**API endpoint:**
```
GET https://wbsapi.withings.net/v2/measure?action=getmeas&meastypes=1,6&startdate=&enddate=&timezone=Europe/Amsterdam
Authorization: Bearer {access_token}
```

**Measure types:**
- `type=1` → weight (value is in grams if unit=-3, divide by 1000 for kg)
- `type=6` → body fat % (value is permille if unit=-3, divide by 10 for %)

**Typical measurement schedule:** 2× per day (morning after waking, evening before bed)

**How to read in code:**
```python
import json, urllib.request, datetime, urllib.parse

TOKEN = "$SETLIST_INTEGRATIONS_DIR/withings/token.json"
CREDS = "$SETLIST_INTEGRATIONS_DIR/withings/credentials.json"

def get_withings_data(days=14):
    # Refresh token
    with open(CREDS) as f: c = json.load(f)
    with open(TOKEN) as f: t = json.load(f)
    body = t.get("body", t)
    access = body.get("access_token")

    start = int((datetime.datetime.now() - datetime.timedelta(days=days)).timestamp())
    end = int(datetime.datetime.now().timestamp())
    url = f"https://wbsapi.withings.net/v2/measure?action=getmeas&meastypes=1,6&startdate={start}&enddate={end}&timezone=Europe/Amsterdam"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {access}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        res = json.loads(r.read())
    return res.get("body", {}).get("measuregrps", [])
```

**Script using this pattern:**
- `~/.openclaw/scripts/withings/weekly.py` — weekly weight + body fat report

---

## 3. Oura Ring

**Token (read from file):**
```
~/.openclaw/credentials/oura_token.txt
```
Current token: `<REDACTED — read from ~/.openclaw/credentials/oura_token.txt>`

**API base:** `https://api.ouraring.com/v2/`

**Endpoints used:**
```
GET /usercollection/sleep_designation
GET /daily/sleep?start_date=&end_date=
GET /daily/readiness?start_date=&end_date=
GET /daily/activity?start_date=&end_date=
```

**Oura data path:**
```
~/.openclaw/credentials/oura_token.txt  → raw token
Scripts: ~/.openclaw/workspace/skills/oura/  → skill scripts
```

**How to read in code:**
```python
import os
token_path = os.path.expandvars("$SETLIST_INTEGRATIONS_DIR/oura/token.txt")
with open(token_path) as f:
    token = f.read().strip()
import urllib.request
req = urllib.request.Request(
    f"https://api.ouraring.com/v2/daily/sleep?start_date=2026-04-05&end_date=2026-04-11",
    headers={"Authorization": f"Bearer {token}"}
)
with urllib.request.urlopen(req, timeout=10) as r:
    data = json.loads(r.read())
```

---

## 4. Obsidian — Structured Health Data

**Obsidian vault:** `~/Documents/obsidian/`

### 4a. Training Sessions (Exercise — canonical)
```
~/Documents/obsidian/Bases/Exercise/Log/*.md
~/Documents/obsidian/Bases/Exercise/Exercise.base    ← Obsidian Bases view config
~/Documents/obsidian/Bases/Exercise/Exercise.md      ← viewer note
```
**Format:** One YAML file per exercise row (not per session).
```yaml
---
date: "2026-04-11"
session: Upper
exercise: Chest Press
weight: 27.5
sets: 3
reps: 12
difficulty: hard
section: exercise
---
```
**How to read:** Parse all `.md` files in `Bases/Exercise/Log/` → extract frontmatter fields.

### 4b. Nutrition Sessions (Food — canonical)
```
~/Documents/obsidian/Bases/Nutrition/Log/*.md
~/Documents/obsidian/Bases/Nutrition/Nutrition.base
~/Documents/obsidian/Bases/Nutrition/Nutrition.md
```
**Format:** One YAML file per eating occasion. Filename: `{date}--{HHMM}--NN.md`.
```yaml
---
date: "2026-04-11"
time: "11:15"
emoji: 🍳
protein_g: 52
foods:
  - Breakfast
  - 25g whey (~25g protein)
  - 2 brown bread slices (~8g protein)
section: nutrition
---
```
`foods[0]` is the canonical title (rendered bold in the UI). There is no separate `name` field.
**How to read:** Parse all `.md` files in `Bases/Nutrition/Log/` → group by date → sum `protein_g` per day.

### 4c. Habit Tracking (planned)
```
~/Documents/obsidian/Bases/Habits/Log/*.md             ← per-day logs
~/Documents/obsidian/Bases/Habits/habits-config.yaml   ← habit set
~/Documents/obsidian/Bases/Habits/Habits.base          ← Obsidian view config
~/Documents/obsidian/Bases/Habits/Habits.md            ← viewer note
```
**Auto-logged metrics** (from Health Auto Export + Withings) will also flow here.

---

## 5. Setlist App Backend (FastAPI — port 4445)

**Running at:** `http://127.0.0.1:4445` (configurable via `SETLIST_BACKEND_URL`)
**Frontend:** `http://127.0.0.1:4444` (Next.js)

**Currently connected to Setlist:**
- ✅ Exercise YAML → `Bases/Exercise/Log/` → backend reads → frontend charts

**NOT yet connected:**
- ❌ Withings → Setlist (weight + body fat)
- ❌ Nutrition YAML → Setlist (protein tracking)
- ❌ Health Auto Export → Setlist (auto metrics)
- ❌ Oura → Setlist (sleep/readiness)

**Target architecture for Setlist health page:**
```
GET /api/weight              → Withings API → last 30 days weight + body fat
GET /api/nutrition/entries   → Bases/Nutrition/Log/*.md → entries grouped by date
GET /api/nutrition/stats     → daily protein totals + weekly chart
GET /api/habits/auto         → Health Auto Export latest.json → HRV, steps, VO2 max
GET /api/habits/entries      → Bases/Habits/Log/*.md → manual habit log
GET /api/sleep               → Oura API → sleep efficiency, deep sleep, HRV
```

---

## 6. Credentials Summary

| Service | File | Key |
|---------|------|-----|
| Withings OAuth | `~/.config/openclaw/withings/credentials.json` | client_id + client_secret |
| Withings token | `~/.config/openclaw/withings/token.json` | access + refresh token |
| Oura API | `~/.openclaw/credentials/oura_token.txt` | bearer token |
| Apple Health webhook | running locally on `:9876` | no auth needed |

---

## 7. Key Constraints

- **No hardcoded credentials** in scripts — always read from credential files listed above
- **Token refresh** must happen automatically in scripts (3-hour expiry for Withings)
- **YAML is canonical** for exercise, nutrition, and habits — no markdown files as source of truth
- **Setlist = setlist repo** (renamed from `training-viz`, April 2026)
