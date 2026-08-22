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
| 3 ✅ | "Render image" with two engines (fast rasterized / photoreal path-traced), glTF + USDZ export, dimensioned PDF plans |
| 4 ✅ | Phone hand-off (share link + QR) and Android WebXR AR viewer: tabletop scale model and 1:1 on-site placement with anchors |

## Phase 2 notes

- **Sun study** (`src/model/sun.ts`): declination + hour-angle model, ~1° accuracy. Latitude defaults to
  Mauritius (−20.2°); set *North offset* to rotate the plan's +Y away from true north.
- **Roofs** cover the level's bounding box (rectangular). Ridge runs along the longer axis.
- **Levels** stack automatically; each new level copies the outline below and takes over the roof.
- **Walk mode**: WASD + mouse-look at 1.6 m eye height, Shift to run, Esc to release the pointer. No collision yet.
- **Materials** are procedural PBR values (no texture files → nothing to license). Phase 3 can add CC0 maps.

## Phase 3 notes

- **Render image** (`src/components/RenderDialog.tsx`) renders from the current 3D viewpoint at up to 4K.
  - *Fast* engine (`src/export/rasterRender.ts`): soft shadows, sky gradient, 2× supersampling; ~1 s on any GPU.
  - *Photoreal* engine: `three-gpu-pathtracer`, progressive; 200–1500 samples. Needs a real GPU. The first
    run compiles a very large shader (1–3 min on laptops). **Known driver issue:** Intel integrated GPUs on
    Windows via ANGLE/Direct3D11 miscompile the shader and output pure black — the dialog detects this
    after 8 samples and falls back to the fast engine automatically. Launching Chrome with
    `--use-angle=gl` or using a discrete GPU avoids it.
- **Export menu**: `.glb` (Blender/Twinmotion/SketchUp for hero renders), `.usdz` (iPhone AR Quick Look),
  `.pdf` A3 plan sheets (one per level, auto scale, wall dimension strings in mm, door swings, title block,
  scale bar, north arrow), `.json` project file. All three 3D/2D exports are built from the same
  `src/model/buildScene.ts` so they always agree with the viewport.

## Phase 4 notes — phone / AR

- **Hand-off**: *Phone / AR* in the toolbar creates a read-only share link (`POST /projects/{id}/share`, revocable)
  and shows it as a QR code. The phone opens `/?ar=<token>`, which loads the project from the public
  `GET /shared/{token}` endpoint — no login needed on the phone. The token is 32 random URL-safe chars.
- **AR viewer** (`src/ar/ARView.tsx`, `@react-three/xr`): Android Chrome only (WebXR `immersive-ar`).
  Hit-test reticle → tap to place → WebXR **anchor** so the model holds position. Two modes:
  *Tabletop* (1:200 … 1:20 scale model on any flat surface; reliable) and *On-site 1:1*.
  Rotate in 15° steps, *Re-place* to re-anchor (tracking drifts over a few minutes outdoors — keep
  sessions short and re-anchor rather than trusting a 10-minute-old anchor), *Exit AR*.
- Browsers without WebXR (iPhone, desktop) get an orbitable 3D preview from the same link; iPhone AR is
  served by the `.usdz` export instead.
- **Testing on a phone**: WebXR needs HTTPS. `npm run dev:lan` serves HTTPS on your LAN IP with a
  self-signed certificate (accept the warning once on the phone); set `VITE_API_URL` to the backend's LAN
  address and add that origin to `ARCHVIZ_CORS_ORIGINS`. For real use, deploy both behind a proper HTTPS host.
- Not yet verified on a device in this repo — the code paths were exercised in a desktop browser up to
  session start. First on-device test should check: reticle appears on floor/table, tap places, model scale
  reads correctly, Re-place works, Exit returns to the page.

## Plan import (Claude vision)

