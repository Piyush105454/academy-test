import os
import tempfile
import asyncio
import io
import threading
import concurrent.futures
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

# In-flight task deduplication guard
_IN_PROGRESS_TASKS = set()
_IN_PROGRESS_LOCK = threading.Lock()


def run_async_safe(coro, timeout=300):
    """
    Run an async coroutine safely in an isolated worker thread with its own event loop.
    
    Guarantees:
    - Truly isolated per-request event loop (no cross-request loop collisions).
    - Dedicated ThreadPoolExecutor per invocation, preventing 'cannot schedule new
      futures after shutdown' errors when concurrent requests finish at different times.
    - Explicit timeout (default 300s) to prevent stalled workers.
    """
    result_box = []
    error_box = []

    def _worker():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        # Dedicated executor isolated to this single request thread
        executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=4, thread_name_prefix=f"grading_t{threading.get_ident()}"
        )
        loop.set_default_executor(executor)
        try:
            res = loop.run_until_complete(asyncio.wait_for(coro, timeout=timeout))
            result_box.append(res)
        except Exception as e:
            error_box.append(e)
        finally:
            try:
                pending = asyncio.all_tasks(loop)
                for t in pending:
                    t.cancel()
                if pending:
                    loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass
            try:
                loop._default_executor = None
                executor.shutdown(wait=False, cancel_futures=True)
            except Exception:
                pass
            try:
                loop.close()
            except Exception:
                pass
            asyncio.set_event_loop(None)

    thread = threading.Thread(target=_worker, name=f"grading_async_runner_{threading.get_ident()}")
    thread.start()
    thread.join(timeout=timeout + 15)

    if thread.is_alive():
        raise TimeoutError(f"Grading execution timed out after {timeout} seconds")
    if error_box:
        raise error_box[0]
    if result_box:
        return result_box[0]
    raise RuntimeError("Async execution completed without returning a result or error")


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



def parse_submission_artifacts(raw_link: str, raw_types=None):
    """
    Parses submission_link and submission_types to extract (video_url, note_url).
    Supports JSON maps, comma-separated lists, and single URLs.
    """
    import json
    if not raw_link or not isinstance(raw_link, str):
        return None, None
        
    raw_str = raw_link.strip()
    video_url = None
    note_url = None

    # Case 1: JSON dictionary of { requirement_id: url }
    if raw_str.startswith("{") and raw_str.endswith("}"):
        try:
            link_map = json.loads(raw_str)
            type_map = {}
            if raw_types:
                types_list = raw_types if isinstance(raw_types, list) else json.loads(raw_types)
                for item in types_list:
                    parsed = json.loads(item) if isinstance(item, str) and item.strip().startswith("{") else item
                    if isinstance(parsed, dict) and "id" in parsed:
                        type_map[parsed["id"]] = (str(parsed.get("type", "")) + " " + str(parsed.get("title", ""))).lower()

            for req_id, url in link_map.items():
                if not url or not isinstance(url, str):
                    continue
                req_desc = type_map.get(req_id, "")
                if "video" in req_desc or any(ext in url.lower() for ext in [".mp4", ".mov", ".mkv", ".webm"]):
                    video_url = url
                elif any(k in req_desc for k in ["note", "pdf", "handnote"]) or any(ext in url.lower() for ext in [".pdf", ".jpg", ".png", ".jpeg"]):
                    note_url = url
                elif not note_url:
                    note_url = url
                elif not video_url:
                    video_url = url
            return video_url, note_url
        except Exception as e:
            print(f"JSON submission_link parse error: {e}")

    # Case 2: Comma-separated URLs
    links = [l.strip() for l in raw_str.split(",") if l.strip()]
    if len(links) == 1:
        if any(k in links[0].lower() for k in ["video", ".mp4", ".mov", ".mkv", ".webm"]):
            video_url = links[0]
        else:
            note_url = links[0]
    elif len(links) >= 2:
        video_url = links[0]
        note_url = links[1]

    return video_url, note_url


