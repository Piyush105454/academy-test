"""The agentic evaluator — the model decides, the rules referee.

Version 2 had the model as a *sensor*: it filled in observations and Python
rules did all the deciding. That is why five students got near-identical
feedback — templates cannot do judgement.

This module inverts that. The agent reads the module, decides what evidence it
needs, goes and gets it, reasons about each parameter, and writes the feedback.
The deterministic code stops being the evaluator and becomes the **referee**: it
checks the agent's output is well-formed and safe before it reaches a child, and
computes the arithmetic so ratings are reproducible from the recorded scores.

Built on the OpenAI Agents SDK (``pip install openai-agents``). The SDK is
imported lazily so the rest of the package works without it.

What the agent genuinely decides
--------------------------------
* What "good" means for *this* module, having read its instruction
* Where to look in the video, and whether to look again
* Which Hindi rows need a second read
* Each parameter's score — or that it cannot tell
* What the feedback should say

What it cannot do, whatever it outputs
--------------------------------------
* Turn a missing score into a zero
* Zero a student for being off-topic (it suspends and flags instead)
* Score anything without recording its evidence
* State a conclusion about the child rather than the work

Those are enforced after the fact, in :func:`referee`, because a guarantee that
depends on a prompt is not a guarantee.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .models import (
    ArtifactKind,
    ArtifactResult,
    GradedSubmission,
    Module,
    NotAssessedReason,
    ParameterScore,
    StudentMessage,
    Submission,
)
from .module_check import (
    ModuleVerdict,
    ModuleVerification,
    teacher_note,
    wrong_task_message,
)
from .relevance import Relevance
from .responsible import check_evidence, scan_for_forbidden_inference
from .rubric import Rubric
from .scoring import build_artifact_result, grade_submission

VIDEO_PARAMETERS = ("confidence", "vocabulary", "tone", "hand_gesture", "speed")
NOTE_PARAMETERS = ("completion", "accuracy", "comprehension", "presentation")

#: Parameters that do not depend on *which* module the work answers.
#: How steadily someone speaks, how they pace themselves, and how tidily they
#: write are the same observations whichever passage is in front of them — so
#: when the homework turns out to be filed under the wrong task, these survive
#: and the student still gets useful feedback instead of silence.
#: ``vocabulary`` is not here: it is scored against the module's word list.
#: ``completion``, ``accuracy`` and ``comprehension`` are not here either, for
#: the same reason — they are measured against an answer key.
DELIVERY_PARAMETERS = ("confidence", "tone", "hand_gesture", "speed", "presentation")


# ---------------------------------------------------------------------------
# What the agent must return
# ---------------------------------------------------------------------------

class ParameterJudgement(BaseModel):
    """One parameter, judged.

    ``score`` is None when the agent decided it could not tell. That is a
    first-class answer, not a failure — and ``abstained_because`` must then say
    why, so a teacher can see what evidence was missing.
    """
    parameter: str
    score: Optional[int] = Field(
        default=None, description="1-5, or null if you could not judge it fairly")
    evidence: str = Field(
        description="What you actually observed that led to this. Required.")
    abstained_because: Optional[str] = Field(
        default=None, description="If score is null, why you could not judge it")


class CoverageReport(BaseModel):
    """Did the student actually cover what the module asked for?

    This is checked **before** any parameter is scored, because delivery marks
    for the wrong content are meaningless — a fluent reading of a different
    passage is not good homework.

    ``could_check`` is the safeguard that matters. Without a transcript we
    cannot know what was said, and a student must never lose marks because we
    could not hear them. When it is False, coverage is not scored at all.
    """
    could_check: bool = Field(
        description="False if there is no transcript or nothing readable to compare. "
                    "Never deduct marks when this is False.")
    verdict: Literal["complete", "partial", "substantially_different", "cannot_check"]
    covered_fraction: Optional[float] = Field(
        default=None, description="0.0-1.0 of the module's required content covered")
    missing_from_submission: list[str] = Field(
        default_factory=list,
        description="Module content the student did not cover. Be specific.")
    not_in_module: list[str] = Field(
        default_factory=list,
        description="Content the student included that the module did not ask for. "
                    "Only list this when you are confident you heard or read it "
                    "correctly.")
    evidence: str = Field(description="What you compared, and what you found.")


class SubmissionEvaluation(BaseModel):
    """The agent's complete verdict on one submission."""
    coverage: CoverageReport = Field(
        description="Filled in FIRST, before any parameter is scored.")
    relevance: Literal["on_topic", "off_topic", "cannot_tell"]
    relevance_evidence: str = Field(
        description="What in the content led to this. 'cannot_tell' is correct "
                    "whenever the evidence is thin — never guess.")
    video: list[ParameterJudgement] = Field(default_factory=list)
    note: list[ParameterJudgement] = Field(default_factory=list)
    feedback_en: str = Field(description="2-4 short sentences for the student, English")
    feedback_hi: str = Field(description="The same message in Hindi")
    for_the_teacher: str = Field(
        default="", description="Anything a teacher should know. Not shown to the student.")


