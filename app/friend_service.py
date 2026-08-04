"""Mutual friendships between users.

Friendship is stored as a single directed row per pair (requester -> addressee)
that flips to "accepted" when the addressee agrees. Every read therefore has to
match on both columns; ``friend_ids`` is the one place that logic lives.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Set, Tuple

from sqlmodel import Session, or_, select

from .models import Friendship, User
from .schemas import FriendPublic, FriendRequestPublic


class FriendError(Exception):
    """Raised for expected friend-graph failures (mapped to 4xx)."""


def _pair(session: Session, a_id: int, b_id: int) -> Optional[Friendship]:
    """The friendship row between two users, in whichever direction it exists."""
    return session.exec(
        select(Friendship).where(
            or_(
                (Friendship.requester_id == a_id) & (Friendship.addressee_id == b_id),
                (Friendship.requester_id == b_id) & (Friendship.addressee_id == a_id),
            )
        )
    ).first()


def find_by_handle(session: Session, handle: str) -> Optional[User]:
    cleaned = handle.strip().lstrip("@")
    if not cleaned:
        return None
    return session.exec(select(User).where(User.handle == cleaned)).first()


def send_request(session: Session, user: User, handle: str) -> Tuple[Friendship, str]:
    """Send a friend request by handle. Returns (friendship, status).

    If the other user already has a pending request out to you, this accepts it
    instead of creating a second row — two people adding each other should just
    become friends.
    """
    target = find_by_handle(session, handle)
    if not target:
        raise FriendError(f"No player found with the handle @{handle.strip().lstrip('@')}.")
    if target.id == user.id:
        raise FriendError("You can't add yourself as a friend.")

    existing = _pair(session, user.id, target.id)
    if existing:
        if existing.status == "accepted":
            raise FriendError(f"You and @{target.handle} are already friends.")
        if existing.requester_id == user.id:
            raise FriendError(f"You already have a pending request to @{target.handle}.")
        # They asked first — treat this as accepting.
        existing.status = "accepted"
        existing.responded_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing, "accepted"

    friendship = Friendship(requester_id=user.id, addressee_id=target.id, status="pending")
    session.add(friendship)
    session.commit()
    session.refresh(friendship)
    return friendship, "pending"


def accept_request(session: Session, user: User, requester_id: int) -> Friendship:
    friendship = session.exec(
        select(Friendship).where(
            Friendship.requester_id == requester_id,
            Friendship.addressee_id == user.id,
            Friendship.status == "pending",
        )
    ).first()
    if not friendship:
        raise FriendError("No pending friend request from that player.")
    friendship.status = "accepted"
    friendship.responded_at = datetime.utcnow()
    session.add(friendship)
    session.commit()
    session.refresh(friendship)
    return friendship


def decline_request(session: Session, user: User, requester_id: int) -> None:
    friendship = session.exec(
        select(Friendship).where(
            Friendship.requester_id == requester_id,
            Friendship.addressee_id == user.id,
            Friendship.status == "pending",
        )
    ).first()
    if not friendship:
        raise FriendError("No pending friend request from that player.")
    session.delete(friendship)
    session.commit()


def cancel_request(session: Session, user: User, addressee_id: int) -> None:
    """Withdraw a request you sent."""
    friendship = session.exec(
        select(Friendship).where(
            Friendship.requester_id == user.id,
            Friendship.addressee_id == addressee_id,
            Friendship.status == "pending",
        )
    ).first()
    if not friendship:
        raise FriendError("No pending request to that player.")
    session.delete(friendship)
    session.commit()


def remove_friend(session: Session, user: User, other_id: int) -> None:
    friendship = _pair(session, user.id, other_id)
    if not friendship or friendship.status != "accepted":
        raise FriendError("You are not friends with that player.")
    session.delete(friendship)
    session.commit()


def friend_ids(session: Session, user_id: int) -> Set[int]:
    """User IDs of everyone who has an accepted friendship with ``user_id``."""
    rows = session.exec(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
        )
    ).all()
    return {r.addressee_id if r.requester_id == user_id else r.requester_id for r in rows}


def are_friends(session: Session, a_id: int, b_id: int) -> bool:
    friendship = _pair(session, a_id, b_id)
    return bool(friendship and friendship.status == "accepted")


def _to_public(user: Optional[User], since: datetime) -> Optional[FriendPublic]:
    if not user:
        return None
    return FriendPublic(
        user_id=user.id,
        display_name=user.display_name,
        handle=user.handle,
        avatar_url=user.avatar_url,
        friends_since=since,
    )


def list_friends(session: Session, user: User) -> List[FriendPublic]:
    rows = session.exec(
        select(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id),
        )
    ).all()
    out: List[FriendPublic] = []
    for r in rows:
        other_id = r.addressee_id if r.requester_id == user.id else r.requester_id
        pub = _to_public(session.get(User, other_id), r.responded_at or r.created_at)
        if pub:
            out.append(pub)
    out.sort(key=lambda f: (f.handle or f.display_name).lower())
    return out


def _to_request_public(session: Session, r: Friendship, other_id: int) -> Optional[FriendRequestPublic]:
    other = session.get(User, other_id)
    if not other:
        return None
    return FriendRequestPublic(
        user_id=other.id,
        display_name=other.display_name,
        handle=other.handle,
        avatar_url=other.avatar_url,
        requested_at=r.created_at,
    )


def list_requests(session: Session, user: User) -> Tuple[List[FriendRequestPublic], List[FriendRequestPublic]]:
    """Return (incoming, outgoing) pending friend requests."""
    rows = session.exec(
        select(Friendship).where(
            Friendship.status == "pending",
            or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id),
        )
    ).all()
    incoming: List[FriendRequestPublic] = []
    outgoing: List[FriendRequestPublic] = []
    for r in rows:
        if r.addressee_id == user.id:
            pub = _to_request_public(session, r, r.requester_id)
            if pub:
                incoming.append(pub)
        else:
            pub = _to_request_public(session, r, r.addressee_id)
            if pub:
                outgoing.append(pub)
    incoming.sort(key=lambda x: x.requested_at)
    outgoing.sort(key=lambda x: x.requested_at)
    return incoming, outgoing