def download_from_drive(file_id: str, dest: str):
    """Download a file from Google Drive.
    
    Method order:
    1. requests with browser headers via drive.usercontent.google.com  
       → Works for PUBLIC files from any IP (bypasses bot detection)
    2. Service Account API  
       → Works for RESTRICTED files explicitly shared with the SA
    3. gdown fallback  
       → Last resort, often blocked on server IPs
    """
    reasons = []

    # METHOD 1: requests with browser-like headers (best for public files on servers)
    try:
        import requests
        print("Trying requests download (public file bypass)...")
        session = requests.Session()
        # Use Google's newer usercontent endpoint which is less aggressive about bot detection
        url = f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t&authuser=0"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://drive.google.com/',
        }
        response = session.get(url, headers=headers, stream=True, allow_redirects=True, timeout=120)
        response.raise_for_status()
        with open(dest, 'wb') as f:
            for chunk in response.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)
        if os.path.exists(dest) and os.path.getsize(dest) > 5000:
            print(f"requests download OK ({os.path.getsize(dest)} bytes)")
            return
        reasons.append(f"requests: file too small ({os.path.getsize(dest) if os.path.exists(dest) else 0} bytes - likely Google login page)")
        if os.path.exists(dest):
            os.remove(dest)
    except Exception as e:
        reasons.append(f"requests: {type(e).__name__}: {str(e)[:200]}")
        if os.path.exists(dest):
            os.remove(dest)

    # METHOD 2: Service Account (for restricted files explicitly shared with SA)
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

    # METHOD 3: gdown (last resort, often blocked on server IPs)
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


def download_from_sharepoint(url: str, dest: str):
    """
    Download a file or item from a Microsoft SharePoint or OneDrive link.
    Supports:
    1. Microsoft Graph API with Azure App Registration (for organization-restricted WES links).
    2. Direct file download with &download=1 (for public/open sharing links).
    """
    import base64
    import requests

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
    }

    # METHOD 1: Microsoft Graph API if Azure credentials are configured
    tenant_id = os.environ.get("AZURE_TENANT_ID") or "8de7d318-1a4e-4787-b5a5-74f02871f732"
    client_id = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")

    if client_id and client_secret:
        try:
            print("Attempting SharePoint download via Microsoft Graph API...")
            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
            token_resp = requests.post(token_url, data={
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials"
            }, timeout=30)
            token_resp.raise_for_status()
            access_token = token_resp.json().get("access_token")

            if access_token:
                # Microsoft Graph API allows resolving sharing links using base64 URL encoding
                b64 = base64.urlsafe_b64encode(url.encode("utf-8")).decode("utf-8").rstrip("=")
                share_token = f"u!{b64}"
                graph_headers = {"Authorization": f"Bearer {access_token}"}

                # Get item metadata
                item_url = f"https://graph.microsoft.com/v1.0/shares/{share_token}/driveItem"
                item_resp = requests.get(item_url, headers=graph_headers, timeout=30)
                
                if item_resp.status_code == 200:
                    item_data = item_resp.json()
                    # If it's a folder (:f:/ link), find the file inside
                    if "folder" in item_data:
                        children_url = f"{item_url}/children"
                        child_resp = requests.get(children_url, headers=graph_headers, timeout=30)
                        if child_resp.status_code == 200:
                            children = child_resp.json().get("value", [])
                            target_item = None
                            for c in children:
                                cname = c.get("name", "").lower()
                                if any(ext in cname for ext in [".mp4", ".mov", ".mkv", ".webm", ".pdf", ".jpg", ".jpeg", ".png"]):
                                    target_item = c
                                    break
                            if not target_item and children:
                                target_item = children[0]
                            if target_item:
                                download_url = target_item.get("@microsoft.graph.downloadUrl")
                                if download_url:
                                    dl_r = requests.get(download_url, stream=True, timeout=120)
                                    dl_r.raise_for_status()
                                    with open(dest, "wb") as f:
                                        for chunk in dl_r.iter_content(chunk_size=32768):
                                            if chunk:
                                                f.write(chunk)
                                    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
                                        print(f"Graph API folder child download OK ({os.path.getsize(dest)} bytes)")
                                        return
                    else:
                        download_url = item_data.get("@microsoft.graph.downloadUrl") or f"{item_url}/content"
                        dl_r = requests.get(download_url, headers=graph_headers, stream=True, timeout=120)
                        dl_r.raise_for_status()
                        with open(dest, "wb") as f:
                            for chunk in dl_r.iter_content(chunk_size=32768):
                                if chunk:
                                    f.write(chunk)
                        if os.path.exists(dest) and os.path.getsize(dest) > 1000:
                            print(f"Graph API file download OK ({os.path.getsize(dest)} bytes)")
                            return
        except Exception as e:
            print(f"Warning: Microsoft Graph API download error: {e}")

    # METHOD 2: Direct download via &download=1 (for public sharing links)
    try:
        print("Attempting direct SharePoint download (?download=1)...")
        if "download=1" not in url:
            sep = "&" if "?" in url else "?"
            dl_url = f"{url}{sep}download=1"
        else:
            dl_url = url

        session = requests.Session()
        resp = session.get(dl_url, headers=headers, stream=True, allow_redirects=True, timeout=120)
        
        if "login.microsoftonline.com" in resp.url or "login.live.com" in resp.url:
            raise PermissionError(
                "SharePoint link requires Microsoft 365 organization login. "
                "Please configure AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, or share via Google Drive."
            )
        
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)

        if os.path.exists(dest) and os.path.getsize(dest) > 5000:
            print(f"Direct SharePoint download OK ({os.path.getsize(dest)} bytes)")
            return
        elif os.path.exists(dest):
            os.remove(dest)
    except Exception as e:
        print(f"Direct SharePoint download failed: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        raise


def download_artifact(url: str, dest: str):
    """
    Unified media downloader supporting Google Drive, Microsoft SharePoint,
    and direct HTTP/HTTPS URLs.
    """
    if not url:
        raise ValueError("Empty URL provided")

    url_lower = url.lower()
    if "drive.google.com" in url_lower:
        file_id = extract_file_id(url)
        if not file_id:
            raise ValueError(f"Could not extract Google Drive file ID from {url}")
        return download_from_drive(file_id, dest)
    elif "sharepoint.com" in url_lower or "1drv.ms" in url_lower:
        return download_from_sharepoint(url, dest)
    else:
        import requests
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        r = requests.get(url, headers=headers, stream=True, timeout=120)
        r.raise_for_status()
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)


