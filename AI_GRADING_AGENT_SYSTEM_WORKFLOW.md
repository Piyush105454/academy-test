# AI Grading Agent — End-to-End Architecture & Workflow Specification

> **Organization:** Wazir Education Society (WES)  
> **System:** Automated Dual-Artifact (Video + Handwritten Note) Evaluation Agent  
> **Status:** Production Ready  
> **Backend Host:** Coolify Cloud Container  
> **Database & Auth:** Supabase Cloud (PostgreSQL + RLS)  
> **Vision & Reasoning:** Azure AI Foundry (`gpt-4.1-mini`) + OpenAI Agents SDK  
> **Speech-to-Text Transcriber:** Groq Cloud (`whisper-large-v3-turbo`)  
> **Frontend:** React + Vite + Tailwind CSS  

---

## 1. Executive Summary

The **AI Grading Agent** automates the comprehensive evaluation of student homework assignments. It supports **dual-artifact submissions**:
1. **Video Reading Submissions:** Pronunciation, reading speed (words-per-minute), confidence, filler-word rate, posture, and hand gestures.
2. **Handwritten Notes (PDF / Image):** Vocabulary accuracy, Hindi translations, comprehension, and presentation layout.

It delivers consistent, objective, and pedagogically safe grading with **bilingual feedback (English & Hindi)** without penalizing students for camera angles, handwriting legibility, regional accents, or technical parsing failures.

### Core Design Philosophy: "Model Decides, Code Guarantees"
* **The Multimodal Models:**
  * **Groq Whisper (`whisper-large-v3-turbo`):** Transcribes spoken video audio in ~1 second with exact word timings.
  * **Azure OpenAI (`gpt-4.1-mini`):** Inspects video frames and student handwriting via vision OCR tools, evaluates understanding against curriculum criteria, and drafts constructive bilingual feedback.
* **Deterministic Code (`referee.py` + Guardrails):** Enforces non-negotiable guarantees: scores must cite observable evidence, unreadable work must be abstained rather than penalized with zero, coverage is reported rather than deducted, and psychological/demographic profiling of children is strictly forbidden and rejected.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Client ["1. Frontend Portal (React / Vite)"]
        TeacherUI["Teacher / Facilitator Dashboard\n(TaskDetail.tsx / Student List)"]
        TriggerBtn["User clicks '🤖 Generate AI Feedback'"]
    end

    subgraph SupabaseCloud ["2. Data Plane (Supabase Cloud)"]
        Auth["Supabase Auth (JWT)"]
        DB[("PostgreSQL Database\nstudent_task_feedback")]
        TriggerEvent["DB Update / Webhook Event"]
    end

    subgraph CoolifyContainer ["3. Processing Backend (Coolify Docker Container)"]
        FlaskAPI["Flask API Server (app.py)\nPOST /api/grade"]
        DriveDownloader["Google Drive Multi-Strategy Ingestion\n1. requests (Browser Session Spoof)\n2. Google Service Account API\n3. gdown fallback"]
        ArtifactRouter["Artifact Link Router\nSeparates Video (.mp4) & Handnote (.pdf/.jpg)"]
        
        subgraph Preprocessors ["Media Preprocessing (ffmpeg + fitz)"]
            PyMuPDF["PyMuPDF (fitz)\nPDF → 2x Zoom JPEGs"]
            AudioExtractor["ffmpeg Audio Extraction\nMono 16kHz MP3"]
            FrameExtractor["ffmpeg Frame Extraction\nKeyframes at timestamps"]
        end

        AgentCore["Grading Agent Engine\n(OpenAI Agents SDK + Isolated ThreadPool)"]
        SafetyReferee["Deterministic Referee & Guardrails\n- Evidence Verification\n- No-Child-Judgement Guardrail\n- Score Arithmetic"]
    end

    subgraph CloudAI ["4. External AI Engines"]
        GroqWhisper["Groq Cloud Whisper\n(whisper-large-v3-turbo)\nSpeech-to-Text Transcription"]
        AzureModel["Azure AI Foundry (gpt-4.1-mini)\nMulti-Modal Vision & Reasoning"]
    end

    TeacherUI --> TriggerBtn
    TriggerBtn -->|"Update row / trigger"| DB
    DB --> TriggerEvent
    TriggerEvent -->|"POST /api/grade {id, student_id, task_id, submission_link}"| FlaskAPI
    FlaskAPI --> DriveDownloader
    DriveDownloader --> ArtifactRouter
    
    ArtifactRouter -->|"Handnote Path"| PyMuPDF
    ArtifactRouter -->|"Video Path"| AudioExtractor
    ArtifactRouter -->|"Video Path"| FrameExtractor
    
    AudioExtractor -->|"Audio Stream"| GroqWhisper
    PyMuPDF -->|"Page Image Stream"| AgentCore
    FrameExtractor -->|"Video Keyframes"| AgentCore
    GroqWhisper -->|"Word Timings & Transcript"| AgentCore
    
    AgentCore <-->|"Vision OCR & Curriculum Reasoning"| AzureModel
    AgentCore -->|"Draft Evaluation"| SafetyReferee
    SafetyReferee -->|"Validated Safe Scores & Feedback"| FlaskAPI
    FlaskAPI -->|"Direct SQL update (ai_overall_rating, ai_feedback_en, ...)"| DB
    DB -.->|"Live state refresh"| TeacherUI