*Import plan* in the toolbar accepts a PNG/JPEG/WebP/PDF floor plan — a scan or even a phone photo of a
paper drawing. The backend (`backend/app/plan_import.py`) sends it to Claude (`claude-opus-5`) with a
schema-constrained response (`messages.parse` + a Pydantic `ExtractedPlan`): walls as centre-line
segments in metres, openings attached to walls, detected units, a scale rationale, confidence and a list
of warnings. It is converted to the project document, previewed (wall/opening counts, rooms, warnings)
and applied with one click. The uploaded image is then shown **under the 2D editor** (opacity, width and
position controls in the panel) so the architect can line it up and correct any wall the model got wrong.

- Requires `ANTHROPIC_API_KEY` in the backend environment; without it the endpoint returns 503 with a clear message.
- Give the overall width/depth in the dialog when you know them — the model then scales exactly instead of
  reading dimension strings.
- Typical run: 20–90 s per plan. The model is good at orthogonal plans with dimension strings; expect to fix
  a few walls on hand sketches or low-resolution photos. Curved walls are not supported by the data model.
- Tested with a stubbed model in `backend/tests/test_plan_import.py`; the live call was not exercised in this repo.

## Help video

*? Help* in the toolbar (opens automatically on first visit) plays an 85-second walkthrough of the app,
`frontend/public/tutorial/how-to-use.mp4`, with a written step list underneath. The video is a real screen
recording produced by `frontend/scripts/record-tutorial.mjs` (Playwright drives the live app and burns in
captions). To re-record after UI changes: start the dev server and backend, then `node scripts/record-tutorial.mjs`.

## Phone layout, PWA and Android APK

- **Responsive**: under 800 px the app switches to a phone layout — one view at a time (Edit / Plan / 3D tabs),
  a compact toolbar with login in an *Account* dropdown, full-screen dialogs, larger touch targets.
- **PWA**: `vite-plugin-pwa` generates `manifest.webmanifest` + a service worker, so Chrome offers
  *Add to Home screen* and the app shell works offline (the tutorial video is fetched on demand).
- **Android APK**: `.github/workflows/android.yml` builds a **Trusted Web Activity** with Bubblewrap from
  `twa-manifest.json`. A TWA launches Chrome full-screen on the hosted site, so WebXR AR, camera and
  every other feature work exactly as in the browser, and the app updates itself with each Pages deploy.
  Run the workflow from the Actions tab (or push a `v*` tag to also publish a GitHub Release) and download
  `ArchVizStudio.apk`. The committed `android.keystore` is a **test signing key** — before a Play Store
  release generate a private one and keep it in a secret. `frontend/public/.well-known/assetlinks.json`
  carries the key's SHA-256 so Android hides the browser bar; regenerate it if the key changes.

## Hosting

- **Frontend**: GitHub Pages via `.github/workflows/pages.yml` → https://yennam-praveen.github.io/archviz-studio/
  (`/?ar=demo` opens the AR viewer with the sample house, no backend needed). The build reads the repository
  variable `VITE_API_URL` for the backend address.
- **Backend**: Render via `render.yaml` (Docker web service + free Postgres). Dashboard → *New → Blueprint* →
  pick this repo; paste `ANTHROPIC_API_KEY` when prompted (optional, enables plan import). Free tier spins down
  after 15 min idle — the first request then takes ~30 s. `ARCHVIZ_CORS_ORIGINS` must list the Pages origin.
- Schema is created with `create_all` on a fresh database. Adding columns later needs a migration step
  (Alembic) — the SQLite `ALTER TABLE` shim in `main.py` is dev-only.

## Known limitations (deliberate)

- Orthogonal walls are the tested path; angled walls render but plan editing is by coordinates only.
- Floor = bounding box of all walls ("Rebuild floor" button). Proper room detection is a phase-3 item.
- Wall joints are butt joints; mitred corners are a phase-3 polish item.
- Tables are created with `create_all`; add Alembic before deploying to Postgres.
- `ARCHVIZ_JWT_SECRET` **must** be set in production (see `backend/app/config.py`).
