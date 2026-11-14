"""Verification pass: hyper-personalization, and one test per real scenario.

Not unit tests of a function — these each set up a situation a teacher would
recognise and assert what the student and the teacher end up with. They exist so
that a change which quietly breaks "a wrong slot is not a wrong grade" fails
here, in language a product person can read, rather than in a helper's assertion.

Nothing here needs an API key: every scenario feeds the referee a fixed agent
output and checks what the guarantees do with it.
"""
import unittest

from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import (
    CoverageReport,
    ParameterJudgement,
    SubmissionEvaluation,
    referee,
)
from grading_agent.models import (
    ArtifactKind,
    CannotEvaluateReason,
    ParameterScore,
)
from grading_agent.module_check import (
    ModuleAnchors,
    ModuleVerdict,
    verify_declared_module,
)
from grading_agent.profile import build_profile
from grading_agent.responsible import fairness_report, scan_graded_submission
from grading_agent.scoring import build_artifact_result, grade_submission

MODULE = Module(
    module_id="day12_task2_english",
    title="DAY 12 - TASK 2 - Teacher English Speaking Training",
    instruction="Use a calm but encouraging voice. Pause after important points.",
    reference_content="Fear of speaking English is common among students.",
    word_list=(WordListEntry("Fear", "डर"), WordListEntry("Bravery", "साहस")),
    eye_contact_expected=True,
)
DAY12 = ModuleAnchors.from_module(MODULE)
DAY13 = ModuleAnchors("day13_task1_english", "DAY 13 - TASK 1 - Classroom Questions",
                      ("day 13", "task 1", "classroom questions"))
CATALOGUE = (DAY12, DAY13)
SUB = Submission("sub-1", "STU-1", MODULE.module_id)
RUBRIC = Rubric.load()


def agent_said(**kw) -> SubmissionEvaluation:
    base = dict(
        coverage=CoverageReport(could_check=True, verdict="complete",
                                covered_fraction=0.94,
                                evidence="Nearly all of the article was spoken."),
        relevance="on_topic",
        relevance_evidence="Module vocabulary throughout.",
        video=[ParameterJudgement(parameter="speed", score=4, evidence="Steady."),
               ParameterJudgement(parameter="tone", score=4, evidence="Warm."),
               ParameterJudgement(parameter="vocabulary", score=4,
                                  evidence="Both target words spoken clearly.")],
        note=[ParameterJudgement(parameter="completion", score=5,
                                 evidence="All rows filled.")],
        feedback_en="Good work — you read the whole article clearly.",
        feedback_hi="अच्छा काम — आपने पूरा लेख स्पष्ट पढ़ा।",
        for_the_teacher="")
    base.update(kw)
    return SubmissionEvaluation(**base)


# ======================================================= personalization ===

def records(*rows) -> list[dict]:
    """Past gradings in the shape the store writes them."""
    return [
        {"overall_rating": overall,
         "video": {"scores": [{"parameter": p, "value": v} for p, v in params]},
         "note": {"scores": []},
         "extras": {"advised_on": advised} if advised else {}}
        for overall, params, advised in rows
    ]


