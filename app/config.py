from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


def _parse_points_table(raw: str | None) -> List[int]:
    """
    Accepts a comma-separated string of ints and returns a list.
    Falls back to a simple default points table.
    """
    if not raw:
        return [10, 8, 6, 4, 2]
    try:
        points = [int(value.strip()) for value in raw.split(",") if value.strip()]
    except ValueError as exc:
        raise ValueError("POINTS_TABLE must be a comma-separated list of integers") from exc
    return [p for p in points if p > 0] or [10, 8, 6, 4, 2]


def _parse_bool(raw: str | None, default: bool = False) -> bool:
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _parse_list(raw: str | None) -> List[str]:
    if not raw:
        return ["*"]
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./crossword.db"))
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_TOKEN", "changeme"))
    points_table: List[int] = field(default_factory=lambda: _parse_points_table(os.getenv("POINTS_TABLE")))
    allow_default_admin_token: bool = field(
        default_factory=lambda: _parse_bool(os.getenv("ALLOW_DEFAULT_ADMIN_TOKEN"), default=False),
    )
    allowed_origins: List[str] = field(default_factory=lambda: _parse_list(os.getenv("ALLOWED_ORIGINS")))

    @property
    def admin_token_configured(self) -> bool:
        if self.allow_default_admin_token:
            return True
        return self.admin_token not in {"", "changeme", None}


settings = Settings()
