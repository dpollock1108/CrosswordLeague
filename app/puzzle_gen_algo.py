"""Algorithmic crossword grid generation using backtracking + constraint propagation.

The grid is filled from a word list using a CSP solver.  AI is NOT used here —
that happens in puzzle_gen_ai.py (clue writing only).
"""
from __future__ import annotations

import logging
import random
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Word list
# ---------------------------------------------------------------------------

# Preferred: curated crossword word list (semicolon-delimited, word;score).
# Fallback: plain one-word-per-line file, then system dictionary.
_WORD_LIST_PATHS = [
    Path(__file__).parent / "wordlist" / "spreadthewordlist.dict",
    Path(__file__).parent.parent / "data" / "wordlist.txt",
    Path("/usr/share/dict/words"),
]

# Minimum quality score for the scored word list (spreadthewordlist format).
# 50 = highest tier — common, well-known crossword entries.
_MIN_QUALITY_SCORE = 50

# Letters scored by how "crossword-friendly" they are (common = higher).
_LETTER_SCORE = {
    "E": 13, "T": 12, "A": 11, "O": 10, "I": 9, "N": 8, "S": 7, "R": 7,
    "H": 6, "L": 6, "D": 5, "C": 4, "U": 4, "M": 3, "P": 3, "F": 3,
    "G": 3, "W": 2, "Y": 2, "B": 2, "V": 1, "K": 1, "X": 1, "J": 1,
    "Q": 1, "Z": 1,
}


def _word_score(word: str) -> float:
    """Average letter-friendliness score.  Higher = more common letters."""
    if not word:
        return 0.0
    return sum(_LETTER_SCORE.get(c, 0) for c in word) / len(word)


def _word_score_total(word: str) -> int:
    """Total letter-friendliness score for candidate ranking."""
    return sum(_LETTER_SCORE.get(c, 0) for c in word)


def load_word_list(min_len: int = 3, max_len: int = 15, max_words: int = 0) -> list[str]:
    """Load word list, preferring a scored crossword dictionary.

    Supports two formats:
    - Scored: ``word;score`` per line (e.g. spreadthewordlist.dict)
    - Plain: one word per line (system dict fallback)
    """
    for path in _WORD_LIST_PATHS:
        if not path.exists():
            continue

        raw: set[str] = set()
        is_scored = path.suffix == ".dict"

        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                if is_scored:
                    # Format: word;score
                    parts = line.split(";")
                    if len(parts) != 2:
                        continue
                    word, score_str = parts
                    try:
                        score = int(score_str)
                    except ValueError:
                        continue
                    if score < _MIN_QUALITY_SCORE:
                        continue
                else:
                    word = line

                word = word.strip().upper()
                if not word.isalpha():
                    continue
                if min_len <= len(word) <= max_len:
                    raw.add(word)

        result = sorted(raw, key=_word_score, reverse=True)
        if max_words and len(result) > max_words:
            result = result[:max_words]
        logger.info(
            "Loaded %d words from %s%s",
            len(result), path,
            f" (score >= {_MIN_QUALITY_SCORE}, capped at {max_words})" if is_scored else "",
        )
        return result

    raise FileNotFoundError(
        "No word list found. Expected one of: "
        + ", ".join(str(p) for p in _WORD_LIST_PATHS)
    )


# ---------------------------------------------------------------------------
# Word index for fast pattern matching
# ---------------------------------------------------------------------------


