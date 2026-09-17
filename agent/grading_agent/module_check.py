"""Did the student say which homework this is?

Students read the module title at the start of their recording. That single
sentence is better evidence of which task the work answers than any coverage
score, because it is the student *stating* it rather than us inferring it.

The portal already tells us which module the files were uploaded against, so
this is not identification — it is **verification**, and it separates two things
that otherwise look identical from a coverage score alone:

    wrong work    the student read something else            -> a real problem
    wrong slot    the student did Day 12 and uploaded it
                  under Day 13                               -> not their fault

Before this check, the second case looked like off-module content and cost the
student marks for homework they had done correctly.

Three rules, in the same shape as the relevance thresholds:

* Confirming costs nothing and needs no minimum.
* Accusing requires an unambiguous match on *another* module's title.
* Saying nothing is not evidence. A student who begins reading straight away
  loses no marks, and `SILENT` is never a deduction.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Sequence

from .models import Module, StudentMessage

#: How much of the opening to search. The title is read first or not at all;
#: scanning the whole transcript would match the article's own words.
OPENING_WORDS = 60


class ModuleVerdict(str, Enum):
    CONFIRMED = "confirmed"   # the student named this module
    MISMATCH = "mismatch"     # the student named a different module
    SILENT = "silent"         # no module named — no conclusion either way


@dataclass(frozen=True)
class ModuleAnchors:
    """Phrases that identify one module when spoken aloud."""
    module_id: str
    title: str
    anchors: tuple[str, ...] = ()

    @classmethod
    def from_module(cls, module: Module, extra: Sequence[str] = ()) -> "ModuleAnchors":
        """Derive what to listen for from the module title itself.

        Nobody has to maintain a list. "DAY 12 - TASK 2 - Teacher English
        Speaking Training" yields the whole title, "day 12", "task 2", and the
        trailing name — plus the article's own title, which students often read
        instead of the module number.
        """
        derived: list[str] = [module.title]

        for part in re.split(r"[-–—:|]", module.title):
            part = part.strip()
            if len(part.split()) >= 2:
                derived.append(part)

        # "DAY 12", "TASK 2" survive the split as two-word anchors already; the
        # article's opening title line is the other thing students say aloud.
        first_sentence = (module.reference_content or "").split(".")[0].strip()
        if 2 <= len(first_sentence.split()) <= 12:
            derived.append(first_sentence)

        derived.extend(extra)
        return cls(module.module_id, module.title,
                   tuple(dict.fromkeys(a for a in derived if a.strip())))

    def widened(self, observed: Sequence[str]) -> "ModuleAnchors":
        """Add phrasings actually seen in student work.

        Students say "day twelve task two" and write "71-TS" at the top of the
        page. Those are learned from real submissions rather than guessed, so
        this stays empty until there are transcripts and note headers to learn
        from — see `AnchorObservations`.
        """
        return ModuleAnchors(
            self.module_id, self.title,
            tuple(dict.fromkeys([*self.anchors,
                                 *(o for o in observed if len(o.split()) >= 2)])))


@dataclass(frozen=True)
class ModuleVerification:
    verdict: ModuleVerdict
    expected_module_id: str
    expected_title: str = ""
    spoken_module_id: Optional[str] = None
    spoken_title: Optional[str] = None
    matched_anchor: str = ""
    evidence: str = ""

    @property
    def is_mismatch(self) -> bool:
        return self.verdict is ModuleVerdict.MISMATCH


def _normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = text.replace("–", " ").replace("—", " ").replace("-", " ")
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _opening(transcript: str, words: int = OPENING_WORDS) -> str:
    return " ".join(_normalise(transcript).split()[:words])


def _anchors_found(opening: str, anchors: Sequence[str]) -> list[str]:
    """Anchors present in the opening, longest first.

    A one-word anchor is ignored: "english" or "task" appears in half the
    catalogue, and a collision there would accuse the wrong student.
    """
    hits = []
    for raw in anchors:
        a = _normalise(raw)
        if len(a.split()) < 2:
            continue
        if a and a in opening:
            hits.append(a)
    return sorted(hits, key=len, reverse=True)


def verify_spoken_module(
    transcript: str,
    expected: ModuleAnchors,
    catalogue: Sequence[ModuleAnchors] = (),
    *,
    opening_words: int = OPENING_WORDS,
) -> ModuleVerification:
    """Check the opening line against the module the portal says this is."""
    base = dict(expected_module_id=expected.module_id, expected_title=expected.title)

    opening = _opening(transcript, opening_words)
    if not opening:
        return ModuleVerification(
            verdict=ModuleVerdict.SILENT,
            evidence="No transcript, so the opening line could not be checked.",
            **base)

    mine = _anchors_found(opening, expected.anchors)
    if mine:
        # Confirming wins even if another module's title also appears — the
        # student named the right one, and that is what we were asking.
        return ModuleVerification(
            verdict=ModuleVerdict.CONFIRMED,
            spoken_module_id=expected.module_id,
            spoken_title=expected.title,
            matched_anchor=mine[0],
            evidence=f"The opening line names this module ({mine[0]!r}).",
            **base)

    others = [(m, _anchors_found(opening, m.anchors))
              for m in catalogue if m.module_id != expected.module_id]
    named = [(m, hits) for m, hits in others if hits]

    if len(named) == 1:
        other, hits = named[0]
        return ModuleVerification(
            verdict=ModuleVerdict.MISMATCH,
            spoken_module_id=other.module_id,
            spoken_title=other.title,
            matched_anchor=hits[0],
            evidence=(f"The opening line names {other.title!r} ({hits[0]!r}), "
                      f"not {expected.title!r}."),
            **base)

    if len(named) > 1:
        # Two modules matched. Ambiguity is not proof, and accusing a student of
        # the wrong homework on a coin-flip is worse than saying nothing.
        return ModuleVerification(
            verdict=ModuleVerdict.SILENT,
            evidence=("The opening line matched more than one module "
                      f"({', '.join(m.title for m, _ in named)}); too ambiguous "
                      "to conclude anything."),
            **base)

    return ModuleVerification(
        verdict=ModuleVerdict.SILENT,
        evidence="No module title was spoken in the opening line.",
        **base)


def verify_declared_module(
    expected: ModuleAnchors,
    catalogue: Sequence[ModuleAnchors] = (),
    *,
    spoken_opening: str = "",
    written_header: str = "",
) -> ModuleVerification:
    """Check both places a student declares which homework this is.

    Two independent channels, and the notes we have show why both matter: every
    handwritten page in this project carries the module written across the top
    ("71-TS Delegating Tasks — Time Management") whether or not the student ever
    says it aloud. A student may do one, both, or neither.

    Confirming from either channel is enough. A mismatch is only reported when
    no channel confirms and at least one clearly names something else — and if
    the two channels disagree, that is ambiguity, not proof, so it is SILENT and
    goes to a teacher.
    """
    spoken = verify_spoken_module(spoken_opening, expected, catalogue)
    written = verify_spoken_module(written_header, expected, catalogue,
                                   opening_words=40)

    for v, where in ((spoken, "the opening line"), (written, "the top of the page")):
        if v.verdict is ModuleVerdict.CONFIRMED:
            return ModuleVerification(
                verdict=ModuleVerdict.CONFIRMED,
                expected_module_id=expected.module_id,
                expected_title=expected.title,
                spoken_module_id=expected.module_id,
                spoken_title=expected.title,
                matched_anchor=v.matched_anchor,
                evidence=f"The student names this module in {where}.")

    mismatches = [v for v in (spoken, written) if v.is_mismatch]
    if len(mismatches) == 1:
        return mismatches[0]
    if len(mismatches) == 2:
        if mismatches[0].spoken_module_id == mismatches[1].spoken_module_id:
            return mismatches[0]
        return ModuleVerification(
            verdict=ModuleVerdict.SILENT,
            expected_module_id=expected.module_id,
            expected_title=expected.title,
            evidence=("The video and the note name different modules "
                      f"({mismatches[0].spoken_title!r} and "
                      f"{mismatches[1].spoken_title!r}); a teacher should look."))

    return ModuleVerification(
        verdict=ModuleVerdict.SILENT,
        expected_module_id=expected.module_id,
        expected_title=expected.title,
        evidence="No module was named in the video or on the page.")


@dataclass
class AnchorObservations:
    """What students actually say and write, gathered to widen the anchors.

    Deliberately not automatic. Phrasings are collected here and a person
    decides which become anchors — an anchor added by accident is how a correct
    submission gets accused of being the wrong homework.
    """
    by_module: dict = field(default_factory=dict)

    def observe(self, module_id: str, phrase: str) -> None:
        phrase = _normalise(phrase)
        if len(phrase.split()) < 2:
            return
        self.by_module.setdefault(module_id, {})
        self.by_module[module_id][phrase] = \
            self.by_module[module_id].get(phrase, 0) + 1

    def candidates(self, module_id: str, min_seen: int = 3) -> list[str]:
        """Phrasings seen often enough to be worth a person's attention."""
        seen = self.by_module.get(module_id, {})
        return sorted((p for p, n in seen.items() if n >= min_seen),
                      key=lambda p: -seen[p])


