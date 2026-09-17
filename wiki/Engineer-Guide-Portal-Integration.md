# Engineer Guide — Integrating the Grading Agent

*What you implement, what you must not change, and what will go wrong.*

You are plugging a grading agent into the Wazir Education Society portal. This page
covers the code: the shape of it, the four things you implement, the guarantees you
inherit, and a risk table for the failures that actually happen.

Companions: [Homework-Grading-Agent](Homework-Grading-Agent.md) (design) ·
[How-The-Agent-Is-Built](How-The-Agent-Is-Built.md) ·
[Version-2-Responsible-AI-And-Personalization](Version-2-Responsible-AI-And-Personalization.md) ·
[Running-The-Agent-Troubleshooting](Running-The-Agent-Troubleshooting.md).

**212 tests, all passing.** Run them before and after any change you make:

```
python -m unittest discover -s tests -t .
```

---

## 1. The one idea

**The model decides the scores. Deterministic code decides what is allowed to reach a
child.** These are separate layers on purpose.

```
tools → agent (LLM) → SubmissionEvaluation → referee() → GradedSubmission → portal
        decides           its judgement       enforces        published
```

The agent is built on the OpenAI Agents SDK. It chooses which tools to call, in what
order, and what the evidence means. The `referee()` function does **not** second-guess
its scores — it makes a fixed set of guarantees hold *whatever the model returns*, which
is the only way they are guarantees rather than hopes about a prompt.

If you find yourself adding rules to the prompt to prevent something, ask whether it
belongs in the referee instead. Prompts drift between model versions; the referee does
not.

---

## 2. What you implement — four seams

All four are `typing.Protocol`, so **you do not import from us or subclass anything**.
Write a class with the right method names and it satisfies the type structurally.

| Protocol | Methods | What it does |
|---|---|---|
| `SubmissionSource` | `pending_submissions()`, `load_module(module_id)` | Pulls submissions and modules from the portal |
| `ResultSink` | `save(graded)` | Writes the grade back to the Student Details row |
| `StudentLifecycle` | `on_student_removed(student_id)` | Called when a student leaves. **Not optional** |
| `Transcriber` *(optional)* | `transcribe(video_path)` | Only if you replace Whisper |

```python
class PortalSource:                      # no base class, no import
    def pending_submissions(self): ...
    def load_module(self, module_id): ...
```

The local JSON implementation in `sample_data/` exists so the pipeline runs offline.
**Delete it once the portal is wired** — a stale local module that silently shadows the
portal is how a class gets graded against last term's word list.

---

## 3. Binding — the part to get right first

`grading_agent/binding.py`. A wrong *score* is recoverable; a wrong *binding* is not.
If Vivek's video is graded beside Khusi's note, both receive plausible feedback about
work they did not do, and nothing in the text reveals it.

```python
from grading_agent.binding import ArtifactRef, bind, BindingError

submission = bind([
    ArtifactRef(submission_id="s-4821", student_id="STU-118",
                module_id="day12_task2_english", kind="video", path=video),
    ArtifactRef(submission_id="s-4821", student_id="STU-118",
                module_id="day12_task2_english", kind="note",  path=note),
])
```

`bind()` raises `BindingError` if the refs disagree on submission, student or module; if
two videos arrive for one submission; if any identifier is blank; or if the module isn't
the one grading was requested for. **Let it raise.** Do not catch and continue — at
~240 bindings a day, a swallowed exception is the failure that never gets noticed.

The identifiers travel *with the file*, from the portal row. Never derive them from a
filename: `WhatsApp Video 2026-08-30 at 7.15.37 AM.mp4` carries no student, no module.

---

## 4. Module verification — wrong slot vs wrong work

`grading_agent/module_check.py`. Students name the module at the start of the video, and
write it across the top of the page. Both are checked.

```python
verification = verify_declared_module(
    expected=ModuleAnchors.from_module(module),   # anchors derived from the title
    catalogue=all_module_anchors,
    spoken_opening=transcript,
    written_header=note_header_text,
)
graded = referee(evaluation, submission, module, rubric,
                 module_check=verification)
```

Three verdicts, and the asymmetry is deliberate:

| Verdict | When | Effect |
|---|---|---|
| `CONFIRMED` | Either channel names this module | Recorded, proceed |
| `MISMATCH` | Neither confirms, one clearly names another module | Content scores dropped, delivery kept, student told to ask the teacher to move it |
| `SILENT` | Nothing named, or the channels disagree | **No effect on the score whatsoever** |

Only the opening 60 words are searched — the article's own text appears later and would
false-match. Single-word anchors are ignored: "English" must never identify a module.

---

## 5. Where a 0 may and may not come from

This is the line the whole design turns on, and it is the one most likely to be broken
by a well-meaning change.

