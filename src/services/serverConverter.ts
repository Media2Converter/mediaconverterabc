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
 * iPhone (QuickTime / 写真アプリ) で確実に読み取れるメタデータ設定。
 * サーバー側の FFmpeg に渡してもらうためのパラメータ。
 */
export const IPHONE_COMPAT_OPTIONS: Record<string, string> = {
  // 映像: H.264 High/Main まで、8bit 4:2:0
  vcodec: 'libx264',
  profile: 'high',
  level: '4.1',
  pix_fmt: 'yuv420p',
  // 音声: AAC-LC / 48kHz / ステレオ
  acodec: 'aac',
  ar: '48000',
  ac: '2',
  // メタデータ: moov atom を先頭へ（iPhoneの読み取り必須条件）
  movflags: '+faststart',
  // 回転情報などを正しく書き出す
  map_metadata: '0',
  brand: 'mp42',
  // iPhone向け互換モード（サーバー実装が参照できる汎用フラグ）
  target: 'iphone',
  ios_compatible: 'true',
};

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

  // iPhoneで再生・読み取りできるメタデータ／コーデック指定
  for (const [k, v] of Object.entries(IPHONE_COMPAT_OPTIONS)) {
    form.append(k, v);
  }
  form.append('options', JSON.stringify(IPHONE_COMPAT_OPTIONS));


  let res: Response;
  try {
    const query = new URLSearchParams({ format: ext, ...IPHONE_COMPAT_OPTIONS });
    res = await fetch(`${CONVERT_ENDPOINT}?${query.toString()}`, {
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
