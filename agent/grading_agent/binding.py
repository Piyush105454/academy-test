"""Which files belong to which student.

A wrong *score* is recoverable: a teacher looks at the work and overrides it. A
wrong *binding* is not. If Vivek's video is graded beside Khusi's note, both of
them receive feedback about work they did not do, and nothing in the feedback
text tells either of them — it reads as a plausible grade for a plausible child.

At 35-40 students across 6 periods that is roughly 240 bindings a day, made by
whatever loop the portal integration happens to write. So the rule is enforced
here rather than promised in a docstring: every artifact carries the identifiers
of the portal row it came from, and if two of them disagree, nothing is graded.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from .models import Submission


class BindingError(Exception):
    """Artifacts could not be safely attributed to one student's submission."""


@dataclass(frozen=True)
class ArtifactRef:
    """One uploaded file, together with where the portal says it came from.

    The identifiers travel *with* the file. They are never derived from the
    filename, the upload time, or the order files arrive in — a WhatsApp video
    is called `WhatsApp Video 2026-08-30 at 7.15.37 AM.mp4` and carries no
    student, no module and no submission in it.
    """
    submission_id: str
    student_id: str
    module_id: str
    kind: str              # "video" | "note"
    path: str

    def __post_init__(self) -> None:
        if self.kind not in ("video", "note"):
            raise BindingError(
                f"Unknown artifact kind {self.kind!r}; expected 'video' or 'note'.")
        for field in ("submission_id", "student_id", "module_id", "path"):
            if not str(getattr(self, field)).strip():
                raise BindingError(
                    f"{self.kind} artifact has a blank {field}. An artifact with no "
                    "provenance cannot be attributed to a student.")


def bind(refs: Iterable[ArtifactRef],
         *, expected_module_id: Optional[str] = None) -> Submission:
    """Combine one student's artifacts into a Submission, or refuse.

    Refuses — rather than picking a winner — whenever the artifacts disagree.
    Guessing here would be indistinguishable from working correctly, right up
    until a child is handed someone else's grade.
    """
    refs = list(refs)
    if not refs:
        raise BindingError("No artifacts to bind.")

    for field, label in (("submission_id", "submission"),
                         ("student_id", "student"),
                         ("module_id", "module")):
        values = {getattr(r, field) for r in refs}
        if len(values) > 1:
            raise BindingError(
                f"Artifacts come from more than one {label}: {sorted(values)}. "
                "Refusing to grade rather than guess which one is right.")

    for kind in ("video", "note"):
        if len([r for r in refs if r.kind == kind]) > 1:
            raise BindingError(
                f"More than one {kind} supplied for a single submission. "
                "Which one is the homework is not ours to decide.")

    first = refs[0]
    if expected_module_id and first.module_id != expected_module_id:
        raise BindingError(
            f"Artifacts belong to module {first.module_id!r} but grading was "
            f"requested for {expected_module_id!r}.")

    video = next((r.path for r in refs if r.kind == "video"), None)
    note = next((r.path for r in refs if r.kind == "note"), None)

    return Submission(
        submission_id=first.submission_id,
        student_id=first.student_id,
        module_id=first.module_id,
        video_path=video,
        note_path=note,
    )
