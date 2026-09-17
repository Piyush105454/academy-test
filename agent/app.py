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

    submission_id = data.get('id')
    student_id = data.get('student_id')
    module_id = data.get('task_id')  # Map task_id to module_id
    note_drive_url = data.get('submission_link')

    if not all([submission_id, student_id, module_id, note_drive_url]):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        # Create a temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            note_path = os.path.join(temp_dir, "note.jpg")
            
            # Download the public image from Google Drive
            file_id = extract_file_id(note_drive_url)
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

            # Use local modules from sample_data for lookup
            # In a real system, you might fetch the module config from Supabase
            base_dir = os.path.dirname(os.path.abspath(__file__))
            source = FolderSubmissionSource(os.path.join(base_dir, "sample_data"))
            module = source.load_module(module_id)
            rubric = Rubric.load()

            # Run the AI Agent! (Agentic Evaluator)
            # We use asyncio.run because `evaluate` is an async function
            graded = asyncio.run(
                evaluate(
                    submission, 
                    module, 
                    rubric, 
                    video_path=None, 
                    note_path=note_path,
                    module_lookup=source.load_module
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
        
        # Mark as failed in Supabase
        if supabase:
            supabase.table('student_task_feedback').update({
                'status': 'ai_failed',
                'ai_feedback_en': str(e)
            }).eq('id', submission_id).execute()

        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Run the server
    # Port can be set by environment variable (useful for Coolify/Render)
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
