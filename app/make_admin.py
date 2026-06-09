"""CLI tool to grant admin privileges to a user.

Usage:
    uv run python -m app.make_admin <email_or_handle>
"""
from __future__ import annotations

import sys

from sqlmodel import Session, select

from .database import engine
from .models import User


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: uv run python -m app.make_admin <email_or_handle>")
        sys.exit(1)

    identifier = sys.argv[1]

    with Session(engine) as session:
        user = session.exec(
            select(User).where(User.email == identifier)
        ).first()

        if not user:
            user = session.exec(
                select(User).where(User.handle == identifier)
            ).first()

        if not user:
            print(f"No user found with email or handle '{identifier}'")
            # List existing users to help
            users = session.exec(select(User)).all()
            if users:
                print("\nExisting users:")
                for u in users:
                    print(f"  {u.email}  @{u.handle or '(no handle)'}  admin={u.is_admin}")
            sys.exit(1)

        if user.is_admin:
            print(f"{user.email} (@{user.handle}) is already an admin.")
            return

        user.is_admin = True
        session.add(user)
        session.commit()
        print(f"Done — {user.email} (@{user.handle}) is now an admin.")


if __name__ == "__main__":
    main()
