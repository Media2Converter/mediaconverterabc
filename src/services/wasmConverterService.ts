import type { ConvertSettings } from '@/constants/converterOptions';

export async function convertMediaFile(
  file: File,
  settings: ConvertSettings,
  outputFormat: string,
  onProgress?: (pct: number) => void,
  onLog?: (msg: string) => void
): Promise<Blob> {
  throw new Error('Index.tsx 内のインライン処理に切り替わりました');
}

export const serverConverter = {
  convert: convertMediaFile
};

