import os
import tempfile
import asyncio
import io
import gdown
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client

from agents import set_default_openai_api, set_tracing_disabled
set_default_openai_api("chat_completions")
set_tracing_disabled(True)

from grading_agent.models import Submission, Module
from grading_agent.agentic import evaluate
from grading_agent.rubric import Rubric

app = Flask(__name__)
CORS(app)

# Initialize Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None


def extract_file_id(url: str) -> str:
    """Extract Google Drive file ID from a sharing link."""
    if not url or "drive.google.com" not in url:
        return None  # Not a Drive link (e.g. SharePoint)
    if "/d/" in url:
        return url.split("/d/")[1].split("/")[0]
    elif "id=" in url:
        return url.split("id=")[1].split("&")[0]
    return None


def _build_service_account_creds():
    """Build Google Service Account credentials from env vars."""
    google_email = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    google_key = os.environ.get("GOOGLE_PRIVATE_KEY")
    if not (google_email and google_key):
        return None
    from google.oauth2.service_account import Credentials
    # PEM cleaner: env-var UIs mangle newlines
    clean_key = google_key.replace('\\n', '\n').replace('\\"', '').replace('\\', '')
    start = clean_key.find('BEGIN PRIVATE KEY-----')
    end = clean_key.find('-----END PRIVATE KEY')
    if start != -1 and end != -1:
        b64_content = "".join(clean_key[start+22:end].split())
        wrapped = '\n'.join(b64_content[i:i+64] for i in range(0, len(b64_content), 64))
        private_key = f"-----BEGIN PRIVATE KEY-----\n{wrapped}\n-----END PRIVATE KEY-----\n"
    else:
        private_key = clean_key
    return Credentials.from_service_account_info({
        "client_email": google_email,
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token",
    }, scopes=['https://www.googleapis.com/auth/drive.readonly'])


def download_from_drive(file_id: str, dest: str):
    """Download a file from Google Drive.
    
    On Coolify (server IP), gdown is usually blocked by Google.
    So we try the Service Account FIRST (works from any IP), 
    then fall back to gdown (works on local PC for public files).
    """
    reasons = []

    # STEP 1: Try Service Account first (works from server IPs, no Google IP blocking)
    creds = _build_service_account_creds()
    if creds:
        try:
            print("Trying Service Account download...")
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaIoBaseDownload
            service = build('drive', 'v3', credentials=creds, cache_discovery=False)
            file_request = service.files().get_media(
                fileId=file_id, acknowledgeAbuse=True, supportsAllDrives=True
            )
            with io.FileIO(dest, 'wb') as fh:
                downloader = MediaIoBaseDownload(fh, file_request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
            if os.path.exists(dest) and os.path.getsize(dest) > 1000:
                print(f"Service Account download OK ({os.path.getsize(dest)} bytes)")
                return
            reasons.append("Service Account: file too small (likely an error page)")
        except Exception as e:
            reasons.append(f"Service Account: {type(e).__name__}: {str(e)[:200]}")
            if os.path.exists(dest):
                os.remove(dest)

    # STEP 2: Fall back to gdown (works for public files on local PC)
    try:
        print("Trying gdown public download...")
        gdown.download(id=file_id, output=dest, quiet=False)
        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
            print(f"gdown download OK ({os.path.getsize(dest)} bytes)")
            return
        reasons.append("gdown: file too small (likely error page)")
    except Exception as e:
        reasons.append(f"gdown: {str(e)[:200]}")
        if os.path.exists(dest):
            os.remove(dest)

    raise RuntimeError(f"All download methods failed: {'; '.join(reasons)}")


@app.route('/health', methods=['GET'])
def health():
    from grading_agent.llm_config import describe
    return jsonify({
        "status": "ok",
        "supabase_configured": supabase is not None,
        "drive_service_account_configured": bool(
            os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") and
            os.environ.get("GOOGLE_PRIVATE_KEY")),
        "llm": describe(),
    })


@app.route('/api/grade', methods=['POST'])
def grade_submission():
    """
    Expects JSON body with these fields from student_task_feedback table:
    {
        "id": "row uuid",
        "student_id": "student uuid",
        "task_id": "task identifier",
        "submission_link": "https://drive.google.com/file/d/...",
        "task_name": "Day 12 Task 2",         (optional, from tasks table join)
        "task_description": "Read and write...(optional, from tasks table join)
    }
    """
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400

    # Support Supabase Webhook format (data inside "record" key)
    row_data = data.get("record", data)

    submission_id = row_data.get('id')
    student_id = row_data.get('student_id')
    module_id = row_data.get('task_id')
    note_drive_url = row_data.get('submission_link')

    if not all([submission_id, student_id, module_id, note_drive_url]):
        return jsonify({"error": "Missing required fields: id, student_id, task_id, submission_link"}), 400

    # Validate it is a Google Drive link
    file_id = extract_file_id(note_drive_url)
    if not file_id:
        return jsonify({
            "error": f"submission_link is not a valid Google Drive URL: {note_drive_url}"
        }), 400

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            note_path = os.path.join(temp_dir, "note_upload")

            # Download from Google Drive
            try:
                download_from_drive(file_id, note_path)
            except RuntimeError as e:
                print(f"Drive download failed for {file_id}: {e}")
                return jsonify({"error": str(e)}), 500

            # Build the Module from the webhook/request payload
            task_name = row_data.get('task_name', 'Student Assignment')
            task_desc = row_data.get('task_description', 'No instructions provided.')

            module = Module(
                module_id=module_id or "default_module",
                title=task_name,
                instruction=task_desc,
                reference_content="",
                word_list=(),
                skill_type="note_taking",
                expects_handwritten_note=True,
                eye_contact_expected=False
            )

            submission = Submission(
                submission_id=submission_id,
                student_id=student_id,
                module_id=module_id,
                video_path=None,
                note_path=note_path
            )

            rubric = Rubric.load()

            # Run the AI grading agent
            graded = asyncio.run(
                evaluate(
                    submission,
                    module,
                    rubric,
                    video_path=None,
                    note_path=note_path,
                    module_lookup=lambda _: module,
                    model=None,  # uses LLM_BASE_URL + GRADING_MODEL from llm_config
                )
            )

            results = {
                "status": "ai_evaluated",
                "ai_overall_rating": graded.overall_rating,
                "ai_note_rating": graded.note.rating,
                "ai_feedback_en": graded.feedback.en if graded.feedback else "No feedback generated.",
                "ai_feedback_hi": graded.feedback.hi if graded.feedback else "",
                "ai_scores": [
                    {"parameter": score.parameter, "score": score.value, "note": score.note}
                    for score in graded.note.scores if score.is_assessed
                ]
            }

            if supabase:
                supabase.table('student_task_feedback').update(results).eq('id', submission_id).execute()
            else:
                print("WARNING: Supabase not configured. Results:")
                print(results)

            return jsonify({"message": "Grading complete", "results": results}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
