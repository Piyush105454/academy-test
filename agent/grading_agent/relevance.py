"""Did this submission answer *this* module?

A student can produce a fluent, well-paced recording of entirely the wrong
passage. Grading delivery without checking content would hand them a good score
for work that does not answer the task.

The dangerous failure, and how it is avoided
--------------------------------------------
An agent that wrongly tells a child "you submitted the wrong homework" does
real harm, and it is an easy mistake to make: earlier in this project a video
was judged off-task from *posture alone* — a student reading with their head
down was read as writing instead of speaking. That was wrong.

So this module holds to three rules:

1. **Content only.** Relevance is judged from what was said or written against
   what the module asks for. Never from posture, appearance, background,
   clothing, or how long the recording is.
2. **Three outcomes, not two.** ON_TOPIC, OFF_TOPIC, and CANNOT_TELL. With no
   transcript there is no evidence either way, and the answer is CANNOT_TELL —
   never OFF_TOPIC by default.
3. **Off-topic never scores zero.** It suspends scoring and raises a flag for a
   teacher. A human confirms before a student is told their work did not count.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .models import Module

# Words too common to indicate anything about topic.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
    "been", "being", "to", "of", "in", "on", "at", "for", "with", "from", "by",
    "as", "it", "its", "this", "that", "these", "those", "they", "them", "their",
    "we", "our", "you", "your", "i", "he", "she", "his", "her", "not", "no",
    "can", "will", "would", "should", "may", "more", "most", "very", "so",
    "if", "when", "then", "than", "there", "here", "have", "has", "had", "do",
    "does", "did", "about", "into", "out", "up", "down", "over", "also", "some",
}

_WORD = re.compile(r"[a-z']+")


class Relevance(str, Enum):
    ON_TOPIC = "on_topic"
    OFF_TOPIC = "off_topic"
    CANNOT_TELL = "cannot_tell"


@dataclass(frozen=True)
class RelevanceVerdict:
    """Whether a submission addresses the module, and on what evidence."""
    status: Relevance
    overlap: float                      # 0.0-1.0 share of module terms found
    matched_terms: tuple[str, ...] = ()
    evidence: str = ""

    @property
    def blocks_scoring(self) -> bool:
        """Off-topic work is not scored — but it is not zeroed either.

        Scoring is suspended pending a teacher's look. The student is not told
        their work was wrong on the agent's say-so alone.
        """
        return self.status is Relevance.OFF_TOPIC

    @property
    def needs_teacher(self) -> bool:
        return self.status is Relevance.OFF_TOPIC


#: Below this share of module terms, and with enough words to have judged
#: fairly, a submission is treated as off-topic.
OFF_TOPIC_BELOW = 0.10
#: Above this, clearly on-topic.
ON_TOPIC_ABOVE = 0.25
#: Fewer content words than this and we do not have enough to judge at all.
MIN_WORDS_TO_JUDGE = 40


def _content_words(text: str) -> set[str]:
    return {w for w in _WORD.findall(text.lower())
            if len(w) > 2 and w not in _STOPWORDS}


def module_terms(module: Module) -> set[str]:
    """The vocabulary that identifies this module's subject matter."""
    terms = _content_words(module.reference_content)
    terms |= {e.word.lower() for e in module.word_list}
    terms |= _content_words(module.title)
    return terms


def check_transcript_relevance(
    transcript_text: Optional[str],
    module: Module,
) -> RelevanceVerdict:
    """Compare what the student said against what the module is about.

    Returns CANNOT_TELL whenever the evidence is too thin to be fair — no
    transcript, a very short one, or a module with no reference content to
    compare against.
    """
    if not transcript_text:
        return RelevanceVerdict(
            Relevance.CANNOT_TELL, 0.0,
            evidence="No transcript, so the spoken content could not be checked.")

    expected = module_terms(module)
    if not expected:
        return RelevanceVerdict(
            Relevance.CANNOT_TELL, 0.0,
            evidence="The module has no reference content to compare against.")

    said = _content_words(transcript_text)
    matched = expected & said
    overlap = len(matched) / len(expected)

    # Positive evidence needs no minimum length. If the module's own vocabulary
    # is clearly present, the student is on the right passage — a short but
    # correct reading should not be held in limbo. The length floor exists to
    # stop us *accusing* on thin evidence, not to withhold reassurance.
    if overlap >= ON_TOPIC_ABOVE:
        return RelevanceVerdict(
            Relevance.ON_TOPIC, round(overlap, 3), tuple(sorted(matched))[:12],
            evidence=f"{len(matched)} of {len(expected)} module terms were spoken.")

    if len(said) < MIN_WORDS_TO_JUDGE:
        return RelevanceVerdict(
            Relevance.CANNOT_TELL, round(overlap, 3), tuple(sorted(matched))[:12],
            evidence=(f"Only {len(said)} content words — too short to judge fairly. "
                      f"We do not call a submission off-topic on this little evidence."))

    if overlap < OFF_TOPIC_BELOW:
        return RelevanceVerdict(
            Relevance.OFF_TOPIC, round(overlap, 3), tuple(sorted(matched))[:12],
            evidence=(f"Only {len(matched)} of {len(expected)} module terms appear in "
                      f"{len(said)} words of speech. This may be a different passage — "
                      f"a teacher should confirm before the student is told."))

    # In between: real but weak. Not an accusation.
    return RelevanceVerdict(
        Relevance.CANNOT_TELL, round(overlap, 3), tuple(sorted(matched))[:12],
        evidence=(f"Partial match ({len(matched)} of {len(expected)} module terms). "
                  f"Not enough to call it either way."))


def check_note_relevance(
    written_rows: dict[str, str],
    action_points: tuple[str, ...],
    module: Module,
) -> RelevanceVerdict:
    """Compare the handwritten note against the module's answer key.

    Uses the English column and the action points — deliberately not the Hindi,
    which is what Accuracy scores and which carries its own read-confidence
    handling in ``devanagari.py``.
    """
    expected = {w.lower() for w in module.answer_key}
    if not expected:
        return RelevanceVerdict(
            Relevance.CANNOT_TELL, 0.0,
            evidence="The module has no word list to compare against.")

    written = {w.strip().lower() for w in written_rows}
    matched = expected & written
    overlap = len(matched) / len(expected)

    if overlap >= ON_TOPIC_ABOVE:
        return RelevanceVerdict(
            Relevance.ON_TOPIC, round(overlap, 3), tuple(sorted(matched))[:12],
            evidence=f"{len(matched)} of {len(expected)} module words appear on the note.")

    if not written and not action_points:
        return RelevanceVerdict(
            Relevance.CANNOT_TELL, 0.0,
            evidence="Nothing was read from the note.")

    if overlap < OFF_TOPIC_BELOW:
        return RelevanceVerdict(
            Relevance.OFF_TOPIC, round(overlap, 3), tuple(sorted(matched))[:12],
            evidence=(f"Only {len(matched)} of {len(expected)} module words appear. "
                      f"This note may belong to a different module — a teacher should "
                      f"confirm before the student is told."))

    return RelevanceVerdict(
        Relevance.CANNOT_TELL, round(overlap, 3), tuple(sorted(matched))[:12],
        evidence=f"Partial match ({len(matched)} of {len(expected)} module words).")
