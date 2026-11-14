"""Version 2: relevance, personalisation, guardrails, profiles.

The relevance tests matter most. An agent that wrongly tells a child their
homework was the wrong homework does real harm, so the important assertions
here are the ones proving it stays silent when it does not know.
"""
import json
import tempfile
import unittest
from pathlib import Path

from grading_agent import (
    ArtifactKind,
    GradingPipeline,
    Module,
    NoteEvidence,
    ParameterScore,
    Relevance,
    RuleBasedNoteScorer,
    RuleBasedVideoScorer,
    Rubric,
    StudentProfile,
    Submission,
    Transcript,
    VideoEvidence,
    WordListEntry,
    build_artifact_result,
    build_feedback,
    build_profile,
    check_evidence,
    check_note_relevance,
    check_transcript_relevance,
    fairness_report,
    grade_submission,
    scan_for_forbidden_inference,
)
from grading_agent.responsible import Appeal, AppealRegister, AuditLog

MODULE = Module(
    module_id="delegating_tasks",
    title="Delegating Tasks - Time Management",
    instruction="Read the article aloud clearly.",
    reference_content=(
        "Empowering the classroom: the strength of delegating tasks. Delegation lets "
        "a teacher share responsibility, build student confidence, and create an "
        "inclusive classroom where every child is trusted with something that matters. "
        "Accountability and partnership grow when responsibilities are shared fairly."),
    word_list=(
        WordListEntry("Delegation", "कार्य सौंपना"),
        WordListEntry("Responsibilities", "जिम्मेदारियाँ"),
        WordListEntry("Inclusive", "समावेशी"),
        WordListEntry("Accountability", "जवाबदेही"),
        WordListEntry("Partnership", "साझेदारी"),
    ),
)


class TestRelevanceFailsSafe(unittest.TestCase):
    """The agent must not accuse a student without evidence."""

    def test_no_transcript_cannot_tell(self):
        """Our missing speech-to-text is not the student's wrong homework."""
        v = check_transcript_relevance(None, MODULE)
        self.assertIs(v.status, Relevance.CANNOT_TELL)
        self.assertFalse(v.blocks_scoring)

    def test_short_transcript_cannot_tell(self):
        v = check_transcript_relevance("delegation is good", MODULE)
        self.assertIs(v.status, Relevance.CANNOT_TELL)

    def test_module_without_reference_content_cannot_tell(self):
        bare = Module(module_id="m", title="", instruction="Read it")
        v = check_transcript_relevance("a" * 200, bare)
        self.assertIs(v.status, Relevance.CANNOT_TELL)

    def test_partial_match_cannot_tell_rather_than_accuse(self):
        """Weak-but-real overlap is not proof of the wrong passage."""
        text = ("delegation matters " + "generic filler words about school life " * 12)
        v = check_transcript_relevance(text, MODULE)
        self.assertIn(v.status, (Relevance.CANNOT_TELL, Relevance.OFF_TOPIC))
        if v.status is Relevance.OFF_TOPIC:
            self.assertLess(v.overlap, 0.10)


