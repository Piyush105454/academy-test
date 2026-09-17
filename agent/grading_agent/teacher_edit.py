"""The teacher's last word.

An automated grade a person cannot change is not a tool, it is a verdict. This
module lets a teacher rewrite what a student is told — and makes the rewrite
honest rather than invisible.

Three rules shape everything here.

**The agent's version is never destroyed.** It is kept beside the teacher's. Six
months from now, "why did this child get this feedback?" has to be answerable,
and an edit that overwrites the original erases the evidence that the agent got
it wrong. That record is also the only way anyone will ever notice a pattern of
the same correction being made every week.

**The teacher's words are never filtered.** The forbidden-inference scanner
polices the *automated system*, which has no standing to judge a child. A
teacher has standing, context, and accountability. Running our guardrails over
their professional judgement would be overreach, and a system that silently
rewrites what a teacher wrote is worse than one that never let them write.

**Attribution follows the text.** Once edited, the feedback is the teacher's,
and everything downstream says so. Passing off a teacher's sentence as the
agent's — or the reverse — misleads the person reading it about who is
accountable for it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from .models import GradedSubmission, StudentMessage


class EditRejected(Exception):
    """The edit would leave the student worse off than before."""


@dataclass(frozen=True)
class FeedbackEdit:
    """One teacher's rewrite, kept alongside what the agent said."""
    edited_by: str
    edited_at: str
    original_en: str
    original_hi: str
    edited_en: str
    edited_hi: str
    reason: str = ""
    languages_changed: tuple[str, ...] = ()

    @property
    def only_one_language_changed(self) -> bool:
        return len(self.languages_changed) == 1

    def to_dict(self) -> dict:
        return {
            "edited_by": self.edited_by, "edited_at": self.edited_at,
            "original_en": self.original_en, "original_hi": self.original_hi,
            "edited_en": self.edited_en, "edited_hi": self.edited_hi,
            "reason": self.reason,
            "languages_changed": list(self.languages_changed),
        }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def authored_by(graded: GradedSubmission) -> str:
    """Who wrote the feedback the student will read: 'teacher' or 'agent'."""
    return "teacher" if graded.extras.get("feedback_edit") else "agent"


def edit_feedback(
    graded: GradedSubmission,
    *,
    edited_by: str,
    en: Optional[str] = None,
    hi: Optional[str] = None,
    reason: str = "",
    audit=None,
) -> GradedSubmission:
    """Replace what the student is told, keeping what the agent said.

    Pass only the language you changed; the other is carried over unchanged and
    flagged, so nobody discovers later that the Hindi still says something the
    English no longer does.
    """
    if not str(edited_by).strip():
        raise EditRejected(
            "An edit needs an author. Feedback a student reads must be "
            "attributable to a person or to the agent, never to nobody.")

    original = graded.feedback or StudentMessage(en="", hi="")
    new_en = original.en if en is None else en
    new_hi = original.hi if hi is None else hi

    if not new_en.strip() and not new_hi.strip():
        raise EditRejected(
            "An edit cannot leave the student with no feedback at all. To "
            "withhold feedback, hold the submission for review instead.")

    changed = tuple(
        lang for lang, before, after in
        (("en", original.en, new_en), ("hi", original.hi, new_hi))
        if before.strip() != after.strip())

    if not changed:
        raise EditRejected("Nothing changed.")

    edit = FeedbackEdit(
        edited_by=edited_by, edited_at=_now(),
        original_en=original.en, original_hi=original.hi,
        edited_en=new_en, edited_hi=new_hi,
        reason=reason, languages_changed=changed)

    graded.feedback = StudentMessage(en=new_en, hi=new_hi)
    graded.extras["feedback_edit"] = edit.to_dict()
    graded.extras["feedback_authored_by"] = "teacher"

    flags = [f for f in graded.flags if not f.startswith("feedback_edited")]
    flags.append(f"feedback_edited_by_teacher ({edited_by})")
    if edit.only_one_language_changed:
        untouched = "Hindi" if changed == ("en",) else "English"
        flags.append(
            f"one_language_only — the {untouched} feedback still says what the "
            f"agent wrote; check it does not contradict the edit")
    graded.flags = tuple(flags)

    if audit is not None:
        audit.record("feedback_edited", graded.student_id, {
            "submission_id": graded.submission_id,
            "edited_by": edited_by,
            "languages_changed": list(changed),
            "reason": reason,
        })
    return graded


