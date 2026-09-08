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
    let usedEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL2');
    let usedKey = Deno.env.get('GOOGLE_PRIVATE_KEY2');
    let usedFolderId = Deno.env.get('GOOGLE_DRIVE_HOMEWORK_FOLDER_ID2');

    usedEmail = usedEmail?.trim().replace(/^["']|["']$/g, '');
    usedFolderId = usedFolderId?.trim().replace(/^["']|["']$/g, '');

    if (!usedEmail || !usedKey || !usedFolderId) {
      throw new Error("Missing Google Drive credentials in environment variables");
    }

    // Safely parse the key if it's wrapped in quotes from .env
    usedKey = usedKey.trim();
    if (usedKey.startsWith('"') && usedKey.endsWith('"')) {
      try {
        usedKey = JSON.parse(usedKey);
      } catch (e) {
        usedKey = usedKey.replace(/^"|"$/g, '');
      }
    } else if (usedKey.startsWith("'") && usedKey.endsWith("'")) {
      usedKey = usedKey.slice(1, -1);
    }

    // Ensure escaped newlines are converted to real newlines
    usedKey = usedKey.replace(/\\n/g, '\n');
    // Strip carriage returns which can invalidate the signature
    usedKey = usedKey.replace(/\\r/g, '').replace(/\r/g, '');

    const auth = new JWT({
      email: usedEmail,
      key: usedKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const accessToken = await auth.getAccessToken();

    const body = await req.json();
    const { action } = body;

    if (action === 'create-session') {
      const { fileName, fileType, folderPath } = body;
      
      if (!fileName) {
        return new Response(JSON.stringify({ error: 'fileName is required' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      async function getOrCreateFolder(folderName: string, parentId: string, token: string): Promise<string> {
        const escapedName = folderName.replace(/'/g, "\\'");
        const query = encodeURIComponent(`name='${escapedName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!searchRes.ok) throw new Error(`Error searching folder ${folderName}: ${searchRes.statusText}`);
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
        });

        if (!createRes.ok) throw new Error(`Error creating folder ${folderName}: ${createRes.statusText}`);
        const createData = await createRes.json();
        return createData.id;
      }

      let targetFolderId = usedFolderId;
      if (folderPath && Array.isArray(folderPath)) {
        try {
          for (const folderName of folderPath) {
            if (folderName) {
              targetFolderId = await getOrCreateFolder(folderName, targetFolderId, accessToken.token as string);
            }
          }
        } catch (err) {
          console.error("Error creating folder path:", err);
        }
      }

      const metadata = {
        name: fileName,
        parents: [targetFolderId],
      };

      const sessionRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': fileType || 'application/octet-stream',
          'Origin': req.headers.get('origin') || '*' 
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

      return new Response(JSON.stringify({ 
        success: true, 
        uploadUrl: uploadUrl 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'finalize') {
      const { fileId } = body;
      
      if (!fileId) {
        return new Response(JSON.stringify({ error: 'fileId is required' }), { 
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

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
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('Error in upload-to-gdrive-resumable:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