class TestRelevanceDetects(unittest.TestCase):
    def test_on_topic_recognised(self):
        v = check_transcript_relevance(MODULE.reference_content, MODULE)
        self.assertIs(v.status, Relevance.ON_TOPIC)
        self.assertGreater(v.overlap, 0.25)

    def test_clearly_different_passage_is_off_topic(self):
        other = (
            "photosynthesis is the process by which green plants convert sunlight into "
            "chemical energy using chlorophyll within their leaves and stems, producing "
            "glucose and oxygen from carbon dioxide and water absorbed through roots "
            "during daylight hours. Stomata regulate gaseous exchange while xylem and "
            "phloem transport nutrients upward. Respiration releases stored sugars, and "
            "mitochondria generate adenosine triphosphate powering cellular activity, "
            "growth, flowering, pollination, germination and seed dispersal throughout "
            "the botanical lifecycle observed in tropical rainforests, deserts, wetlands "
            "and alpine meadows across differing climates, altitudes and soil chemistry.")
        v = check_transcript_relevance(other, MODULE)
        self.assertIs(v.status, Relevance.OFF_TOPIC)
        self.assertIn("teacher should confirm", v.evidence)

    def test_note_matching_answer_key_is_on_topic(self):
        rows = {w: "x" for w in ("Delegation", "Responsibilities", "Inclusive")}
        v = check_note_relevance(rows, (), MODULE)
        self.assertIs(v.status, Relevance.ON_TOPIC)

    def test_note_from_a_different_module_is_off_topic(self):
        rows = {w: "x" for w in ("Photosynthesis", "Chlorophyll", "Glucose")}
        v = check_note_relevance(rows, (), MODULE)
        self.assertIs(v.status, Relevance.OFF_TOPIC)


