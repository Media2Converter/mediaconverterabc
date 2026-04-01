import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import {
  CODEC_MAP, FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  type ConvertSettings,
} from '@/constants/converterOptions';

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }
  ffmpeg.on('progress', ({ progress }) => {
    // progress is 0-1
  });
  await ffmpeg.load();
  return ffmpeg;
}

/** Build FFmpeg arguments from settings */
export function buildFFmpegArgs(
  inputName: string,
  outputName: string,
  settings: ConvertSettings,
  format: string,
  isVideo: boolean,
): string[] {
  const args: string[] = ['-i', inputName];
  const outputIsVideo = isVideoFormat(format);

  // Start/End time
  if (settings.startTime > 0) {
    args.push('-ss', String(settings.startTime));
  }
  if (settings.endTime > 0) {
    args.push('-to', String(settings.endTime));
  }

  // Video settings
  if (outputIsVideo && isVideo) {
    if (settings.videoCodec === 'copy') {
      args.push('-c:v', 'copy');
    } else {
      const vCodec = CODEC_MAP[settings.videoCodec] || 'libx264';
      args.push('-c:v', vCodec);

      // Resolution
      args.push('-s', `${settings.resolutionW}x${settings.resolutionH}`);

      // Video bitrate
      const vBitrate = settings.videoBitrate.replace('KBPS', 'k');
      args.push('-b:v', vBitrate);

      // Framerate
      const fps = settings.framerate.replace('FPS', '');
      args.push('-r', fps);

      // Aspect ratio (if not 自由)
      if (settings.aspectRatio !== '自由') {
        args.push('-aspect', settings.aspectRatio);
      }

      // Interlace
      if (settings.scanType === 'インターレース方式') {
        args.push('-flags', '+ilme+ildct');
      }
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

    // Audio bitrate
    const aBitrate = settings.audioBitrate.replace('KBPS', 'k');
    args.push('-b:a', aBitrate);

    // Channels
    args.push('-ac', settings.channels === 'モノラル' ? '1' : '2');

    // Frequency
    const freq = settings.frequency.replace('Hz', '');
    args.push('-ar', freq);

    // Volume
    if (settings.volume !== 'none') {
      args.push('-af', `volume=${settings.volume}dB`);
    }
  }

  // Speed
  if (settings.speed !== '1') {
    const speed = parseFloat(settings.speed);
    if (outputIsVideo && isVideo) {
      // Video speed filter
      args.push('-filter:v', `setpts=${(1 / speed).toFixed(6)}*PTS`);
    }
    if (settings.audioEnabled && settings.audioCodec !== 'none' && settings.audioCodec !== 'copy') {
      const audioFilter = settings.pitchSync
        ? `atempo=${speed}`
        : `asetrate=${Math.round(44100 * speed)},aresample=44100,atempo=1`;
      // Combine with volume filter if present
      const existingAfIdx = args.indexOf('-af');
      if (existingAfIdx !== -1) {
        args[existingAfIdx + 1] += `,${audioFilter}`;
      } else {
        args.push('-af', audioFilter);
      }
    }
  }

  args.push('-y', outputName);
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
): Promise<{ url: string; filename: string }> {
  const logs: string[] = [];
  const logCollector = (msg: string) => {
    logs.push(msg);
    onLog?.(msg);
  };

  onProgress?.(5);
  const ff = await getFFmpeg(logCollector);
  onProgress?.(15);

  const inputExt = file.name.split('.').pop() || 'mp4';
  const inputName = `input.${inputExt}`;
  const outputExt = FORMAT_EXT[format] || 'mp4';
  const outputName = `output.${outputExt}`;

  // Write input file
  await ff.writeFile(inputName, await fetchFile(file));
  onProgress?.(25);

  const args = buildFFmpegArgs(inputName, outputName, settings, format, isVideo);

  // Listen to progress
  ff.on('progress', ({ progress }) => {
    const pct = Math.min(25 + progress * 65, 90);
    onProgress?.(pct);
  });

  try {
    await ff.exec(args);
  } catch (err: any) {
    throw new Error(`FFmpegエラー: ${err?.message || '変換に失敗しました'}\n\nログ:\n${logs.slice(-10).join('\n')}`);
  }

  onProgress?.(92);

  // Read output
  const data = await ff.readFile(outputName);
  onProgress?.(96);

  const mime = FORMAT_MIME[format] || 'application/octet-stream';
  const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);

  // Cleanup
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress?.(100);
  return { url, filename: `converted.${outputExt}` };
}

/** Get all FFmpeg logs for error analysis */
export function getFFmpegLogs(): string[] {
  return [];
}
