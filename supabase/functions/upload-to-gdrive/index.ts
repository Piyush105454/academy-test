import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { JWT } from "npm:google-auth-library@9.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let email = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL2');
    let key = Deno.env.get('GOOGLE_PRIVATE_KEY2');
    let folderId = Deno.env.get('GOOGLE_DRIVE_HOMEWORK_FOLDER_ID2');

    if (!email || !key || !folderId) {
      throw new Error("Missing Google Drive credentials in environment variables");
    }

    email = email.trim().replace(/^["']|["']$/g, '');
    folderId = folderId.trim().replace(/^["']|["']$/g, '');
    
    key = key.trim();
    if (key.startsWith('"') && key.endsWith('"')) {
      try {
        key = JSON.parse(key);
      } catch (e) {
        key = key.replace(/^"|"$/g, '');
      }
    } else if (key.startsWith("'") && key.endsWith("'")) {
      key = key.slice(1, -1);
    }

    key = key.replace(/\\n/g, '\n');
    key = key.replace(/\\r/g, '').replace(/\r/g, '');

    const auth = new JWT({
      email: email,
      key: key,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const accessToken = await auth.getAccessToken();

    if (req.method === 'DELETE') {
      const { link } = await req.json();
      const match = link?.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) {
        return new Response(JSON.stringify({ error: 'Invalid Google Drive link' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      const fileId = match[1];

      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
        },
      });

      if (!delRes.ok) {
        const errorText = await delRes.text();
        console.error("Delete error:", errorText);
        throw new Error(`Google Drive API error deleting file: ${delRes.statusText}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST request logic (Upload)
    const formData = await req.formData();
    const file = formData.get('file');
    const folderPathStr = formData.get('folderPath');
    
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    async function getOrCreateFolder(folderName: string, parentId: string, token: string): Promise<string> {
      // 1. Search for the folder
      const escapedName = folderName.replace(/'/g, "\\'");
      const query = encodeURIComponent(`name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!searchRes.ok) throw new Error(`Error searching folder ${folderName}: ${searchRes.statusText}`);
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

      // 2. Create it
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
      });

      if (!createRes.ok) throw new Error(`Error creating folder ${folderName}: ${createRes.statusText}`);
      const createData = await createRes.json();
      return createData.id;
    }

    let targetFolderId = folderId;

    if (folderPathStr) {
      try {
        const folders = JSON.parse(folderPathStr as string);
        for (const folderName of folders) {
          if (folderName) {
            targetFolderId = await getOrCreateFolder(folderName, targetFolderId, accessToken.token);
          }
        }
      } catch (err) {
        console.error("Error creating folder path:", err);
      }
    }

    // 1. Start Resumable Upload Session
    const metadata = {
      name: file.name,
      parents: [targetFolderId],
    };

    const sessionRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
      },
      body: JSON.stringify(metadata),
    });

    if (!sessionRes.ok) {
      const errorText = await sessionRes.text();
      console.error("Session error:", errorText);
      throw new Error(`Google Drive API error starting session: ${sessionRes.statusText}`);
    }

    const uploadUrl = sessionRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error("Did not receive upload URL from Google Drive");
    }

    // 2. Upload the file content
    const fileBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': fileBuffer.byteLength.toString(),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.error("Upload error:", errorText);
      throw new Error(`Google Drive API error uploading file: ${uploadRes.statusText}`);
    }

    // To get the webViewLink, we need to request it specifically
    const uploadedFileData = await uploadRes.json();
    const fileId = uploadedFileData.id;

    // Make public and get link
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,webViewLink&supportsAllDrives=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      },
    });
    
    const finalData = await getRes.json();

    return new Response(JSON.stringify({ 
      success: true, 
      fileId: fileId,
      webViewLink: finalData.webViewLink
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in upload-to-gdrive:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
