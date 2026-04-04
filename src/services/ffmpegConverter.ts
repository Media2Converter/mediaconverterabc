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

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  await ffmpeg.load();
  return ffmpeg;
}

/** Make a number even (round down) */
function makeEven(n: number): number {
  return Math.floor(n / 2) * 2;
}

/** Build FFmpeg arguments from settings — "safety-first" logic */
export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
): string[] {
  const args: string[] = ['-y', '-i', inputName];
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

      // Resolution - force even numbers using scale filter with trunc
      const w = makeEven(settings.resolutionW);
      const h = makeEven(settings.resolutionH);
      vFilters.push(`scale='trunc(${w}/2)*2:trunc(${h}/2)*2'`);

      // Video bitrate
      const vBitrate = settings.videoBitrate.replace('KBPS', 'k');
      args.push('-b:v', vBitrate);

      // Framerate
      const fps = settings.framerate.replace('FPS', '');
      args.push('-r', fps);

      // Aspect ratio
      if (settings.aspectRatio !== '自由') {
        args.push('-aspect', settings.aspectRatio);
      }

      // Interlace — safe processing
      if (settings.scanType === 'インターレース方式') {
        vFilters.push('tinterlace=interleave_top', 'setfield=tff');
        args.push('-flags', '+ilme+ildct');
      }

      // vsync for A/V sync safety
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

    // AMR strict mode
    if (settings.audioCodec === 'AMR_NB') {
      args.push('-ar', '8000', '-ac', '1', '-ab', '12.2k');
      args.push('-strict', '-2');
      aFilters.push('aresample=8000', 'pan=mono|c0=c0+c1');
    } else if (settings.audioCodec === 'AMR_WB') {
      args.push('-ar', '16000', '-ac', '1');
      args.push('-strict', '-2');
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

    // Async resampling for A/V sync safety
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

  // Buffer safety
  args.push('-max_muxing_queue_size', '1024');

  // movflags for container repair & compatibility
  if (['3gp', '3g2'].includes(lowerFormat)) {
    args.push('-movflags', '+faststart+frag_keyframe+empty_moov');
  } else if (['mov', 'mp4', 'm4v'].includes(lowerFormat)) {
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

  onStatus?.('FFmpeg → コマンドを生成中...');
  const args = buildFFmpegArgs(inputName, outputName, settings, format, isVideo);
  onStatus?.(`FFmpeg → 変換開始: ffmpeg ${args.join(' ').substring(0, 80)}...`);

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
