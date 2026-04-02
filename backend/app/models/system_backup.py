from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemBackup(Base):
    __tablename__ = "system_backups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")  # manual, scheduled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="complete")  # complete, failed
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    manifest_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
