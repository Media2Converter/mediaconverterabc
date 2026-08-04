import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreJsAsset from '@/assets/ffmpeg-core.js.asset.json';
import coreWasmAsset from '@/assets/ffmpeg-core.wasm.asset.json';
import {
  CODEC_MAP, AAC_HE_PROFILE, FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  type ConvertSettings,
} from '@/constants/converterOptions';


let ffmpeg: FFmpeg | null = null;
let abortRequested = false;

export function requestAbort() {
  abortRequested = true;
}

/** Log lines that FFmpeg writes to stderr as normal info/warnings — never errors */
const BENIGN_LOG_PATTERNS = [
  '[swscaler]',
  'swscaler',
  'deprecated pixel format',
  'Stream #',
  'Stream mapping',
  'Input #',
  'Output #',
  'Metadata:',
  'encoder ',
  'built with',
  'configuration:',
  'lib',
  'frame=',
  'size=',
  'video:',
  'Press [q]',
  'Guessed Channel Layout',
  'Last message repeated',
  'No accelerated colorspace conversion',
];

/** True only when the log line looks like a real error (not info/warning noise) */
export function isFfmpegErrorLog(msg: string): boolean {
  if (!msg || !msg.trim()) return false;
  if (BENIGN_LOG_PATTERNS.some(p => msg.includes(p))) return false;
  return /error|invalid|failed|unable|not supported|no such file|unknown encoder|conversion failed|out of memory/i.test(msg);
}

/** True when the log line is a real FFmpeg warning (not info noise, not an error) */
export function isFfmpegWarningLog(msg: string): boolean {
  if (!msg || !msg.trim()) return false;
  if (BENIGN_LOG_PATTERNS.some(p => msg.includes(p))) return false;
  if (isFfmpegErrorLog(msg)) return false;
  return /warning|deprecated|non-monotonous|not enough|mismatch|overflow|dropping|misaligned|could not|ignoring|unsupported/i.test(msg);
}


/** Reset FFmpeg instance completely */
export function resetFFmpeg() {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch {}
  }
  ffmpeg = null;
}

let coreUrls: { coreURL: string; wasmURL: string } | null = null;

const CDN_CORE_JS = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
const CDN_CORE_WASM = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm';

/** core.js is served from the app itself (public/ffmpeg), asset, then CDN */
const CORE_JS_SOURCES = ['/ffmpeg/ffmpeg-core.js', coreJsAsset.url, CDN_CORE_JS];
const CORE_WASM_SOURCES = [coreWasmAsset.url, CDN_CORE_WASM];

async function fetchCoreJs(): Promise<string> {
  const errors: string[] = [];
  for (const url of CORE_JS_SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // An SPA HTML fallback would silently pass as text — validate the content.
      if (!text.includes('createFFmpegCore')) throw new Error('内容が ffmpeg-core.js ではありません');
      return URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    } catch (e: any) {
      errors.push(`${url}: ${e?.message || e}`);
    }
  }
  throw new Error(`FFmpeg.wasm の ffmpeg-core.js を読み込めませんでした。\n${errors.join('\n')}`);
}

async function fetchCoreWasm(): Promise<string> {
  const errors: string[] = [];
  for (const url of CORE_WASM_SOURCES) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const m = new Uint8Array(buf.slice(0, 4));
      if (!(m[0] === 0x00 && m[1] === 0x61 && m[2] === 0x73 && m[3] === 0x6d)) {
        throw new Error('内容が WebAssembly ファイルではありません');
      }
      return URL.createObjectURL(new Blob([buf], { type: 'application/wasm' }));
    } catch (e: any) {
      errors.push(`${url}: ${e?.message || e}`);
    }
  }
  throw new Error(`FFmpeg.wasm の ffmpeg-core.wasm を読み込めませんでした。\n${errors.join('\n')}`);
}

/** Prefer the app-hosted ffmpeg-core files, fall back to the CDN copy */
async function getCoreUrls() {
  if (coreUrls) return coreUrls;
  const [coreURL, wasmURL] = await Promise.all([fetchCoreJs(), fetchCoreWasm()]);
  coreUrls = { coreURL, wasmURL };
  return coreUrls;
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  const { coreURL, wasmURL } = await getCoreUrls();
  try {
    await ffmpeg.load({ coreURL, wasmURL });
  } catch (e: any) {
    ffmpeg = null;
    coreUrls = null;
    throw new Error(`FFmpeg.wasm エンジンの初期化に失敗しました: ${e?.message || e}`);
  }
  return ffmpeg;
}



