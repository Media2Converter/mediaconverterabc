import type { ConvertSettings } from '@/constants/converterOptions';
import { CODEC_MAP, FORMAT_EXT, isVideoFormat } from '@/constants/converterOptions';

export interface InstructionPayload {
  /** JavaScript source code describing the conversion instructions */
  js: string;
  /** Flat params (resolution, bitrate, ...) derived from the instructions */
  params: Record<string, string>;
}

const num = (v: string) => parseFloat(v.replace(/[^0-9.]/g, '')) || 0;

/**
 * Build the instruction document for the conversion server as JavaScript source.
 * The server can eval / parse this module to read resolution, bitrate, codecs, etc.
 */
export function buildInstructionScript(
  file: File,
  format: string,
  settings: ConvertSettings,
): InstructionPayload {
  const video = isVideoFormat(format);
  const ext = FORMAT_EXT[format] || 'mp4';

  const w = Math.max(2, Math.round(settings.resolutionW / 2) * 2);
  const h = Math.max(2, Math.round(settings.resolutionH / 2) * 2);

  const instruction = {
    input: { name: file.name, size: file.size, type: file.type },
    output: { format, ext, kind: video ? 'video' : 'audio' },
    video: video
      ? {
          codec: CODEC_MAP[settings.videoCodec] || 'libx264',
          codecLabel: settings.videoCodec,
          pixelFormat: settings.pixelFormat === 'auto' ? 'yuv420p' : settings.pixelFormat,
          width: w,
          height: h,
          aspectRatio: settings.aspectRatio,
          scanType: settings.scanType,
          bitrateKbps: num(settings.videoBitrate),
          framerate: num(settings.framerate),
          // 縦横比変更時は黒バー（レターボックス）で全体表示
          letterbox: true,
          scaleFilter: `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
        }
      : null,
    audio: settings.audioEnabled
      ? {
          codec: CODEC_MAP[settings.audioCodec] || 'aac',
          codecLabel: settings.audioCodec,
          bitrateKbps: num(settings.audioBitrate),
          channels: settings.channels === 'モノラル' ? 1 : 2,
          sampleRate: num(settings.frequency),
          volumeDb: settings.volume === 'none' ? null : num(settings.volume),
        }
      : null,
    trim: { start: settings.startTime, end: settings.endTime || null },
    speed: { rate: num(settings.speed) || 1, pitchSync: settings.pitchSync },
    flags: {
      ignoreErrors: true,
      regenerateTimestamps: true,
      fpsMode: 'cfr',
      movflags: '+faststart',
      iosCompatible: true,
    },
  };

  const js = `// メディアコンバータ 変換指示書 (JavaScript)
// generated: ${new Date().toISOString()}
export const instructions = ${JSON.stringify(instruction, null, 2)};

export function toFfmpegArgs(input = "input.${(file.name.split('.').pop() || 'mp4').toLowerCase()}", output = "output.${ext}") {
  const i = instructions;
  const args = ["-y", "-fflags", "+genpts", "-err_detect", "ignore_err", "-i", input];
  if (i.video) {
    args.push("-c:v", i.video.codec, "-pix_fmt", i.video.pixelFormat);
    args.push("-vf", i.video.scaleFilter);
    args.push("-b:v", i.video.bitrateKbps + "k", "-r", String(i.video.framerate), "-fps_mode", "cfr");
  } else {
    args.push("-vn");
  }
  if (i.audio) {
    args.push("-c:a", i.audio.codec, "-b:a", i.audio.bitrateKbps + "k",
      "-ac", String(i.audio.channels), "-ar", String(i.audio.sampleRate));
    if (i.audio.volumeDb !== null) args.push("-af", "volume=" + i.audio.volumeDb + "dB");
  } else {
    args.push("-an");
  }
  if (i.trim.start) args.push("-ss", String(i.trim.start));
  if (i.trim.end) args.push("-to", String(i.trim.end));
  args.push("-movflags", i.flags.movflags, output);
  return args;
}

export default instructions;
`;

  const params: Record<string, string> = {
    format: ext,
    vcodec: instruction.video?.codec || '',
    acodec: instruction.audio?.codec || '',
    width: instruction.video ? String(w) : '',
    height: instruction.video ? String(h) : '',
    video_bitrate: instruction.video ? `${instruction.video.bitrateKbps}k` : '',
    framerate: instruction.video ? String(instruction.video.framerate) : '',
    pix_fmt: instruction.video?.pixelFormat || '',
    audio_bitrate: instruction.audio ? `${instruction.audio.bitrateKbps}k` : '',
    ac: instruction.audio ? String(instruction.audio.channels) : '',
    ar: instruction.audio ? String(instruction.audio.sampleRate) : '',
  };
  for (const k of Object.keys(params)) if (!params[k]) delete params[k];

  return { js, params };
}
