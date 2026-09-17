#!/usr/bin/env python3
"""Builds Grading_Agent_Walkthrough.ipynb with real, captured outputs.

The notebook is a demonstration layer over the package — it imports
``grading_agent`` and shows it working, rather than containing any logic of its
own. That split is deliberate: logic lives in .py modules so it can be tested,
reviewed in a diff, and imported by the portal later; the notebook exists to
make the behaviour visible to a reader.

Built by hand rather than with nbformat because this sandbox has no package
index access. Each cell is executed here and its real output embedded.
"""
import ast
import io
import json
import os
import sys
import types

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

# --- IPython.display shim so display()/Markdown work outside Jupyter --------
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


def _split(text):
    return text.splitlines(keepends=True) or [text]


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
    for obj in _display_calls:
        outputs.append({"output_type": "display_data",
                        "data": {"text/markdown": _split(obj._repr_markdown_()),
                                 "text/plain": _split(obj.text)}, "metadata": {}})
    if result is not None:
        data = {"text/plain": _split(repr(result))}
        if hasattr(result, "_repr_html_"):
            data["text/html"] = _split(result._repr_html_())
        outputs.append({"output_type": "execute_result", "execution_count": count,
                        "data": data, "metadata": {}})

    cells.append({"cell_type": "code", "execution_count": count, "metadata": {},
                  "outputs": outputs, "source": _split(source)})


# ===========================================================================

add_md("""# Homework Grading Agent — walkthrough

A runnable tour of the grading agent for **Wazir Education Society**, built to the
design in `wiki/Homework-Grading-Agent.md`.

This notebook contains **no grading logic**. It imports the `grading_agent` package
and shows it working. All the logic lives in `.py` modules so it can be unit-tested,
reviewed in a diff, and imported by the portal later — a notebook is a poor home for
code that has to run in production, but a good way to see what that code does.

What follows deliberately spends most of its time on the *awkward* cases — a silent
video, a hidden pair of hands, a smudged Hindi word — because those are where a
grading agent does harm to a student if it gets them wrong.""")

add_code("""from grading_agent import (
    GradingPipeline, Rubric, Module, Submission, WordListEntry,
    RuleBasedVideoScorer, RuleBasedNoteScorer,
    VideoEvidence, NoteEvidence, Transcript,
)

rubric = Rubric.load()
pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())
print("Rubric loaded.")
print("Video parameters:", ", ".join(rubric.video_parameters))
print("Note parameters :", ", ".join(rubric.note_parameters))""")

add_md("""## The 1–5 scale

Every parameter uses the same five bands. Without shared definitions, two graders —
or the agent on two different days — will not land on the same number.""")

add_code("""import pandas as pd

pd.DataFrame([
    {"Score": s, "Band": rubric.band(s).band, "Meaning": rubric.band(s).meaning}
    for s in range(1, 6)
]).set_index("Score")""")

add_md("""## The module being graded against

A module is authored once and reused across students. Three fields do the work:
`instruction` is what the video is judged *against*, `word_list` doubles as the
**answer key** for the handwritten note, and `eye_contact_expected` decides whether
looking down at the page is scored at all.""")

add_code("""module = Module(
    module_id="day12_task2_english",
    title="Day 12 - Task 2: Teacher English Speaking Training",
    instruction=("Use a calm but encouraging voice. Pause after important points. "
                 "Smile gently. Keep steady eye contact."),
    word_list=(
        WordListEntry("Environment", "वातावरण"),
        WordListEntry("Bravery", "साहस"),
        WordListEntry("Judgment", "निर्णय"),
        WordListEntry("Criticism", "आलोचना"),
    ),
    eye_contact_expected=True,
)

print(module.title)
print("Answer key the agent will mark the note against:")
for word, meaning in module.answer_key.items():
    print(f"   {word:<12} -> {meaning}")""")

add_md("""## A normal submission

One student, one video, one note. The agent produces **three ratings** — video, note,
and an overall that is their 50/50 average — plus one bilingual feedback note.""")

