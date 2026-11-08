import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { runFFmpegOperation, FFmpegInactivityClock } from './ffmpegOperation';
import { keepConversionAwake } from './conversionWakeLock';
import { FFmpegStallTracker } from './ffmpegStallStatus';
import { parseFFmpegMetadata } from './ffmpegMetadata';
import { buildSampleRepairArgs, selectSampleMedia } from './sampleRepair';
import coreJsAsset from '@/assets/ffmpeg-core.js.asset.json';
import coreWasmAsset from '@/assets/ffmpeg-core.wasm.asset.json';
import {
  CODEC_MAP, AAC_HE_PROFILE, FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  isCodecCompatible, getCompatibleAudioCodecs, getCompatibleVideoCodecs,
  AMR_NB_BITRATES, AMR_WB_BITRATES, ADPCM_BITRATES,
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
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 60_000);
  try {
  // Verify the files really are the core files (an SPA fallback would return HTML)
  const [jsRes, wasmRes] = await Promise.all([fetch(jsUrl, { signal: controller.signal }), fetch(wasmUrl, { signal: controller.signal })]);
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
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
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

function engineOperation<T>(ff: FFmpeg, label: string, operation: () => Promise<T>, timeoutMs = LOAD_TIMEOUT_MS): Promise<T> {
  return runFFmpegOperation(operation, {
    label, timeoutMs, isCancelled: () => abortRequested,
    terminate: () => { if (ff === ffmpeg) resetFFmpeg(); else ff.terminate(); },
  });
}

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  const engine = new FFmpeg();
  ffmpeg = engine;
  if (onLog) {
    engine.on('log', ({ message }) => onLog(message));
  }
  try {
    const { coreURL, wasmURL } = await getCoreUrls();
    await engineOperation(engine, 'FFmpeg.wasmの初期化', () => engine.load({ coreURL, wasmURL, classWorkerURL: ffmpegWorkerUrl }));
  } catch (e) {
    resetFFmpeg();
    throw e;
  }
  return engine;
}



/**
 * Pass mode: 'all' encodes video+audio at once; 'video' / 'audio' encode only one
 * stream into an intermediate file (same container) so that decoder + encoder memory for the
 * two streams is never held at the same time (large iPhone videos otherwise die).
 */
export type PassMode = 'all' | 'video' | 'audio';

/* ------------------------------------------------------------------ *
 * Special (legacy / telephony) codec constraints
 *
 * H.263 / H.261 accept only a fixed set of frame sizes, AMR and the ADPCM
 * G.7xx family accept only one sample rate, mono audio and a fixed set of
 * bitrates. Passing anything else makes FFmpeg abort. Every request is
 * therefore snapped onto the nearest legal value before building the args.
 * ------------------------------------------------------------------ */

const H263_SIZES: [number, number][] = [[128, 96], [176, 144], [352, 288], [704, 576], [1408, 1152]];
const H261_SIZES: [number, number][] = [[176, 144], [352, 288]];
const H263_FPS = [10, 15, 20, 25, 30];

/** Audio codecs that only work at one sample rate / mono */
const FIXED_AUDIO: Record<string, { rate: number; mono: true; bitrates?: string[] }> = {
  'AMR_NB': { rate: 8000, mono: true, bitrates: AMR_NB_BITRATES },
  'AMR_WB': { rate: 16000, mono: true, bitrates: AMR_WB_BITRATES },
  'ADPCM_G721': { rate: 8000, mono: true },
  'ADPCM_G723': { rate: 8000, mono: true },
  'ADPCM_G726': { rate: 8000, mono: true },
  'ADPCM_G727': { rate: 8000, mono: true },
  'ADPCM_G728': { rate: 8000, mono: true },
  'ADPCM_OKI': { rate: 8000, mono: true },
  'PCM_G.711': { rate: 8000, mono: true },
};

/** Codecs FFmpeg marks experimental — need -strict -2 */
const EXPERIMENTAL_AUDIO = ['AMR_NB', 'AMR_WB', 'ADPCM_G723', 'ADPCM_G726', 'ADPCM_G727', 'ADPCM_G728', 'ADPCM_G721', 'ADPCM_OKI'];

/** Codecs that must not receive a bitrate (lossless / fixed) */
const NO_BITRATE_AUDIO = /^(WAV|AIFF|RAW|FLAC|ALAC|LPCM|PCM_)/;

const num = (s: string) => parseFloat(String(s).replace(/[^0-9.]/g, ''));

function nearestBitrate(list: string[], want: string): string {
  const target = num(want);
  if (!Number.isFinite(target) || list.length === 0) return list[0] ?? want;
  return list.reduce((best, cur) => (Math.abs(num(cur) - target) < Math.abs(num(best) - target) ? cur : best), list[0]);
}

function snapSize(sizes: [number, number][], w: number, h: number): [number, number] {
  const area = w * h;
  return sizes.reduce((best, cur) =>
    Math.abs(cur[0] * cur[1] - area) < Math.abs(best[0] * best[1] - area) ? cur : best, sizes[0]);
}

