"""Core data types for the homework grading agent.

Design reference: wiki/Homework-Grading-Agent.md

Two rules from the design are enforced structurally here rather than left to
caller discipline:

1. A missing score is never a zero. A parameter that could not be assessed is
   represented by ``ParameterScore.not_assessed(...)`` — it carries no numeric
   value at all, so it cannot accidentally be averaged in as 0.
2. "Cannot evaluate" is a first-class outcome, not an exception. An artifact
   that could not be graded returns an ``ArtifactResult`` with a reason and a
   bilingual student-facing message, not a low rating.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# --------------------------------------------------------------------------
# Parameters
# --------------------------------------------------------------------------

class VideoParameter(str, Enum):
    """The five parameters on the live rating panel, in panel order."""
    CONFIDENCE = "confidence"
    VOCABULARY = "vocabulary"
    TONE = "tone"
    HAND_GESTURE = "hand_gesture"
    SPEED = "speed"


class NoteParameter(str, Enum):
    """The four handwritten-note parameters agreed in the design."""
    COMPLETION = "completion"
    ACCURACY = "accuracy"
    COMPREHENSION = "comprehension"
    PRESENTATION = "presentation"


class ArtifactKind(str, Enum):
    VIDEO = "video"
    NOTE = "note"


# --------------------------------------------------------------------------
# Why something could not be assessed
# --------------------------------------------------------------------------

class NotAssessedReason(str, Enum):
    """Why a single parameter has no score.

    These are per-parameter. An artifact that cannot be graded at all uses
    CannotEvaluateReason instead.
    """
    THIN_EVIDENCE = "thin_evidence"          # e.g. framing hides the hands
    NOT_IN_SCOPE = "not_in_scope"            # module does not ask for it
    LOW_CONFIDENCE = "low_confidence"        # model below the abstain threshold
    NO_TRANSCRIPT = "no_transcript"          # needs speech that isn't available


class CannotEvaluateReason(str, Enum):
    """Why a whole artifact could not be graded.

    The last two are *our* problems, not the student's, and deliberately carry
    no student-facing message — see CANNOT_EVALUATE_MESSAGES.
    """
    NO_AUDIO = "no_audio"
    TOO_SHORT = "too_short"
    UNREADABLE_IMAGE = "unreadable_image"
    CORRUPT_FILE = "corrupt_file"
    NO_TRANSCRIBER = "no_transcriber"
    PROCESSING_FAILURE = "processing_failure"


@dataclass(frozen=True)
class StudentMessage:
    """A message shown to the student, in both languages.

    Bilingual is not optional: the students being graded are learning English,
    and feedback they cannot read is worthless.
    """
    en: str
    hi: str


#: Student-facing text for each cannot-evaluate reason.
#: PROCESSING_FAILURE is deliberately absent — that is our fault, not the
#: student's, and it must never surface to them as a failed submission.
CANNOT_EVALUATE_MESSAGES: dict[CannotEvaluateReason, StudentMessage] = {
    CannotEvaluateReason.NO_AUDIO: StudentMessage(
        en="We could not hear any sound in your video. Please record and upload it "
           "again, and check your microphone is on.",
        hi="आपके वीडियो में कोई आवाज़ नहीं सुनाई दी। कृपया माइक्रोफ़ोन चालू करके वीडियो "
           "दोबारा रिकॉर्ड करें और अपलोड करें।",
    ),
    CannotEvaluateReason.TOO_SHORT: StudentMessage(
        en="Your video is very short, so we could not check the full passage. "
           "Please upload the complete reading.",
        hi="आपका वीडियो बहुत छोटा है, इसलिए हम पूरा पैराग्राफ़ नहीं जाँच सके। "
           "कृपया पूरी रिकॉर्डिंग अपलोड करें।",
    ),
    CannotEvaluateReason.UNREADABLE_IMAGE: StudentMessage(
        en="We could not read your note clearly. Please take the photo again in "
           "good light, with the whole page in frame.",
        hi="हम आपका नोट साफ़ नहीं पढ़ सके। कृपया अच्छी रोशनी में, पूरा पन्ना दिखाते हुए "
           "फिर से फ़ोटो लें।",
    ),
    CannotEvaluateReason.CORRUPT_FILE: StudentMessage(
        en="This file could not be opened. Please upload your video as MP4 and "
           "your note as a photo.",
        hi="यह फ़ाइल खुल नहीं सकी। कृपया वीडियो MP4 में और नोट की फ़ोटो अपलोड करें।",
    ),
}


#: Student-facing text when an artifact was simply never uploaded.
#: A student who forgot half their homework needs to be told, otherwise the
#: only signal is a rating that looks unremarkable.
MISSING_ARTIFACT_MESSAGES: dict[str, StudentMessage] = {
    "video": StudentMessage(
        en="You did not upload your speaking video. Please record and send it so "
           "your full work can be marked.",
        hi="आपने अपना बोलने वाला वीडियो अपलोड नहीं किया। कृपया उसे रिकॉर्ड करके भेजें "
           "ताकि आपका पूरा काम जाँचा जा सके।",
    ),
    "note": StudentMessage(
        en="You did not upload your handwritten note. Please add it so your full "
           "work can be marked.",
        hi="आपने अपना लिखित नोट अपलोड नहीं किया। कृपया उसे भी भेजें ताकि आपका पूरा "
           "काम जाँचा जा सके।",
    ),
}


# --------------------------------------------------------------------------
# Scores
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class ParameterScore:
    """A 1-5 score for one parameter, or an explicit "not assessed".

    Construct via :meth:`scored` or :meth:`not_assessed` rather than directly,
    so an unassessed parameter can never carry a numeric value.
    """
    parameter: str
    value: Optional[int] = None
    reason: Optional[NotAssessedReason] = None
    note: str = ""

    @classmethod
    def scored(cls, parameter: str, value: int, note: str = "") -> "ParameterScore":
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(f"{parameter}: score must be an int, got {type(value).__name__}")
        if not 1 <= value <= 5:
            raise ValueError(f"{parameter}: score must be 1-5, got {value}. "
                             "A parameter with no evidence is not_assessed, never 0.")
        return cls(parameter=parameter, value=value, note=note)

    @classmethod
    def not_assessed(cls, parameter: str, reason: NotAssessedReason,
                     note: str = "") -> "ParameterScore":
        return cls(parameter=parameter, value=None, reason=reason, note=note)

    @property
    def is_assessed(self) -> bool:
        return self.value is not None


# --------------------------------------------------------------------------
# Module (the homework being graded against)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class WordListEntry:
    word: str
    meaning: str          # expected Hindi meaning — the answer key
    phonetic: str = ""


@dataclass(frozen=True)
class Module:
    """A homework unit. Authored once, reused across students.

    ``instruction`` is what the video is graded *against* — it is the source of
    the module-specific ask (calm voice, pauses, eye contact), which is what
    makes Tone mean something concrete rather than generic politeness.

    ``word_list`` doubles as the answer key for note Accuracy: because the
    expected Hindi meaning is known, reading the student's Devanagari becomes a
    match-against-candidates problem rather than open-vocabulary OCR.
    """
    module_id: str
    title: str
    instruction: str
    reference_content: str = ""
    word_list: tuple[WordListEntry, ...] = ()
    skill_type: str = "speaking_reading"
    expects_handwritten_note: bool = True
    eye_contact_expected: bool = False

    @property
    def answer_key(self) -> dict[str, str]:
        """English word -> expected Hindi meaning."""
        return {e.word.strip().lower(): e.meaning for e in self.word_list}


# --------------------------------------------------------------------------
# Submission and results
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Submission:
    """One student's homework for one module.

    ``student_id`` is supplied by the caller — it comes from the portal session
    the files were uploaded under. The agent never infers identity from the
    content of a video or a note.
    """
    submission_id: str
    student_id: str
    module_id: str
    video_path: Optional[str] = None
    note_path: Optional[str] = None
    submitted_at: str = ""


@dataclass(frozen=True)
class ArtifactResult:
    """The outcome for one artifact (the video, or the note).

    Exactly one of these three states holds:
      * graded          — parameter scores present, rating computed
      * cannot_evaluate — reason + student message, no rating
      * missing         — nothing was uploaded
    """
    kind: ArtifactKind
    scores: tuple[ParameterScore, ...] = ()
    rating: Optional[float] = None
    cannot_evaluate: Optional[CannotEvaluateReason] = None
    missing: bool = False

    @property
    def was_graded(self) -> bool:
        """A rating earned from actual scores.

        A missing artifact carries a 0, but it was never *graded* — nobody
        looked at any work. Keeping these apart is what stops a suspended or
        unreadable artifact from being treated like a zero.
        """
        return self.rating is not None and not self.missing

    @property
    def counts_as_zero(self) -> bool:
        """Nothing was uploaded, so this part of the homework scores 0."""
        return self.missing

    @property
    def student_message(self) -> Optional[StudentMessage]:
        """What to tell the student about this artifact, if anything.

        Covers both "you didn't send it" and "we couldn't read what you sent".
        A graded artifact has nothing to say here — its feedback comes from the
        scores.
        """
        if self.missing:
            return MISSING_ARTIFACT_MESSAGES.get(self.kind.value)
        if self.cannot_evaluate is None:
            return None
        return CANNOT_EVALUATE_MESSAGES.get(self.cannot_evaluate)

    @property
    def assessed_scores(self) -> tuple[ParameterScore, ...]:
        return tuple(s for s in self.scores if s.is_assessed)

    @property
    def unassessed_scores(self) -> tuple[ParameterScore, ...]:
        return tuple(s for s in self.scores if not s.is_assessed)


class TrendLabel(str, Enum):
    BASELINE = "Baseline"
    IMPROVED = "Improved"
    STABLE = "Stable"
    NEEDS_ATTENTION = "Needs attention"


@dataclass
class GradedSubmission:
    """The complete result for one submission — what gets stored and displayed."""
    submission_id: str
    student_id: str
    module_id: str
    video: ArtifactResult
    note: ArtifactResult
    overall_rating: Optional[float] = None
    incomplete: bool = False
    trend: Optional[TrendLabel] = None
    feedback: Optional[StudentMessage] = None
    flags: tuple[str, ...] = ()
    graded_at: str = ""
    extras: dict = field(default_factory=dict)

    @property
    def flagged_for_teacher(self) -> bool:
        return bool(self.flags)
