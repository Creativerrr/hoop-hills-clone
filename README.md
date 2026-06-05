# Hoop Hills — clone

**Live:** https://creativerrr.github.io/hoop-hills-clone/

A from-scratch rebuild of Vinicius Sueiro's **Hoop Hills** (https://vsueiro.com/hoop-hills/) —
an orthographic 3D data-art piece showing the score evolution of every NBA game in a season.
Each game is a ridge; **blue = team leading, red = trailing**. The orthographic camera makes it
read as three charts at once (front = line chart, side = bar chart, top = heatmap).

## Stack (same as the original)
- **Three.js r0.176** (ES modules via importmap) + **d3@7** — single WebGL2 canvas.
- No framework/bundler. Pure ES-module class app.

## Architecture
- `index.html` → `scripts/index.js` → `App`
- `App` (orchestrator) → `Data` (d3 CSV → games), `World` (3D engine)
- `World` → orthographic camera + OrbitControls (idle auto-rotate) + raycaster hover
  - `World/Hills.js` — **the core**: each game → a vertex-colored step-ridge, clipped to active periods
  - `World/Floor.js` — court grid at the y=0 baseline

## Features (built core-first, then iterated)
- Orthographic terrain, real NBA data, **all 30 teams** (2026 season)
- Light arena theme + court grid floor
- Filters: **team**, **opponent**, **rounds** (RS/Play-In/Playoffs), **periods** (Q1–4/OT, clips the time axis)
- **Hover tooltips** (raycaster) — date, W/L, score, biggest lead/trail
- **Season stats** panel — record, biggest win, biggest comeback, worst collapse
- Idle auto-rotate

## Data
Per-team-season CSVs in `data/{TEAM}-2026.csv` (one row per scoring moment). Pulled from the
original's public files; columns: `id,type,opponent,elapsedTime,event,teamScore,opponentScore,pointDifference`.

## Run
```
python3 -m http.server 8899   # or any static server
open http://localhost:8899
```

## Build notes
Reverse-engineered + rebuilt with a Playwright self-driving loop (edit → serve → screenshot → verify).
The loop caught real regressions: an opaque floor occluding the red trails, and stale browser cache.
See INVESTIGATION.md for the full teardown of how the original works.
