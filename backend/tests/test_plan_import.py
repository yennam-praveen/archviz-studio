import os

os.environ["ARCHVIZ_DATABASE_URL"] = "sqlite:///./test_archviz.db"

import pytest
from fastapi.testclient import TestClient

from app import plan_import
from app.db import Base, engine
from app.main import app
from app.plan_import import ExtractedPlan, XLevel, XOpening, XWall, to_project

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _auth(client):
    client.post("/auth/register", json={"email": "a@example.com", "password": "password123"})
    r = client.post("/auth/login", json={"email": "a@example.com", "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def sample_extraction() -> ExtractedPlan:
    return ExtractedPlan(
        project_name="Villa",
        units_found_on_plan="mm",
        scale_basis="dimension strings",
        confidence="high",
        levels=[XLevel(
            name="Ground floor", wall_height=2.7,
            walls=[
                XWall(start=[0, 0], end=[10, 0], thickness=0.25, external=True),
                XWall(start=[10, 0], end=[10, 8], thickness=0.25, external=True),
                XWall(start=[10, 8], end=[0, 8], thickness=0.25, external=True),
                XWall(start=[0, 8], end=[0, 0], thickness=0.25, external=True),
                XWall(start=[5, 0], end=[5, 8], thickness=0.1, external=False),
            ],
            openings=[
                XOpening(wall_index=0, type="door", offset=2, width=0.9, height=2.1, sill_height=0),
                XOpening(wall_index=2, type="window", offset=3, width=1.5, height=1.2, sill_height=0.9),
                XOpening(wall_index=99, type="window", offset=1, width=1, height=1, sill_height=1),  # dangling -> dropped
            ],
        )],
        rooms=[],
        warnings=["Wall heights assumed 2.7 m"],
    )


def test_to_project_shape():
    p = to_project(sample_extraction())
    lvl = p["levels"][0]
    assert len(lvl["walls"]) == 5 and len(lvl["openings"]) == 2
    assert lvl["openings"][0]["wallId"] == lvl["walls"][0]["id"]
    assert lvl["floors"][0]["polygon"] == [[0, 0], [10, 0], [10, 8], [0, 8]]
    assert lvl["roof"]["type"] == "gable"
    assert lvl["walls"][0]["material"] == "plaster_warm" and lvl["walls"][4]["material"] == "plaster"
    assert p["sun"]["latitude"] == -20.2


def test_import_endpoint_with_stubbed_model(client, monkeypatch):
    captured = {}

    def fake_extract(data, media_type, width_m, depth_m, notes):
        captured.update(size=len(data), media_type=media_type, width_m=width_m, notes=notes)
        return sample_extraction()

    monkeypatch.setattr(plan_import, "extract_plan", fake_extract)
    h = _auth(client)
    r = client.post(
        "/import/plan",
        files={"file": ("plan.png", PNG_1PX, "image/png")},
        data={"width_m": "10", "notes": "two bedrooms"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stats"] == {"levels": 1, "walls": 5, "openings": 2}
    assert body["confidence"] == "high" and body["warnings"] == ["Wall heights assumed 2.7 m"]
    assert captured == {"size": len(PNG_1PX), "media_type": "image/png", "width_m": 10.0, "notes": "two bedrooms"}


def test_import_rejects_bad_type_and_requires_auth(client):
    h = _auth(client)
    r = client.post("/import/plan", files={"file": ("plan.txt", b"hello", "text/plain")}, headers=h)
    assert r.status_code == 415
    assert client.post("/import/plan", files={"file": ("plan.png", PNG_1PX, "image/png")}).status_code == 401


def test_import_without_api_key_is_503(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    h = _auth(client)
    r = client.post("/import/plan", files={"file": ("plan.png", PNG_1PX, "image/png")}, headers=h)
    assert r.status_code == 503
