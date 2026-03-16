import logging
import platform
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings

_log = logging.getLogger(__name__)

# Use local paths on non-Linux (dev on macOS/Windows)
_is_dev_platform = platform.system() != "Linux"
_default_data = Path(__file__).parent.parent.parent / ".data" if _is_dev_platform else Path("/opt/nasos/data")

_INSECURE_DEFAULT = "CHANGE-ME-ON-FIRST-BOOT"


def _get_secret_file() -> Path:
    """Return the path to the secret key file.

    Uses the data directory (owned by the nasos user) so the backend process
    can read/write without root.  Falls back to /etc/nasos/secret if it
    already exists there (e.g. manually provisioned).
    """
    legacy = Path("/etc/nasos/secret")
    if legacy.exists():
        return legacy
    return _default_data / ".secret_key"


def _load_or_create_secret(secret_file: Path) -> str:
    """Load an existing secret key or generate and persist a new one."""
    # Try to read an existing key
    if secret_file.exists():
        try:
            key = secret_file.read_text().strip()
            if key and key != _INSECURE_DEFAULT:
                return key
        except OSError:
            pass

    # Generate a cryptographically random key
    key = secrets.token_hex(32)
    try:
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        secret_file.write_text(key)
        secret_file.chmod(0o600)
        _log.info("Generated new secret key at %s", secret_file)
    except OSError as exc:
        _log.warning("Could not persist secret key to %s: %s — key is ephemeral", secret_file, exc)

    return key


class Settings(BaseSettings):
    app_name: str = "nasOS"
    version: str = "031626-094510"
    debug: bool = False

    # Paths — auto-detects dev vs production
    data_dir: Path = _default_data
    db_path: Path = _default_data / "nasos.db"
    static_dir: Path = Path("/opt/nasos/frontend")

    # Auth — secret_key is resolved after construction (see below)
    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    algorithm: str = "HS256"

    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"]

    # Dev mode — mocks system calls on non-Linux.
    # Auto-detected from platform; override with NASOS_DEV_MODE env var.
    dev_mode: bool = _is_dev_platform

    model_config = {"env_prefix": "NASOS_"}


settings = Settings()

# Always ensure a secure secret key — even if NASOS_SECRET_KEY env var was
# set to the old insecure default, or left blank.
if not settings.secret_key or settings.secret_key == _INSECURE_DEFAULT:
    if settings.dev_mode:
        settings.secret_key = "dev-only-insecure-key"
    else:
        secret_file = _get_secret_file()
        settings.secret_key = _load_or_create_secret(secret_file)
        _log.info("Secret key loaded from %s", secret_file)
