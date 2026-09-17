# Version 2 — Responsible AI & Personalization

*What the agent may never do, what it now checks, and how feedback becomes personal
without becoming a file on a child.*

Version 1 built the scoring core. Version 2 adds four things: a check that the
submission actually answers the module, feedback drawn from the student's own history,
enforceable guardrails, and a bounded profile per student.

Companions: [Homework-Grading-Agent](Homework-Grading-Agent.md) (design) ·
[How-The-Agent-Is-Built](How-The-Agent-Is-Built.md) (code) ·
[Running-The-Agent-Troubleshooting](Running-The-Agent-Troubleshooting.md).

Code: `agent/grading_agent/{relevance,responsible,profile}.py`. 118 tests, up from 83.

---

## 1. Does this submission answer *this* module?

A student can deliver a fluent, well-paced recording of entirely the wrong passage.
Grading delivery without checking content hands them a good score for work that does not
answer the task.

But this is the most dangerous feature in the release, because the failure mode is an
agent telling a child their homework was the wrong homework when it was not. We have
already made a version of that mistake in this project: a video was judged off-task from
**posture alone** — a student reading with their head down was read as writing rather
than speaking. That was wrong, and it shaped how this was built.

**Three rules:**

| Rule | Why |
|---|---|
| **Content only** | Relevance is judged from what was said or written against what the module asks. Never from posture, appearance, background, clothing, or recording length |
| **Three outcomes, not two** | `ON_TOPIC`, `OFF_TOPIC`, `CANNOT_TELL`. With no transcript there is no evidence either way — the answer is `CANNOT_TELL`, never `OFF_TOPIC` by default |
| **Off-topic never scores zero** | It *suspends* scoring and raises a flag. A teacher confirms before a student is told their work did not count |

**The asymmetry that matters.** Confirming a student is on-topic needs no minimum
evidence — if the module's vocabulary is clearly present, say so. Accusing them requires
a substantial sample. This came out of a failing test: the length floor was originally
gating both directions, which left correct short readings in limbo. Reassurance is cheap;
accusation is expensive.

| Situation | Verdict |
|---|---|
| Module's vocabulary clearly present | `ON_TOPIC` — no length minimum |
| No transcript (our speech-to-text gap) | `CANNOT_TELL` |
| Under ~40 content words | `CANNOT_TELL` — too little to accuse on |
| Weak but real overlap | `CANNOT_TELL` — not proof of a different passage |
| Substantial sample, almost no module terms | `OFF_TOPIC` — flagged, scoring suspended, teacher confirms |

---

## 2. Responsible AI guardrails

The design listed fairness rules in prose. Prose does not stop a regression six months
from now, so the checkable ones are now checked in code.

### What the agent may never infer

Eight categories, each with phrases that would betray them in output. Anything the agent
writes — student feedback, score notes — is scanned, and a hit blocks the submission for
review.

| Never inferred | Because |
|---|---|
| Intelligence or ability | Not visible in a homework video, and a label that follows a child |
| Effort, motivation, attitude | "Lazy" is a judgement about a person, not an observation about work |
| Honesty / cheating | An accusation, and never one an automated system should make alone |
| Emotional or mental state | Outside both competence and remit |
| Home or economic circumstances | Guessing at a family from a recording is prejudice with extra steps |
| Caste, religion, ethnicity, gender | Never a legitimate input to a homework grade |
| Disability or medical condition | A clinical judgement the agent has no standing to make |
| Appearance or background | What is behind a child says nothing about their English |

The scanner is deliberately crude — substring matching that errs toward catching too
much, with a human reviewing what it catches. A false flag costs a glance; a missed one
reaches a child.

### Every score must cite its evidence

`check_evidence()` rejects a score with no stated basis. A student asking *"why did I get
a 2?"* deserves an answer, and a teacher overriding a score needs to know what it rested
on. An unexplained number is neither reviewable nor appealable.

### Cohort-level fairness

`fairness_report()` compares outcomes across groups **you supply** — a class, a school, a
language group. The agent never infers group membership; doing so would be exactly the
profiling forbidden above. A mean gap of 0.5 or wider raises a concern, worded as a
prompt to investigate rather than proof of bias. It also reports abstain rates per group,
because a group whose evidence is more often unreadable is being failed differently.

### Audit log and appeals

Every grading is logged — student ID, module, ratings, flags, timestamp — with no names
and no media paths. Without it there is no answering *"why did this student get this
score in March?"* once the model behind the scorer has changed.

`AppealRegister` lets a student or guardian dispute a score and marks the submission
disputed. An automated grade a child cannot argue with is not acceptable, and the route
has to exist from day one rather than be retrofitted after the first complaint.

---

## 3. Personalized feedback

The old feedback picked the weakest parameter from a fixed phrase list, so three
students in five got the identical sentence and a student heard the same advice every
week. Two changes:

**Advice rotates.** If a student has been told about pauses twice running, the next-most
useful thing is said instead. Hearing the same sentence every week is how feedback stops
being read.

**Improvement is named.** When a score beats that student's own recent average, the note
opens *"Better than last time"* rather than *"Good work"*. Against their own history —
never against other students.

---

## 4. Student profiles, and where the line is

This is behavioural data about a child, so the shape of it matters as much as the use.

| Constraint | What it means |
|---|---|
| **Derived, never inferred** | Every field is arithmetic over scores already recorded. Nothing estimates ability, effort or circumstances |
| **Bounded** | Only the last 5 submissions. A rolling picture of current work, not a permanent file |
| **Two observations minimum** | One low score is a bad day, not a characteristic |
| **Not a label** | The vocabulary is "practising X", never "weak at X". The words a system uses about a child leak into how adults talk about them |
| **Erasable** | `forget(store, student_id)` removes a student entirely. A right to erasure that requires an engineer is not a right |
| **Never comparative** | Nothing compares one student to another |

**The honest caveat.** A profile of a child is still a profile of a child, even a
well-behaved one. The constraints above make it defensible for choosing what to say
next; they do not make it appropriate for streaming students, allocating attention, or
any downstream use nobody has reviewed. If it is ever used to decide something *about* a
student rather than what to *say* to them, that is a new decision needing its own
consent basis.

---

## What is enforced versus documented

Being clear about this matters, because a documented rule and an enforced one give very
different assurances.

| Enforced in code, with tests | Documented for the model's prompt |
|---|---|
| Off-topic suspends rather than zeroes | An accent is never an error |
| `CANNOT_TELL` when evidence is thin | Never infer the activity from posture |
| Forbidden-inference scanning | Abstain rather than score low on thin evidence |
| Every score must cite evidence | Minor spelling slips are not accuracy failures |
| Group membership never inferred | |
| Profiles bounded, erasable, non-comparative | |
| Advice rotation and own-history comparison | |

The right column lives in `providers.py`'s docstring so it reaches whatever model
implements the scorers. It cannot be enforced in Python — which is a reason to check it
during calibration, not a reason to assume it holds.

---

## Still outstanding

Version 2 changes none of this:

1. **Consent** remains the blocker. The gate enforces that a record exists; it cannot
   make the record true.
2. **Calibration** has not happened. Only Speed and Completion are real measurements;
   the rest are placeholders or abstentions.
3. **Relevance is untested against real speech**, because there is no speech-to-text
   connected. Its thresholds (10% / 25% / 40 words) are reasoned, not measured, and
   should be tuned against real transcripts before anyone relies on an off-topic flag.
