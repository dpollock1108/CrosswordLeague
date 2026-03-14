from __future__ import annotations

import base64
import json
import re
from typing import List

import anthropic

from .config import settings


def parse_leaderboard_image(image_bytes: bytes, media_type: str) -> List[dict]:
    """
    Call Claude vision API to extract NYT usernames and solve times from a
    leaderboard screenshot.

    Returns a list of dicts: [{"username": str, "time": str, "seconds": int}, ...]
    Only includes players who have a visible completion time.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "This is a screenshot of the NYT Mini crossword friends leaderboard "
                            "showing solve times.\n\n"
                            "Extract every player who has a visible completion time (e.g. 0:43, 1:05). "
                            "Skip any player whose time shows as a dash (—) or is absent.\n\n"
                            "Return ONLY a JSON array — no explanation, no markdown fences — in this exact format:\n"
                            '[{"username": "SeanHarveyDent", "time": "0:43", "seconds": 43}, ...]\n\n'
                            "Rules:\n"
                            "- username: exact NYT username as displayed (strip any trailing ' (you)' suffix)\n"
                            "- time: the MM:SS string as shown\n"
                            "- seconds: integer total seconds (e.g. 1:05 = 65, 0:43 = 43)"
                        ),
                    },
                ],
            }
        ],
    )

    raw = response.content[0].text.strip()

    # Strip accidental markdown code fences if the model adds them
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    return json.loads(raw)
