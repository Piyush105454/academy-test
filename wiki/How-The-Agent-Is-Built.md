# How the Grading Agent Is Built

*A module-by-module walkthrough of the code, and the reasoning behind each piece.*

Companion to [Homework-Grading-Agent](Homework-Grading-Agent.md), which describes *what*
we are building. This page describes *how it is built* — written for whoever picks the
code up next: a developer joining the project, a reviewer deciding whether to trust it,
or the person who has to extend it a year from now.

Code lives in `agent/`. No third-party dependencies; tests run with
`python -m unittest discover -s tests`.

## Read this first: the shape of the whole thing

A submission comes in, gets checked to see whether it *can* be graded at all, gets
scored parameter by parameter, those scores become three ratings, and the result turns
into a short bilingual note. Each of those steps is one module, and no module reaches
into another's job.

| Step | Module | What it decides |
|---|---|---|
| 1. Can this be graded? | `providers.py` (pre-flight) | Silent video, blurry note, corrupt file — answered *before* any scoring |
| 2. What does each parameter score? | `providers.py` (scorers) | The five video and four note parameters, or an explicit abstain |
| 3. What are the ratings? | `scoring.py` | Video, note, and the 50/50 overall — plus teacher flags |
| 4. Is the student improving? | `trend.py` | Baseline / Improved / Stable / Needs attention |
| 5. What does the student read? | `feedback.py` | Two to four sentences, English and Hindi |
| Wiring | `pipeline.py` | The only place the stages are connected |

Supporting cast: `models.py` (the vocabulary everything speaks), `rubric_config.json`
(the tunable numbers), `devanagari.py` (reading the handwritten Hindi), `store.py`
(records and history).

## `models.py` — the vocabulary

Every other module speaks the types defined here. The notable choice is that two design
rules are enforced by the *type system* rather than by asking developers to remember
them.

```python
@classmethod
def scored(cls, parameter, value, note=""):
    if not 1 <= value <= 5:
        raise ValueError("A parameter with no evidence is not_assessed, never 0.")
```

`ParameterScore` cannot hold a zero. A parameter that was not assessed is built with
`not_assessed(...)`, which carries a *reason* and no number at all.

This matters because "missing evidence quietly becomes 0" is the single most likely way
this system would start harming students without anyone noticing. Someone writes
`score = data.get("confidence", 0)` eighteen months from now, and a student who was
never assessed on Confidence receives a 1/5. That line now raises an error instead of
shipping.

The same idea shapes `ArtifactResult`, which has three mutually exclusive states —
graded, cannot-evaluate, missing. "A video we could not grade" and "a video that scored
badly" are structurally different things, not the same field holding a different number.

Student-facing messages for each cannot-evaluate reason live here as a fixed table, in
both languages. `PROCESSING_FAILURE` deliberately has **no** student message: that is
our bug, not the student's, and it must never surface to them as a failed submission.

## `rubric_config.json` + `rubric.py` — the knobs

Every tunable number lives in JSON, not in code: the parameter definitions, the 1–5 band
meanings, abstain thresholds, trend deltas, flag triggers. `rubric.py` is a thin reader
over it.

The reason is calibration. When a teacher grades ten submissions by hand and we discover
the agent runs a point harsh on Confidence, the fix should be an edit to one file — not
a code change, a review and a deploy. It also means the rubric stays readable by someone
who does not write Python, which matters for a file that encodes fairness rules.

## `providers.py` — the seams

This module is what keeps the agent from becoming an obstacle when it is plugged into
the main portal.

```python
@runtime_checkable
class VideoScorer(Protocol):
    def score(self, evidence: VideoEvidence, module: Module) -> Sequence[ParameterScore]: ...
```

These are Python `Protocol`s — structural typing. Any class with a matching `score`
method satisfies the interface, with no inheritance and no import of our code. The
portal team can write their own scorer against their own model without depending on this
package's class hierarchy.

Six seams cover everything that touches the outside world:

| Seam | Prototype today | Portal later |
|---|---|---|
| `SubmissionSource` | sample files in a folder | pending submissions from the portal |
| `ResultSink` | `JsonSubmissionStore` | ratings and note written back to the portal |
| `Transcriber` | supplied transcripts | a real ASR service |
| `VideoScorer` | `RuleBasedVideoScorer` | a vision/language model call |
| `NoteScorer` | `RuleBasedNoteScorer` | a vision model plus answer-key matching |
| `FeedbackWriter` | deterministic builder | a model, with the builder as fallback |

The scoring core never opens a file or makes a network call. That is the property worth
protecting in review.

Two other things live in this module.

**Pre-flight checks** (`check_video`, `check_note`) run *before* any scoring. They answer
"can this be graded at all?" separately from "what score does it get?". Keeping those two
questions apart is exactly what makes a silent video produce no rating rather than a bad
one.

**Rule-based scorers**, which are honest stand-ins rather than a claim to accuracy. Speed
is real — computed words per minute from transcript timing. Tone and Comprehension
abstain outright rather than inventing a number, because judging them genuinely needs a
model. Code that says "I don't know" is more useful than code that fabricates a
plausible-looking score.

The fairness rules that cannot be expressed in Python — an accent is never an error,
never infer the activity from posture — sit in the module docstring, because they belong
in the *prompt* of whatever model implements these interfaces. That is where they would
otherwise be lost in handoff.

## `scoring.py` — the arithmetic

Deliberately simple, because a teacher should be able to check it by hand.

