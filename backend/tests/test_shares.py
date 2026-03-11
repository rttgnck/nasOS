"""Tests for share management endpoints."""

import pytest


@pytest.mark.asyncio
async def test_list_shares_empty(auth_client):
    """GET /api/shares should return empty list initially."""
    resp = await auth_client.get("/api/shares")
    assert resp.status_code == 200
    data = resp.json()
    assert "shares" in data
    assert isinstance(data["shares"], list)


@pytest.mark.asyncio
async def test_create_share(auth_client):
    """POST /api/shares should create a new share."""
    resp = await auth_client.post("/api/shares", json={
        "name": "test-share",
        "path": "/mnt/data/test",
        "protocol": "smb",
        "description": "Test share",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "test-share"
    assert data["protocol"] == "smb"
    assert data["id"] is not None


@pytest.mark.asyncio
async def test_create_and_list_shares(auth_client):
    """Create a share then verify it appears in the list."""
    # Create
    await auth_client.post("/api/shares", json={
        "name": "media",
        "path": "/mnt/data/media",
        "protocol": "smb",
    })

    # List
    resp = await auth_client.get("/api/shares")
    assert resp.status_code == 200
    shares = resp.json()["shares"]
    names = [s["name"] for s in shares]
    assert "media" in names


@pytest.mark.asyncio
async def test_toggle_share(auth_client):
    """POST /api/shares/{id}/toggle should flip enabled."""
    # Create
    resp = await auth_client.post("/api/shares", json={
        "name": "toggle-test",
        "path": "/mnt/data/toggle",
        "protocol": "nfs",
    })
    share_id = resp.json()["id"]

    # Toggle off
    resp = await auth_client.post(f"/api/shares/{share_id}/toggle")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    # Toggle on
    resp = await auth_client.post(f"/api/shares/{share_id}/toggle")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True


@pytest.mark.asyncio
async def test_delete_share(auth_client):
    """DELETE /api/shares/{id} should remove the share."""
    # Create
    resp = await auth_client.post("/api/shares", json={
        "name": "delete-me",
        "path": "/mnt/data/del",
        "protocol": "smb",
    })
    share_id = resp.json()["id"]

    # Delete
    resp = await auth_client.delete(f"/api/shares/{share_id}")
    assert resp.status_code == 200

    # Verify gone
    resp = await auth_client.get("/api/shares")
    names = [s["name"] for s in resp.json()["shares"]]
    assert "delete-me" not in names
