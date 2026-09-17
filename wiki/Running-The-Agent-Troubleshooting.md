# Running the Agent — Troubleshooting & FAQ

*What to do when something looks broken, and which things only look broken.*

Written for anyone running the agent, including people who don't write code. Every
error message quoted here is real — reproduced by actually causing the problem, not
guessed at.

Companions: [Homework-Grading-Agent](Homework-Grading-Agent.md) (the design),
[How-The-Agent-Is-Built](How-The-Agent-Is-Built.md) (the code).

---

## Start here: the three questions people ask first

| Question | Answer |
|---|---|
| **Does it need an API key?** | **No.** There is not a single API call in the codebase. It runs entirely on your machine, offline. |
| **Does it need the internet?** | **No.** Not to install, not to run. |
| **Do I need to install anything?** | Only **Python 3.9 or newer**. `pandas` makes the notebook's tables prettier if you have it, and everything still works without it. |

If someone tells you it needs an API key or a paid service, they are describing a
*future* version — the one with a real speech-to-text and vision model wired in. Today's
code does not.

---

## The single most useful fix

**In Jupyter: Kernel → Restart Kernel and Run All Cells.**

This solves the majority of problems, and it is worth trying before reading any further.

Why it works: a Jupyter notebook shares one memory across all its cells. Cell 1 creates
things (`rubric`, `source`, `Path`) that every later cell depends on. If you click into a
cell in the middle and run just that one, those things don't exist yet and it fails —
even though nothing is actually wrong with the code.

That is also why a notebook can show saved output from a previous run while erroring
when you run it yourself. The output was saved by a complete top-to-bottom run; your
click ran one cell out of order.

---

## Errors, and what they mean

### `NameError: name 'Path' is not defined`

*(or `'rubric'`, `'source'`, `'pipeline'`, `'results'` — same cause)*

You ran a cell before the cells it depends on. Nothing is broken.

**Fix:** Kernel → Restart Kernel and Run All Cells.

### `ModuleNotFoundError: No module named 'grading_agent'`

Python is looking in the wrong folder. The code lives in `agent/`, so that is where
things must run from.

**Fix — terminal:**

```powershell
cd C:\Users\dpatankar\Grading-Agent_Education-Society\agent
```

**Fix — Jupyter:** start it from inside the `agent` folder, or open `Run_Agent.ipynb`,
whose first cell corrects the folder automatically. Running a bare `import grading_agent`
in a notebook started somewhere else will still fail.

### `No submissions found in sample_data/submissions/`

The runner started, but found nothing to grade — the folder path is wrong or you are one
directory off. Same fix as above: run from inside `agent`.

### `FAILED (errors=5)` when running the tests

Almost always the same folder problem. From `agent`, the correct command is:

```powershell
python -m unittest discover -s tests
```

Expect `Ran 83 tests` then `OK`. If you see a small number of tests and errors, you ran
it from the repo root instead.

### `UnicodeEncodeError: 'charmap' codec can't encode characters`

Windows consoles default to a text encoding that cannot handle Hindi or the line
characters the runner prints. This was fixed — if you see it, your copy of
`run_batch.py` is out of date.

**Fix:** get the current version, or run `chcp 65001` before the command.

### `'python' is not recognized as an internal or external command`

Python isn't installed, or isn't on your PATH.

**Fix:** try `py --version` instead — on Windows that often works when `python` doesn't,
and if so use `py` everywhere in place of `python`. Otherwise install Python from
python.org and tick **"Add Python to PATH"** during setup.

### Hindi shows as `?????` or empty boxes

Your console font, not the agent. The grading is unaffected and the Hindi is correct in
the saved files. Run `chcp 65001` first, or use Windows Terminal, or read the output in
Jupyter where it renders properly.

---

## Things that look like bugs but are correct

This section matters more than the error list. Several of the agent's deliberate
behaviours look wrong at first glance.

