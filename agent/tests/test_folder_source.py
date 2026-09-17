"""Loading modules and submissions from disk, and the end-to-end batch run.

These tests run against the real `sample_data/` folder that ships with the
repo, so they also verify the demo actually works — if someone edits a sample
file into an invalid state, these fail rather than the demo breaking silently
in front of an audience.
"""
import unittest
from pathlib import Path

from grading_agent import (
    CannotEvaluateReason,
    GradingPipeline,
    Rubric,
    RuleBasedNoteScorer,
    RuleBasedVideoScorer,
)
from grading_agent.folder_source import FolderSubmissionSource

SAMPLE_DATA = Path(__file__).resolve().parent.parent / "sample_data"


class TestFolderSubmissionSource(unittest.TestCase):
    def setUp(self):
        self.source = FolderSubmissionSource(SAMPLE_DATA)

    def test_finds_all_sample_submissions(self):
        subs = self.source.pending_submissions()
        self.assertEqual([s.submission_id for s in subs],
                         ["sub-001", "sub-002", "sub-003", "sub-004", "sub-real-001"])

    def test_no_student_media_is_committed(self):
        """This repository is public. Media of identifiable children must never
        end up in it — see sample_data/README.md."""
        media = {".mp4", ".mov", ".avi", ".mkv", ".jpg", ".jpeg", ".png",
                 ".webm", ".m4a", ".wav", ".mp3", ".heic", ".pdf"}
        found = [p.name for p in SAMPLE_DATA.rglob("*") if p.suffix.lower() in media]
        self.assertEqual(found, [], f"Media files found in sample_data: {found}")

    def test_loads_module_with_answer_key(self):
        module = self.source.load_module("day12_task2_english")
        self.assertEqual(module.module_id, "day12_task2_english")
        self.assertTrue(module.eye_contact_expected)
        # The word list doubles as the answer key for note Accuracy.
        self.assertEqual(module.answer_key["environment"], "वातावरण")

    def test_missing_artifact_loads_as_none_not_empty(self):
        """None (never uploaded) must not collapse into an empty evidence object."""
        _, note = self.source.load_evidence("sub-003")
        self.assertIsNone(note)

    def test_silent_video_loads_without_transcript(self):
        video, _ = self.source.load_evidence("sub-002")
        self.assertIsNotNone(video)
        self.assertIsNone(video.transcript)
        self.assertFalse(video.has_audio)

    def test_read_confidence_is_loaded(self):
        _, note = self.source.load_evidence("sub-004")
        self.assertLess(note.read_confidence["Pronunciation"], 0.5)

    def test_unknown_module_raises_clearly(self):
        with self.assertRaises(FileNotFoundError):
            self.source.load_module("no_such_module")


class TestEndToEndBatch(unittest.TestCase):
    """The four sample submissions must behave the way the design says."""

    def setUp(self):
        self.source = FolderSubmissionSource(SAMPLE_DATA)
        self.pipeline = GradingPipeline(
            Rubric.load(), RuleBasedVideoScorer(), RuleBasedNoteScorer())

    def _grade(self, submission_id):
        submission = next(s for s in self.source.pending_submissions()
                          if s.submission_id == submission_id)
        module = self.source.load_module(submission.module_id)
        video, note = self.source.load_evidence(submission_id)
        return self.pipeline.grade(submission, module, video, note)

    def test_complete_submission_gets_all_three_ratings(self):
        g = self._grade("sub-001")
        self.assertIsNotNone(g.video.rating)
        self.assertIsNotNone(g.note.rating)
        self.assertIsNotNone(g.overall_rating)
        self.assertFalse(g.incomplete)
        self.assertFalse(g.flagged_for_teacher)

    def test_silent_video_scores_nothing_and_asks_for_reupload(self):
        g = self._grade("sub-002")
        self.assertIsNone(g.video.rating)
        self.assertIs(g.video.cannot_evaluate, CannotEvaluateReason.NO_AUDIO)
        self.assertEqual(g.overall_rating, g.note.rating)
        self.assertTrue(g.incomplete)
        self.assertIn("could not hear", g.feedback.en)
        self.assertTrue(g.flagged_for_teacher)

    def test_forgotten_note_scores_zero_and_the_student_is_asked_for_it(self):
        g = self._grade("sub-003")
        self.assertTrue(g.note.missing)
        self.assertEqual(g.note.rating, 0.0)
        self.assertEqual(g.overall_rating, round(g.video.rating * 0.5, 2))
        self.assertTrue(g.incomplete)
        # A 0 is only fair if the student is plainly told what to do about it.
        self.assertIn("did not upload your handwritten note", g.feedback.en)

    def test_unreadable_rows_abstain_but_a_wrong_answer_still_counts(self):
        """sub-004: two rows unreadable, one genuinely wrong.

        The unreadable rows must not be marked wrong, and the wrong one must
        not be excused.
        """
        from grading_agent.devanagari import score_answer_key_rows

        module = self.source.load_module("day12_task2_english")
        _, note = self.source.load_evidence("sub-004")
        results = score_answer_key_rows(
            note.written_rows, module.answer_key, read_confidence=note.read_confidence)

        self.assertTrue(results["Pronunciation"].abstained)
        self.assertTrue(results["Judgment"].abstained)
        # "Bravery" was answered with the meaning of "Criticism" — a real error.
        self.assertFalse(results["Bravery"].abstained)
        self.assertFalse(results["Bravery"].is_match)
        # And the correct ones still register.
        self.assertTrue(results["Environment"].is_match)

    def test_real_derived_note_grades_end_to_end(self):
        """sub-real-001 carries a real student's transcribed note content.

        It is the one sample where the marked answers are genuine student work
        rather than invented, so it is the closest thing here to a real run.
        """
        g = self._grade("sub-real-001")
        self.assertTrue(g.note.was_graded)
        self.assertTrue(g.video.missing)
        self.assertEqual(g.overall_rating, round(g.note.rating * 0.5, 2))
        self.assertTrue(g.incomplete)
        # 15 of 15 vocabulary rows attempted and correct.
        completion = next(s for s in g.note.scores if s.parameter == "completion")
        self.assertEqual(completion.value, 5)

    def test_every_sample_produces_bilingual_feedback(self):
        for sid in ("sub-001", "sub-002", "sub-003", "sub-004", "sub-real-001"):
            g = self._grade(sid)
            self.assertTrue(g.feedback.en.strip(), sid)
            self.assertTrue(g.feedback.hi.strip(), sid)
            self.assertNotEqual(g.feedback.en, g.feedback.hi, sid)


if __name__ == "__main__":
    unittest.main()
