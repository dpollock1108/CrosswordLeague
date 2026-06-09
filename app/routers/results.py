from __future__ import annotations

from datetime import date
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from ..auth import require_admin
from ..config import settings
from ..database import get_session
from ..schemas import (
    BulkPuzzleResultCreate,
    CSVImportSummary,
    ParsedLeaderboardEntry,
    PuzzleResultCreate,
    PuzzleResultPublic,
    ScreenshotParseResponse,
)
from ..services import (
    import_results_from_rows,
    list_players,
    list_results_by_date,
    store_results,
    upsert_puzzle_result,
)

router = APIRouter(tags=["results"])


@router.post("/results", response_model=List[PuzzleResultPublic])
def post_results(
    payload: BulkPuzzleResultCreate,
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> List[PuzzleResultPublic]:
    results = store_results(session, payload)
    return [PuzzleResultPublic.model_validate(result) for result in results]


@router.post("/results/import-csv", response_model=CSVImportSummary)
def post_results_csv(
    rows: List[dict],
    overwrite_existing: bool = Query(True, description="Overwrite existing results when true"),
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> CSVImportSummary:
    return import_results_from_rows(session, rows=rows, overwrite_existing=overwrite_existing)


@router.post("/results/single", response_model=PuzzleResultPublic, status_code=status.HTTP_201_CREATED)
def post_single_result(
    payload: PuzzleResultCreate,
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> PuzzleResultPublic:
    record = upsert_puzzle_result(session, payload, overwrite_existing=True)
    session.commit()
    session.refresh(record)
    return PuzzleResultPublic.model_validate(record)


@router.post("/results/parse-screenshot", response_model=ScreenshotParseResponse)
async def parse_screenshot(
    image: UploadFile = File(..., description="Leaderboard screenshot (JPEG or PNG)"),
    puzzle_date: date = Form(..., description="Puzzle date (YYYY-MM-DD)"),
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> ScreenshotParseResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ANTHROPIC_API_KEY is not configured.",
        )

    image_bytes = await image.read()
    media_type = image.content_type or "image/jpeg"

    from ..vision import parse_leaderboard_image

    try:
        raw_entries = parse_leaderboard_image(image_bytes, media_type)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Image parsing failed: {exc}",
        )

    players = list_players(session)
    nyt_lookup = {p.nyt_username.lower(): p for p in players if p.nyt_username}

    parsed: list[ParsedLeaderboardEntry] = []
    for entry in raw_entries:
        username: str = entry.get("username", "")
        player = nyt_lookup.get(username.lower())
        parsed.append(
            ParsedLeaderboardEntry(
                nyt_username=username,
                time_str=entry.get("time", ""),
                seconds=int(entry.get("seconds", 0)),
                player_id=player.id if player else None,
                player_name=player.name if player else None,
                matched=player is not None,
            )
        )

    matched_count = sum(1 for e in parsed if e.matched)
    return ScreenshotParseResponse(
        puzzle_date=puzzle_date,
        parsed=parsed,
        matched_count=matched_count,
        unmatched_count=len(parsed) - matched_count,
    )


@router.get("/results", response_model=List[PuzzleResultPublic])
def get_results_for_date(
    puzzle_date: date = Query(..., description="Puzzle date (YYYY-MM-DD)"),
    session=Depends(get_session),
    _: None = Depends(require_admin),
) -> List[PuzzleResultPublic]:
    records = list_results_by_date(session, puzzle_date)
    return [PuzzleResultPublic.model_validate(record) for record in records]