def revert_feedback(graded: GradedSubmission, *, reverted_by: str,
                    audit=None) -> GradedSubmission:
    """Put the agent's original wording back."""
    edit = graded.extras.get("feedback_edit")
    if not edit:
        raise EditRejected("This feedback has not been edited.")

    graded.feedback = StudentMessage(en=edit["original_en"], hi=edit["original_hi"])
    graded.extras["feedback_edit_history"] = (
        graded.extras.get("feedback_edit_history", []) + [edit])
    graded.extras.pop("feedback_edit", None)
    graded.extras["feedback_authored_by"] = "agent"
    graded.flags = tuple(
        f for f in graded.flags
        if not f.startswith("feedback_edited") and not f.startswith("one_language_only"))

    if audit is not None:
        audit.record("feedback_edit_reverted", graded.student_id, {
            "submission_id": graded.submission_id, "reverted_by": reverted_by})
    return graded


# --------------------------------------------------------------------------
# Score overrides
# --------------------------------------------------------------------------
#
# Editing feedback lets a teacher fix the words. Overriding a score lets them
# fix the judgement — and that is the more consequential of the two, because a
# number goes into a report card and a profile while a sentence does not.
#
# The same three rules apply: the agent's score is kept, the teacher's value is
# not second-guessed, and everything downstream knows which is which. One
# addition: every override is a calibration data point, because it is a teacher
# telling us exactly where the agent was wrong and by how much.

TEACHER_ABSTAINED = "teacher_abstained"


def override_score(
    graded: GradedSubmission,
    *,
    artifact: str,                 # "video" | "note"
    parameter: str,
    new_value: Optional[int],      # None = the teacher says this is not assessable
    edited_by: str,
    reason: str = "",
    audit=None,
) -> GradedSubmission:
    """Replace one parameter score, keeping the agent's and recomputing ratings.

    A teacher may score a parameter the agent abstained on — they can read the
    smudged row we could not — and may abstain where the agent scored, which is
    the more important direction: it says the agent judged on evidence a person
    would not have judged on.
    """
    from .models import ArtifactKind, NotAssessedReason, ParameterScore
    from .scoring import build_artifact_result, combine_overall

    if artifact not in ("video", "note"):
        raise EditRejected(f"Unknown artifact {artifact!r}; expected 'video' or 'note'.")
    if not str(edited_by).strip():
        raise EditRejected("An override needs an author.")
    if new_value is not None and (
            not isinstance(new_value, int) or isinstance(new_value, bool)
            or not 1 <= new_value <= 5):
        raise EditRejected(
            f"A score must be a whole number from 1 to 5, or None to mark it "
            f"not assessable. Got {new_value!r}. A parameter with no evidence "
            f"is not_assessed, never 0.")

    result = getattr(graded, artifact)
    if result.missing:
        raise EditRejected(
            "Nothing was uploaded for this part, so there is no work to score. "
            "If the student has since sent it, re-run the grading instead.")

    existing = {s.parameter: s for s in result.scores}
    if parameter not in existing:
        raise EditRejected(
            f"{parameter!r} is not a parameter on this {artifact}. "
            f"Available: {sorted(existing) or 'none'}.")

    before = existing[parameter]
    if before.value == new_value:
        raise EditRejected("That is already the score.")

    if new_value is None:
        replacement = ParameterScore.not_assessed(
            parameter, NotAssessedReason.THIN_EVIDENCE,
            f"{edited_by} judged this not assessable from the work submitted."
            + (f" {reason}" if reason else ""))
    else:
        replacement = ParameterScore.scored(
            parameter, new_value,
            f"Set by {edited_by}." + (f" {reason}" if reason else ""))

    scores = [replacement if s.parameter == parameter else s for s in result.scores]
    kind = ArtifactKind.VIDEO if artifact == "video" else ArtifactKind.NOTE
    setattr(graded, artifact, build_artifact_result(kind, scores))

    graded.overall_rating, graded.incomplete = combine_overall(
        graded.video, graded.note, _rubric())

    record = {
        "artifact": artifact, "parameter": parameter,
        "agent_score": before.value,
        "agent_reason": before.note,
        "teacher_score": new_value,
        "edited_by": edited_by, "reason": reason,
        "edited_at": _now(),
    }
    graded.extras.setdefault("score_overrides", []).append(record)
    graded.flags = tuple(
        list(graded.flags) +
        [f"score_overridden_by_teacher ({artifact}.{parameter}: "
         f"{before.value if before.value is not None else '–'} → "
         f"{new_value if new_value is not None else '–'}, {edited_by})"])

    if audit is not None:
        audit.record("score_overridden", graded.student_id, {
            "submission_id": graded.submission_id, **record})
    return graded


_RUBRIC_CACHE: dict = {}


def _rubric():
    """The rubric used to recombine ratings after an override.

    Cached: a teacher correcting five parameters on one submission should not
    re-read the rubric file five times.
    """
    from . import Rubric
    if "default" not in _RUBRIC_CACHE:
        _RUBRIC_CACHE["default"] = Rubric.load()
    return _RUBRIC_CACHE["default"]
