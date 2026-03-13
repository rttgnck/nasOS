import platform
from pathlib import Path

from pydantic_settings import BaseSettings

# Use local paths on non-Linux (dev on macOS/Windows)
_is_dev_platform = platform.system() != "Linux"
_default_data = Path(__file__).parent.parent.parent / ".data" if _is_dev_platform else Path("/opt/nasos/data")


class Settings(BaseSettings):
    app_name: str = "nasOS"
    version: str = "0.1.0"
    debug: bool = False

    # Paths — auto-detects dev vs production
    data_dir: Path = _default_data
    db_path: Path = _default_data / "nasos.db"
    static_dir: Path = Path("/opt/nasos/frontend")

    # Auth
    secret_key: str = "CHANGE-ME-ON-FIRST-BOOT"
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
