import os
import tempfile
import asyncio
import gdown
from flask import Flask, request, jsonify
from supabase import create_client, Client

# Import grading agent components
from grading_agent.models import Submission
from grading_agent.pipeline import GradingPipeline
from grading_agent.rubric import Rubric
from grading_agent.folder_source import FolderSubmissionSource
from grading_agent.agentic import evaluate

app = Flask(__name__)

# Initialize Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Create client only if credentials exist (to prevent crash on import before env vars are set)
if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None

def extract_file_id(url: str) -> str:
    """Extract Google Drive file ID from a standard sharing link."""
    # Handles links like: https://drive.google.com/file/d/1ABCXYZ.../view
    if "/d/" in url:
        return url.split("/d/")[1].split("/")[0]
    # Handles links like: https://drive.google.com/open?id=1ABCXYZ...
    elif "id=" in url:
        return url.split("id=")[1].split("&")[0]
    return url

@app.route('/api/grade', methods=['POST'])
def grade_submission():
    """
    Endpoint for React app to call.
    Expects JSON body:
    {
        "id": "uuid-of-student_task_feedback-row",
        "student_id": "uuid-of-student",
        "task_id": "day12_task2_english", 
        "submission_link": "https://drive.google.com/file/d/..."
    }
    """
    data = request.json
    if not data:
        return jsonify({"error": "No JSON payload provided"}), 400

    # If this request came from a Supabase Webhook, the data is inside the "record" key
    if "record" in data:
        row_data = data["record"]
    else:
        # Otherwise, assume it came directly from the React frontend
        row_data = data

    submission_id = row_data.get('id')
    student_id = row_data.get('student_id')
    module_id = row_data.get('task_id')  # Map task_id to module_id
    note_drive_url = row_data.get('submission_link')

    if not all([submission_id, student_id, module_id, note_drive_url]):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # Create a temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            note_path = os.path.join(temp_dir, "note.jpg")
            
            # Download the image from Google Drive
            file_id = extract_file_id(note_drive_url)
            
            google_email = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")
            google_key = os.environ.get("GOOGLE_PRIVATE_KEY")
            
            if google_email and google_key:
                print("Downloading using Google Service Account...")
                from google.oauth2.service_account import Credentials
                from googleapiclient.discovery import build
                from googleapiclient.http import MediaIoBaseDownload
                import io
                import re

                print(f"DEBUG: Raw key from Coolify (first 30 chars): {repr(google_key[:30])}")
                
                # Ultimate PEM Cleaner: Rebuild the PEM from scratch
                clean_key = google_key.replace('\\n', '\n').replace('\\"', '').replace('\\', '')
                
                start = clean_key.find('BEGIN PRIVATE KEY-----')
                end = clean_key.find('-----END PRIVATE KEY')
                
                if start != -1 and end != -1:
                    start += 22
                    b64_content = clean_key[start:end]
                    # Remove all whitespace and garbage
                    b64_content = "".join(b64_content.split())
                    # Wrap exactly at 64 chars per line standard
                    wrapped = '\n'.join(b64_content[i:i+64] for i in range(0, len(b64_content), 64))
                    private_key = f"-----BEGIN PRIVATE KEY-----\n{wrapped}\n-----END PRIVATE KEY-----\n"
                else:
                    private_key = clean_key
                    
                print(f"DEBUG: Cleaned key (first 40 chars): {repr(private_key[:40])}")
                
                creds = Credentials.from_service_account_info({
                    "client_email": google_email,
                    "private_key": private_key,
                    "token_uri": "https://oauth2.googleapis.com/token",
                }, scopes=['https://www.googleapis.com/auth/drive.readonly'])
                
                service = build('drive', 'v3', credentials=creds)
                file_request = service.files().get_media(fileId=file_id)
                with io.FileIO(note_path, 'wb') as fh:
                    downloader = MediaIoBaseDownload(fh, file_request)
                    done = False
                    while not done:
                        status, done = downloader.next_chunk()
            else:
                print("No Google credentials found. Attempting public download via gdown...")
                gdown_url = f'https://drive.google.com/uc?id={file_id}'
                gdown.download(gdown_url, note_path, quiet=False)

            if not os.path.exists(note_path):
                return jsonify({"error": "Failed to download image from Google Drive"}), 500

            # Set up the Agent inputs
            submission = Submission(
                submission_id=submission_id,
                student_id=student_id,
                module_id=module_id,
                video_path=None,  # We are skipping video for now as requested
                note_path=note_path
            )

            # Pull the task name and description directly from the Supabase webhook payload
            task_name = row_data.get('task_name', 'Student Assignment')
            task_desc = row_data.get('task_description', 'No instructions provided.')
            
            from grading_agent.models import Module
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
            
            rubric = Rubric.load()

            # Dummy lookup function since we aren't using local JSON files anymore
            def module_lookup(m_id: str):
                return module

            # Run the AI Agent! (Agentic Evaluator)
            graded = asyncio.run(
                evaluate(
                    submission, 
                    module, 
                    rubric, 
                    video_path=None, 
                    note_path=note_path,
                    module_lookup=module_lookup,
                    model="google/gemini-2.0-flash-exp:free"
                )
            )

            # Format the feedback to be sent to Supabase
            results = {
                "status": "ai_evaluated", # Update status to show AI is done
                "ai_overall_rating": graded.overall_rating,
                "ai_note_rating": graded.note.rating,
                "ai_feedback_en": graded.feedback.en if graded.feedback else "No feedback generated.",
                "ai_feedback_hi": graded.feedback.hi if graded.feedback else "",
                "ai_scores": [
                    {
                        "parameter": score.parameter,
                        "score": score.value,
                        "note": score.note
                    } 
                    for score in graded.note.scores if score.is_assessed
                ]
            }

            # Update Supabase if client is initialized
            if supabase:
                supabase.table('student_task_feedback').update(results).eq('id', submission_id).execute()
            else:
                print("WARNING: Supabase credentials not found. Cannot save to database.")
                print(f"Results: {results}")

            return jsonify({
                "message": "Grading complete",
                "results": results
            }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        
        # We intentionally DO NOT update Supabase here anymore!
        # If the AI fails (e.g. out of credits, Google Drive blocked), it will just print to the server logs
        # and leave the database completely alone so the UI doesn't get ruined.
        
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Run the server
    # Port can be set by environment variable (useful for Coolify/Render)
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
