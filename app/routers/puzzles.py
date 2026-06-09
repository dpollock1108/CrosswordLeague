from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from ..auth import get_current_user, get_optional_user, require_admin_or_token
from ..database import get_session
from ..models import Puzzle, PuzzleResult, SolveAttempt, User
from ..schemas import (
    GridSubmission,
    PuzzleAdminPublic,
    PuzzleCreate,
    PuzzleGenerateRequest,
    PuzzlePublic,
    PuzzleTodayResponse,
    SolveAttemptPublic,
    SubmitResult,
)
from ..scoring import _time_points

router = APIRouter(prefix="/puzzles", tags=["puzzles"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _strip_answers_from_grid(grid_data: str) -> str:
    """Remove solution letters from grid_data, keeping only structure."""
    grid = json.loads(grid_data)
    cells = grid.get("cells", [])
    for row in cells:
        for cell in row:
            if "letter" in cell:
                cell["letter"] = ""
    return json.dumps(grid)


def _strip_answers_from_clues(clues_data: str) -> str:
    """Remove answer field from each clue."""
    clues = json.loads(clues_data)
    for direction in ("across", "down"):
        for clue in clues.get(direction, []):
            clue.pop("answer", None)
    return json.dumps(clues)


def _puzzle_to_public(puzzle: Puzzle) -> PuzzlePublic:
    """Convert a Puzzle to its public (answer-stripped) representation."""
    return PuzzlePublic(
        id=puzzle.id,
        puzzle_type=puzzle.puzzle_type,
        puzzle_date=puzzle.puzzle_date,
        size=puzzle.size,
        grid_data=_strip_answers_from_grid(puzzle.grid_data),
        clues_data=_strip_answers_from_clues(puzzle.clues_data),
        title=puzzle.title,
        difficulty=puzzle.difficulty,
        status=puzzle.status,
        created_at=puzzle.created_at,
    )


def _validate_submission(puzzle: Puzzle, grid_state: str) -> tuple[bool, list[dict]]:
    """Check submitted grid against puzzle solution. Returns (correct, errors)."""
    solution = json.loads(puzzle.grid_data)
    submission = json.loads(grid_state)

    solution_cells = solution.get("cells", [])
    submitted_cells = submission.get("cells", [])
    errors = []

    for r, (sol_row, sub_row) in enumerate(zip(solution_cells, submitted_cells)):
        for c, (sol_cell, sub_cell) in enumerate(zip(sol_row, sub_row)):
            if sol_cell.get("is_black"):
                continue
            expected = sol_cell.get("letter", "").upper()
            actual = sub_cell.get("letter", "").upper()
            if expected != actual:
                errors.append({"row": r, "col": c})

    return len(errors) == 0, errors


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@router.get("/today", response_model=PuzzleTodayResponse)
def get_today_puzzle(
    type: str = Query("mini_5x5", description="Puzzle type"),
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_optional_user),
) -> PuzzleTodayResponse:
    """Get today's published puzzle (without answers)."""
    today = date.today()
    puzzle = session.exec(
        select(Puzzle).where(
            Puzzle.puzzle_type == type,
            Puzzle.puzzle_date == today,
            Puzzle.status == "published",
        )
    ).first()

    if not puzzle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No published {type} puzzle for today.",
        )

    attempt = None
    if user:
        attempt_record = session.exec(
            select(SolveAttempt).where(
                SolveAttempt.user_id == user.id,
                SolveAttempt.puzzle_id == puzzle.id,
            )
        ).first()
        if attempt_record:
            attempt = SolveAttemptPublic.model_validate(attempt_record)

    return PuzzleTodayResponse(
        puzzle=_puzzle_to_public(puzzle),
        attempt=attempt,
    )


@router.get("/{puzzle_id}", response_model=PuzzleTodayResponse)
def get_puzzle(
    puzzle_id: int,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_optional_user),
) -> PuzzleTodayResponse:
    puzzle = session.get(Puzzle, puzzle_id)
    if not puzzle or puzzle.status != "published":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puzzle not found.")

    attempt = None
    if user:
        attempt_record = session.exec(
            select(SolveAttempt).where(
                SolveAttempt.user_id == user.id,
                SolveAttempt.puzzle_id == puzzle.id,
            )
        ).first()
        if attempt_record:
            attempt = SolveAttemptPublic.model_validate(attempt_record)

    return PuzzleTodayResponse(
        puzzle=_puzzle_to_public(puzzle),
        attempt=attempt,
    )


# ---------------------------------------------------------------------------
# Solve flow (requires auth)
# ---------------------------------------------------------------------------


