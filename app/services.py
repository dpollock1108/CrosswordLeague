from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional

from sqlmodel import Session, select

from .models import Player, PuzzleResult
from .schemas import (
    BulkPuzzleResultCreate,
    CSVImportSummary,
    DelinquentPlayer,
    LeaderboardEntry,
    LeaderboardResponse,
    PlayerCreate,
    PlayerPublic,
    PlayerStats,
    PuzzleResultCreate,
    PuzzleResultPublic,
    WallOfShameResponse,
)
from .scoring import (
    DEFAULT_BONUS,
    DEFAULT_TIERS,
    assign_daily_points,
    category_for,
    group_results_by_date,
    points_for_tiers,
)


def create_player(session: Session, payload: PlayerCreate) -> Player:
    player = Player(**payload.model_dump())
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


def list_players(session: Session) -> List[Player]:
    return session.exec(select(Player).order_by(Player.name)).all()


def update_player(session: Session, player_id: int, payload: PlayerCreate) -> Optional[Player]:
    player = session.get(Player, player_id)
    if not player:
        return None
    player.name = payload.name
    player.handle = payload.handle
    player.email = payload.email
    player.nyt_username = payload.nyt_username
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


def list_results_by_date(session: Session, puzzle_date: date, puzzle_type: Optional[str] = None) -> List[PuzzleResult]:
    statement = select(PuzzleResult).where(PuzzleResult.puzzle_date == puzzle_date)
    if puzzle_type:
        statement = statement.where(PuzzleResult.puzzle_type == puzzle_type)
    return session.exec(statement).all()


def _find_existing_result(
    session: Session, player_id: int, puzzle_date: date, puzzle_type: str = "nyt_mini",
) -> Optional[PuzzleResult]:
    statement = select(PuzzleResult).where(
        PuzzleResult.player_id == player_id,
        PuzzleResult.puzzle_date == puzzle_date,
        PuzzleResult.puzzle_type == puzzle_type,
    )
    return session.exec(statement).one_or_none()


def upsert_puzzle_result(
    session: Session,
    payload: PuzzleResultCreate,
    overwrite_existing: bool,
) -> PuzzleResult:
    puzzle_type = getattr(payload, "puzzle_type", "nyt_mini") or "nyt_mini"
    existing = _find_existing_result(session, payload.player_id, payload.puzzle_date, puzzle_type)
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

    data = payload.model_dump()
    data["puzzle_type"] = puzzle_type
    result = PuzzleResult(**data)
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


def _aggregate_scores(
    results: Iterable[PuzzleResult],
    scoring_config: Optional[Dict[str, dict]] = None,
) -> Dict[int, Dict[str, object]]:
    aggregates: Dict[int, Dict[str, object]] = defaultdict(lambda: {"points": 0, "seconds": [], "dates": []})

    if scoring_config is None:
        # Default path: fixed tiers + bonus, all results in a day compared together.
        grouped = group_results_by_date(results)
        for _, daily_results in grouped.items():
            daily_points = assign_daily_points(daily_results)
            for result in daily_results:
                player_totals = aggregates[result.player_id]
                player_totals["points"] += daily_points.get(result.player_id, 0)
                player_totals["seconds"].append(result.seconds)
                player_totals["dates"].append(result.puzzle_date)
        return aggregates

    # League path: per (date, category) tiers + per-category first-place bonus.
    groups: Dict[tuple, List[PuzzleResult]] = defaultdict(list)
    for result in results:
        groups[(result.puzzle_date, category_for(result.puzzle_type))].append(result)

    for (_, category), group in groups.items():
        cfg = scoring_config.get(category) or {"tiers": DEFAULT_TIERS, "bonus": DEFAULT_BONUS}
        tiers = cfg["tiers"]
        bonus = cfg["bonus"]
        best_time = min(r.seconds for r in group)
        for result in group:
            if result.points_override is not None:
                pts = result.points_override
            else:
                pts = points_for_tiers(result.seconds, tiers)
                if result.seconds == best_time:
                    pts += bonus
            player_totals = aggregates[result.player_id]
            player_totals["points"] += pts
            player_totals["seconds"].append(result.seconds)
            player_totals["dates"].append(result.puzzle_date)

    return aggregates


def import_results_from_rows(
    session: Session,
    rows: List[dict],
    overwrite_existing: bool = True,
) -> CSVImportSummary:
    results: List[PuzzleResultCreate] = []
    errors: List[str] = []
    for idx, row in enumerate(rows, start=1):
        try:
            result = PuzzleResultCreate(**row)
            results.append(result)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Row {idx}: {exc}")
    payload = BulkPuzzleResultCreate(results=results, overwrite_existing=overwrite_existing)
    stored = store_results(session, payload)
    return CSVImportSummary(imported=len(stored), skipped=len(errors), errors=errors)


