"""Re-grading when the missing half of the homework turns up.

A 0 for work not done is only fair if it is reversible. A student who uploads
their note the next morning must end up with the grade they earned, not the one
they got at the deadline — otherwise the 0 stops being a fact about the work and
becomes a punishment for being late to a form.

So a grade carrying a missing artifact is explicitly provisional, and this
module says when it must be re-run and ties the new result to the old one, so
the history shows a correction rather than two contradictory grades.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .models import GradedSubmission, Submission


@dataclass(frozen=True)
class ReevaluationNeed:
    needed: bool
    reason: str = ""
    newly_supplied: tuple[str, ...] = ()

    def __bool__(self) -> bool:
        return self.needed


def is_provisional(graded: GradedSubmission) -> bool:
    """True when this grade rests on something the student can still supply."""
    return bool(graded.video.missing or graded.note.missing)


def needs_reevaluation(graded: GradedSubmission,
                       submission: Submission) -> ReevaluationNeed:
    """Should this submission be graded again?

    Only ever answers yes because something *arrived*. A grade is never re-run
    to lower it on the strength of a file going away.
    """
    supplied = []
    if graded.video.missing and submission.video_path:
        supplied.append("video")
    if graded.note.missing and submission.note_path:
        supplied.append("note")

    if not supplied:
        if is_provisional(graded):
            return ReevaluationNeed(
                False, "Still waiting for the missing part of the homework.")
        return ReevaluationNeed(False, "Nothing has changed.")

    which = " and ".join(supplied)
    return ReevaluationNeed(
        True,
        f"The {which} has since been uploaded; the earlier 0 must not stand.",
        tuple(supplied))


def mark_supersedes(new: GradedSubmission,
                    previous: Optional[GradedSubmission]) -> GradedSubmission:
    """Record that this grade replaces an earlier one.

    Keeps the superseded rating rather than discarding it: a student or parent
    asking "why did this change?" deserves both numbers and the reason.
    """
    if previous is None:
        return new
    new.extras["supersedes"] = {
        "submission_id": previous.submission_id,
        "previous_overall": previous.overall_rating,
        "previous_video": previous.video.rating,
        "previous_note": previous.note.rating,
        "reason": "re-evaluated after the missing part of the homework arrived",
    }
    new.flags = new.flags + (
        f"re_evaluated — replaces an earlier grade of "
        f"{previous.overall_rating} given while part of the homework was missing",)
    return new
