"""Trend labels — is this student getting better?

A single score tells a student where they are. A trend tells them whether the
work is paying off, which is the part that keeps them going.

Compared only against the student's own history for the same skill type. Never
against other students.
"""
from __future__ import annotations

from typing import Optional, Sequence

from .models import TrendLabel
from .rubric import Rubric


def compute_trend(
    current_rating: Optional[float],
    previous_ratings: Sequence[float],
    rubric: Rubric,
) -> Optional[TrendLabel]:
    """Label this submission against the student's recent history.

    Rules (from the design):
      Baseline        — first tracked submission for this student + skill
      Improved        — up   >= delta vs the average of the last N
      Stable          — within +/- delta of that average
      Needs attention — down >= delta vs that average, OR below the floor

    Returns None when there is no current rating to compare (the submission
    could not be evaluated) — an ungraded submission has no trend.
    """
    if current_rating is None:
        return None

    if not previous_ratings:
        # Even a first submission can be below the floor, but "Baseline" is the
        # more useful thing to tell a student who has nothing to compare against.
        return TrendLabel.BASELINE

    window = list(previous_ratings)[-rubric.trend_window:]
    average = sum(window) / len(window)
    delta = current_rating - average

    if current_rating < rubric.trend_floor:
        return TrendLabel.NEEDS_ATTENTION
    if delta >= rubric.trend_delta:
        return TrendLabel.IMPROVED
    if delta <= -rubric.trend_delta:
        return TrendLabel.NEEDS_ATTENTION
    return TrendLabel.STABLE


def trend_phrase(label: Optional[TrendLabel]) -> tuple[str, str]:
    """Plain-language wording for the feedback note, English and Hindi.

    The label goes to the student as a sentence, not as a badge they have to
    decode. Returns ("", "") when there is nothing worth saying.
    """
    if label is None or label is TrendLabel.BASELINE:
        return "", ""
    if label is TrendLabel.IMPROVED:
        return ("This is better than your last few submissions.",
                "यह आपके पिछले कामों से बेहतर है।")
    if label is TrendLabel.STABLE:
        return ("This is about the same as your last few submissions.",
                "यह आपके पिछले कामों जैसा ही है।")
    return ("This one slipped a little compared to your last few.",
            "यह आपके पिछले कामों से थोड़ा कमज़ोर रहा।")