# ---------------------------------------------------------------------------
# Instructions
# ---------------------------------------------------------------------------

INSTRUCTIONS = """
You evaluate homework for Wazir Education Society. Students are children learning
English. A video of them reading aloud, and a handwritten note, are graded against a
module they were assigned.

Work in this order. Step 3 comes before step 4 for a reason: delivery marks for the
wrong content are meaningless.

1. Call `get_module` FIRST. Read the instruction, article and word list, and decide what
   good work looks like for THIS task. A module asking for a calm encouraging voice needs
   different attention from a plain read-aloud.
2. Gather the evidence you need. You choose: call `get_video_facts`, `transcribe_video`,
   `look_at_video_frames` at timestamps you pick, `read_note`, `check_hindi_answer`.
   If a first look is inconclusive — hands out of shot, a smudged row — look again
   somewhere else before concluding anything.
3. CHECK COVERAGE BEFORE SCORING ANYTHING. Compare what the student actually said and
   wrote against what the module requires, point by point. Fill in the `coverage` report:
   what they covered, what they left out, and anything they included that the module did
   not ask for. `check_coverage` will do the mechanical comparison for you; you decide
   what it means.
4. Only then judge each parameter — on the merits of what the student actually did.
5. Call `get_student_history` and use it. Do not repeat advice the student has already
   had twice; say the next most useful thing instead.

Video parameters: confidence, vocabulary, tone, hand_gesture, speed.
Note parameters: completion, accuracy, comprehension, presentation.

HOW COVERAGE AFFECTS THE SCORE

It does not. Coverage is **reported, not scored** — a decision taken with Wazir
Education Society on 07 Sep 2026, and it may change once they have seen real runs.

Grade the reading on its merits. A student who read half the passage beautifully read it
beautifully, and `tone`, `speed` and `confidence` should say so. Do not quietly reduce a
parameter because less of the article was covered; that hides the deduction inside a
number nobody can question.

Instead, **say the figure in the feedback**: how much of the article was covered, and
what was left out, in plain words a child can act on. "You read about two thirds of the
article — next time carry on to the end" is worth more than a silently lowered mark, and
the teacher can see the same number and decide.

A student who read something the module did not ask for should be told so plainly, in
the same reported-not-scored way.

But — and this is not negotiable — **only when you actually checked.** If there is no
transcript, set `could_check` to false, `verdict` to "cannot_check", and do not deduct a
single mark for coverage. A student must never lose marks because our transcription
failed. Silence from us is not evidence against them.

Be specific about what is missing. "Did not cover the last two paragraphs about
encouragement and patience" helps a student; "incomplete" does not.

Scale: 1 Needs Support · 2 Emerging · 3 Developing · 4 Proficient · 5 Exemplary.

RULES YOU MUST FOLLOW

Abstain rather than guess. If the framing hid the student's hands, or there is no
transcript, set that parameter's score to null and say why. A student must never receive
a low mark because of how the camera was held or because we could not hear them. An
abstention is a good answer; an invented number is not.

An accent is never an error. Indian and regional accents are not marked down. Judge
whether the student was understandable, not whether they sound like a particular speaker.

Never infer the activity from posture. A student reading with their head down is reading
from the page, not doing the wrong task. Only what they SAY tells you what they are
doing.

Judge the work, never the child. You may not conclude anything about a student's
intelligence, ability, effort, motivation, honesty, emotional state, home circumstances,
caste, religion, gender, or any disability. Not in the feedback, not in your evidence
notes, not for the teacher. These are outside what a homework video can show and outside
what you are entitled to say.

Untidy handwriting must never lower a content score. Legibility belongs to presentation
alone. A minor spelling slip that does not change meaning is not an accuracy failure —
mention it in feedback instead.

Relevance: only answer "off_topic" when you have substantial evidence the student
addressed a different subject entirely. With no transcript, a very short recording, or a
partial match, the answer is "cannot_tell". Being wrongly told their homework was the
wrong homework does real harm to a child, so the bar for that accusation is high. Being
told they are on topic needs no such bar.

Evidence is required. Every score must say what you actually observed. "Seemed
confident" is not evidence; "looked at the camera at 0:12, 0:40 and 1:15, steady voice
throughout" is.

Feedback: two to four short sentences, English then Hindi. One specific strength first,
then one concrete action they can take ("look up after each sentence"), never a vague
judgement ("improve your tone"). Plain words — they are learning English. Never compare
them to another student. Never repeat their scores back at them.
""".strip()


