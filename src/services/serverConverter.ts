/** Server-side video conversion API (Render) */
export const CONVERT_API_URL = 'https://ffmpeg-api-kn47.onrender.com';

let controller: AbortController | null = null;

export function requestAbort() {
  controller?.abort();
}

/** POST the file to the conversion API and return a blob URL of the AVI result */
export async function convertOnServer(
  file: File,
  onStatus?: (status: string) => void,
): Promise<{ url: string; filename: string }> {
  controller = new AbortController();
  onStatus?.('サーバーで変換中...');

  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(CONVERT_API_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('ユーザーによりキャンセルされました');
    throw new Error(`変換サーバーに接続できませんでした: ${e?.message || e}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`変換サーバーがエラーを返しました (HTTP ${res.status})\n${text}`.trim());
  }

  const blob = await res.blob();
  if (blob.size === 0) throw new Error('変換サーバーから空のファイルが返されました');

  const url = URL.createObjectURL(new Blob([blob], { type: 'video/x-msvideo' }));
  return { url, filename: 'output.avi' };
}
