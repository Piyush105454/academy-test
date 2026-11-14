"""Rating computation: parameter scores -> video / note / overall ratings.

The arithmetic is deliberately simple (means, not weighted blends) because the
design says so and because a teacher should be able to check it by hand. What
is *not* simple, and is the real content of this module, is what happens when
evidence is missing:

* A not-assessed parameter drops out of the average. It is never a 0, and it
  never drags a rating down.
* An artifact that could not be evaluated has no rating at all — not a low one.
* A submission with only one artifact gets that artifact's rating as its
  overall, and is marked incomplete. The missing half is not scored as zero.
"""
from __future__ import annotations

from typing import Iterable, Optional, Sequence

from .models import (
    ArtifactKind,
    ArtifactResult,
    CannotEvaluateReason,
    GradedSubmission,
    NotAssessedReason,
    NoteParameter,
    ParameterScore,
    VideoParameter,
)
from .rubric import Rubric


def mean_of_assessed(scores: Iterable[ParameterScore]) -> Optional[float]:
    """Mean of the parameters that actually have a score.

    Returns None when nothing was assessed — the caller must treat that as
    "no rating", never as zero.
    """
    values = [s.value for s in scores if s.is_assessed]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def build_artifact_result(
    kind: ArtifactKind,
    scores: Sequence[ParameterScore] = (),
    *,
    cannot_evaluate: Optional[CannotEvaluateReason] = None,
    missing: bool = False,
) -> ArtifactResult:
    """Assemble one artifact's outcome, computing its rating if it has one."""
    if missing:
        # Nothing was uploaded, so this scores 0 — and 0 here does not break the
        # rule that abstentions are never zeroed, because it is not an
        # abstention. The two cases are different in kind:
        #
        #   missing          the student did not do this part  -> 0, a fact
        #                                                          about the work
        #   cannot_evaluate  they did it and we could not read
        #                    it (silent audio, blurred photo,
        #                    no transcriber)                   -> no rating ever
        #
        # Confusing them is how a child gets a 0 because our OCR failed. The
        # student is told which of the two happened, and a 0 here is reversible:
        # when the missing artifact arrives, the submission is re-evaluated.
        return ArtifactResult(kind=kind, missing=True, rating=0.0)

    if cannot_evaluate is not None:
        # No rating is produced. This is the whole point: a silent video has
        # not earned a 1/5, it has earned a request to upload it again.
        return ArtifactResult(kind=kind, scores=tuple(scores), cannot_evaluate=cannot_evaluate)

    rating = mean_of_assessed(scores)
    if rating is None:
        # Every parameter abstained, so there is nothing to average. Report the
        # reason the parameters themselves gave rather than a generic failure —
        # "we have no speech-to-text" and "something crashed" call for different
        # actions from whoever is running this.
        reasons = {s.reason for s in scores if s.reason is not None}
        if NotAssessedReason.NO_TRANSCRIPT in reasons:
            blocker = CannotEvaluateReason.NO_TRANSCRIBER
        else:
            blocker = CannotEvaluateReason.PROCESSING_FAILURE
        return ArtifactResult(kind=kind, scores=tuple(scores), cannot_evaluate=blocker)
    return ArtifactResult(kind=kind, scores=tuple(scores), rating=rating)


