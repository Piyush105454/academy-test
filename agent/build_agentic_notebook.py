#!/usr/bin/env python3
"""Builds Run_Agentic_Agent.ipynb.

Two kinds of cell here. The referee cells run offline and are pre-executed with
real output. The cells that call the model cannot run in this sandbox (no SDK,
no API key), so they ship without saved output and are marked as such — better
than fabricating a plausible-looking result.
"""
import ast
import io
import json
import os
import sys
import types

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

_mod = types.ModuleType("IPython.display")
_mod.display = lambda o: None
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
    cells.append({"cell_type": "markdown", "metadata": {},
                  "source": _split(text.strip("\n"))})


def add_code(source):
    """A cell that runs here — output captured and saved."""
    global count
    count += 1
    source = source.strip("\n")
    outputs = []
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
        outputs.append({"output_type": "execute_result", "execution_count": count,
                        "data": {"text/plain": _split(repr(result))}, "metadata": {}})
    cells.append({"cell_type": "code", "execution_count": count, "metadata": {},
                  "outputs": outputs, "source": _split(source)})


def add_code_live(source):
    """A cell that needs the model — shipped unexecuted, honestly empty."""
    cells.append({"cell_type": "code", "execution_count": None, "metadata": {},
                  "outputs": [], "source": _split(source.strip("\n"))})


# ===========================================================================

add_md("""# The Agentic Evaluator

The model decides; the rules referee.

In version 2 the model was a **sensor** — it filled in observations and Python did all
the deciding, which is why five students got near-identical feedback. Here the agent
reads the module, chooses what evidence to gather, reasons about each parameter, and
writes the feedback. The deterministic code stops being the evaluator and becomes the
referee.

Built on the [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/).

> **About the saved output.** Sections 3–4 call the model and were *not* run when this
> notebook was built — no API key, and the SDK is not installable in that environment.
> Their cells are deliberately empty rather than showing invented results. Section 5
> runs entirely offline and **is** pre-executed, because that is where the safety
> guarantees live and they are the part worth being able to check without spending a
> token.

## 1. Setup

```bash
pip install openai-agents
```""")

add_code_live("""from agents import Agent, Runner

# Entered by hand so it never lands in the notebook's saved output or in git.
import getpass, os
if not os.environ.get("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = getpass.getpass("OpenAI API key: ")

print("Key set:", bool(os.environ.get("OPENAI_API_KEY")))""")

add_md("""## 2. Sanity check

Confirm the SDK and key work before involving any student data.""")

add_code_live("""probe = Agent(
    name="Probe",
    instructions="Reply in one short sentence.",
)
result = await Runner.run(probe, "Say hello and name the model you are.")
print(result.final_output)""")

add_md("""## 3. The evaluating agent

`grading_agent.agentic` assembles it: the instructions, seven tools, a structured output
type, and an output guardrail.

**The tools are what make it agentic.** The agent is not handed evidence — it goes and
gets what it decides it needs:

| Tool | What the agent uses it for |
|---|---|
| `get_module` | Read the instruction, article and word list, and decide what good means here |
| `check_coverage` | **Called before scoring** — which module content appeared, what was missed, what was extra |
| `get_video_facts` | Duration, and whether the file carries audio at all |
| `transcribe_video` | The speech |
| `look_at_video_frames` | **Timestamps of its own choosing** — and it can look again elsewhere |
| `read_note` | Transcribe the handwritten page |
| `check_hindi_answer` | Match against the key, tolerating legitimate variants |
| `get_student_history` | This student's own past scores and advice already given |

`output_type=SubmissionEvaluation` forces a structured answer where every score carries
its evidence and `score` may be `null` — so **abstaining is expressible**, not a failure
to produce a number.""")