/**
 * Clamp the user's settings onto values the chosen codec really supports.
 * Returns the adjusted settings plus human-readable notes about what changed.
 */
export function normalizeSpecialCodecSettings(
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
): { settings: ConvertSettings; notes: string[] } {
  const s: ConvertSettings = { ...settings };
  const notes: string[] = [];

  // ---- Video ----
  if (isVideo && isVideoFormat(format) && s.videoCodec !== 'copy') {
    const sizes = s.videoCodec === 'H.261' ? H261_SIZES
      : (s.videoCodec === 'H.263' || s.videoCodec === 'H.320') ? H263_SIZES
      : null;
    if (sizes) {
      const [w, h] = snapSize(sizes, s.resolutionW, s.resolutionH);
      if (w !== s.resolutionW || h !== s.resolutionH) {
        notes.push(`${s.videoCodec} は固定解像度のみ対応のため ${w}×${h} に調整しました。`);
        s.resolutionW = w;
        s.resolutionH = h;
      }
      s.aspectRatio = '自由';
      s.pixelFormat = 'yuv420p';
      s.scanType = 'プログレッシブ方式';
      const fps = num(s.framerate);
      const snapped = H263_FPS.reduce((b, c) => (Math.abs(c - fps) < Math.abs(b - fps) ? c : b), H263_FPS[0]);
      if (snapped !== fps) {
        notes.push(`${s.videoCodec} 向けにフレームレートを ${snapped}FPS に調整しました。`);
        s.framerate = `${snapped}FPS`;
      }
    }
    if (s.videoCodec === 'MJPEG' && (!s.pixelFormat || s.pixelFormat === 'auto')) {
      s.pixelFormat = 'yuv420p';
    }
  }

  // ---- Audio ----
  if (s.audioEnabled && s.audioCodec !== 'none' && s.audioCodec !== 'copy') {
    const fixed = FIXED_AUDIO[s.audioCodec];
    if (fixed) {
      if (num(s.frequency) !== fixed.rate) {
        notes.push(`${s.audioCodec} は ${fixed.rate}Hz 固定のためサンプルレートを調整しました。`);
        s.frequency = `${fixed.rate}Hz`;
      }
      if (s.channels !== 'モノラル') {
        notes.push(`${s.audioCodec} はモノラルのみ対応のためモノラルに調整しました。`);
        s.channels = 'モノラル';
      }
    }
    const brList = fixed?.bitrates ?? ADPCM_BITRATES[s.audioCodec];
    if (brList && brList.length > 0) {
      const nb = nearestBitrate(brList, s.audioBitrate);
      if (nb !== s.audioBitrate) {
        notes.push(`${s.audioCodec} 対応のビットレート ${nb} に調整しました。`);
        s.audioBitrate = nb;
      }
    }
  }

  return { settings: s, notes };
}

/** Japanese explanation of why a special codec failed */
export function describeCodecIssue(settings: ConvertSettings, format: string, log: string): string {
  const parts: string[] = [];
  if (/AMR/.test(settings.audioCodec)) {
    parts.push('AMR は 8000Hz(NB)／16000Hz(WB)・モノラル・専用ビットレートのみ対応です。');
  }
  if (settings.audioCodec.startsWith('ADPCM')) {
    parts.push('ADPCM(G.72x) は 8000Hz・モノラル・規定ビットレート（16/24/32/40KBPS）のみ対応です。');
  }
  if (['H.263', 'H.261', 'H.320'].includes(settings.videoCodec)) {
    parts.push('H.263／H.261 は 128×96・176×144・352×288・704×576・1408×1152 など固定解像度のみ対応です。');
  }
  if (/does not support|Specified sample|Invalid sample rate|Unsupported sample/i.test(log)) {
    parts.push('選択したサンプルレートまたはチャンネル数がコーデックの対応範囲外です。');
  }
  if (/dimensions|picture size|Invalid frame size/i.test(log)) {
    parts.push('選択した解像度がコーデックの対応範囲外です。');
  }
  return parts.join('\n');
}

