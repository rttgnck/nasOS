from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Share(Base):
    __tablename__ = "shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    protocol: Mapped[str] = mapped_column(String(16), nullable=False, default="smb")  # smb, nfs, webdav
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    read_only: Mapped[bool] = mapped_column(Boolean, default=False)
    guest_access: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(String(256), default="")
    allowed_users: Mapped[str] = mapped_column(String(512), default="")  # comma-separated
    allowed_hosts: Mapped[str] = mapped_column(String(512), default="")  # NFS: comma-separated
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
