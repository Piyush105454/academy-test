"""Three guarantees added after reviewing the portal integration.

1. Files cannot be attributed to the wrong student.
2. The wrong *slot* is never punished as the wrong *work*.
3. Erasing a student is part of the contract, and the audit choice is explicit.
"""
import json
import tempfile
import unittest
from pathlib import Path

from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import (
    CoverageReport,
    ParameterJudgement,
    SubmissionEvaluation,
    referee,
)
from grading_agent.binding import ArtifactRef, BindingError, bind
from grading_agent.erasure import AuditPolicy, erase_student
from grading_agent.module_check import (
    ModuleAnchors,
    ModuleVerdict,
    verify_spoken_module,
    wrong_task_message,
)

DAY12 = ModuleAnchors(
    "day12_task2_english", "DAY 12 - TASK 2 - Teacher English Speaking Training",
    ("day 12", "task 2", "teacher english speaking training",
     "helping students overcome fear of speaking english"))
DAY13 = ModuleAnchors(
    "day13_task1_english", "DAY 13 - TASK 1 - Classroom Questions",
    ("day 13", "task 1", "classroom questions"))
CATALOGUE = (DAY12, DAY13)


# ---------------------------------------------------------------- binding ---

class TestBinding(unittest.TestCase):
    def video(self, **kw):
        base = dict(submission_id="sub-9", student_id="STU-1",
                    module_id="day12_task2_english", kind="video", path="/v.mp4")
        base.update(kw)
        return ArtifactRef(**base)

    def note(self, **kw):
        base = dict(submission_id="sub-9", student_id="STU-1",
                    module_id="day12_task2_english", kind="note", path="/n.jpg")
        base.update(kw)
        return ArtifactRef(**base)

    def test_matching_artifacts_bind(self):
        s = bind([self.video(), self.note()])
        self.assertIsInstance(s, Submission)
        self.assertEqual((s.student_id, s.video_path, s.note_path),
                         ("STU-1", "/v.mp4", "/n.jpg"))

    def test_two_students_refuse_rather_than_guess(self):
        """The failure this whole module exists to prevent."""
        with self.assertRaises(BindingError) as ctx:
            bind([self.video(), self.note(student_id="STU-2")])
        self.assertIn("more than one student", str(ctx.exception))

    def test_different_submissions_refuse(self):
        with self.assertRaises(BindingError):
            bind([self.video(), self.note(submission_id="sub-10")])

    def test_different_modules_refuse(self):
        with self.assertRaises(BindingError):
            bind([self.video(), self.note(module_id="day13_task1_english")])

    def test_two_videos_refuse(self):
        with self.assertRaises(BindingError):
            bind([self.video(), self.video(path="/v2.mp4")])

    def test_blank_provenance_refuses(self):
        with self.assertRaises(BindingError):
            self.video(student_id="  ")

    def test_grading_a_different_module_than_requested_refuses(self):
        with self.assertRaises(BindingError):
            bind([self.video()], expected_module_id="day13_task1_english")

    def test_a_note_alone_still_binds(self):
        s = bind([self.note()])
        self.assertIsNone(s.video_path)
        self.assertEqual(s.note_path, "/n.jpg")


# --------------------------------------------------------- module check ---

