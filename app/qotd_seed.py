from __future__ import annotations

"""
Seed the QOTD question bank with a starter set.

Questions are normally player-submitted and cleared by the AI fact-checker
before they can go live. This script exists so a fresh install has something to
play on day one; the entries below are hand-written and inserted pre-approved,
marked as seeded in their verification notes so they're distinguishable from
verified user submissions in the admin queue.

Usage:
    uv run python -m app.qotd_seed
"""

import json
from datetime import datetime
from typing import List, Optional, Tuple

from sqlmodel import Session, select

from .database import engine, init_db
from .models import TriviaQuestion

SEED_NOTE = "Seeded starter question (hand-written, not AI-verified)."

# (prompt, choices, answer_index, explanation, category, difficulty)
StarterQuestion = Tuple[str, List[str], int, str, str, str]

STARTER_QUESTIONS: List[StarterQuestion] = [
    (
        "Which planet in our solar system has the shortest day?",
        ["Mercury", "Jupiter", "Mars", "Venus"],
        1,
        "Jupiter rotates once about every 10 hours, the fastest of any planet in the solar system.",
        "Science",
        "medium",
    ),
    (
        "The Danube river flows through more countries than any other. How many does it pass through?",
        ["Six", "Eight", "Ten", "Twelve"],
        2,
        "The Danube flows through ten countries, from Germany to Ukraine.",
        "Geography",
        "hard",
    ),
    (
        "Who wrote the novel 'Things Fall Apart'?",
        ["Wole Soyinka", "Chinua Achebe", "Ngugi wa Thiong'o", "Ben Okri"],
        1,
        "Chinua Achebe published 'Things Fall Apart' in 1958.",
        "Literature",
        "easy",
    ),
    (
        "In music, how many lines does a standard staff have?",
        ["Four", "Five", "Six", "Seven"],
        1,
        "A standard musical staff has five lines and four spaces.",
        "Music",
        "easy",
    ),
    (
        "Which element has the chemical symbol 'W'?",
        ["Tungsten", "Tin", "Titanium", "Uranium"],
        0,
        "W comes from wolfram, the German name for tungsten.",
        "Science",
        "medium",
    ),
    (
        "The Rosetta Stone is inscribed in three scripts. Which of these is NOT one of them?",
        ["Ancient Greek", "Demotic", "Hieroglyphic", "Latin"],
        3,
        "The stone carries Greek, Demotic, and Egyptian hieroglyphs — no Latin.",
        "History",
        "medium",
    ),
    (
        "Which country hosted the first FIFA World Cup, in 1930?",
        ["Brazil", "Italy", "Uruguay", "Argentina"],
        2,
        "Uruguay hosted and won the inaugural tournament in 1930.",
        "Sport",
        "easy",
    ),
    (
        "What is the largest organ of the human body?",
        ["The liver", "The skin", "The lungs", "The small intestine"],
        1,
        "Skin is the body's largest organ by both surface area and weight.",
        "Science",
        "easy",
    ),
    (
        "In the film 'Casablanca', what is the name of Rick's nightclub?",
        ["The Blue Parrot", "Cafe Americain", "Rick's Cafe Americain", "The Casbah"],
        2,
        "The club is Rick's Cafe Americain; the Blue Parrot is Ferrari's rival establishment.",
        "Film",
        "medium",
    ),
    (
        "Which mathematician's last theorem went unproven for over 350 years?",
        ["Euler", "Fermat", "Gauss", "Riemann"],
        1,
        "Fermat's Last Theorem, conjectured in 1637, was proven by Andrew Wiles in 1994.",
        "Mathematics",
        "medium",
    ),
    (
        "What is the currency of Vietnam?",
        ["Dong", "Baht", "Kyat", "Ringgit"],
        0,
        "Vietnam uses the dong; baht is Thai, kyat is Burmese, ringgit is Malaysian.",
        "Geography",
        "medium",
    ),
    (
        "Which of these instruments is a member of the woodwind family?",
        ["Trombone", "Saxophone", "Timpani", "Cello"],
        1,
        "Despite being made of brass, the saxophone is a woodwind — it sounds via a reed.",
        "Music",
        "medium",
    ),
    (
        "Approximately how long does sunlight take to reach Earth?",
        ["8 seconds", "8 minutes", "8 hours", "8 days"],
        1,
        "Light covers the roughly 150 million km to Earth in about 8 minutes 20 seconds.",
        "Science",
        "easy",
    ),
    (
        "Which ancient city was buried by the eruption of Mount Vesuvius in AD 79?",
        ["Carthage", "Pompeii", "Ephesus", "Syracuse"],
        1,
        "Pompeii, along with Herculaneum, was buried under ash and pumice.",
        "History",
        "easy",
    ),
]


