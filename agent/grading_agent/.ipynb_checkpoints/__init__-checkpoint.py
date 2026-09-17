"""Homework grading agent — Wazir Education Society.

Design reference: wiki/Homework-Grading-Agent.md

Quick start::

    from grading_agent import (
        GradingPipeline, Rubric, Module, Submission,
        RuleBasedVideoScorer, RuleBasedNoteScorer,
        VideoEvidence, NoteEvidence,
    )

    pipeline = GradingPipeline(Rubric.load(), RuleBasedVideoScorer(), RuleBasedNoteScorer())
    graded = pipeline.grade(submission, module, video_evidence, note_evidence)
    print(graded.overall_rating, graded.feedback.en)
"""
from .consent import ConsentRecord, ConsentRegister
from .devanagari import MatchResult, match_against_key, normalize, similarity
from .feedback import build_feedback
from .folder_source import FolderSubmissionSource
from .local_media import ConsentRequired, LocalMediaSource
from .models import (
    ArtifactKind,
    ArtifactResult,
    CannotEvaluateReason,
    GradedSubmission,
    Module,
    NotAssessedReason,
    NoteParameter,
    ParameterScore,
    StudentMessage,
    Submission,
    TrendLabel,
    VideoParameter,
    WordListEntry,
)
from .pipeline import GradingPipeline
from .providers import (
    NoteEvidence,
    RuleBasedNoteScorer,
    RuleBasedVideoScorer,
    Transcript,
    VideoEvidence,
    check_note,
    check_video,
)
from .rubric import Rubric
from .scoring import build_artifact_result, combine_overall, grade_submission, mean_of_assessed
from .store import JsonSubmissionStore
from .trend import compute_trend

__all__ = [
    "ArtifactKind", "ArtifactResult", "CannotEvaluateReason", "ConsentRecord",
    "ConsentRegister", "ConsentRequired", "GradedSubmission", "LocalMediaSource",
    "FolderSubmissionSource", "GradingPipeline", "JsonSubmissionStore", "MatchResult", "Module",
    "NotAssessedReason", "NoteEvidence", "NoteParameter", "ParameterScore",
    "RuleBasedNoteScorer", "RuleBasedVideoScorer", "Rubric", "StudentMessage",
    "Submission", "Transcript", "TrendLabel", "VideoEvidence", "VideoParameter",
    "WordListEntry", "build_artifact_result", "build_feedback", "check_note",
    "check_video", "combine_overall", "compute_trend", "grade_submission",
    "match_against_key", "mean_of_assessed", "normalize", "similarity",
]
