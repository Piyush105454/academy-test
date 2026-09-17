"""The consent gate.

These are the highest-stakes tests in the suite. Everything else protects a
student's score; these protect whether their video is opened at all.
"""
import json
import tempfile
import unittest
from pathlib import Path

from grading_agent.consent import ConsentRegister
from grading_agent.local_media import ConsentRequired, LocalMediaSource


class TestConsentRegister(unittest.TestCase):
    def _register(self, payload):
        tmp = Path(tempfile.mkdtemp()) / "consent.json"
        tmp.write_text(json.dumps(payload), encoding="utf-8")
        return ConsentRegister.load(tmp)

    def test_granted_student_is_allowed(self):
        reg = self._register({"S1": {"granted": True, "recorded_on": "2026-08-20"}})
        self.assertTrue(reg.allows("S1"))

    def test_explicitly_refused_student_is_blocked(self):
        reg = self._register({"S1": {"granted": False}})
        self.assertFalse(reg.allows("S1"))

    def test_unknown_student_is_blocked(self):
        """Absence of a record is not permission."""
        reg = self._register({"S1": {"granted": True}})
        self.assertFalse(reg.allows("SOMEONE-ELSE"))

    def test_missing_file_grants_nothing(self):
        """Fails closed — a missing register must not open the gate."""
        reg = ConsentRegister.load(Path(tempfile.mkdtemp()) / "nope.json")
        self.assertFalse(reg.allows("S1"))
        self.assertEqual(len(reg), 0)

    def test_malformed_file_grants_nothing(self):
        tmp = Path(tempfile.mkdtemp()) / "consent.json"
        tmp.write_text("{ this is not valid json", encoding="utf-8")
        reg = ConsentRegister.load(tmp)
        self.assertFalse(reg.allows("S1"))

    def test_missing_granted_key_defaults_to_blocked(self):
        reg = self._register({"S1": {"recorded_on": "2026-08-20"}})
        self.assertFalse(reg.allows("S1"))

    def test_without_consent_lists_the_blocked(self):
        reg = self._register({"S1": {"granted": True}, "S2": {"granted": False}})
        self.assertEqual(reg.without_consent(["S1", "S2", "S3"]), ["S2", "S3"])


class TestLocalMediaGate(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        for student in ("S-YES", "S-NO"):
            (self.root / student).mkdir()
            (self.root / student / "video.mp4").write_bytes(b"not a real video")
        (self.root / "consent.json").write_text(json.dumps({
            "S-YES": {"granted": True, "recorded_on": "2026-08-20"},
            "S-NO": {"granted": False},
        }), encoding="utf-8")
        self.source = LocalMediaSource(self.root)

    def test_finds_student_folders(self):
        self.assertEqual(self.source.students_with_media(), ["S-NO", "S-YES"])

    def test_media_without_consent_raises_before_opening(self):
        with self.assertRaises(ConsentRequired):
            self.source.video_evidence("S-NO")

    def test_note_without_consent_also_raises(self):
        with self.assertRaises(ConsentRequired):
            self.source.note_evidence("S-NO")

    def test_unknown_student_raises(self):
        with self.assertRaises(ConsentRequired):
            self.source.video_evidence("NEVER-HEARD-OF-THEM")

    def test_consented_student_is_processed(self):
        # The fake file is not decodable, so this surfaces as a corrupt file —
        # what matters is that the gate let it through to be tried.
        evidence, blocker = self.source.video_evidence("S-YES")
        self.assertIsNotNone(blocker)

    def test_there_is_no_bypass_argument(self):
        """Consent must not be overridable by a caller passing a flag."""
        import inspect
        sig = inspect.signature(self.source.video_evidence)
        params = set(sig.parameters) - {"student_id"}
        self.assertEqual(params, set(), f"unexpected override params: {params}")


if __name__ == "__main__":
    unittest.main()
