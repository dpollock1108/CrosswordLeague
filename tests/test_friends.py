from __future__ import annotations

import pytest

from app.friend_service import (
    FriendError,
    accept_request,
    are_friends,
    cancel_request,
    decline_request,
    friend_ids,
    list_friends,
    list_requests,
    remove_friend,
    send_request,
)
from app.models import User


def _make_user(session, name):
    user = User(
        google_id=f"g-{name}",
        email=f"{name}@example.com",
        display_name=name.title(),
        handle=name,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_request_and_accept(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    _, status = send_request(in_memory_session, alice, "bob")
    assert status == "pending"
    assert not are_friends(in_memory_session, alice.id, bob.id)

    incoming, outgoing = list_requests(in_memory_session, bob)
    assert [r.handle for r in incoming] == ["alice"]
    assert outgoing == []

    accept_request(in_memory_session, bob, alice.id)
    assert are_friends(in_memory_session, alice.id, bob.id)
    assert friend_ids(in_memory_session, alice.id) == {bob.id}
    assert friend_ids(in_memory_session, bob.id) == {alice.id}
    assert [f.handle for f in list_friends(in_memory_session, alice)] == ["bob"]


def test_handle_lookup_tolerates_at_prefix(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    _make_user(in_memory_session, "bob")
    _, status = send_request(in_memory_session, alice, "@bob")
    assert status == "pending"


def test_mutual_requests_auto_accept(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    send_request(in_memory_session, alice, "bob")
    # Bob adds Alice back rather than using the accept button.
    _, status = send_request(in_memory_session, bob, "alice")
    assert status == "accepted"
    assert are_friends(in_memory_session, alice.id, bob.id)


def test_cannot_friend_yourself_or_duplicate(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    _make_user(in_memory_session, "bob")

    with pytest.raises(FriendError, match="yourself"):
        send_request(in_memory_session, alice, "alice")

    with pytest.raises(FriendError, match="No player found"):
        send_request(in_memory_session, alice, "nobody")

    send_request(in_memory_session, alice, "bob")
    with pytest.raises(FriendError, match="pending request"):
        send_request(in_memory_session, alice, "bob")


def test_decline_cancel_and_unfriend(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")

    send_request(in_memory_session, alice, "bob")
    decline_request(in_memory_session, bob, alice.id)
    assert friend_ids(in_memory_session, alice.id) == set()

    # A declined request can be sent again.
    send_request(in_memory_session, alice, "bob")
    cancel_request(in_memory_session, alice, bob.id)
    assert list_requests(in_memory_session, bob)[0] == []

    send_request(in_memory_session, alice, "bob")
    accept_request(in_memory_session, bob, alice.id)
    remove_friend(in_memory_session, bob, alice.id)
    assert friend_ids(in_memory_session, alice.id) == set()

    with pytest.raises(FriendError, match="not friends"):
        remove_friend(in_memory_session, bob, alice.id)


def test_accept_requires_a_pending_request(in_memory_session):
    alice = _make_user(in_memory_session, "alice")
    bob = _make_user(in_memory_session, "bob")
    with pytest.raises(FriendError, match="No pending friend request"):
        accept_request(in_memory_session, bob, alice.id)
