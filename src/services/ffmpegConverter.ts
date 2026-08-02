import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  CODEC_MAP, AAC_HE_PROFILE, FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  type ConvertSettings,
} from '@/constants/converterOptions';

let ffmpeg: FFmpeg | null = null;
let abortRequested = false;

export function requestAbort() {
  abortRequested = true;
}

/** Reset FFmpeg instance completely */
export function resetFFmpeg() {
  if (ffmpeg) {
    try { ffmpeg.terminate(); } catch {}
  }
  ffmpeg = null;
}

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  await ffmpeg.load();
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

      // Force CFR to prevent VFR corruption
      args.push('-vsync', 'cfr');
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
    await ff.exec(args);
  } catch (err: any) {
    const lastLogs = logs.slice(-3).join('\n');
    throw new Error(`FFmpegエラー:\n${lastLogs || err?.message || '変換に失敗しました'}`);
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