/** Build FFmpeg arguments from settings — "safety-first" logic */
export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
): string[] {
  // Input repair flags: ignore corrupt packets / errors, regenerate timestamps
  const args: string[] = [
    '-y',
    '-nostdin',
    '-err_detect', 'careful',
    '-ignore_unknown',
    '-max_error_rate', '1.0',
    '-fflags', '+discardcorrupt+genpts+igndts',
    '-i', inputName,
  ];
  const outputIsVideo = isVideoFormat(format);
  const lowerFormat = format.toLowerCase();

  // Start/End time
  if (settings.startTime > 0) {
    args.push('-ss', String(settings.startTime));
  }
  if (settings.endTime > 0) {
    args.push('-to', String(settings.endTime));
  }

  // Collect video filters and audio filters separately
  const vFilters: string[] = [];
  const aFilters: string[] = [];

  // Video settings
  if (outputIsVideo && isVideo) {
    if (settings.videoCodec === 'copy') {
      args.push('-c:v', 'copy');
    } else {
      const vCodec = CODEC_MAP[settings.videoCodec] || 'libx264';
      args.push('-c:v', vCodec);

      // Resolution — force even numbers in JS (args are NOT shell-parsed,
      // so quotes/expressions would be passed literally to the filter graph)
      const even = (v: number) => Math.max(2, Math.trunc(Number(v) / 2) * 2);
      const w = even(settings.resolutionW);
      const h = even(settings.resolutionH);

      // Aspect ratio: force letterbox (scale + pad with black bars)
      if (settings.aspectRatio !== '自由') {
        vFilters.push(
          `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
          `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
          `setsar=1`
        );
        args.push('-aspect', settings.aspectRatio);
      } else {
        vFilters.push(`scale=${w}:${h}`);
      }

      // Pixel format
      if (settings.pixelFormat && settings.pixelFormat !== 'auto') {
        args.push('-pix_fmt', settings.pixelFormat);
      }

      // Video bitrate
      const vBitrate = settings.videoBitrate.replace('KBPS', 'k');
      args.push('-b:v', vBitrate);


      // Framerate — force CFR to fix VFR issues from iPhone
      const fps = settings.framerate.replace('FPS', '');
      args.push('-r', fps);

      // Interlace — stabilized with scale + tinterlace + setfield
      if (settings.scanType === 'インターレース方式') {
        vFilters.push('tinterlace=mode=interleave_top', 'setfield=tff');
        args.push('-flags', '+ilme+ildct');
      }

      // Force CFR to prevent VFR corruption (modern replacement for -vsync)
      args.push('-fps_mode', 'cfr');
    }
  } else if (!outputIsVideo) {
    args.push('-vn');
  }

  // Audio settings
  if (!settings.audioEnabled || settings.audioCodec === 'none') {
    args.push('-an');
  } else if (settings.audioCodec === 'copy') {
    args.push('-c:a', 'copy');
  } else {
    const aCodec = CODEC_MAP[settings.audioCodec] || 'aac';
    args.push('-c:a', aCodec);

    // AAC HE profile
    if (AAC_HE_PROFILE[settings.audioCodec]) {
      args.push('-profile:a', AAC_HE_PROFILE[settings.audioCodec]);
    }

    // AMR strict mode — force libopencore_amrnb in browser (ffmpeg.wasm)
    if (settings.audioCodec === 'AMR_NB') {
      args.push('-ar', '8000', '-ac', '1', '-ab', '12.2k', '-strict', '-2');
      aFilters.push('aresample=8000', 'pan=mono|c0=c0+c1');
    } else if (settings.audioCodec === 'AMR_WB') {
      args.push('-ar', '16000', '-ac', '1', '-strict', '-2');
      aFilters.push('aresample=16000', 'pan=mono|c0=c0+c1');
    } else {
      // Audio bitrate
      const aBitrate = settings.audioBitrate.replace('KBPS', 'k');
      args.push('-b:a', aBitrate);

      // Channels
      args.push('-ac', settings.channels === 'モノラル' ? '1' : '2');

      // Frequency
      const freq = settings.frequency.replace('Hz', '');
      args.push('-ar', freq);
    }

    // Async resampling for A/V sync safety — always applied
    aFilters.push('aresample=async=1');

    // Volume
    if (settings.volume !== 'none') {
      aFilters.push(`volume=${settings.volume}dB`);
    }
  }

  // Speed
  if (settings.speed !== '1') {
    const speed = parseFloat(settings.speed);
    if (outputIsVideo && isVideo && settings.videoCodec !== 'copy') {
      vFilters.push(`setpts=${(1 / speed).toFixed(6)}*PTS`);
    }
    if (settings.audioEnabled && settings.audioCodec !== 'none' && settings.audioCodec !== 'copy') {
      if (settings.pitchSync) {
        aFilters.push(`atempo=${speed}`);
      } else {
        aFilters.push(`asetrate=${Math.round(44100 * speed)}`, 'aresample=44100', 'atempo=1');
      }
    }
  }

  // Apply collected filters
  if (vFilters.length > 0) {
    args.push('-vf', vFilters.join(','));
  }
  if (aFilters.length > 0) {
    args.push('-af', aFilters.join(','));
  }

  // Buffer safety — large buffer to prevent muxing queue overflow
  args.push('-max_muxing_queue_size', '9999');

  // Output-side timestamp regeneration + never abort on recoverable errors
  args.push('-fflags', '+genpts', '-avoid_negative_ts', 'make_zero');

  // movflags: faststart for iPhone playback / metadata at start
  if (['3gp', '3g2'].includes(lowerFormat)) {
    args.push('-movflags', '+faststart+frag_keyframe+empty_moov');
  } else if (['mov', 'mp4', 'm4v', 'm4a'].includes(lowerFormat)) {
    args.push('-movflags', '+faststart');
  }

  args.push(outputName);
  return args;
}

