const MEDIA_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp', '3g2', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma', 'aiff', 'aif', 'opus', 'amr', 'm4b', 'mts', 'm2ts', 'ts', 'mpeg', 'mpg', 'ogv', 'oga']);

export const SAMPLE_MEDIA_ACCEPT = `video/*,audio/*,${[...MEDIA_EXTENSIONS].map(ext => `.${ext}`).join(',')}`;
export const SAMPLE_REPAIR_ACTION = 'sample_repair';
export const SAMPLE_REPAIR_GROUP = {
  label: 'その他のツール',
  options: [{ label: 'サンプルファイルを使用して変換・修復', value: SAMPLE_REPAIR_ACTION }],
};

export function selectSampleMedia(files: ArrayLike<File> | null): File | null {
  if (!files || files.length !== 1) return null;
  const file = files[0];
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return /^(video|audio)\//.test(file.type) || (!file.type && MEDIA_EXTENSIONS.has(extension)) ? file : null;
}

export interface ReferenceHeader {
  brand?: string;
  videoTag?: string;
  audioTag?: string;
  videoTimescale?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
}

interface ProbeStream { codec_type?: string; codec_name?: string; codec_tag_string?: string; time_base?: string }

/** Header values copied from the reference; codec tags only when the input codec matches (a wrong tag breaks playback). */
export function buildReferenceHeader(inputJson: string, referenceJson: string): ReferenceHeader {
  try {
    const input = JSON.parse(inputJson) as { streams?: ProbeStream[] };
    const ref = JSON.parse(referenceJson) as { streams?: ProbeStream[]; format?: { tags?: Record<string, string> } };
    const find = (list: ProbeStream[] | undefined, type: string) => (list || []).find(s => s?.codec_type === type);
    const tag = (type: string) => {
      const a = find(input.streams, type);
      const b = find(ref.streams, type);
      const t = b?.codec_tag_string;
      return a && b && a.codec_name === b.codec_name && t && /^[A-Za-z0-9 ._-]{4}$/.test(t) ? t : undefined;
    };
    const tb = /^1\/(\d+)$/.exec(find(ref.streams, 'video')?.time_base || '');
    const brand = ref.format?.tags?.major_brand?.trim();
    return {
      brand: brand && /^[A-Za-z0-9 ]{1,4}$/.test(brand) ? brand : undefined,
      videoTag: tag('video'),
      audioTag: tag('audio'),
      videoTimescale: tb ? Number(tb[1]) : undefined,
      hasVideo: !!find(ref.streams, 'video'),
      hasAudio: !!find(ref.streams, 'audio'),
    };
  } catch {
    return {};
  }
}

export const REFERENCE_HEADER_ENTRIES = 'stream=codec_type,codec_name,codec_tag_string,time_base:format_tags=major_brand';

/** Container and global/track header come from the reference; encoded packets come only from the input. */
export function buildSampleRepairArgs(input: string, output: string, reference?: string, header: ReferenceHeader = {}): string[] {
  const isMov = /\.(mp4|mov|m4v|m4a|3gp|3g2)$/i.test(output);
  const args = [
    '-y', '-nostdin', '-hide_banner', '-stats_period', '1',
    '-fflags', '+genpts', '-err_detect', 'ignore_err',
    '-i', input, ...(reference ? ['-i', reference] : []),
    '-map', '0:v?', '-map', '0:a?', '-map_metadata', reference ? '1' : '0', '-map_chapters', '-1', '-dn', '-sn',
  ];
  if (reference && header.hasVideo) args.push('-map_metadata:s:v:0', '1:s:v:0');
  if (reference && header.hasAudio) args.push('-map_metadata:s:a:0', '1:s:a:0');
  args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '9999');
  if (header.videoTag) args.push('-tag:v', header.videoTag);
  if (header.audioTag) args.push('-tag:a', header.audioTag);
  if (isMov) {
    if (header.brand) args.push('-brand', header.brand);
    if (header.videoTimescale && header.videoTimescale > 0) args.push('-video_track_timescale', String(header.videoTimescale));
    args.push('-movflags', '+faststart');
  }
  return [...args, output];
}

const SPEC_FIELDS = ['codec_type', 'codec_name', 'profile', 'level', 'width', 'height', 'pix_fmt', 'sample_rate', 'channels', 'channel_layout', 'bits_per_sample', 'bits_per_raw_sample', 'extradata_size'] as const;
export const SAMPLE_SPEC_ENTRIES = `stream=${SPEC_FIELDS.join(',')}`;

/** Compare stream headers, not container size or bitrate (which remuxing changes). */
export function sampleSpecsMatch(input: string, output: string): boolean {
  const before = JSON.parse(input).streams;
  const after = JSON.parse(output).streams;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length === 0 || before.length !== after.length) return false;
  return before.every((stream, index) =>
    stream && after[index] && SPEC_FIELDS.every(field => stream[field] === after[index][field]),
  );
}

/** Reference duration, timestamps and container tags are deliberately not copied. */
export function sampleReferenceCompatible(input: string, reference: string): boolean {
  try {
    const before = JSON.parse(input).streams;
    const sample = JSON.parse(reference).streams;
    if (!Array.isArray(before) || !Array.isArray(sample)) return false;
    const media = (streams: Record<string, unknown>[]) => streams.filter(stream => stream && ['video', 'audio'].includes(String(stream.codec_type)));
    const inputMedia = media(before);
    const sampleMedia = media(sample);
    const valid = (stream: Record<string, unknown>) => {
      if (typeof stream.codec_name !== 'string' || !stream.codec_name || stream.codec_name === 'unknown') return false;
      if (stream.codec_type === 'video') return Number(stream.width) > 0 && Number(stream.height) > 0;
      return Number(stream.sample_rate) > 0 && Number(stream.channels) > 0;
    };
    return inputMedia.length > 0 && inputMedia.every(valid) && sampleMedia.every(valid)
      && sampleSpecsMatch(JSON.stringify({ streams: inputMedia }), JSON.stringify({ streams: sampleMedia }));
  } catch {
    return false;
  }
}