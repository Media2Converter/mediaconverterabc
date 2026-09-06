import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreJsAsset from '@/assets/ffmpeg-core.js.asset.json';
import coreWasmAsset from '@/assets/ffmpeg-core.wasm.asset.json';
import {
  CODEC_MAP, AAC_HE_PROFILE, FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  isCodecCompatible, getCompatibleAudioCodecs, getCompatibleVideoCodecs,
  type ConvertSettings,
} from '@/constants/converterOptions';


let ffmpeg: FFmpeg | null = null;
let abortRequested = false;

const WASM_CORE_BYTES = coreWasmAsset.size;

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  return `${Math.round(b / 1024 ** 2)} MB`;
}

/** Upper bound of the ffmpeg-core wasm heap (32-bit wasm, ALLOW_MEMORY_GROWTH) */
const WASM_HEAP_LIMIT = 2 * 1024 ** 3;

/**
 * "使用メモリ / 全容量" string. Chrome exposes exact figures via performance.memory;
 * Safari does not, so we estimate usage (wasm core + working buffers) and show the
 * wasm heap ceiling — the real limit that matters for FFmpeg.wasm — as the total.
 */
export function getMemoryStatus(inputBytes = 0): string {
  const perfMem = (performance as any).memory as { usedJSHeapSize?: number; jsHeapSizeLimit?: number } | undefined;
  if (perfMem?.usedJSHeapSize && perfMem.jsHeapSizeLimit) {
    return `メモリ: ${fmtBytes(perfMem.usedJSHeapSize)} / ${fmtBytes(perfMem.jsHeapSizeLimit)}`;
  }
  const estimatedUsed = WASM_CORE_BYTES * 2 + Math.min(inputBytes, 64 * 1024 ** 2) + 48 * 1024 ** 2;
  const deviceGb = (navigator as any).deviceMemory as number | undefined;
  const total = deviceGb ? Math.min(deviceGb * 1024 ** 3, WASM_HEAP_LIMIT) : WASM_HEAP_LIMIT;
  return `メモリ(推定): ${fmtBytes(estimatedUsed)} / ${fmtBytes(total)}`;
}

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
  'Aborted()', // ffmpeg-core prints this on every normal exit
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

// Worker of @ffmpeg/ffmpeg bundled by Vite (single self-contained file)
import ffmpegWorkerUrl from '@/lib/ffmpeg-worker/worker.js?worker&url';

const CDN_CORE_JS = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
const CDN_CORE_WASM = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm';
// Dev-only copy served straight from node_modules by the Vite dev server
const DEV_CORE_JS = '/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js';
const DEV_CORE_WASM = '/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm';

async function fetchCorePair(jsUrl: string, wasmUrl: string): Promise<{ coreURL: string; wasmURL: string }> {
  // Verify the files really are the core files (an SPA fallback would return HTML)
  const [jsRes, wasmRes] = await Promise.all([fetch(jsUrl), fetch(wasmUrl)]);
  if (!jsRes.ok || !wasmRes.ok) throw new Error(`core assets unavailable (${jsRes.status}/${wasmRes.status})`);
  const jsText = await jsRes.text();
  if (!jsText.includes('createFFmpegCore')) throw new Error('core js invalid');
  const wasmBuf = await wasmRes.arrayBuffer();
  const magic = new Uint8Array(wasmBuf.slice(0, 4));
  if (!(magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d)) {
    throw new Error('core wasm invalid');
  }
  return {
    coreURL: URL.createObjectURL(new Blob([jsText], { type: 'text/javascript' })),
    wasmURL: URL.createObjectURL(new Blob([wasmBuf], { type: 'application/wasm' })),
  };
}

/** Bundled asset → (dev) node_modules copy → CDN */
async function getCoreUrls() {
  if (coreUrls) return coreUrls;
  const candidates: Array<[string, string]> = [[coreJsAsset.url, coreWasmAsset.url]];
  if (import.meta.env.DEV) candidates.push([DEV_CORE_JS, DEV_CORE_WASM]);
  candidates.push([CDN_CORE_JS, CDN_CORE_WASM]);

  const errors: string[] = [];
  for (const [js, wasm] of candidates) {
    try {
      coreUrls = await fetchCorePair(js, wasm);
      return coreUrls;
    } catch (e: any) {
      errors.push(`${js}: ${e?.message ?? e}`);
    }
  }
  throw new Error(`FFmpeg.wasm コアファイルを読み込めませんでした:\n${errors.join('\n')}`);
}

