from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlmodel import Session

from .config import settings
from .database import get_session
from .models import User


# ---------------------------------------------------------------------------
# Admin token auth (legacy, kept for backward compat)
# ---------------------------------------------------------------------------


def require_admin(x_admin_token: Optional[str] = Header(None)) -> None:
    if settings.disable_admin_auth:
        return
    if not settings.admin_token_configured:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Set ADMIN_TOKEN before performing admin actions.",
        )
    if x_admin_token != settings.admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token.",
        )


# ---------------------------------------------------------------------------
# Google ID-token verification
# ---------------------------------------------------------------------------


def verify_google_token(id_token: str) -> dict:
    """Verify a Google Sign-In ID token and return the claims dict."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_CLIENT_ID is not configured.",
        )
    try:
        claims = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {exc}",
        )

    return {
        "sub": claims["sub"],
        "email": claims.get("email", ""),
        "name": claims.get("name", ""),
        "picture": claims.get("picture", ""),
    }


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_jwt(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expiry_hours),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> int:
    """Decode JWT and return user_id. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )
    return user_id


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def get_current_user(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> User:
    """Dependency that requires a valid JWT and returns the User."""
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )
    user_id = decode_jwt(token)
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return user


def get_optional_user(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising."""
    token = _extract_bearer(authorization)
    if not token:
        return None
    try:
        user_id = decode_jwt(token)
    except HTTPException:
        return None
    return session.get(User, user_id)


def require_admin_or_token(
    x_admin_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> None:
    """Accept either legacy admin token OR a JWT for a user with is_admin=True."""
    if x_admin_token and x_admin_token == settings.admin_token and settings.admin_token_configured:
        return

    if settings.disable_admin_auth:
        return

    token = _extract_bearer(authorization)
    if token:
        try:
            user_id = decode_jwt(token)
            user = session.get(User, user_id)
            if user and user.is_admin:
                return
        except HTTPException:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Admin access required.",
    )
