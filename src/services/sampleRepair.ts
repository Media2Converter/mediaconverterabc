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

export function buildSampleRepairArgs(input: string, output: string): string[] {
  const args = [
    '-y', '-nostdin', '-hide_banner', '-stats_period', '1',
    '-copyts', '-err_detect', 'careful',
    '-i', input, '-map', '0', '-map_metadata', '0', '-map_chapters', '0',
    '-c', 'copy', '-avoid_negative_ts', 'disabled',
    '-max_muxing_queue_size', '9999',
  ];
  if (/\.(mp4|mov|m4v|m4a|3gp|3g2)$/i.test(output)) args.push('-movflags', '+faststart');
  return [...args, output];
}

const SPEC_FIELDS = ['codec_type', 'codec_name', 'width', 'height', 'pix_fmt', 'sample_rate', 'channels', 'channel_layout'] as const;
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