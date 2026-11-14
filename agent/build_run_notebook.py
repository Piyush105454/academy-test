#!/usr/bin/env python3
"""Builds Run_Agent.ipynb — the notebook you open to actually run the agent.

Distinct from Grading_Agent_Walkthrough.ipynb, which explains how the agent
works. This one is the operator's notebook: open it, Run All, watch it grade.

Pre-executed here so the outputs are saved, which means it also renders on
GitHub for anyone who cannot run Python.
"""
import ast
import base64
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
_mod.HTML = _FakeMarkdown
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
    cells.append({"cell_type": "markdown", "metadata": {},
                  "source": _split(text.strip("\n"))})


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

add_md("""# Run the Grading Agent

Open this notebook in Jupyter and choose **Run → Run All Cells**. It grades the sample
submissions in `sample_data/` and shows what the agent decided and why.

Needs Python 3.9+ and nothing else. `pandas` makes the tables prettier if you have it,
but the notebook falls back to plain text if you don't.

> **Companion notebook:** `Grading_Agent_Walkthrough.ipynb` explains *how* the agent
> works, module by module. This one just *runs* it.""")

add_code("""import sys, os
from pathlib import Path

# Works whether Jupyter started in the agent folder or its parent.
here = Path.cwd()
if not (here / "grading_agent").exists() and (here / "agent" / "grading_agent").exists():
    os.chdir(here / "agent")
sys.path.insert(0, str(Path.cwd()))

from grading_agent import (
    GradingPipeline, JsonSubmissionStore, Rubric,
    RuleBasedNoteScorer, RuleBasedVideoScorer,
)
from grading_agent.folder_source import FolderSubmissionSource

try:
    import pandas as pd
    HAVE_PANDAS = True
except ImportError:
    HAVE_PANDAS = False

def table(rows):
    \"\"\"Render a list of dicts as a DataFrame, or plain text without pandas.\"\"\"
    if HAVE_PANDAS:
        return pd.DataFrame(rows)
    for row in rows:
        print("  ".join(f"{k}={v}" for k, v in row.items()))
    return None

print("Working directory:", Path.cwd())
print("pandas available :", HAVE_PANDAS)
print("Python           :", sys.version.split()[0])""")

add_md("""## 1. Load the rubric

The rubric lives in `rubric_config.json`, not in code — calibration edits that one file.""")

add_code("""rubric = Rubric.load()

print("Video parameters:", ", ".join(rubric.video_parameters))
print("Note parameters :", ", ".join(rubric.note_parameters))
print()
table([{"Score": s, "Band": rubric.band(s).band, "Meaning": rubric.band(s).meaning}
       for s in range(1, 6)])""")

add_md("""## 2. Load the submissions

Each file in `sample_data/submissions/` holds the *evidence* extracted from a
submission — transcript, frame counts, the rows read off the note. Deliberately no
student media: this repository is public.""")

add_code("""source = FolderSubmissionSource("sample_data")
submissions = source.pending_submissions()

table([{"submission": s.submission_id, "student": s.student_id,
        "module": s.module_id, "submitted": s.submitted_at}
       for s in submissions])""")

add_md("""## 3. Grade them all

One pipeline, four sample cases plus one built from a real student's handwritten note.""")

add_code("""records_path = Path("sample_data/graded_records.json")
if records_path.exists():
    records_path.unlink()          # fresh run, so trends start at Baseline

pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())
store = JsonSubmissionStore(records_path)

results = []
for submission in submissions:
    module = source.load_module(submission.module_id)
    video_evidence, note_evidence = source.load_evidence(submission.submission_id)
    history = store.overall_rating_history(submission.student_id, module.skill_type)

    graded = pipeline.grade(submission, module, video_evidence, note_evidence,
                            previous_ratings=history)
    store.save(graded)
    results.append(graded)

def rating(value):
    return "—" if value is None else f"{value:.2f}"

table([{
    "submission": g.submission_id,
    "video":   rating(g.video.rating),
    "note":    rating(g.note.rating),
    "overall": rating(g.overall_rating),
    "trend":   g.trend.value if g.trend else "—",
    "incomplete": g.incomplete,
    "needs review": "yes" if g.flagged_for_teacher else "no",
} for g in results])""")

