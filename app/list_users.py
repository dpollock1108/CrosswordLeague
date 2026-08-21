"""CLI tool to list registered users.

Usage:
    uv run python -m app.list_users

Reads DATABASE_URL like the app does, so it points at the local SQLite file by
default. To read production, run the Cloud SQL Proxy and pass that instance's
URL on the command line — an explicit env var wins over .env.
"""
from __future__ import annotations

from sqlmodel import Session, select

from .database import engine
from .models import User


def main() -> None:
    with Session(engine) as session:
        users = session.exec(select(User).order_by(User.created_at)).all()

    if not users:
        print("No users registered.")
        return

    rows = [
        (
            str(u.id),
            u.email,
            f"@{u.handle}" if u.handle else "(no handle)",
            "admin" if u.is_admin else "",
            u.created_at.strftime("%Y-%m-%d"),
            u.last_login_at.strftime("%Y-%m-%d"),
        )
        for u in users
    ]
    headers = ("ID", "EMAIL", "HANDLE", "ROLE", "JOINED", "LAST SEEN")
    widths = [max(len(r[i]) for r in (*rows, headers)) for i in range(len(headers))]

    def line(cols: tuple[str, ...]) -> str:
        return "  ".join(c.ljust(w) for c, w in zip(cols, widths)).rstrip()

    print(line(headers))
    print("  ".join("-" * w for w in widths))
    for row in rows:
        print(line(row))
    print(f"\n{len(users)} user{'s' if len(users) != 1 else ''}.")


if __name__ == "__main__":
    main()
