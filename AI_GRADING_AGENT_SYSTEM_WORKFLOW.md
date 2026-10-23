# AI Grading Agent — End-to-End Architecture & Workflow Specification

> **Organization:** Wazir Education Society (WES)  
> **System:** Automated Homework & Handwritten Note Evaluation Agent  
> **Status:** Production Ready  
> **Backend Host:** Coolify Cloud Container  
> **Database & Auth:** Supabase Cloud (PostgreSQL + RLS)  
> **Inference Engine:** Azure AI Foundry (`gpt-4.1-mini`) + OpenAI Agents SDK  
> **Frontend:** React + Vite + Tailwind CSS  

---

## 1. Executive Summary

The **AI Grading Agent** automates the evaluation of student homework assignments (specifically handwritten note images and PDF submissions). It delivers consistent, objective, and pedagogically safe grading with bilingual feedback (English & Hindi) without penalizing students for camera angles, handwriting legibility, dialect accents, or technical parsing failures.

### Core Design Philosophy: "Model Decides, Code Guarantees"
* **The LLM (Azure `gpt-4.1-mini`)** inspects the student's work using multi-modal vision tools, evaluates understanding against curriculum criteria, and drafts constructive feedback.
* **Deterministic Code (`referee.py` + Guardrails)** enforces non-negotiable guarantees: scores must cite evidence, unreadable work must be abstained rather than penalized with zero, coverage is reported rather than deducted, and psychological/demographic profiling of children is strictly forbidden and rejected.

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
        Rasterizer["PyMuPDF (fitz) Engine\nPDF Pages → High-Res 2x Zoom JPEGs"]
        AgentCore["Grading Agent Engine\n(OpenAI Agents SDK + Isolated ThreadPool)"]
        SafetyReferee["Deterministic Referee & Guardrails\n- Evidence Verification\n- No-Child-Judgement Guardrail\n- Score Arithmetic"]
    end

    subgraph LLMCloud ["4. AI & Vision Cloud (Azure AI Foundry)"]
        AzureModel["gpt-4.1-mini\n(Multi-Modal Vision & Reasoning)"]
    end

    TeacherUI --> TriggerBtn
    TriggerBtn -->|"Update row / trigger"| DB
    DB --> TriggerEvent
    TriggerEvent -->|"POST /api/grade {id, student_id, task_id, submission_link}"| FlaskAPI
    FlaskAPI --> DriveDownloader
    DriveDownloader -->|"Saves local file in /tmp"| Rasterizer
    Rasterizer -->|"Clean Image Stream"| AgentCore
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
    participant PDF as PyMuPDF (fitz)
    participant Agent as Grading Agent (OpenAI Agents SDK)
    participant Azure as Azure AI Foundry (gpt-4.1-mini)
    participant Referee as Referee Safety Engine

    Teacher->>UI: Clicks "🤖 Generate AI Feedback" for student
    UI->>SB: Updates student_task_feedback row
    SB->>Server: HTTP POST /api/grade with submission metadata
    Server->>Drive: Download submission_link using browser bypass cascade
    Drive-->>Server: File saved to isolated temporary directory
    alt File is PDF
        Server->>PDF: Convert pages to high-resolution JPEG buffers
        PDF-->>Server: Extracted image list
    else File is Image (JPG/PNG)
        Server->>Server: Direct image load
    end
    Server->>Agent: Run evaluate(submission, module, rubric)
    Agent->>Azure: Tool get_module (retrieve assignment criteria)
    Azure-->>Agent: Title, instruction, target vocabulary
    Agent->>Azure: Tool read_note (Vision OCR on converted images)
    Azure-->>Agent: Transcribed student handwriting and solutions
    Agent->>Azure: Tool check_coverage (compare work against module)
    Azure-->>Agent: Mechanical concept coverage report
    Agent->>Azure: Generate draft scores, evidence, and bilingual feedback
    Azure-->>Agent: Draft SubmissionEvaluation object
    Agent->>Referee: Submit draft for safety & score validation
    Referee->>Referee: Scan for forbidden child judgements
    Referee->>Referee: Verify every score has observable evidence
    Referee->>Referee: Calculate overall weighted rating
    Referee-->>Server: Approved GradedSubmission
    Server->>SB: UPDATE student_task_feedback SET status='ai_evaluated', ai_overall_rating=..., ai_feedback_en=..., ai_feedback_hi=...
    SB-->>UI: Real-time UI update
    UI-->>Teacher: Displays AI Feedback Card & Score Breakdown