/** Build FFmpeg arguments from settings — "safety-first" logic */
export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
  mode: PassMode = 'all',
  simplify = false,
): string[] {

  // Input repair flags: loosest error detection + ignore errors, never abort on
  // bad packets or decoder warnings, regenerate timestamps. Probe buffers are
  // kept small — 100M probesize alone would hold up to 100MB of the input in
  // wasm memory before encoding starts.
  const args: string[] = [
    '-y',
    '-nostdin',
    '-hide_banner',
    '-stats_period', '1',
    '-err_detect', 'ignore_err',
    '-ignore_unknown',
    '-max_error_rate', '1.0',
    '-fflags', '+discardcorrupt+genpts+igndts',
    '-analyzeduration', '5M', '-probesize', '5M',
    '-thread_queue_size', '64',
    // The core has no pthread support: also constrain decoder and filter threads.
    '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1',
    '-i', inputName,
    // Run-to-completion flags (output side): never abort on queue overflow / bad frames
    '-max_error_rate', '1.0',
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

  // Snap legacy / telephony codec settings (H.263, AMR, ADPCM G.72x ...) onto legal values
  settings = normalizeSpecialCodecSettings(settings, format, isVideo).settings;



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
  if (mode === 'audio') {
    args.push('-vn');
  } else if (outputIsVideo && isVideo) {
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
        if (vCodec === 'libx265') args.push('-x265-params', 'log-level=error:rc-lookahead=0:ref=1:bframes=0:pools=none:frame-threads=1:wpp=0');
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
  if (mode === 'video' || !settings.audioEnabled || settings.audioCodec === 'none') {
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

    // Experimental encoders (AMR, ADPCM G.72x) need the strictness relaxed
    if (EXPERIMENTAL_AUDIO.includes(settings.audioCodec)) {
      args.push('-strict', '-2');
    }

    const channels = settings.channels === 'モノラル' ? 1 : 2;
    const freq = String(Math.round(num(settings.frequency)) || 48000);

    // Bitrate — skipped for lossless / fixed-rate codecs where it is invalid
    if (!NO_BITRATE_AUDIO.test(settings.audioCodec)) {
      args.push('-b:a', settings.audioBitrate.replace('KBPS', 'k'));
    }
    args.push('-ac', String(channels));
    args.push('-ar', freq);
    args.push('-threads:a', '1');

    // Resample explicitly to the codec's rate / layout. Never use `pan=mono`
    // (it fails outright when the source is already mono) — aresample+`-ac`
    // downmixes safely for every input.
    aFilters.push(`aresample=${freq}:async=1:first_pts=0`);

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
      const targetRate = Math.round(num(settings.frequency)) || 48000;
      if (settings.pitchSync) {
        aFilters.push(`atempo=${speed}`);
      } else {
        aFilters.push(`asetrate=${Math.round(targetRate * speed)}`, `aresample=${targetRate}`, 'atempo=1');
      }
    }
  }

  // Fallback mode: keep only the essential filters (scale / resample). Legacy
  // codecs abort on padding, interlacing or tempo filter chains.
  const finalVFilters = simplify ? vFilters.filter(f => f.startsWith('scale')) : vFilters;
  const finalAFilters = simplify ? aFilters.filter(f => f.startsWith('aresample')) : aFilters;

  // Apply collected filters
  if (finalVFilters.length > 0) {
    args.push('-vf', finalVFilters.join(','));
  }
  if (finalAFilters.length > 0) {
    args.push('-af', finalAFilters.join(','));
  }


  // Muxing queue: large enough to avoid overflow, small enough not to hoard memory
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

/** Final remux of the separately encoded video / audio streams into the target container */
export function buildMuxArgs(videoName: string, audioName: string, outputName: string, format: string): string[] {
  const lowerFormat = format.toLowerCase();
  const args = [
    '-y', '-nostdin', '-hide_banner',
    '-fflags', '+genpts+igndts',
    '-i', videoName, '-i', audioName,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c', 'copy',
    '-max_error_rate', '1.0',
    '-max_muxing_queue_size', '9999',
    '-avoid_negative_ts', 'make_zero',
  ];
  if (['3gp', '3g2'].includes(lowerFormat)) {
    args.push('-movflags', '+faststart+frag_keyframe+empty_moov');
  } else if (['mov', 'mp4', 'm4v', 'm4a'].includes(lowerFormat)) {
    args.push('-movflags', '+faststart');
  }
  args.push(outputName);
  return args;
}

/** True when the conversion should run as separate audio / video passes + remux */
function shouldSplitPasses(settings: ConvertSettings, format: string, isVideo: boolean): boolean {
  if (!isVideo || !isVideoFormat(format)) return false;
  if (!settings.audioEnabled || settings.audioCodec === 'none') return false;
  // Both streams copied: a single remux is already the lightest path
  if (settings.videoCodec === 'copy' && settings.audioCodec === 'copy') return false;
  // Legacy / telephony codecs cannot be safely stream-copied out of an
  // intermediate container — encode them in a single pass instead.
  if (/^(AMR|ADPCM|PCM_|RAW|LPCM)/.test(settings.audioCodec)) return false;
  if (['H.263', 'H.261', 'H.320', 'MJPEG', 'DIVX'].includes(settings.videoCodec)) return false;
  return true;

}

/** Probe headers only; decoding frames here used to leave setup stuck at 25%. */
async function readMetadata(ff: FFmpeg, name: string): Promise<{ duration: number; hasAudio: boolean } | null> {
  const metadataName = 'stream_metadata.json';
  try {
    await engineOperation(ff, 'メタデータ確認', () => ff.ffprobe([
      '-v', 'error', '-analyzeduration', '5M', '-probesize', '5M',
      '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', '-o', metadataName, name,
    ]), 60_000);
    // core 0.12.10 returns -1 even after writing valid ffprobe JSON.
    // Validate the output, not that sentinel; stale JSON is removed in finally.
    const data = await engineOperation(ff, 'メタデータ読み取り', () => ff.readFile(metadataName, 'utf8'));
    return parseFFmpegMetadata(data);
  } catch {
    if (!ff.loaded || abortRequested) throw new Error(abortRequested ? 'ユーザーによりキャンセルされました' : 'メタデータ確認が応答しません。\nエラーコード: ERR_WORKER_TIMEOUT（FFmpegの終了コードは返されていません）');
    return null;
  } finally {
    if (ff.loaded) { try { await engineOperation(ff, 'メタデータ削除', () => ff.deleteFile(metadataName)); } catch {} }
  }
}

/** Repair a broken/truncated container by remuxing with regenerated timestamps */
async function repairFile(ff: FFmpeg, name: string): Promise<string> {
  const ext = name.split('.').pop() || 'mp4';
  const repaired = `repaired_${Date.now()}.${ext}`;
  try {
    const rc = await engineOperation(ff, 'ファイル修復', () => ff.exec([
      '-y', '-nostdin',
      '-err_detect', 'careful',
      '-fflags', '+discardcorrupt+genpts+igndts',
      '-i', name,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts',
      repaired,
    ]), REPAIR_TIMEOUT_MS);
    if (rc !== 0) return name;
    return repaired;
  } catch {
    if (!ff.loaded || abortRequested) throw new Error(abortRequested ? 'ユーザーによりキャンセルされました' : 'ファイル修復が応答しません。\nエラーコード: ERR_WORKER_TIMEOUT');
    return name;
  }
}

/**
 * Dedicated repair FFmpeg.wasm (second, fully independent instance with its own
 * worker + core). Repairs the input by remuxing with regenerated timestamps, then
 * is terminated so its memory is released before the converter FFmpeg starts.
 * Any failure returns the original file unchanged.
 */
const REPAIR_TIMEOUT_MS = 300_000;
async function repairWithRepairFFmpeg(file: File, onStatus?: (s: string) => void): Promise<File> {
  const repairer = new FFmpeg();
  const ext = file.name.split('.').pop() || 'mp4';
  const MOUNT = '/repairin';
  const inName = `repair_in.${ext}`;
  const outName = `repair_out.${ext}`;
  try {
    onStatus?.('修復用FFmpegを起動中...');
    const { coreURL, wasmURL } = await getCoreUrls();
    await engineOperation(repairer, '修復用FFmpegの起動', () => repairer.load({ coreURL, wasmURL, classWorkerURL: ffmpegWorkerUrl }));
    let inPath = inName;
    let mounted = false;
    try {
      await engineOperation(repairer, '修復用入力の準備', () => repairer.createDir(MOUNT));
      mounted = await engineOperation(repairer, '修復用入力の読み込み', () => repairer.mount(FFFSType.WORKERFS, { files: [new File([file], inName, { type: file.type })] }, MOUNT));
      if (mounted) inPath = `${MOUNT}/${inName}`;
    } catch { mounted = false; }
    if (!mounted) await engineOperation(repairer, '修復用入力の書き込み', async () => repairer.writeFile(inName, await fetchFile(file)));
    onStatus?.('修復用FFmpegで動画を修復中...');
    const rc = await engineOperation(repairer, '動画修復', () => repairer.exec([
      '-y', '-nostdin', '-hide_banner',
      '-err_detect', 'ignore_err',
      '-fflags', '+discardcorrupt+genpts+igndts',
      '-i', inPath,
      '-map', '0', '-c', 'copy', '-ignore_unknown',
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '9999',
      outName,
    ]), REPAIR_TIMEOUT_MS);
    if (rc !== 0) return file;
    const data = await engineOperation(repairer, '修復結果の読み取り', () => repairer.readFile(outName));
    if (!(data instanceof Uint8Array) || data.byteLength < 1024) return file;
    return new File([data as BlobPart], file.name, { type: file.type });
  } catch {
    return file;
  } finally {
    try { repairer.terminate(); } catch {}
  }
}

/** Convert a file using FFmpeg WASM */

export async function convertWithFFmpeg(
  ...args: Parameters<typeof convertFileWithFFmpeg>
): Promise<{ url: string; filename: string }> {
  // Never keep an idle  WASM heap alongside the next video's repair engine.
  resetFFmpeg();
  const stopKeepingAwake = keepConversionAwake();
  conversionActive = true;
  try {
    try {
      return await convertFileWithFFmpeg(...args);
    } catch (e: any) {
      // An unresponsive engine is restarted once with a fresh worker before failing.
      if (abortRequested || !/ERR_ENGINE_UNRESPONSIVE|ERR_WORKER_TIMEOUT/.test(String(e?.message ?? e))) throw e;
      resetFFmpeg();
      args[6]?.('FFmpegが応答しないため、再起動して再試行中...');
      return await convertFileWithFFmpeg(...args);
    }
  } finally {
    conversionActive = false;
    resetFFmpeg();
    stopKeepingAwake();
  }
}

let conversionActive = false;

/** Explicit stream-copy repair: never return an unchanged input as a successful repair. */
export async function repairSampleWithFFmpeg(
  file: File,
  onProgress?: (pct: number) => void,
  onStatus?: (status: string) => void,
  onCommand?: (command: string) => void,
): Promise<{ url: string; filename: string }> {
  if (conversionActive) throw new Error('他の処理が実行中です。\nエラーコード: ERR_ENGINE_BUSY');
  if (!selectSampleMedia([file])) throw new Error('ビデオまたはオーディオファイルを一つ選択してください。\nエラーコード: ERR_INVALID_MEDIA');
  conversionActive = true;
  abortRequested = false;
  resetFFmpeg();
  const stopKeepingAwake = keepConversionAwake();
  const logs: string[] = [];
  let statusTimer: ReturnType<typeof setInterval> | undefined;
  try {
    onStatus?.('修復用FFmpegを起動中...');
    onProgress?.(2);
    const ff = await getFFmpeg(message => { logs.push(message); if (logs.length > 100) logs.shift(); });
    const ext = file.name.split('.').pop()?.toLowerCase() || (file.type.startsWith('audio/') ? 'mka' : 'mkv');
    const inputName = `sample.${ext}`;
    const outputName = `sample_repaired.${ext}`;
    let inputPath = inputName;
    let mounted = false;
    onStatus?.('サンプルファイルを読み込み中...');
    try {
      await engineOperation(ff, 'サンプル入力の準備', () => ff.createDir('/samplein'));
      mounted = await engineOperation(ff, 'サンプル入力の読み込み', () => ff.mount(FFFSType.WORKERFS, { files: [new File([file], inputName, { type: file.type })] }, '/samplein'));
    } catch (error) {
      if (abortRequested || !ff.loaded) throw error;
    }
    if (mounted) inputPath = `/samplein/${inputName}`;
    else await engineOperation(ff, 'サンプル入力の書き込み', async () => ff.writeFile(inputName, await fetchFile(file)));
    const args = buildSampleRepairArgs(inputPath, outputName);
    onCommand?.(`ffmpeg ${args.join(' ')}`);
    onProgress?.(20);
    const started = Date.now();
    const tracker = new FFmpegStallTracker(started);
    ff.on('progress', ({ progress }) => {
      if (!Number.isFinite(progress) || progress < 0) return;
      tracker.recordProgress(progress, Date.now());
      onProgress?.(20 + Math.min(progress, 1) * 65);
    });
    ff.on('log', ({ message }) => {
      tracker.recordLog(message, Date.now());
      const time = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
      if (time) tracker.recordProgress(Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]), Date.now(), 'time');
    });
    const updateStatus = () => {
      const stopped = tracker.getState(Date.now(), ff.loaded);
      if (stopped) {
        onStatus?.(`処理停止中：${stopped.seconds}秒\n${stopped.cause}`);
        if (tracker.takeAlert(Date.now())) window.alert(stopped.cause);
      } else onStatus?.(`FFmpegで修復中...（経過 ${Math.floor((Date.now() - started) / 1000)}秒）\n${getMemoryStatus(file.size)}`);
    };
    updateStatus();
    statusTimer = setInterval(updateStatus, 1000);
    const rc = await engineOperation(ff, 'サンプルファイルの修復', () => ff.exec(args), REPAIR_TIMEOUT_MS);
    clearInterval(statusTimer);
    if (rc !== 0) throw new Error(`修復に失敗しました。\nエラーコード: ${Number.isFinite(rc) ? `exit code ${rc}` : 'ERR_NO_EXIT_CODE'}\n${logs.filter(isFfmpegErrorLog).slice(-3).join('\n')}`);
    onProgress?.(90);
    onStatus?.('修復結果を確認中...');
    if (!(await readMetadata(ff, outputName))) throw new Error('修復結果のメタデータを確認できませんでした。\nエラーコード: ERR_REPAIR_INVALID_OUTPUT');
    const data = await engineOperation(ff, '修復結果の読み取り', () => ff.readFile(outputName));
    if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new Error('修復結果が空です。\nエラーコード: ERR_REPAIR_EMPTY_OUTPUT');
    if (abortRequested) throw new Error('ユーザーによりキャンセルされました');
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: file.type || 'application/octet-stream' }));
    onProgress?.(100);
    onStatus?.('修復が完了しました。');
    return { url, filename: outputName };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (/キャンセル|エラーコード:/.test(raw)) throw error;
    throw new Error(`サンプルファイルの修復に失敗しました。\nエラーコード: ERR_REPAIR_EXCEPTION\n${raw}\n${logs.filter(isFfmpegErrorLog).slice(-3).join('\n')}`);
  } finally {
    clearInterval(statusTimer);
    resetFFmpeg();
    conversionActive = false;
    stopKeepingAwake();
  }
}

