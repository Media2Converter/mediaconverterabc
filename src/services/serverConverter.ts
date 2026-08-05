/** Server-side media conversion API (Render) */
export const CONVERT_API_URL = 'https://ffmpeg-api-kn47.onrender.com';
export const CONVERT_ENDPOINT = `${CONVERT_API_URL}/api/convert`;

let controller: AbortController | null = null;

export function requestAbort() {
  controller?.abort();
}

export interface ServerConvertResult {
  url: string;
  filename: string;
  /** Extension the server actually returned */
  actualExt: string;
  /** True when the server ignored the requested format */
  formatMismatch: boolean;
}

/**
 * POST the file (plus the requested output format) to the conversion API.
 * The returned blob is named with the requested format's extension.
 */
export async function convertOnServer(
  file: File,
  format: string,
  ext: string,
  mime: string,
  onStatus?: (status: string) => void,
): Promise<ServerConvertResult> {
  controller = new AbortController();
  onStatus?.('サーバーで変換中...');

  const form = new FormData();
  form.append('file', file);
  // Send the requested format under several common key names so the API can pick it up
  form.append('format', ext);
  form.append('output_format', ext);
  form.append('ext', ext);
  form.append('label', format);

  let res: Response;
  try {
    res = await fetch(`${CONVERT_ENDPOINT}?format=${encodeURIComponent(ext)}`, {
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

  const disposition = res.headers.get('content-disposition') || '';
  const nameMatch = disposition.match(/filename="?([^";]+)"?/i);
  const serverName = nameMatch?.[1] || '';
  const actualExt = (serverName.split('.').pop() || ext).toLowerCase();

  const blob = await res.blob();
  if (blob.size === 0) throw new Error('変換サーバーから空のファイルが返されました');

  const url = URL.createObjectURL(new Blob([blob], { type: mime || blob.type }));
  return {
    url,
    filename: `output.${ext}`,
    actualExt,
    formatMismatch: actualExt !== ext.toLowerCase(),
  };
}
