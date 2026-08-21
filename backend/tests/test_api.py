import os

os.environ["ARCHVIZ_DATABASE_URL"] = "sqlite:///./test_archviz.db"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _auth(client, email="a@example.com"):
    client.post("/auth/register", json={"email": email, "password": "password123"})
    r = client.post("/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_project_roundtrip(client):
    h = _auth(client)
    doc = {"id": "x", "name": "House", "units": "m", "levels": []}
    r = client.post("/projects", json={"name": "House", "data": doc}, headers=h)
    assert r.status_code == 201
    pid = r.json()["id"]

    r = client.get(f"/projects/{pid}", headers=h)
    assert r.json()["data"] == doc

    r = client.put(f"/projects/{pid}", json={"name": "House 2", "data": doc}, headers=h)
    assert r.status_code == 204
    assert client.get("/projects", headers=h).json()[0]["name"] == "House 2"

    assert client.delete(f"/projects/{pid}", headers=h).status_code == 204
    assert client.get(f"/projects/{pid}", headers=h).status_code == 404


def test_projects_are_private(client):
    h1 = _auth(client, "one@example.com")
    h2 = _auth(client, "two@example.com")
    pid = client.post("/projects", json={"name": "P", "data": {}}, headers=h1).json()["id"]
    assert client.get(f"/projects/{pid}", headers=h2).status_code == 404
    assert client.get("/projects", headers=h2).json() == []


def test_requires_auth(client):
    assert client.get("/projects").status_code == 401