/**
 * Reopening the site (bfcache restore or a fresh load) may leave a frozen worker
 * from before; discard it so the next conversion starts on a fresh engine.
 */
export function wakeFFmpegOnReopen(): void {
  if (!conversionActive) resetFFmpeg();
}

async function convertFileWithFFmpeg(
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

  // Step 1: repair with the dedicated repair FFmpeg, then convert with the main one
  onProgress?.(2);
  if (isVideo) file = await repairWithRepairFFmpeg(file, onStatus);
  if (abortRequested) throw new Error('ユーザーによりキャンセルされました');

  onStatus?.('変換用FFmpeg WASM エンジンを初期化中...');
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
    try { await engineOperation(ff, '入力の準備', () => ff.createDir(MOUNT_DIR)); } catch {}
    mounted = await engineOperation(ff, '入力の読み込み', () => ff.mount(FFFSType.WORKERFS, { files: [mountFile] }, MOUNT_DIR));
    if (mounted) inputPath = `${MOUNT_DIR}/${inputName}`;
  } catch {
    mounted = false;
  }
  if (!mounted) {
    await engineOperation(ff, '入力の書き込み', async () => ff.writeFile(inputName, await fetchFile(file)));
  }
  onProgress?.(25);

  const cleanup = async (names: string[]) => {
    if (!ff.loaded) return;
    for (const n of new Set(names)) {
      if (n.startsWith(MOUNT_DIR)) continue;
      try { await engineOperation(ff, '一時ファイルの削除', () => ff.deleteFile(n)); } catch {}
    }
    if (mounted) {
      try { await engineOperation(ff, '入力の解放', () => ff.unmount(MOUNT_DIR)); } catch {}
      try { await engineOperation(ff, '入力フォルダの削除', () => ff.deleteDir(MOUNT_DIR)); } catch {}
    }
  };

  if (abortRequested) { await cleanup([inputName]); throw new Error('ユーザーによりキャンセルされました'); }

  // Pre-conversion metadata check → repair broken/truncated input
  onStatus?.('入力ファイルのメタデータを確認中...');
  let sourceName = inputPath;
  let metadata = await readMetadata(ff, inputPath);
  if (!metadata) {
    onStatus?.('入力ファイルが破損しています。修復中...');
    sourceName = await repairFile(ff, inputPath);
    metadata = await readMetadata(ff, sourceName);
  }
  if (metadata && !metadata.hasAudio) settings = { ...settings, audioEnabled: false };

  onStatus?.('FFmpegコマンドを生成中...');
  const split = shouldSplitPasses(settings, format, isVideo);
  const VIDEO_TMP = `pass_video.${outputExt}`;
  const AUDIO_TMP = `pass_audio.${outputExt}`;
  const tempNames = [inputName, sourceName, outputName, VIDEO_TMP, AUDIO_TMP];

  type Pass = { label: string; args: string[]; fallbackArgs?: string[]; from: number; to: number };
  const passes: Pass[] = split
    ? [
        { label: 'オーディオ変換中', args: buildFFmpegArgs(sourceName, AUDIO_TMP, settings, format, isVideo, 'audio'), fallbackArgs: buildFFmpegArgs(sourceName, AUDIO_TMP, settings, format, isVideo, 'audio', true), from: 25, to: 40 },
        { label: 'ビデオ変換中', args: buildFFmpegArgs(sourceName, VIDEO_TMP, settings, format, isVideo, 'video'), fallbackArgs: buildFFmpegArgs(sourceName, VIDEO_TMP, settings, format, isVideo, 'video', true), from: 40, to: 85 },
        { label: 'ビデオとオーディオを結合中', args: buildMuxArgs(VIDEO_TMP, AUDIO_TMP, outputName, format), from: 85, to: 90 },
      ]
    : [{
        label: '変換処理中',
        args: buildFFmpegArgs(sourceName, outputName, settings, format, isVideo),
        fallbackArgs: buildFFmpegArgs(sourceName, outputName, settings, format, isVideo, 'all', true),
        from: 25, to: 90,
      }];

  onCommand?.(passes.map(p => `ffmpeg ${p.args.join(' ')}`).join('\n'));
  onStatus?.('FFmpeg → 変換実行中...');

  // Stall watchdog: if the worker crashes (out of memory etc.) ffmpeg.wasm never
  // resolves exec(). Detect "no log / no progress for a long time" and fail
  // with a clear message instead of hanging forever.
  const STALL_MS = 600_000;

  /** Human-readable meaning for an FFmpeg exit code, always shown with the code */
  const exitCodeMeaning = (rc: number): string => {
    switch (rc) {
      case 1: return '処理エラー（コーデック非対応・設定値の不整合・ファイル破損など）';
      case 2: return '引数・オプションの指定ミス';
      case 134: return '強制終了（メモリ不足の可能性）';
      case 137: return 'メモリ不足により強制終了されました';
      case 139: return 'クラッシュ（セグメンテーション違反）';
      case 255: return '内部エラーによる終了';
      default: return '不明なエラー';
    }
  };

  /** Detailed Japanese failure text: what failed + the incompatible settings */
  const failureText = (head: string, rc?: number, codeLineOverride?: string) => {
    const errLogs = logs.filter(isFfmpegErrorLog).slice(-3);
    // When no line is classified as an error, still show the last raw FFmpeg output
    const lastLogs = (errLogs.length > 0 ? errLogs : logs.slice(-3)).join('\n');
    const codeLine = codeLineOverride
      ?? (rc !== undefined ? `エラーコード: exit code ${rc}（${exitCodeMeaning(rc)}）` : '');
    return [head, codeLine, lastLogs, '', describeCodecIssue(settings, format, lastLogs)].filter(Boolean).join('\n');
  };

  /** Always produce an explicit error code + meaning from any thrown value */
  const describeThrown = (error: any): string => {
    let raw = '';
    if (typeof error === 'string') raw = error;
    else if (error instanceof Error) raw = `${error.name}: ${error.message}`;
    else if (error && typeof error === 'object') {
      raw = String(error.message ?? error.reason ?? error.type ?? '');
      if (!raw) { try { raw = JSON.stringify(error); } catch { raw = String(error); } }
    } else if (error !== undefined && error !== null) raw = String(error);
    raw = raw.trim();

    const rules: [RegExp, string, string][] = [
      [/memory access out of bounds|out of memory|Cannot enlarge memory|OOM/i, 'ERR_WASM_OUT_OF_MEMORY', 'メモリ不足でFFmpeg.wasmが停止しました'],
      [/Aborted\(|abort\(/i, 'ERR_WASM_ABORTED', 'FFmpeg.wasmが内部エラーで強制終了しました'],
      [/RuntimeError|unreachable/i, 'ERR_WASM_RUNTIME', 'FFmpeg.wasm実行中にランタイムエラーが発生しました'],
      [/terminate/i, 'ERR_FFMPEG_TERMINATED', 'FFmpegが途中で終了されました'],
      [/not loaded/i, 'ERR_FFMPEG_NOT_LOADED', 'FFmpegが読み込まれていません'],
      [/import ffmpeg-core|failed to import/i, 'ERR_CORE_IMPORT', 'FFmpegコアファイルを読み込めませんでした'],
      [/No such file|ErrnoError|errno\s*44/i, 'ERR_FS_NOENT', 'FFmpeg内のファイルが見つかりません'],
      [/errno\s*\d+|FS error/i, 'ERR_FS', 'FFmpeg内のファイル操作に失敗しました'],
      [/timeout|timed out/i, 'ERR_TIMEOUT', '処理が時間切れになりました'],
      [/応答しなく/, 'ERR_STALLED', '変換処理が応答しなくなりました'],
    ];
    const hit = rules.find(([re]) => re.test(raw));
    const code = hit ? hit[1] : (raw ? 'ERR_FFMPEG_EXCEPTION' : 'ERR_UNKNOWN_NO_DETAIL');
    const meaning = hit ? hit[2] : (raw ? 'FFmpeg実行中に例外が発生しました' : 'FFmpegが詳細を返さずに停止しました（メモリ不足またはWorkerの異常終了の可能性）');
    return `エラーコード: ${code}（${meaning}）${raw ? `\n詳細: ${raw}` : ''}`;
  };

  const attempt = async (pass: Pass, args: string[]): Promise<{ rc?: number; error?: any }> => {
    let trackProgress = true;
    const inactivity = new FFmpegInactivityClock(Date.now(), STALL_MS);
    let lastPct = pass.from;
    const started = Date.now();
    const stallTracker = new FFmpegStallTracker(started);
    const normalStatus = () => onStatus?.(`FFmpeg → ${pass.label}... ${Math.round(lastPct)}%（経過 ${Math.floor((Date.now() - started) / 1000)}秒）`);
    const onFfProgress = ({ progress }: { progress: number }) => {
      inactivity.activity(Date.now());
      if (abortRequested || !trackProgress) return;
      if (!Number.isFinite(progress) || progress < 0) return;
      const advanced = stallTracker.recordProgress(Math.min(progress, 1), Date.now());
      const pct = Math.min(pass.from + Math.min(progress, 1) * (pass.to - pass.from), pass.to);
      lastPct = Math.max(lastPct, pct);
      onProgress?.(lastPct);
      if (advanced) normalStatus();
    };
    const onActivityLog = ({ message }: { message: string }) => {
      inactivity.activity(Date.now());
      if (abortRequested || !trackProgress) return;
      stallTracker.recordLog(message, Date.now());
      const frame = /frame=\s*(\d+)/.exec(message);
      if (frame && stallTracker.recordProgress(Number(frame[1]), Date.now(), 'frame')) normalStatus();
      // stderr timestamps remain available when the core's progress callback is silent.
      const time = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
      if (!time) return;
      const elapsed = Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]);
      const advanced = stallTracker.recordProgress(elapsed, Date.now(), 'time');
      if (!metadata?.duration) {
        if (advanced) normalStatus();
        return;
      }
      const duration = (settings.endTime > 0 ? Math.min(settings.endTime, metadata.duration) : metadata.duration) - settings.startTime;
      if (duration <= 0) return;
      lastPct = Math.max(lastPct, pass.from + Math.min(elapsed / (duration / Number(settings.speed || 1)), 0.99) * (pass.to - pass.from));
      onProgress?.(lastPct);
      if (advanced) normalStatus();
    };
    ff.on('progress', onFfProgress);
    ff.on('log', onActivityLog);

    let stallTimer: ReturnType<typeof setInterval> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      stallTimer = setInterval(() => {
        if (abortRequested) {
          clearInterval(stallTimer);
          resetFFmpeg();
          reject(new Error('ユーザーによりキャンセルされました'));
          return;
        }
        if (inactivity.tick(Date.now(), document.visibilityState === 'visible')) {
          clearInterval(stallTimer);
          resetFFmpeg();
          reject(new Error('変換処理が応答しません。\nエラーコード: ERR_ENGINE_UNRESPONSIVE（画面表示中に10分間応答なし。FFmpegの終了コードは返されていません）'));
          return;
        }
        const stopped = stallTracker.getState(Date.now(), ff.loaded);
        if (stopped) {
          // Stalled status intentionally excludes memory, percentage and phase details.
          const text = `処理停止中：${stopped.seconds}秒\n${stopped.cause}`;
          rawStatus?.(text);
          if (stallTracker.takeAlert(Date.now())) window.alert(stopped.cause);
        } else if (ff.loaded) {
          normalStatus();
        }
      }, 1_000);
    });

    // Warnings / info lines on stderr (Stream #, [swscaler], deprecated pixel format, ...)
    // are normal FFmpeg output and are never treated as errors. Failure = thrown
    // exception OR a non-zero exit code returned by exec().
    try {
      onProgress?.(pass.from);
      onStatus?.(`FFmpeg → ${pass.label}...`);
      const rc = await Promise.race([ff.exec(args), stalled]);
      return { rc };
    } catch (error: any) {
      return { error };
    } finally {
      clearInterval(stallTimer);
      trackProgress = false;
      try { ff.off('progress', onFfProgress); ff.off('log', onActivityLog); } catch {}
    }
  };

  const runPass = async (pass: Pass) => {
    let { rc, error } = await attempt(pass, pass.args);
    if (String(error?.message ?? '').includes('キャンセル')) {
      if (ffmpeg) await cleanup(tempNames);
      throw error;
    }

    // Legacy codecs (H.263 / AMR / ADPCM ...) often reject the full filter chain.
    // Retry once with only the essential filters before giving up.
    if ((error || rc !== 0) && pass.fallbackArgs && ffmpeg?.loaded) {
      onStatus?.(`FFmpeg → ${pass.label}...（互換設定で再試行中）`);
      onCommand?.(`ffmpeg ${pass.fallbackArgs.join(' ')}`);
      ({ rc, error } = await attempt(pass, pass.fallbackArgs));
    }

    if (error) {
      if (ffmpeg) { try { await cleanup(tempNames); } catch {} }
      if (/キャンセル|ERR_ENGINE_UNRESPONSIVE/.test(String(error?.message ?? error))) throw error;
      throw new Error(failureText(`FFmpegエラー（${pass.label}）:`, undefined, describeThrown(error)));
    }
    if (rc !== 0) {
      try { await cleanup(tempNames); } catch {}
      if (typeof rc !== 'number' || !Number.isFinite(rc)) {
        throw new Error(failureText(`FFmpegエラー（${pass.label}）:`, undefined,
          `エラーコード: ERR_NO_EXIT_CODE（FFmpegが終了コードを返さずに停止しました。返り値: ${String(rc)}）`));
      }
      throw new Error(failureText(`FFmpegエラー（${pass.label}）:`, rc));
    }

    if (abortRequested) { await cleanup(tempNames); throw new Error('ユーザーによりキャンセルされました'); }
    onProgress?.(pass.to);
  };

  for (const pass of passes) {
    await runPass(pass);
  }
  // Free the intermediate streams before reading the result
  for (const n of [VIDEO_TMP, AUDIO_TMP]) { try { await engineOperation(ff, '中間ファイルの削除', () => ff.deleteFile(n)); } catch {} }

  onStatus?.('出力ファイルのメタデータを確認中...');
  let finalName = outputName;
  if (!(await readMetadata(ff, outputName))) {
    onStatus?.('出力ファイルが破損しています。修復中...');
    finalName = await repairFile(ff, outputName);
  }

  onStatus?.('FFmpeg → 出力ファイルを読み取り中...');
  onProgress?.(92);

  const data = await engineOperation(ff, '出力ファイルの読み取り', () => ff.readFile(finalName));
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