class TestPersonalizationIsAboutThisChild(unittest.TestCase):
    def test_advice_rotates_so_the_same_sentence_is_not_repeated(self):
        p = build_profile("STU-1", records(
            (3.0, [("speed", 3)], "speed"),
            (3.0, [("speed", 3)], "speed")))
        self.assertTrue(p.advised_recently("speed"))
        self.assertFalse(p.advised_recently("tone"))

    def test_improvement_is_measured_against_their_own_past(self):
        p = build_profile("STU-1", records(
            (2.0, [("confidence", 2)], None),
            (2.0, [("confidence", 2)], None)))
        self.assertTrue(p.improving_on("confidence", 3))
        self.assertFalse(p.improving_on("confidence", 2))

    def test_one_bad_day_is_not_a_characteristic(self):
        """A single observation never becomes a label."""
        p = build_profile("STU-1", records((2.0, [("tone", 1)], None)))
        self.assertIsNone(p.practising())

    def test_the_vocabulary_is_practising_never_weakest(self):
        p = build_profile("STU-1", records(
            (3.0, [("speed", 5), ("tone", 2)], None),
            (3.0, [("speed", 5), ("tone", 2)], None)))
        self.assertEqual(p.practising(), "tone")
        self.assertFalse(hasattr(p, "weakest"))

    def test_the_profile_is_bounded_to_recent_work(self):
        """Ten submissions in, only the last five shape what we say."""
        p = build_profile("STU-1", records(*[(1.0, [("speed", 1)], None)] * 5,
                                           *[(5.0, [("speed", 5)], None)] * 5))
        self.assertEqual(p.submissions_seen, 5)
        self.assertEqual(p.parameter_means["speed"], 5.0)

    def test_a_new_student_gets_no_invented_history(self):
        p = build_profile("STU-NEW", [])
        self.assertFalse(p.has_history)
        self.assertIsNone(p.practising())
        self.assertFalse(p.improving_on("speed", 5))

    def test_nothing_compares_one_student_to_another(self):
        p = build_profile("STU-1", records((3.0, [("speed", 3)], None)))
        for field in vars(p):
            self.assertNotIn("class", field)
            self.assertNotIn("rank", field)
            self.assertNotIn("percentile", field)

    def test_groups_are_supplied_never_inferred(self):
        """Fairness reporting compares groups the school gives us."""
        def graded(student_id, value):
            return grade_submission(
                f"sub-{student_id}", student_id, MODULE.module_id,
                build_artifact_result(ArtifactKind.VIDEO,
                                      [ParameterScore.scored("speed", value, "x")]),
                build_artifact_result(ArtifactKind.NOTE,
                                      [ParameterScore.scored("completion", value, "x")]),
                RUBRIC)

        report = fairness_report(
            [graded("STU-1", 5), graded("STU-2", 5),
             graded("STU-3", 2), graded("STU-4", 2)],
            groups={"STU-1": "class-a", "STU-2": "class-a",
                    "STU-3": "class-b", "STU-4": "class-b"})
        self.assertIsNotNone(report.concern)
        self.assertGreaterEqual(report.largest_gap, 0.5)
        self.assertEqual(set(report.group_means), {'class-a', 'class-b'})

        # A student the school did not place in a group is excluded, never
        # bucketed into an "other" that would invite guessing.
        narrow = fairness_report([graded("STU-1", 5), graded("STU-9", 2)],
                                 groups={"STU-1": "class-a"})
        self.assertEqual(list(narrow.group_means), ['class-a'])


# ============================================================= scenarios ===