```

---

## 3. End-to-End Runtime Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher / Facilitator
    participant UI as Frontend Portal (React)
    participant SB as Supabase DB (PostgreSQL)
    participant Server as Coolify Flask API (app.py)
    participant Drive as Google Drive Cloud
    participant FFmpeg as ffmpeg & PyMuPDF Preprocessors
    participant Groq as Groq Cloud (Whisper Turbo)
    participant Agent as Grading Agent (OpenAI Agents SDK)
    participant Azure as Azure AI Foundry (gpt-4.1-mini)
    participant Referee as Referee Safety Engine

    Teacher->>UI: Clicks "🤖 Generate AI Feedback" for student
    UI->>SB: Updates student_task_feedback row
    SB->>Server: HTTP POST /api/grade with submission metadata & link map
    Server->>Drive: Download Video & Handnote using browser-bypass cascade
    Drive-->>Server: Media files saved to isolated temporary directory
    
    alt Video Submitted
        Server->>FFmpeg: Extract mono 16kHz MP3 audio & video snapshots
        FFmpeg-->>Server: Audio file & video frame images
        Server->>Groq: Transcribe speech with whisper-large-v3-turbo
        Groq-->>Server: Full speech transcript & timing data
    end

    alt Handnote Submitted (PDF/Image)
        Server->>FFmpeg: Rasterize PDF pages into 2x zoom JPEGs
        FFmpeg-->>Server: High-resolution page images
    end

    Server->>Agent: Run evaluate(submission, module, rubric)
    Agent->>Azure: Tool get_module (retrieve assignment criteria & word list)
    Azure-->>Agent: Title, instruction, target vocabulary, expected answers

    alt Video Evaluation
        Agent->>Azure: Tool look_at_video_frames (analyze posture, eye contact, gestures)
        Azure-->>Agent: Physical presentation observations
        Agent->>Agent: Compute speed (WPM), tone, filler rate from Groq transcript
    end

    alt Handnote Evaluation
        Agent->>Azure: Tool read_note (Vision OCR on handwriting)
        Azure-->>Agent: Transcribed English words & Hindi meanings
        Agent->>Agent: Tool check_hindi_answer (Devanagari matching with Nukta tolerance)
    end

    Agent->>Azure: Generate draft scores, evidence, and bilingual feedback
    Azure-->>Agent: Draft SubmissionEvaluation object
    Agent->>Referee: Submit draft for safety & score validation
    Referee->>Referee: Scan for forbidden child judgements
    Referee->>Referee: Verify every score has observable evidence
    Referee->>Referee: Calculate balanced 50/50 overall rating
    Referee-->>Server: Approved GradedSubmission
    Server->>SB: UPDATE student_task_feedback SET status='ai_evaluated', ai_overall_rating=..., ai_feedback_en=..., ai_feedback_hi=...
    SB-->>UI: Real-time UI update
    UI-->>Teacher: Displays Teacher Note + AI Bilingual Feedback Card
```

