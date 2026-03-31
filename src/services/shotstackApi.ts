// Shotstack API Service
// Sandbox environment

const SHOTSTACK_API_KEY = 'X2tWX1NPvFaqMAb58ZNGoeVmcergSIeopxUojKrG';
const INGEST_BASE = 'https://api.shotstack.io/ingest/stage';
const EDIT_BASE = 'https://api.shotstack.io/edit/stage';
const TEMPLATE_ID = '503c10e9-c9bf-4c5f-b688-68a35f727917';

const headers = {
  'x-api-key': SHOTSTACK_API_KEY,
  'Accept': 'application/json',
};

export interface UploadResult {
  id: string;
  url: string;
}

export interface RenderResult {
  id: string;
}

export interface RenderStatus {
  status: 'submitted' | 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed';
  url?: string;
  error?: string;
}

/**
 * Step 1: Request a signed upload URL from Shotstack Ingest API
 */
export async function requestUploadUrl(): Promise<UploadResult> {
  const res = await fetch(`${INGEST_BASE}/upload`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`アップロードURL取得失敗 [${res.status}]: ${body}`);
  }
  const json = await res.json();
  return {
    id: json.data?.id || json.data?.attributes?.id,
    url: json.data?.attributes?.url || json.data?.url,
  };
}

/**
 * Step 2: Upload file to the signed URL
 */
export async function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 30); // Upload is 0-30%
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`ファイルアップロード失敗 [${xhr.status}]`));
      }
    };

    xhr.onerror = () => reject(new Error('ファイルアップロード中にネットワークエラーが発生しました'));
    xhr.send(file);
  });
}

/**
 * Step 3: Get the source asset URL for the uploaded file
 */
export async function getSourceUrl(sourceId: string): Promise<string> {
  // Poll until the source is ready
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${INGEST_BASE}/sources/${sourceId}`, { headers });
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    const json = await res.json();
    const status = json.data?.attributes?.status;
    if (status === 'ready') {
      return json.data?.attributes?.url || json.data?.attributes?.source;
    }
    if (status === 'failed') {
      throw new Error('ソースファイルの処理に失敗しました');
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('ソースファイルの処理がタイムアウトしました');
}

/**
 * Step 4: Render template with the uploaded asset
 */
export async function renderTemplate(
  sourceUrl: string,
  mergeFields?: Array<{ find: string; replace: string }>
): Promise<RenderResult> {
  const body: any = {
    id: TEMPLATE_ID,
    merge: mergeFields || [
      { find: 'URL', replace: sourceUrl },
    ],
  };

  const res = await fetch(`${EDIT_BASE}/templates/render`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`テンプレートレンダリング開始失敗 [${res.status}]: ${text}`);
  }

  const json = await res.json();
  return { id: json.response?.id || json.data?.id };
}

/**
 * Step 5: Poll render status until done
 */
export async function pollRenderStatus(
  renderId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const statusProgress: Record<string, number> = {
    submitted: 35,
    queued: 40,
    fetching: 50,
    rendering: 65,
    saving: 85,
    done: 100,
  };

  for (let i = 0; i < 300; i++) {
    const res = await fetch(`${EDIT_BASE}/render/${renderId}`, { headers });
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    const json = await res.json();
    const status = json.response?.status || json.data?.attributes?.status;
    const url = json.response?.url || json.data?.attributes?.url;

    if (onProgress && statusProgress[status]) {
      onProgress(statusProgress[status]);
    }

    if (status === 'done' && url) {
      return url;
    }

    if (status === 'failed') {
      const error = json.response?.error || json.data?.attributes?.error || '不明なエラー';
      throw new Error(`レンダリング失敗: ${error}`);
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error('レンダリングがタイムアウトしました（最大15分）');
}

/**
 * Full conversion pipeline
 */
export async function convertWithShotstack(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  // 1. Request signed upload URL
  onProgress?.(5);
  const { id: sourceId, url: signedUrl } = await requestUploadUrl();

  // 2. Upload file
  await uploadFileToSignedUrl(signedUrl, file, onProgress);
  onProgress?.(30);

  // 3. Wait for source to be ready and get its URL
  onProgress?.(32);
  const sourceUrl = await getSourceUrl(sourceId);
  onProgress?.(35);

  // 4. Start template render
  const { id: renderId } = await renderTemplate(sourceUrl);
  onProgress?.(40);

  // 5. Poll until done
  const downloadUrl = await pollRenderStatus(renderId, onProgress);
  return downloadUrl;
}