# ---------------------------------------------------------------------------
# Tools — what the agent can go and find out
# ---------------------------------------------------------------------------

def build_tools(
    module_lookup,
    video_path: Optional[str],
    note_path: Optional[str],
    history_lookup,
    frame_dir: str = "/tmp/agent_frames",
):
    """Create the tool set for one submission.

    Bound per submission so the agent cannot reach another student's media. The
    SDK is imported here so this module stays importable without it.
    """
    from agents import function_tool

    @function_tool
    def get_module(module_id: str) -> str:
        """Read the full module: instruction, article, word list and answer key."""
        m: Module = module_lookup(module_id)
        return json.dumps({
            "title": m.title,
            "instruction": m.instruction,
            "article": m.reference_content,
            "word_list": [{"word": e.word, "expected_hindi": e.meaning}
                          for e in m.word_list],
            "eye_contact_expected": m.eye_contact_expected,
        }, ensure_ascii=False)

    @function_tool
    def get_video_facts() -> str:
        """Measured facts about the video: duration, and whether it carries audio.

        Audio present but no transcript means transcription is not configured —
        that is our gap, not a silent student.
        """
        if not video_path:
            return json.dumps({"video_uploaded": False})
        return json.dumps({
            "video_uploaded": True,
            "duration_seconds": _probe(video_path, "format=duration"),
            "has_audio_stream": bool(_probe(video_path, "stream=codec_type", "a")),
        })

    @function_tool
    def transcribe_video() -> str:
        """Transcribe the speech. Returns an error string if unavailable.

        The audio is extracted first. Sending the .mp4 whole overruns the 25 MB
        upload limit on a phone video of any length — a 3-minute WhatsApp clip is
        already 26 MB, of which the speech is under 2 MB.
        """
        if not video_path:
            return "No video was uploaded."
        try:
            audio = _extract_audio(video_path)
            from openai import OpenAI
            with open(audio, "rb") as fh:
                text = OpenAI().audio.transcriptions.create(
                    model="whisper-1", file=fh).text
            return text
        except Exception as exc:                       # noqa: BLE001
            return (f"TRANSCRIPTION UNAVAILABLE ({exc}). Treat speech-dependent "
                    f"parameters as not assessable. Do NOT report the video as silent.")

    @function_tool
    def look_at_video_frames(at_seconds: list[float]) -> str:
        """Look at the video at timestamps you choose. Pick where to look.

        If a first sample is inconclusive — hands out of shot, face turned away —
        call this again at different timestamps before deciding anything.
        """
        if not video_path:
            return "No video was uploaded."
        paths = _extract_frames(video_path, at_seconds, frame_dir)
        if not paths:
            return "Could not extract frames at those timestamps."
        return _describe_images(
            paths,
            "Describe only what is visible: is the person facing the camera, are their "
            "hands in shot and moving, is the framing close or wide. Do not speculate "
            "about how they feel or what kind of student they are.")

    @function_tool
    def read_note() -> str:
        """Read the handwritten note: English words, Hindi meanings, action points."""
        if not note_path:
            return "No handwritten note was uploaded."
        return _describe_images(
            [note_path],
            "Transcribe this handwritten page exactly. List every English word with the "
            "Hindi written beside it, and every numbered action point. Where the writing "
            "is unclear or corrected, say so rather than guessing.")

    @function_tool
    def check_hindi_answer(word: str, written: str, expected: str) -> str:
        """Check a Hindi answer against the key, tolerating legitimate variants.

        Nukta optional, anusvara equals conjunct nasal, a single wrong letter in a
        long word is a slip. Use this rather than judging the script yourself.
        """
        from .devanagari import match_against_key
        r = match_against_key(written, expected)
        return json.dumps({
            "word": word, "similarity": round(r.similarity, 3),
            "counts_as_correct": r.is_match,
            "note": "Variants like ज़/ज and संबंध/सम्बन्ध are treated as correct.",
        }, ensure_ascii=False)

    @function_tool
    def check_coverage(module_id: str, spoken_or_written: str) -> str:
        """Compare what the student produced against what the module requires.

        Call this BEFORE scoring any parameter. It does the mechanical
        comparison — which of the module's sentences and target words appear,
        and how much of the submission is content the module never mentions.
        You decide what the numbers mean.

        Returns 'could_check': false when there is nothing to compare, which
        means coverage must not be scored and no marks may be deducted for it.
        """
        m: Module = module_lookup(module_id)
        if not spoken_or_written or not spoken_or_written.strip():
            return json.dumps({
                "could_check": False,
                "why": "Nothing was transcribed or read, so coverage cannot be "
                       "checked. Do not deduct marks for coverage.",
            })

        from .relevance import _content_words, module_terms

        required = module_terms(m)
        produced = _content_words(spoken_or_written)
        covered = required & produced
        missing = required - produced
        extra = produced - required

        return json.dumps({
            "could_check": True,
            "module_terms_total": len(required),
            "module_terms_covered": len(covered),
            "covered_fraction": round(len(covered) / len(required), 3) if required else None,
            "missing_terms_sample": sorted(missing)[:25],
            "off_module_terms_sample": sorted(extra)[:25],
            "off_module_share": round(len(extra) / max(len(produced), 1), 3),
            "target_words_said": [e.word for e in m.word_list
                                  if e.word.lower() in produced],
            "target_words_missed": [e.word for e in m.word_list
                                    if e.word.lower() not in produced],
            "note": "Common words are excluded. A high off_module_share with a low "
                    "covered_fraction suggests a different passage; judge it yourself.",
        }, ensure_ascii=False)

    @function_tool
    def get_student_history(student_id: str) -> str:
        """This student's own recent scores and the advice they have already had.

        Use it to avoid repeating yourself and to notice genuine improvement.
        Never compare this student to any other.
        """
        return json.dumps(history_lookup(student_id), ensure_ascii=False)

    return [get_module, get_video_facts, transcribe_video, look_at_video_frames,
            read_note, check_hindi_answer, get_student_history]


