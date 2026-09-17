"""Pluggable seams — everything the agent needs from the outside world.

This module is what keeps the agent from becoming an obstacle when it is
plugged into the main portal. Nothing in the scoring core reads a file path,
calls an API, or knows where a submission came from. All of that lives behind
the small interfaces below, so wiring the portal in later means writing one
class per seam and changing no scoring logic.

Seams:
    SubmissionSource  — where submissions come from (a folder now, the portal later)
    ResultSink        — where graded results go (a JSON file now, the portal API later)
    Transcriber       — audio -> transcript with word timings
    VideoScorer       — video evidence -> the five video parameter scores
    NoteScorer        — note image -> the four note parameter scores
    FeedbackWriter    — optional model-written feedback (falls back to feedback.py)

Prompt-level rules for any real scorer implementation
-----------------------------------------------------
These are not enforceable in Python, so they belong in the prompt of whatever
model implements VideoScorer / NoteScorer, and are repeated here so they are
not lost in translation:

  * An accent is never an error. Indian and regional accents are not marked
    down. Score whether the student was understandable, not whether they sound
    like a particular speaker.
  * Never infer the activity from posture. Head down means a student reading
    from the page in front of them, not a student doing the wrong task. Only
    audio distinguishes reading aloud from silent writing.
  * Eye contact is scored only when ``module.eye_contact_expected`` is true.
    For a plain read-aloud task, looking at the page is correct behaviour.
  * When evidence is thin, abstain. Return ``ParameterScore.not_assessed(...)``
    rather than a low score. A student must never receive a 1 because the
    camera was framed too close.
  * Minor spelling slips are not Accuracy failures unless they change meaning.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol, Sequence, runtime_checkable

from .models import (
    ArtifactKind,
    CannotEvaluateReason,
    GradedSubmission,
    Module,
    NoteParameter,
    NotAssessedReason,
    ParameterScore,
    StudentMessage,
    Submission,
    VideoParameter,
)


# --------------------------------------------------------------------------
# Evidence carriers
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Transcript:
    """Speech recognised from the video, with enough timing for Speed."""
    text: str
    duration_seconds: float
    word_count: int
    filler_count: int = 0

    @property
    def words_per_minute(self) -> Optional[float]:
        """Computed, not guessed — this is the one measured video parameter."""
        if self.duration_seconds <= 0:
            return None
        return round(self.word_count / (self.duration_seconds / 60.0), 1)


@dataclass(frozen=True)
class VideoEvidence:
    """What was extracted from a submitted video.

    ``audio_stream_present`` and ``transcript`` answer two different questions,
    and conflating them mislabels a student. A file with no audio track means
    the microphone really was off — that is the student's problem and they
    should be told. A file with audio but no transcript means we have not
    configured speech-to-text — our problem, and no reason to accuse anyone of
    recording in silence.
    """
    transcript: Optional[Transcript] = None
    sampled_frame_count: int = 0
    hands_visible_in_frames: int = 0
    duration_seconds: float = 0.0
    audio_stream_present: bool = False

    @property
    def has_audio(self) -> bool:
        """True if the recording actually carries sound."""
        if self.audio_stream_present:
            return True
        return self.transcript is not None and self.transcript.word_count > 0

    @property
    def has_transcript(self) -> bool:
        return self.transcript is not None and self.transcript.word_count > 0


@dataclass(frozen=True)
class NoteEvidence:
    """What was read off the handwritten note.

    ``rows_expected`` / ``rows_filled`` are counted without reading the script,
    which is what keeps Completion independent of OCR quality.

    ``read_confidence`` maps a row to how confidently its handwriting was read,
    supplied by whatever did the reading. Rows below the threshold abstain
    instead of being marked wrong — see ``devanagari.py``. Rows with no entry
    are assumed readable.
    """
    rows_expected: int = 0
    rows_filled: int = 0
    written_rows: dict[str, str] = field(default_factory=dict)
    read_confidence: dict[str, float] = field(default_factory=dict)
    action_points: tuple[str, ...] = ()
    legible: bool = True


# --------------------------------------------------------------------------
# Interfaces
# --------------------------------------------------------------------------

@runtime_checkable
class SubmissionSource(Protocol):
    """Where submissions come from. Implement this to plug in the portal."""
    def pending_submissions(self) -> Sequence[Submission]: ...
    def load_module(self, module_id: str) -> Module: ...


@runtime_checkable
class ResultSink(Protocol):
    """Where graded results go. Implement this to write back to the portal."""
    def save(self, graded: GradedSubmission) -> None: ...


@runtime_checkable
class StudentLifecycle(Protocol):
    """Removal, as part of the contract rather than as an afterthought.

    The portal MUST call ``on_student_removed`` when a student leaves the
    school, is unenrolled, or withdraws consent. Everything this system holds
    about a child is derived data, and derived data that outlives the
    relationship is just a file on a child that nobody remembers keeping.

    ``grading_agent.erasure.erase_student`` is the reference implementation; it
    requires the caller to state an audit-retention policy rather than
    inheriting one, because that choice belongs to the school.
    """
    def on_student_removed(self, student_id: str) -> None: ...


@runtime_checkable
class Transcriber(Protocol):
    def transcribe(self, video_path: str) -> Optional[Transcript]: ...


@runtime_checkable
class VideoScorer(Protocol):
    def score(self, evidence: VideoEvidence, module: Module) -> Sequence[ParameterScore]: ...


@runtime_checkable
class NoteScorer(Protocol):
    def score(self, evidence: NoteEvidence, module: Module) -> Sequence[ParameterScore]: ...


@runtime_checkable
class FeedbackWriter(Protocol):
    def write(self, graded: GradedSubmission, module: Module) -> Optional[StudentMessage]: ...


# --------------------------------------------------------------------------
# Pre-flight checks — cannot-evaluate detection
# --------------------------------------------------------------------------

MIN_VIDEO_SECONDS = 10.0


def check_video(evidence: VideoEvidence) -> Optional[CannotEvaluateReason]:
    """Decide whether the video can be graded at all, before scoring anything.

    A video with sound but no transcript is **not** blocked here. Some
    parameters (Hand Gesture, and posture-based signals) can still be observed
    from frames, and the ones that need speech abstain individually. Refusing
    the whole artifact would throw away real evidence and tell the student
    nothing useful.
    """
    if evidence.duration_seconds <= 0:
        return CannotEvaluateReason.CORRUPT_FILE
    if not evidence.has_audio:
        # Genuinely silent — the microphone was off. The student can fix this.
        return CannotEvaluateReason.NO_AUDIO
    if evidence.duration_seconds < MIN_VIDEO_SECONDS:
        return CannotEvaluateReason.TOO_SHORT
    return None


def check_note(evidence: NoteEvidence) -> Optional[CannotEvaluateReason]:
    if not evidence.legible:
        return CannotEvaluateReason.UNREADABLE_IMAGE
    if evidence.rows_expected == 0 and not evidence.action_points:
        return CannotEvaluateReason.UNREADABLE_IMAGE
    return None


# --------------------------------------------------------------------------
# Deterministic reference implementations
# --------------------------------------------------------------------------

class RuleBasedVideoScorer:
    """A model-free video scorer, used for tests and offline runs.

    Only Speed is scored from real measurement (words per minute). The other
    four are crude heuristics standing in for a vision/language model — they
    exist so the pipeline runs end to end without an API key, not because they
    are good. A real implementation replaces this class and nothing else.
    """

    def score(self, evidence: VideoEvidence, module: Module) -> Sequence[ParameterScore]:
        scores: list[ParameterScore] = []
        transcript = evidence.transcript

        # Speed — genuinely measured from transcript timing.
        wpm = transcript.words_per_minute if evidence.has_transcript else None
        if wpm is None:
            scores.append(ParameterScore.not_assessed(
                VideoParameter.SPEED.value, NotAssessedReason.NO_TRANSCRIPT,
                "No transcript timing available."))
        else:
            if 90 <= wpm <= 150:
                value = 5
            elif 75 <= wpm < 90 or 150 < wpm <= 170:
                value = 4
            elif 60 <= wpm < 75 or 170 < wpm <= 190:
                value = 3
            else:
                value = 2
            scores.append(ParameterScore.scored(
                VideoParameter.SPEED.value, value, f"Measured {wpm} words per minute."))

        # Confidence — filler rate as a stand-in signal.
        if evidence.has_transcript:
            rate = transcript.filler_count / transcript.word_count
            value = 5 if rate < 0.01 else 4 if rate < 0.03 else 3 if rate < 0.06 else 2
            scores.append(ParameterScore.scored(
                VideoParameter.CONFIDENCE.value, value,
                f"Filler words were {rate:.1%} of the reading."))
        else:
            scores.append(ParameterScore.not_assessed(
                VideoParameter.CONFIDENCE.value, NotAssessedReason.NO_TRANSCRIPT))

        # Vocabulary — did the module's target words actually get said?
        if evidence.has_transcript and module.word_list:
            said = sum(1 for e in module.word_list
                       if e.word.lower() in transcript.text.lower())
            ratio = said / len(module.word_list)
            value = 5 if ratio >= 0.9 else 4 if ratio >= 0.7 else 3 if ratio >= 0.5 else 2
            scores.append(ParameterScore.scored(
                VideoParameter.VOCABULARY.value, value,
                f"Used {said} of {len(module.word_list)} words from the list."))
        else:
            scores.append(ParameterScore.not_assessed(
                VideoParameter.VOCABULARY.value, NotAssessedReason.NO_TRANSCRIPT))

        # Tone — needs a real model reading the module Instruction. Abstaining
        # is the honest answer here rather than inventing a number.
        scores.append(ParameterScore.not_assessed(
            VideoParameter.TONE.value, NotAssessedReason.LOW_CONFIDENCE,
            "Tone needs a model reading the module Instruction; not scored offline."))

        # Hand gesture — sampled frames only, and only when hands were visible.
        if evidence.sampled_frame_count == 0:
            scores.append(ParameterScore.not_assessed(
                VideoParameter.HAND_GESTURE.value, NotAssessedReason.THIN_EVIDENCE,
                "No frames were sampled."))
        elif evidence.hands_visible_in_frames == 0:
            # The framing hid the hands. That is not the student's performance,
            # so it must not become a low score.
            scores.append(ParameterScore.not_assessed(
                VideoParameter.HAND_GESTURE.value, NotAssessedReason.THIN_EVIDENCE,
                "Framing did not show the student's hands."))
        else:
            visible = evidence.hands_visible_in_frames / evidence.sampled_frame_count
            scores.append(ParameterScore.scored(
                VideoParameter.HAND_GESTURE.value, 4 if visible > 0.5 else 3,
                f"Hands visible in {evidence.hands_visible_in_frames} of "
                f"{evidence.sampled_frame_count} sampled frames."))

        return scores


class RuleBasedNoteScorer:
    """A model-free note scorer.

    Completion and Accuracy are real: Completion counts filled rows without
    reading them, and Accuracy uses answer-key matching (see ``devanagari.py``),
    which needs no model at all. Comprehension needs a model and abstains.
    """

    def __init__(self, min_confidence: float = 0.75):
        self.min_confidence = min_confidence

    def score(self, evidence: NoteEvidence, module: Module) -> Sequence[ParameterScore]:
        from .devanagari import score_answer_key_rows

        scores: list[ParameterScore] = []

        # Completion — deliberately independent of reading the script.
        if evidence.rows_expected:
            ratio = evidence.rows_filled / evidence.rows_expected
            value = 5 if ratio >= 0.95 else 4 if ratio >= 0.8 else 3 if ratio >= 0.6 else 2 if ratio >= 0.3 else 1
            scores.append(ParameterScore.scored(
                NoteParameter.COMPLETION.value, value,
                f"{evidence.rows_filled} of {evidence.rows_expected} items attempted."))
        else:
            scores.append(ParameterScore.not_assessed(
                NoteParameter.COMPLETION.value, NotAssessedReason.THIN_EVIDENCE))

        # Accuracy — match against the module's answer key, abstaining on any
        # row we are not confident we read correctly.
        results = score_answer_key_rows(
            evidence.written_rows,
            module.answer_key,
            read_confidence=evidence.read_confidence,
            min_read_confidence=self.min_confidence)
        scoreable = [r for r in results.values() if r.counts_toward_accuracy]
        if scoreable:
            correct = sum(1 for r in scoreable if r.is_match)
            ratio = correct / len(scoreable)
            value = 5 if ratio >= 0.95 else 4 if ratio >= 0.8 else 3 if ratio >= 0.6 else 2 if ratio >= 0.3 else 1
            abstained = len(results) - len(scoreable)
            note = f"{correct} of {len(scoreable)} checked answers correct."
            if abstained:
                note += f" {abstained} could not be read confidently and were left out."
            scores.append(ParameterScore.scored(NoteParameter.ACCURACY.value, value, note))
        else:
            scores.append(ParameterScore.not_assessed(
                NoteParameter.ACCURACY.value, NotAssessedReason.LOW_CONFIDENCE,
                "No answers could be read with enough confidence to mark."))

        # Comprehension — genuinely needs a model to judge "own words".
        scores.append(ParameterScore.not_assessed(
            NoteParameter.COMPREHENSION.value, NotAssessedReason.LOW_CONFIDENCE,
            "Comprehension needs a model comparing the points to the article."))

        # Presentation — legibility and structure.
        if evidence.rows_expected:
            scores.append(ParameterScore.scored(
                NoteParameter.PRESENTATION.value, 4 if evidence.legible else 2,
                "Layout followed the expected structure."))
        else:
            scores.append(ParameterScore.not_assessed(
                NoteParameter.PRESENTATION.value, NotAssessedReason.THIN_EVIDENCE))

        return scores
