"""Scoring core tests.

Most of these exist to pin down the fairness rules from the design. They are
the tests that should fail loudly if someone later "simplifies" abstain
handling into treating a missing score as zero.
"""
import unittest

from grading_agent import (
    ArtifactKind,
    CannotEvaluateReason,
    NotAssessedReason,
    ParameterScore,
    Rubric,
    build_artifact_result,
    combine_overall,
    grade_submission,
    mean_of_assessed,
)
from grading_agent.scoring import teacher_flags


def scored(name, value):
    return ParameterScore.scored(name, value)


def abstained(name, reason=NotAssessedReason.THIN_EVIDENCE):
    return ParameterScore.not_assessed(name, reason)


class TestParameterScore(unittest.TestCase):
    def test_zero_is_rejected(self):
        """A missing score is never a zero — the type refuses to represent it."""
        with self.assertRaises(ValueError):
            ParameterScore.scored("speed", 0)

    def test_out_of_range_rejected(self):
        with self.assertRaises(ValueError):
            ParameterScore.scored("speed", 6)

    def test_bool_rejected(self):
        # bool is an int subclass in Python; True must not become a score of 1.
        with self.assertRaises(TypeError):
            ParameterScore.scored("speed", True)

    def test_not_assessed_carries_no_value(self):
        s = abstained("hand_gesture")
        self.assertIsNone(s.value)
        self.assertFalse(s.is_assessed)


class TestMeanOfAssessed(unittest.TestCase):
    def test_simple_mean(self):
        scores = [scored("a", 4), scored("b", 5), scored("c", 3)]
        self.assertEqual(mean_of_assessed(scores), 4.0)

    def test_abstained_parameters_drop_out(self):
        """An unassessed parameter must not drag the average down."""
        with_abstain = [scored("a", 4), scored("b", 4), abstained("c")]
        without = [scored("a", 4), scored("b", 4)]
        self.assertEqual(mean_of_assessed(with_abstain), mean_of_assessed(without))
        self.assertEqual(mean_of_assessed(with_abstain), 4.0)

    def test_all_abstained_gives_none_not_zero(self):
        self.assertIsNone(mean_of_assessed([abstained("a"), abstained("b")]))