# ---------------------------------------------------------------------------
# Guardrail — runs inside the SDK, before the output is accepted
# ---------------------------------------------------------------------------

def build_output_guardrail():
    """Block an evaluation that judges the child rather than the work."""
    from agents import GuardrailFunctionOutput, output_guardrail

    @output_guardrail
    async def no_judgement_of_the_child(ctx, agent, output: SubmissionEvaluation):
        texts = [output.feedback_en, output.feedback_hi, output.for_the_teacher,
                 output.relevance_evidence]
        texts += [j.evidence for j in list(output.video) + list(output.note)]
        texts += [j.abstained_because or "" for j in list(output.video) + list(output.note)]

        hits = []
        for text in texts:
            hits += scan_for_forbidden_inference(text)

        return GuardrailFunctionOutput(
            output_info={"violations": [
                {"category": h.category, "phrase": h.phrase} for h in hits]},
            tripwire_triggered=bool(hits),
        )

    return no_judgement_of_the_child


def build_agent(module_lookup, video_path, note_path, history_lookup,
                model: str = "gpt-4o-mini"):
    """Assemble the evaluating agent for one submission."""
    from agents import Agent

    return Agent(
        name="Homework Evaluator",
        instructions=INSTRUCTIONS,
        model=model,
        tools=build_tools(module_lookup, video_path, note_path, history_lookup),
        output_type=SubmissionEvaluation,
        output_guardrails=[build_output_guardrail()],
    )


# ---------------------------------------------------------------------------
# Referee — the agent decided; this checks and computes
# ---------------------------------------------------------------------------