add_code_live("""from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import evaluate, INSTRUCTIONS

module = Module(
    module_id="delegating_tasks",
    title="Delegating Tasks - Time Management",
    instruction="Read the article aloud clearly. Keep steady eye contact.",
    reference_content=(
        "Empowering the classroom: the strength of delegating tasks. Delegation lets a "
        "teacher share responsibility, build student confidence, and create an inclusive "
        "classroom where every child is trusted with something that matters."),
    word_list=(
        WordListEntry("Delegation", "कार्य सौंपना"),
        WordListEntry("Responsibilities", "जिम्मेदारियाँ"),
        WordListEntry("Inclusive", "समावेशी"),
        WordListEntry("Accountability", "जवाबदेही"),
        WordListEntry("Partnership", "साझेदारी"),
    ),
    eye_contact_expected=True,
)

print(INSTRUCTIONS[:700], "...")""")

add_md("""## 4. Run it on a real submission

Point these at media kept **outside** the repository — `local_media/` is gitignored, and
the consent register still applies before anything is opened.""")

add_code_live("""rubric = Rubric.load()

graded = await evaluate(
    Submission("live-1", "STUDENT-L1", module.module_id),
    module,
    rubric,
    video_path="local_media/STUDENT-L1/video.mp4",   # or None
    note_path="local_media/STUDENT-L1/note.jpg",     # or None
)

print(f"Video   {graded.video.rating}")
print(f"Note    {graded.note.rating}")
print(f"Overall {graded.overall_rating}")
print(f"Flags   {graded.flags}")
print()
print(graded.feedback.en)
print()
print(graded.feedback.hi)""")

add_md("""### What each score rested on

Every parameter carries the evidence the agent gave for it. This is what a teacher reads
when overriding, and what a student is owed when they ask why.""")

add_code_live("""for artifact in (graded.video, graded.note):
    print(f"--- {artifact.kind.value} ---")
    for s in artifact.scores:
        mark = f"{s.value}/5" if s.is_assessed else "not assessed"
        print(f"  {s.parameter:<14}{mark:<15}{s.note}")
    print()

print("Relevance:", graded.extras.get("relevance"))
print("Because  :", graded.extras.get("relevance_evidence"))""")

add_md("""## 5. Coverage — checked before anything is scored

Delivery marks for the wrong content are meaningless. A fluent reading of a different
passage is not good homework, and half the passage read beautifully is still half the
passage.

So the agent fills in a `CoverageReport` **before** it scores a single parameter: what
the student covered, what they left out, and anything they included that the module did
not ask for. That feeds the content-dependent scores and is named in the feedback, so a
student learns *what* to fix.

**The safeguard.** Coverage may only cost a student marks when it was actually checked.
No transcript means `could_check=False`, and then nothing is deducted — a child must
never lose marks because our transcription failed. Silence from us is not evidence
against them.

The referee enforces that rather than trusting the prompt: an evaluation claiming it
could not check coverage, while still reporting what was missing, is rejected outright.""")

add_code("""from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import (
    CoverageReport, ParameterJudgement, RefereeRejection, SubmissionEvaluation, referee,
)

rubric = Rubric.load()
module = Module(
    module_id="delegating_tasks", title="Delegating Tasks",
    instruction="Read the article aloud clearly.",
    reference_content="Delegation lets a teacher share responsibility.",
    word_list=(WordListEntry("Delegation", "\u0915\u093e\u0930\u094d\u092f \u0938\u094c\u0902\u092a\u0928\u093e"),),
)
sub = Submission("sub-1", "STU-1", module.module_id)

def cov(**kw):
    base = dict(could_check=True, verdict="complete", covered_fraction=0.95,
                evidence="27 of 29 module terms spoken; nothing off-module.")
    base.update(kw)
    return CoverageReport(**base)

def evaluation(**kw):
    base = dict(
        coverage=cov(),
        relevance="on_topic",
        relevance_evidence="Module vocabulary was spoken throughout.",
        video=[ParameterJudgement(parameter="speed", score=4,
                                  evidence="Steady pace, about 110 words a minute.")],
        note=[ParameterJudgement(parameter="completion", score=5,
                                 evidence="All 15 rows filled in.")],
        feedback_en="Good work \u2014 you finished the whole task. Next time, pause after each full stop.",
        feedback_hi="\u0905\u091a\u094d\u091b\u093e \u0915\u093e\u092e \u2014 \u0906\u092a\u0928\u0947 \u092a\u0942\u0930\u093e \u0915\u093e\u092e \u092a\u0942\u0930\u093e \u0915\u093f\u092f\u093e\u0964",
        for_the_teacher="")
    base.update(kw)
    return SubmissionEvaluation(**base)

print("Referee helpers ready \u2014 everything below runs offline.")""")

