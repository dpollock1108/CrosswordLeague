"""Puzzle generation protocol and validation utilities."""
from __future__ import annotations

import json
from typing import Protocol


class PuzzleGenerator(Protocol):
    """Interface for crossword puzzle generators."""

    def generate(self, size: int, difficulty: str = "medium") -> dict:
        """Generate a crossword puzzle.

        Returns:
            {
                "grid_data": {"cells": [[{"letter": "A", "is_black": false}, ...], ...]},
                "clues_data": {
                    "across": [{"number": 1, "clue": "...", "answer": "...", "row": 0, "col": 0, "length": 3}, ...],
                    "down": [...]
                },
                "title": "Optional title"
            }
        """
        ...


def validate_puzzle(data: dict, size: int) -> list[str]:
    """Validate puzzle data structure. Returns list of error messages (empty = valid)."""
    errors = []

    grid_data = data.get("grid_data", {})
    clues_data = data.get("clues_data", {})

    # Validate grid
    cells = grid_data.get("cells", [])
    if len(cells) != size:
        errors.append(f"Grid has {len(cells)} rows, expected {size}")
        return errors

    for r, row in enumerate(cells):
        if len(row) != size:
            errors.append(f"Row {r} has {len(row)} cells, expected {size}")

    # Validate all non-black cells have letters
    for r, row in enumerate(cells):
        for c, cell in enumerate(row):
            if not cell.get("is_black") and not cell.get("letter"):
                errors.append(f"Cell ({r},{c}) is not black but has no letter")

    # Validate clues exist
    across = clues_data.get("across", [])
    down = clues_data.get("down", [])
    if not across:
        errors.append("No across clues")
    if not down:
        errors.append("No down clues")

    # Validate each clue has required fields
    for direction, clues in [("across", across), ("down", down)]:
        for i, clue in enumerate(clues):
            for field in ("number", "clue", "answer", "row", "col", "length"):
                if field not in clue:
                    errors.append(f"{direction} clue {i} missing '{field}'")

    # Validate clue answers match grid
    for direction, clues in [("across", across), ("down", down)]:
        for clue in clues:
            answer = clue.get("answer", "")
            row, col, length = clue.get("row", 0), clue.get("col", 0), clue.get("length", 0)

            if len(answer) != length:
                errors.append(f"{direction} #{clue.get('number')}: answer length {len(answer)} != declared length {length}")
                continue

            for i, letter in enumerate(answer):
                if direction == "across":
                    r, c = row, col + i
                else:
                    r, c = row + i, col

                if r >= size or c >= size:
                    errors.append(f"{direction} #{clue.get('number')}: position ({r},{c}) out of bounds")
                    continue

                grid_letter = cells[r][c].get("letter", "").upper()
                if grid_letter != letter.upper():
                    errors.append(
                        f"{direction} #{clue.get('number')}: grid[{r}][{c}] = '{grid_letter}' but answer expects '{letter.upper()}'"
                    )

    return errors


def puzzle_to_json_strings(data: dict) -> tuple[str, str]:
    """Convert puzzle dict to (grid_data_json, clues_data_json) strings for DB storage."""
    return json.dumps(data["grid_data"]), json.dumps(data["clues_data"])
