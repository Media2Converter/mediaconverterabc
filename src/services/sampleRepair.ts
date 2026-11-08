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
  return [
    '-y', '-nostdin', '-hide_banner', '-stats_period', '1',
    '-err_detect', 'ignore_err', '-fflags', '+discardcorrupt+genpts+igndts',
    '-i', input, '-map', '0', '-c', 'copy', '-ignore_unknown',
    '-avoid_negative_ts', 'make_zero', '-max_error_rate', '1.0',
    '-max_muxing_queue_size', '9999', output,
  ];
}