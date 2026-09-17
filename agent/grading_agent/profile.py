"""A picture of one student over time — built only from their own scores.

This is what makes feedback personal rather than generic: knowing that a
student has been told about pauses three weeks running, or that their note
work is consistently their stronger half, changes what is worth saying next.

Where the line is
-----------------
This is behavioural data about a child, so the shape of it matters as much as
the use:

* **Derived, never inferred.** Every field is arithmetic over scores this agent
  already recorded. Nothing here estimates ability, effort, attitude, home
  circumstances or anything else the agent is not entitled to conclude — see
  ``responsible.FORBIDDEN_INFERENCES``.
* **Bounded.** Only the most recent submissions are kept in view. A profile is
  a rolling picture of recent work, not a permanent file that follows a child.
* **Not a label.** The vocabulary is "practising X", never "weak at X". A
  profile exists to choose what to say next, not to rank or stream students.
* **Erasable.** ``forget()`` removes a student entirely. A right to be
  forgotten that requires an engineer is not a right.
* **Never comparative.** Nothing here compares one student to another. Trends
  are always against the student's own history.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

#: How many recent submissions a profile draws on. Older work ages out — the
#: point is what a student is doing now, not what they did last term.
DEFAULT_WINDOW = 5

#: A parameter must appear this many times before it is called a pattern.
#: One low score is a bad day, not a characteristic.
MIN_OBSERVATIONS = 2


@dataclass
class StudentProfile:
    """What recent scores say about one student's current work."""
    student_id: str
    submissions_seen: int = 0
    parameter_means: dict[str, float] = field(default_factory=dict)
    parameter_counts: dict[str, int] = field(default_factory=dict)
    recent_advice: tuple[str, ...] = ()      # parameters already advised on, newest first
    overall_history: tuple[float, ...] = ()

    # -- reading the profile ---------------------------------------------

    @property
    def has_history(self) -> bool:
        return self.submissions_seen > 0

    def strongest(self) -> Optional[str]:
        """The parameter this student most reliably does well."""
        eligible = {k: v for k, v in self.parameter_means.items()
                    if self.parameter_counts.get(k, 0) >= MIN_OBSERVATIONS}
        return max(eligible, key=eligible.get) if eligible else None

    def practising(self) -> Optional[str]:
        """The parameter with the most room to grow.

        Named "practising", not "weakest". The word a system uses about a child
        leaks into how adults talk about them.
        """
        eligible = {k: v for k, v in self.parameter_means.items()
                    if self.parameter_counts.get(k, 0) >= MIN_OBSERVATIONS}
        return min(eligible, key=eligible.get) if eligible else None


    def improving_on(self, parameter: str, current: Optional[int]) -> bool:
        """Is this score better than this student's own recent average?"""
        if current is None:
            return False
        mean = self.parameter_means.get(parameter)
        if mean is None or self.parameter_counts.get(parameter, 0) < MIN_OBSERVATIONS:
            return False
        return current >= mean + 0.5

    def advised_recently(self, parameter: str, within: int = 2) -> bool:
        """Have we already given this student this advice lately?

        Repeating the same sentence every week is how feedback stops being
        read. If a student has heard it twice already, say something else.
        """
        return parameter in self.recent_advice[:within]


def build_profile(
    student_id: str,
    records: Sequence[dict],
    window: int = DEFAULT_WINDOW,
) -> StudentProfile:
    """Assemble a profile from stored grading records, newest last.

    ``records`` are the dicts written by ``store.JsonSubmissionStore`` — the
    agent's own past output, nothing else.
    """
    recent = list(records)[-window:]
    if not recent:
        return StudentProfile(student_id=student_id)

    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    advice: list[str] = []
    overall: list[float] = []

    for record in recent:
        for key in ("video", "note"):
            artifact = record.get(key) or {}
            for score in artifact.get("scores", ()):
                value = score.get("value")
                if value is None:
                    continue
                param = score["parameter"]
                sums[param] = sums.get(param, 0.0) + value
                counts[param] = counts.get(param, 0) + 1

        if record.get("overall_rating") is not None:
            overall.append(float(record["overall_rating"]))

        advised = (record.get("extras") or {}).get("advised_on")
        if advised:
            advice.append(advised)

    return StudentProfile(
        student_id=student_id,
        submissions_seen=len(recent),
        parameter_means={k: round(sums[k] / counts[k], 2) for k in sums},
        parameter_counts=counts,
        recent_advice=tuple(reversed(advice)),
        overall_history=tuple(overall),
    )


def forget(store, student_id: str) -> bool:
    """Erase everything held about one student.

    Takes the store rather than a path so any ``ResultSink`` implementation can
    satisfy it. Returns True if anything was removed.
    """
    records = store.all_records()
    if student_id not in records:
        return False
    del records[student_id]
    store._records = records          # noqa: SLF001 — store owns its own flush
    store._flush()                    # noqa: SLF001
    return True