add_code("""submission = Submission("sub-001", "student-A", module.module_id)

video = VideoEvidence(
    transcript=Transcript(
        text="environment bravery judgment criticism and the rest of the passage",
        duration_seconds=62.0, word_count=115, filler_count=2),
    sampled_frame_count=6, hands_visible_in_frames=4, duration_seconds=62.0)

note = NoteEvidence(
    rows_expected=4, rows_filled=4,
    written_rows={"Environment": "वातावरण", "Bravery": "साहस",
                  "Judgment": "निर्णय", "Criticism": "आलोचना"})

graded = pipeline.grade(submission, module, video, note)

print(f"Video rating   : {graded.video.rating} / 5")
print(f"Note rating    : {graded.note.rating} / 5")
print(f"Overall rating : {graded.overall_rating} / 5   (trend: {graded.trend.value})")
print(f"Incomplete     : {graded.incomplete}")
print(f"Flagged        : {graded.flagged_for_teacher}")""")

add_md("""### What each parameter scored — and what abstained

Note `tone` and `comprehension`: the offline scorer has no model to judge them, so it
**abstains** rather than inventing a number. Abstained parameters drop out of the
average entirely; they are never counted as zero.""")

add_code("""rows = []
for artifact in (graded.video, graded.note):
    for s in artifact.scores:
        rows.append({
            "Artifact": artifact.kind.value,
            "Parameter": rubric.label(s.parameter),
            "Score": s.value if s.is_assessed else "not assessed",
            "Why": s.note or (s.reason.value if s.reason else ""),
        })
pd.DataFrame(rows)""")

add_md("""### The feedback the student actually reads

Bilingual, two to four short sentences, one specific strength then one concrete
action. No jargon, no parameter names, no scores repeated back.""")

add_code("""print(graded.feedback.en)
print()
print(graded.feedback.hi)""")

add_md("""## The cases that matter: when evidence is missing

This is where a grading agent either treats students fairly or quietly punishes them
for things that are not their performance.

### A silent video

The student uploaded a video with no sound. The wrong answer is 1/5. The right answer
is no score at all, plus a clear reason and a request to upload it again.""")

add_code("""silent = VideoEvidence(transcript=None, duration_seconds=48.0)
result = pipeline.grade(submission, module, silent, note)

print("Video rating :", result.video.rating, " <- no score, not a low score")
print("Reason       :", result.video.cannot_evaluate.value)
print("Overall      :", result.overall_rating, "(from the note alone)")
print("Incomplete   :", result.incomplete)
print()
print("What the student is told:")
print(" ", result.video.student_message.en)
print(" ", result.video.student_message.hi)""")

add_md("""### Hands hidden by the framing

The camera was held too close to show the student's hands. That is a property of the
recording, not of the student — so Hand Gesture abstains, and the video rating is
**not** dragged down.""")

add_code("""from grading_agent import mean_of_assessed

common = dict(transcript=Transcript("environment bravery judgment criticism words",
                                    62.0, 115, 2), duration_seconds=62.0)
visible = VideoEvidence(sampled_frame_count=6, hands_visible_in_frames=6, **common)
hidden  = VideoEvidence(sampled_frame_count=6, hands_visible_in_frames=0, **common)

scorer = RuleBasedVideoScorer()
v_rating = mean_of_assessed(scorer.score(visible, module))
h_rating = mean_of_assessed(scorer.score(hidden, module))

print(f"Hands visible in frames : {v_rating} / 5")
print(f"Hands hidden by framing : {h_rating} / 5")
print()
print("The student is not penalised for how the camera was held.")""")

add_md("""### A forgotten note

Only the video was uploaded. The missing half is **not** scored as zero — the overall
becomes the video rating, and the submission is marked incomplete.""")

add_code("""only_video = pipeline.grade(submission, module, video, None)

print(f"Video rating   : {only_video.video.rating} / 5")
print(f"Note           : missing = {only_video.note.missing}")
print(f"Overall rating : {only_video.overall_rating} / 5  <- the video rating, not halved")
print(f"Incomplete     : {only_video.incomplete}")""")

add_md("""## Reading the handwritten Hindi

The riskiest part of note scoring. If the agent misreads a student's Devanagari, it
marks a **correct** answer wrong — and the student has no way to appeal.

The fix that changes the difficulty class: don't do open-vocabulary OCR at all. The
module already ships the expected Hindi for every row, so the question is only
*"does this match the expected string?"* — matching against a known candidate set,
not reading arbitrary handwriting.""")

