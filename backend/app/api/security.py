from fastapi import APIRouter

from app.services.security_service import (
    get_2fa_config,
    get_fail2ban_status,
    get_firewall_rules,
    get_security_overview,
    get_ssh_config,
    get_tls_config,
)

router = APIRouter(prefix="/api/security", tags=["security"])


@router.get("/overview")
async def security_overview():
    """Security dashboard overview with score and issues."""
    return get_security_overview()


@router.get("/tls")
async def tls_config():
    return get_tls_config()


@router.get("/2fa")
async def two_factor_config():
    return get_2fa_config()


@router.get("/fail2ban")
async def fail2ban_status():
    return get_fail2ban_status()


@router.get("/firewall")
async def firewall_rules():
    return get_firewall_rules()


@router.get("/ssh")
async def ssh_config():
    return get_ssh_config()
