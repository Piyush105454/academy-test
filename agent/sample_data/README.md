# Sample data

Data for running the agent end to end without a portal, an API key, or any student
media.

## Why there is no student video or photograph here

**This repository is public.** Committing real student media would put identifiable
children's faces and voices on the public internet permanently — git history retains
them even after a later delete — and it would do so without the guardian consent that
the design names as the blocker before any of this touches real students.

The design says this directly, and rates it Critical:

> *Access Control — Public exposure risk — Keep access owner-only; use synthetic or
> blurred media before wider sharing.*

So: no video, no audio, no photographs, no names. Students appear as opaque IDs.

If you need to run the agent over real submissions, keep the media outside the
repository and point the runner at a local folder — `.gitignore` should cover whatever
path you choose before you put a single file in it.

## Real versus invented

| | Source |
|---|---|
| `sub-001` … `sub-004` | Invented, to exercise specific pipeline behaviours |
| `sub-real-001` | Text transcribed from a real student's handwritten note. Text only; the photograph is not in this repo, and the student is pseudonymous |
| `modules/delegating_tasks.json` | **NOT A REAL MODULE — written by Claude, never supplied by the school.** Rows 1–10 of its answer key are the student's own answers copied back, so grading that student against it is circular; rows 11–15 were invented. Any accuracy figure produced against this file is an artifact of provenance, not a measurement. Replace with the actual 71-TS module before this decides anything. See `_provenance` inside the file |

`sub-real-001` has no video attached, for two reasons: the media stays out of the repo
for the reasons above, and offline there is no speech-to-text available to turn a
recording into a transcript. Marking it as a silent video would have been factually
wrong — the recording has sound, we simply cannot transcribe it here — so it is
represented honestly as a note-only submission, which the agent handles as incomplete.

## What a submission file represents

The agent's first stage turns raw media into *evidence*: a transcript with timings,
counts of sampled frames, the rows read off a handwritten note. That stage needs a
speech-to-text service and a vision model.

Each file in `submissions/` is the **output of that stage** — what the ingestion step
would hand to the scorer, written down as JSON. That lets the whole grading pipeline run
and be inspected without shipping media files or calling a paid API, while exercising
exactly the same scoring code that production would use.

## The four submissions

Chosen to cover the cases that matter, not four variations of "everything went fine".

| File | What it exercises |
|---|---|
| `sub-001.json` | A complete, solid submission — video and note both gradeable |
| `sub-002.json` | A **silent video**. Should produce no video rating and a re-upload request, not a low score |
| `sub-003.json` | **No note uploaded.** Overall should equal the video rating and be marked incomplete — not halved |
| `sub-004.json` | **Smudged handwriting.** Two Hindi rows could not be read confidently, so they abstain rather than being marked wrong |

## Running them

```bash
cd agent
python run_batch.py sample_data
```
