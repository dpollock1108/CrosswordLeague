"""AI-powered crossword clue writer using Claude.

The grid is built algorithmically (puzzle_gen_algo.py).  This module's only job
is to write clever clues and a title for the words that the algorithm placed.
"""
from __future__ import annotations

import json
import logging

from anthropic import Anthropic

from .config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert crossword clue writer. Given a list of words, write concise, \
fair crossword clues and a short puzzle title.

Guidelines:
- Clues should be concise (typically 2-8 words).
- Match the requested difficulty level.
- Proper nouns are perfectly fine — clue them with context \
  (e.g., "Tesla CEO Musk" for ELON, "Emerald Isle" for IRELAND).
- Abbreviations are fine — indicate with "Abbr." at the end of the clue \
  (e.g., "Federal investigators: Abbr." for FBI).
- Use a mix of:
  • Straight definitions
  • Wordplay / double meanings
  • Fill-in-the-blank ("___ of the crop")
  • Pop-culture references (when the word is a name or brand)
- EASY difficulty: straightforward definitions, common knowledge.
- MEDIUM difficulty: some misdirection, less obvious definitions.
- HARD difficulty: clever wordplay, misdirection, cryptic-lite.

Return ONLY valid JSON — no markdown fences, no commentary."""

USER_TEMPLATE = """Write clues for these crossword words at {difficulty} difficulty.

Words:
{word_list}

Return this exact JSON structure:
{{
  "title": "A short creative puzzle title (2-5 words)",
  "clues": {{
    "WORD": "clue text",
    "ANOTHERWORD": "clue text"
  }}
}}

Every word listed above MUST have a clue. Return ONLY the JSON."""


def generate_clues(
    words: list[str],
    difficulty: str = "medium",
    max_retries: int = 3,
) -> dict[str, str]:
    """Write clues for a list of words using Claude.

    Args:
        words: Uppercase crossword answers (e.g., ["HELLO", "WORLD"]).
        difficulty: "easy", "medium", or "hard".
        max_retries: Number of attempts before giving up.

    Returns:
        {"title": "...", "clues": {"HELLO": "Greeting", "WORLD": "Planet Earth"}}

    Raises ValueError on failure.
    """
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    client = Anthropic(api_key=settings.anthropic_api_key)
    unique_words = sorted(set(words))
    word_list_str = "\n".join(f"- {w}" for w in unique_words)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": USER_TEMPLATE.format(
                            difficulty=difficulty.upper(),
                            word_list=word_list_str,
                        ),
                    }
                ],
            )

            text = ""
            for block in response.content:
                if block.type == "text":
                    text += block.text

            # Strip markdown fences if present
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                text = text.rsplit("```", 1)[0]
                text = text.strip()

            data = json.loads(text)
            clues = data.get("clues", {})
            title = data.get("title", "Daily Crossword")

            # Normalize keys to uppercase
            clues = {k.upper(): v for k, v in clues.items()}

            # Check coverage
            missing = [w for w in unique_words if w not in clues]
            if missing:
                logger.warning(
                    "Clue attempt %d missing %d words: %s",
                    attempt + 1, len(missing), missing[:5],
                )
                if attempt < max_retries - 1:
                    continue
                # Fill missing with simple placeholder
                for w in missing:
                    clues[w] = f"[Clue needed for {w}]"

            logger.info(
                "Generated %d clues on attempt %d/%d",
                len(clues), attempt + 1, max_retries,
            )
            return {"title": title, "clues": clues}

        except json.JSONDecodeError as exc:
            logger.warning("Clue generation attempt %d returned invalid JSON: %s", attempt + 1, exc)
            if attempt < max_retries - 1:
                continue
            raise ValueError(f"Failed to parse clue JSON after {max_retries} attempts") from exc

    raise ValueError(f"Clue generation failed after {max_retries} attempts")


# ---------------------------------------------------------------------------
# Legacy compat — full puzzle generation (now delegates to algo + clues)
# ---------------------------------------------------------------------------


def generate_puzzle(size: int = 5, difficulty: str = "medium", max_retries: int = 3) -> dict:
    """Generate a complete crossword puzzle (grid + clues).

    This is the main entry point called by the /puzzles/generate endpoint.
    1. Build grid algorithmically
    2. Write clues with AI
    3. Combine into the puzzle dict format
    """
    from .puzzle_gen_algo import generate_grid

    # Step 1: algorithmic grid
    grid_result = generate_grid(size=size)

    # Step 2: AI clues
    word_answers = [w["answer"] for w in grid_result["words"]]
    clue_result = generate_clues(word_answers, difficulty=difficulty, max_retries=max_retries)

    # Step 3: assemble
    across_clues = []
    down_clues = []

    for w in grid_result["words"]:
        clue_entry = {
            "number": w["number"],
            "clue": clue_result["clues"].get(w["answer"], f"[{w['answer']}]"),
            "answer": w["answer"],
            "row": w["row"],
            "col": w["col"],
            "length": w["length"],
        }
        if w["direction"] == "across":
            across_clues.append(clue_entry)
        else:
            down_clues.append(clue_entry)

    return {
        "grid_data": grid_result["grid_data"],
        "clues_data": {"across": across_clues, "down": down_clues},
        "title": clue_result.get("title", "Daily Crossword"),
    }
