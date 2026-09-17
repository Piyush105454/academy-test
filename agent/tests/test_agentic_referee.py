"""The referee: what happens to the agent's output before it reaches a child.

The agent decides the scores and this layer does not second-guess them. What it
does is make the guarantees hold *whatever* the agent returns — which is the
only way they are guarantees rather than hopes about a prompt.

None of these need the Agents SDK or an API key: they test the boundary between
the model's judgement and the student's grade.
"""
import unittest

from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import (
    CoverageReport,
    ParameterJudgement,
    RefereeRejection,
    SubmissionEvaluation,
    referee,
)

MODULE = Module(
    module_id="delegating_tasks",
    title="Delegating Tasks",
    instruction="Read the article aloud clearly.",
    reference_content="Delegation lets a teacher share responsibility.",
    word_list=(WordListEntry("Delegation", "कार्य सौंपना"),),
)
SUB = Submission("sub-1", "STU-1", MODULE.module_id)


def evaluation(**kw) -> SubmissionEvaluation:
    base = dict(
        coverage=CoverageReport(
            could_check=True, verdict="complete", covered_fraction=0.95,
            evidence="27 of 29 module terms were spoken; nothing off-module."),
        relevance="on_topic",
        relevance_evidence="Module vocabulary was spoken throughout.",
        video=[ParameterJudgement(parameter="speed", score=4,
                                  evidence="Steady pace, about 110 words a minute.")],
        note=[ParameterJudgement(parameter="completion", score=5,
                                 evidence="All 15 rows filled in.")],
        feedback_en="Good work — you finished the whole task. Next time, pause after "
                    "each full stop.",
        feedback_hi="अच्छा काम — आपने पूरा काम पूरा किया।",
        for_the_teacher="",
    )
    base.update(kw)
    return SubmissionEvaluation(**base)


