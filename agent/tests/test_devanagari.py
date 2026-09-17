"""Devanagari answer-key matching.

These tests encode the design's requirement that legitimate spelling variants
never register as errors, and that an uncertain read abstains rather than
marking a correct answer wrong.
"""
import unittest

from grading_agent.devanagari import (
    best_match,
    match_against_key,
    normalize,
    score_answer_key_rows,
    similarity,
)


class TestNormalize(unittest.TestCase):
    def test_nukta_optional(self):
        """Students routinely omit the nukta; that is not a spelling error."""
        self.assertEqual(normalize("ज़रूरत"), normalize("जरूरत"))

    def test_anusvara_equals_conjunct_nasal(self):
        """संबंध and सम्बन्ध are both correct Hindi."""
        self.assertEqual(normalize("संबंध"), normalize("सम्बन्ध"))

    def test_whitespace_and_punctuation_ignored(self):
        self.assertEqual(normalize(" वातावरण। "), normalize("वातावरण"))

    def test_zero_width_joiners_removed(self):
        self.assertEqual(normalize("क‍ष"), normalize("कष"))

    def test_distinct_words_stay_distinct(self):
        """Normalisation must not collapse genuinely different words."""
        self.assertNotEqual(normalize("वातावरण"), normalize("आत्मविश्वास"))


class TestSimilarity(unittest.TestCase):
    def test_identical_is_one(self):
        self.assertEqual(similarity("वातावरण", "वातावरण"), 1.0)

    def test_variant_spelling_is_one(self):
        self.assertEqual(similarity("सम्बन्ध", "संबंध"), 1.0)

    def test_unrelated_words_score_low(self):
        self.assertLess(similarity("साहस", "प्रोत्साहित करना"), 0.6)

    def test_empty_is_zero(self):
        self.assertEqual(similarity("", "वातावरण"), 0.0)


class TestMatchAgainstKey(unittest.TestCase):
    def test_exact_match(self):
        r = match_against_key("वातावरण", "वातावरण")
        self.assertTrue(r.is_match)
        self.assertFalse(r.abstained)

    def test_variant_spelling_counts_as_correct(self):
        r = match_against_key("सम्बन्ध", "संबंध")
        self.assertTrue(r.is_match)

    def test_unreadable_answer_abstains_rather_than_marking_wrong(self):
        """The failure mode we are designing against.

        When the handwriting could not be read confidently, the row drops out
        of the average. It must never become a wrong mark against a student who
        may well have written the right answer.
        """
        r = match_against_key("वातावरण", "वातावरण", read_confidence=0.4)
        self.assertTrue(r.abstained)
        self.assertFalse(r.counts_toward_accuracy)

    def test_minor_spelling_slip_is_forgiven(self):
        """न for ण does not change the meaning, so it is not a wrong answer.

        The design says minor slips are noted in feedback, not scored as wrong
        knowledge.
        """
        r = match_against_key("वातावरन", "वातावरण")
        self.assertTrue(r.is_match)
        self.assertFalse(r.abstained)

    def test_confidently_read_wrong_answer_is_scoreable(self):
        """A different word, clearly read, is a real error and must count.

        This is the case that must NOT abstain — otherwise genuine mistakes
        quietly disappear from the score.
        """
        r = match_against_key("साहस", "वातावरण", read_confidence=0.95)
        self.assertFalse(r.abstained)
        self.assertFalse(r.is_match)
        self.assertTrue(r.counts_toward_accuracy)

    def test_best_match_picks_strongest_candidate(self):
        r = best_match("साहस", ["वातावरण", "साहस", "निर्णय"])
        self.assertTrue(r.is_match)
        self.assertEqual(r.expected, "साहस")


class TestScoreAnswerKeyRows(unittest.TestCase):
    def setUp(self):
        self.answer_key = {
            "environment": "वातावरण",
            "bravery": "साहस",
            "judgment": "निर्णय",
        }

    def test_all_correct(self):
        written = {"Environment": "वातावरण", "Bravery": "साहस", "Judgment": "निर्णय"}
        results = score_answer_key_rows(written, self.answer_key)
        self.assertEqual(len(results), 3)
        self.assertTrue(all(r.is_match for r in results.values()))

    def test_unknown_word_is_skipped(self):
        results = score_answer_key_rows({"NotInModule": "कुछ"}, self.answer_key)
        self.assertEqual(results, {})

    def test_case_insensitive_lookup(self):
        results = score_answer_key_rows({"ENVIRONMENT": "वातावरण"}, self.answer_key)
        self.assertTrue(results["ENVIRONMENT"].is_match)

    def test_unreadable_rows_excluded_from_scoring(self):
        written = {"Environment": "वातावरण", "Bravery": "साहस", "Judgment": "निर्णय"}
        # The middle row was smudged — the reader could not make it out.
        confidence = {"Environment": 0.95, "Bravery": 0.3, "Judgment": 0.9}
        results = score_answer_key_rows(written, self.answer_key, read_confidence=confidence)

        scoreable = [r for r in results.values() if r.counts_toward_accuracy]
        self.assertEqual(len(scoreable), 2)
        self.assertTrue(all(r.is_match for r in scoreable))
        self.assertTrue(results["Bravery"].abstained)

    def test_wrong_answers_still_count_against_accuracy(self):
        written = {"Environment": "वातावरण", "Bravery": "निर्णय"}
        results = score_answer_key_rows(written, self.answer_key)
        self.assertTrue(results["Environment"].is_match)
        self.assertFalse(results["Bravery"].is_match)
        self.assertFalse(results["Bravery"].abstained)


if __name__ == "__main__":
    unittest.main()
