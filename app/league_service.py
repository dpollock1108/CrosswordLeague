from __future__ import annotations

import secrets
import string
from typing import List, Optional, Tuple

from sqlmodel import Session, select

from .models import League, LeagueMembership, User
from .schemas import LeagueMemberPublic

_INVITE_ALPHABET = string.ascii_uppercase + string.digits
_INVITE_LENGTH = 8


class LeagueError(Exception):
    """Raised for expected league operation failures (mapped to 4xx)."""


def _generate_invite_code(session: Session) -> str:
    """Return a unique invite code (avoids ambiguous 0/O/1/I characters)."""
    alphabet = "".join(c for c in _INVITE_ALPHABET if c not in "O0I1")
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(_INVITE_LENGTH))
        exists = session.exec(select(League).where(League.invite_code == code)).first()
        if not exists:
            return code
    raise LeagueError("Could not generate a unique invite code; please retry.")


def get_membership(session: Session, league_id: int, user_id: int) -> Optional[LeagueMembership]:
    return session.exec(
        select(LeagueMembership).where(
            LeagueMembership.league_id == league_id,
            LeagueMembership.user_id == user_id,
        )
    ).first()


def is_active_member(session: Session, league_id: int, user_id: int) -> bool:
    m = get_membership(session, league_id, user_id)
    return bool(m and m.status == "active")


def is_admin(session: Session, league_id: int, user_id: int) -> bool:
    m = get_membership(session, league_id, user_id)
    return bool(m and m.status == "active" and m.role == "admin")


def _active_memberships(session: Session, league_id: int) -> List[LeagueMembership]:
    return session.exec(
        select(LeagueMembership).where(
            LeagueMembership.league_id == league_id,
            LeagueMembership.status == "active",
        )
    ).all()


def _member_count(session: Session, league_id: int) -> int:
    return len(_active_memberships(session, league_id))


def create_league(session: Session, name: str, user: User, visibility: str = "private") -> League:
    league = League(
        name=name.strip(),
        invite_code=_generate_invite_code(session),
        creator_id=user.id,
        visibility=visibility,
    )
    session.add(league)
    session.commit()
    session.refresh(league)

    session.add(
        LeagueMembership(league_id=league.id, user_id=user.id, role="admin", status="active")
    )
    session.commit()
    return league


def join_league(session: Session, invite_code: str, user: User) -> Tuple[League, str]:
    """Join (public) or request to join (private). Returns (league, status)."""
    code = invite_code.strip().upper()
    league = session.exec(select(League).where(League.invite_code == code)).first()
    if not league:
        raise LeagueError("No league found with that invite code.")

    existing = get_membership(session, league.id, user.id)
    if existing:
        if existing.status == "pending":
            raise LeagueError("Your request to join is already pending approval.")
        raise LeagueError("You are already a member of this league.")

    status = "active" if league.visibility == "public" else "pending"
    session.add(
        LeagueMembership(league_id=league.id, user_id=user.id, role="member", status=status)
    )
    session.commit()
    return league, status


def leave_league(session: Session, league_id: int, user: User) -> None:
    """Leave a league or cancel a pending join request."""
    membership = get_membership(session, league_id, user.id)
    if not membership:
        raise LeagueError("You are not a member of this league.")
    session.delete(membership)
    session.commit()


def set_visibility(session: Session, league: League, visibility: str) -> League:
    """Change a league's visibility. Switching to public auto-approves pending requests."""
    league.visibility = visibility
    session.add(league)
    if visibility == "public":
        pending = session.exec(
            select(LeagueMembership).where(
                LeagueMembership.league_id == league.id,
                LeagueMembership.status == "pending",
            )
        ).all()
        for m in pending:
            m.status = "active"
            session.add(m)
    session.commit()
    session.refresh(league)
    return league


def approve_request(session: Session, league_id: int, user_id: int) -> None:
    m = get_membership(session, league_id, user_id)
    if not m or m.status != "pending":
        raise LeagueError("No pending request found for that user.")
    m.status = "active"
    session.add(m)
    session.commit()


def deny_request(session: Session, league_id: int, user_id: int) -> None:
    m = get_membership(session, league_id, user_id)
    if not m or m.status != "pending":
        raise LeagueError("No pending request found for that user.")
    session.delete(m)
    session.commit()


def list_user_leagues(session: Session, user: User) -> List[Tuple[League, LeagueMembership, int]]:
    """Return (league, current_user_membership, active_member_count) for the user's leagues.

    Includes leagues where the user's membership is still pending."""
    memberships = session.exec(
        select(LeagueMembership).where(LeagueMembership.user_id == user.id)
    ).all()
    out: List[Tuple[League, LeagueMembership, int]] = []
    for m in memberships:
        league = session.get(League, m.league_id)
        if league:
            out.append((league, m, _member_count(session, league.id)))
    out.sort(key=lambda t: t[0].name.lower())
    return out


def _to_member_public(session: Session, m: LeagueMembership) -> Optional[LeagueMemberPublic]:
    u = session.get(User, m.user_id)
    if not u:
        return None
    return LeagueMemberPublic(
        user_id=u.id,
        display_name=u.display_name,
        handle=u.handle,
        player_id=u.player_id,
        role=m.role,
        status=m.status,
        joined_at=m.joined_at,
    )


def get_league_members(session: Session, league_id: int) -> List[LeagueMemberPublic]:
    members: List[LeagueMemberPublic] = []
    for m in _active_memberships(session, league_id):
        pub = _to_member_public(session, m)
        if pub:
            members.append(pub)
    members.sort(key=lambda x: (x.role != "admin", (x.handle or x.display_name).lower()))
    return members


def get_pending_requests(session: Session, league_id: int) -> List[LeagueMemberPublic]:
    rows = session.exec(
        select(LeagueMembership).where(
            LeagueMembership.league_id == league_id,
            LeagueMembership.status == "pending",
        )
    ).all()
    out: List[LeagueMemberPublic] = []
    for m in rows:
        pub = _to_member_public(session, m)
        if pub:
            out.append(pub)
    out.sort(key=lambda x: x.joined_at)
    return out


def league_member_player_ids(session: Session, league_id: int) -> set[int]:
    """Player IDs for ACTIVE league members (members without a linked Player are skipped)."""
    rows = session.exec(
        select(User.player_id)
        .join(LeagueMembership, LeagueMembership.user_id == User.id)
        .where(
            LeagueMembership.league_id == league_id,
            LeagueMembership.status == "active",
            User.player_id.is_not(None),
        )
    ).all()
    return {pid for pid in rows if pid is not None}
