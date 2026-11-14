"""Consent gate — nothing processes a child's media without a recorded permission.

The design names this as *the* blocker before the agent touches real students:

    Consent & Legal — No verifiable consent workflow — Critical —
    Collect and record parent/guardian consent before upload.

Documenting that requirement is not the same as enforcing it, so this module
enforces it. A submission whose student has no consent record is **skipped
entirely** — not graded, not scored, not stored. The media is never opened.

Deliberately not a grading outcome
----------------------------------
A missing consent record is not a "cannot evaluate" result and produces no
feedback to the student. It is an operator problem: someone has not collected a
form. Turning it into a student-visible outcome would tell a child that
something is wrong with their homework, when in fact something is wrong with
our paperwork.

The register is a JSON file kept **outside** the repository, alongside the
media it governs. It records that consent exists and when it was taken — never
the guardian's name, signature, contact details or any other personal data.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class ConsentRecord:
    """Proof that permission was collected for one student."""
    student_id: str
    granted: bool
    recorded_on: str = ""
    scope: str = "evaluation_only"
    note: str = ""

    @property
    def allows_processing(self) -> bool:
        return self.granted


class ConsentRegister:
    """Which students may have their media processed.

    Fails closed: an unreadable, missing or malformed register grants nothing.
    A bug in this file must never result in a child's video being processed.
    """

    def __init__(self, records: Optional[dict[str, ConsentRecord]] = None):
        self._records: dict[str, ConsentRecord] = records or {}

    # -- loading ----------------------------------------------------------

    @classmethod
    def load(cls, path: str | Path) -> "ConsentRegister":
        p = Path(path)
        if not p.exists():
            return cls()
        try:
            with open(p, encoding="utf-8") as fh:
                raw = json.load(fh)
        except (json.JSONDecodeError, OSError):
            # Fail closed. An unreadable register is not permission.
            return cls()

        records: dict[str, ConsentRecord] = {}
        for student_id, entry in (raw or {}).items():
            if not isinstance(entry, dict):
                continue
            records[student_id] = ConsentRecord(
                student_id=student_id,
                granted=bool(entry.get("granted", False)),
                recorded_on=str(entry.get("recorded_on", "")),
                scope=str(entry.get("scope", "evaluation_only")),
                note=str(entry.get("note", "")),
            )
        return cls(records)

    # -- queries ----------------------------------------------------------

    def allows(self, student_id: str) -> bool:
        record = self._records.get(student_id)
        return bool(record and record.allows_processing)

    def get(self, student_id: str) -> Optional[ConsentRecord]:
        return self._records.get(student_id)

    def without_consent(self, student_ids) -> list[str]:
        """Which of these students may not have their media processed."""
        return [s for s in student_ids if not self.allows(s)]

    def __len__(self) -> int:
        return sum(1 for r in self._records.values() if r.allows_processing)