class RefereeRejection(Exception):
    """The agent produced an evaluation that must not reach a student."""


def referee(
    evaluation: SubmissionEvaluation,
    submission: Submission,
    module: Module,
    rubric: Rubric,
    previous_ratings: tuple[float, ...] = (),
    module_check: "ModuleVerification | None" = None,
) -> GradedSubmission:
    """Turn the agent's judgement into a graded submission, safely.

    The agent chose every score. This function does not second-guess those. What
    it does is make the guarantees hold regardless of what the agent returned:
    scores stay in range, abstentions stay abstentions, evidence is present,
    off-topic suspends rather than zeroes, and the arithmetic is ours so two
    people can check it by hand.
    """
    violations = []
    for text in (evaluation.feedback_en, evaluation.feedback_hi,
                 evaluation.for_the_teacher):
        violations += scan_for_forbidden_inference(text)
    if violations:
        raise RefereeRejection(
            f"Evaluation judged the child rather than the work: "
            f"{sorted({v.category for v in violations})}")

    video_scores = _to_scores(evaluation.video, VIDEO_PARAMETERS)
    note_scores = _to_scores(evaluation.note, NOTE_PARAMETERS)

    gaps = check_evidence(video_scores + note_scores)
    if gaps:
        raise RefereeRejection(
            f"Scores without evidence: {[g.parameter for g in gaps]}")

    # Coverage is checked before scoring, and the safeguard is enforced here
    # rather than trusted to the prompt: an agent that reports it could not
    # check coverage may not also report a low coverage fraction, because a
    # student must never lose marks for a transcription we failed to produce.
    coverage = evaluation.coverage
    if not coverage.could_check:
        if coverage.covered_fraction is not None or coverage.missing_from_submission:
            raise RefereeRejection(
                "Coverage was reported as uncheckable but still carries findings. "
                "A student cannot be marked down for content we never heard.")
        if coverage.verdict != "cannot_check":
            raise RefereeRejection(
                f"Coverage could not be checked but verdict is "
                f"'{coverage.verdict}' — that is a judgement without evidence.")

    off_topic = (evaluation.relevance == "off_topic"
                 or coverage.verdict == "substantially_different")

    # An unchecked coverage can never trigger suspension either.
    if off_topic and not coverage.could_check and evaluation.relevance != "off_topic":
        off_topic = False

    # A student who names a different module in the opening line did the wrong
    # *slot*, not the wrong *work*. Coverage cannot tell those apart — from a
    # transcript alone, correct Day 12 homework filed under Day 13 looks exactly
    # like off-module content. So the spoken title overrides the coverage
    # conclusion: scoring is still suspended, but this is not "off topic", and
    # the student must not be told their homework was wrong.
    wrong_slot = bool(module_check is not None and module_check.is_mismatch)
    if wrong_slot:
        off_topic = False

    video = build_artifact_result(ArtifactKind.VIDEO, video_scores) if video_scores \
        else build_artifact_result(ArtifactKind.VIDEO, missing=True)
    note = build_artifact_result(ArtifactKind.NOTE, note_scores) if note_scores \
        else build_artifact_result(ArtifactKind.NOTE, missing=True)

    if wrong_slot:
        # The work may be perfectly good — it is filed under the wrong task. So
        # the content parameters are suspended (they were scored against the
        # wrong answer key) but delivery survives: how the student spoke and
        # how neatly they wrote are true observations whichever module this is.
        video = build_artifact_result(
            ArtifactKind.VIDEO, _delivery_only(video_scores)) \
            if _delivery_only(video_scores) else \
            ArtifactResult(kind=ArtifactKind.VIDEO, scores=video.scores)
        note = build_artifact_result(
            ArtifactKind.NOTE, _delivery_only(note_scores)) \
            if _delivery_only(note_scores) else \
            ArtifactResult(kind=ArtifactKind.NOTE, scores=note.scores)
    elif off_topic:
        # Suspend, never zero. A teacher confirms before the student is told.
        video = ArtifactResult(kind=ArtifactKind.VIDEO, scores=video.scores)
        note = ArtifactResult(kind=ArtifactKind.NOTE, scores=note.scores)

    graded = grade_submission(
        submission.submission_id, submission.student_id, module.module_id,
        video, note, rubric, previous_ratings=previous_ratings)

    graded.feedback = StudentMessage(en=evaluation.feedback_en, hi=evaluation.feedback_hi)
    graded.extras["relevance"] = evaluation.relevance
    graded.extras["relevance_evidence"] = evaluation.relevance_evidence
    graded.extras["for_the_teacher"] = evaluation.for_the_teacher
    graded.extras["decided_by"] = "agent"
    graded.extras["coverage"] = {
        "checked": coverage.could_check,
        "verdict": coverage.verdict,
        "covered_fraction": coverage.covered_fraction,
        "missing": coverage.missing_from_submission,
        "not_in_module": coverage.not_in_module,
        "evidence": coverage.evidence,
    }

    extra_flags: list[str] = []
    if module_check is not None:
        graded.extras["module_check"] = {
            "verdict": module_check.verdict.value,
            "spoken_module_id": module_check.spoken_module_id,
            "spoken_title": module_check.spoken_title,
            "evidence": module_check.evidence,
        }
    if wrong_slot:
        # No overall mark. The delivery ratings are real and are shown, but an
        # overall out of 5 would say "this homework has been graded" directly
        # underneath a message saying it has not — and the number is what a
        # parent reads. Found by rendering the output into the actual UI:
        # a wrong-slot submission was publishing 4.0/5.
        graded.overall_rating = None
        graded.incomplete = True

        # The student is told the truth: the work is fine, the slot is wrong —
        # followed by whatever we could still fairly say about their delivery.
        graded.feedback = wrong_task_message(
            module_check,
            delivery=_delivery_only(video_scores) + _delivery_only(note_scores))
        graded.extras["for_the_teacher"] = teacher_note(module_check)
        graded.extras["delivery_feedback_given_despite_wrong_slot"] = True
        extra_flags.append(
            f"wrong_task_uploaded — the student names "
            f"{module_check.spoken_title!r} in the opening line; move it rather "
            f"than marking it down")
    elif module_check is not None and module_check.verdict is ModuleVerdict.CONFIRMED:
        extra_flags.append("module_confirmed_by_student")
    elif module_check is not None:
        # Saying nothing is not evidence, and carries no penalty.
        extra_flags.append(
            "module_not_stated — no title spoken; not a deduction")
    if off_topic:
        extra_flags.append(
            "may_be_off_topic — scoring suspended, needs a teacher to confirm")
    if coverage.could_check and coverage.verdict == "partial":
        extra_flags.append(
            f"partial_coverage ({coverage.covered_fraction:.0%} of the module covered)"
            if coverage.covered_fraction is not None else "partial_coverage")
    if coverage.could_check and coverage.not_in_module:
        extra_flags.append(
            f"content_not_in_module ({len(coverage.not_in_module)} item(s))")
    if not coverage.could_check:
        extra_flags.append(
            "coverage_not_checked — no transcript, so no coverage marks were deducted")

    # Coverage is reported, never scored — so the figure has to actually reach
    # the student. Instructing the model is not a guarantee; this is.
    if (not wrong_slot and coverage.could_check
            and coverage.covered_fraction is not None
            and coverage.verdict == "partial"
            and "%" not in graded.feedback.en):
        pct = f"{coverage.covered_fraction:.0%}"
        graded.feedback = StudentMessage(
            en=(f"{graded.feedback.en} You covered about {pct} of the article — "
                f"next time, carry on to the end."),
            hi=(f"{graded.feedback.hi} आपने लेख का लगभग {pct} भाग पढ़ा — "
                f"अगली बार पूरा पढ़ें।"))

    if extra_flags:
        graded.flags = graded.flags + tuple(extra_flags)

    return graded