| Situation | Rating | Why |
|---|---|---|
| Nothing uploaded | **0** | A fact about the work. The student did not do it |
| Uploaded, unreadable / silent / corrupt | **no rating, ever** | Our failure, not theirs |
| Off-topic or wrong slot | **suspended** | Not a grade at all |
| A parameter with no evidence | **abstention** | `ParameterScore.scored()` raises on 0 |

`ArtifactResult.was_graded` means "earned a rating from real scores" and is **False** for
a missing artifact even though its rating is `0.0`. `counts_as_zero` is the separate
property. If you conflate them, an unreadable photo becomes a zero.

A missing-artifact 0 is provisional. `reevaluation.needs_reevaluation()` fires when the
missing part arrives, and `mark_supersedes()` keeps both numbers plus the reason.

---

## 6. Coverage is reported, not scored

Decision taken with WES on 07 Sep 2026, revisit after real runs.

The agent grades the reading on its merits. A student who read half the article
beautifully scores 5/5 for pace and tone. The coverage figure goes into the **feedback
text and the teacher flags**, never into a silently reduced number. The referee appends
the sentence itself if the model forgets it — instructing a model is not a guarantee.

---

## 7. Risks and mitigations

Ordered by how badly it ends, not by likelihood.

| # | Risk | How it shows up | Mitigation in code | Still on you |
|---|---|---|---|---|
| 1 | **Wrong student's work graded** | Feedback looks plausible; nobody notices | `bind()` refuses on any disagreement; `Submission` requires portal-supplied IDs | Never catch `BindingError` and continue. Log and alert |
| 2 | **A child is told their correct homework was wrong** | Wrong-slot upload read as off-module | `module_check` overrides coverage; content scores dropped, delivery kept, wording avoids "wrong/incorrect/missing" | Populate `written_header` from the note OCR, not just the transcript |
| 3 | **Our OCR failure becomes the student's 0** | Blurred photo scored 0 instead of "re-upload" | `cannot_evaluate` never produces a rating; `was_graded` vs `counts_as_zero` split | Don't "simplify" those two properties into one |
| 4 | **Abstention silently becomes a low score** | Rating built on 1 of 5 parameters looks normal | `mean_of_assessed` excludes abstentions; out-of-range becomes abstention, never a clamp | Surface abstention counts in the teacher view |
| 5 | **A judgement about the child reaches them** | "seems uninterested", "from a home without books" | `scan_for_forbidden_inference` blocks the submission for review | The scanner is substring-based. **Both examples above passed an earlier version.** Add phrases when you see one get through |
| 6 | **Systematically harsher on one group** | Nobody notices for a term | `fairness_report()` reports mean gaps and abstain rates per supplied group | Run it monthly. Nothing calls it automatically |
| 7 | **Erasure never happens** | Ex-students' data persists | `StudentLifecycle` protocol; `erase_student()` | Wire it to the portal's unenrolment event. `audit_policy` has no default — WES must choose |
| 8 | **Whisper upload fails on normal phone videos** | 25 MB cap; a 3-min WhatsApp clip is 26 MB | `_extract_audio()` strips to 16 kHz mono (25.9 MB → 1.73 MB) | Keep ffmpeg on the box |
| 9 | **Stale local module shadows the portal** | Graded against last term's word list | — | Delete `sample_data/modules/` after wiring |
| 10 | **Model version changes behaviour** | Scores drift; nobody can say when | `AuditLog` records every grading | Pin the model. Re-run calibration after any change |
| 11 | **Consent record exists but isn't true** | Compliance risk, unnoticed | Gate enforces a record exists | The gate cannot make the record true. Process problem |
| 12 | **Thresholds are guesses** | 0.85 Devanagari match, 10%/25%/40-word relevance | Documented as reasoned, not measured | **Calibrate against a teacher before this grades anyone** |

---

## 8. What is enforced vs documented

| Enforced in code, with tests | Documented for the model's prompt |
|---|---|
| Binding refuses on mismatch | An accent is never an error |
| Wrong slot ≠ off-topic | Never infer the activity from posture |
| Missing ≠ unreadable | Abstain rather than score low on thin evidence |
| Abstentions never zeroed or clamped | Minor spelling slips are not accuracy failures |
| Every score cites evidence | Coverage is reported, not scored |
| Forbidden-inference scanning | |
| Coverage figure reaches the student | |
| Group membership never inferred | |
| Profiles bounded, erasable, non-comparative | |

The right column lives in `providers.py`'s docstring so it reaches whatever model
implements the scorers. It cannot be enforced in Python — a reason to check it during
calibration, not a reason to assume it holds.

---

## 9. Still outstanding

1. **Calibration** against a teacher has not happened. Only Speed and Completion are
   real measurements.
2. **No eval harness** for non-deterministic judgement. The 212 tests cover the
   guarantees, not the model's quality.
3. **Consent** remains the blocker.
4. **Relevance thresholds untested against real speech.**
