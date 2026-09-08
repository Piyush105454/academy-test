interface UploaderOptions {
  file: File;
  folderPath?: string[];
  supabaseUrl: string;
  accessToken?: string;
  onProgress?: (progress: number) => void;
  chunkSize?: number; // default to 5MB
}

export class GoogleDriveResumableUploader {
  private file: File;
  private folderPath?: string[];
  private supabaseUrl: string;
  private accessToken?: string;
  private onProgress?: (progress: number) => void;
  private chunkSize: number;
  
  private uploadUrl: string | null = null;
  private aborted = false;

  constructor(options: UploaderOptions) {
    this.file = options.file;
    this.folderPath = options.folderPath;
    this.supabaseUrl = options.supabaseUrl;
    this.accessToken = options.accessToken;
    this.onProgress = options.onProgress;
    this.chunkSize = options.chunkSize || 30 * 1024 * 1024; // 30MB default for fewer roundtrips
  }

  abort() {
    this.aborted = true;
  }

  async upload(): Promise<{ fileId: string, webViewLink: string }> {
    // 1. Get resumable session URL from our backend
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const sessionRes = await fetch(`${this.supabaseUrl}/functions/v1/upload-to-gdrive-resumable`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        action: 'create-session',
        fileName: this.file.name,
        fileType: this.file.type,
        folderPath: this.folderPath
      })
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`Failed to create upload session: ${errText}`);
    }

    const sessionData = await sessionRes.json();
    this.uploadUrl = sessionData.uploadUrl;
    if (!this.uploadUrl) {
      throw new Error('Backend did not return an upload URL');
    }

    // 2. Upload file in chunks
    const fileSize = this.file.size;
    let startByte = 0;
    const maxRetries = 5;
    let fileId = '';

    while (startByte < fileSize) {
      if (this.aborted) {
        throw new Error("Upload aborted");
      }

      const endByte = Math.min(startByte + this.chunkSize, fileSize);
      const chunk = this.file.slice(startByte, endByte);
      let attempt = 0;
      let chunkUploaded = false;

      while (!chunkUploaded && attempt < maxRetries) {
        if (this.aborted) {
          throw new Error("Upload aborted");
        }

        try {
          const res = await fetch(this.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${startByte}-${endByte - 1}/${fileSize}`,
            },
            body: chunk,
          });

          if (res.status === 308) {
            // Incomplete - proceed to next chunk
            chunkUploaded = true;
            // The Range header in response tells us what Google received, e.g. "bytes=0-5242879"
            const range = res.headers.get('Range');
            if (range) {
              const matched = range.match(/bytes=0-(\d+)/);
              if (matched) {
                startByte = parseInt(matched[1], 10) + 1;
              } else {
                startByte = endByte;
              }
            } else {
               startByte = endByte;
            }
          } else if (res.status === 200 || res.status === 201) {
            // Finished
            chunkUploaded = true;
            startByte = fileSize; // exit loop
            const resultData = await res.json();
            fileId = resultData.id;
          } else {
            // Unexpected status, let's throw and catch to retry
            throw new Error(`Unexpected status ${res.status}`);
          }
          
          if (this.onProgress) {
            const percent = Math.round((startByte / fileSize) * 100);
            this.onProgress(Math.min(percent, 100)); // ensure it doesn't exceed 100
          }

        } catch (err) {
          attempt++;
          console.error(`Chunk upload failed, attempt ${attempt}/${maxRetries}`, err);
          if (attempt >= maxRetries) {
            throw new Error(`Upload failed after ${maxRetries} attempts`);
          }
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Before retrying the PUT, we must check the status to see how many bytes were actually received
          startByte = await this.checkStatus(fileSize);
        }
      }
    }

    if (!fileId) {
      throw new Error("Upload finished but no fileId returned from Google Drive");
    }

    // 3. Finalize upload (set permissions, get link)
    const finalizeRes = await fetch(`${this.supabaseUrl}/functions/v1/upload-to-gdrive-resumable`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        action: 'finalize',
        fileId: fileId
      })
    });

    if (!finalizeRes.ok) {
      const errText = await finalizeRes.text();
      throw new Error(`Failed to finalize upload: ${errText}`);
    }

    const finalData = await finalizeRes.json();
    return {
      fileId: finalData.fileId,
      webViewLink: finalData.webViewLink
    };
  }

  private async checkStatus(fileSize: number): Promise<number> {
    if (!this.uploadUrl) return 0;
    
    try {
      const res = await fetch(this.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        }
      });
      
      if (res.status === 308) {
        const range = res.headers.get('Range');
        if (range) {
          const matched = range.match(/bytes=0-(\d+)/);
          if (matched) {
            return parseInt(matched[1], 10) + 1;
          }
        }
      }
    } catch (err) {
      console.error("Status check failed", err);
    }
    
    return 0; // if status check fails or returns weird response, just start from 0
  }
}