class TestOffTopicIsNotZero(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()
        self.pipeline = GradingPipeline(
            self.rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())

    def test_off_topic_note_suspends_rather_than_zeroes(self):
        note = NoteEvidence(
            rows_expected=3, rows_filled=3,
            written_rows={"Photosynthesis": "प्रकाश", "Chlorophyll": "हरित",
                          "Glucose": "शर्करा"})
        graded = self.pipeline.grade(
            Submission("s", "STU", MODULE.module_id), MODULE, None, note)

        self.assertIsNone(graded.note.rating)          # suspended, not scored
        self.assertNotEqual(graded.overall_rating, 0)  # never zero
        self.assertTrue(any("off_topic" in f for f in graded.flags))
        self.assertTrue(any("teacher to confirm" in f for f in graded.flags))

    def test_relevance_verdict_recorded_for_review(self):
        note = NoteEvidence(
            rows_expected=3, rows_filled=3,
            written_rows={"Delegation": "कार्य सौंपना", "Inclusive": "समावेशी",
                          "Accountability": "जवाबदेही"})
        graded = self.pipeline.grade(
            Submission("s", "STU", MODULE.module_id), MODULE, None, note)
        self.assertEqual(graded.extras["note_relevance"], "on_topic")
        self.assertTrue(graded.extras["note_relevance_evidence"])

    def test_untranscribed_video_is_never_called_off_topic(self):
        """The regression this guards: our gap blamed on the student."""
        video = VideoEvidence(duration_seconds=200.0, audio_stream_present=True,
                              sampled_frame_count=3, hands_visible_in_frames=2)
        graded = self.pipeline.grade(
            Submission("s", "STU", MODULE.module_id), MODULE, video, None)
        self.assertEqual(graded.extras["video_relevance"], "cannot_tell")
        self.assertFalse(any("off_topic" in f for f in graded.flags))


class TestForbiddenInference(unittest.TestCase):
    def test_catches_ability_judgement(self):
        found = scan_for_forbidden_inference("This student is a slow learner.")
        self.assertTrue(found)
        self.assertEqual(found[0].category, "intelligence or ability")

    def test_catches_effort_judgement(self):
        self.assertTrue(scan_for_forbidden_inference("The child was lazy and careless."))

    def test_catches_home_circumstance_guess(self):
        self.assertTrue(scan_for_forbidden_inference("Likely from a poor family."))

    def test_catches_accusation_of_cheating(self):
        self.assertTrue(scan_for_forbidden_inference("This looks like cheating."))

    def test_ordinary_feedback_passes_clean(self):
        clean = ("Good work — you finished the whole task. Next time, pause for one "
                 "second after each full stop.")
        self.assertEqual(scan_for_forbidden_inference(clean), [])

    def test_pipeline_flags_a_violation(self):
        rubric = Rubric.load()
        bad = ParameterScore.scored("completion", 3, "Student seems unmotivated and lazy.")
        note = build_artifact_result(ArtifactKind.NOTE, [bad])
        graded = grade_submission("s", "STU", "m",
                                  build_artifact_result(ArtifactKind.VIDEO, missing=True),
                                  note, rubric)
        from grading_agent.responsible import scan_graded_submission
        self.assertTrue(scan_graded_submission(graded))


class TestEvidenceRequired(unittest.TestCase):
    def test_score_without_evidence_is_a_gap(self):
        gaps = check_evidence([ParameterScore.scored("speed", 4)])
        self.assertEqual(len(gaps), 1)

    def test_score_with_evidence_passes(self):
        gaps = check_evidence([ParameterScore.scored("speed", 4, "Measured 110 wpm.")])
        self.assertEqual(gaps, [])

    def test_abstention_needs_a_reason(self):
        from grading_agent.models import NotAssessedReason
        ok = ParameterScore.not_assessed("tone", NotAssessedReason.THIN_EVIDENCE)
        self.assertEqual(check_evidence([ok]), [])


class TestFairness(unittest.TestCase):
    def _graded(self, student_id, overall):
        rubric = Rubric.load()
        note = build_artifact_result(
            ArtifactKind.NOTE, [ParameterScore.scored("completion", int(overall), "x")])
        g = grade_submission(student_id, student_id, "m",
                             build_artifact_result(ArtifactKind.VIDEO, missing=True),
                             note, rubric)
        return g

    def test_disparity_between_groups_is_surfaced(self):
        graded = [self._graded("A1", 5), self._graded("A2", 5),
                  self._graded("B1", 2), self._graded("B2", 2)]
        groups = {"A1": "morning", "A2": "morning", "B1": "evening", "B2": "evening"}
        report = fairness_report(graded, groups)
        self.assertIsNotNone(report.concern)
        self.assertGreaterEqual(report.largest_gap, 0.5)
        self.assertEqual(report.gap_between[0], "evening")

    def test_similar_groups_raise_no_concern(self):
        graded = [self._graded("A1", 4), self._graded("B1", 4)]
        report = fairness_report(graded, {"A1": "x", "B1": "y"})
        self.assertIsNone(report.concern)

    def test_group_membership_is_never_inferred(self):
        """Students absent from the mapping are excluded, not bucketed."""
        graded = [self._graded("A1", 5), self._graded("UNKNOWN", 2)]
        report = fairness_report(graded, {"A1": "x"})
        self.assertEqual(report.group_counts, {"x": 1})


class TestAuditAndAppeal(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_grading_is_logged(self):
        audit = AuditLog(self.dir / "audit.jsonl")
        rubric = Rubric.load()
        pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(),
                                   RuleBasedNoteScorer(), audit=audit)
        note = NoteEvidence(rows_expected=2, rows_filled=2,
                            written_rows={"Delegation": "कार्य सौंपना"})
        pipeline.grade(Submission("s1", "STU", MODULE.module_id), MODULE, None, note)

        entries = audit.entries()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["event"], "graded")
        self.assertEqual(entries[0]["student_id"], "STU")

    def test_audit_records_no_names_or_paths(self):
        audit = AuditLog(self.dir / "audit.jsonl")
        audit.record("graded", "STU-1", {"overall": 4.0})
        raw = (self.dir / "audit.jsonl").read_text(encoding="utf-8")
        self.assertNotIn(".mp4", raw)
        self.assertNotIn(".jpg", raw)

    def test_appeal_marks_a_submission_disputed(self):
        reg = AppealRegister(self.dir / "appeals.json")
        self.assertFalse(reg.is_disputed("sub-1"))
        reg.raise_appeal(Appeal("sub-1", "STU", "guardian", "The note was marked wrong."))
        self.assertTrue(reg.is_disputed("sub-1"))
        self.assertEqual(len(reg.open_appeals()), 1)


