from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    username: Mapped[str] = mapped_column(String(128), primary_key=True)
    active_theme_id: Mapped[str] = mapped_column(String(128), nullable=False, default="default")
    custom_themes_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
