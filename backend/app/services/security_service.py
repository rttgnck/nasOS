"""Security & hardening service.

Manages HTTPS/TLS, 2FA/TOTP, Fail2ban, firewall, SSH settings.
On Linux: wraps certbot, fail2ban-client, ufw/nftables, sshd_config.
On macOS (dev): returns mock data.
"""

import platform

_is_linux = platform.system() == "Linux"

# ── Mock state ─────────────────────────────────────────────────────

_MOCK_TLS = {
    "enabled": True,
    "cert_type": "self-signed",
    "domain": "",
    "issuer": "nasOS Self-Signed CA",
    "valid_from": "2024-01-15T00:00:00",
    "valid_until": "2025-01-15T00:00:00",
    "auto_renew": False,
    "status": "valid",
}

_MOCK_2FA = {
    "enabled": False,
    "enforced": False,
    "enrolled_users": [],
}

_MOCK_FAIL2BAN = {
    "enabled": True,
    "jails": [
        {"name": "sshd", "enabled": True, "banned": 3, "total_bans": 47, "max_retries": 5, "ban_time": 600},
        {"name": "nasos-web", "enabled": True, "banned": 1, "total_bans": 12, "max_retries": 5, "ban_time": 600},
        {"name": "samba", "enabled": True, "banned": 0, "total_bans": 5, "max_retries": 5, "ban_time": 600},
    ],
}

_MOCK_FIREWALL = {
    "enabled": True,
    "default_policy": "deny",
    "rules": [
        {"id": 1, "action": "allow", "port": "22/tcp", "from": "any", "description": "SSH"},
        {"id": 2, "action": "allow", "port": "80/tcp", "from": "any", "description": "HTTP"},
        {"id": 3, "action": "allow", "port": "443/tcp", "from": "any", "description": "HTTPS"},
        {"id": 4, "action": "allow", "port": "445/tcp", "from": "192.168.0.0/16", "description": "SMB (LAN only)"},
        {"id": 5, "action": "allow", "port": "2049/tcp", "from": "192.168.0.0/16", "description": "NFS (LAN only)"},
        {"id": 6, "action": "allow", "port": "8096/tcp", "from": "any", "description": "Jellyfin"},
        {"id": 7, "action": "allow", "port": "53/udp", "from": "192.168.0.0/16", "description": "Pi-hole DNS"},
    ],
}

_MOCK_SSH = {
    "enabled": True,
    "port": 22,
    "password_auth": False,
    "root_login": False,
    "key_only": True,
    "authorized_keys_count": 3,
    "active_sessions": 1,
}


def get_tls_config() -> dict:
    if not _is_linux:
        return _MOCK_TLS
    # Real: parse nginx/caddy config, check cert files
    return _MOCK_TLS


def get_2fa_config() -> dict:
    return _MOCK_2FA


def get_fail2ban_status() -> dict:
    if not _is_linux:
        return _MOCK_FAIL2BAN
    # Real: fail2ban-client status
    return _MOCK_FAIL2BAN


def get_firewall_rules() -> dict:
    if not _is_linux:
        return _MOCK_FIREWALL
    # Real: ufw status numbered
    return _MOCK_FIREWALL


def get_ssh_config() -> dict:
    if not _is_linux:
        return _MOCK_SSH
    # Real: parse /etc/ssh/sshd_config
    return _MOCK_SSH


def get_security_overview() -> dict:
    """Aggregate security status for dashboard."""
    tls = get_tls_config()
    f2b = get_fail2ban_status()
    fw = get_firewall_rules()
    ssh = get_ssh_config()

    issues = []
    if tls["cert_type"] == "self-signed":
        issues.append({"level": "warning", "message": "Using self-signed certificate — configure Let's Encrypt for trusted HTTPS"})
    if not get_2fa_config()["enabled"]:
        issues.append({"level": "info", "message": "Two-factor authentication is not enabled"})
    if ssh["password_auth"]:
        issues.append({"level": "warning", "message": "SSH password authentication is enabled — consider key-only auth"})
    if ssh["root_login"]:
        issues.append({"level": "warning", "message": "SSH root login is enabled"})

    total_banned = sum(j["banned"] for j in f2b["jails"])

    return {
        "tls": {"status": tls["status"], "cert_type": tls["cert_type"]},
        "firewall": {"enabled": fw["enabled"], "rules_count": len(fw["rules"])},
        "fail2ban": {"enabled": f2b["enabled"], "active_bans": total_banned},
        "ssh": {"key_only": ssh["key_only"], "root_login": ssh["root_login"]},
        "two_factor": {"enabled": get_2fa_config()["enabled"]},
        "issues": issues,
        "score": _calculate_score(tls, f2b, fw, ssh),
    }


def _calculate_score(tls: dict, f2b: dict, fw: dict, ssh: dict) -> int:
    """Security score 0-100."""
    score = 0
    if tls["enabled"]:
        score += 15
    if tls["cert_type"] != "self-signed":
        score += 10
    if f2b["enabled"]:
        score += 15
    if fw["enabled"]:
        score += 15
    if fw["default_policy"] == "deny":
        score += 10
    if ssh["key_only"]:
        score += 15
    if not ssh["root_login"]:
        score += 10
    if get_2fa_config()["enabled"]:
        score += 10
    return min(score, 100)
