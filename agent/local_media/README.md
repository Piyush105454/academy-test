# local_media — private, never committed

Real student video and photographs live here. **Nothing in this folder is committed**
except this file and the consent example: the repository is public, and media of
identifiable children must never enter it.

## Layout

```
local_media/
    consent.json          <- who may be processed (not committed)
    STUDENT-R1/
        video.mp4
        note.jpg
    STUDENT-R2/
        video.mp4
```

Folder names are the student IDs the agent will use. Use opaque IDs, not real names.

## consent.json

The agent refuses to open any file for a student without an entry here. Copy
`consent.example.json` to `consent.json` and fill it in as guardian permission is
collected.

```json
{
  "STUDENT-R1": {
    "granted": true,
    "recorded_on": "2026-08-20",
    "scope": "evaluation_only",
    "note": "Signed consent form held by the school office"
  }
}
```

Record only that consent exists and when. Never put a guardian's name, signature,
phone number or address in this file.

The register **fails closed**: a missing, unreadable or malformed file grants nothing.

## Running against it

```bash
python run_batch.py sample_data --media local_media --module day12_task2_english
```

It will list who has consent and who does not, then ask for confirmation before
reading anything. Students without consent are skipped and their files are never
opened.

## What works offline today

Duration is read with `ffprobe` and is real. Transcription and note reading need a
speech-to-text service and a vision model — until those are wired in, video comes back
as `no_transcriber`, which is deliberately *not* the same as `no_audio`. Those
recordings have sound; we simply have no way to hear it here, and telling a student
their microphone was off would be wrong.
