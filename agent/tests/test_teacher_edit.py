"""Teacher edits, and learning to sound human from them."""
import unittest

from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.feedback_learning import EditCorpus, EditPair
from grading_agent.models import (
    ArtifactKind, GradedSubmission, ParameterScore, StudentMessage)
from grading_agent.scoring import build_artifact_result, grade_submission
from grading_agent.teacher_edit import (
    EditRejected, authored_by, edit_feedback, revert_feedback)

MODULE = Module(
    module_id="day12_task2_english", title="DAY 12 - TASK 2",
    instruction="Read aloud.", reference_content="Fear of speaking English.",
    word_list=(WordListEntry("Fear", "डर"),))
RUBRIC = Rubric.load()

AGENT_EN = ("Good work — you read the whole article clearly. Next time, pause "
            "after each full stop.")
AGENT_HI = "अच्छा काम — आपने पूरा लेख स्पष्ट पढ़ा।"


def graded() -> GradedSubmission:
    g = grade_submission(
        "s-1", "STU-1", MODULE.module_id,
        build_artifact_result(ArtifactKind.VIDEO,
                              [ParameterScore.scored("speed", 4, "Steady.")]),
        build_artifact_result(ArtifactKind.NOTE,
                              [ParameterScore.scored("completion", 5, "All rows.")]),
        RUBRIC)
    g.feedback = StudentMessage(en=AGENT_EN, hi=AGENT_HI)
    return g