add_code("""scenarios = [
    ("Covered it all",
     cov()),
    ("Read only half",
     cov(verdict="partial", covered_fraction=0.45,
         missing_from_submission=["the final two paragraphs on encouragement"],
         evidence="13 of 29 module terms; the passage stops early.")),
    ("Added something not asked for",
     cov(verdict="partial", covered_fraction=0.6,
         not_in_module=["a long story about a cricket match"],
         evidence="Most of the passage, then unrelated content.")),
    ("Read a different passage",
     cov(verdict="substantially_different", covered_fraction=0.02,
         evidence="Almost none of the module's content.")),
    ("We could not hear it",
     cov(could_check=False, verdict="cannot_check", covered_fraction=None,
         evidence="No transcript was available.")),
]

for label, c in scenarios:
    g = referee(evaluation(coverage=c), sub, module, rubric)
    rating = "suspended" if g.video.rating is None else g.video.rating
    print(f"{label:<32} video={str(rating):<10} flags: {'; '.join(g.flags) or 'none'}")""")

add_md("""The last line is the one that matters. When coverage could not be checked, the
scores are untouched and the flag says so explicitly — the student keeps their marks and
the gap is recorded against *us*.

### The contradictions the referee refuses""")

add_code("""bad_cases = [
    ("Claims it could not check, but reports a fraction",
     cov(could_check=False, verdict="cannot_check", covered_fraction=0.3,
         evidence="No transcript, but it felt incomplete.")),
    ("Claims it could not check, but lists what was missing",
     cov(could_check=False, verdict="cannot_check", covered_fraction=None,
         missing_from_submission=["the second half"], evidence="No transcript.")),
    ("Claims it could not check, but is sure it was wrong",
     cov(could_check=False, verdict="substantially_different", covered_fraction=None,
         evidence="Could not hear it, but it sounded wrong.")),
]

for label, c in bad_cases:
    try:
        referee(evaluation(coverage=c), sub, module, rubric)
        print(f"  {label:<52} GOT THROUGH — bad")
    except RefereeRejection as e:
        print(f"  {label:<52} rejected")
        print(f"      {str(e)[:88]}")""")

add_md("""## 6. The referee — what the agent cannot do to a student

**This section runs offline and is pre-executed**, because these are the guarantees and
they should be checkable without an API key.

The agent chooses every score and the referee does not second-guess those. What it does
is hold the guarantees *whatever* the agent returns — which is the only thing that makes
them guarantees rather than hopes about a prompt.""")

add_md("""### Other ways the agent can get it wrong

Each of these is a plausible model failure, and each is caught.""")

