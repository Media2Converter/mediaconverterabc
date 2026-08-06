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
 * NOTE: サーバー(multer)は "file" 以外のファイルフィールドを拒否する (MulterError: Unexpected field)
 * ため、ファイルフィールドは "file" のみ送信し、指示書はテキストフィールドで送る。
 */
export async function convertOnServer(
  file: File,
  format: string,
  ext: string,
  mime: string,
  onStatus?: (status: string) => void,
  instructions?: { js: string; params: Record<string, string> },
  onProgress?: (percent: number) => void,
): Promise<ServerConvertResult> {
  onStatus?.('サーバーで変換中...');

  const form = new FormData();
  // 唯一のファイルフィールド
  form.append('file', file);
  form.append('format', ext);
  form.append('output_format', ext);
  form.append('ext', ext);
  form.append('label', format);

  for (const [k, v] of Object.entries(IPHONE_COMPAT_OPTIONS)) {
    form.append(k, v);
  }
  form.append('options', JSON.stringify(IPHONE_COMPAT_OPTIONS));

  // 指示書はテキストとして送信（ファイル添付にはしない）
  if (instructions) {
    form.append('instructions_language', 'javascript');
    form.append('instructions_js', instructions.js);
    for (const [k, v] of Object.entries(instructions.params)) form.append(k, v);
  }

  const query = new URLSearchParams({ format: ext, ...IPHONE_COMPAT_OPTIONS, ...(instructions?.params || {}) });
  const url = `${CONVERT_ENDPOINT}?${query.toString()}`;

  // XHR を使い、アップロード／ダウンロード進捗をリアルタイムに通知する
  const { blob, serverName } = await new Promise<{ blob: Blob; serverName: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef = xhr;
    xhr.open('POST', url);
    xhr.responseType = 'blob';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 45;
        onProgress?.(pct);
        onStatus?.(`アップロード中... ${Math.round((e.loaded / e.total) * 100)}%`);
      }
    };
    xhr.upload.onload = () => {
      onProgress?.(50);
      onStatus?.('サーバーで変換中...');
    };
    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.(50 + (e.loaded / e.total) * 50);
        onStatus?.(`変換結果を受信中... ${Math.round((e.loaded / e.total) * 100)}%`);
      } else {
        onProgress?.(75);
      }
    };
    xhr.onerror = () => reject(new Error('変換サーバーに接続できませんでした'));
    xhr.onabort = () => reject(new Error('ユーザーによりキャンセルされました'));
    xhr.onload = async () => {
      const disposition = xhr.getResponseHeader('content-disposition') || '';
      const nameMatch = disposition.match(/filename="?([^";]+)"?/i);
      if (xhr.status < 200 || xhr.status >= 300) {
        let text = '';
        try { text = await (xhr.response as Blob).text(); } catch {}
        const plain = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
        reject(new Error(`変換サーバーがエラーを返しました (HTTP ${xhr.status})\n${plain}`.trim()));
        return;
      }
      resolve({ blob: xhr.response as Blob, serverName: nameMatch?.[1] || '' });
    };
    xhr.send(form);
  });

  if (blob.size === 0) throw new Error('変換サーバーから空のファイルが返されました');
  onProgress?.(100);

  const actualExt = (serverName.split('.').pop() || ext).toLowerCase();
  const objectUrl = URL.createObjectURL(new Blob([blob], { type: mime || blob.type }));
  return {
    url: objectUrl,
    filename: `output.${ext}`,
    actualExt,
    formatMismatch: actualExt !== ext.toLowerCase(),
  };
}


/**
 * FFmpeg.WASM APIサーバの初期化（ウォームアップ）。
 * Render の無料インスタンスはスリープするため、起動を待ちながら進捗を報告する。
 */
export async function initializeServer(
  onStatus?: (status: string) => void,
  onProgress?: (percent: number) => void,
): Promise<void> {
  controller = new AbortController();
  const started = Date.now();
  const TIMEOUT = 90_000;
  let attempt = 0;

  while (Date.now() - started < TIMEOUT) {
    attempt++;
    const elapsed = Date.now() - started;
    onProgress?.(Math.min(95, (elapsed / TIMEOUT) * 100));
    onStatus?.(`FFmpeg.WASM APIサーバを初期化中...\n(${attempt}回目の接続を試行中)`);
    try {
      const res = await fetch(`${CONVERT_API_URL}/`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.ok || res.status === 404 || res.status === 405) {
        onProgress?.(100);
        onStatus?.('FFmpeg.WASM APIサーバの初期化が完了しました');
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error('ユーザーによりキャンセルされました');
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('FFmpeg.WASM APIサーバの初期化がタイムアウトしました');
}