---

## 4. Component Deep Dive

### 4.1 Frontend Layer (`src/pages/TaskDetail.tsx` & `StudentTaskDetail.tsx`)
* **Role:** Displays student submission cards, allows file previewing in lightboxes, and provides one-click manual or bulk trigger for AI assessment.
* **Dual Feedback UI:** Renders **both** the Teacher / Facilitator Note and the AI Bilingual Evaluation Card side-by-side:
  * 👨‍🏫 **Teacher Note:** Green card highlighting human instructor feedback.
  * 🤖 **AI Feedback:** Blue card with overall rating (⭐ X.X / 5.0), English feedback, and 🇮🇳 Hindi translation.

### 4.2 Data Plane (`Supabase PostgreSQL`)
* **Table:** `public.student_task_feedback`
* **Row-Level Security (RLS):** Configured with explicit policies allowing authenticated users to select, insert, and update their respective task feedbacks.
* **Auto-Signup Trigger:** An `AFTER INSERT ON auth.users` trigger guarantees that whenever any user registers, a matching `user_profiles` row is automatically provisioned, preventing 406 Not Acceptable errors.

### 4.3 Backend Server (`agent/app.py` on Coolify)
* **Framework:** Flask + Gunicorn wrapped in Docker.
* **Concurrency Architecture:** Utilizes a persistent `_WORKER_EXECUTOR` (`ThreadPoolExecutor`) that remains alive across requests while detaching per-request asyncio event loops. This permanently eliminates the Python `RuntimeError: cannot schedule new futures after shutdown`.
* **Multi-Strategy Drive Downloader:**
  1. **Tier 1 (Browser Spoof):** Requests using Google user-content CDN headers (`drive.usercontent.google.com/download?id=...&confirm=t`) with realistic browser User-Agents. Bypasses data-center IP bans.
  2. **Tier 2 (Google Service Account):** Uses Google Cloud Service Account credentials (`googleapiclient.discovery`) for restricted files explicitly shared with WES.
  3. **Tier 3 (`gdown`):** Fallback public downloader.

### 4.4 Speech-to-Text Pipeline (`Groq Whisper`)
* **Model:** `whisper-large-v3-turbo` via Groq Cloud API.
* **Latency:** ~1.2 seconds for full audio transcription.
* **Audio Extraction:** `ffmpeg -vn -ac 1 -ar 16000 -b:a 64k` extracts a tiny mono MP3 file (under 3 MB for a 5-minute video), staying far below Groq's 25 MB payload limit.
* **Metrics Derived:** Words-per-minute (Speed), filler word frequency (`uh`, `um`), target vocabulary words spoken, and pronunciation alignment against module text.

### 4.5 Vision & Handwriting OCR Layer (`PyMuPDF` + Azure `gpt-4.1-mini`)
* Multi-page student PDF submissions are converted to high-resolution JPEG images using `fitz.open(pdf_path).load_page(i).get_pixmap(dpi=150)`.
* Multi-page images are dispatched in a single multi-modal payload to Azure OpenAI's vision endpoint.
* Supports **English**, **Devanagari Hindi** (`प्रोत्साहन`), and **Phonetic Roman Hindi / Hinglish** (`Himmat`, `Madad`).

---

## 5. System Prompts & Guardrails (Verbatim Production Config)