class TestArtifactResult(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def test_cannot_evaluate_produces_no_rating(self):
        """A silent video has not earned a 1/5 — it has earned no score at all."""
        result = build_artifact_result(
            ArtifactKind.VIDEO, cannot_evaluate=CannotEvaluateReason.NO_AUDIO)
        self.assertIsNone(result.rating)
        self.assertFalse(result.was_graded)

    def test_cannot_evaluate_carries_bilingual_student_message(self):
        result = build_artifact_result(
            ArtifactKind.VIDEO, cannot_evaluate=CannotEvaluateReason.NO_AUDIO)
        msg = result.student_message
        self.assertIsNotNone(msg)
        self.assertIn("could not hear", msg.en)
        self.assertTrue(msg.hi.strip())
        self.assertNotEqual(msg.en, msg.hi)

    def test_all_parameters_abstained_is_not_a_low_rating(self):
        result = build_artifact_result(
            ArtifactKind.VIDEO, [abstained("speed"), abstained("tone")])
        self.assertIsNone(result.rating)
        self.assertIsNotNone(result.cannot_evaluate)


class TestOverall(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def _graded(self, kind, value):
        return build_artifact_result(kind, [scored("x", value)])

    def test_fifty_fifty_blend(self):
        video = self._graded(ArtifactKind.VIDEO, 4)
        note = self._graded(ArtifactKind.NOTE, 2)
        overall, incomplete = combine_overall(video, note, self.rubric)
        self.assertEqual(overall, 3.0)
        self.assertFalse(incomplete)

    def test_a_note_never_uploaded_scores_zero(self):
        """Policy set by WES, 07 Sep 2026: work not done scores 0.

        This is the ONLY route by which a 0 enters an overall rating. It is a
        fact about the homework, not a judgement we could not make — contrast
        the next test, where the note WAS uploaded and we failed to read it.
        """
        video = self._graded(ArtifactKind.VIDEO, 4)
        note = build_artifact_result(ArtifactKind.NOTE, missing=True)
        overall, incomplete = combine_overall(video, note, self.rubric)
        self.assertEqual(overall, 2.0)          # 4 and 0, blended 50/50
        self.assertTrue(incomplete)
        self.assertTrue(note.counts_as_zero)
        self.assertFalse(note.was_graded)

    def test_an_unreadable_note_is_never_zero(self):
        """The line that must not move: our failure is not the student's 0."""
        video = self._graded(ArtifactKind.VIDEO, 4)
        note = build_artifact_result(
            ArtifactKind.NOTE, cannot_evaluate=CannotEvaluateReason.UNREADABLE_IMAGE)
        overall, incomplete = combine_overall(video, note, self.rubric)
        self.assertEqual(overall, 4.0)          # not 2.0
        self.assertTrue(incomplete)
        self.assertFalse(note.counts_as_zero)

    def test_unevaluable_video_falls_back_to_note(self):
        video = build_artifact_result(
            ArtifactKind.VIDEO, cannot_evaluate=CannotEvaluateReason.NO_AUDIO)
        note = self._graded(ArtifactKind.NOTE, 3)
        overall, incomplete = combine_overall(video, note, self.rubric)
        self.assertEqual(overall, 3.0)
        self.assertTrue(incomplete)

    def test_neither_gradeable_gives_no_rating(self):
        video = build_artifact_result(
            ArtifactKind.VIDEO, cannot_evaluate=CannotEvaluateReason.NO_AUDIO)
        note = build_artifact_result(ArtifactKind.NOTE, missing=True)
        overall, incomplete = combine_overall(video, note, self.rubric)
        self.assertIsNone(overall)
        self.assertTrue(incomplete)

    def test_ratings_stay_separately_visible(self):
        """Video and note ratings must remain readable, not just the blend."""
        video = self._graded(ArtifactKind.VIDEO, 5)
        note = self._graded(ArtifactKind.NOTE, 2)
        graded = grade_submission("s1", "stu1", "m1", video, note, self.rubric)
        self.assertEqual(graded.video.rating, 5.0)
        self.assertEqual(graded.note.rating, 2.0)
        self.assertEqual(graded.overall_rating, 3.5)


class TestTeacherFlags(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def test_low_rating_is_flagged(self):
        video = build_artifact_result(ArtifactKind.VIDEO, [scored("a", 2)])
        note = build_artifact_result(ArtifactKind.NOTE, [scored("b", 2)])
        flags = teacher_flags(video, note, 2.0, self.rubric)
        self.assertTrue(any("low_overall_rating" in f for f in flags))

    def test_thin_evidence_is_flagged(self):
        video = build_artifact_result(
            ArtifactKind.VIDEO,
            [scored("a", 4), abstained("b"), abstained("c"), abstained("d")])
        note = build_artifact_result(ArtifactKind.NOTE, [scored("x", 4), scored("y", 4)])
        flags = teacher_flags(video, note, 4.0, self.rubric)
        self.assertTrue(any("thin_video_evidence" in f for f in flags))

    def test_sharp_drop_is_flagged(self):
        video = build_artifact_result(ArtifactKind.VIDEO, [scored("a", 2)])
        note = build_artifact_result(ArtifactKind.NOTE, [scored("b", 2)])
        flags = teacher_flags(video, note, 2.0, self.rubric, previous_ratings=[4.5, 4.0, 4.5])
        self.assertTrue(any("sharp_drop" in f for f in flags))

    def test_good_submission_is_not_flagged(self):
        """Flags must stay rare — a clean submission produces none."""
        video = build_artifact_result(
            ArtifactKind.VIDEO, [scored(n, 4) for n in ("a", "b", "c", "d", "e")])
        note = build_artifact_result(
            ArtifactKind.NOTE, [scored(n, 4) for n in ("w", "x", "y", "z")])
        self.assertEqual(teacher_flags(video, note, 4.0, self.rubric), ())


if __name__ == "__main__":
    unittest.main()