# --------------------------------------------------------------------------
# What the student is told
# --------------------------------------------------------------------------

#: How each delivery parameter is named to a child, in both languages.
_DELIVERY_WORDS = {
    "confidence":   ("speaking confidently", "आत्मविश्वास से बोलना"),
    "tone":         ("your tone", "आपका स्वर"),
    "speed":        ("your pace", "आपकी गति"),
    "hand_gesture": ("using your hands", "हाथों का उपयोग"),
    "presentation": ("how neatly you wrote", "आपकी लिखावट की सफाई"),
}


def _delivery_sentence(delivery) -> tuple[str, str]:
    """Name what we could still fairly judge, without a total or a grade."""
    named = [(_DELIVERY_WORDS[s.parameter], s.value)
             for s in delivery or ()
             if s.is_assessed and s.parameter in _DELIVERY_WORDS]
    if not named:
        return "", ""
    en = ", ".join(f"{word[0]} {value}/5" for word, value in named)
    hi = ", ".join(f"{word[1]} {value}/5" for word, value in named)
    return (f" We could still look at how you presented it — {en}.",
            f" फिर भी हमने आपकी प्रस्तुति देखी — {hi}।")


def wrong_task_message(verification: ModuleVerification,
                       delivery=()) -> StudentMessage:
    """Tell the student their work is fine but filed in the wrong place.

    The wording matters. This is not a mistake in the homework, so it must not
    read like one: no total is given, nothing is described as missing or
    incorrect, and the action is administrative.

    ``delivery`` carries the parameters that survive a wrong slot — how they
    spoke, how neatly they wrote. Withholding those would punish the student
    twice for a filing error, so what we can fairly say, we say.
    """
    submitted = verification.spoken_title or "a different task"
    expected = verification.expected_title or "this task"
    d_en, d_hi = _delivery_sentence(delivery)
    return StudentMessage(
        en=(f"This looks like the homework for “{submitted}”, but it was uploaded "
            f"under “{expected}”. Your work has not been marked down — please ask "
            f"your teacher to move it to the right task.{d_en}"),
        hi=(f"यह “{submitted}” का होमवर्क लगता है, लेकिन इसे “{expected}” में अपलोड "
            f"किया गया है। आपके अंक नहीं काटे गए हैं — कृपया अपने शिक्षक से इसे सही "
            f"टास्क में ले जाने के लिए कहें।{d_hi}"),
    )


def teacher_note(verification: ModuleVerification) -> str:
    if not verification.is_mismatch:
        return ""
    return (f"Uploaded under {verification.expected_title!r} but the student "
            f"names {verification.spoken_title!r} in the opening line. Likely the "
            f"wrong slot rather than the wrong homework — move it and re-run "
            f"rather than marking it down.")
