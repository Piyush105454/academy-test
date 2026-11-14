"""Learning to sound human, from the people who already do.

Every teacher edit is a free label: *this is what the agent wrote, and this is
what a real teacher thought it should have said*. Across a term that is the best
training signal this project will ever get, and it costs nobody any extra work.

What "learning" means here — and what it deliberately does not.

    It DOES     collect what teachers change, find what they change repeatedly,
                and turn that into wording guidance and worked examples that go
                into the agent's prompt.

    It does NOT touch scores, thresholds, or any rubric. A teacher rewording
                "your pace was fast" is telling us about *language*. It is not
                telling us to mark pace differently, and treating it that way
                would let phrasing edits silently move grades.

    It does NOT take effect on its own. Patterns are proposed; a person promotes
                them. An agent that rewrote its own instructions from live data
                would drift somewhere nobody chose, and the first sign would be
                a term's worth of odd feedback.

**The asymmetry that matters.** A teacher's own words are published unfiltered —
they have standing and accountability the agent does not. But a phrase the agent
would be forbidden to write does not become permissible just because a teacher
wrote it once. So teacher text is never censored on the way *out*, and always
screened on the way *in* to anything the agent learns from.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Optional, Sequence

from .responsible import scan_for_forbidden_inference

#: How often a change must recur before it is worth a person's attention. One
#: teacher's habit on one evening is not a house style.
MIN_OCCURRENCES = 3

#: Cap on worked examples put in front of the model. Beyond a handful they stop
#: teaching a style and start teaching a template.
MAX_EXEMPLARS = 5

_SENTENCE = re.compile(r"[^.!?]+[.!?]?")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.findall(text or "") if s.strip()]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


@dataclass
class EditPair:
    """One before/after, as a teacher left it."""
    original: str
    edited: str
    edited_by: str = ""
    reason: str = ""
    language: str = "en"

    @property
    def safe_to_learn_from(self) -> bool:
        """Would the agent be allowed to write the teacher's version?

        A teacher may legitimately write something the agent must never say.
        Publishing it is theirs to decide; copying it is not.
        """
        return not scan_for_forbidden_inference(self.edited)

    def removed_sentences(self) -> list[str]:
        kept = {_norm(s) for s in _sentences(self.edited)}
        return [s for s in _sentences(self.original) if _norm(s) not in kept]

    def added_sentences(self) -> list[str]:
        had = {_norm(s) for s in _sentences(self.original)}
        return [s for s in _sentences(self.edited) if _norm(s) not in had]


@dataclass
class StyleFinding:
    kind: str            # "drop", "add", "shorter", "longer"
    detail: str
    times_seen: int
    examples: tuple[str, ...] = ()

    def as_instruction(self) -> str:
        if self.kind == "drop":
            return (f'Do not write "{self.detail}" — teachers removed it '
                    f'{self.times_seen} times.')
        if self.kind == "add":
            return (f'Teachers added "{self.detail}" {self.times_seen} times; '
                    f"say something in that spirit where it fits.")
        if self.kind == "shorter":
            return (f"Be shorter. Teachers cut the feedback in "
                    f"{self.times_seen} of the edits reviewed.")
        return (f"Say more. Teachers expanded the feedback in "
                f"{self.times_seen} of the edits reviewed.")


@dataclass
class EditCorpus:
    """Teacher edits, gathered over time."""
    pairs: list[EditPair] = field(default_factory=list)
    skipped_unsafe: int = 0

    def add(self, pair: EditPair) -> bool:
        """Returns False when the edit was recorded but will not be learned from."""
        if not pair.original.strip() or not pair.edited.strip():
            return False
        if not pair.safe_to_learn_from:
            self.skipped_unsafe += 1
            return False
        self.pairs.append(pair)
        return True

    def add_from_graded(self, graded, language: str = "en") -> bool:
        edit = graded.extras.get("feedback_edit")
        if not edit or language not in edit.get("languages_changed", []):
            return False
        return self.add(EditPair(
            original=edit[f"original_{language}"],
            edited=edit[f"edited_{language}"],
            edited_by=edit.get("edited_by", ""),
            reason=edit.get("reason", ""),
            language=language))

    # -- what teachers keep doing ----------------------------------------

    def findings(self, min_occurrences: int = MIN_OCCURRENCES) -> list[StyleFinding]:
        if not self.pairs:
            return []

        dropped, added = Counter(), Counter()
        drop_ex: dict[str, str] = {}
        add_ex: dict[str, str] = {}
        shorter = longer = 0

        for p in self.pairs:
            for s in p.removed_sentences():
                dropped[_norm(s)] += 1
                drop_ex.setdefault(_norm(s), s)
            for s in p.added_sentences():
                added[_norm(s)] += 1
                add_ex.setdefault(_norm(s), s)
            o, e = len(p.original.split()), len(p.edited.split())
            if e < o * 0.8:
                shorter += 1
            elif e > o * 1.2:
                longer += 1

        out: list[StyleFinding] = []
        for norm, n in dropped.most_common():
            if n >= min_occurrences:
                out.append(StyleFinding("drop", drop_ex[norm], n))
        for norm, n in added.most_common():
            if n >= min_occurrences:
                out.append(StyleFinding("add", add_ex[norm], n))
        if shorter >= min_occurrences and shorter > longer:
            out.append(StyleFinding("shorter", "", shorter))
        elif longer >= min_occurrences and longer > shorter:
            out.append(StyleFinding("longer", "", longer))
        return out

    def exemplars(self, limit: int = MAX_EXEMPLARS) -> list[EditPair]:
        """The clearest before/after pairs to show the model.

        Prefers substantial rewrites: an edit that changed one word teaches
        less than one where a teacher rewrote the sentence.
        """
        def distance(p: EditPair) -> int:
            a, b = set(_norm(p.original).split()), set(_norm(p.edited).split())
            return len(a ^ b)
        return sorted(self.pairs, key=distance, reverse=True)[:limit]

    # -- what goes to the model ------------------------------------------

    def proposed_guidance(self, min_occurrences: int = MIN_OCCURRENCES) -> str:
        """Prompt text for a person to review. Never applied automatically."""
        findings = self.findings(min_occurrences)
        exemplars = self.exemplars()
        if not findings and not exemplars:
            return ""

        lines = ["HOW TEACHERS HERE WRITE FEEDBACK",
                 "",
                 "Learned from edits real teachers made to this agent's wording.",
                 "This is about language only — it must not change any score.",
                 ""]
        for f in findings:
            lines.append(f"* {f.as_instruction()}")
        if exemplars:
            lines += ["", "Worked examples — the agent's version, then the teacher's:"]
            for p in exemplars:
                lines += [f'  agent:   "{p.original.strip()}"',
                          f'  teacher: "{p.edited.strip()}"', ""]
        return "\n".join(lines).rstrip() + "\n"

    def summary(self) -> str:
        return (f"{len(self.pairs)} edits learned from, "
                f"{self.skipped_unsafe} excluded as unsafe to copy, "
                f"{len(self.findings())} recurring pattern(s)")