### 5.1 Main Agent System Prompt (`INSTRUCTIONS`)
```text
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

HOW COVERAGE AFFECTS THE SCORE:
It does not. Coverage is reported, not scored — a decision taken with Wazir
Education Society on 07 Sep 2026. Grade the reading on its merits. Do not quietly reduce a
parameter because less of the article was covered; that hides the deduction inside a
number nobody can question.

Instead, say the figure in the feedback: how much of the article was covered, and
what was left out, in plain words a child can act on.

Scale: 1 Needs Support · 2 Emerging · 3 Developing · 4 Proficient · 5 Exemplary.

RULES YOU MUST FOLLOW:
- Abstain rather than guess. If the framing hid the work, or the note is smudged, set that
  parameter's score to null and say why. An abstention is a good answer; an invented number is not.
- An accent is never an error. Indian and regional accents are not marked down.
- Never infer the activity from posture.
- Judge the work, never the child. You may not conclude anything about a student's
  intelligence, ability, effort, motivation, honesty, emotional state, home circumstances,
  caste, religion, gender, or any disability. Not in the feedback, not in your evidence
  notes, not for the teacher.
- Untidy handwriting must never lower a content score. Legibility belongs to presentation
  alone. A minor spelling slip that does not change meaning is not an accuracy failure.
- Relevance: only answer "off_topic" when you have substantial evidence the student
  addressed a different subject entirely. With thin evidence, answer "cannot_tell".
- Evidence is required. Every score must say what you actually observed.
- Feedback: two to four short sentences, English then Hindi. One specific strength first,
  then one concrete action they can take. Plain words — they are learning English.
```

### 5.2 Vision OCR Prompt (`read_note`)
```text
Transcribe this handwritten page exactly. List every English word with the
Hindi written beside it, and every numbered action point. Where the writing
is unclear or corrected, say so rather than guessing.
```

### 5.3 Output Safety Guardrail (`no_judgement_of_the_child`)
Before the LLM output is accepted, an automated guardrail parses `feedback_en`, `feedback_hi`, `for_the_teacher`, and all evidence strings against a forbidden-inference dictionary. 

Any evaluation containing comments on student motivation, intelligence, or home circumstances is **immediately rejected by the system**, raising an exception and preventing unverified judgements from reaching a student.

---

## 6. Scoring Rubric & Evaluation Parameters

### 6.1 Video Parameters (Spoken & Visual Reading)
| Parameter | Evaluated Signal | Measurement Method |
|---|---|---|
| **Confidence** | Filler-word frequency (`uh`, `um`) & poise | Transcript filler rate + Video keyframes |
| **Vocabulary** | Pronunciation & target word usage | Transcript matching against module word list |
| **Tone** | Audio energy & engagement | Vocal modulation against assignment instructions |
| **Hand Gesture** | Physical expression while speaking | Sampled video frames via Azure Vision |
| **Speed** | Reading pace | Computed words-per-minute (WPM) from transcript timings |

### 6.2 Note Parameters (Written Homework)
| Parameter | Evaluated Signal | Measurement Method |
|---|---|---|
| **Completion** | Did student attempt all tasks? | Count of attempted exercises / vocabulary rows |
| **Accuracy** | Correctness of Hindi translations | Answer key match with Devanagari script tolerance |
| **Comprehension** | Conceptual understanding | Action points in student's own words vs copying |
| **Presentation** | Cleanliness and readability | Visual layout, margins, and letter structuring |

* **Rating Scale:**  
  * `1.0` — Needs Support  
  * `2.0` — Emerging  
  * `3.0` — Developing  
  * `4.0` — Proficient  
  * `5.0` — Exemplary  

---

## 7. Data Contracts & Database Schema

