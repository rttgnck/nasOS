from fastapi import APIRouter

from app.services.network_service import get_network_info, get_services_status

router = APIRouter(prefix="/api/network", tags=["network"])


@router.get("")
async def network_info():
    """Get network configuration and interfaces."""
    return get_network_info()


@router.get("/services")
async def services_status():
    """Get status of key NAS services."""
    return {"services": get_services_status()}
