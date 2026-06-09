from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..auth import create_jwt, get_current_user, verify_google_token
from ..database import get_session
from ..models import Player, User
from ..schemas import AuthResponse, GoogleAuthRequest, UserProfileUpdate, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google", response_model=AuthResponse)
def google_login(
    body: GoogleAuthRequest,
    session: Session = Depends(get_session),
) -> AuthResponse:
    claims = verify_google_token(body.id_token)

    # Upsert user
    user = session.exec(
        select(User).where(User.google_id == claims["sub"])
    ).one_or_none()

    if user:
        user.last_login_at = datetime.utcnow()
        user.display_name = claims["name"] or user.display_name
        user.avatar_url = claims["picture"] or user.avatar_url
        session.add(user)
    else:
        # Try to link to an existing Player by email
        existing_player = session.exec(
            select(Player).where(Player.email == claims["email"])
        ).first() if claims["email"] else None

        # If no player matched by email, create one
        if not existing_player:
            existing_player = Player(
                name=claims["name"] or claims["email"].split("@")[0],
                email=claims["email"],
            )
            session.add(existing_player)
            session.flush()

        user = User(
            google_id=claims["sub"],
            email=claims["email"],
            display_name=claims["name"] or claims["email"].split("@")[0],
            avatar_url=claims["picture"] or None,
            player_id=existing_player.id,
        )
        session.add(user)

    session.commit()
    session.refresh(user)

    token = create_jwt(user.id)
    return AuthResponse(
        access_token=token,
        user=UserPublic.model_validate(user),
    )


@router.get("/me", response_model=UserPublic)
def get_me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)


@router.put("/me", response_model=UserPublic)
def update_profile(
    body: UserProfileUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserPublic:
    if body.handle is not None:
        # Handles are immutable once set
        if user.handle is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Handle cannot be changed once set.",
            )

        # Check handle uniqueness
        existing = session.exec(
            select(User).where(User.handle == body.handle, User.id != user.id)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That handle is already taken.",
            )
        user.handle = body.handle

        # Also sync handle to the linked Player record
        if user.player_id:
            player = session.get(Player, user.player_id)
            if player:
                player.handle = body.handle
                session.add(player)

    if body.display_name is not None:
        user.display_name = body.display_name
        # Sync name to Player
        if user.player_id:
            player = session.get(Player, user.player_id)
            if player:
                player.name = body.display_name
                session.add(player)

    session.add(user)
    session.commit()
    session.refresh(user)
    return UserPublic.model_validate(user)