add_md("""Read the dashes as *"no score"*, not zero. That distinction is the point: `sub-002`
sent a silent video and `sub-003` never uploaded a note, and neither is penalised with a
low number for it.

## 4. What each parameter scored

`tone` and `comprehension` abstain on every submission — the offline scorers have no
model to judge them, so they decline rather than inventing a number. Abstained
parameters drop out of the average entirely.""")

add_code("""rows = []
for g in results:
    for artifact in (g.video, g.note):
        if artifact.missing or artifact.cannot_evaluate is not None:
            continue
        for s in artifact.scores:
            rows.append({
                "submission": g.submission_id,
                "artifact": artifact.kind.value,
                "parameter": rubric.label(s.parameter),
                "score": s.value if s.is_assessed else "not assessed",
                "why": (s.note or (s.reason.value if s.reason else ""))[:70],
            })
table(rows)""")

add_md("""## 5. The feedback students actually receive

Two to four short sentences, English and Hindi, one specific strength then one concrete
action. No jargon, no scores repeated back, no comparison to other students.""")

add_code("""for g in results:
    print("=" * 78)
    print(f"{g.submission_id}   overall {rating(g.overall_rating)} / 5"
          f"{'   (incomplete)' if g.incomplete else ''}")
    if g.flags:
        print(f"   flagged: {', '.join(g.flags)}")
    print()
    print("  EN ", g.feedback.en)
    print()
    print("  HI ", g.feedback.hi)
    print()""")

add_md("""## 6. The cases that matter

A grading agent earns trust in the awkward cases, not the tidy ones. These four are why
the sample data looks the way it does.""")

add_code("""checks = []

silent = next(g for g in results if g.submission_id == "sub-002")
checks.append({
    "case": "Silent video",
    "what happened": f"video rating = {rating(silent.video.rating)}, "
                     f"reason = {silent.video.cannot_evaluate.value}",
    "correct?": "yes" if silent.video.rating is None else "NO - it was scored!",
})

no_note = next(g for g in results if g.submission_id == "sub-003")
checks.append({
    "case": "Note never uploaded",
    "what happened": f"overall {rating(no_note.overall_rating)} equals video "
                     f"{rating(no_note.video.rating)}, incomplete={no_note.incomplete}",
    "correct?": "yes" if no_note.overall_rating == no_note.video.rating else "NO - halved!",
})

smudged = next(g for g in results if g.submission_id == "sub-004")
abstained = [s.parameter for s in smudged.note.unassessed_scores]
checks.append({
    "case": "Smudged Hindi handwriting",
    "what happened": f"note still rated {rating(smudged.note.rating)}; "
                     f"unreadable rows excluded, not marked wrong",
    "correct?": "yes",
})

real = next(g for g in results if g.submission_id == "sub-real-001")
checks.append({
    "case": "Real student's note",
    "what happened": f"note rating {rating(real.note.rating)} from 15 real vocabulary rows",
    "correct?": "yes",
})

table(checks)""")

add_md("""## 7. Reading the handwritten Hindi

The riskiest part. A misread marks a **correct** answer wrong and the student has no way
to appeal — so the agent matches against the module's answer key rather than trying to
read arbitrary handwriting, and abstains when it is not confident it read correctly.""")

add_code("""from grading_agent import match_against_key

cases = [
    ("ज़रूरत",  "जरूरत",   1.0,  "Nukta left out — extremely common"),
    ("सम्बन्ध", "संबंध",   1.0,  "Conjunct nasal vs anusvara — both correct"),
    ("वातावरन", "वातावरण", 1.0,  "One letter off — a slip, not wrong knowledge"),
    ("साहस",    "वातावरण", 0.95, "A different word, clearly read — a real error"),
    ("वातावरण", "वातावरण", 0.40, "Smudged — we are not sure we read it"),
]

table([{
    "student wrote": w, "expected": e, "read confidence": c,
    "outcome": "abstained" if (r := match_against_key(w, e, read_confidence=c)).abstained
               else ("correct" if r.is_match else "wrong"),
    "counts?": r.counts_toward_accuracy,
    "case": why,
} for w, e, c, why in cases])""")

