# ArchViz Studio

Browser-based tool for architects: type dimensions → 2D plan → instant 3D model, with
photorealistic stills, glTF export and Android AR planned in later phases.

## Stack

- **Frontend** `frontend/` — Vite + React + TypeScript, Three.js via react-three-fiber,
  Konva for the 2D plan, Zustand for state, three-bvh-csg for cutting openings.
- **Backend** `backend/` — FastAPI + SQLAlchemy (SQLite in dev, Postgres in prod), bcrypt + JWT auth.

## Run (development)

Backend:

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate     # Windows; use source .venv/bin/activate elsewhere
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (second terminal):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The app loads a sample house; register an account in the top bar to save projects.

Tests: `cd backend && pytest`.

## Data model

Everything renders from one JSON document (`frontend/src/model/types.ts`):

```
Project → Level[] → Wall[] (start, end, thickness, height)
                  → Opening[] (wallId, door|window, offset, width, height, sillHeight)
                  → Floor[] (polygon)
```

Plan coordinates are metres, x = east, y = north. In 3D, plan `y` maps to `-z`.
The 2D plan and the 3D scene are both pure renderers of this document — that is what will make
VR/AR "free" later: the same scene, a different camera.

## Roadmap

| Phase | Scope |
|---|---|
| 1 ✅ | Dimension input, 2D plan with snapping, 3D extrusion with openings, save/load, auth |
| 2 ✅ | Material presets, physical sky + sun/shadow study, N8AO/SMAA post-processing, multi-storey levels, flat/gable/hip roofs, first-person walk |
| 3 | Path-traced "Render image" (three-gpu-pathtracer), glTF/USDZ export, PDF plan |
| 4 | Android WebXR AR: tabletop scale model, then 1:1 on-site placement |

## Phase 2 notes

- **Sun study** (`src/model/sun.ts`): declination + hour-angle model, ~1° accuracy. Latitude defaults to
  Mauritius (−20.2°); set *North offset* to rotate the plan's +Y away from true north.
- **Roofs** cover the level's bounding box (rectangular). Ridge runs along the longer axis.
- **Levels** stack automatically; each new level copies the outline below and takes over the roof.
- **Walk mode**: WASD + mouse-look at 1.6 m eye height, Shift to run, Esc to release the pointer. No collision yet.
- **Materials** are procedural PBR values (no texture files → nothing to license). Phase 3 can add CC0 maps.

## Known limitations (deliberate)

- Orthogonal walls are the tested path; angled walls render but plan editing is by coordinates only.
- Floor = bounding box of all walls ("Rebuild floor" button). Proper room detection is a phase-3 item.
- Wall joints are butt joints; mitred corners are a phase-3 polish item.
- Tables are created with `create_all`; add Alembic before deploying to Postgres.
- `ARCHVIZ_JWT_SECRET` **must** be set in production (see `backend/app/config.py`).
