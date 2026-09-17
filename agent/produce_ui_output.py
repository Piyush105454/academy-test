"""Produce REAL agent output for five scenarios and render it in the portal UI.

What is real here: every rating, flag, bilingual sentence and teacher note below is
computed by running the actual referee() and scoring code. Nothing is typed by hand.

What is NOT real: the per-parameter scores fed IN. No model has been called — there is
no API key — so each scenario supplies a fixed SubmissionEvaluation, exactly as the
tests do. Think of it as "if the model judged it this way, here is precisely what the
student and teacher would see."
"""
import json
import sys

sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from grading_agent import Module, Rubric, Submission, WordListEntry
from grading_agent.agentic import (
    CoverageReport, ParameterJudgement, SubmissionEvaluation, referee)
from grading_agent.models import ArtifactKind, CannotEvaluateReason, ParameterScore
from grading_agent.module_check import (
    ModuleAnchors, verify_declared_module)
from grading_agent.scoring import build_artifact_result, grade_submission

RUBRIC = Rubric.load()
d = json.load(open("sample_data/modules/day12_task2_english.json", encoding="utf-8"))
MODULE = Module(
    module_id=d["module_id"], title=d["title"], instruction=d["instruction"],
    reference_content=d["reference_content"],
    word_list=tuple(WordListEntry(e["word"], e["meaning"]) for e in d["word_list"]),
    eye_contact_expected=d["eye_contact_expected"])

DAY12 = ModuleAnchors.from_module(MODULE, d.get("_spoken_title_anchors", []))
DAY13 = ModuleAnchors("day13_task1_english", "DAY 13 - TASK 1 - Classroom Questions",
                      ("day 13", "task 1", "classroom questions"))
CATALOGUE = (DAY12, DAY13)


def ev(**kw):
    base = dict(
        coverage=CoverageReport(could_check=True, verdict="complete",
                                covered_fraction=0.94, evidence="Nearly all spoken."),
        relevance="on_topic", relevance_evidence="Module vocabulary throughout.",
        video=[], note=[], feedback_en="", feedback_hi="", for_the_teacher="")
    base.update(kw)
    return SubmissionEvaluation(**base)


def vj(p, s, e, **kw):
    return ParameterJudgement(parameter=p, score=s, evidence=e, **kw)


RESULTS = []


def record(name, student_id, scenario, graded, note, edit=None, overrides=()):
    if edit:
        from grading_agent.teacher_edit import edit_feedback
        graded = edit_feedback(graded, **edit)
    for o in overrides:
        from grading_agent.teacher_edit import override_score
        graded = override_score(graded, **o)
    fe = graded.extras.get("feedback_edit")
    RESULTS.append({
        "edited_by": (fe or {}).get("edited_by", ""),
        "agent_en": (fe or {}).get("original_en", ""),
        "agent_hi": (fe or {}).get("original_hi", ""),
        "student": name, "student_id": student_id, "scenario": scenario,
        "explanation": note,
        "video_rating": graded.video.rating, "note_rating": graded.note.rating,
        "overall": graded.overall_rating, "incomplete": graded.incomplete,
        "flags": list(graded.flags),
        "feedback_en": graded.feedback.en if graded.feedback else "",
        "feedback_hi": graded.feedback.hi if graded.feedback else "",
        "for_the_teacher": graded.extras.get("for_the_teacher", ""),
        "overrides": graded.extras.get("score_overrides", []),
        "video_scores": [{"p": s.parameter, "v": s.value, "why": s.note,
                          "assessed": s.is_assessed} for s in graded.video.scores],
        "note_scores": [{"p": s.parameter, "v": s.value, "why": s.note,
                         "assessed": s.is_assessed} for s in graded.note.scores],
        "video_message": (graded.video.student_message.en
                          if graded.video.student_message else ""),
        "note_message": (graded.note.student_message.en
                         if graded.note.student_message else ""),
    })


# 1 — the ordinary good submission -------------------------------------------
SUB1 = Submission("s-4821", "STU-118", MODULE.module_id, "/v.mp4", "/n.jpg")
record("Vivek varman", "STU-118", "Everything in order",
       referee(ev(
           video=[vj("confidence", 4, "Spoke steadily; only two long pauses."),
                  vj("vocabulary", 4, "9 of the 11 target words pronounced clearly."),
                  vj("tone", 5, "Calm and encouraging, as the module asks."),
                  vj("hand_gesture", 3, "Hands visible but mostly still."),
                  vj("speed", 4, "About 108 words a minute; steady.")],
           note=[vj("completion", 5, "All 11 rows filled in."),
                 vj("accuracy", 4, "10 of 11 Hindi meanings match the key."),
                 vj("comprehension", 4, "Action points restated in own words."),
                 vj("presentation", 4, "Neat, ruled columns, one correction.")],
           feedback_en="Good work — you read the whole article clearly and your tone was "
                       "calm and encouraging. Next time, look up at the camera between "
                       "paragraphs so it feels like you are speaking to the class.",
           feedback_hi="अच्छा काम — आपने पूरा लेख स्पष्ट पढ़ा और आपका स्वर शांत और "
                       "प्रोत्साहित करने वाला था। अगली बार पैराग्राफ़ के बीच कैमरे की ओर "
                       "देखें।"),
           SUB1, MODULE, RUBRIC,
           module_check=verify_declared_module(
               DAY12, CATALOGUE,
               spoken_opening="Day 12 Task 2, Teacher English Speaking Training. "
                              "Fear of speaking English is common among students.")),
       "Teacher rewrote the feedback. The agent's wording is kept beside it, and "
       "the pair becomes a worked example the agent learns its style from.",
       edit=dict(edited_by="Mrs Sharma",
                 en="Well done Vivek — clear reading and a lovely calm voice. "
                    "Look up at us between paragraphs next time.",
                 hi="शाबाश विवेक — स्पष्ट पढ़ाई और बहुत शांत आवाज़। अगली बार पैराग्राफ़ "
                    "के बीच हमारी ओर देखें।",
                 reason="Too formal; added his name."))