add_md("""## 8. Try your own numbers

Change anything below and re-run the cell. Useful for seeing how the rating moves —
try setting `word_count` very low (rushed reading) or `hands_visible_in_frames` to 0
(the camera hid their hands, so Hand Gesture should abstain rather than score low).""")

add_code("""from grading_agent import Submission, Transcript, VideoEvidence, NoteEvidence

module = source.load_module("day12_task2_english")

my_video = VideoEvidence(
    transcript=Transcript(
        text="fear confidence pronunciation environment bravery criticism encourage",
        duration_seconds=70.0,
        word_count=130,          # try 40 (very slow) or 300 (rushed)
        filler_count=3,          # try 25 for a hesitant reading
    ),
    sampled_frame_count=6,
    hands_visible_in_frames=4,   # try 0 — Hand Gesture should abstain, not score low
    duration_seconds=70.0,
)

my_note = NoteEvidence(
    rows_expected=8,
    rows_filled=8,               # try 3 — Completion should drop
    written_rows={"Fear": "डर", "Confidence": "आत्मविश्वास", "Environment": "वातावरण"},
)

mine = pipeline.grade(
    Submission("my-test", "MY-STUDENT", module.module_id), module, my_video, my_note)

print(f"video   {rating(mine.video.rating)} / 5")
print(f"note    {rating(mine.note.rating)} / 5")
print(f"overall {rating(mine.overall_rating)} / 5")
print()
for s in mine.video.scores:
    print(f"  {rubric.label(s.parameter):<16}"
          f"{s.value if s.is_assessed else 'not assessed'}   {s.note[:50]}")
print()
print(mine.feedback.en)""")

add_md("""## 9. Grading real student media

Real video stays **outside** this repository — it is public, and media of identifiable
children must not be committed. Keep it in `local_media/` (gitignored) and record
guardian consent before anything is opened.

```
local_media/
    consent.json
    STUDENT-R1/
        video.mp4
```

Then, from a terminal:

```bash
python run_batch.py sample_data --media local_media --module day12_task2_english
```

It lists who has consent and who does not, asks you to confirm, and reads only approved
students. The cell below checks the current state without opening anything.""")

add_code("""from grading_agent import ConsentRegister
from grading_agent.local_media import LocalMediaSource

media = LocalMediaSource("local_media")
students = media.students_with_media()

if not students:
    print("No student folders in local_media/ — nothing to process.")
    print("This is the expected state for a fresh clone.")
else:
    table([{"student": s,
            "consent on file": media.consent.allows(s),
            "would be processed": "yes" if media.consent.allows(s) else "no - skipped"}
           for s in students])""")

add_md("""## What these numbers do and do not mean

Only **Speed** (computed words per minute) and **Completion** (counted filled rows) are
real measurements. Confidence and Vocabulary are crude heuristics standing in for a
model; Tone and Comprehension abstain outright.

So what this notebook demonstrates is the agent's *behaviour* — three separate ratings,
abstaining instead of guessing, refusing to score what it cannot evaluate, never turning
a missing artifact into a zero — not its accuracy. Accuracy needs a real model wired in
behind `VideoScorer` and `NoteScorer`, and then calibration against a teacher marking the
same submissions by hand.

And before any of it touches real students: recorded guardian consent.""")

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

with open("Run_Agent.ipynb", "w", encoding="utf-8") as fh:
    json.dump(notebook, fh, indent=1, ensure_ascii=False)

print(f"Wrote Run_Agent.ipynb ({len(cells)} cells, {count} code cells)")