class TestSpokenModuleCheck(unittest.TestCase):
    def test_naming_the_module_confirms_it(self):
        v = verify_spoken_module(
            "Day 12 Task 2, Teacher English Speaking Training. Fear of speaking "
            "English is common among students...", DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.CONFIRMED)

    def test_naming_another_module_is_a_mismatch_with_the_title(self):
        v = verify_spoken_module(
            "Day 13 Task 1, Classroom Questions. Today I will read...",
            DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.MISMATCH)
        self.assertEqual(v.spoken_module_id, "day13_task1_english")
        self.assertIn("Classroom Questions", v.spoken_title)

    def test_silence_is_not_a_mismatch(self):
        """A student who starts reading immediately loses nothing."""
        v = verify_spoken_module(
            "Fear of speaking English is common among students, especially in "
            "classrooms where English is not their first language.",
            DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.SILENT)

    def test_no_transcript_is_silent_not_mismatch(self):
        self.assertIs(verify_spoken_module("", DAY12, CATALOGUE).verdict,
                      ModuleVerdict.SILENT)

    def test_ambiguity_refuses_to_accuse(self):
        v = verify_spoken_module("Day 12 Task 2 and Day 13 Task 1 both mention...",
                                 ModuleAnchors("other", "Other", ("other module",)),
                                 CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.SILENT)

    def test_own_title_wins_over_a_second_match(self):
        v = verify_spoken_module(
            "Day 12 Task 2. Later I will do Day 13 Task 1 as well.",
            DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.CONFIRMED)

    def test_title_deep_in_the_transcript_does_not_confirm(self):
        """The title is read at the start or not at all."""
        v = verify_spoken_module(("word " * 200) + " teacher english speaking training",
                                 DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.SILENT)

    def test_single_word_anchors_are_ignored(self):
        """'English' must never identify a module."""
        loose = ModuleAnchors("m", "M", ("english",))
        v = verify_spoken_module("English lesson today.", DAY12, (DAY12, loose))
        self.assertIs(v.verdict, ModuleVerdict.SILENT)

    def test_the_message_does_not_read_as_a_mistake(self):
        v = verify_spoken_module("Day 13 Task 1, Classroom Questions.",
                                 DAY12, CATALOGUE)
        msg = wrong_task_message(v)
        self.assertIn("Classroom Questions", msg.en)
        self.assertIn("has not been marked down", msg.en)
        self.assertTrue(msg.hi.strip())
        for word in ("wrong", "incorrect", "missing", "score"):
            self.assertNotIn(word, msg.en.lower())


# ----------------------------------------------- referee and wrong slot ---

MODULE = Module(
    module_id="day12_task2_english", title=DAY12.title,
    instruction="Read the article aloud clearly.",
    reference_content="Fear of speaking English is common among students.",
    word_list=(WordListEntry("Fear", "डर"),))
SUB = Submission("sub-9", "STU-1", MODULE.module_id)


def evaluation(**kw) -> SubmissionEvaluation:
    base = dict(
        coverage=CoverageReport(
            could_check=True, verdict="substantially_different",
            covered_fraction=0.02,
            evidence="Almost none of this module's content was spoken."),
        relevance="off_topic",
        relevance_evidence="None of the module vocabulary appears.",
        video=[ParameterJudgement(parameter="speed", score=4,
                                  evidence="Steady pace throughout."),
               ParameterJudgement(parameter="vocabulary", score=2,
                                  evidence="Few of the module's words were used.")],
        note=[],
        feedback_en="Good work — you read clearly.",
        feedback_hi="अच्छा काम।",
        for_the_teacher="",
    )
    base.update(kw)
    return SubmissionEvaluation(**base)


