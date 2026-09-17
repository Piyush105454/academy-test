"""Trend labels, bilingual feedback, and the pipeline end to end."""
import unittest

from grading_agent import (
    ArtifactKind,
    CannotEvaluateReason,
    GradingPipeline,
    Module,
    NoteEvidence,
    ParameterScore,
    RuleBasedNoteScorer,
    RuleBasedVideoScorer,
    Rubric,
    Submission,
    Transcript,
    TrendLabel,
    VideoEvidence,
    WordListEntry,
    build_artifact_result,
    build_feedback,
    compute_trend,
    grade_submission,
)


def scored(name, value):
    return ParameterScore.scored(name, value)


class TestTrend(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def test_first_submission_is_baseline(self):
        self.assertIs(compute_trend(3.5, [], self.rubric), TrendLabel.BASELINE)

    def test_improved(self):
        self.assertIs(compute_trend(4.2, [3.0, 3.5, 3.4], self.rubric), TrendLabel.IMPROVED)

    def test_stable(self):
        self.assertIs(compute_trend(3.4, [3.3, 3.5, 3.4], self.rubric), TrendLabel.STABLE)

    def test_decline_needs_attention(self):
        self.assertIs(compute_trend(3.0, [4.2, 4.0, 4.4], self.rubric),
                      TrendLabel.NEEDS_ATTENTION)

    def test_below_floor_needs_attention_even_if_improving(self):
        """Rising but still under the floor is still a student who needs help."""
        self.assertIs(compute_trend(2.4, [1.0, 1.2, 1.1], self.rubric),
                      TrendLabel.NEEDS_ATTENTION)

    def test_only_recent_window_counts(self):
        # Old strong scores outside the 3-submission window must not mask a drop.
        self.assertIs(compute_trend(3.0, [5.0, 5.0, 5.0, 3.9, 3.8, 3.7], self.rubric),
                      TrendLabel.NEEDS_ATTENTION)

    def test_ungraded_submission_has_no_trend(self):
        self.assertIsNone(compute_trend(None, [3.0, 3.0], self.rubric))


class TestFeedback(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def _graded(self, video_scores, note_scores):
        video = build_artifact_result(ArtifactKind.VIDEO, video_scores)
        note = build_artifact_result(ArtifactKind.NOTE, note_scores)
        return grade_submission("s1", "stu1", "m1", video, note, self.rubric)

    def test_feedback_is_bilingual(self):
        graded = self._graded([scored("speed", 4)], [scored("completion", 5)])
        fb = build_feedback(graded, self.rubric)
        self.assertTrue(fb.en.strip())
        self.assertTrue(fb.hi.strip())
        self.assertNotEqual(fb.en, fb.hi)

    def test_strength_comes_before_next_step(self):
        graded = self._graded([scored("speed", 5), scored("confidence", 2)], [])
        fb = build_feedback(graded, self.rubric)
        self.assertLess(fb.en.index("Good work"), fb.en.index("Next time"))

    def test_no_next_step_when_everything_is_perfect(self):
        graded = self._graded([scored("speed", 5)], [scored("completion", 5)])
        fb = build_feedback(graded, self.rubric)
        self.assertNotIn("Next time", fb.en)

    def test_stays_within_four_sentences(self):
        graded = self._graded(
            [scored("speed", 2), scored("confidence", 3)],
            [scored("completion", 4), scored("accuracy", 5)])
        fb = build_feedback(graded, self.rubric, trend=TrendLabel.IMPROVED)
        self.assertLessEqual(fb.en.count("."), 4)

    def test_cannot_evaluate_message_reaches_the_student(self):
        video = build_artifact_result(
            ArtifactKind.VIDEO, cannot_evaluate=CannotEvaluateReason.NO_AUDIO)
        note = build_artifact_result(ArtifactKind.NOTE, [scored("completion", 4)])
        graded = grade_submission("s1", "stu1", "m1", video, note, self.rubric)
        fb = build_feedback(graded, self.rubric)
        self.assertIn("could not hear", fb.en)
        self.assertTrue(fb.hi.strip())

    def test_no_parameter_names_leak_into_feedback(self):
        """Plain words only — no jargon, no rubric vocabulary."""
        graded = self._graded([scored("hand_gesture", 2)], [scored("comprehension", 3)])
        fb = build_feedback(graded, self.rubric)
        for jargon in ("hand_gesture", "comprehension", "parameter", "rubric", "/5"):
            self.assertNotIn(jargon, fb.en)


class TestPipeline(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()
        self.pipeline = GradingPipeline(
            self.rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())
        self.module = Module(
            module_id="day12_task2_english",
            title="Day 12 - Task 2",
            instruction="Use a calm but encouraging voice. Keep steady eye contact.",
            word_list=(
                WordListEntry("Environment", "वातावरण"),
                WordListEntry("Bravery", "साहस"),
            ),
            eye_contact_expected=True,
        )
        self.submission = Submission("sub1", "stu1", self.module.module_id)

    def test_full_run_produces_three_ratings_and_feedback(self):
        video = VideoEvidence(
            transcript=Transcript("environment bravery and more words here", 60.0, 110, 2),
            sampled_frame_count=6, hands_visible_in_frames=4, duration_seconds=60.0)
        note = NoteEvidence(
            rows_expected=2, rows_filled=2,
            written_rows={"Environment": "वातावरण", "Bravery": "साहस"})

        graded = self.pipeline.grade(self.submission, self.module, video, note)

        self.assertIsNotNone(graded.video.rating)
        self.assertIsNotNone(graded.note.rating)
        self.assertIsNotNone(graded.overall_rating)
        self.assertFalse(graded.incomplete)
        self.assertIs(graded.trend, TrendLabel.BASELINE)
        self.assertTrue(graded.feedback.en.strip())
        self.assertTrue(graded.feedback.hi.strip())

    def test_silent_video_is_not_evaluated_rather_than_scored_low(self):
        video = VideoEvidence(transcript=None, duration_seconds=45.0)
        note = NoteEvidence(rows_expected=2, rows_filled=2,
                            written_rows={"Environment": "वातावरण"})
        graded = self.pipeline.grade(self.submission, self.module, video, note)

        self.assertIs(graded.video.cannot_evaluate, CannotEvaluateReason.NO_AUDIO)
        self.assertIsNone(graded.video.rating)
        self.assertTrue(graded.incomplete)
        self.assertIn("could not hear", graded.feedback.en)

    def test_hidden_hands_abstain_and_do_not_lower_the_rating(self):
        """A student is never marked down because the camera was too close."""
        common = dict(transcript=Transcript("environment bravery words", 60.0, 110, 1),
                      duration_seconds=60.0)
        visible = VideoEvidence(sampled_frame_count=6, hands_visible_in_frames=6, **common)
        hidden = VideoEvidence(sampled_frame_count=6, hands_visible_in_frames=0, **common)

        v_scores = RuleBasedVideoScorer().score(visible, self.module)
        h_scores = RuleBasedVideoScorer().score(hidden, self.module)

        hand = next(s for s in h_scores if s.parameter == "hand_gesture")
        self.assertFalse(hand.is_assessed)

        from grading_agent import mean_of_assessed
        self.assertGreaterEqual(mean_of_assessed(h_scores), mean_of_assessed(v_scores) - 0.01)

    def test_missing_note_scores_zero_and_marks_incomplete(self):
        video = VideoEvidence(
            transcript=Transcript("environment bravery words here", 60.0, 110, 1),
            sampled_frame_count=6, hands_visible_in_frames=3, duration_seconds=60.0)
        graded = self.pipeline.grade(self.submission, self.module, video, None)

        self.assertTrue(graded.incomplete)
        # The note was never uploaded, so it scores 0 and halves the overall.
        self.assertEqual(graded.overall_rating,
                         round(graded.video.rating * 0.5, 2))

    def test_speed_is_measured_from_real_timing(self):
        transcript = Transcript("word " * 120, 60.0, 120, 0)
        self.assertEqual(transcript.words_per_minute, 120.0)


if __name__ == "__main__":
    unittest.main()
