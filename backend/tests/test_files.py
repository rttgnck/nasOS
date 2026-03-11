"""Tests for file management endpoints."""

import pytest


@pytest.mark.asyncio
async def test_list_files(auth_client):
    """GET /api/files/list should return directory contents."""
    resp = await auth_client.get("/api/files/list")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data
    assert isinstance(data["entries"], list)


@pytest.mark.asyncio
async def test_list_files_with_path(auth_client):
    """GET /api/files/list?path=. should work."""
    resp = await auth_client.get("/api/files/list?path=.")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data


@pytest.mark.asyncio
async def test_file_tree(auth_client):
    """GET /api/files/tree should return directory tree."""
    resp = await auth_client.get("/api/files/tree")
    assert resp.status_code == 200
    data = resp.json()
    # API returns {path, children} at root level
    assert "children" in data
    assert isinstance(data["children"], list)


@pytest.mark.asyncio
async def test_list_files_unauthorized(client):
    """File list should require auth."""
    resp = await client.get("/api/files/list")
    assert resp.status_code == 401
