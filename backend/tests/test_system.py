"""Tests for system endpoints."""

import pytest


@pytest.mark.asyncio
async def test_health(client):
    """GET /api/system/health should return 200 without auth."""
    resp = await client.get("/api/system/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_system_info(auth_client):
    """GET /api/system/info requires auth and returns system info."""
    resp = await auth_client.get("/api/system/info")
    assert resp.status_code == 200
    data = resp.json()
    assert "hostname" in data
    assert "platform" in data


@pytest.mark.asyncio
async def test_system_metrics(auth_client):
    """GET /api/system/metrics requires auth and returns metrics."""
    resp = await auth_client.get("/api/system/metrics")
    assert resp.status_code == 200
    data = resp.json()
    # Metrics are nested under cpu, memory, etc.
    assert "cpu" in data
    assert "memory" in data
    assert "percent" in data["cpu"]
