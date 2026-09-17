#!/usr/bin/env python3
"""Builds Run_Agent_V2.ipynb — the responsible-AI and personalisation features.

Pre-executed so the outputs are saved and the notebook renders on GitHub for
anyone who cannot run Python.
"""
import ast
import io
import json
import os
import sys
import types

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

_display_calls = []


class _FakeMarkdown:
    def __init__(self, text):
        self.text = text

    def _repr_markdown_(self):
        return self.text


_mod = types.ModuleType("IPython.display")
_mod.display = _display_calls.append
_mod.Markdown = _FakeMarkdown
_pkg = types.ModuleType("IPython")
_pkg.display = _mod
_pkg.get_ipython = lambda: None
_pkg.version_info = (8, 0, 0, "")
sys.modules["IPython"] = _pkg
sys.modules["IPython.display"] = _mod

NS = {}
cells = []
count = 0


def _split(t):
    return t.splitlines(keepends=True) or [t]


def add_md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": _split(text.strip("\n"))})


def add_code(source):
    global count
    count += 1
    source = source.strip("\n")
    outputs = []
    _display_calls.clear()
    tree = ast.parse(source)
    body = list(tree.body)
    trailing = body.pop() if body and isinstance(body[-1], ast.Expr) else None
    buf, old = io.StringIO(), sys.stdout
    sys.stdout = buf
    result = None
    try:
        if body:
            exec(compile(ast.Module(body=body, type_ignores=[]), "<cell>", "exec"), NS)
        if trailing is not None:
            result = eval(compile(ast.Expression(body=trailing.value), "<cell>", "eval"), NS)
    finally:
        sys.stdout = old
    if buf.getvalue():
        outputs.append({"output_type": "stream", "name": "stdout",
                        "text": _split(buf.getvalue())})
    if result is not None:
        data = {"text/plain": _split(repr(result))}
        if hasattr(result, "_repr_html_"):
            data["text/html"] = _split(result._repr_html_())
        outputs.append({"output_type": "execute_result", "execution_count": count,
                        "data": data, "metadata": {}})
    cells.append({"cell_type": "code", "execution_count": count, "metadata": {},
                  "outputs": outputs, "source": _split(source)})


# ===========================================================================

add_md("""# Version 2 — Responsible AI & Personalization

Run → **Run All Cells**. No API key, no network, Python 3.9+.

Version 1 graded submissions. Version 2 adds four things, and this notebook demonstrates
each one working — including the cases where the agent deliberately **refuses to
conclude anything**, which is the part that matters most.

| Section | What it shows |
|---|---|
| 1 | Does the submission answer *this* module? |
| 2 | Off-topic suspends scoring — never zeroes a student |
| 3 | Conclusions the agent may never draw |
| 4 | Every score must cite its evidence |
| 5 | Cohort fairness |
| 6 | Audit log and appeals |
| 7 | Profiles and personalised feedback |""")

add_code("""import sys, os
from pathlib import Path

here = Path.cwd()
if not (here / "grading_agent").exists() and (here / "agent" / "grading_agent").exists():
    os.chdir(here / "agent")
sys.path.insert(0, str(Path.cwd()))

from grading_agent import (
    GradingPipeline, Module, NoteEvidence, ParameterScore, Relevance, Rubric,
    RuleBasedNoteScorer, RuleBasedVideoScorer, StudentProfile, Submission,
    VideoEvidence, WordListEntry, ArtifactKind,
    build_artifact_result, build_feedback, build_profile, check_evidence,
    check_note_relevance, check_transcript_relevance, fairness_report,
    grade_submission, scan_for_forbidden_inference,
)
from grading_agent.responsible import Appeal, AppealRegister, AuditLog

try:
    import pandas as pd
    HAVE_PANDAS = True
except ImportError:
    HAVE_PANDAS = False

def table(rows):
    if HAVE_PANDAS:
        return pd.DataFrame(rows)
    for r in rows:
        print("  ".join(f"{k}={v}" for k, v in r.items()))
    return None

rubric = Rubric.load()
module = Module(
    module_id="delegating_tasks",
    title="Delegating Tasks - Time Management",
    instruction="Read the article aloud clearly.",
    reference_content=(
        "Empowering the classroom: the strength of delegating tasks. Delegation lets a "
        "teacher share responsibility, build student confidence, and create an inclusive "
        "classroom where every child is trusted with something that matters. "
        "Accountability and partnership grow when responsibilities are shared fairly."),
    word_list=(
        WordListEntry("Delegation", "कार्य सौंपना"),
        WordListEntry("Responsibilities", "जिम्मेदारियाँ"),
        WordListEntry("Inclusive", "समावेशी"),
        WordListEntry("Accountability", "जवाबदेही"),
        WordListEntry("Partnership", "साझेदारी"),
    ),
)
pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())
print("Loaded. Module:", module.title)""")

