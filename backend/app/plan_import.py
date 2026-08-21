"""
Plan import: turn an uploaded floor-plan image/PDF into the app's Project JSON using Claude vision.

The model returns a strictly-typed extraction (walls as centre-line segments in metres, openings
attached to walls). We convert that into the frontend document shape. The architect then checks
the result against the plan image, which the frontend lays under the 2D editor.
"""
from __future__ import annotations

import base64
import os
import secrets
from typing import Literal

import anthropic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from .auth import current_user
from .models import User

router = APIRouter(prefix="/import", tags=["import"])

MODEL = "claude-opus-5"
MAX_BYTES = 20 * 1024 * 1024
ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"}


# --- What we ask Claude to extract -------------------------------------------------------------

class XWall(BaseModel):
    start: list[float] = Field(description="[x, y] in metres; x east, y north; origin at the plan's bottom-left corner")
    end: list[float] = Field(description="[x, y] in metres")
    thickness: float = Field(description="wall thickness in metres (external typically 0.2-0.3, internal 0.1-0.15)")
    external: bool = Field(description="true if this is part of the outer envelope")


class XOpening(BaseModel):
    wall_index: int = Field(description="index into the walls array of this level")
    type: Literal["door", "window"]
    offset: float = Field(description="metres from the wall's start point to the opening's nearest edge")
    width: float = Field(description="metres")
    height: float = Field(description="metres; doors ~2.1, windows ~1.2 unless the plan says otherwise")
    sill_height: float = Field(description="metres above floor; 0 for doors, ~0.9 for windows")


class XLevel(BaseModel):
    name: str
    wall_height: float = Field(description="floor-to-ceiling height in metres; 2.7 if unknown")
    walls: list[XWall]
    openings: list[XOpening]


class XRoom(BaseModel):
    name: str
    approx_area_m2: float


class ExtractedPlan(BaseModel):
    project_name: str
    units_found_on_plan: Literal["mm", "cm", "m", "ft", "none"]
    scale_basis: str = Field(description="one sentence: what you used to establish real-world scale")
    confidence: Literal["high", "medium", "low"]
    levels: list[XLevel]
    rooms: list[XRoom]
    warnings: list[str] = Field(description="anything uncertain or guessed that the architect should check")


SYSTEM = """You convert architectural floor plans into precise wall geometry.

Coordinate system: metres, x increases to the right (east), y increases upward (north), origin at the
bottom-left of the building footprint. Walls are centre-line segments. Keep walls axis-aligned when the
plan is orthogonal; snap coordinates to 0.05 m. Walls that meet must share exact endpoint coordinates.
Split a wall wherever another wall joins it only if needed for openings; otherwise one segment per straight run.

Scale: use dimension strings on the plan first (mm on most plans). If there are none, use a scale bar,
a stated scale with the page size, or standard door widths (0.8-0.9 m) as the last resort, and say so in
scale_basis with lower confidence. If the user supplies overall dimensions, those take precedence.

Openings: attach each door/window to the wall it sits in, measured from that wall's start point.
Do not invent features that are not drawn. Put every assumption in warnings."""


def _hint_text(width_m: float | None, depth_m: float | None, notes: str | None) -> str:
    parts = []
    if width_m:
        parts.append(f"The building's overall external width (east-west) is {width_m} m.")
    if depth_m:
        parts.append(f"The building's overall external depth (north-south) is {depth_m} m.")
    if notes:
        parts.append(f"Notes from the architect: {notes}")
    return " ".join(parts)


