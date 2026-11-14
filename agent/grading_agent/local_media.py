"""Reading real student media from a private folder outside the repository.

Media of identifiable children must never be committed. This module lets the
agent run against real files kept in a local folder — one that is gitignored,
lives outside version control's reach, and is guarded by the consent register.

Layout of a media folder::

    local_media/
        consent.json            # who may be processed (see consent.py)
        <student_id>/
            video.mp4
            note.jpg

Nothing here opens a file until :class:`LocalMediaSource` has checked consent
for that student.

What can honestly be extracted offline
--------------------------------------
Duration comes from ``ffprobe`` and is real. Everything else on the video side
— transcript, filler rate, frames showing hands — needs a speech-to-text
service and a vision model. Without a ``Transcriber`` configured, this module
reports ``NO_TRANSCRIBER`` rather than pretending the video was silent: those
recordings do have sound, we simply have no way to hear them here. That
distinction matters, because "your microphone was off" is advice to a student
and "we have not configured transcription" is a job for whoever runs the agent.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .consent import ConsentRegister
from .models import CannotEvaluateReason
from .providers import NoteEvidence, Transcriber, VideoEvidence

VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi")
NOTE_SUFFIXES = (".jpg", ".jpeg", ".png", ".heic", ".webp", ".pdf")


@dataclass(frozen=True)
class MediaPaths:
    video: Optional[Path] = None
    note: Optional[Path] = None

    @property
    def has_any(self) -> bool:
        return self.video is not None or self.note is not None


def probe_duration_seconds(path: Path) -> Optional[float]:
    """Real duration via ffprobe, or None if ffprobe is unavailable."""
    if shutil.which("ffprobe") is None:
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=30, check=True,
        )
        return float(json.loads(out.stdout)["format"]["duration"])
    except (subprocess.SubprocessError, KeyError, ValueError, json.JSONDecodeError):
        return None


class ConsentRequired(PermissionError):
    """Raised when media is requested for a student with no consent on file."""


class LocalMediaSource:
    """Finds and reads real student media from a private local folder.

    Every read is gated on the consent register. There is no bypass parameter:
    if consent is missing, the caller gets an exception rather than an option.
    """

    def __init__(
        self,
        root: str | Path,
        consent: Optional[ConsentRegister] = None,
        transcriber: Optional[Transcriber] = None,
    ):
        self.root = Path(root)
        self.consent = consent if consent is not None else ConsentRegister.load(
            self.root / "consent.json")
        self.transcriber = transcriber

    # -- discovery --------------------------------------------------------

    def students_with_media(self) -> list[str]:
        """Student folders present on disk, whether or not consent exists."""
        if not self.root.exists():
            return []
        return sorted(p.name for p in self.root.iterdir()
                      if p.is_dir() and not p.name.startswith("."))

    def locate(self, student_id: str) -> MediaPaths:
        """Which media files exist for this student. Does not open them."""
        folder = self.root / student_id
        if not folder.is_dir():
            return MediaPaths()
        video = next((p for p in sorted(folder.iterdir())
                      if p.suffix.lower() in VIDEO_SUFFIXES), None)
        note = next((p for p in sorted(folder.iterdir())
                     if p.suffix.lower() in NOTE_SUFFIXES), None)
        return MediaPaths(video=video, note=note)

    # -- reading ----------------------------------------------------------

    def video_evidence(
        self, student_id: str
    ) -> tuple[Optional[VideoEvidence], Optional[CannotEvaluateReason]]:
        """Evidence from this student's video, and any blocker found.

        Raises ``ConsentRequired`` before touching the file if the student has
        no recorded consent.
        """
        self._require_consent(student_id)

        paths = self.locate(student_id)
        if paths.video is None:
            return None, None

        duration = probe_duration_seconds(paths.video)
        if duration is None:
            return None, CannotEvaluateReason.CORRUPT_FILE

        transcript = None
        if self.transcriber is not None:
            transcript = self.transcriber.transcribe(str(paths.video))

        if transcript is None:
            # Honest: the recording has sound, we have no way to hear it.
            # Not NO_AUDIO, which would wrongly tell the student their
            # microphone was off.
            return (VideoEvidence(duration_seconds=duration),
                    CannotEvaluateReason.NO_TRANSCRIBER)

        return VideoEvidence(transcript=transcript, duration_seconds=duration), None

    def note_evidence(self, student_id: str) -> Optional[NoteEvidence]:
        """Reading a handwritten note needs a vision model.

        Returns None until a ``NoteScorer`` backed by one is wired in — there
        is nothing honest to extract from a photograph offline.
        """
        self._require_consent(student_id)
        return None

    # -- guard ------------------------------------------------------------

    def _require_consent(self, student_id: str) -> None:
        if not self.consent.allows(student_id):
            raise ConsentRequired(
                f"No recorded guardian consent for {student_id}. "
                f"Add an entry to {self.root / 'consent.json'} before this "
                f"student's media can be processed."
            )
