# Insights

Cross-section correlations and patterns — does caffeine after 3pm hurt
deep sleep? Do gym days line up with higher HRV the next morning?

> Work in progress. Screenshot coming once the view stabilizes.

## What it does

- **Correlates any two sections** — sleep score × caffeine timing, HRV × training load, protein intake × recovery, etc.
- **Derived, not stored** — nothing lives in the vault for this section. Every chart is computed on demand from the other sections' YAML.

## Status

This is the newest section and the shape is still evolving. Expect rough edges and more correlations landing over time.

## Route

Frontend path is `/insights` (registered under the `correlations` key in [`api/routers/sections.py`](../../api/routers/sections.py)).
