"""Responsible-AI guardrails — the constraints, made enforceable.

The design lists fairness rules in prose. Prose does not stop a regression six
months from now, so the ones that *can* be checked in code are checked here,
and the rest are stated in one place so they land in the prompt of any model
that plugs into a scorer.

What this module provides:

* ``FORBIDDEN_INFERENCES`` — things the agent must never conclude about a
  child, with a scanner that catches them leaking into free text.
* ``check_evidence`` — every score must cite what it was based on. A number
  with no stated reason is not reviewable and not appealable.
* ``fairness_report`` — cohort-level disparity checks, so systematic bias
  shows up as a number rather than as a hunch.
* ``AuditLog`` — an append-only record of what was graded, when, and why.
* ``Appeal`` — a student or guardian can dispute a score, and the dispute is
  attached to the record.

Why these and not others: each one exists because its absence is a specific
way an automated grader harms a student — by judging what it cannot see, by
scoring without saying why, by being quietly harsher on one group, by leaving
no trace, or by offering no way to argue back.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional, Sequence

from .models import GradedSubmission, ParameterScore

# ---------------------------------------------------------------------------
# 1. What the agent must never infer
# ---------------------------------------------------------------------------

#: Conclusions this agent is not entitled to draw about a child, whatever the
#: model appears to "see". Each maps to phrases that would betray it in output.
FORBIDDEN_INFERENCES: dict[str, tuple[str, ...]] = {
    "intelligence or ability": (
        "intelligent", "unintelligent", "clever", "stupid", "slow learner",
        "gifted", "dull", "bright child", "weak student", "low iq",
    ),
    "effort, motivation or attitude": (
        "lazy", "careless", "not trying", "didn't bother", "unmotivated",
        "disinterested", "does not care", "made no effort",
        # Added after the verification pass caught these getting through.
        "uninterested", "not interested", "seems bored", "looks bored",
        "could not be bothered", "couldn't be bothered", "no effort",
        "not paying attention", "distracted", "switched off",
    ),
    "honesty": (
        "cheating", "copied from", "plagiaris", "dishonest", "faked", "lying",
    ),
    "emotional or mental state": (
        "depressed", "anxious child", "unhappy", "troubled", "disturbed",
        "traumatised", "mental health",
    ),
    "home or economic circumstances": (
        "poor family", "uneducated parents", "neglected", "from a slum",
        "low income", "broken home", "illiterate parents",
        # Added after the verification pass: "probably from a home without
        # books" passed the original list cleanly. The phrasing that gets
        # through is never the phrasing you thought of, which is the argument
        # for scanning at all rather than trusting the prompt.
        "home without", "no books at home", "lacks support at home",
        "parents do not", "parents don't", "no one at home",
        "background suggests", "given their background", "underprivileged",
        "disadvantaged", "cannot afford",
    ),
    "caste, religion, ethnicity or gender": (
        "caste", "muslim", "hindu", "christian", "tribal", "backward class",
        "girls are", "boys are", "typical of girls", "typical of boys",
    ),
    "disability or medical condition": (
        "dyslexi", "disabled", "learning disability", "adhd", "autis",
        "special needs", "impairment",
    ),
    "appearance or background": (
        "dirty", "untidy child", "poorly dressed", "shabby", "unkempt",
        "looks tired", "malnourish",
    ),
}


@dataclass(frozen=True)
class InferenceViolation:
    category: str
    phrase: str
    where: str
    text: str


def scan_for_forbidden_inference(text: str, where: str = "") -> list[InferenceViolation]:
    """Find conclusions the agent is not entitled to draw.

    Runs over anything student-facing or teacher-facing that a model wrote —
    feedback, score notes — because that is where such a judgement would
    surface. Substring matching is crude but deliberately so: it errs toward
    catching too much, and a human reviews what it catches.
    """
    if not text:
        return []
    low = text.lower()
    found: list[InferenceViolation] = []
    for category, phrases in FORBIDDEN_INFERENCES.items():
        for phrase in phrases:
            if phrase in low:
                found.append(InferenceViolation(category, phrase, where, text[:200]))
    return found


def scan_graded_submission(graded: GradedSubmission) -> list[InferenceViolation]:
    """Scan everything a submission would show to a student or teacher."""
    out: list[InferenceViolation] = []
    if graded.feedback is not None:
        out += scan_for_forbidden_inference(graded.feedback.en, "feedback.en")
        out += scan_for_forbidden_inference(graded.feedback.hi, "feedback.hi")
    for artifact in (graded.video, graded.note):
        for s in artifact.scores:
            out += scan_for_forbidden_inference(s.note, f"{artifact.kind.value}.{s.parameter}")
    return out


# ---------------------------------------------------------------------------
# 2. Every score must say what it was based on
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class EvidenceGap:
    parameter: str
    problem: str


def check_evidence(scores: Iterable[ParameterScore]) -> list[EvidenceGap]:
    """A score with no stated basis is not reviewable and not appealable.

    A student who asks "why did I get a 2?" deserves an answer, and a teacher
    overriding a score needs to know what it rested on.
    """
    gaps: list[EvidenceGap] = []
    for s in scores:
        if s.is_assessed and not (s.note or "").strip():
            gaps.append(EvidenceGap(s.parameter, "scored with no evidence recorded"))
        if not s.is_assessed and s.reason is None:
            gaps.append(EvidenceGap(s.parameter, "not assessed with no reason recorded"))
    return gaps


# ---------------------------------------------------------------------------
# 3. Cohort-level fairness
# ---------------------------------------------------------------------------

@dataclass
class FairnessReport:
    """Whether the agent is treating groups of students differently.

    Groups are supplied by whoever runs the check — a class, a school, a
    language group. This module never infers group membership; doing so would
    be exactly the profiling the rules above forbid.
    """
    group_means: dict[str, float] = field(default_factory=dict)
    group_counts: dict[str, int] = field(default_factory=dict)
    largest_gap: float = 0.0
    gap_between: tuple[str, str] = ("", "")
    abstain_rates: dict[str, float] = field(default_factory=dict)
    concern: Optional[str] = None


#: A mean-score gap wider than this between groups warrants a look. Not proof
#: of bias — a prompt to investigate.
DISPARITY_THRESHOLD = 0.5


def fairness_report(
    graded: Sequence[GradedSubmission],
    groups: dict[str, str],
    threshold: float = DISPARITY_THRESHOLD,
) -> FairnessReport:
    """Compare outcomes across supplied groups.

    ``groups`` maps student_id -> group label. Students not in the mapping are
    excluded rather than bucketed into an "other" that would be meaningless.
    """
    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    abstains: dict[str, list[float]] = {}

    for g in graded:
        label = groups.get(g.student_id)
        if label is None or g.overall_rating is None:
            continue
        sums[label] = sums.get(label, 0.0) + g.overall_rating
        counts[label] = counts.get(label, 0) + 1

        total = len(g.video.scores) + len(g.note.scores)
        assessed = len(g.video.assessed_scores) + len(g.note.assessed_scores)
        if total:
            abstains.setdefault(label, []).append(1 - assessed / total)

    means = {k: round(sums[k] / counts[k], 2) for k in sums}
    report = FairnessReport(
        group_means=means,
        group_counts=counts,
        abstain_rates={k: round(sum(v) / len(v), 2) for k, v in abstains.items() if v},
    )

    if len(means) >= 2:
        hi = max(means, key=means.get)
        lo = min(means, key=means.get)
        report.largest_gap = round(means[hi] - means[lo], 2)
        report.gap_between = (lo, hi)
        if report.largest_gap >= threshold:
            report.concern = (
                f"'{lo}' averages {means[lo]} against '{hi}' at {means[hi]} "
                f"(gap {report.largest_gap}). Investigate before trusting these "
                f"scores — this is a prompt to look, not proof of bias."
            )

    return report


# ---------------------------------------------------------------------------
# 4. Audit log
# ---------------------------------------------------------------------------

class AuditLog:
    """Append-only record of grading events.

    Without this there is no way to answer "why did this student get this score
    in March?" once the model behind the scorer has changed. Stores student IDs
    only — never names, never media paths.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def record(self, event: str, student_id: str, detail: dict) -> None:
        entry = {
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "event": event,
            "student_id": student_id,
            "detail": detail,
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def record_grading(self, graded: GradedSubmission) -> None:
        self.record("graded", graded.student_id, {
            "submission_id": graded.submission_id,
            "module_id": graded.module_id,
            "video_rating": graded.video.rating,
            "note_rating": graded.note.rating,
            "overall": graded.overall_rating,
            "incomplete": graded.incomplete,
            "flags": list(graded.flags),
        })

    def entries(self) -> list[dict]:
        if not self.path.exists():
            return []
        with open(self.path, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]


# ---------------------------------------------------------------------------
# 5. Appeals
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Appeal:
    """A student or guardian disputing a score.

    An automated grade a child cannot argue with is not acceptable, and the
    route has to exist from the first day rather than be retrofitted after the
    first complaint.
    """
    submission_id: str
    student_id: str
    raised_by: str            # "student" or "guardian"
    reason: str
    raised_on: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class AppealRegister:
    """Disputes, and whether they have been looked at."""

    def __init__(self, path: str | Path, audit: Optional[AuditLog] = None):
        self.path = Path(path)
        self.audit = audit

    def raise_appeal(self, appeal: Appeal) -> None:
        record = appeal.to_dict()
        record["raised_on"] = record["raised_on"] or datetime.now(
            timezone.utc).isoformat(timespec="seconds")
        record["resolved"] = False
        existing = self.all()
        existing.append(record)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(existing, fh, indent=2, ensure_ascii=False)
        if self.audit:
            self.audit.record("appeal_raised", appeal.student_id, record)

    def all(self) -> list[dict]:
        if not self.path.exists():
            return []
        with open(self.path, encoding="utf-8") as fh:
            return json.load(fh)

    def open_appeals(self) -> list[dict]:
        return [a for a in self.all() if not a.get("resolved")]

    def is_disputed(self, submission_id: str) -> bool:
        return any(a["submission_id"] == submission_id and not a.get("resolved")
                   for a in self.all())
