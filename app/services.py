from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from sqlmodel import Session, select

from .config import settings
from .models import Player, PuzzleResult
from .schemas import (
    BulkPuzzleResultCreate,
    LeaderboardEntry,
    LeaderboardResponse,
    PlayerCreate,
    PlayerPublic,
    PlayerStats,
    PuzzleResultCreate,
    PuzzleResultPublic,
)
from .scoring import assign_daily_points, group_results_by_date


def create_player(session: Session, payload: PlayerCreate) -> Player:
    player = Player(**payload.model_dump())
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


def list_players(session: Session) -> List[Player]:
    return session.exec(select(Player).order_by(Player.name)).all()


def _find_existing_result(session: Session, player_id: int, puzzle_date: date) -> Optional[PuzzleResult]:
    statement = select(PuzzleResult).where(
        PuzzleResult.player_id == player_id,
        PuzzleResult.puzzle_date == puzzle_date,
    )
    return session.exec(statement).one_or_none()


def upsert_puzzle_result(
    session: Session,
    payload: PuzzleResultCreate,
    overwrite_existing: bool,
) -> PuzzleResult:
    existing = _find_existing_result(session, payload.player_id, payload.puzzle_date)
    if existing and not overwrite_existing:
        return existing

    if existing and overwrite_existing:
        existing.seconds = payload.seconds
        existing.points_override = payload.points_override
        existing.note = payload.note
        existing.source = payload.source
        existing.recorded_at = datetime.utcnow()
        session.add(existing)
        return existing

    result = PuzzleResult(**payload.model_dump())
    session.add(result)
    return result


def store_results(session: Session, payload: BulkPuzzleResultCreate) -> List[PuzzleResult]:
    saved: List[PuzzleResult] = []
    for result_payload in payload.results:
        saved.append(upsert_puzzle_result(session, result_payload, payload.overwrite_existing))
    session.commit()
    for record in saved:
        session.refresh(record)
    return saved


def _aggregate_scores(results: Iterable[PuzzleResult], points_table: List[int]) -> Dict[int, Dict[str, object]]:
    grouped = group_results_by_date(results)
    aggregates: Dict[int, Dict[str, object]] = defaultdict(lambda: {"points": 0, "seconds": [], "dates": []})

    for _, daily_results in grouped.items():
        daily_points = assign_daily_points(daily_results, points_table)
        for result in daily_results:
            player_totals = aggregates[result.player_id]
            player_totals["points"] += daily_points.get(result.player_id, 0)
            player_totals["seconds"].append(result.seconds)
            player_totals["dates"].append(result.puzzle_date)

    return aggregates


def calculate_leaderboard(
    session: Session,
    start_date: Optional[date],
    end_date: Optional[date],
    points_table: Optional[List[int]] = None,
) -> LeaderboardResponse:
    points_table = points_table or settings.points_table
    statement = select(PuzzleResult)
    if start_date:
        statement = statement.where(PuzzleResult.puzzle_date >= start_date)
    if end_date:
        statement = statement.where(PuzzleResult.puzzle_date <= end_date)

    results = session.exec(statement).all()
    if not results:
        resolved_start = start_date or date.today()
        resolved_end = end_date or resolved_start
        return LeaderboardResponse(
            start_date=resolved_start,
            end_date=resolved_end,
            points_table=points_table,
            entries=[],
        )

    resolved_start = start_date or min(result.puzzle_date for result in results)
    resolved_end = end_date or max(result.puzzle_date for result in results)

    aggregates = _aggregate_scores(results, points_table)
    players = session.exec(select(Player).where(Player.id.in_(list(aggregates.keys())))).all()
    player_lookup = {player.id: player for player in players}

    entries: List[LeaderboardEntry] = []
    for player_id, totals in aggregates.items():
        player = player_lookup.get(player_id)
        if not player:
            continue
        seconds: List[int] = totals["seconds"]
        puzzles_played = len(seconds)
        average_seconds = sum(seconds) / puzzles_played if puzzles_played else None
        best_seconds = min(seconds) if seconds else None
        entries.append(
            LeaderboardEntry(
                player_id=player_id,
                name=player.name,
                handle=player.handle,
                total_points=int(totals["points"]),
                puzzles_played=puzzles_played,
                average_seconds=average_seconds,
                best_seconds=best_seconds,
            ),
        )

    entries.sort(key=lambda entry: (-entry.total_points, entry.average_seconds or float("inf")))

    return LeaderboardResponse(
        start_date=resolved_start,
        end_date=resolved_end,
        points_table=points_table,
        entries=entries,
    )


def build_player_stats(
    session: Session,
    player_id: int,
    points_table: Optional[List[int]] = None,
) -> Optional[PlayerStats]:
    player = session.get(Player, player_id)
    if not player:
        return None

    # Use the full history for the player; we reuse the leaderboard aggregation to keep scoring consistent.
    results = session.exec(
        select(PuzzleResult).where(PuzzleResult.player_id == player_id),
    ).all()
    if not results:
        return PlayerStats(
            player=PlayerPublic.model_validate(player),
            puzzles_played=0,
            average_seconds=None,
            best_seconds=None,
            last_puzzle_date=None,
            total_points=0,
        )

    points_table = points_table or settings.points_table
    all_results = session.exec(select(PuzzleResult)).all()
    aggregates = _aggregate_scores(all_results, points_table)
    player_totals = aggregates.get(player_id, {"points": 0, "seconds": [], "dates": []})

    seconds: List[int] = player_totals["seconds"]
    puzzles_played = len(seconds)
    average_seconds = sum(seconds) / puzzles_played if puzzles_played else None
    best_seconds = min(seconds) if seconds else None

    return PlayerStats(
        player=PlayerPublic.model_validate(player),
        puzzles_played=puzzles_played,
        average_seconds=average_seconds,
        best_seconds=best_seconds,
        last_puzzle_date=max(player_totals["dates"]) if player_totals["dates"] else None,
        total_points=int(player_totals["points"]),
    )


def default_date_window() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=29), today