def _delivery_only(scores) -> list[ParameterScore]:
    """The parameters that stay true when the module turns out to be wrong."""
    return [s for s in scores if s.parameter in DELIVERY_PARAMETERS]


def _to_scores(judgements, allowed) -> list[ParameterScore]:
    """Convert the agent's judgements, rejecting anything malformed.

    An out-of-range score becomes an abstention rather than being clamped: if the
    agent returned 7, we do not know what it meant, and inventing a 5 would be
    worse than admitting we have no score.
    """
    out: list[ParameterScore] = []
    for j in judgements:
        if j.parameter not in allowed:
            continue
        if j.score is None:
            out.append(ParameterScore.not_assessed(
                j.parameter, NotAssessedReason.LOW_CONFIDENCE,
                j.abstained_because or j.evidence or "The agent could not judge this."))
            continue
        if not isinstance(j.score, int) or not 1 <= j.score <= 5:
            out.append(ParameterScore.not_assessed(
                j.parameter, NotAssessedReason.LOW_CONFIDENCE,
                f"Agent returned an out-of-range score ({j.score}); treated as "
                f"not assessed rather than guessed at."))
            continue
        out.append(ParameterScore.scored(j.parameter, j.score, j.evidence))
    return out


# ---------------------------------------------------------------------------
# Running one submission
# ---------------------------------------------------------------------------