| What you see | Why it's correct |
|---|---|
| A dash (`—`) instead of a score | That is **"no score"**, not zero. A silent video or a missing note produces no rating rather than a low one — scoring a student 1/5 because their microphone was off would be unfair. |
| `not assessed` next to Tone and Comprehension on every submission | The offline scorers have no model capable of judging those, so they decline rather than invent a number. Abstained parameters drop out of the average entirely. |
| A student with **hidden hands scores slightly higher** | Hand Gesture abstains when the camera framing hides the hands, and abstaining removes it from the average. The design errs in the student's favour deliberately — but it is a real effect worth watching during calibration. |
| Trends change on a second run | Records accumulate, so the second run has history and students move off "Baseline". Add `--fresh` (terminal) to clear them, or re-run the notebook, which clears them for you. |
| Several students get **identical feedback** | The offline feedback builder picks the best and weakest parameter from a fixed phrase list. Real variety comes from a model writing the feedback; the deterministic version is the fallback. |
| `no_transcriber` rather than `no_audio` on a real video | Deliberate. `no_audio` means the student's microphone was off — advice for them. `no_transcriber` means we haven't configured speech-to-text — a job for whoever runs the agent. Telling a student to check their microphone when the fault is ours would be wrong. |
| **No consent prompt appeared** | Nothing opened any media. The sample submissions are JSON evidence files containing no video or photographs, so there is nothing to ask permission for. The prompt only appears on the `--media` path. |

---

## Consent and real student media

### Why didn't it ask me for consent?

Because it never touched a video. `python run_batch.py sample_data` reads JSON files that
describe evidence — there is no media in `sample_data/` at all.

### How do I see the consent gate actually work?

Worth doing once, to confirm it is real rather than decorative:

1. Put any video at `agent\local_media\STUDENT-R1\video.mp4`.
2. Run it **without** creating a consent file:

   ```powershell
   python run_batch.py sample_data --media local_media --module day12_task2_english
   ```

   It should refuse — the student is listed under "NO consent" and the file is never
   opened.
3. Copy `local_media\consent.example.json` to `local_media\consent.json` and set
   `STUDENT-R1` to `"granted": true`.
4. Run the same command. Now it names the student, asks you to confirm, and proceeds.

### Is the agent using the videos I shared in chat?

No. Every video in the sample data is invented — hand-written transcripts and round-number
durations that match none of the real recordings. There are no media files in the
repository at all.

One sample *is* real, but it is a **note, not a video**: `sub-real-001` uses an actual
student's handwritten page — 15 vocabulary rows and 10 action points, transcribed as
text. Its video field is empty, which is why it grades as incomplete.

### Why isn't the real video graded?

Two reasons. The recordings have sound, but no speech-to-text is connected, so there is
nothing honest to extract beyond duration. And the files stay out of the repository
because it is public — media of identifiable children must not be committed.

---

## Git and GitHub

### I ran the commands but nothing appeared on GitHub

Check which directory you were in. `git add agent` must run from the **repo root**:

```powershell
cd C:\Users\dpatankar\Grading-Agent_Education-Society
git add agent
git status --short
```

`git status --short` is the step that tells you the truth. It should list files with `A`
(added) or `M` (modified). If it comes back empty, the `git add` matched nothing — you
were in the wrong folder.

### The three steps are separate

`add` stages, `commit` records, `push` uploads. Stopping after `commit` is the most
common reason work exists locally but not on GitHub. All three, every time:

```powershell
git add agent
git commit -m "your message"
git push
```

### How do I check what actually made it to GitHub?

Open the repository in a browser and look at the file list, or check the commit history.
The files on your disk and the files on GitHub are genuinely separate — writing a file
locally does nothing to the repository until you push.

---

## Still stuck?

Paste the **complete error message**, including the last few lines above it, plus:

- which command you ran, and
- which folder you were in (`cd` on Windows prints the current directory).

Those three things are almost always enough to identify the problem. A description like
"it gave an error" is not — the same symptom has several different causes, and the exact
text is what separates them.