add_code("""checks = []

# 1. The agent judges the child rather than the work.
try:
    referee(evaluation(feedback_en="You are a slow learner and should try harder."),
            sub, module, rubric)
    checks.append(("Judgement about the child", "GOT THROUGH — bad"))
except RefereeRejection as e:
    checks.append(("Judgement about the child", f"blocked: {str(e)[:52]}"))

# 2. Hidden in the teacher note, where a student would not see it.
try:
    referee(evaluation(for_the_teacher="Child seems lazy, likely from a poor family."),
            sub, module, rubric)
    checks.append(("Judgement hidden in teacher notes", "GOT THROUGH — bad"))
except RefereeRejection as e:
    checks.append(("Judgement hidden in teacher notes", f"blocked: {str(e)[:52]}"))

# 3. A score with no stated basis — unreviewable, unappealable.
try:
    referee(evaluation(video=[ParameterJudgement(parameter="speed", score=4, evidence="")]),
            sub, module, rubric)
    checks.append(("Score with no evidence", "GOT THROUGH — bad"))
except RefereeRejection as e:
    checks.append(("Score with no evidence", f"blocked: {str(e)[:52]}"))

for label, outcome in checks:
    print(f"  {label:<36}{outcome}")""")

add_md("""### Malformed scores become abstentions, not guesses

If the agent returns a 7, we do not know what it meant. Clamping to 5 would invent a
grade; abstaining admits we have none.""")

add_code("""g = referee(
    evaluation(video=[ParameterJudgement(parameter="speed", score=7, evidence="Very fast.")]),
    sub, module, rubric)
speed = next(s for s in g.video.scores if s.parameter == "speed")
print("Agent returned 7 →", "assessed" if speed.is_assessed else "not assessed")
print("Recorded reason  :", speed.note)
print()

g = referee(
    evaluation(video=[ParameterJudgement(parameter="speed", score=4, evidence="Steady."),
                      ParameterJudgement(parameter="charisma", score=5, evidence="Invented.")]),
    sub, module, rubric)
print("Agent invented a 'charisma' parameter →",
      [s.parameter for s in g.video.scores], "(phantom score dropped)")""")

add_md("""### Abstentions and off-topic keep their meaning""")

add_code("""abstained = evaluation(
    video=[ParameterJudgement(parameter="speed", score=None,
                              evidence="No transcript available.",
                              abstained_because="Speech could not be transcribed.")],
    note=[ParameterJudgement(parameter="completion", score=4, evidence="12 of 15 rows.")])
g = referee(abstained, sub, module, rubric)
print(f"Video abstained  → rating {g.video.rating}   (no score, not a low one)")
print(f"Overall          → {g.overall_rating}   (the note's rating, not halved)")
print(f"Marked incomplete: {g.incomplete}")
print()

off = referee(evaluation(relevance="off_topic",
                         relevance_evidence="Read a passage about photosynthesis."),
              sub, module, rubric)
print(f"Off-topic        → video {off.video.rating}, note {off.note.rating}, "
      f"overall {off.overall_rating}")
print(f"Flag             : {off.flags[0]}")""")

add_md("""## What changed, and what it costs

**What the agent now decides:** what good means for this module, where to look in the
video and whether to look again, which Hindi rows need a second read, each parameter's
score — or that it cannot tell — and what the feedback says.

**What it still cannot do,** whatever it outputs: turn a missing score into a zero, zero
a student for being off-topic, score without recording evidence, or say something about
the child rather than the work.

Two costs worth being straight about:

**Reproducibility is gone.** Two runs on the same video can produce different scores. For
a child's mark that is a real problem, and it makes calibration harder — you are now
measuring a distribution, not a number.

**Unit tests are no longer sufficient.** The 132 tests still cover the referee and the
arithmetic, but they cannot tell you whether the *judgement* got better or worse after a
prompt change. That needs a fixed set of submissions with teacher-assigned scores, run
repeatedly. Building that harness is the next piece of work, and it should come before
this grades anyone.

And unchanged: consent before any file is opened, and calibration against a teacher
before the numbers mean anything.""")

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

with open("Run_Agentic_Agent.ipynb", "w", encoding="utf-8") as fh:
    json.dump(notebook, fh, indent=1, ensure_ascii=False)

live = sum(1 for c in cells if c["cell_type"] == "code" and c["execution_count"] is None)
print(f"Wrote Run_Agentic_Agent.ipynb ({len(cells)} cells, "
      f"{count} pre-executed, {live} needing the model)")
