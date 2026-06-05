# Hoop Hills — Investigation (how it's built)

Source: https://vsueiro.com/hoop-hills/ · writeup: https://vsueiro.com/work/basketball (by Vinicius Sueiro)

## The concept (the genius)
A single 3D structure viewed with an **orthographic camera** so it reads as **three charts at once**:
- **Front view** → line chart (lead/trail over the course of each game)
- **Side view** → bar chart (final point differentials)
- **Top view** → heat map (when leads were lost, esp. Q4)
Orthographic = no perspective shrink, so far games are the same size as near ones → "a fair visual comparison, like a chart should."

Each **game = one "hill"** (a ribbon/wall): the score-difference step-function over time, extruded to a depth. **Blue above 0** (team leading), **red below 0** (trailing). Games lined up along the depth axis form the terrain of peaks (blowout wins) and valleys (losses).

## Tech stack (confirmed by inspecting the live site)
- **Three.js r0.176** (ES module via importmap from jsdelivr) + **d3@7** (CSV load + scales)
- Single **WebGL2** canvas; a 2D canvas overlay (`Renderer2D`) for labels/tooltips
- Pure ES-module app, no framework/bundler. Entry: `scripts/index.js` → `new App()`

## Architecture (modular — ~25 classes)
**App** → Filters, Data, World, Stories, Stats, Videos
**World** (the 3D engine) → Scene, **Camera** (OrthographicCamera + Spherical positioning), Controls, Renderer (WebGL), Renderer2D, DeltaTime, Idle, Palette, Materials (MeshBasicMaterial), Geometries (Box/Cylinder/Plane for UI), Environment (sky sphere), Pointer, Raycaster, Summaries, **Hills**, Labels, Tooltips, Floor (arena floor texture), Seats.

## The core geometry algorithm (`World/Hills.js` + `Hill.js`)
Constants:
- `widthPerSecond = 100 / 2880` → a 48-min game (2880s) maps to width 100 units (X axis = game time)
- `heightPerPoint = 0.75` → Y = pointDifference × 0.75
- `hillDepth` per game; games stacked along Z by `order`: `depth = hillDepth*0.5 + (hillDepth+gap)*order`
Each `Hill` = a Mesh built from the play-by-play step series (pointDifference vs elapsedTime), as a vertical ribbon/wall with depth, vertex-colored blue (+) / red (−) at the y=0 split. Plus a Shadow and lead-change Lines.

## Data format
Per-team-per-season CSV: `data/seasons/{season}/{TEAM}.csv` — one row per scoring moment:
`id,type,opponent,elapsedTime,event,teamScore,opponentScore,pointDifference`
- `id` = date+team (e.g. 202510220ORL); `type` = RS/PI/PO; `event` = T(tie)/LC(lead change)/F(final)
- A game = many rows; `pointDifference` (team − opponent) over `elapsedTime` (seconds) is the hill profile.
Aux: `periods.csv` (Q1=0, Q2=720, Q3=1440, Q4=2160, OT=2880), `teams/{season}.csv`, `highlights/{season}.csv`.

## Interactions
Your-team selector, opponent filter, period toggles (Q1–4/OT), round toggles (RS/Play-In/Playoffs), date range, sort-by, hover tooltips (raycaster), annotated "stories" (biggest lead/trail/comeback, most lead changes), highlight videos, idle auto-rotate.

## Rebuild advantage
This is WEB — so I have a **self-driving loop**: write code → local server → Playwright screenshot → verify. No human-in-the-loop needed (unlike Tableau). Same stack (Three.js + d3) is the right call.