class TestRefereeAcceptsGoodWork(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()

    def test_agent_scores_are_used_as_given(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric)
        self.assertEqual(g.video.rating, 4.0)
        self.assertEqual(g.note.rating, 5.0)
        self.assertEqual(g.overall_rating, 4.5)
        self.assertEqual(g.extras["decided_by"], "agent")

    def test_agent_feedback_is_passed_through(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric)
        self.assertIn("Next time", g.feedback.en)
        self.assertTrue(g.feedback.hi.strip())


class TestRefereeEnforcesGuarantees(unittest.TestCase):
    """Whatever the agent returns, these must hold."""

    def setUp(self):
        self.rubric = Rubric.load()

    def test_judgement_about_the_child_is_rejected(self):
        bad = evaluation(feedback_en="You are a slow learner and should try harder.")
        with self.assertRaises(RefereeRejection):
            referee(bad, SUB, MODULE, self.rubric)

    def test_judgement_hidden_in_teacher_notes_is_also_rejected(self):
        bad = evaluation(for_the_teacher="Child seems lazy and from a poor family.")
        with self.assertRaises(RefereeRejection):
            referee(bad, SUB, MODULE, self.rubric)

    def test_score_without_evidence_is_rejected(self):
        bad = evaluation(video=[ParameterJudgement(parameter="speed", score=4,
                                                   evidence="")])
        with self.assertRaises(RefereeRejection):
            referee(bad, SUB, MODULE, self.rubric)

    def test_out_of_range_score_becomes_an_abstention_not_a_clamp(self):
        """If the agent returns 7 we do not know what it meant.

        Clamping to 5 would invent a grade; abstaining admits we have none.
        """
        odd = evaluation(video=[ParameterJudgement(parameter="speed", score=7,
                                                   evidence="Very fast.")])
        g = referee(odd, SUB, MODULE, self.rubric)
        speed = next(s for s in g.video.scores if s.parameter == "speed")
        self.assertFalse(speed.is_assessed)
        self.assertIn("out-of-range", speed.note)

    def test_abstention_stays_an_abstention(self):
        abstained = evaluation(video=[ParameterJudgement(
            parameter="speed", score=None, evidence="No transcript available.",
            abstained_because="Speech could not be transcribed.")])
        g = referee(abstained, SUB, MODULE, self.rubric)
        speed = next(s for s in g.video.scores if s.parameter == "speed")
        self.assertFalse(speed.is_assessed)
        self.assertIsNone(g.video.rating)          # no score, not a low one

    def test_abstention_never_becomes_zero(self):
        abstained = evaluation(
            video=[ParameterJudgement(parameter="speed", score=None,
                                      evidence="Could not hear.",
                                      abstained_because="No transcript.")],
            note=[ParameterJudgement(parameter="completion", score=4,
                                     evidence="12 of 15 rows.")])
        g = referee(abstained, SUB, MODULE, self.rubric)
        self.assertEqual(g.overall_rating, 4.0)    # the note's rating, not halved
        self.assertTrue(g.incomplete)

    def test_off_topic_suspends_rather_than_zeroes(self):
        off = evaluation(relevance="off_topic",
                         relevance_evidence="Read a passage about photosynthesis.")
        g = referee(off, SUB, MODULE, self.rubric)
        self.assertIsNone(g.video.rating)
        self.assertIsNone(g.note.rating)
        self.assertNotEqual(g.overall_rating, 0)
        self.assertTrue(any("off_topic" in f for f in g.flags))
        self.assertTrue(any("teacher to confirm" in f for f in g.flags))

    def test_unknown_parameter_is_ignored(self):
        """The agent inventing a parameter must not create a phantom score."""
        odd = evaluation(video=[
            ParameterJudgement(parameter="speed", score=4, evidence="Steady."),
            ParameterJudgement(parameter="charisma", score=5, evidence="Made up."),
        ])
        g = referee(odd, SUB, MODULE, self.rubric)
        self.assertEqual([s.parameter for s in g.video.scores], ["speed"])
        self.assertEqual(g.video.rating, 4.0)

    def test_relevance_evidence_is_recorded_for_review(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric)
        self.assertEqual(g.extras["relevance"], "on_topic")
        self.assertTrue(g.extras["relevance_evidence"])


class TestOutputContract(unittest.TestCase):
    def test_score_is_optional_so_abstaining_is_expressible(self):
        j = ParameterJudgement(parameter="tone", evidence="Could not hear the audio.")
        self.assertIsNone(j.score)

    def test_evidence_is_required(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            ParameterJudgement(parameter="tone", score=3)

    def test_relevance_is_three_valued(self):
        from pydantic import ValidationError
        for value in ("on_topic", "off_topic", "cannot_tell"):
            self.assertTrue(evaluation(relevance=value))
        with self.assertRaises(ValidationError):
            evaluation(relevance="probably_fine")


if __name__ == "__main__":
    unittest.main()


class TestCoverageChecksBeforeScoring(unittest.TestCase):
    """Coverage decides whether the work answered the module — and when it
    is allowed to cost the student anything."""

    def setUp(self):
        self.rubric = Rubric.load()

    def test_partial_coverage_is_flagged_with_the_fraction(self):
        partial = evaluation(coverage=CoverageReport(
            could_check=True, verdict="partial", covered_fraction=0.45,
            missing_from_submission=["the final two paragraphs on encouragement"],
            evidence="13 of 29 module terms spoken; the passage stops early."))
        g = referee(partial, SUB, MODULE, self.rubric)
        self.assertTrue(any("partial_coverage" in f for f in g.flags))
        self.assertTrue(any("45%" in f for f in g.flags))
        self.assertEqual(g.extras["coverage"]["covered_fraction"], 0.45)

    def test_content_not_in_the_module_is_reported(self):
        extra = evaluation(coverage=CoverageReport(
            could_check=True, verdict="partial", covered_fraction=0.6,
            not_in_module=["a long story about a cricket match"],
            evidence="Covered most of the passage, then spoke about cricket."))
        g = referee(extra, SUB, MODULE, self.rubric)
        self.assertTrue(any("content_not_in_module" in f for f in g.flags))
        self.assertEqual(g.extras["coverage"]["not_in_module"],
                         ["a long story about a cricket match"])

    def test_substantially_different_content_suspends_scoring(self):
        wrong = evaluation(coverage=CoverageReport(
            could_check=True, verdict="substantially_different", covered_fraction=0.02,
            evidence="Almost none of the module's content; a different passage."))
        g = referee(wrong, SUB, MODULE, self.rubric)
        self.assertIsNone(g.video.rating)
        self.assertNotEqual(g.overall_rating, 0)
        self.assertTrue(any("off_topic" in f for f in g.flags))

    # -- the safeguard ---------------------------------------------------

    def test_unchecked_coverage_deducts_nothing(self):
        """A student must never lose marks because our transcription failed."""
        unchecked = evaluation(coverage=CoverageReport(
            could_check=False, verdict="cannot_check",
            evidence="No transcript was available."))
        g = referee(unchecked, SUB, MODULE, self.rubric)
        self.assertEqual(g.video.rating, 4.0)      # scores untouched
        self.assertEqual(g.overall_rating, 4.5)
        self.assertTrue(any("no coverage marks were deducted" in f for f in g.flags))

    def test_uncheckable_coverage_carrying_findings_is_rejected(self):
        """Claiming not to have checked, then reporting what was missing."""
        contradictory = evaluation(coverage=CoverageReport(
            could_check=False, verdict="cannot_check", covered_fraction=0.3,
            evidence="No transcript, but it felt incomplete."))
        with self.assertRaises(RefereeRejection):
            referee(contradictory, SUB, MODULE, self.rubric)

    def test_uncheckable_coverage_listing_omissions_is_rejected(self):
        contradictory = evaluation(coverage=CoverageReport(
            could_check=False, verdict="cannot_check",
            missing_from_submission=["the second half"],
            evidence="No transcript."))
        with self.assertRaises(RefereeRejection):
            referee(contradictory, SUB, MODULE, self.rubric)

    def test_uncheckable_coverage_with_a_confident_verdict_is_rejected(self):
        contradictory = evaluation(coverage=CoverageReport(
            could_check=False, verdict="substantially_different",
            evidence="Could not hear it, but it sounded wrong."))
        with self.assertRaises(RefereeRejection):
            referee(contradictory, SUB, MODULE, self.rubric)

    def test_unchecked_coverage_cannot_suspend_scoring(self):
        """Suspension is a serious step; it needs evidence, not a hunch."""
        unchecked = evaluation(
            relevance="cannot_tell",
            coverage=CoverageReport(could_check=False, verdict="cannot_check",
                                    evidence="No transcript."))
        g = referee(unchecked, SUB, MODULE, self.rubric)
        self.assertIsNotNone(g.video.rating)
        self.assertFalse(any("off_topic" in f for f in g.flags))