/** Convert a file using FFmpeg WASM */
export async function convertWithFFmpeg(
  file: File,
  format: string,
  settings: ConvertSettings,
  isVideo: boolean,
  onProgress?: (pct: number) => void,
  onLog?: (msg: string) => void,
  onStatus?: (status: string) => void,
  onCommand?: (cmd: string) => void,
): Promise<{ url: string; filename: string }> {
  abortRequested = false;
  const logs: string[] = [];
  const logCollector = (msg: string) => {
    logs.push(msg);
    onLog?.(msg);
  };

  onStatus?.('FFmpeg WASM エンジンを初期化中...');
  onProgress?.(5);
  const ff = await getFFmpeg(logCollector);
  onProgress?.(15);

  onStatus?.('入力ファイルをメモリに書き込み中...');
  const inputExt = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${inputExt}`;

  const outputExt = FORMAT_EXT[format] || 'mp4';
  const outputName = `output.${outputExt}`;

  await ff.writeFile(inputName, await fetchFile(file));
  onProgress?.(25);

  if (abortRequested) throw new Error('ユーザーによりキャンセルされました');

  onStatus?.('FFmpegコマンドを生成中...');
  const args = buildFFmpegArgs(inputName, outputName, settings, format, isVideo);
  const fullCmd = `ffmpeg ${args.join(' ')}`;
  onCommand?.(fullCmd);
  onStatus?.('FFmpeg → 変換実行中...');

  ff.on('progress', ({ progress }) => {
    if (abortRequested) return;
    const pct = Math.min(25 + progress * 65, 90);
    onProgress?.(pct);
    onStatus?.(`FFmpeg → 変換処理中... ${Math.round(pct)}%`);
  });

  try {
    // Only a thrown exception from exec() counts as a failure.
    // Warnings / info lines on stderr (Stream #, [swscaler], deprecated pixel format, ...)
    // are normal FFmpeg output and are never treated as errors.
    await ff.exec(args);
  } catch (err: any) {
    const errLogs = logs.filter(isFfmpegErrorLog).slice(-3).join('\n');
    const tail = logs.slice(-6).join('\n');
    throw new Error(`FFmpegエラー:\n${errLogs || err?.message || ''}\n${tail}`.trim());
  }


  if (abortRequested) throw new Error('ユーザーによりキャンセルされました');

  onStatus?.('FFmpeg → 出力ファイルを読み取り中...');
  onProgress?.(92);

  const data = await ff.readFile(outputName);
  onProgress?.(96);

  const mime = FORMAT_MIME[format] || 'application/octet-stream';
  const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);

  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onStatus?.('変換完了！');
  onProgress?.(100);
  return { url, filename: `converted.${outputExt}` };
}

export function getFFmpegLogs(): string[] {
  return [];
}