def extract_plan(data: bytes, media_type: str, width_m: float | None, depth_m: float | None, notes: str | None) -> ExtractedPlan:
    """Single vision call with a schema-constrained response. Separated so tests can stub it."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Plan import needs ANTHROPIC_API_KEY set on the server.")
    client = anthropic.Anthropic()
    b64 = base64.standard_b64encode(data).decode()
    if media_type == "application/pdf":
        file_block = {"type": "document", "source": {"type": "base64", "media_type": media_type, "data": b64}}
    else:
        file_block = {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}}

    prompt = "Extract the floor plan into wall geometry. " + _hint_text(width_m, depth_m, notes)
    response = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        system=SYSTEM,
        output_config={"effort": "high"},
        messages=[{"role": "user", "content": [file_block, {"type": "text", "text": prompt.strip()}]}],
        output_format=ExtractedPlan,
    )
    if response.stop_reason == "refusal":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The model declined to process this file.")
    if response.parsed_output is None:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The model returned no structured result; try again.")
    return response.parsed_output


# --- Convert to the frontend Project document -------------------------------------------------

def _uid() -> str:
    return secrets.token_hex(4)


def to_project(x: ExtractedPlan) -> dict:
    levels = []
    elevation = 0.0
    for lvl in x.levels:
        wall_ids: list[str] = []
        walls = []
        for w in lvl.walls:
            wid = _uid()
            wall_ids.append(wid)
            walls.append({
                "id": wid,
                "start": [round(w.start[0], 3), round(w.start[1], 3)],
                "end": [round(w.end[0], 3), round(w.end[1], 3)],
                "thickness": max(0.05, w.thickness),
                "height": lvl.wall_height,
                "material": "plaster_warm" if w.external else "plaster",
            })
        openings = []
        for o in lvl.openings:
            if 0 <= o.wall_index < len(wall_ids):
                openings.append({
                    "id": _uid(), "wallId": wall_ids[o.wall_index], "type": o.type,
                    "offset": max(0.0, o.offset), "width": o.width, "height": o.height, "sillHeight": o.sill_height,
                })
        xs = [c for w in walls for c in (w["start"][0], w["end"][0])]
        ys = [c for w in walls for c in (w["start"][1], w["end"][1])]
        floors = []
        if xs:
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            floors = [{"id": _uid(), "polygon": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "material": "concrete_floor"}]
        levels.append({
            "id": _uid(), "name": lvl.name, "elevation": elevation, "height": lvl.wall_height,
            "walls": walls, "openings": openings, "floors": floors,
        })
        elevation += lvl.wall_height
    if levels:
        levels[-1]["roof"] = {"type": "gable", "pitch": 25, "overhang": 0.5, "thickness": 0.25, "material": "roof_tile"}
    return {
        "id": _uid(), "name": x.project_name or "Imported plan", "units": "m", "levels": levels,
        "sun": {"latitude": -20.2, "month": 6, "day": 21, "hour": 14, "northOffset": 0},
    }


class ImportOut(BaseModel):
    project: dict
    confidence: str
    scale_basis: str
    units_found_on_plan: str
    rooms: list[XRoom]
    warnings: list[str]
    stats: dict


@router.post("/plan", response_model=ImportOut)
async def import_plan(
    file: UploadFile = File(...),
    width_m: float | None = Form(None),
    depth_m: float | None = Form(None),
    notes: str | None = Form(None),
    _: User = Depends(current_user),
):
    media_type = (file.content_type or "").split(";")[0].strip().lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    if media_type not in ALLOWED:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Unsupported file type {media_type!r}; use PNG, JPEG, WebP or PDF.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File larger than 20 MB.")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file.")

    try:
        extracted = extract_plan(data, media_type, width_m, depth_m, notes)
    except anthropic.RateLimitError:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Model rate limit hit; try again in a minute.")
    except anthropic.APIStatusError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Model API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the model API.")

    project = to_project(extracted)
    stats = {
        "levels": len(project["levels"]),
        "walls": sum(len(l["walls"]) for l in project["levels"]),
        "openings": sum(len(l["openings"]) for l in project["levels"]),
    }
    return ImportOut(
        project=project, confidence=extracted.confidence, scale_basis=extracted.scale_basis,
        units_found_on_plan=extracted.units_found_on_plan, rooms=extracted.rooms,
        warnings=extracted.warnings, stats=stats,
    )
