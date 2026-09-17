"""The end-to-end grading run for one submission.

This is the only place the stages are wired together. Every external
dependency arrives as a constructor argument, so the same pipeline runs
offline with rule-based scorers or in production against real models and the
portal, with no change here.

Version 2 adds four things, in this order:

1. **Relevance** — does this submission answer *this* module? Checked from
   content, never appearance. Off-topic suspends scoring for a teacher's look
   rather than zeroing the student.
2. **Personalisation** — feedback drawn from the student's own recent history,
   so advice does not repeat week after week.
3. **Guardrails** — every score must cite evidence, and nothing student-facing
   may contain a conclusion the agent is not entitled to draw.
4. **Audit** — what was graded, when, and why.
"""
from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from .feedback import build_feedback
from .models import (
    ArtifactKind,
    ArtifactResult,
    CannotEvaluateReason,
    GradedSubmission,
    Module,
    Submission,
)
from .providers import (
    NoteEvidence,
    NoteScorer,
    VideoEvidence,
    VideoScorer,
    check_note,
    check_video,
)
from .relevance import Relevance, check_note_relevance, check_transcript_relevance
from .responsible import AuditLog, check_evidence, scan_graded_submission
from .rubric import Rubric
from .scoring import build_artifact_result, grade_submission
from .trend import compute_trend


class GradingPipeline:
    def __init__(
        self,
        rubric: Rubric,
        video_scorer: VideoScorer,
        note_scorer: NoteScorer,
        feedback_writer=None,
        audit: Optional[AuditLog] = None,
        check_relevance: bool = True,
    ):
        self.rubric = rubric
        self.video_scorer = video_scorer
        self.note_scorer = note_scorer
        self.feedback_writer = feedback_writer
        self.audit = audit
        self.check_relevance = check_relevance

    def grade(
        self,
        submission: Submission,
        module: Module,
        video_evidence: Optional[VideoEvidence] = None,
        note_evidence: Optional[NoteEvidence] = None,
        previous_ratings: Sequence[float] = (),
        profile=None,
    ) -> GradedSubmission:
        video = self._grade_video(video_evidence, module)
        note = self._grade_note(note_evidence, module)

        graded = grade_submission(
            submission_id=submission.submission_id,
            student_id=submission.student_id,
            module_id=module.module_id,
            video=video,
            note=note,
            rubric=self.rubric,
            previous_ratings=previous_ratings,
        )

        # -- relevance: did this answer *this* module? --------------------
        extra_flags: list[str] = []
        if self.check_relevance:
            extra_flags += self._relevance_flags(graded, video_evidence, note_evidence, module)

        graded.trend = compute_trend(graded.overall_rating, previous_ratings, self.rubric)

        # A model-written note is preferred when available; the deterministic
        # builder is the fallback so a provider outage never leaves a student
        # with a score and no explanation.
        written = None
        if self.feedback_writer is not None:
            written = self.feedback_writer.write(graded, module)
        graded.feedback = written or build_feedback(
            graded, self.rubric, trend=graded.trend, profile=profile)

        # -- guardrails ---------------------------------------------------
        extra_flags += self._guardrail_flags(graded)

        if extra_flags:
            graded.flags = tuple(list(graded.flags) + extra_flags)

        graded.graded_at = date.today().isoformat()
        graded.extras["skill_type"] = module.skill_type
        graded.extras["personalised"] = bool(profile is not None and profile.has_history)

        if self.audit is not None:
            self.audit.record_grading(graded)

        return graded

    # -- relevance --------------------------------------------------------

    def _relevance_flags(self, graded, video_evidence, note_evidence, module) -> list[str]:
        """Check both artifacts against the module, and record the verdicts.

        Off-topic work is flagged and its rating suppressed — never scored
        zero, and never announced to the student on the agent's word alone. A
        teacher confirms first.
        """
        flags: list[str] = []

        if video_evidence is not None:
            text = video_evidence.transcript.text if video_evidence.has_transcript else None
            verdict = check_transcript_relevance(text, module)
            graded.extras["video_relevance"] = verdict.status.value
            graded.extras["video_relevance_evidence"] = verdict.evidence
            if verdict.status is Relevance.OFF_TOPIC:
                graded.video = ArtifactResult(
                    kind=ArtifactKind.VIDEO,
                    scores=graded.video.scores,
                    cannot_evaluate=CannotEvaluateReason.PROCESSING_FAILURE,
                )
                flags.append(f"video_may_be_off_topic ({verdict.overlap:.0%} match) "
                             f"— needs a teacher to confirm")

        if note_evidence is not None:
            verdict = check_note_relevance(
                note_evidence.written_rows, note_evidence.action_points, module)
            graded.extras["note_relevance"] = verdict.status.value
            graded.extras["note_relevance_evidence"] = verdict.evidence
            if verdict.status is Relevance.OFF_TOPIC:
                graded.note = ArtifactResult(
                    kind=ArtifactKind.NOTE,
                    scores=graded.note.scores,
                    cannot_evaluate=CannotEvaluateReason.PROCESSING_FAILURE,
                )
                flags.append(f"note_may_be_off_topic ({verdict.overlap:.0%} match) "
                             f"— needs a teacher to confirm")

        # Recompute the overall if either artifact was suspended.
        if flags:
            from .scoring import combine_overall
            graded.overall_rating, graded.incomplete = combine_overall(
                graded.video, graded.note, self.rubric)

        return flags

    # -- guardrails -------------------------------------------------------

    def _guardrail_flags(self, graded: GradedSubmission) -> list[str]:
        flags: list[str] = []

        gaps = check_evidence(list(graded.video.scores) + list(graded.note.scores))
        if gaps:
            flags.append(f"evidence_missing ({len(gaps)} parameters have no stated basis)")

        violations = scan_graded_submission(graded)
        if violations:
            categories = sorted({v.category for v in violations})
            flags.append(f"BLOCKED_forbidden_inference ({', '.join(categories)})")

        return flags

    # -- per-artifact -----------------------------------------------------

    def _grade_video(self, evidence: Optional[VideoEvidence], module: Module) -> ArtifactResult:
        if evidence is None:
            return build_artifact_result(ArtifactKind.VIDEO, missing=True)

        blocker = check_video(evidence)
        if blocker is not None:
            return build_artifact_result(ArtifactKind.VIDEO, cannot_evaluate=blocker)

        return build_artifact_result(
            ArtifactKind.VIDEO, self.video_scorer.score(evidence, module))

    def _grade_note(self, evidence: Optional[NoteEvidence], module: Module) -> ArtifactResult:
        if evidence is None:
            return build_artifact_result(ArtifactKind.NOTE, missing=True)

        blocker = check_note(evidence)
        if blocker is not None:
            return build_artifact_result(ArtifactKind.NOTE, cannot_evaluate=blocker)

        return build_artifact_result(
            ArtifactKind.NOTE, self.note_scorer.score(evidence, module))