add_code("""from grading_agent import match_against_key

checks = [
    ("ज़रूरत",   "जरूरत",   1.0,  "Nukta omitted — students do this constantly"),
    ("सम्बन्ध",  "संबंध",   1.0,  "Conjunct nasal vs anusvara — both correct Hindi"),
    ("वातावरन",  "वातावरण", 1.0,  "One wrong letter — a slip, not wrong knowledge"),
    ("साहस",     "वातावरण", 0.95, "A different word, clearly read — a real error"),
    ("वातावरण",  "वातावरण", 0.40, "Smudged: we are not sure we read it correctly"),
]

rows = []
for written, expected, confidence, why in checks:
    r = match_against_key(written, expected, read_confidence=confidence)
    rows.append({
        "Student wrote": written, "Expected": expected,
        "Read confidence": confidence,
        "Outcome": "abstained" if r.abstained else ("correct" if r.is_match else "wrong"),
        "Counts toward score": r.counts_toward_accuracy,
        "Why": why,
    })
pd.DataFrame(rows)""")

add_md("""Two different numbers are doing two different jobs there, and keeping them apart
is the whole point:

* **Read confidence** — how sure we are we read the handwriting. Low means abstain.
* **Similarity** — how close what we read is to the answer. Only meaningful once we
  trust the read.

Merging them would mean a genuinely wrong answer (low similarity) looks the same as
handwriting we failed to parse — so either real mistakes vanish from the score, or
students get marked wrong for our reading failure.""")

add_md("""## Trend — is this student improving?

Compared only against the student's own history for the same skill. Never against
other students.""")

add_code("""from grading_agent import compute_trend

history_cases = [
    ([],                  3.5, "First ever submission"),
    ([3.0, 3.5, 3.4],     4.2, "Clearly up on recent work"),
    ([3.3, 3.5, 3.4],     3.4, "Holding steady"),
    ([4.2, 4.0, 4.4],     3.0, "Dropped against their own average"),
    ([1.0, 1.2, 1.1],     2.4, "Improving, but still below the floor"),
]

pd.DataFrame([
    {"Recent ratings": history or "none", "This submission": current,
     "Trend": compute_trend(current, history, rubric).value, "Situation": why}
    for history, current, why in history_cases
])""")

add_md("""The last row is the one worth pausing on. That student is improving, but is still
under 2.5/5 — so they are labelled **Needs attention** rather than **Improved**. A
student climbing out of a hole still needs a teacher.""")

add_md("""## Flagging for a teacher's attention

At 210–240 submissions per teacher per day, no one reviews every grading. Flags route
attention to the few that need it — they do **not** gate publication. Keeping the flag
rate near 10% is what preserves the triage value; flag half of them and the original
problem is back.""")

add_code("""examples = {
    "Clean submission": pipeline.grade(submission, module, video, note),
    "Silent video": pipeline.grade(submission, module, silent, note),
    "Note only": pipeline.grade(submission, module, None, note),
}

for name, g in examples.items():
    flags = ", ".join(g.flags) if g.flags else "— none —"
    print(f"{name:<20} overall={str(g.overall_rating):<5} flags: {flags}")""")

add_md("""## Plugging this into the portal

Nothing in the scoring core reads a file, calls an API, or knows where a submission
came from. Those are interfaces in `providers.py`, so integration means writing one
small class per seam and changing no scoring logic:

| Seam | Prototype today | Portal later |
|---|---|---|
| `SubmissionSource` | sample files in a folder | read pending submissions from the portal |
| `ResultSink` | `JsonSubmissionStore` | write ratings and the note back to the portal |
| `Transcriber` | supplied transcripts | a real ASR service |
| `VideoScorer` | `RuleBasedVideoScorer` | a vision/language model call |
| `NoteScorer` | `RuleBasedNoteScorer` | a vision model + the same answer-key matching |
| `FeedbackWriter` | deterministic builder | a model, with the deterministic version as fallback |

The rule-based scorers are honest stand-ins, not a claim to accuracy. Only **Speed**
(computed words per minute) and **Completion** (counting filled rows) are real
measurements; the rest are placeholders until a model is wired in — and, per the
design, nothing here should grade real students until it has been calibrated against
a teacher marking the same submissions by hand.""")

add_code("""store_path = "sample_data/demo_records.json"
from grading_agent import JsonSubmissionStore

store = JsonSubmissionStore(store_path)
store.save(graded)
print(f"Saved to {store_path}")
print("History for this student:", store.overall_rating_history("student-A"))""")

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

with open("Grading_Agent_Walkthrough.ipynb", "w", encoding="utf-8") as fh:
    json.dump(notebook, fh, indent=1, ensure_ascii=False)

print(f"Wrote Grading_Agent_Walkthrough.ipynb ({len(cells)} cells, {count} code cells)")
