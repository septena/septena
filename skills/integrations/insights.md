---
name: septena-insights
description: Derived cross-section patterns — Septena's Insights section correlates multiple sections (sleep vs. nutrition, training volume vs. HRV, cannabis vs. sleep) using Pearson r + linear fits. There is no stored insights data; it's computed on the fly.
---

# Septena · Insights (derived)

The Insights section computes cross-section correlations live — nothing
is stored. For agents, this means "running an insight" = fetching the
source sections and doing the same stats yourself (or letting the
frontend do it via `/insights`).

## When to use this skill

- User asks "is X correlated with Y?" across sections.
- User wants a trend line fit, a scatter plot, or a Pearson r value.
- User asks "what affects my sleep?" or "what affects my HRV?"

## There is no `/api/insights` endpoint

Insights is a frontend-only view that calls these source endpoints and
computes correlations in the browser:

| Source endpoint | Used for |
|---|---|
| `GET /api/health/combined?days=N` | Sleep, HRV, weight, steps |
| `GET /api/entries` | Exercise entries (training volume) |
| `GET /api/cannabis/history?days=N` | Cannabis sessions per day |
| `GET /api/nutrition/stats?days=N` | Daily protein / kcal / fasting |

If you're doing cross-section analysis, hit those directly and merge by
`date`. Every section's output includes a `date` key.

## The stats recipe

The app uses **Pearson's r** + least-squares linear fit with a minimum
of 3 paired samples. Pseudocode:

```python
def correlate(x_series, y_series):
    # Pair up same-date samples, drop nulls on either side
    pairs = [(x, y) for x, y in zip(x_series, y_series) if x is not None and y is not None]
    if len(pairs) < 3: return None
    xs, ys = zip(*pairs)
    # ...Pearson r + slope/intercept...
```

Interpretation labels the app uses:

- `|r| < 0.2` → weak
- `|r| < 0.5` → moderate
- `|r| ≥ 0.5` → strong

Positive r = both go up together; negative = one up, other down.

## Built-in correlations the UI shows

These are the patterns the Insights dashboard already computes — mirror
them for consistency when asked.

| Pair | x (cause) | y (effect) | Question |
|---|---|---|---|
| Training volume vs. HRV | daily strength volume from `/api/entries` | `hrv` from `/api/health/combined` | Does training tank HRV? |
| Cannabis vs. sleep score | daily session count from `/api/cannabis/history` | `sleep_score` from `/api/health/combined` | Does cannabis help or hurt sleep? |
| Sleep vs. exercise | `total_h` from Oura | next-day training volume or exercise minutes | Does good sleep fuel training? |
| Protein vs. training | `protein_g` from `/api/nutrition/stats` | daily strength volume | Does high-protein day → bigger session? |
| Kcal vs. weight | `kcal` from nutrition | `weight_kg` from Withings (7d rolling) | Energy balance |

## File-only approach

If the app isn't running, you can still compute correlations — read the
vault files directly, merge by `date`, and apply the same Pearson math.
The section `SKILL.md`s document how to read each section from files.

## Example interactions

- **"Does cannabis affect my sleep score?"** → fetch 60d of
  `/api/cannabis/history` and `/api/health/combined`, pair by date
  (previous-night's session count → that date's sleep_score), compute r.
- **"Is my HRV dropping when I train harder?"** → aggregate strength
  volume per day from `/api/entries`, pair with next-day `hrv` (HRV
  effects typically lag by 12-24h), compute r.
- **"What's the strongest correlation with my sleep score?"** → compute
  r between `sleep_score` and each of: previous-day kcal, previous-day
  cannabis count, previous-day caffeine count after 14:00, previous-day
  training volume. Rank by `|r|`.

## Scope and caveats

- **Correlation ≠ causation.** Always frame results as "associated
  with" not "caused by."
- **Small sample sizes are noisy.** `r = 0.8` on 5 points means little.
  Note sample size alongside r.
- **Time lag matters.** HRV and sleep respond to yesterday's behavior,
  not today's. When pairing series, offset by one day where biologically
  plausible.
- **Missing data is signal.** Don't impute — just drop pairs where
  either side is null.
