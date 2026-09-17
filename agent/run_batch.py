#!/usr/bin/env python3
"""Grade a folder of submissions — the overnight batch run, in miniature.

    python run_batch.py sample_data

The design calls for grading to run as an overnight batch rather than on
upload: homework goes out through the day and arrives by evening, and nothing
needs a score within seconds. This script is that batch, at demo scale.

It uses the rule-based scorers, so it runs with no API key and no network. The
numbers it produces are therefore *illustrative* — only Speed and Completion
are real measurements today. What is genuinely demonstrated is the behaviour
around them: three separate ratings, abstaining instead of guessing, refusing
to score a submission it cannot evaluate, and never turning a missing artifact
into a zero.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from grading_agent import (  # noqa: E402
    GradingPipeline,
    JsonSubmissionStore,
    Rubric,
    RuleBasedNoteScorer,
    RuleBasedVideoScorer,
)
from grading_agent.consent import ConsentRegister  # noqa: E402
from grading_agent.folder_source import FolderSubmissionSource  # noqa: E402
from grading_agent.local_media import ConsentRequired, LocalMediaSource  # noqa: E402


def _prepare_console() -> bool:
    """Make stdout able to print Hindi. Returns True if it can.

    Windows consoles still default to a legacy code page (cp1252 and friends)
    that cannot encode Devanagari or box-drawing characters, and Python raises
    UnicodeEncodeError on the first line rather than degrading. Since this tool
    prints bilingual feedback by design, that would break it on the most likely
    machine it runs on.
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError, OSError):
        pass

    encoding = getattr(sys.stdout, "encoding", None) or "ascii"
    try:
        "─ अ".encode(encoding)
        return True
    except (UnicodeEncodeError, LookupError):
        return False


UNICODE_OK = _prepare_console()
RULE = ("─" if UNICODE_OK else "-") * 78


def fmt(value) -> str:
    """Ratings print as a number or an em dash — never as 0."""
    return ("—" if UNICODE_OK else "--") if value is None else f"{value:.2f}"


def artifact_line(label: str, artifact) -> str:
    if artifact.missing:
        return f"  {label:<6} not uploaded"
    if artifact.cannot_evaluate is not None:
        dash = "—" if UNICODE_OK else "-"
        return f"  {label:<6} not evaluated {dash} {artifact.cannot_evaluate.value}"
    assessed = len(artifact.assessed_scores)
    total = len(artifact.scores)
    detail = f"{fmt(artifact.rating)} / 5   ({assessed} of {total} parameters scored"
    if assessed < total:
        skipped = ", ".join(s.parameter for s in artifact.unassessed_scores)
        detail += f"; abstained: {skipped}"
    return f"  {label:<6} {detail})"


def main(folder: str, fresh: bool = False) -> int:
    source = FolderSubmissionSource(folder)
    rubric = Rubric.load()
    pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())

    # Records accumulate across runs, which is correct for a real batch but makes
    # a demo look different the second time (trends move off Baseline). --fresh
    # clears them so a run is reproducible.
    records_path = Path(folder) / "graded_records.json"
    if fresh and records_path.exists():
        records_path.unlink()
    store = JsonSubmissionStore(records_path)

    submissions = source.pending_submissions()
    if not submissions:
        print(f"No submissions found in {folder}/submissions/")
        return 1

    print(RULE)
    print(f"GRADING {len(submissions)} SUBMISSIONS FROM {folder}/")
    print(RULE)

    results = []
    for submission in submissions:
        module = source.load_module(submission.module_id)
        video_evidence, note_evidence = source.load_evidence(submission.submission_id)
        history = store.overall_rating_history(submission.student_id, module.skill_type)

        graded = pipeline.grade(
            submission, module, video_evidence, note_evidence, previous_ratings=history)
        store.save(graded)
        results.append(graded)

        print(f"\n{submission.submission_id}   student {submission.student_id}")
        print(artifact_line("video", graded.video))
        print(artifact_line("note", graded.note))
        print(f"  {'overall':<6} {fmt(graded.overall_rating)} / 5"
              f"{'   (incomplete)' if graded.incomplete else ''}"
              f"   trend: {graded.trend.value if graded.trend else '-'}")
        if graded.flags:
            print(f"  {'flags':<6} {', '.join(graded.flags)}")
        print(f"\n  Feedback to the student:")
        print(f"    EN  {graded.feedback.en}")
        print(f"    HI  {graded.feedback.hi}")

    # -- summary ----------------------------------------------------------
    print(f"\n{RULE}")
    print("SUMMARY")
    print(RULE)
    header = f"{'submission':<12}{'video':>8}{'note':>8}{'overall':>9}   {'trend':<16}review?"
    print(header)
    print(("─" if UNICODE_OK else "-") * len(header))
    for g in results:
        print(f"{g.submission_id:<12}"
              f"{fmt(g.video.rating):>8}"
              f"{fmt(g.note.rating):>8}"
              f"{fmt(g.overall_rating):>9}   "
              f"{(g.trend.value if g.trend else ('—' if UNICODE_OK else '--')):<16}"
              f"{'yes' if g.flagged_for_teacher else 'no'}")

    flagged = sum(1 for g in results if g.flagged_for_teacher)
    print(f"\n{flagged} of {len(results)} flagged for a teacher to look at "
          f"({flagged / len(results):.0%}).")
    print("At 210-240 submissions a day, keeping this rate near 10% is what makes the")
    print("flag useful — flag half of them and the triage value is gone.")
    print(f"\nRecords written to {folder}/graded_records.json")
    return 0