class WordIndex:
    """Index words by length and by (position, letter) for fast constraint lookup."""

    def __init__(self, words: list[str]) -> None:
        self.by_length: dict[int, list[str]] = {}
        self._by_pos: dict[tuple[int, int, str], set[str]] = {}
        self.score: dict[str, int] = {}

        for word in words:
            n = len(word)
            self.score[word] = _word_score_total(word)
            self.by_length.setdefault(n, []).append(word)
            for i, ch in enumerate(word):
                self._by_pos.setdefault((n, i, ch), set()).add(word)

        # Pre-sort each length bucket best-first so callers get high-quality
        # words without re-sorting on every search.
        for n in self.by_length:
            self.by_length[n].sort(key=self.score.get, reverse=True)

    def matching(self, length: int, pattern: list[Optional[str]]) -> list[str]:
        """Words of *length* matching *pattern* (None = wildcard), best-first.

        For an unconstrained pattern this returns the pre-sorted bucket *by
        reference* (do not mutate).  Callers iterate and break early, so we
        never copy or re-sort the full 10k+ word list."""
        constrained = [(i, ch) for i, ch in enumerate(pattern) if ch is not None]

        if not constrained:
            return self.by_length.get(length, [])

        # Intersect candidate sets — start from the smallest set for speed
        sets = []
        for i, ch in constrained:
            s = self._by_pos.get((length, i, ch))
            if s is None or len(s) == 0:
                return []
            sets.append(s)

        sets.sort(key=len)
        result = set(sets[0])
        for s in sets[1:]:
            result &= s
            if not result:
                return []

        return sorted(result, key=self.score.get, reverse=True)

    def has_any(self, length: int, pattern: list[Optional[str]], exclude: set[str]) -> bool:
        """Fast check: is there at least one matching word not in *exclude*?"""
        for w in self.matching(length, pattern):
            if w not in exclude:
                return True
        return False


# ---------------------------------------------------------------------------
# Grid templates  (0 = white, 1 = black, 180° rotational symmetry)
#
# RULE: Every white-cell run (across or down) must be length ≥ 3.
#       _validate_template() enforces this at import time.
# ---------------------------------------------------------------------------


def _parse(rows: list[str]) -> list[list[int]]:
    return [[1 if ch == "#" else 0 for ch in row] for row in rows]


def _validate_template(template: list[list[int]], label: str = "") -> None:
    """Raise if any white-cell run is shorter than 3."""
    size = len(template)
    for r in range(size):
        c = 0
        while c < size:
            if template[r][c] == 0:
                start = c
                while c < size and template[r][c] == 0:
                    c += 1
                if (c - start) < 3:
                    raise ValueError(
                        f"Template {label}: across run of {c - start} at row {r} col {start}"
                    )
            else:
                c += 1
    for c in range(size):
        r = 0
        while r < size:
            if template[r][c] == 0:
                start = r
                while r < size and template[r][c] == 0:
                    r += 1
                if (r - start) < 3:
                    raise ValueError(
                        f"Template {label}: down run of {r - start} at col {c} row {start}"
                    )
            else:
                r += 1


# All templates verified: every white run ≥ 3 letters, 180° rotational symmetry.

TEMPLATES_5x5 = [
    # Fully open (word square)
    _parse([
        ".....",
        ".....",
        ".....",
        ".....",
        ".....",
    ]),
    # Corner pair
    _parse([
        "#....",
        ".....",
        ".....",
        ".....",
        "....#",
    ]),
]

# NOTE: 10x10 ("medium") automatic generation is not yet supported.  Filling a
# dense 10x10 interlocking grid from the word list is a hard search problem and
# the solver cannot do it within an acceptable time budget yet.  10x10 puzzles
# are built manually for now.  See generate_grid() below.
TEMPLATES_10x10: list[list[list[int]]] = []

# Validate all templates at import time
for _i, _t in enumerate(TEMPLATES_5x5):
    _validate_template(_t, f"5x5-{_i}")


# ---------------------------------------------------------------------------
# Slot extraction
# ---------------------------------------------------------------------------


class Slot:
    __slots__ = ("direction", "row", "col", "length", "cells", "crossings", "word")

    def __init__(self, direction: str, row: int, col: int, length: int,
                 cells: list[tuple[int, int]]) -> None:
        self.direction = direction
        self.row = row
        self.col = col
        self.length = length
        self.cells = cells
        self.crossings: list[tuple[int, int, int]] = []  # (other_slot, my_pos, their_pos)
        self.word: Optional[str] = None