add_md("""## 1. Does this submission answer *this* module?

A student can deliver a fluent recording of entirely the wrong passage. But the failure
mode here is severe: an agent telling a child their homework was the wrong homework when
it was not.

So there are **three** outcomes, not two. `CANNOT_TELL` is the default whenever the
evidence is thin — the agent stays silent rather than guessing.""")

add_code("""OFF_TOPIC_TEXT = (
    "photosynthesis is the process by which green plants convert sunlight into chemical "
    "energy using chlorophyll within their leaves and stems, producing glucose and oxygen "
    "from carbon dioxide and water absorbed through roots during daylight hours. Stomata "
    "regulate gaseous exchange while xylem and phloem transport nutrients upward. "
    "Respiration releases stored sugars, and mitochondria generate adenosine triphosphate "
    "powering cellular activity, growth, flowering, pollination and seed dispersal across "
    "tropical rainforests, deserts, wetlands and alpine meadows.")

cases = [
    ("Read the right passage",       module.reference_content),
    ("Read a science passage",       OFF_TOPIC_TEXT),
    ("Said only a few words",        "delegation is good"),
    ("No transcript (our ASR gap)",  None),
]

rows = []
for label, text in cases:
    v = check_transcript_relevance(text, module)
    rows.append({
        "situation": label,
        "verdict": v.status.value,
        "term overlap": f"{v.overlap:.0%}",
        "suspends scoring?": "yes" if v.blocks_scoring else "no",
        "why": v.evidence[:78],
    })
table(rows)""")

add_md("""Two rows are worth pausing on.

**"No transcript"** returns `cannot_tell`, not `off_topic`. Our missing speech-to-text is
our gap, not evidence against the student.

**"Said only a few words"** also returns `cannot_tell` — under the evidence floor, the
agent declines to accuse.

There is a deliberate asymmetry here, and a failing test is what found it. Confirming a
student is **on-topic** needs no minimum length — if the module's vocabulary is clearly
there, say so. Only **accusing** requires a substantial sample. Reassurance is cheap;
accusation is expensive.""")

add_md("""## 2. Off-topic suspends scoring — it never zeroes a student

When the agent does think a submission is off-topic, it does not score it 0 and it does
not tell the student. It withholds the rating and raises a flag for a teacher.""")

add_code("""wrong_note = NoteEvidence(
    rows_expected=3, rows_filled=3,
    written_rows={"Photosynthesis": "प्रकाश", "Chlorophyll": "हरित", "Glucose": "शर्करा"})

right_note = NoteEvidence(
    rows_expected=3, rows_filled=3,
    written_rows={"Delegation": "कार्य सौंपना", "Inclusive": "समावेशी",
                  "Accountability": "जवाबदेही"})

rows = []
for label, note in (("Note from another module", wrong_note), ("Correct note", right_note)):
    g = pipeline.grade(Submission("s", "STU", module.module_id), module, None, note)
    rows.append({
        "submission": label,
        "note rating": "— (suspended)" if g.note.rating is None else g.note.rating,
        "overall": "—" if g.overall_rating is None else g.overall_rating,
        "relevance": g.extras.get("note_relevance"),
        "flags": "; ".join(g.flags)[:60] or "none",
    })
table(rows)""")