@router.post("/{puzzle_id}/start", response_model=SolveAttemptPublic, status_code=status.HTTP_201_CREATED)
def start_solve(
    puzzle_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SolveAttemptPublic:
    """Start or resume a solve attempt. Idempotent — returns existing if already started."""
    puzzle = session.get(Puzzle, puzzle_id)
    if not puzzle or puzzle.status != "published":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puzzle not found.")

    existing = session.exec(
        select(SolveAttempt).where(
            SolveAttempt.user_id == user.id,
            SolveAttempt.puzzle_id == puzzle_id,
        )
    ).first()

    if existing:
        return SolveAttemptPublic.model_validate(existing)

    attempt = SolveAttempt(
        user_id=user.id,
        puzzle_id=puzzle_id,
        started_at=datetime.utcnow(),
    )
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return SolveAttemptPublic.model_validate(attempt)


@router.post("/{puzzle_id}/save", response_model=SolveAttemptPublic)
def save_progress(
    puzzle_id: int,
    body: GridSubmission,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SolveAttemptPublic:
    """Save intermediate grid state for resume support."""
    attempt = session.exec(
        select(SolveAttempt).where(
            SolveAttempt.user_id == user.id,
            SolveAttempt.puzzle_id == puzzle_id,
        )
    ).first()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active attempt. Call /start first.")
    if attempt.is_complete:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Puzzle already completed.")

    attempt.grid_state = body.grid_state
    session.add(attempt)
    session.commit()
    session.refresh(attempt)
    return SolveAttemptPublic.model_validate(attempt)


@router.post("/{puzzle_id}/submit", response_model=SubmitResult)
def submit_solve(
    puzzle_id: int,
    body: GridSubmission,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SubmitResult:
    """Submit completed grid for server-side validation."""
    puzzle = session.get(Puzzle, puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puzzle not found.")

    attempt = session.exec(
        select(SolveAttempt).where(
            SolveAttempt.user_id == user.id,
            SolveAttempt.puzzle_id == puzzle_id,
        )
    ).first()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active attempt. Call /start first.")
    if attempt.is_complete:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Puzzle already completed.")

    correct, errors = _validate_submission(puzzle, body.grid_state)

    if not correct:
        return SubmitResult(correct=False, errors=errors)

    # Mark complete
    now = datetime.utcnow()
    elapsed = int((now - attempt.started_at).total_seconds())
    attempt.completed_at = now
    attempt.seconds = elapsed
    attempt.is_complete = True
    attempt.grid_state = body.grid_state
    session.add(attempt)

    # Create PuzzleResult for scoring pipeline
    if user.player_id:
        result = PuzzleResult(
            player_id=user.player_id,
            puzzle_date=puzzle.puzzle_date,
            puzzle_type=puzzle.puzzle_type,
            seconds=elapsed,
            source="self-solve",
        )
        session.add(result)

    session.commit()

    points = _time_points(elapsed)
    return SubmitResult(correct=True, seconds=elapsed, points=points)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin/list", response_model=list[PuzzleAdminPublic])
def list_puzzles_admin(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: draft or published"),
    puzzle_type: Optional[str] = Query(None, description="Filter by puzzle_type"),
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> list[PuzzleAdminPublic]:
    """List all puzzles (admin). Optional status and type filters."""
    stmt = select(Puzzle).order_by(Puzzle.puzzle_date.desc(), Puzzle.created_at.desc())  # type: ignore[union-attr]
    if status_filter:
        stmt = stmt.where(Puzzle.status == status_filter)
    if puzzle_type:
        stmt = stmt.where(Puzzle.puzzle_type == puzzle_type)
    puzzles = session.exec(stmt).all()
    return [PuzzleAdminPublic.model_validate(p) for p in puzzles]


@router.post("", response_model=PuzzleAdminPublic, status_code=status.HTTP_201_CREATED)
def create_puzzle(
    body: PuzzleCreate,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> PuzzleAdminPublic:
    """Manually create a puzzle (admin)."""
    puzzle = Puzzle(
        puzzle_type=body.puzzle_type,
        puzzle_date=body.puzzle_date,
        size=body.size,
        grid_data=body.grid_data,
        clues_data=body.clues_data,
        title=body.title,
        difficulty=body.difficulty,
        created_by="manual",
    )
    session.add(puzzle)
    session.commit()
    session.refresh(puzzle)
    return PuzzleAdminPublic.model_validate(puzzle)


@router.post("/generate", response_model=PuzzleAdminPublic, status_code=status.HTTP_201_CREATED)
def generate_puzzle_endpoint(
    body: PuzzleGenerateRequest,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> PuzzleAdminPublic:
    """Generate a puzzle using AI and save as draft (admin)."""
    from ..puzzle_gen import puzzle_to_json_strings
    from ..puzzle_gen_ai import generate_puzzle as ai_generate

    if body.puzzle_type != "mini_5x5":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Automatic generation is currently available for 5x5 minis only. "
                "Build a 10x10 manually in the Manual Builder for now."
            ),
        )

    size = 5
    data = ai_generate(size=size, difficulty=body.difficulty)
    grid_json, clues_json = puzzle_to_json_strings(data)

    puzzle = Puzzle(
        puzzle_type=body.puzzle_type,
        puzzle_date=body.puzzle_date,
        size=size,
        grid_data=grid_json,
        clues_data=clues_json,
        title=data.get("title"),
        difficulty=body.difficulty,
        created_by="ai",
    )
    session.add(puzzle)
    session.commit()
    session.refresh(puzzle)
    return PuzzleAdminPublic.model_validate(puzzle)


@router.post("/{puzzle_id}/publish", response_model=PuzzleAdminPublic)
def publish_puzzle(
    puzzle_id: int,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> PuzzleAdminPublic:
    """Publish a draft puzzle (admin)."""
    puzzle = session.get(Puzzle, puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puzzle not found.")

    puzzle.status = "published"
    puzzle.published_at = datetime.utcnow()
    session.add(puzzle)
    session.commit()
    session.refresh(puzzle)
    return PuzzleAdminPublic.model_validate(puzzle)


@router.delete("/{puzzle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_puzzle(
    puzzle_id: int,
    session: Session = Depends(get_session),
    _: None = Depends(require_admin_or_token),
) -> None:
    """Delete a draft puzzle (admin). Published puzzles cannot be deleted."""
    puzzle = session.get(Puzzle, puzzle_id)
    if not puzzle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Puzzle not found.")
    if puzzle.status == "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a published puzzle. Unpublish it first.",
        )
    session.delete(puzzle)
    session.commit()