def _extract_slots(template: list[list[int]], size: int) -> list[Slot]:
    """Extract word slots (runs of ≥3 white cells) and compute crossing info."""
    slots: list[Slot] = []

    # Across
    for r in range(size):
        c = 0
        while c < size:
            if template[r][c] == 0:
                start = c
                cells: list[tuple[int, int]] = []
                while c < size and template[r][c] == 0:
                    cells.append((r, c))
                    c += 1
                if len(cells) >= 3:
                    slots.append(Slot("across", r, start, len(cells), cells))
            else:
                c += 1

    # Down
    for c in range(size):
        r = 0
        while r < size:
            if template[r][c] == 0:
                start = r
                cells = []
                while r < size and template[r][c] == 0:
                    cells.append((r, c))
                    r += 1
                if len(cells) >= 3:
                    slots.append(Slot("down", start, c, len(cells), cells))
            else:
                r += 1

    # Build crossing map
    cell_to_slot: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for i, slot in enumerate(slots):
        for pos, cell in enumerate(slot.cells):
            cell_to_slot.setdefault(cell, []).append((i, pos))

    for i, slot in enumerate(slots):
        for pos, cell in enumerate(slot.cells):
            for other_idx, other_pos in cell_to_slot[cell]:
                if other_idx != i:
                    slot.crossings.append((other_idx, pos, other_pos))

    return slots


# ---------------------------------------------------------------------------
# Backtracking CSP solver
# ---------------------------------------------------------------------------


class GridSolver:
    """Fill grid slots with words using backtracking + forward checking."""

    def __init__(self, template: list[list[int]], word_index: WordIndex,
                 timeout: float = 30.0, max_candidates: int = 200) -> None:
        self.size = len(template)
        self.template = template
        self.slots = _extract_slots(template, self.size)
        self.word_index = word_index
        self.used_words: set[str] = set()
        self.timeout = timeout
        self.max_candidates = max_candidates
        self._start: float = 0
        self._checks: int = 0

    def solve(self) -> bool:
        """Try to fill all slots. Returns True on success.

        Strategy: fill the longest words first, then progressively shorter
        ones.  Long entries are the hardest to place (they span the most
        cells and have the fewest matching words), so committing to them up
        front means we discover dead ends early instead of after filling a
        bunch of easy short words.  Forward checking after every placement
        prunes choices that would strand a crossing slot with no candidates.
        """
        self._start = time.time()
        self._checks = 0

        # Static fill order: longest first, then most-crossed (most
        # constraining) first as a tiebreaker.
        order = sorted(
            range(len(self.slots)),
            key=lambda i: (-self.slots[i].length, -len(self.slots[i].crossings)),
        )
        return self._solve(order, 0)

    def _solve(self, order: list[int], idx: int) -> bool:
        """Backtrack through slots in longest-first order with forward checking."""
        if idx >= len(order):
            return True

        self._checks += 1
        if self._checks % 256 == 0 and time.time() - self._start > self.timeout:
            return False

        slot_idx = order[idx]
        slot = self.slots[slot_idx]
        pattern = self._pattern_for(slot)

        # matching() is best-first; take the top max_candidates not-yet-used by
        # breaking early — no full sort or full scan of the bucket.
        candidates: list[str] = []
        for w in self.word_index.matching(slot.length, pattern):
            if w not in self.used_words:
                candidates.append(w)
                if len(candidates) >= self.max_candidates:
                    break

        # Shuffle the top subset for variety between runs.
        random.shuffle(candidates)

        for word in candidates:
            slot.word = word
            self.used_words.add(word)

            if self._forward_check_fast(slot_idx) and self._solve(order, idx + 1):
                return True

            slot.word = None
            self.used_words.remove(word)

        return False

    def _pattern_for(self, slot: Slot) -> list[Optional[str]]:
        """Get the current constraint pattern for a slot."""
        pattern: list[Optional[str]] = [None] * slot.length
        for other_idx, my_pos, their_pos in slot.crossings:
            other = self.slots[other_idx]
            if other.word:
                pattern[my_pos] = other.word[their_pos]
        return pattern

    def _forward_check_fast(self, placed_idx: int) -> bool:
        """Verify every unfilled crossing slot still has ≥1 valid candidate."""
        placed = self.slots[placed_idx]
        for other_idx, _, _ in placed.crossings:
            other = self.slots[other_idx]
            if other.word is not None:
                continue
            pattern = self._pattern_for(other)
            if not self.word_index.has_any(other.length, pattern, self.used_words):
                return False
        return True

    def get_filled_grid(self) -> list[list[dict]]:
        """Return grid as 2D cell array [{letter, is_black}, ...]."""
        grid = [
            [
                {"letter": "", "is_black": bool(self.template[r][c])}
                for c in range(self.size)
            ]
            for r in range(self.size)
        ]
        for slot in self.slots:
            if slot.word:
                for i, (r, c) in enumerate(slot.cells):
                    grid[r][c]["letter"] = slot.word[i]
        return grid