class TestWrongSlotIsNotWrongWork(unittest.TestCase):
    def setUp(self):
        self.rubric = Rubric.load()
        self.mismatch = verify_spoken_module(
            "Day 13 Task 1, Classroom Questions. Today I will read...",
            DAY12, CATALOGUE)

    def test_wrong_slot_is_not_reported_as_off_topic(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertTrue(any("wrong_task_uploaded" in f for f in g.flags))
        self.assertFalse(any("off_topic" in f for f in g.flags))

    def test_content_scores_are_dropped_but_delivery_survives(self):
        """Vocabulary was judged against the wrong answer key; pace was not."""
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        kept = [s.parameter for s in g.video.scores]
        self.assertIn("speed", kept)
        self.assertNotIn("vocabulary", kept)
        self.assertEqual(g.video.rating, 4.0)   # the delivery score, not the 2

    def test_the_wrong_key_score_never_reaches_the_student(self):
        """The 2/5 for vocabulary was measured against Day 12's word list."""
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertNotIn("vocabulary", g.feedback.en.lower())
        self.assertNotIn("2/5", g.feedback.en)

    def test_delivery_feedback_is_given_in_both_languages(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertIn("your pace 4/5", g.feedback.en)
        self.assertIn("4/5", g.feedback.hi)
        self.assertTrue(g.extras["delivery_feedback_given_despite_wrong_slot"])

    def test_the_student_is_told_it_is_the_slot_not_the_work(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertIn("Classroom Questions", g.feedback.en)
        self.assertIn("has not been marked down", g.feedback.en)
        self.assertTrue(g.feedback.hi.strip())

    def test_the_teacher_is_told_to_move_it(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertIn("move it", g.extras["for_the_teacher"])

    def test_wrong_slot_never_scores_zero(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric,
                    module_check=self.mismatch)
        self.assertNotEqual(g.overall_rating, 0)

    def test_silence_changes_nothing_about_the_score(self):
        silent = verify_spoken_module("Fear of speaking English is common.",
                                      DAY12, CATALOGUE)
        on_topic = evaluation(
            relevance="on_topic",
            relevance_evidence="Module vocabulary present.",
            coverage=CoverageReport(could_check=True, verdict="complete",
                                    covered_fraction=0.9, evidence="Most terms."))
        g = referee(on_topic, SUB, MODULE, self.rubric, module_check=silent)
        # Both parameters survive — silence suspends nothing. mean(4, 2) = 3.0
        self.assertEqual(g.video.rating, 3.0)
        self.assertEqual(len(g.video.scores), 2)
        self.assertTrue(any("not a deduction" in f for f in g.flags))

    def test_confirmation_is_recorded(self):
        confirmed = verify_spoken_module("Day 12 Task 2. Fear of speaking English.",
                                         DAY12, CATALOGUE)
        on_topic = evaluation(
            relevance="on_topic", relevance_evidence="Vocabulary present.",
            coverage=CoverageReport(could_check=True, verdict="complete",
                                    covered_fraction=0.9, evidence="Most terms."))
        g = referee(on_topic, SUB, MODULE, self.rubric, module_check=confirmed)
        self.assertTrue(any("module_confirmed_by_student" in f for f in g.flags))
        self.assertEqual(g.extras["module_check"]["verdict"], "confirmed")

    def test_no_module_check_behaves_exactly_as_before(self):
        g = referee(evaluation(), SUB, MODULE, self.rubric)
        self.assertTrue(any("off_topic" in f for f in g.flags))
        self.assertNotIn("module_check", g.extras)


# ---------------------------------------------------------------- erasure ---

class _Store:
    def __init__(self, records):
        self._records = records

    def all_records(self):
        return dict(self._records)

    def _flush(self):
        pass


class TestErasure(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.audit = self.dir / "audit.jsonl"
        self.audit.write_text(
            json.dumps({"event": "graded", "student_id": "STU-1", "detail": {}}) + "\n" +
            json.dumps({"event": "graded", "student_id": "STU-2", "detail": {}}) + "\n",
            encoding="utf-8")

    def test_policy_must_be_stated(self):
        """No default: the retention choice belongs to the school."""
        with self.assertRaises(TypeError):
            erase_student("STU-1")            # type: ignore[call-arg]

    def test_profile_is_removed(self):
        store = _Store({"STU-1": ["x"], "STU-2": ["y"]})
        r = erase_student("STU-1", profile_store=store,
                          audit_policy=AuditPolicy.KEEP)
        self.assertTrue(r.profile_removed)
        self.assertNotIn("STU-1", store.all_records())

    def test_keep_leaves_the_audit_trail_intact(self):
        r = erase_student("STU-1", audit_path=self.audit,
                          audit_policy=AuditPolicy.KEEP)
        self.assertEqual(r.audit_rows_affected, 0)
        self.assertIn("STU-1", self.audit.read_text(encoding="utf-8"))

    def test_pseudonymise_keeps_the_row_and_drops_the_person(self):
        r = erase_student("STU-1", audit_path=self.audit,
                          audit_policy=AuditPolicy.PSEUDONYMISE)
        rows = [json.loads(l) for l in
                self.audit.read_text(encoding="utf-8").splitlines() if l.strip()]
        self.assertEqual(r.audit_rows_affected, 1)
        self.assertEqual(len(rows), 2)
        self.assertNotIn("STU-1", {row["student_id"] for row in rows})

    def test_delete_removes_only_that_student(self):
        erase_student("STU-1", audit_path=self.audit,
                      audit_policy=AuditPolicy.DELETE)
        rows = [json.loads(l) for l in
                self.audit.read_text(encoding="utf-8").splitlines() if l.strip()]
        self.assertEqual([row["student_id"] for row in rows], ["STU-2"])

    def test_unparseable_lines_are_never_silently_dropped(self):
        self.audit.write_text('{"student_id": "STU-1"}\nnot json\n', encoding="utf-8")
        erase_student("STU-1", audit_path=self.audit,
                      audit_policy=AuditPolicy.DELETE)
        self.assertIn("not json", self.audit.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()


class TestAnchorsAndTwoChannels(unittest.TestCase):
    """Anchors derived from the title; the note header as a second channel."""

    def setUp(self):
        from grading_agent.module_check import (
            AnchorObservations, verify_declared_module)
        self.verify_declared = verify_declared_module
        self.observations = AnchorObservations()
        self.derived = ModuleAnchors.from_module(MODULE)

    def test_anchors_are_derived_without_a_hand_written_list(self):
        anchors = [a.lower() for a in self.derived.anchors]
        self.assertIn("teacher english speaking training", anchors)
        self.assertTrue(any("day 12" in a for a in anchors))

    def test_the_page_header_alone_can_confirm_the_module(self):
        """Every note in this project writes the module across the top."""
        v = self.verify_declared(
            DAY12, CATALOGUE,
            spoken_opening="Fear of speaking English is common among students.",
            written_header="DAY 12 TASK 2 Teacher English Speaking Training")
        self.assertIs(v.verdict, ModuleVerdict.CONFIRMED)
        self.assertIn("top of the page", v.evidence)

    def test_the_page_header_alone_can_reveal_a_wrong_slot(self):
        v = self.verify_declared(
            DAY12, CATALOGUE,
            written_header="Day 13 Task 1 Classroom Questions")
        self.assertIs(v.verdict, ModuleVerdict.MISMATCH)
        self.assertEqual(v.spoken_module_id, "day13_task1_english")

    def test_either_channel_confirming_is_enough(self):
        v = self.verify_declared(
            DAY12, CATALOGUE,
            spoken_opening="Day 12 Task 2.", written_header="")
        self.assertIs(v.verdict, ModuleVerdict.CONFIRMED)

    def test_channels_disagreeing_is_ambiguity_not_an_accusation(self):
        v = self.verify_declared(
            DAY12, CATALOGUE,
            spoken_opening="Day 13 Task 1, Classroom Questions.",
            written_header="Something Else Entirely")
        other = ModuleAnchors("x", "Something Else Entirely",
                              ("something else entirely",))
        v = self.verify_declared(
            DAY12, (*CATALOGUE, other),
            spoken_opening="Day 13 Task 1, Classroom Questions.",
            written_header="Something Else Entirely")
        self.assertIs(v.verdict, ModuleVerdict.SILENT)
        self.assertIn("a teacher should look", v.evidence)

    def test_neither_channel_speaking_is_silent(self):
        v = self.verify_declared(DAY12, CATALOGUE)
        self.assertIs(v.verdict, ModuleVerdict.SILENT)

    def test_observations_need_repetition_before_a_person_sees_them(self):
        for _ in range(3):
            self.observations.observe("day12_task2_english", "day twelve task two")
        self.observations.observe("day12_task2_english", "a one off phrasing")
        candidates = self.observations.candidates("day12_task2_english")
        self.assertEqual(candidates, ["day twelve task two"])

    def test_widening_never_admits_a_single_word(self):
        widened = self.derived.widened(["english", "day twelve task two"])
        self.assertNotIn("english", widened.anchors)
        self.assertIn("day twelve task two", widened.anchors)


class TestCoverageIsReportedNotScored(unittest.TestCase):
    """WES decision, 07 Sep 2026: say how much was covered; don't deduct for it."""

    def setUp(self):
        self.rubric = Rubric.load()
        self.partial = evaluation(
            relevance="on_topic", relevance_evidence="Module vocabulary present.",
            coverage=CoverageReport(
                could_check=True, verdict="partial", covered_fraction=0.66,
                missing_from_submission=["the last two paragraphs"],
                evidence="Read about two thirds, then stopped."),
            video=[ParameterJudgement(parameter="speed", score=5,
                                      evidence="Excellent, steady pace."),
                   ParameterJudgement(parameter="tone", score=5,
                                      evidence="Calm and encouraging throughout.")])

    def test_reading_half_beautifully_still_scores_beautifully(self):
        g = referee(self.partial, SUB, MODULE, self.rubric)
        self.assertEqual(g.video.rating, 5.0)

    def test_the_figure_reaches_the_student_in_both_languages(self):
        g = referee(self.partial, SUB, MODULE, self.rubric)
        self.assertIn("66%", g.feedback.en)
        self.assertIn("66%", g.feedback.hi)

    def test_the_teacher_sees_the_same_number(self):
        g = referee(self.partial, SUB, MODULE, self.rubric)
        self.assertTrue(any("66%" in f for f in g.flags))
        self.assertEqual(g.extras["coverage"]["covered_fraction"], 0.66)

    def test_the_agent_saying_it_itself_is_not_duplicated(self):
        already = evaluation(
            relevance="on_topic", relevance_evidence="Present.",
            coverage=self.partial.coverage,
            video=[ParameterJudgement(parameter="speed", score=5,
                                      evidence="Steady.")],
            feedback_en="Lovely reading. You covered about 66% of the article.",
            feedback_hi="बहुत अच्छा पढ़ा।")
        g = referee(already, SUB, MODULE, self.rubric)
        self.assertEqual(g.feedback.en.count("66%"), 1)


class TestReevaluation(unittest.TestCase):
    """A 0 for missing work is only fair if it is reversible."""

    def setUp(self):
        from grading_agent.scoring import build_artifact_result, grade_submission
        from grading_agent.models import ArtifactKind, ParameterScore
        self.rubric = Rubric.load()
        video = build_artifact_result(ArtifactKind.VIDEO, [
            ParameterScore.scored("speed", 4, "Steady."),
            ParameterScore.scored("tone", 4, "Warm.")])
        self.at_deadline = grade_submission(
            "sub-9", "STU-1", MODULE.module_id, video,
            build_artifact_result(ArtifactKind.NOTE, missing=True), self.rubric)

    def test_the_deadline_grade_is_provisional(self):
        from grading_agent.reevaluation import is_provisional
        self.assertEqual(self.at_deadline.note.rating, 0.0)
        self.assertEqual(self.at_deadline.overall_rating, 2.0)
        self.assertTrue(is_provisional(self.at_deadline))

    def test_the_note_arriving_triggers_a_re_run(self):
        from grading_agent.reevaluation import needs_reevaluation
        later = Submission("sub-9", "STU-1", MODULE.module_id,
                           video_path="/v.mp4", note_path="/n.jpg")
        need = needs_reevaluation(self.at_deadline, later)
        self.assertTrue(need)
        self.assertEqual(need.newly_supplied, ("note",))

    def test_still_missing_does_not_re_run(self):
        from grading_agent.reevaluation import needs_reevaluation
        same = Submission("sub-9", "STU-1", MODULE.module_id, video_path="/v.mp4")
        self.assertFalse(needs_reevaluation(self.at_deadline, same))

    def test_a_complete_grade_is_never_re_run(self):
        from grading_agent.reevaluation import needs_reevaluation
        from grading_agent.scoring import build_artifact_result, grade_submission
        from grading_agent.models import ArtifactKind, ParameterScore
        both = grade_submission(
            "sub-9", "STU-1", MODULE.module_id,
            build_artifact_result(ArtifactKind.VIDEO,
                                  [ParameterScore.scored("speed", 4, "Steady.")]),
            build_artifact_result(ArtifactKind.NOTE,
                                  [ParameterScore.scored("completion", 5, "All rows.")]),
            self.rubric)
        self.assertFalse(needs_reevaluation(
            both, Submission("sub-9", "STU-1", MODULE.module_id,
                             video_path="/v.mp4", note_path="/n.jpg")))

    def test_the_correction_keeps_both_numbers(self):
        from grading_agent.reevaluation import mark_supersedes
        from grading_agent.scoring import build_artifact_result, grade_submission
        from grading_agent.models import ArtifactKind, ParameterScore
        corrected = grade_submission(
            "sub-9", "STU-1", MODULE.module_id,
            build_artifact_result(ArtifactKind.VIDEO,
                                  [ParameterScore.scored("speed", 4, "Steady.")]),
            build_artifact_result(ArtifactKind.NOTE,
                                  [ParameterScore.scored("completion", 5, "All rows.")]),
            self.rubric)
        corrected = mark_supersedes(corrected, self.at_deadline)
        self.assertEqual(corrected.extras["supersedes"]["previous_overall"], 2.0)
        self.assertEqual(corrected.overall_rating, 4.5)
        self.assertTrue(any("re_evaluated" in f for f in corrected.flags))
