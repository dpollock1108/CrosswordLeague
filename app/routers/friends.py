from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from ..auth import get_current_user
from ..database import get_session
from ..friend_service import (
    FriendError,
    accept_request,
    cancel_request,
    decline_request,
    list_friends,
    list_requests,
    remove_friend,
    send_request,
)
from ..models import User
from ..schemas import (
    FriendListResponse,
    FriendRequestCreate,
    FriendRequestPublic,
    FriendRequestResult,
)

router = APIRouter(prefix="/friends", tags=["friends"])


def _bad_request(exc: FriendError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=FriendListResponse)
def get_friends(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> FriendListResponse:
    """Your friends plus pending requests in both directions."""
    incoming, outgoing = list_requests(session, user)
    return FriendListResponse(
        friends=list_friends(session, user),
        incoming=incoming,
        outgoing=outgoing,
    )


@router.post("/requests", response_model=FriendRequestResult, status_code=status.HTTP_201_CREATED)
def create_request(
    body: FriendRequestCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> FriendRequestResult:
    """Send a friend request by handle."""
    try:
        friendship, result_status = send_request(session, user, body.handle)
    except FriendError as exc:
        raise _bad_request(exc)

    other_id = (
        friendship.addressee_id if friendship.requester_id == user.id else friendship.requester_id
    )
    other = session.get(User, other_id)
    return FriendRequestResult(
        status=result_status,
        friend=FriendRequestPublic(
            user_id=other.id,
            display_name=other.display_name,
            handle=other.handle,
            avatar_url=other.avatar_url,
            requested_at=friendship.created_at,
        ),
    )


@router.post("/requests/{requester_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
def accept(
    requester_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    try:
        accept_request(session, user, requester_id)
    except FriendError as exc:
        raise _bad_request(exc)


@router.post("/requests/{requester_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline(
    requester_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    try:
        decline_request(session, user, requester_id)
    except FriendError as exc:
        raise _bad_request(exc)


@router.delete("/requests/{addressee_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel(
    addressee_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    """Withdraw a request you sent."""
    try:
        cancel_request(session, user, addressee_id)
    except FriendError as exc:
        raise _bad_request(exc)


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
def unfriend(
    friend_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    try:
        remove_friend(session, user, friend_id)
    except FriendError as exc:
        raise _bad_request(exc)