class TestScenarios(unittest.TestCase):
    """One per situation a teacher would recognise."""

    def grade(self, evaluation, **kw):
        return referee(evaluation, SUB, MODULE, RUBRIC, **kw)

    # -- the ordinary case ------------------------------------------------

    def test_good_submission_is_graded_and_says_why(self):
        g = self.grade(agent_said())
        self.assertEqual(g.video.rating, 4.0)
        self.assertEqual(g.note.rating, 5.0)
        self.assertEqual(g.overall_rating, 4.5)
        self.assertTrue(all(s.note for s in g.video.assessed_scores))

    # -- scenario: right work, wrong slot ---------------------------------

    def test_day12_homework_uploaded_under_day13(self):
        v = verify_declared_module(
            DAY13, CATALOGUE,
            spoken_opening="Day 12 Task 2, Teacher English Speaking Training.")
        self.assertIs(v.verdict, ModuleVerdict.MISMATCH)
        g = self.grade(agent_said(), module_check=v)
        self.assertIn("DAY 12", g.feedback.en)
        self.assertIn("has not been marked down", g.feedback.en)
        self.assertFalse(any("off_topic" in f for f in g.flags))
        self.assertNotEqual(g.overall_rating, 0)

    def test_the_note_header_catches_the_wrong_slot_when_the_video_is_silent(self):
        v = verify_declared_module(
            DAY13, CATALOGUE,
            written_header="DAY 12 TASK 2 Teacher English Speaking Training")
        self.assertIs(v.verdict, ModuleVerdict.MISMATCH)

    # -- scenario: read half the article ----------------------------------

    def test_half_the_article_read_beautifully(self):
        g = self.grade(agent_said(
            video=[ParameterJudgement(parameter="speed", score=5,
                                      evidence="Excellent pace."),
                   ParameterJudgement(parameter="tone", score=5,
                                      evidence="Calm and encouraging.")],
            coverage=CoverageReport(could_check=True, verdict="partial",
                                    covered_fraction=0.5,
                                    missing_from_submission=["the last three paragraphs"],
                                    evidence="Stopped halfway.")))
        self.assertEqual(g.video.rating, 5.0)      # merit, not coverage
        self.assertIn("50%", g.feedback.en)
        self.assertIn("50%", g.feedback.hi)

    # -- scenario: forgot the note ----------------------------------------

    def test_forgot_the_note(self):
        video = build_artifact_result(ArtifactKind.VIDEO, [
            ParameterScore.scored("speed", 4, "Steady.")])
        g = grade_submission("sub-1", "STU-1", MODULE.module_id, video,
                             build_artifact_result(ArtifactKind.NOTE, missing=True),
                             RUBRIC)
        self.assertEqual(g.note.rating, 0.0)
        self.assertEqual(g.overall_rating, 2.0)
        self.assertTrue(g.incomplete)
        # The 0 is only fair if the student is plainly told what to do.
        message = g.note.student_message
        self.assertIsNotNone(message)
        self.assertIn("handwritten note", message.en)
        self.assertTrue(message.hi.strip())

    # -- scenario: sent the note, we could not read it ---------------------

    def test_blurred_note_is_never_a_zero(self):
        """The distinction the whole design turns on."""
        video = build_artifact_result(ArtifactKind.VIDEO, [
            ParameterScore.scored("speed", 4, "Steady.")])
        note = build_artifact_result(
            ArtifactKind.NOTE,
            cannot_evaluate=CannotEvaluateReason.UNREADABLE_IMAGE)
        g = grade_submission("sub-1", "STU-1", MODULE.module_id, video, note, RUBRIC)
        self.assertEqual(g.overall_rating, 4.0)    # not 2.0
        self.assertIsNotNone(note.student_message)

    # -- scenario: no speech-to-text connected -----------------------------

    def test_our_missing_transcriber_is_never_the_students_fault(self):
        g = self.grade(agent_said(
            coverage=CoverageReport(could_check=False, verdict="cannot_check",
                                    evidence="No transcript was available."),
            relevance="cannot_tell",
            relevance_evidence="Nothing to judge from."))
        self.assertEqual(g.video.rating, 4.0)      # untouched
        self.assertTrue(any("no coverage marks were deducted" in f for f in g.flags))

    # -- scenario: genuinely different passage -----------------------------

    def test_a_different_passage_suspends_rather_than_zeroes(self):
        g = self.grade(agent_said(
            relevance="off_topic",
            relevance_evidence="Read a passage about photosynthesis.",
            coverage=CoverageReport(could_check=True,
                                    verdict="substantially_different",
                                    covered_fraction=0.01,
                                    evidence="None of the module's content.")))
        self.assertIsNone(g.video.rating)
        self.assertNotEqual(g.overall_rating, 0)
        self.assertTrue(any("teacher to confirm" in f for f in g.flags))

    # -- responsible AI, end to end ----------------------------------------

    def test_a_judgement_about_the_child_never_reaches_them(self):
        """Each of these got through an earlier version of the scanner."""
        for bad in ("You are a slow learner.",
                    "This student seems lazy and unmotivated.",
                    "Probably from a home without books.",
                    "Seems uninterested in the work.",
                    "Given their background, this is good."):
            with self.subTest(bad=bad), self.assertRaises(Exception):
                self.grade(agent_said(feedback_en=bad))

    def test_ordinary_feedback_is_not_falsely_flagged(self):
        """The scanner errs toward catching too much; it must not catch this."""
        for fine in ("Good work — you read the whole article clearly.",
                     "Next time, pause after each full stop.",
                     "You covered about 50% of the article — carry on to the end.",
                     "Better than last time on your pace."):
            with self.subTest(fine=fine):
                self.grade(agent_said(feedback_en=fine))

    def test_a_clean_grading_scans_clean(self):
        g = self.grade(agent_said())
        self.assertEqual(scan_graded_submission(g), [])

    def test_every_score_that_reaches_a_student_carries_its_reason(self):
        g = self.grade(agent_said())
        for score in list(g.video.assessed_scores) + list(g.note.assessed_scores):
            self.assertTrue(score.note.strip(),
                            f"{score.parameter} has no stated evidence")

    def test_an_invented_parameter_never_becomes_a_grade(self):
        g = self.grade(agent_said(video=[
            ParameterJudgement(parameter="speed", score=4, evidence="Steady."),
            ParameterJudgement(parameter="attitude", score=1,
                               evidence="Seemed uninterested.")]))
        self.assertEqual([s.parameter for s in g.video.scores], ["speed"])


if __name__ == "__main__":
    unittest.main()

    def test_wrong_slot_publishes_no_overall_mark(self):
        """Found by rendering into the UI: it was showing 4.0/5.

        An overall rating sits directly under "your work has not been marked
        down". The number is what a parent reads, and it must not contradict
        the sentence above it. Delivery ratings still show; the total does not.
        """
        v = verify_declared_module(
            DAY13, CATALOGUE,
            spoken_opening="Day 12 Task 2, Teacher English Speaking Training.")
        g = self.grade(agent_said(), module_check=v)
        self.assertIsNone(g.overall_rating)
        self.assertTrue(g.incomplete)
        self.assertIsNotNone(g.video.rating)      # delivery still visible
