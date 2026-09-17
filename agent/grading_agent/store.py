"""Storing graded submissions and reading back a student's history.

A JSON file is the prototype's storage. It implements the ``ResultSink`` seam,
so swapping in the portal's database later means writing one class — nothing in
the scoring core touches storage.

Privacy note: records here key on ``student_id`` only. No names, and no media
paths are persisted beyond what the caller passes in. The design lists
indefinite retention of video, audio and frames as a Critical item — working
media files should be deleted after grading, and this store is deliberately not
a place to keep them.
"""
from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

from .models import GradedSubmission


def _to_jsonable(obj):
    if isinstance(obj, Enum):
        return obj.value
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _to_jsonable(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(v) for v in obj]
    return obj


class JsonSubmissionStore:
    """Append-only record of graded submissions, keyed by student."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._records: dict[str, list[dict]] = {}
        if self.path.exists():
            with open(self.path, encoding="utf-8") as fh:
                self._records = json.load(fh)

    # -- ResultSink -------------------------------------------------------

    def save(self, graded: GradedSubmission) -> None:
        record = _to_jsonable(graded)
        self._records.setdefault(graded.student_id, []).append(record)
        self._flush()

    # -- history ----------------------------------------------------------

    def overall_rating_history(
        self,
        student_id: str,
        module_skill_type: Optional[str] = None,
        limit: int = 10,
    ) -> list[float]:
        """Past overall ratings for this student, oldest first.

        Submissions that could not be evaluated have no rating and are skipped
        — a student who uploaded a silent video should not have that dragged
        into their trend.
        """
        out: list[float] = []
        for record in self._records.get(student_id, []):
            if module_skill_type and record.get("extras", {}).get("skill_type") != module_skill_type:
                continue
            rating = record.get("overall_rating")
            if rating is not None:
                out.append(float(rating))
        return out[-limit:]

    def all_records(self) -> dict[str, list[dict]]:
        return dict(self._records)

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(self._records, fh, indent=2, ensure_ascii=False)
