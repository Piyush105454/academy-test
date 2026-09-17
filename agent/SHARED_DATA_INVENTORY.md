# shared_data — everything D has shared, catalogued

Real student media. **Nothing in this folder is committed** — `.gitignore` here excludes
everything except itself and this README. Consent has not been recorded for any of it,
so the agent's consent gate will refuse to open these files until it is.

Compiled 07 Sep 2026. Duplicates (the same file re-uploaded) were collapsed; the counts
below are distinct items.

---

## modules/ — 1 module, incomplete

| File | Module | State |
|---|---|---|
| `day12-task2-teacher-english-speaking/module-page_PARTIAL.jpg` | **DAY 12 – TASK 2 · Teacher English Speaking Training** | **Cut off.** Page truncates after word 11 of 20 |

**What the page shows.** Created 09 May 2026, due 10 May 2026, ₹10, tagged *English
Reading, listening & speaking Task*.

- **Instruction (delivery):** calm but encouraging voice · pause after important points ·
  smile gently · keep steady eye contact
- **Article:** *Helping Students Overcome Fear of Speaking English*, 405 words — full text
  is visible and captured
- **20 Tough Words**, each with phonetic + Hindi. **Only 11 are visible:**
  Fear (डर) · Confidence (आत्मविश्वास) · Pronunciation (उच्चारण) · Judgment (निर्णय) ·
  Environment (वातावरण) · Manageable (प्रबंधनीय) · Gradually (धीरे-धीरे) · Pressure (दबाव) ·
  Encourage (प्रोत्साहित करना) · Bravery (साहस) · Criticism (आलोचना)

**Missing: words 12–20, and whatever follows the word list** (likely the submission
instructions). Two separate screenshots of this page were shared — 31 Aug and 07 Sep —
and both cut at exactly the same place, so the rest has never been seen.

> `sample_data/modules/day12_task2_english.json` currently stores **8 words and one
> paragraph**. It is wrong and must not be graded against: a student who correctly writes
> all 20 rows would have 12 of them counted as *content not in the module*.

---

## handwritten_notes/ — 2 notes, both a different module

| File | Module written on the page | Contents |
|---|---|---|
| `noteA_71-TS_delegating-tasks.jpg` | **71-TS Delegating Tasks – Time Management** | 15 word rows + 10 action points. Article named: *Empowering the Classroom: The Strength of Delegating Tasks* |
| `noteB_71-TS_delegating-tasks.jpg` | **71-TS Delegating Tasks – Time Management** | Same 15 rows, numbered. Hindi column drifted from row 11 and was self-corrected in place with arrows |

Both students wrote the module number on the page themselves, so this is stated content,
not inference.

**We do not hold module 71-TS.** Neither note can be graded until its module page is
shared.

---

## videos/ — 4 recordings, module unknown

| File | Duration | Audio stream |
|---|---|---|
| `video01_2026-08-30_216s.mp4` | 3 m 36 s | yes |
| `video02_2026-08-30_044s.mp4` | 0 m 44 s | yes |
| `video03_2026-09-05_229s.mp4` | 3 m 49 s | yes |
| `video04_2026-09-05_280s.mp4` | 4 m 40 s | yes |

**Which module each belongs to is unknown and cannot be determined here.** Content
matching needs a transcript, and no speech-to-text is connected. All four carry audio, so
this is our gap, not a silent student — the correct verdict for every one of them is
`CANNOT_TELL`, never `off_topic`.

---

## reference_screenshots/ — not homework

Product and reference material, kept separate so it is never mistaken for a submission:
`ui-student-details.png`, `rating-parameters-modal.png`,
`openai-agents-sdk-example.png`, and three unclassified screenshots from 31 Aug / 03 Sep.

---

## What is missing before anything can be graded

1. **The rest of the Day 12 page** — words 12–20 and anything below them.
2. **Module 71-TS** — the article and the school's own Hindi meanings. Both handwritten
   notes belong to it.
3. **Which video goes with which module and student** — filenames carry only a timestamp.
4. **Speech-to-text**, without which no video can be content-matched to any module.
5. **Consent records** for all six pieces of student media.