add_md("""The off-topic row shows a suspended rating — **not 0**. A student is never told their
work did not count on the agent's word alone.

## 3. Conclusions the agent may never draw

Eight categories. Anything the agent writes is scanned, and a hit blocks the submission
for review before it reaches a student.""")

add_code("""samples = [
    "Good work — you finished the whole task. Next time, pause after each full stop.",
    "This student is a slow learner and needs remedial help.",
    "The child was lazy and did not bother trying.",
    "Probably from a poor family with uneducated parents.",
    "This looks like cheating — copied from a classmate.",
    "Seems like a troubled, anxious child.",
]

rows = []
for text in samples:
    hits = scan_for_forbidden_inference(text)
    rows.append({
        "text the agent produced": text[:58],
        "verdict": "BLOCKED" if hits else "allowed",
        "category": hits[0].category if hits else "—",
    })
table(rows)""")

add_md("""Only the first line passes. It describes *the work* and gives an action; the rest
describe *the child*.

The matching is deliberately crude — it errs toward catching too much, with a human
reviewing what it catches. A false flag costs a glance; a missed one reaches a child.

## 4. Every score must cite its evidence

A student asking *"why did I get a 2?"* deserves an answer, and a teacher overriding a
score needs to know what it rested on. An unexplained number is neither reviewable nor
appealable.""")

add_code("""from grading_agent.models import NotAssessedReason

scores = [
    ParameterScore.scored("speed", 4, "Measured 110 words per minute."),
    ParameterScore.scored("confidence", 2),                       # no evidence!
    ParameterScore.not_assessed("tone", NotAssessedReason.THIN_EVIDENCE),
]

gaps = check_evidence(scores)
for s in scores:
    status = f"{s.value}/5" if s.is_assessed else "not assessed"
    problem = next((g.problem for g in gaps if g.parameter == s.parameter), "ok")
    print(f"  {s.parameter:<12}{status:<15}{problem}")""")

add_md("""## 5. Cohort fairness

Compares outcomes across groups **you supply** — a class, a school, a language group.
The agent never infers group membership; doing so would be exactly the profiling
forbidden in section 3.""")

add_code("""def fake(student_id, value):
    note = build_artifact_result(
        ArtifactKind.NOTE, [ParameterScore.scored("completion", value, "counted")])
    return grade_submission(student_id, student_id, "m",
                            build_artifact_result(ArtifactKind.VIDEO, missing=True),
                            note, rubric)

graded = [fake("A1", 5), fake("A2", 4), fake("B1", 2), fake("B2", 2)]
groups = {"A1": "morning batch", "A2": "morning batch",
          "B1": "evening batch", "B2": "evening batch"}

report = fairness_report(graded, groups)
print("Group means      :", report.group_means)
print("Largest gap      :", report.largest_gap)
print()
print("Concern raised   :", report.concern or "none")""")

add_md("""Note the wording: *"this is a prompt to look, not proof of bias"*. A gap can have many
causes. The report's job is to make the gap visible, not to diagnose it.

## 6. Audit log and appeals

Without a log there is no answering *"why did this student get this score in March?"*
once the model behind the scorer has changed. And an automated grade a child cannot
argue with is not acceptable.""")

add_code("""import json, tempfile
tmp = Path(tempfile.mkdtemp())

audit = AuditLog(tmp / "audit.jsonl")
logged_pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(),
                                  RuleBasedNoteScorer(), audit=audit)
g = logged_pipeline.grade(
    Submission("sub-77", "STU-7", module.module_id), module, None, right_note)

entry = audit.entries()[0]
print("Audit entry:")
for k, v in entry.items():
    print(f"   {k}: {v}")

print()
print("Contains a name or media path?",
      any(x in json.dumps(entry) for x in (".mp4", ".jpg", "name")))

appeals = AppealRegister(tmp / "appeals.json", audit=audit)
appeals.raise_appeal(Appeal("sub-77", "STU-7", "guardian",
                            "The Hindi meanings were marked wrong but they are correct."))
print()
print("Disputed now?", appeals.is_disputed("sub-77"))
print("Open appeals :", len(appeals.open_appeals()))""")