async def evaluate(
    submission: Submission,
    module: Module,
    rubric: Rubric,
    *,
    video_path: Optional[str] = None,
    note_path: Optional[str] = None,
    module_lookup=None,
    history_lookup=None,
    previous_ratings: tuple[float, ...] = (),
    model: str = "gpt-4o-mini",
) -> GradedSubmission:
    """Evaluate one submission with the agent, then referee the result."""
    from agents import Runner

    module_lookup = module_lookup or (lambda _id: module)
    history_lookup = history_lookup or (lambda _sid: {"submissions": [], "advice_given": []})

    agent = build_agent(module_lookup, video_path, note_path, history_lookup, model)

    prompt = (
        f"Evaluate submission {submission.submission_id} from student "
        f"{submission.student_id}, for module '{submission.module_id}'.\n"
        f"A video was uploaded: {bool(video_path)}. "
        f"A handwritten note was uploaded: {bool(note_path)}.\n"
        f"Start by reading the module."
    )

    result = await Runner.run(agent, prompt)
    return referee(result.final_output, submission, module, rubric, previous_ratings)


# ---------------------------------------------------------------------------
# Media helpers
# ---------------------------------------------------------------------------

def _probe(path: str, entries: str, stream: str = "") -> Any:
    if shutil.which("ffprobe") is None:
        return None
    cmd = ["ffprobe", "-v", "error", "-show_entries", entries, "-of", "json"]
    if stream:
        cmd += ["-select_streams", stream]
    cmd.append(path)
    try:
        data = json.loads(subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=True).stdout)
    except Exception:                                   # noqa: BLE001
        return None
    if "format" in data:
        return float(data["format"].get("duration", 0)) or None
    return data.get("streams") or None


def _extract_audio(video_path: str) -> str:
    """Strip the audio to a small mono file Whisper will accept.

    16 kHz mono MP3 is what speech recognition uses anyway; the video track is
    the whole reason a 3-minute clip breaks the upload limit.
    """
    import subprocess, tempfile, os
    out = os.path.join(tempfile.gettempdir(),
                       os.path.basename(video_path) + ".16k.mp3")
    if not os.path.exists(out):
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-vn",
             "-ac", "1", "-ar", "16000", "-b:a", "64k", out],
            check=True, capture_output=True)
    return out


def _extract_frames(video_path: str, at_seconds, out_dir: str) -> list[str]:
    if shutil.which("ffmpeg") is None:
        return []
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    paths = []
    for i, t in enumerate(at_seconds[:8]):              # a sane ceiling per call
        out = str(Path(out_dir) / f"f_{i}_{int(t)}.jpg")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-ss", str(float(t)), "-i", video_path,
                 "-frames:v", "1", "-vf", "scale=512:-1", out],
                capture_output=True, timeout=60, check=True)
            paths.append(out)
        except Exception:                               # noqa: BLE001
            continue
    return paths


def _describe_images(paths: list[str], task: str) -> str:
    """Ask a vision model what is in these images.

    Deliberately narrow: it reports what is visible and nothing more. The
    judging happens in the main agent, against the module.
    """
    import base64

    try:
        from openai import OpenAI
        content: list[dict] = [{"type": "text", "text": task}]
        for p in paths[:8]:
            b64 = base64.b64encode(Path(p).read_bytes()).decode()
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        return OpenAI().chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": content}],
        ).choices[0].message.content or ""
    except Exception as exc:                            # noqa: BLE001
        return (f"IMAGE READING UNAVAILABLE ({exc}). Treat anything needing sight as "
                f"not assessable rather than guessing.")