class TestTeacherCanEdit(unittest.TestCase):
    def test_the_edit_is_what_the_student_reads(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma",
                          en="Well done Vivek. Slow down at the full stops.")
        self.assertIn("Well done Vivek", g.feedback.en)

    def test_the_agents_version_is_never_destroyed(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma", en="Well done Vivek.")
        self.assertEqual(g.extras["feedback_edit"]["original_en"], AGENT_EN)

    def test_attribution_follows_the_text(self):
        g = graded()
        self.assertEqual(authored_by(g), "agent")
        self.assertEqual(authored_by(
            edit_feedback(g, edited_by="Mrs Sharma", en="Well done.")), "teacher")

    def test_the_edit_is_flagged_with_who_made_it(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma", en="Well done.")
        self.assertTrue(any("Mrs Sharma" in f for f in g.flags))

    def test_editing_one_language_warns_about_the_other(self):
        """The Hindi must not quietly contradict the corrected English."""
        g = edit_feedback(graded(), edited_by="Mrs Sharma",
                          en="Actually this needs redoing.")
        self.assertTrue(any("one_language_only" in f for f in g.flags))
        self.assertTrue(any("Hindi" in f for f in g.flags))

    def test_editing_both_languages_raises_no_warning(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma",
                          en="Well done Vivek.", hi="शाबाश विवेक।")
        self.assertFalse(any("one_language_only" in f for f in g.flags))

    def test_an_edit_cannot_leave_the_student_with_nothing(self):
        with self.assertRaises(EditRejected):
            edit_feedback(graded(), edited_by="Mrs Sharma", en="  ", hi="  ")

    def test_an_edit_needs_an_author(self):
        with self.assertRaises(EditRejected):
            edit_feedback(graded(), edited_by="", en="Well done.")

    def test_an_unchanged_edit_is_rejected(self):
        with self.assertRaises(EditRejected):
            edit_feedback(graded(), edited_by="Mrs Sharma", en=AGENT_EN)

    def test_the_teachers_words_are_never_filtered(self):
        """Our guardrails police the agent, not a professional's judgement."""
        g = edit_feedback(graded(), edited_by="Mrs Sharma",
                          en="Vivek is not trying and needs to focus.")
        self.assertIn("not trying", g.feedback.en)

    def test_revert_restores_the_agents_wording(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma", en="Well done.")
        g = revert_feedback(g, reverted_by="Head of English")
        self.assertEqual(g.feedback.en, AGENT_EN)
        self.assertEqual(authored_by(g), "agent")
        self.assertEqual(len(g.extras["feedback_edit_history"]), 1)


class TestLearningToSoundHuman(unittest.TestCase):
    """Edits become wording guidance — never scores, never automatically."""

    def corpus(self, n=3) -> EditCorpus:
        c = EditCorpus()
        for i in range(n):
            c.add(EditPair(
                original=("Good work — you read the whole article clearly. "
                          "Next time, pause after each full stop."),
                edited=(f"Well done. Try a small pause at each full stop."),
                edited_by="Mrs Sharma"))
        return c

    def test_a_repeated_deletion_becomes_guidance(self):
        findings = self.corpus().findings()
        drops = [f for f in findings if f.kind == "drop"]
        self.assertTrue(drops)
        self.assertIn("Good work", drops[0].detail)
        self.assertIn("Do not write", drops[0].as_instruction())

    def test_one_edit_is_never_a_pattern(self):
        self.assertEqual(self.corpus(n=1).findings(), [])

    def test_teachers_cutting_length_is_noticed(self):
        kinds = {f.kind for f in self.corpus(n=4).findings()}
        self.assertIn("shorter", kinds)

    def test_guidance_says_it_must_not_change_scores(self):
        text = self.corpus().proposed_guidance()
        self.assertIn("must not change any score", text)

    def test_worked_examples_show_both_versions(self):
        text = self.corpus().proposed_guidance()
        self.assertIn("agent:", text)
        self.assertIn("teacher:", text)

    def test_nothing_is_learned_from_an_empty_corpus(self):
        self.assertEqual(EditCorpus().proposed_guidance(), "")

    def test_a_teacher_may_write_what_the_agent_may_not_copy(self):
        """The asymmetry: published unfiltered, never learned from."""
        c = EditCorpus()
        accepted = c.add(EditPair(
            original="Good work — you read clearly.",
            edited="Vivek is lazy and does not care about this work.",
            edited_by="Mrs Sharma"))
        self.assertFalse(accepted)
        self.assertEqual(c.pairs, [])
        self.assertEqual(c.skipped_unsafe, 1)

    def test_edits_are_collected_straight_off_a_graded_submission(self):
        g = edit_feedback(graded(), edited_by="Mrs Sharma",
                          en="Well done. A small pause at each full stop.")
        c = EditCorpus()
        self.assertTrue(c.add_from_graded(g, "en"))
        self.assertFalse(c.add_from_graded(g, "hi"))   # Hindi was not edited

    def test_learning_carries_no_scores_or_thresholds(self):
        text = self.corpus().proposed_guidance().lower()
        for forbidden in ("rubric", "threshold", "/5", "rating", "deduct"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()


# ================================================= score overrides =========

from grading_agent.calibration import (           # noqa: E402
    CalibrationPoint, CalibrationSet, MIN_SAMPLE)
from grading_agent.models import CannotEvaluateReason, NotAssessedReason  # noqa: E402
from grading_agent.teacher_edit import override_score  # noqa: E402


def graded_with(video_scores, note_scores=None):
    return grade_submission(
        "s-1", "STU-1", MODULE.module_id,
        build_artifact_result(ArtifactKind.VIDEO, video_scores),
        build_artifact_result(ArtifactKind.NOTE, note_scores if note_scores is not None
                              else [ParameterScore.scored("completion", 5, "All.")]),
        RUBRIC)


class TestScoreOverride(unittest.TestCase):
    def base(self):
        return graded_with([ParameterScore.scored("speed", 3, "A little fast."),
                            ParameterScore.scored("tone", 4, "Warm.")])

    def test_the_teachers_score_is_what_counts(self):
        g = override_score(self.base(), artifact="video", parameter="speed",
                           new_value=5, edited_by="Mrs Sharma")
        speed = next(s for s in g.video.scores if s.parameter == "speed")
        self.assertEqual(speed.value, 5)
        self.assertEqual(g.video.rating, 4.5)     # recomputed from 5 and 4

    def test_the_overall_rating_is_recomputed(self):
        g = self.base()
        before = g.overall_rating
        g = override_score(g, artifact="video", parameter="speed",
                           new_value=5, edited_by="Mrs Sharma")
        self.assertNotEqual(g.overall_rating, before)

    def test_the_agents_score_is_kept(self):
        g = override_score(self.base(), artifact="video", parameter="speed",
                           new_value=5, edited_by="Mrs Sharma",
                           reason="Pace was fine for this class.")
        rec = g.extras["score_overrides"][0]
        self.assertEqual(rec["agent_score"], 3)
        self.assertEqual(rec["teacher_score"], 5)
        self.assertIn("fine for this class", rec["reason"])

    def test_the_override_is_visible_in_the_flags(self):
        g = override_score(self.base(), artifact="video", parameter="speed",
                           new_value=5, edited_by="Mrs Sharma")
        self.assertTrue(any("score_overridden_by_teacher" in f for f in g.flags))
        self.assertTrue(any("3 → 5" in f for f in g.flags))

    def test_a_teacher_can_score_what_the_agent_abstained_on(self):
        g = graded_with([
            ParameterScore.scored("tone", 4, "Warm."),
            ParameterScore.not_assessed("hand_gesture",
                                        NotAssessedReason.THIN_EVIDENCE,
                                        "Hands out of frame.")])
        g = override_score(g, artifact="video", parameter="hand_gesture",
                           new_value=4, edited_by="Mrs Sharma")
        hg = next(s for s in g.video.scores if s.parameter == "hand_gesture")
        self.assertTrue(hg.is_assessed)

    def test_a_teacher_can_abstain_where_the_agent_scored(self):
        """The important direction: the agent judged on too little."""
        g = override_score(self.base(), artifact="video", parameter="speed",
                           new_value=None, edited_by="Mrs Sharma",
                           reason="Audio too poor to judge pace.")
        speed = next(s for s in g.video.scores if s.parameter == "speed")
        self.assertFalse(speed.is_assessed)
        self.assertEqual(g.video.rating, 4.0)     # tone alone; never a zero

    def test_zero_is_still_impossible(self):
        for bad in (0, -1, 6, 3.5, True, "4"):
            with self.subTest(bad=bad), self.assertRaises(EditRejected):
                override_score(self.base(), artifact="video", parameter="speed",
                               new_value=bad, edited_by="Mrs Sharma")

    def test_an_unknown_parameter_is_rejected(self):
        with self.assertRaises(EditRejected):
            override_score(self.base(), artifact="video", parameter="charisma",
                           new_value=4, edited_by="Mrs Sharma")

    def test_scoring_work_that_was_never_uploaded_is_rejected(self):
        g = grade_submission(
            "s-1", "STU-1", MODULE.module_id,
            build_artifact_result(ArtifactKind.VIDEO,
                                  [ParameterScore.scored("speed", 4, "Steady.")]),
            build_artifact_result(ArtifactKind.NOTE, missing=True), RUBRIC)
        with self.assertRaises(EditRejected):
            override_score(g, artifact="note", parameter="completion",
                           new_value=4, edited_by="Mrs Sharma")

    def test_an_override_needs_an_author(self):
        with self.assertRaises(EditRejected):
            override_score(self.base(), artifact="video", parameter="speed",
                           new_value=5, edited_by="  ")

    def test_setting_the_same_score_is_rejected(self):
        with self.assertRaises(EditRejected):
            override_score(self.base(), artifact="video", parameter="speed",
                           new_value=3, edited_by="Mrs Sharma")


class TestOverridesFeedCalibration(unittest.TestCase):
    def points(self, deltas, parameter="speed"):
        c = CalibrationSet()
        for i, (a, t) in enumerate(deltas):
            c.add(CalibrationPoint(f"s-{i}", MODULE.module_id, "video",
                                   parameter, a, t, "Mrs Sharma"))
        return c

    def test_an_override_becomes_a_calibration_point(self):
        g = override_score(
            graded_with([ParameterScore.scored("speed", 3, "Fast.")]),
            artifact="video", parameter="speed", new_value=4,
            edited_by="Mrs Sharma")
        c = CalibrationSet()
        self.assertEqual(c.add_from_graded(g), 1)
        self.assertEqual(c.points[0].delta, 1)

    def test_the_agent_marking_harder_than_teachers_is_named(self):
        """Agent says 3, teacher says 4, six times over: the agent is strict."""
        r = self.points([(3, 4)] * 6).by_parameter("speed")
        self.assertEqual(r.bias, 1.0)
        self.assertIn("harder than", r.verdict())

    def test_the_agent_marking_generously_reads_the_other_way(self):
        r = self.points([(4, 3)] * 6).by_parameter("speed")
        self.assertEqual(r.bias, -1.0)
        self.assertIn("more generously", r.verdict())

    def test_a_small_sample_refuses_to_conclude(self):
        r = self.points([(3, 5)] * 3).by_parameter("speed")
        self.assertFalse(r.enough_data)
        self.assertIn("not enough", r.verdict())
        self.assertIn(str(MIN_SAMPLE), r.verdict())

    def test_inconsistency_is_distinguished_from_bias(self):
        """Deltas cancelling to zero is not the same as being right."""
        c = self.points([(2, 4), (4, 2), (2, 4), (4, 2), (2, 4), (4, 2)])
        r = c.by_parameter("speed")
        self.assertEqual(r.bias, 0.0)
        self.assertEqual(r.spread, 2.0)
        self.assertIn("inconsistent rather than", r.verdict())

    def test_overreach_outranks_everything_else(self):
        c = self.points([(3, 4)] * 6)
        c.add(CalibrationPoint("s-x", MODULE.module_id, "video", "speed",
                               agent_score=4, teacher_score=None,
                               teacher="Mrs Sharma",
                               reason="Could not hear well enough to judge."))
        r = c.by_parameter("speed")
        self.assertEqual(r.overreach, 1)
        self.assertIn("look at these first", r.verdict())

    def test_over_caution_is_counted_but_not_alarming(self):
        c = self.points([(3, 4)] * 6)
        c.add(CalibrationPoint("s-y", MODULE.module_id, "video", "speed",
                               agent_score=None, teacher_score=4))
        r = c.by_parameter("speed")
        self.assertEqual(r.over_caution, 1)
        self.assertEqual(r.overreach, 0)

    def test_the_report_says_nothing_is_applied_automatically(self):
        self.assertIn("Nothing here is applied automatically",
                      self.points([(3, 4)] * 6).report())

    def test_an_empty_set_says_so_plainly(self):
        self.assertIn("Calibration starts the first time",
                      CalibrationSet().report())