add_md("""## 7. Profiles and personalised feedback

The old feedback picked the weakest parameter from a fixed list, so students got
identical sentences and heard the same advice every week.

A profile fixes that — built **only** from that student's own recorded scores, bounded
to the last 5 submissions, needing two observations before calling anything a pattern.""")

add_code("""def past(param, value, overall, advised=None):
    return {"video": {"scores": []},
            "note": {"scores": [{"parameter": param, "value": value}]},
            "overall_rating": overall,
            "extras": {"advised_on": advised} if advised else {}}

# One low score is a bad day; two is a pattern.
one  = build_profile("STU", [past("accuracy", 2, 2.0)])
two  = build_profile("STU", [past("accuracy", 2, 2.0), past("accuracy", 2, 2.0)])

print("After 1 submission — pattern identified:", one.practising())
print("After 2 submissions — pattern identified:", two.practising())
print()
print("Note the vocabulary: 'practising', never 'weak at'.")""")

add_md("""### Naming improvement against the student's own average""")

add_code("""profile = build_profile("STU", [past("completion", 3, 3.0), past("completion", 3, 3.0)])

note_result = build_artifact_result(
    ArtifactKind.NOTE, [ParameterScore.scored("completion", 5, "All 15 items done.")])
g = grade_submission("s", "STU", "m",
                     build_artifact_result(ArtifactKind.VIDEO, missing=True),
                     note_result, rubric)

generic  = build_feedback(g, rubric)
personal = build_feedback(g, rubric, profile=profile)

print("Without profile :", generic.en)
print()
print("With profile    :", personal.en)
print()
print("Hindi           :", personal.hi)""")

add_md("""### Rotating advice so it does not repeat

If a student has already been told the same thing twice, the next-most-useful advice is
given instead. Hearing the same sentence every week is how feedback stops being read.""")

add_code("""heard_twice = StudentProfile(
    student_id="STU", submissions_seen=3,
    parameter_means={"speed": 3.0}, parameter_counts={"speed": 3},
    recent_advice=("speed", "speed"))

mixed = build_artifact_result(ArtifactKind.NOTE, [
    ParameterScore.scored("speed", 2, "Rushed."),
    ParameterScore.scored("presentation", 3, "Layout could be clearer."),
])
g = grade_submission("s", "STU", "m",
                     build_artifact_result(ArtifactKind.VIDEO, missing=True),
                     mixed, rubric)

print("No profile (weakest wins) :", build_feedback(g, rubric).en)
print()
print("Already advised on speed  :", build_feedback(g, rubric, profile=heard_twice).en)""")

add_md("""## What is enforced, and what is only written down

| Enforced in code, with tests | Written down for the model's prompt |
|---|---|
| Off-topic suspends rather than zeroes | An accent is never an error |
| `cannot_tell` when evidence is thin | Never infer the activity from posture |
| Forbidden-inference scanning | Abstain rather than score low on thin evidence |
| Every score must cite evidence | Minor spelling slips are not accuracy failures |
| Group membership never inferred | |
| Profiles bounded, erasable, non-comparative | |

The right-hand column cannot be enforced in Python. That is a reason to check it during
calibration — not a reason to assume it holds.

## Still outstanding

1. **Consent** is the blocker. The gate enforces that a record exists; it cannot make
   the record true.
2. **Calibration** has not happened. Only Speed and Completion are real measurements.
3. **Relevance is untested against real speech.** Its thresholds are reasoned, not
   measured, and should be tuned against real transcripts before anyone relies on an
   off-topic flag.

One honest caveat on section 7: a profile of a child is still a profile of a child, even
a well-behaved one. The constraints make it defensible for choosing what to *say* to a
student. Using it to decide something *about* them — streaming, allocating attention —
would be a new decision needing its own consent basis.""")

# ===========================================================================

notebook = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

with open("Run_Agent_V2.ipynb", "w", encoding="utf-8") as fh:
    json.dump(notebook, fh, indent=1, ensure_ascii=False)

print(f"Wrote Run_Agent_V2.ipynb ({len(cells)} cells, {count} code cells)")
