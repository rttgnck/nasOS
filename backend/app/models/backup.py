from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BackupJob(Base):
    __tablename__ = "backup_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    source: Mapped[str] = mapped_column(String(512), nullable=False)
    destination: Mapped[str] = mapped_column(String(512), nullable=False)
    dest_type: Mapped[str] = mapped_column(String(16), nullable=False, default="local")  # local, cloud
    schedule: Mapped[str] = mapped_column(String(64), default="Manual")
    retention: Mapped[str] = mapped_column(String(32), default="7 days")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(16), nullable=True)  # success, failed, running
    last_size: Mapped[str] = mapped_column(String(32), default="0 B")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class CloudRemote(Base):
    __tablename__ = "cloud_remotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    remote_type: Mapped[str] = mapped_column(String(64), nullable=False)  # Backblaze B2, Google Drive, S3, etc.
    bucket: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(32), default="not configured")  # connected, not configured
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