def run_local_media(media_root: str, module_id: str, data_folder: str,
                    assume_yes: bool = False) -> int:
    """Grade real student media held in a private folder outside the repo.

    Three gates before anything is opened: the folder must exist, the student
    must have a recorded consent entry, and a human must confirm.
    """
    source = FolderSubmissionSource(data_folder)
    media = LocalMediaSource(media_root)

    students = media.students_with_media()
    if not students:
        print(f"No student folders found in {media_root}/")
        print("Expected: <media_root>/<student_id>/video.mp4")
        return 1

    allowed = [s for s in students if media.consent.allows(s)]
    blocked = media.consent.without_consent(students)

    print(RULE)
    print("REAL STUDENT MEDIA")
    print(RULE)
    print(f"Folder            : {media_root}")
    print(f"Student folders   : {len(students)}")
    print(f"Consent on file   : {len(allowed)}")
    if blocked:
        print(f"NO consent        : {len(blocked)} -> {', '.join(blocked)}")
        print("                    These will be skipped. Their files are not opened.")

    if not allowed:
        print("\nNothing to process — no student here has a recorded consent entry.")
        print(f"Add entries to {Path(media_root) / 'consent.json'} first.")
        return 1

    # A human says yes before identifiable children's media is read.
    if not assume_yes:
        print(f"\nThis will read and process identifiable media for {len(allowed)} "
              f"student(s): {', '.join(allowed)}")
        answer = input("Continue? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            print("Cancelled. Nothing was opened.")
            return 1

    rubric = Rubric.load()
    pipeline = GradingPipeline(rubric, RuleBasedVideoScorer(), RuleBasedNoteScorer())
    module = source.load_module(module_id)

    from grading_agent.models import ArtifactKind, Submission  # noqa: E402
    from grading_agent.scoring import build_artifact_result  # noqa: E402

    print()
    for student_id in allowed:
        try:
            video_evidence, blocker = media.video_evidence(student_id)
        except ConsentRequired as exc:
            print(f"{student_id}: skipped — {exc}")
            continue

        paths = media.locate(student_id)
        print(f"{student_id}")
        print(f"  file     {paths.video.name if paths.video else '(no video)'}")

        if blocker is not None:
            result = build_artifact_result(ArtifactKind.VIDEO, cannot_evaluate=blocker)
            duration = video_evidence.duration_seconds if video_evidence else 0.0
            print(f"  duration {duration:.1f}s  (measured with ffprobe)")
            print(f"  video    not evaluated — {blocker.value}")
            if blocker.value == "no_transcriber":
                print("           No speech-to-text is configured, so the words in this")
                print("           recording cannot be assessed. This is a setup gap, not")
                print("           a problem with the student's work — no score is given")
                print("           and nothing is reported to the student.")
            print()
            continue

        submission = Submission(f"live-{student_id}", student_id, module.module_id)
        graded = pipeline.grade(submission, module, video_evidence, None)
        print(f"  video    {fmt(graded.video.rating)} / 5")
        print(f"  overall  {fmt(graded.overall_rating)} / 5 (incomplete: note not read)")
        print()

    print("Media stays where it is. Nothing was copied into the repository.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Grade a folder of submissions (the overnight batch, at demo scale).")
    parser.add_argument("folder", nargs="?", default="sample_data",
                        help="Folder holding modules/ and submissions/ (default: sample_data)")
    parser.add_argument("--media", metavar="PATH",
                        help="Private folder of real student media, kept outside the repo. "
                             "Requires a consent.json entry per student.")
    parser.add_argument("--module", default="day12_task2_english",
                        help="Module id to grade real media against (with --media)")
    parser.add_argument("--fresh", action="store_true",
                        help="Clear stored records first, so the run is reproducible")
    parser.add_argument("--yes", action="store_true",
                        help="Skip the confirmation prompt (for unattended runs)")
    args = parser.parse_args()

    if args.media:
        raise SystemExit(run_local_media(args.media, args.module, args.folder, args.yes))
    raise SystemExit(main(args.folder, args.fresh))