# 2 — right work, wrong slot --------------------------------------------------
record("Khusi Rajak", "STU-204", "Uploaded under the wrong task",
       referee(ev(
           coverage=CoverageReport(could_check=True, verdict="substantially_different",
                                   covered_fraction=0.03,
                                   evidence="Almost none of Day 13's content."),
           relevance="off_topic",
           relevance_evidence="None of Day 13's vocabulary appears.",
           video=[vj("confidence", 4, "Clear and unhesitating throughout."),
                  vj("vocabulary", 2, "Almost none of the module's words were used."),
                  vj("tone", 4, "Warm and even."),
                  vj("speed", 4, "About 112 words a minute.")],
           note=[vj("completion", 2, "Rows do not match this module's word list."),
                 vj("presentation", 4, "Clearly written and well spaced.")],
           feedback_en="Very little of this module's content appeared.",
           feedback_hi="इस मॉड्यूल की बहुत कम सामग्री दिखाई दी।"),
           Submission("s-4822", "STU-204", "day13_task1_english", "/v.mp4", "/n.jpg"),
           MODULE, RUBRIC,
           module_check=verify_declared_module(
               DAY13, CATALOGUE,
               spoken_opening="Day 12 Task 2, Teacher English Speaking Training.",
               written_header="DAY 12 TASK 2 Teacher English Speaking Training")),
       "Named Day 12 but uploaded under Day 13. Content scores dropped, "
       "delivery kept, nothing marked down.")

# 3 — read half the article ---------------------------------------------------
record("Vrendra Tiwari", "STU-091", "Stopped halfway through",
       referee(ev(
           coverage=CoverageReport(could_check=True, verdict="partial",
                                   covered_fraction=0.52,
                                   missing_from_submission=["the last four paragraphs"],
                                   evidence="Stopped after the pair-work paragraph."),
           video=[vj("confidence", 5, "Confident from the first sentence."),
                  vj("vocabulary", 4, "Every word reached was pronounced well."),
                  vj("tone", 5, "Calm and encouraging."),
                  vj("speed", 5, "About 104 words a minute; well paced.")],
           note=[vj("completion", 5, "All 11 rows filled in."),
                 vj("accuracy", 5, "All Hindi meanings match the key."),
                 vj("presentation", 4, "Neat.")],
           feedback_en="Lovely reading — calm, clear and well paced from the start.",
           feedback_hi="बहुत अच्छा पढ़ा — शुरुआत से ही शांत, स्पष्ट और सही गति में।"),
           Submission("s-4823", "STU-091", MODULE.module_id, "/v.mp4", "/n.jpg"),
           MODULE, RUBRIC,
           module_check=verify_declared_module(
               DAY12, CATALOGUE, spoken_opening="Day 12 Task 2.")),
       "Coverage is reported, not scored. The teacher also corrected one score — "
       "the agent's value is kept and the pair feeds calibration.",
       overrides=[dict(artifact="video", parameter="speed", new_value=4,
                       edited_by="Mrs Sharma",
                       reason="A little rushed in the middle section.")])

# 4 — forgot the note ---------------------------------------------------------
record("Vikash baiga", "STU-157", "No handwritten note uploaded",
       grade_submission(
           "s-4824", "STU-157", MODULE.module_id,
           build_artifact_result(ArtifactKind.VIDEO, [
               ParameterScore.scored("confidence", 4, "Steady throughout."),
               ParameterScore.scored("vocabulary", 4, "Target words clear."),
               ParameterScore.scored("tone", 4, "Warm."),
               ParameterScore.scored("speed", 4, "About 110 words a minute.")]),
           build_artifact_result(ArtifactKind.NOTE, missing=True), RUBRIC),
       "Work not done scores 0 — the only route to a zero. Reversible: "
       "if the note arrives, the submission is graded again.")

# 5 — note uploaded but unreadable -------------------------------------------
record("Aafreen Bee", "STU-233", "Photo of the note is unreadable",
       grade_submission(
           "s-4825", "STU-233", MODULE.module_id,
           build_artifact_result(ArtifactKind.VIDEO, [
               ParameterScore.scored("confidence", 4, "Clear and steady."),
               ParameterScore.scored("vocabulary", 3, "Some words hesitant."),
               ParameterScore.scored("tone", 4, "Encouraging."),
               ParameterScore.scored("speed", 4, "About 106 words a minute.")]),
           build_artifact_result(
               ArtifactKind.NOTE,
               cannot_evaluate=CannotEvaluateReason.UNREADABLE_IMAGE), RUBRIC),
       "Our failure, not hers — no rating at all, never a 0. Contrast with "
       "Vikash above: the two must never be confused.")

json.dump(RESULTS, open("ui_output.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

for r in RESULTS:
    print(f"\n{'='*74}\n{r['student']}  ({r['scenario']})")
    print(f"  video {r['video_rating']}   note {r['note_rating']}   "
          f"overall {r['overall']}   incomplete={r['incomplete']}")
    print(f"  EN: {r['feedback_en']}")
    print(f"  HI: {r['feedback_hi']}")
    if r["note_message"]:
        print(f"  note msg: {r['note_message']}")
    for f in r["flags"]:
        print(f"  flag: {f}")
    if r["for_the_teacher"]:
        print(f"  teacher: {r['for_the_teacher']}")
print(f"\n\nWrote ui_output.json — {len(RESULTS)} submissions")