```

---

## 4. Component Deep Dive

### 4.1 Frontend Layer (`src/pages/TaskDetail.tsx`)
* **Role:** Displays student submission cards, allows file previewing in lightboxes, and provides one-click manual or bulk trigger for AI assessment.
* **Mechanism:** 
  * Checks if `task.submission_link` is present.
  * Dispatches trigger request or updates `student_task_feedback` row.
  * Listens to Supabase real-time updates and automatically transitions the button into a verified feedback card once `ai_feedback_en` is populated.

### 4.2 Data Plane (`Supabase PostgreSQL`)
* **Table:** `public.student_task_feedback`
* **Row-Level Security (RLS):** Configured with 5 explicit policies allowing authenticated users to select, insert, and update their respective task feedbacks.
* **Auto-Signup Trigger:** An `AFTER INSERT ON auth.users` trigger guarantees that whenever any user registers, a matching `user_profiles` row is automatically provisioned, preventing 406 Not Acceptable errors.

### 4.3 Backend Server (`agent/app.py` on Coolify)
* **Framework:** Flask + Gunicorn wrapped in Docker.
* **Concurrency Architecture:** Utilizes a persistent `_WORKER_EXECUTOR` (`ThreadPoolExecutor`) that remains alive across requests while detaching per-request asyncio event loops. This permanently eliminates the Python `RuntimeError: cannot schedule new futures after shutdown` common to asynchronous background agents.
* **Multi-Strategy Drive Downloader:**
  1. **Tier 1 (Browser Spoof):** Requests using Google user-content CDN headers (`drive.usercontent.google.com/download?id=...&confirm=t`) with realistic browser User-Agents. Bypasses data-center IP bans.
  2. **Tier 2 (Google Service Account):** Uses Google Cloud Service Account credentials (`googleapiclient.discovery`) for restricted files explicitly shared with WES.
  3. **Tier 3 (`gdown`):** Fallback public downloader.

### 4.4 Ingestion & Vision Layer (`PyMuPDF`)
* Handwritten notes uploaded as multi-page PDFs are rasterized using `fitz.open(stream=...).load_page(i).get_pixmap(dpi=150)` into clean JPEG buffers.
* Multi-page images are dispatched in a single multi-modal payload to Azure OpenAI's vision endpoint.

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

Any evaluation containing comments on:
* Student motivation (e.g., *"not trying"*, *"careless"*, *"lazy"*)
* Student intelligence/capacity (e.g., *"struggles intellectually"*, *"slow learner"*)
* Home/social background (e.g., *"poor environment"*, *"lacks support"*)

...is **immediately rejected by the system**, raising an exception and preventing unverified judgements from ever reaching a student.

---

## 6. Scoring Rubric & Criteria

| Parameter | Focus | What is Evaluated | What is NOT Penalized |
|---|---|---|---|
| **Completion** | Quantity & Thoroughness | All required exercises and questions attempted | Missing items due to unreadable photo |
| **Accuracy** | Correctness of Content | Correct word meanings, grammatical form, logic | Minor spelling slips that preserve meaning |
| **Comprehension** | Understanding | Clear conceptual grasping of the module's prompt | Formatting style or untidy layout |
| **Presentation** | Legibility & Neatness | Clean layout, readable letters, structured lines | General handwriting style (cursive vs print) |

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
  "submission_link": "https://drive.google.com/file/d/1V6SG4qVIiRbOX85MoPTGo5vXl08qgDMs/view",
  "task_name": "Day 12 Task 2 - Practical Notes",
  "task_description": "Create an array containing marks of five students and write explanations."
}
```

### 7.2 Result Payload Written to Supabase (`student_task_feedback`)
```json
{
  "status": "ai_evaluated",
  "ai_overall_rating": 4.0,
  "ai_note_rating": 4.0,
  "ai_feedback_en": "You have clearly listed all the required vocabulary words and their Hindi translations with great accuracy. To improve further, ensure the action points on the left margin follow sequential numbering.",
  "ai_feedback_hi": "आपने सभी आवश्यक शब्दावली और उनके हिंदी अर्थ बहुत सटीक रूप से लिखे हैं। और सुधार के लिए, सुनिश्चित करें कि बाईं ओर लिखे गए बिंदु क्रमबद्ध तरीके से गिने गए हों।",
  "ai_scores": [
    {"parameter": "completion", "score": 4.5, "note": "All 5 student marks questions answered completely."},
    {"parameter": "accuracy", "score": 4.0, "note": "Devanagari meanings match module key with standard variants."},
    {"parameter": "comprehension", "score": 4.0, "note": "Concepts explained accurately according to the prompt."},
    {"parameter": "presentation", "score": 3.5, "note": "Clear handwriting with minor margins overlapping."}
  ]
}
```

---

## 8. Deployment & Environment Configuration

### Coolify Environment Variables
```ini
LLM_API_KEY=<your_azure_openai_api_key>
LLM_BASE_URL=https://wesai-resource.services.ai.azure.com/openai/v1/
GRADING_MODEL=gpt-4.1-mini

SUPABASE_URL=https://egxmvxkxsncpoxsbbmmh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_secret>

GOOGLE_SERVICE_ACCOUNT_EMAIL=wes-gdrive@inbound-lexicon-499018-r2.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 9. Verification & Health Monitoring

The service exposes a `/health` endpoint to verify connectivity to Supabase, Google Cloud, and Azure AI:

```bash
curl https://<coolify-agent-domain>/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "supabase_configured": true,
  "drive_service_account_configured": true,
  "llm": "Azure OpenAI (gpt-4.1-mini @ https://wesai-resource.services.ai.azure.com/openai/v1/)"
}
```
