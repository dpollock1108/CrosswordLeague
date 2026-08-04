from __future__ import annotations

from app.qotd_verify import (
    AUTO_APPROVE_CONFIDENCE,
    VerificationResult,
    apply_policy,
    verify_question,
)


def test_confident_agreement_is_approved():
    result = apply_policy(
        VerificationResult(verdict="approve", confidence=95, correct_answer_index=2),
        answer_index=2,
    )
    assert result.verdict == "approve"


def test_disagreement_on_the_answer_is_rejected():
    result = apply_policy(
        VerificationResult(verdict="approve", confidence=99, correct_answer_index=0),
        answer_index=3,
    )
    assert result.verdict == "reject"
    assert any("not the submitted" in issue for issue in result.issues)


def test_low_confidence_approval_goes_to_human_review():
    result = apply_policy(
        VerificationResult(
            verdict="approve",
            confidence=AUTO_APPROVE_CONFIDENCE - 1,
            correct_answer_index=1,
        ),
        answer_index=1,
    )
    assert result.verdict == "needs_review"


def test_low_confidence_rejection_also_goes_to_human_review():
    result = apply_policy(
        VerificationResult(verdict="reject", confidence=40, correct_answer_index=None),
        answer_index=1,
    )
    assert result.verdict == "needs_review"


def test_confident_rejection_stands():
    result = apply_policy(
        VerificationResult(
            verdict="reject", confidence=95, issues=["Two choices are correct."]
        ),
        answer_index=1,
    )
    assert result.verdict == "reject"


def test_missing_api_key_degrades_to_review_rather_than_raising(monkeypatch):
    monkeypatch.setattr("app.qotd_verify.settings.anthropic_api_key", "")
    result = verify_question("Who painted Guernica?", ["Dali", "Picasso", "Miro", "Goya"], 1)
    assert result.verdict == "needs_review"
    assert "not configured" in result.notes


def test_verifier_errors_degrade_to_review(monkeypatch):
    monkeypatch.setattr("app.qotd_verify.settings.anthropic_api_key", "test-key")

    class BoomClient:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("connection reset")

    monkeypatch.setattr("anthropic.Anthropic", BoomClient)
    result = verify_question("Who painted Guernica?", ["Dali", "Picasso", "Miro", "Goya"], 1)
    assert result.verdict == "needs_review"
    assert "connection reset" in result.notes