```python
def mean_of_assessed(scores):
    values = [s.value for s in scores if s.is_assessed]
    if not values:
        return None
    return round(sum(values) / len(values), 2)
```

That `if s.is_assessed` filter is the entire abstain rule: unassessed parameters leave
the average rather than dragging it down. Returning `None` rather than `0` when nothing
was assessed forces every caller to handle "no rating" explicitly instead of silently
treating it as a bad score.

`combine_overall` handles the partial cases — both artifacts graded gives the 50/50
blend; one graded returns that rating and marks the submission incomplete; neither gives
no rating at all. The forgotten-note case is that middle branch, and it is why a student
who uploads only a video sees their video rating rather than half of it.

`teacher_flags` returns *reasons*, not a boolean. A teacher seeing
`sharp_drop (-1.4 vs recent average)` knows why they are being asked to look, which a red
dot does not tell them.

## `devanagari.py` — the risky part, made tractable

This module avoids open-vocabulary OCR entirely. Because the module ships the expected
Hindi for every row, the question is only "does what we read match this known string?" —
matching against a small candidate set rather than reading arbitrary handwriting.

`normalize()` strips the differences that are not errors: nukta optional (ज़/ज), anusvara
equal to conjunct nasal (संबंध/सम्बन्ध), zero-width joiners and punctuation removed. Then
`similarity()` compares what is left.

The important structure is that `MatchResult` keeps two numbers separate:

* **`read_confidence`** — how sure we are that we read the handwriting correctly. Comes
  from the OCR or vision model. Below threshold, the row abstains.
* **`similarity`** — how close what we read is to the expected answer. Only meaningful
  once we trust the read.

This separation came out of a failing test, and it is worth understanding. A genuinely
wrong answer *also* produces low similarity. An earlier version used one number for both,
which meant either real mistakes silently disappeared from the score, or students were
marked wrong for our failure to read their handwriting. Two fields, two jobs.

## `trend.py` and `feedback.py` — turning numbers into something usable

`trend.py` is small: compare against the mean of the last three submissions, apply the
±0.5 rule, with the floor check running first so a student climbing out of a hole is
still flagged as needing attention rather than congratulated.

`feedback.py` assembles the note in a fixed order — any cannot-evaluate message first
(the student needs to act on it), then one specific strength, then one concrete next
step, then the trend as a plain sentence. It skips the next step entirely when everything
scored 5, because telling a perfect submission to improve is noise. Both languages are
built in parallel from the same lookup tables, so they cannot drift apart. A test asserts
that no parameter names leak into the text.

## `pipeline.py` and `store.py` — wiring and persistence

`pipeline.py` is the only place the stages are connected, and every dependency arrives
through the constructor. That is what lets the same pipeline run offline with rule-based
scorers or in production against real models, with no change to this file. It also falls
back to the deterministic feedback builder if a model writer returns nothing, so a
provider outage never leaves a student holding a score with no explanation.

`store.py` is a JSON file implementing the `ResultSink` seam — deliberately thin, because
swapping in the portal's database should be one class. It stores `student_id` only, no
names, and it is not a place to keep media: indefinite retention of video and frames is a
Critical item in the design's governance section.

## The tests

57 tests, and most of them exist to pin down *fairness* rather than correctness. These
are the ones to keep if the code is ever refactored, because each protects against a
specific way an automated grader harms a student.

| Design rule | Test that enforces it |
|---|---|
| A missing score is never a zero | `ParameterScore.scored(x, 0)` raises |
| A silent video gets no score, not a low one | `test_silent_video_is_not_evaluated_rather_than_scored_low` |
| A forgotten note does not halve the overall | `test_missing_note_does_not_score_as_zero` |
| Hidden hands never lower a rating | `test_hidden_hands_abstain_and_do_not_lower_the_rating` |
| Hindi spelling variants are not errors | `test_nukta_optional`, `test_anusvara_equals_conjunct_nasal` |
| Unreadable handwriting abstains, never marks wrong | `test_unreadable_answer_abstains_rather_than_marking_wrong` |
| A genuinely wrong answer still counts | `test_confidently_read_wrong_answer_is_scoreable` |
| Feedback is bilingual and jargon-free | `test_feedback_is_bilingual`, `test_no_parameter_names_leak_into_feedback` |

## What is real, and what is not

Being precise about this matters more than the code itself, because it determines what
the numbers currently mean.

| Genuinely implemented | Placeholder until a model is wired in |
|---|---|
| All rating arithmetic, abstain handling, partial submissions | Confidence, Vocabulary (crude heuristics) |
| Cannot-evaluate detection and bilingual messaging | Tone, Comprehension (abstain — no number invented) |
| Devanagari answer-key matching and its tolerances | Presentation (legibility proxy only) |
| Trend labels and teacher flags | |
| Speed — computed words per minute | |
| Completion — counted filled rows, independent of OCR | |

One real consequence of the abstain rule worth knowing before calibration: because an
abstained parameter leaves the average, a submission with hidden hands can score
*slightly higher* than the same submission with hands visible. That is the design erring
in the student's favour, which is the intended direction — but it is an effect, not an
accident, and it should be examined when the numbers are calibrated against a teacher.

## Two things code cannot solve

1. **Consent.** Recording and processing children's video needs recorded parent or
   guardian consent first. This is the blocker, not a task.
2. **Calibration.** A teacher grades roughly ten submissions by hand, we compare per
   parameter, and we agree what level of disagreement is acceptable. Until that happens,
   the ratings are untested output — the architecture is sound, the numbers are not yet
   evidence.