def calculate_leaderboard(
    session: Session,
    start_date: Optional[date],
    end_date: Optional[date],
    puzzle_types: Optional[list[str]] = None,
    player_ids: Optional[set[int]] = None,
    scoring_config: Optional[Dict[str, dict]] = None,
) -> LeaderboardResponse:
    # An empty player_ids set means "scope to nobody" — return an empty board
    # rather than (incorrectly) falling through to the global leaderboard.
    if player_ids is not None and not player_ids:
        resolved_start = start_date or date.today()
        resolved_end = end_date or resolved_start
        return LeaderboardResponse(start_date=resolved_start, end_date=resolved_end, entries=[])

    statement = select(PuzzleResult)
    if start_date:
        statement = statement.where(PuzzleResult.puzzle_date >= start_date)
    if end_date:
        statement = statement.where(PuzzleResult.puzzle_date <= end_date)
    if puzzle_types:
        statement = statement.where(PuzzleResult.puzzle_type.in_(puzzle_types))
    if player_ids is not None:
        # Scoping to league members before aggregation means the daily
        # first-place bonus is naturally computed within the league.
        statement = statement.where(PuzzleResult.player_id.in_(player_ids))

    results = session.exec(statement).all()
    if not results:
        resolved_start = start_date or date.today()
        resolved_end = end_date or resolved_start
        return LeaderboardResponse(
            start_date=resolved_start,
            end_date=resolved_end,
            entries=[],
        )

    resolved_start = start_date or min(result.puzzle_date for result in results)
    resolved_end = end_date or max(result.puzzle_date for result in results)

    aggregates = _aggregate_scores(results, scoring_config=scoring_config)
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
        entries=entries,
    )


def build_player_stats(
    session: Session,
    player_id: int,
) -> Optional[PlayerStats]:
    player = session.get(Player, player_id)
    if not player:
        return None

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

    all_results = session.exec(select(PuzzleResult)).all()
    aggregates = _aggregate_scores(all_results)
    player_totals = aggregates.get(player_id, {"points": 0, "seconds": [], "dates": []})

    weekday_buckets: Dict[str, List[int]] = defaultdict(list)
    weekday_labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for result in results:
        weekday_buckets[weekday_labels[result.puzzle_date.weekday()]].append(result.seconds)

    weekday_averages: Dict[str, float] = {}
    best_day_of_week: Optional[str] = None
    best_avg = None
    for weekday, times in weekday_buckets.items():
        avg = sum(times) / len(times)
        weekday_averages[weekday] = avg
        if best_avg is None or avg < best_avg:
            best_avg = avg
            best_day_of_week = weekday

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
        best_day_of_week=best_day_of_week,
        weekday_averages=weekday_averages or None,
    )


def default_date_window() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=29), today


def _daterange(start: date, end: date) -> List[date]:
    if end < start:
        raise ValueError("end_date must be on or after start_date")
    days = (end - start).days
    return [start + timedelta(days=offset) for offset in range(days + 1)]


def _default_range_for_scope(scope: str) -> tuple[date, date]:
    today = date.today()
    if scope == "month":
        start = today.replace(day=1)
        if start.month == 12:
            next_month = start.replace(year=start.year + 1, month=1, day=1)
        else:
            next_month = start.replace(month=start.month + 1, day=1)
        end = next_month - timedelta(days=1)
    else:
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
    return start, end


def find_delinquent_players(
    session: Session,
    scope: str = "week",
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> WallOfShameResponse:
    if scope not in {"week", "month"}:
        raise ValueError("scope must be 'week' or 'month'")

    resolved_start, resolved_end = (start_date, end_date) if start_date and end_date else _default_range_for_scope(scope)
    if start_date and not end_date:
        resolved_end = _default_range_for_scope(scope)[1]
    if end_date and not start_date:
        resolved_start = _default_range_for_scope(scope)[0]

    today = date.today()
    if resolved_start > today:
        return WallOfShameResponse(start_date=resolved_start, end_date=today, scope=scope, entries=[])
    resolved_end = min(resolved_end, today)

    calendar = set(_daterange(resolved_start, resolved_end))

    results = session.exec(
        select(PuzzleResult).where(
            PuzzleResult.puzzle_date >= resolved_start,
            PuzzleResult.puzzle_date <= resolved_end,
        ),
    ).all()

    results_by_player: Dict[int, set[date]] = defaultdict(set)
    for result in results:
        results_by_player[result.player_id].add(result.puzzle_date)

    players = list_players(session)
    entries: List[DelinquentPlayer] = []
    for player in players:
        missing_dates = sorted(calendar - results_by_player.get(player.id, set()))
        if not missing_dates:
            continue
        entries.append(
            DelinquentPlayer(
                player_id=player.id,
                name=player.name,
                handle=player.handle,
                missing_dates=missing_dates,
                missing_count=len(missing_dates),
            ),
        )

    entries.sort(key=lambda entry: (-entry.missing_count, entry.name.lower()))

    return WallOfShameResponse(
        start_date=resolved_start,
        end_date=resolved_end,
        scope=scope,
        entries=entries,
    )
