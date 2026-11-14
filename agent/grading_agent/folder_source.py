"""Reading modules and submissions from a folder on disk.

The first real implementation of the ``SubmissionSource`` seam. It exists for
two reasons: it makes the agent runnable end to end without a portal, and it
proves the seam is actually implementable rather than an interface nobody has
tried to satisfy.

Expected layout::

    sample_data/
        modules/
            <module_id>.json
        submissions/
            <submission_id>.json

A submission file carries the *evidence* — what the ingestion stage extracted
from the media — rather than the media itself. In production that evidence
comes from a transcriber and a vision model; here it is written down as JSON so
the scoring pipeline can be run and inspected without media files or API calls.

Writing the portal's own version of this class is what integration looks like:
same two methods, reading from the portal instead of a directory.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Sequence

from .models import Module, Submission, WordListEntry
from .providers import NoteEvidence, Transcript, VideoEvidence


class FolderSubmissionSource:
    """Loads modules and submissions from a directory tree."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.modules_dir = self.root / "modules"
        self.submissions_dir = self.root / "submissions"

    # -- SubmissionSource -------------------------------------------------

    def pending_submissions(self) -> Sequence[Submission]:
        """Every submission file in the folder, in filename order."""
        out: list[Submission] = []
        for path in sorted(self.submissions_dir.glob("*.json")):
            raw = self._read(path)
            out.append(Submission(
                submission_id=raw["submission_id"],
                student_id=raw["student_id"],
                module_id=raw["module_id"],
                submitted_at=raw.get("submitted_at", ""),
            ))
        return out

    def load_module(self, module_id: str) -> Module:
        raw = self._read(self.modules_dir / f"{module_id}.json")
        return Module(
            module_id=raw["module_id"],
            title=raw["title"],
            instruction=raw["instruction"],
            reference_content=raw.get("reference_content", ""),
            word_list=tuple(
                WordListEntry(w["word"], w["meaning"], w.get("phonetic", ""))
                for w in raw.get("word_list", ())
            ),
            skill_type=raw.get("skill_type", "speaking_reading"),
            expects_handwritten_note=raw.get("expects_handwritten_note", True),
            eye_contact_expected=raw.get("eye_contact_expected", False),
        )

    # -- evidence ---------------------------------------------------------

    def load_evidence(
        self, submission_id: str
    ) -> tuple[Optional[VideoEvidence], Optional[NoteEvidence]]:
        """The evidence for one submission.

        ``None`` means the artifact was never uploaded — which is different
        from an artifact that was uploaded but could not be graded, and the
        pipeline treats the two differently.
        """
        raw = self._read(self.submissions_dir / f"{submission_id}.json")
        return self._video(raw.get("video_evidence")), self._note(raw.get("note_evidence"))

    @staticmethod
    def _video(raw: Optional[dict]) -> Optional[VideoEvidence]:
        if raw is None:
            return None
        t = raw.get("transcript")
        transcript = None
        if t is not None:
            transcript = Transcript(
                text=t.get("text", ""),
                duration_seconds=float(t.get("duration_seconds", 0.0)),
                word_count=int(t.get("word_count", 0)),
                filler_count=int(t.get("filler_count", 0)),
            )
        return VideoEvidence(
            transcript=transcript,
            sampled_frame_count=int(raw.get("sampled_frame_count", 0)),
            hands_visible_in_frames=int(raw.get("hands_visible_in_frames", 0)),
            duration_seconds=float(raw.get("duration_seconds", 0.0)),
        )

    @staticmethod
    def _note(raw: Optional[dict]) -> Optional[NoteEvidence]:
        if raw is None:
            return None
        return NoteEvidence(
            rows_expected=int(raw.get("rows_expected", 0)),
            rows_filled=int(raw.get("rows_filled", 0)),
            written_rows=dict(raw.get("written_rows", {})),
            read_confidence={k: float(v) for k, v in raw.get("read_confidence", {}).items()},
            action_points=tuple(raw.get("action_points", ())),
            legible=bool(raw.get("legible", True)),
        )

    @staticmethod
    def _read(path: Path) -> dict:
        if not path.exists():
            raise FileNotFoundError(f"Not found: {path}")
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