# ---------------------------------------------------------------------------
# Clue numbering
# ---------------------------------------------------------------------------


def _number_cells(template: list[list[int]], size: int) -> dict[tuple[int, int], int]:
    """Assign standard crossword numbers to cells."""
    numbers: dict[tuple[int, int], int] = {}
    num = 1
    for r in range(size):
        for c in range(size):
            if template[r][c]:
                continue
            starts_across = (
                (c == 0 or template[r][c - 1])
                and c + 1 < size
                and not template[r][c + 1]
            )
            starts_down = (
                (r == 0 or template[r - 1][c])
                and r + 1 < size
                and not template[r + 1][c]
            )
            if starts_across or starts_down:
                numbers[(r, c)] = num
                num += 1
    return numbers


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_grid(
    size: int = 5,
    max_attempts: int = 8,
    timeout_per_attempt: float = 10.0,
) -> dict:
    """Generate a filled crossword grid.

    Returns:
        {
            "grid_data": {"cells": [[{letter, is_black}, ...], ...]},
            "words": [
                {"number": 1, "direction": "across", "answer": "HELLO",
                 "row": 0, "col": 0, "length": 5},
                ...
            ],
            "size": 5,
        }

    Raises ValueError if no valid grid could be built.
    """
    if size > 5:
        raise NotImplementedError(
            "Automatic generation currently supports 5x5 minis only. "
            "Build larger grids manually."
        )

    templates = TEMPLATES_5x5
    words = load_word_list(min_len=3, max_len=max(size, 15))
    word_index = WordIndex(words)

    logger.info(
        "Generating %dx%d grid from %d words, %d templates",
        size, size, len(words), len(templates),
    )

    # Shuffle templates so we don't always start with the same one
    shuffled = list(templates)
    random.shuffle(shuffled)

    for attempt in range(max_attempts):
        template = shuffled[attempt % len(shuffled)]
        solver = GridSolver(
            template, word_index,
            timeout=timeout_per_attempt,
            max_candidates=200 if size <= 5 else 80,
        )

        if solver.solve():
            grid = solver.get_filled_grid()
            cell_numbers = _number_cells(template, size)

            word_entries = []
            for slot in solver.slots:
                if slot.word:
                    num = cell_numbers.get((slot.row, slot.col))
                    if num is not None:
                        word_entries.append({
                            "number": num,
                            "direction": slot.direction,
                            "answer": slot.word,
                            "row": slot.row,
                            "col": slot.col,
                            "length": slot.length,
                        })

            word_entries.sort(key=lambda w: (w["direction"] != "across", w["number"]))

            logger.info(
                "Grid filled on attempt %d/%d (%d words, %dx%d, %d backtracks)",
                attempt + 1, max_attempts, len(word_entries), size, size,
                solver._checks,
            )
            return {
                "grid_data": {"cells": grid},
                "words": word_entries,
                "size": size,
            }

        logger.info("Grid attempt %d/%d failed, trying next template...", attempt + 1, max_attempts)

    raise ValueError(
        f"Could not generate a valid {size}x{size} grid after {max_attempts} attempts"
    )