### 7.1 Webhook / API Request Payload (`POST /api/grade`)
```json
{
  "id": "c47f7d3e-9bf8-4687-8df2-9b2f6ef3f94a",
  "student_id": "451d2516-2033-4fd0-860b-e6d381208563",
  "task_id": "f51b9201-44e2-4cb6-a97e-cc72da105bb9",
  "submission_link": "{\"req-video\":\"https://drive.google.com/file/d/VIDEO_ID/view\",\"req-pdf\":\"https://drive.google.com/file/d/NOTE_ID/view\"}",
  "submission_types": [
    "{\"id\":\"req-video\",\"title\":\"Video\",\"type\":\"link\"}",
    "{\"id\":\"req-pdf\",\"title\":\"Handnote\",\"type\":\"pdf\"}"
  ],
  "task_name": "Day 12 Task 2 - Reading & Notes",
  "task_description": "Read the assigned article aloud on camera and summarize key vocabulary in handwriting."
}
```

### 7.2 Result Payload Written to Supabase (`student_task_feedback`)
```json
{
  "status": "ai_evaluated",
  "ai_overall_rating": 4.1,
  "ai_note_rating": 4.2,
  "ai_video_rating": 4.0,
  "ai_feedback_en": "You spoke clearly with great confidence and read at a steady pace of 115 words per minute. Your handwritten note captures all target vocabulary words accurately. To improve further, practice looking directly into the camera between sentences and ensure your Hindi translations follow consistent margin spacing.",
  "ai_feedback_hi": "आपने बहुत आत्मविश्वास के साथ स्पष्ट रूप से बात की और 115 शब्द प्रति मिनट की स्थिर गति से पढ़ा। आपके हस्तलिखित नोट में सभी लक्षित शब्दावली शब्द सटीक रूप से दर्ज हैं। और सुधार के लिए, वाक्यों के बीच सीधे कैमरे की ओर देखने का अभ्यास करें और सुनिश्चित करें कि आपके हिंदी अनुवाद एक समान मार्जिन में हों।",
  "ai_scores": [
    {"artifact": "video", "parameter": "speed", "score": 4.5, "note": "Measured at 115 WPM; steady cadence throughout."},
    {"artifact": "video", "parameter": "confidence", "score": 4.0, "note": "Low filler rate (only 2 filler words observed); looked up regularly."},
    {"artifact": "video", "parameter": "vocabulary", "score": 4.0, "note": "Accurately pronounced 4 out of 5 target vocabulary words."},
    {"artifact": "note", "parameter": "completion", "score": 4.5, "note": "All assigned vocabulary entries attempted."},
    {"artifact": "note", "parameter": "accuracy", "score": 4.0, "note": "Hindi meanings match module key with standard variants."},
    {"artifact": "note", "parameter": "presentation", "score": 4.0, "note": "Clean line layout with clear handwriting."}
  ]
}
```

---

## 8. Deployment & Environment Configuration

### Coolify Environment Variables (Template)
```ini
# Azure AI Foundry (Multi-Modal Vision & Reasoning)
LLM_API_KEY=<your_azure_openai_api_key>
LLM_BASE_URL=https://<your_resource_name>.services.ai.azure.com/openai/v1/
GRADING_MODEL=gpt-4.1-mini

# Groq Cloud (Ultra-Fast Whisper Audio Transcription)
GROQ_API_KEY=<your_groq_api_key>

# Supabase PostgreSQL & API
SUPABASE_URL=https://<your_supabase_project_id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_secret>

# Google Cloud Service Account (Google Drive Ingestion)
GOOGLE_SERVICE_ACCOUNT_EMAIL=<your_service_account>@<your_project_id>.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 9. Verification & Health Monitoring

The service exposes a `/health` endpoint to verify connectivity to all infrastructure:

```bash
curl https://<coolify-agent-domain>/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "supabase_configured": true,
  "drive_service_account_configured": true,
  "groq_whisper_configured": true,
  "llm": "Azure OpenAI (gpt-4.1-mini @ https://...)"
}
```
