"""AI correctness verification for user-submitted trivia questions.

Every question players see is written by a user, so the bar for shipping one is
that a model independently agrees the marked answer is right and that no other
choice could also be defended. The verifier is deliberately conservative: it
only clears a question when it is confident *and* it independently picks the
same answer the submitter marked. Anything else lands in the admin review
queue rather than being silently rejected — a good question with a shaky
verdict is worth a human glance.

With no ANTHROPIC_API_KEY configured the verifier degrades to "needs_review"
instead of raising, so submissions still work in local dev.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from .config import settings

logger = logging.getLogger(__name__)

# Confidence (0-100) the model must report before a question ships unreviewed.
AUTO_APPROVE_CONFIDENCE = 85
# Below this, a "reject" verdict is downgraded to review rather than a hard no.
AUTO_REJECT_CONFIDENCE = 80

SYSTEM_PROMPT = """You are a fact-checker for a daily general-knowledge trivia game. \
Players get one question per day and are ranked on correctness and speed, so a question \
that is wrong, ambiguous, or has two defensible answers ruins the day for everyone.

Check the submitted question against these criteria:
1. FACTUAL: the choice the submitter marked as correct is actually correct.
2. UNIQUE: no other choice is also correct or arguably correct.
3. UNAMBIGUOUS: the question has exactly one clear reading.
4. STABLE: the answer will not change over time (reject "current" office-holders, \
reigning champions, "this year" phrasings, populations, and similar moving targets).
5. GENERAL: answerable by a well-read non-specialist; not a niche personal detail.
6. CLEAN: no slurs, harassment, or targeting of private individuals.
7. SELF-CONTAINED: does not depend on an image, link, or outside context.

Work out the answer yourself BEFORE looking at which choice was marked, then compare.

Verdicts:
- "approve": all criteria pass and you independently arrive at the marked answer.
- "needs_review": you are unsure, the wording is fixable, or the question is borderline.
- "reject": factually wrong, has multiple correct answers, is unstable, or violates \
the content rules.

Return ONLY valid JSON — no markdown fences, no commentary."""

USER_TEMPLATE = """Verify this submitted trivia question.

Question: {prompt}

Choices:
{choice_list}

Submitter marked as correct: [{answer_index}] {answer_text}
Submitter's explanation: {explanation}

Return this exact JSON structure:
{{
  "verdict": "approve" | "needs_review" | "reject",
  "confidence": 0-100,
  "correct_answer_index": <the index YOU believe is correct, or null if none is>,
  "issues": ["short description of each problem found"],
  "explanation": "one or two sentences explaining why the correct answer is correct",
  "category": "a short topic label, e.g. Geography, Science, History, Sport, Film",
  "difficulty": "easy" | "medium" | "hard"
}}

Return ONLY the JSON."""


@dataclass
class VerificationResult:
    """Outcome of verifying one question."""

    verdict: str  # "approve", "needs_review", "reject"
    confidence: int = 0
    issues: List[str] = field(default_factory=list)
    correct_answer_index: Optional[int] = None
    explanation: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None

    @property
    def notes(self) -> str:
        """Human-readable summary stored on the question for the review queue."""
        if self.issues:
            return "; ".join(self.issues)
        if self.verdict == "approve":
            return "Verified: answer confirmed and no competing choice found."
        return "No detail provided."


def _needs_review(reason: str) -> VerificationResult:
    return VerificationResult(verdict="needs_review", confidence=0, issues=[reason])


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
        text = text.strip()
    return json.loads(text)


def verify_question(
    prompt: str,
    choices: List[str],
    answer_index: int,
    explanation: Optional[str] = None,
) -> VerificationResult:
    """Fact-check a submitted question. Never raises — failures become reviews."""
    if not settings.anthropic_api_key:
        return _needs_review("AI verification unavailable (ANTHROPIC_API_KEY not configured).")

    choice_list = "\n".join(f"[{i}] {c}" for i, c in enumerate(choices))

    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": USER_TEMPLATE.format(
                        prompt=prompt,
                        choice_list=choice_list,
                        answer_index=answer_index,
                        answer_text=choices[answer_index],
                        explanation=explanation or "(none given)",
                    ),
                }
            ],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        data = _extract_json(text)
    except json.JSONDecodeError as exc:
        logger.warning("Question verification returned invalid JSON: %s", exc)
        return _needs_review("Verifier returned an unreadable response.")
    except Exception as exc:  # network, auth, rate limit, SDK errors
        logger.warning("Question verification failed: %s", exc)
        return _needs_review(f"Verifier error: {exc}")

    verdict = str(data.get("verdict", "needs_review")).lower()
    if verdict not in {"approve", "needs_review", "reject"}:
        verdict = "needs_review"

    try:
        confidence = max(0, min(100, int(data.get("confidence") or 0)))
    except (TypeError, ValueError):
        confidence = 0

    raw_index = data.get("correct_answer_index")
    model_index: Optional[int] = None
    if isinstance(raw_index, int) and 0 <= raw_index < len(choices):
        model_index = raw_index

    issues = [str(i) for i in (data.get("issues") or []) if str(i).strip()]

    result = VerificationResult(
        verdict=verdict,
        confidence=confidence,
        issues=issues,
        correct_answer_index=model_index,
        explanation=(data.get("explanation") or None),
        category=(data.get("category") or None),
        difficulty=(data.get("difficulty") or None),
    )
    return apply_policy(result, answer_index)


def apply_policy(result: VerificationResult, answer_index: int) -> VerificationResult:
    """Tighten a raw model verdict into the verdict we act on.

    An "approve" only survives if the model was confident and independently
    landed on the submitter's answer. A "reject" only survives if the model was
    confident; otherwise a human decides.
    """
    if result.verdict == "approve":
        if result.correct_answer_index is not None and result.correct_answer_index != answer_index:
            result.verdict = "reject"
            result.issues.append(
                f"Verifier picked choice [{result.correct_answer_index}], "
                f"not the submitted [{answer_index}]."
            )
        elif result.confidence < AUTO_APPROVE_CONFIDENCE:
            result.verdict = "needs_review"
            result.issues.append(
                f"Confidence {result.confidence} is below the "
                f"{AUTO_APPROVE_CONFIDENCE} auto-approval threshold."
            )
    elif result.verdict == "reject" and result.confidence < AUTO_REJECT_CONFIDENCE:
        result.verdict = "needs_review"
        result.issues.append(
            f"Rejected with only {result.confidence} confidence; sending to human review."
        )
    return result