@app.route('/health', methods=['GET'])
def health():
    from grading_agent.llm_config import describe
    return jsonify({
        "status": "ok",
        "supabase_configured": supabase is not None,
        "drive_service_account_configured": bool(
            os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") and
            os.environ.get("GOOGLE_PRIVATE_KEY")),
        "sharepoint_graph_configured": bool(
            os.environ.get("AZURE_CLIENT_ID") and
            os.environ.get("AZURE_CLIENT_SECRET")),
        "groq_whisper_configured": bool(os.environ.get("GROQ_API_KEY")),
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
        "submission_link": "https://drive.google.com/... or https://wesfoundationorg.sharepoint.com/...",
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
    raw_submission_link = row_data.get('submission_link')
    raw_submission_types = row_data.get('submission_types')

    if not all([submission_id, student_id, module_id, raw_submission_link]):
        return jsonify({"error": "Missing required fields: id, student_id, task_id, submission_link"}), 400

    video_url, note_url = parse_submission_artifacts(raw_submission_link, raw_submission_types)

    if not video_url and not note_url:
        return jsonify({
            "error": f"No valid media URL found in submission_link: {raw_submission_link}"
        }), 400

    # 1. Deduplication guard: reject identical concurrent requests
    with _IN_PROGRESS_LOCK:
        if submission_id in _IN_PROGRESS_TASKS:
            print(f"Skipping duplicate concurrent request for submission {submission_id}")
            return jsonify({
                "message": f"Evaluation already in progress for submission {submission_id}",
                "status": "processing"
            }), 200
        _IN_PROGRESS_TASKS.add(submission_id)

    # 2. Database guard: skip if already evaluated with scores
    if supabase:
        try:
            existing = supabase.table('student_task_feedback').select('status, ai_overall_rating').eq('id', submission_id).maybe_single().execute()
            if existing and existing.data:
                if existing.data.get('status') == 'ai_evaluated' and existing.data.get('ai_overall_rating') is not None:
                    print(f"Submission {submission_id} is already evaluated (rating={existing.data.get('ai_overall_rating')}). Skipping.")
                    with _IN_PROGRESS_LOCK:
                        _IN_PROGRESS_TASKS.discard(submission_id)
                    return jsonify({
                        "message": "Submission already evaluated",
                        "status": "ai_evaluated",
                        "ai_overall_rating": existing.data.get('ai_overall_rating')
                    }), 200
        except Exception as pre_err:
            print(f"Supabase pre-check warning: {pre_err}")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            note_path = None
            video_path = None

            # 1. Download Note if present
            if note_url:
                note_dest = os.path.join(temp_dir, "note_upload")
                try:
                    print(f"Downloading student note from: {note_url}...")
                    download_artifact(note_url, note_dest)
                    note_path = note_dest
                except Exception as e:
                    print(f"Warning: Failed to download note from {note_url}: {e}")

            # 2. Download Video if present
            if video_url:
                video_dest = os.path.join(temp_dir, "video_upload.mp4")
                try:
                    print(f"Downloading student video from: {video_url}...")
                    download_artifact(video_url, video_dest)
                    video_path = video_dest
                except Exception as e:
                    print(f"Warning: Failed to download video from {video_url}: {e}")

            if not note_path and not video_path:
                return jsonify({"error": "Failed to download media artifacts (Google Drive / SharePoint failed or restricted)"}), 500

            # Build the Module from the webhook/request payload
            task_name = row_data.get('task_name', 'Student Assignment')
            task_desc = row_data.get('task_description', 'No instructions provided.')

            skill_type = "both" if (video_path and note_path) else ("presentation" if video_path else "note_taking")

            module = Module(
                module_id=module_id or "default_module",
                title=task_name,
                instruction=task_desc,
                reference_content="",
                word_list=(),
                skill_type=skill_type,
                expects_handwritten_note=bool(note_path),
                eye_contact_expected=bool(video_path)
            )

            submission = Submission(
                submission_id=submission_id,
                student_id=student_id,
                module_id=module_id,
                video_path=video_path,
                note_path=note_path
            )

            rubric = Rubric.load()

            print(f"Running AI Evaluation: video={bool(video_path)}, note={bool(note_path)}")

            # Run the AI grading agent
            graded = run_async_safe(
                evaluate(
                    submission,
                    module,
                    rubric,
                    video_path=video_path,
                    note_path=note_path,
                    module_lookup=lambda _: module,
                    model=None,  # uses LLM_BASE_URL + GRADING_MODEL from llm_config
                )
            )

            ai_scores_list = []
            if graded.note and graded.note.scores:
                ai_scores_list += [
                    {"parameter": score.parameter, "score": score.value, "note": score.note, "artifact": "note"}
                    for score in graded.note.scores if score.is_assessed
                ]
            if graded.video and graded.video.scores:
                ai_scores_list += [
                    {"parameter": score.parameter, "score": score.value, "note": score.note, "artifact": "video"}
                    for score in graded.video.scores if score.is_assessed
                ]

            results = {
                "status": "ai_evaluated",
                "ai_overall_rating": graded.overall_rating,
                "ai_note_rating": graded.note.rating if graded.note else None,
                "ai_feedback_en": graded.feedback.en if graded.feedback else "No feedback generated.",
                "ai_feedback_hi": graded.feedback.hi if graded.feedback else "",
                "ai_scores": ai_scores_list
            }

            if supabase:
                try:
                    db_result = supabase.table('student_task_feedback').update(results).eq('id', submission_id).execute()
                    print(f"Supabase update OK for {submission_id}: status={results['status']}, overall={results['ai_overall_rating']}")
                except Exception as db_err:
                    print(f"ERROR: Supabase update FAILED for {submission_id}: {db_err}")
                    raise
            else:
                print("WARNING: Supabase not configured. Results:")
                print(results)

            return jsonify({"message": "Grading complete", "results": results}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        with _IN_PROGRESS_LOCK:
            _IN_PROGRESS_TASKS.discard(submission_id)


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