def combine_overall(
    video: ArtifactResult,
    note: ArtifactResult,
    rubric: Rubric,
) -> tuple[Optional[float], bool]:
    """Overall rating for the homework, and whether it is incomplete.

    Both graded  -> weighted blend (50/50 by default).
    One graded   -> that rating, marked incomplete.
    Neither      -> no rating, marked incomplete.
    """
    weights = rubric.overall_weights
    v_ok, n_ok = video.was_graded, note.was_graded

    if v_ok and n_ok:
        overall = video.rating * weights["video"] + note.rating * weights["note"]
        return round(overall, 2), False

    # A part that was never uploaded scores 0 and is blended in, because the
    # student has genuinely not done half the homework. This is the ONLY route
    # by which a 0 enters an overall rating.
    #
    # A part that was uploaded but could not be evaluated — silent audio, an
    # unreadable photo, an off-topic suspension — is not a 0 and never becomes
    # one. In that case the rating we do have stands on its own, or there is no
    # rating at all. Nothing here may punish a student for our gap.
    if v_ok and note.counts_as_zero:
        overall = video.rating * weights["video"] + 0.0 * weights["note"]
        return round(overall, 2), True
    if n_ok and video.counts_as_zero:
        overall = 0.0 * weights["video"] + note.rating * weights["note"]
        return round(overall, 2), True

    if v_ok:
        return video.rating, True
    if n_ok:
        return note.rating, True
    return None, True


def teacher_flags(
    video: ArtifactResult,
    note: ArtifactResult,
    overall: Optional[float],
    rubric: Rubric,
    *,
    previous_ratings: Sequence[float] = (),
) -> tuple[str, ...]:
    """Reasons a teacher should look at this submission.

    Flags route attention; they do not gate publication. Keep the overall flag
    rate near 10% of submissions — at ~220 submissions a day, flagging half of
    them rebuilds the problem this agent exists to solve.
    """
    cfg = rubric.flags
    flags: list[str] = []

    if overall is not None and overall < cfg["low_overall_rating"]:
        flags.append(f"low_overall_rating ({overall})")

    if video.cannot_evaluate is not None:
        flags.append(f"video_not_evaluated ({video.cannot_evaluate.value})")
    if note.cannot_evaluate is not None:
        flags.append(f"note_not_evaluated ({note.cannot_evaluate.value})")

    if video.was_graded and len(video.assessed_scores) < cfg["min_assessed_video_parameters"]:
        flags.append(
            f"thin_video_evidence ({len(video.assessed_scores)}/{len(video.scores)} assessed)"
        )
    if note.was_graded and len(note.assessed_scores) < cfg["min_assessed_note_parameters"]:
        flags.append(
            f"thin_note_evidence ({len(note.assessed_scores)}/{len(note.scores)} assessed)"
        )

    if overall is not None and previous_ratings:
        recent = list(previous_ratings)[-rubric.trend_window:]
        drop = sum(recent) / len(recent) - overall
        if drop >= cfg["sharp_drop_delta"]:
            flags.append(f"sharp_drop (-{round(drop, 2)} vs recent average)")

    return tuple(flags)


def grade_submission(
    submission_id: str,
    student_id: str,
    module_id: str,
    video: ArtifactResult,
    note: ArtifactResult,
    rubric: Rubric,
    *,
    previous_ratings: Sequence[float] = (),
) -> GradedSubmission:
    """Assemble the full result for one submission (ratings and flags only).

    Trend and feedback are added by their own modules — see ``trend.py`` and
    ``feedback.py`` — so that each stage stays independently testable.
    """
    overall, incomplete = combine_overall(video, note, rubric)
    return GradedSubmission(
        submission_id=submission_id,
        student_id=student_id,
        module_id=module_id,
        video=video,
        note=note,
        overall_rating=overall,
        incomplete=incomplete,
        flags=teacher_flags(video, note, overall, rubric, previous_ratings=previous_ratings),
    )


# --------------------------------------------------------------------------
# Helpers for constructing the expected parameter sets
# --------------------------------------------------------------------------

def expected_video_parameters(module_eye_contact_expected: bool) -> tuple[str, ...]:
    """Which video parameters are in scope for this module.

    Every module scores all five. ``eye_contact_expected`` does not remove a
    parameter — it changes what Hand Gesture and Confidence are allowed to
    penalise, which is enforced at prompt level in the provider, not here. See
    ``providers.py`` and the design note on posture.
    """
    return tuple(p.value for p in VideoParameter)


def expected_note_parameters() -> tuple[str, ...]:
    return tuple(p.value for p in NoteParameter)
