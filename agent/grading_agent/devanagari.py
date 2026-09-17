"""Matching handwritten Hindi against the module's answer key.

Why this module exists
----------------------
The Hindi column on a student's note *is* the answer being checked. If the
agent misreads it, it marks a correct answer wrong — a student who knew the
word is told they didn't, with no way to appeal. That is the failure mode to
design against.

The fix that changes the difficulty class: **do not do open-vocabulary OCR**.
The module already ships the expected Hindi meaning for every row, so the
question is not "what does this squiggle say?" but "does this match the
expected string?" — matching against a small known candidate set is a far
easier and more accurate problem than reading arbitrary handwriting.

This module implements that comparison, plus the tolerances the design
requires: legitimate spelling variants must never register as errors.

What counts as the same answer
------------------------------
* Nukta present or absent — ज़ / ज, क़ / क. Students routinely omit it.
* Anusvara versus conjunct nasal — संबंध / सम्बन्ध. Both are correct Hindi.
* Zero-width joiners, stray whitespace, surrounding punctuation.
* Near-misses above a similarity threshold (one wrong matra in a long word).

Anything below the confidence threshold returns ``None`` for the match rather
than a wrong answer — the caller then abstains instead of scoring it wrong.
"""
from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Optional

NUKTA = "़"
ANUSVARA = "ं"
CHANDRABINDU = "ँ"
VIRAMA = "्"
ZWJ = "‍"
ZWNJ = "‌"

#: Internal placeholder standing for "a nasal sound here", however written.
_NASAL = ""

_NASAL_CONJUNCT = re.compile(f"[मनङञण]{VIRAMA}")
_PUNCT = re.compile(r"[\s।॥.,;:!?'\"()\[\]{}\-–—/\\|]+")


def normalize(text: str) -> str:
    """Reduce a Devanagari string to a comparison form.

    Applies only the equivalences the design calls legitimate variants — it
    does not try to correct genuine spelling mistakes, which remain visible to
    the comparison.
    """
    if not text:
        return ""

    # Decompose so precomposed nukta letters (ज़ = U+095B) split into base +
    # combining nukta, letting one rule cover both spellings.
    s = unicodedata.normalize("NFD", text)
    s = s.replace(ZWJ, "").replace(ZWNJ, "")
    s = s.replace(NUKTA, "")

    # Treat any nasal spelling as the same sound: anusvara, chandrabindu, or a
    # nasal consonant carrying a virama (सम् / सन् before a consonant).
    s = s.replace(ANUSVARA, _NASAL).replace(CHANDRABINDU, _NASAL)
    s = _NASAL_CONJUNCT.sub(_NASAL, s)

    s = _PUNCT.sub("", s)
    return unicodedata.normalize("NFC", s).strip().lower()


def similarity(written: str, expected: str) -> float:
    """0.0-1.0 similarity between a read string and an expected answer."""
    a, b = normalize(written), normalize(expected)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


@dataclass(frozen=True)
class MatchResult:
    """Outcome of comparing one written answer against the answer key.

    Two separate numbers, deliberately not merged:

    ``read_confidence``
        How sure we are we read the handwriting correctly. Comes from the OCR
        or vision model, not from the comparison. Low value -> abstain.
    ``similarity``
        How close what we read is to the expected answer. Only meaningful once
        we trust the read.

    Conflating these is the bug this class exists to prevent: a completely
    wrong answer also produces a low similarity, and treating that as "we
    couldn't read it" would silently excuse real errors, while treating a bad
    read as a wrong answer penalises a student who was right.
    """
    expected: Optional[str]
    similarity: float
    read_confidence: float
    is_match: bool
    abstained: bool

    @property
    def counts_toward_accuracy(self) -> bool:
        """Abstained items drop out of the average — never scored wrong."""
        return not self.abstained


def match_against_key(
    written: str,
    expected: str,
    *,
    read_confidence: float = 1.0,
    min_read_confidence: float = 0.75,
    match_threshold: float = 0.85,
) -> MatchResult:
    """Compare one handwritten answer against its known expected value.

    Three outcomes:
      * couldn't read it confidently -> abstained, excluded from the average
      * read it, and it matches      -> is_match=True
      * read it, and it doesn't      -> is_match=False, a real scoreable error

    ``read_confidence`` should be supplied by whatever read the handwriting. It
    defaults to 1.0 for callers working from already-transcribed text, where
    there is no reading step to be uncertain about.

    The ``match_threshold`` is deliberately below 1.0: a single wrong character
    in a long word (वातावरन for वातावरण) is a minor spelling slip that does not
    change the meaning, and the design says those are noted in feedback rather
    than scored as wrong knowledge.
    """
    if read_confidence < min_read_confidence:
        # We are not confident we read this correctly. It could be a wrong
        # answer, or it could be handwriting we failed to parse. We do not
        # guess in the student's disfavour.
        return MatchResult(expected=expected, similarity=0.0,
                           read_confidence=read_confidence, is_match=False, abstained=True)

    score = similarity(written, expected)
    return MatchResult(
        expected=expected,
        similarity=score,
        read_confidence=read_confidence,
        is_match=score >= match_threshold,
        abstained=False,
    )


def best_match(written: str, candidates: Iterable[str], **kwargs) -> MatchResult:
    """Match against several candidate answers, returning the strongest."""
    best: Optional[MatchResult] = None
    for candidate in candidates:
        result = match_against_key(written, candidate, **kwargs)
        if best is None or result.similarity > best.similarity:
            best = result
    return best or MatchResult(expected=None, similarity=0.0, read_confidence=0.0,
                               is_match=False, abstained=True)


def score_answer_key_rows(
    written_rows: dict[str, str],
    answer_key: dict[str, str],
    *,
    read_confidence: Optional[dict[str, float]] = None,
    min_read_confidence: float = 0.75,
) -> dict[str, MatchResult]:
    """Compare a whole note's Hindi column against the module's answer key.

    ``written_rows`` maps English word -> what the student wrote beside it.
    ``read_confidence`` optionally maps the same keys to how confidently each
    row was read; rows without an entry are assumed readable.

    Rows the student left blank are absent from ``written_rows``; that is a
    Completion concern, not an Accuracy one, which is what keeps Completion
    independent of reading the script at all.
    """
    confidences = read_confidence or {}
    results: dict[str, MatchResult] = {}
    for word, written in written_rows.items():
        expected = answer_key.get(word.strip().lower())
        if expected is None:
            continue
        results[word] = match_against_key(
            written,
            expected,
            read_confidence=confidences.get(word, 1.0),
            min_read_confidence=min_read_confidence,
        )
    return results