const LOAD_TIMEOUT_MS = 120_000;

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  const { coreURL, wasmURL } = await getCoreUrls();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('FFmpeg.wasm の初期化がタイムアウトしました')), LOAD_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      ffmpeg.load({ coreURL, wasmURL, classWorkerURL: ffmpegWorkerUrl }),
      timeout,
    ]);
  } catch (e) {
    resetFFmpeg();
    throw e;
  } finally {
    clearTimeout(timer);
  }
  return ffmpeg;
}



/**
 * Pass mode: 'all' encodes video+audio at once; 'video' / 'audio' encode only one
 * stream into an intermediate NUT file so that decoder + encoder memory for the
 * two streams is never held at the same time (large iPhone videos otherwise die).
 */
export type PassMode = 'all' | 'video' | 'audio';

/** Build FFmpeg arguments from settings — "safety-first" logic */
export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
  mode: PassMode = 'all',
): string[] {
  // Input repair flags: careful detection + ignore errors, never abort on bad packets,
  // regenerate timestamps. Probe buffers are kept small — 100M probesize alone
  // would hold up to 100MB of the input in wasm memory before encoding starts.
  const args: string[] = [
    '-y',
    '-nostdin',
    '-hide_banner',
    '-err_detect', 'careful+ignore_err',
    '-ignore_unknown',
    '-max_error_rate', '1.0',
    '-fflags', '+discardcorrupt+genpts+igndts+nobuffer',
    '-analyzeduration', '5M', '-probesize', '5M',
    '-thread_queue_size', '64',
    '-i', inputName,
  ];
  const outputIsVideo = isVideoFormat(format);
  const lowerFormat = format.toLowerCase();

  // Never hand FFmpeg a codec the container cannot hold (e.g. AAC inside .mp3)
  if (!isCodecCompatible(format, settings.videoCodec, 'video')) {
    settings = { ...settings, videoCodec: getCompatibleVideoCodecs(format)[0] || 'H.264' };
  }
  if (!isCodecCompatible(format, settings.audioCodec, 'audio')) {
    settings = { ...settings, audioCodec: getCompatibleAudioCodecs(format)[0] || 'AAC' };
  }

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

      // Encoder speed / memory presets — single-threaded wasm on iPhone cannot
      // afford the default (medium) presets; without these the first progress
      // line may never arrive and the conversion looks frozen at 25%.
      if (vCodec === 'libx264' || vCodec === 'libx265') {
        args.push('-preset', 'ultrafast');
        // Minimal-memory encoder config: 1 reference frame, no B-frames, no lookahead
        if (vCodec === 'libx264') args.push('-tune', 'fastdecode', '-x264-params', 'rc-lookahead=0:sync-lookahead=0:ref=1:bframes=0:threads=1:lookahead-threads=1');
        if (vCodec === 'libx265') args.push('-x265-params', 'log-level=error:rc-lookahead=0:ref=1:bframes=0:pools=1:frame-threads=1');
      } else if (vCodec === 'libvpx' || vCodec === 'libvpx-vp9') {
        args.push('-deadline', 'realtime', '-cpu-used', '8');
      }
      args.push('-threads', '1');

      // Resolution - always force even numbers via scale filter with trunc
      const w = settings.resolutionW;
      const h = settings.resolutionH;

      // Aspect ratio: force letterbox (scale + pad with black bars)
      if (settings.aspectRatio !== '自由') {
        // Compute target W:H from aspect ratio, then fit-and-pad with black
        // scale=w:h:force_original_aspect_ratio=decrease ensures contents fit, then pad to target with black
        vFilters.push(
          `scale=w='trunc(${w}/2)*2':h='trunc(${h}/2)*2':force_original_aspect_ratio=decrease`,
          `pad=w='trunc(${w}/2)*2':h='trunc(${h}/2)*2':x='(ow-iw)/2':y='(oh-ih)/2':color=black`,
          `setsar=1`
        );
        args.push('-aspect', settings.aspectRatio);
      } else {
        vFilters.push(`scale='trunc(${w}/2)*2:trunc(${h}/2)*2'`);
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

  // Muxing queue: large enough to avoid overflow, small enough not to hoard memory
  args.push('-max_muxing_queue_size', '1024');

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

/** Metadata check: returns true when FFmpeg can read the file's streams */
async function checkMetadata(ff: FFmpeg, name: string): Promise<boolean> {
  try {
    const rc = await ff.exec(['-nostdin', '-v', 'error', '-i', name, '-t', '0.1', '-f', 'null', '-']);
    return rc === 0;
  } catch {
    return false;
  }
}

/** Repair a broken/truncated container by remuxing with regenerated timestamps */
async function repairFile(ff: FFmpeg, name: string): Promise<string> {
  const ext = name.split('.').pop() || 'mp4';
  const repaired = `repaired_${Date.now()}.${ext}`;
  try {
    const rc = await ff.exec([
      '-y', '-nostdin',
      '-err_detect', 'careful',
      '-fflags', '+discardcorrupt+genpts+igndts',
      '-i', name,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts',
      repaired,
    ]);
    if (rc !== 0) return name;
    return repaired;
  } catch {
    return name;
  }
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
    if (logs.length > 500) logs.shift();
    logs.push(msg);
    onLog?.(msg);
  };

  // Every status line carries "使用メモリ / 全容量"
  const rawStatus = onStatus;
  onStatus = rawStatus ? (s: string) => rawStatus(`${s}\n${getMemoryStatus(file.size)}`) : undefined;

  onStatus?.('FFmpeg WASM エンジンを初期化中...');
  onProgress?.(5);
  const ff = await getFFmpeg(logCollector);
  onProgress?.(15);

  onStatus?.('入力ファイルをメモリに書き込み中...');
  const inputExt = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${inputExt}`;

  const outputExt = FORMAT_EXT[format] || 'mp4';
  const outputName = `output.${outputExt}`;

  // Mount the File directly (WORKERFS) instead of copying it into wasm memory —
  // large iPhone videos otherwise exhaust Safari's memory and the worker dies
  // silently, which is what a conversion "frozen at 25%" looks like.
  const MOUNT_DIR = '/inmnt';
  let mounted = false;
  let inputPath = inputName;
  try {
    const mountFile = new File([file], inputName, { type: file.type });
    try { await ff.createDir(MOUNT_DIR); } catch {}
    mounted = await ff.mount(FFFSType.WORKERFS, { files: [mountFile] }, MOUNT_DIR);
    if (mounted) inputPath = `${MOUNT_DIR}/${inputName}`;
  } catch {
    mounted = false;
  }
  if (!mounted) {
    await ff.writeFile(inputName, await fetchFile(file));
  }
  onProgress?.(25);

  const cleanup = async (names: string[]) => {
    for (const n of new Set(names)) {
      if (n.startsWith(MOUNT_DIR)) continue;
      try { await ff.deleteFile(n); } catch {}
    }
    if (mounted) {
      try { await ff.unmount(MOUNT_DIR); } catch {}
      try { await ff.deleteDir(MOUNT_DIR); } catch {}
    }
  };

  if (abortRequested) { await cleanup([inputName]); throw new Error('ユーザーによりキャンセルされました'); }

  // Pre-conversion metadata check → repair broken/truncated input
  onStatus?.('入力ファイルのメタデータを確認中...');
  let sourceName = inputPath;
  if (!(await checkMetadata(ff, inputPath))) {
    onStatus?.('入力ファイルが破損しています。修復中...');
    sourceName = await repairFile(ff, inputPath);
  }

  onStatus?.('FFmpegコマンドを生成中...');
  const args = buildFFmpegArgs(sourceName, outputName, settings, format, isVideo);

  const fullCmd = `ffmpeg ${args.join(' ')}`;
  onCommand?.(fullCmd);
  onStatus?.('FFmpeg → 変換実行中...');

  let trackProgress = true;
  let lastActivity = Date.now();
  const onFfProgress = ({ progress }: { progress: number }) => {
    lastActivity = Date.now();
    if (abortRequested || !trackProgress) return;
    if (!Number.isFinite(progress) || progress < 0) return;
    const pct = Math.min(25 + Math.min(progress, 1) * 65, 90);
    onProgress?.(pct);
    onStatus?.(`FFmpeg → 変換処理中... ${Math.round(pct)}%`);
  };
  const onActivityLog = () => { lastActivity = Date.now(); };
  ff.on('progress', onFfProgress);
  ff.on('log', onActivityLog);

  // Stall watchdog: if the worker crashes (out of memory etc.) ffmpeg.wasm never
  // resolves exec(). Detect "no log / no progress for a long time" and fail
  // with a clear message instead of hanging forever.
  const STALL_MS = 120_000;
  let stallTimer: ReturnType<typeof setInterval> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    stallTimer = setInterval(() => {
      if (abortRequested) {
        clearInterval(stallTimer);
        resetFFmpeg();
        reject(new Error('ユーザーによりキャンセルされました'));
        return;
      }
      if (Date.now() - lastActivity > STALL_MS) {
        clearInterval(stallTimer);
        resetFFmpeg();
        reject(new Error('FFmpegエラー:\n変換処理が応答しなくなりました（メモリ不足の可能性があります）。解像度やビットレートを下げて再試行してください。'));
      }
    }, 2_000);
  });

  // Warnings / info lines on stderr (Stream #, [swscaler], deprecated pixel format, ...)
  // are normal FFmpeg output and are never treated as errors. Failure = thrown
  // exception OR a non-zero exit code returned by exec().
  let rc: number;
  try {
    rc = await Promise.race([ff.exec(args), stalled]);
  } catch (err: any) {
    clearInterval(stallTimer);
    try { ff.off('progress', onFfProgress); ff.off('log', onActivityLog); } catch {}
    if (ffmpeg) await cleanup([inputName, sourceName, outputName]);
    if (String(err?.message ?? err).includes('キャンセル')) throw err;
    const lastLogs = logs.filter(isFfmpegErrorLog).slice(-3).join('\n');
    throw new Error(`FFmpegエラー:\n${lastLogs || err?.message || '変換に失敗しました'}`);
  }
  clearInterval(stallTimer);
  trackProgress = false;
  ff.off('progress', onFfProgress);
  ff.off('log', onActivityLog);
  if (rc !== 0) {
    const lastLogs = logs.filter(isFfmpegErrorLog).slice(-3).join('\n');
    await cleanup([inputName, sourceName, outputName]);
    throw new Error(`FFmpegエラー (exit code ${rc}):\n${lastLogs || '変換に失敗しました'}`);
  }


  if (abortRequested) { await cleanup([inputName, sourceName, outputName]); throw new Error('ユーザーによりキャンセルされました'); }

  onStatus?.('出力ファイルのメタデータを確認中...');
  let finalName = outputName;
  if (!(await checkMetadata(ff, outputName))) {
    onStatus?.('出力ファイルが破損しています。修復中...');
    finalName = await repairFile(ff, outputName);
  }

  onStatus?.('FFmpeg → 出力ファイルを読み取り中...');
  onProgress?.(92);

  const data = await ff.readFile(finalName);
  onProgress?.(96);
  if (!data || (data as Uint8Array).length === 0) {
    await cleanup([inputName, sourceName, outputName, finalName]);
    throw new Error('FFmpegエラー:\n出力ファイルが空です（変換に失敗しました）');
  }

  const mime = FORMAT_MIME[format] || 'application/octet-stream';
  const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);

  await cleanup([inputName, sourceName, outputName, finalName]);


  onStatus?.('変換完了！');
  onProgress?.(100);
  return { url, filename: `converted.${outputExt}` };
}

export function getFFmpegLogs(): string[] {
  return [];
}