# Math track — worked problems rather than recall. The math track's slower
# speed tiers (see qotd_tracks.MATH) assume this kind of question.
MATH_QUESTIONS: List[StarterQuestion] = [
    (
        "A train covers 60 km in 45 minutes. What is its average speed in km/h?",
        ["45 km/h", "75 km/h", "80 km/h", "90 km/h"],
        2,
        "45 minutes is 0.75 h, and 60 / 0.75 = 80 km/h.",
        "Rates",
        "easy",
    ),
    (
        "What is 15% of 240?",
        ["30", "36", "38", "42"],
        1,
        "10% is 24 and 5% is 12, so 15% is 36.",
        "Arithmetic",
        "easy",
    ),
    (
        "A rectangle has a perimeter of 36 cm and is twice as long as it is wide. What is its area?",
        ["48 cm²", "64 cm²", "72 cm²", "81 cm²"],
        2,
        "Width 6 and length 12 give a perimeter of 36, so the area is 6 × 12 = 72 cm².",
        "Geometry",
        "medium",
    ),
    (
        "If 3x + 7 = 25, what is the value of 5x?",
        ["24", "30", "36", "40"],
        1,
        "3x = 18 so x = 6, and 5x = 30.",
        "Algebra",
        "easy",
    ),
    (
        "Two fair six-sided dice are rolled. What is the probability the total is 7?",
        ["1/12", "1/9", "1/6", "1/4"],
        2,
        "Six of the 36 equally likely outcomes total 7, and 6/36 = 1/6.",
        "Probability",
        "medium",
    ),
    (
        "A jacket costs 80 after a 20% discount. What was the original price?",
        ["96", "100", "104", "120"],
        1,
        "80 is 80% of the original, and 80 / 0.8 = 100.",
        "Percentages",
        "medium",
    ),
    (
        "What is the sum of the first 20 positive integers?",
        ["190", "200", "210", "220"],
        2,
        "n(n+1)/2 with n = 20 gives 20 × 21 / 2 = 210.",
        "Sequences",
        "medium",
    ),
    (
        "A car travels 120 km at 60 km/h, then 120 km at 40 km/h. What is the average speed for the trip?",
        ["45 km/h", "48 km/h", "50 km/h", "52 km/h"],
        1,
        "The trip takes 2 + 3 = 5 hours for 240 km, so 240 / 5 = 48 km/h — not the mean of the two speeds.",
        "Rates",
        "hard",
    ),
]


def seed_questions(session: Session) -> int:
    """Insert any starter questions not already present. Returns the count added."""
    added = 0
    tracked: List[Tuple[str, StarterQuestion]] = [
        *(("general", q) for q in STARTER_QUESTIONS),
        *(("math", q) for q in MATH_QUESTIONS),
    ]
    for track, (prompt, choices, answer_index, explanation, category, difficulty) in tracked:
        existing: Optional[TriviaQuestion] = session.exec(
            select(TriviaQuestion).where(TriviaQuestion.prompt == prompt)
        ).first()
        if existing:
            continue
        session.add(
            TriviaQuestion(
                track=track,
                prompt=prompt,
                choices_data=json.dumps(choices),
                answer_index=answer_index,
                explanation=explanation,
                category=category,
                difficulty=difficulty,
                submitted_by=None,
                status="approved",
                verdict="approve",
                verdict_confidence=100,
                verdict_notes=SEED_NOTE,
                verified_at=datetime.utcnow(),
            )
        )
        added += 1
    session.commit()
    return added


def main() -> None:
    init_db()
    with Session(engine) as session:
        added = seed_questions(session)
    print(f"Seeded {added} starter question(s).")


if __name__ == "__main__":
    main()
