from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List

from dotenv import load_dotenv

load_dotenv()


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
    admin_token: str = field(default_factory=lambda: os.getenv("ADMIN_TOKEN", "changeme").strip())
    allow_default_admin_token: bool = field(
        default_factory=lambda: _parse_bool(os.getenv("ALLOW_DEFAULT_ADMIN_TOKEN"), default=False),
    )
    disable_admin_auth: bool = field(default_factory=lambda: _parse_bool(os.getenv("DISABLE_ADMIN_AUTH"), default=False))
    allowed_origins: List[str] = field(default_factory=lambda: _parse_list(os.getenv("ALLOWED_ORIGINS")))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", "").strip())
    google_client_id: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID", "").strip())
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-secret-change-me").strip())
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = field(default_factory=lambda: int(os.getenv("JWT_EXPIRY_HOURS", "168")))

    @property
    def admin_token_configured(self) -> bool:
        if self.allow_default_admin_token:
            return True
        return self.admin_token not in {"", "changeme", None}


settings = Settings()