class TestProfileAndPersonalisation(unittest.TestCase):
    def _record(self, param, value, overall, advised=None):
        return {
            "video": {"scores": []},
            "note": {"scores": [{"parameter": param, "value": value}]},
            "overall_rating": overall,
            "extras": {"advised_on": advised} if advised else {},
        }

    def test_profile_is_empty_without_history(self):
        p = build_profile("STU", [])
        self.assertFalse(p.has_history)
        self.assertIsNone(p.practising())

    def test_one_observation_is_not_a_pattern(self):
        """A single low score is a bad day, not a characteristic."""
        p = build_profile("STU", [self._record("accuracy", 2, 2.0)])
        self.assertIsNone(p.practising())

    def test_repeated_observation_becomes_a_pattern(self):
        p = build_profile("STU", [self._record("accuracy", 2, 2.0),
                                  self._record("accuracy", 2, 2.0)])
        self.assertEqual(p.practising(), "accuracy")

    def test_window_ages_out_old_work(self):
        old = [self._record("accuracy", 1, 1.0) for _ in range(6)]
        new = [self._record("accuracy", 5, 5.0) for _ in range(2)]
        p = build_profile("STU", old + new, window=2)
        self.assertEqual(p.parameter_means["accuracy"], 5.0)
        self.assertEqual(p.submissions_seen, 2)

    def test_improvement_against_own_average_detected(self):
        p = build_profile("STU", [self._record("speed", 3, 3.0),
                                  self._record("speed", 3, 3.0)])
        self.assertTrue(p.improving_on("speed", 4))
        self.assertFalse(p.improving_on("speed", 3))

    def test_feedback_names_improvement_when_earned(self):
        rubric = Rubric.load()
        p = build_profile("STU", [self._record("completion", 3, 3.0),
                                  self._record("completion", 3, 3.0)])
        note = build_artifact_result(
            ArtifactKind.NOTE, [ParameterScore.scored("completion", 5, "All done.")])
        graded = grade_submission("s", "STU", "m",
                                  build_artifact_result(ArtifactKind.VIDEO, missing=True),
                                  note, rubric)
        fb = build_feedback(graded, rubric, profile=p)
        self.assertIn("Better than last time", fb.en)

    def test_repeated_advice_is_rotated(self):
        """Hearing the same sentence every week is how feedback stops being read."""
        rubric = Rubric.load()
        p = StudentProfile(student_id="STU", submissions_seen=3,
                           parameter_means={"speed": 3.0}, parameter_counts={"speed": 3},
                           recent_advice=("speed", "speed"))
        note = build_artifact_result(ArtifactKind.NOTE, [
            ParameterScore.scored("speed", 2, "slow"),
            ParameterScore.scored("presentation", 3, "ok"),
        ])
        graded = grade_submission("s", "STU", "m",
                                  build_artifact_result(ArtifactKind.VIDEO, missing=True),
                                  note, rubric)
        fb = build_feedback(graded, rubric, profile=p)
        # Speed was weakest but already advised twice — expect the other one.
        self.assertIn("one line per word", fb.en)

    def test_profile_never_compares_students(self):
        """No field on a profile references another student."""
        p = build_profile("STU", [self._record("accuracy", 4, 4.0)])
        for value in vars(p).values():
            self.assertNotIn("cohort", str(value).lower())
            self.assertNotIn("rank", str(value).lower())

    def test_a_student_can_be_forgotten(self):
        from grading_agent import JsonSubmissionStore
        from grading_agent.profile import forget
        store = JsonSubmissionStore(self.__class__.__name__ and
                                    Path(tempfile.mkdtemp()) / "s.json")
        rubric = Rubric.load()
        note = build_artifact_result(
            ArtifactKind.NOTE, [ParameterScore.scored("completion", 4, "x")])
        store.save(grade_submission("s", "STU", "m",
                                    build_artifact_result(ArtifactKind.VIDEO, missing=True),
                                    note, rubric))
        self.assertIn("STU", store.all_records())
        self.assertTrue(forget(store, "STU"))
        self.assertNotIn("STU", store.all_records())


if __name__ == "__main__":
    unittest.main()
