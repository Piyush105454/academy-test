"""Removing a student, everywhere.

`profile.forget()` has existed since Version 2, but nothing obliged anyone to
call it. A right to erasure that depends on an engineer remembering is not a
right, so it becomes part of the integration contract: the portal implements
`StudentLifecycle` and calls it when a student leaves.

There is a real tension here that this module does not pretend to resolve.

    The profile     exists only to choose what to say next. Deleting it costs
                    nothing and it should go.
    The audit log   exists to answer "why did this child get this score in
                    March?" — including for the family asking after the child
                    has left. Deleting it destroys the record that makes an
                    automated grade contestable.

So `audit_policy` has no default. Whoever integrates this has to state which
they chose, and the choice is visible in their code rather than inherited from
ours. It is a school and data-protection decision, not an engineering one.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

from .profile import forget

TOMBSTONE = "erased"


class AuditPolicy(str, Enum):
    KEEP = "keep"
    """Leave audit rows untouched. The grade stays contestable; the student ID
    stays on disk."""

    PSEUDONYMISE = "pseudonymise"
    """Replace the student ID with a tombstone. Counts, flag rates and fairness
    reporting survive; the link to the person does not."""

    DELETE = "delete"
    """Remove the rows. Nothing survives — including the ability to answer a
    later question about the grade."""


@dataclass(frozen=True)
class ErasureReport:
    student_id: str
    profile_removed: bool
    audit_policy: AuditPolicy
    audit_rows_affected: int = 0
    appeals_affected: int = 0

    def summary(self) -> str:
        return (f"{self.student_id}: profile "
                f"{'removed' if self.profile_removed else 'not found'}, "
                f"audit {self.audit_policy.value} "
                f"({self.audit_rows_affected} row(s)), "
                f"{self.appeals_affected} appeal(s)")


def _rewrite_jsonl(path: Path, student_id: str, policy: AuditPolicy) -> int:
    if policy is AuditPolicy.KEEP or not path.exists():
        return 0
    kept, touched = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            kept.append(line)          # never silently drop what we cannot parse
            continue
        if row.get("student_id") != student_id:
            kept.append(line)
            continue
        touched += 1
        if policy is AuditPolicy.PSEUDONYMISE:
            row["student_id"] = TOMBSTONE
            kept.append(json.dumps(row, ensure_ascii=False))
        # DELETE: the row is not kept
    path.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return touched


def erase_student(
    student_id: str,
    *,
    profile_store=None,
    audit_path: Optional[str | Path] = None,
    appeals_path: Optional[str | Path] = None,
    audit_policy: AuditPolicy,          # deliberately keyword-only, no default
) -> ErasureReport:
    """Remove a student from everything this system holds about them."""
    if not str(student_id).strip():
        raise ValueError("erase_student needs a student_id.")

    removed = bool(profile_store is not None and forget(profile_store, student_id))
    audit_rows = _rewrite_jsonl(Path(audit_path), student_id, audit_policy) \
        if audit_path else 0
    appeals = _rewrite_jsonl(Path(appeals_path), student_id, audit_policy) \
        if appeals_path else 0

    return ErasureReport(
        student_id=student_id,
        profile_removed=removed,
        audit_policy=audit_policy,
        audit_rows_affected=audit_rows,
        appeals_affected=appeals,
    )
