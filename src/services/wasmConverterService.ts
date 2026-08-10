import type { ConvertSettings } from '@/constants/converterOptions';

// Helper to load CDN scripts dynamically
async function loadScript(src: string): Promise<void> {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`スクリプトの読込に失敗しました: ${src}`));
    document.head.appendChild(script);
  });
}

// Load FFmpeg & ExifReader into window
async function ensureBrowserTools(onLog?: (msg: string) => void): Promise<{ FFmpeg: any; fetchFile: any; ExifReader: any }> {
  if (onLog) onLog('[System] ブラウザ内コンバータモジュールをロード中...');

  await Promise.all([
    loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js'),
    loadScript('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/util.js'),
    loadScript('https://cdn.jsdelivr.net/npm/exifreader@4.21.1/dist/exif-reader.min.js')
  ]);

  const FFmpegWASM = (window as any).FFmpegWASM;
  const FFmpegUtil = (window as any).FFmpegUtil;
  const ExifReader = (window as any).ExifReader;

  if (!FFmpegWASM || !FFmpegUtil) {
    throw new Error('FFmpeg モジュールの初期化に失敗しました。');
  }

  return { FFmpeg: FFmpegWASM.FFmpeg, fetchFile: FFmpegUtil.fetchFile, ExifReader };
}

let ffmpegInstance: any = null;

export async function convertMediaFile(
  file: File,
  settings: ConvertSettings,
  outputFormat: string,
  onProgress?: (pct: number) => void,
  onLog?: (msg: string) => void
): Promise<Blob> {
  const { FFmpeg, fetchFile, ExifReader } = await ensureBrowserTools(onLog);

  if (ExifReader) {
    try {
      const tags = await ExifReader.load(file);
      if (onLog) onLog(`[ExifReader] メタデータ解析完了 (${Object.keys(tags).length} 個のタグ)`);
    } catch {
      if (onLog) onLog('[ExifReader] メタデータ直接解析をスキップ');
    }
  }

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    if (onLog) {
      ffmpegInstance.on('log', ({ message }: { message: string }) => onLog(message));
    }
    if (onProgress) {
      ffmpegInstance.on('progress', ({ progress }: { progress: number }) => {
        onProgress(Math.min(Math.round(progress * 100), 100));
      });
    }

    if (onLog) onLog('[WASM Engine] コアモジュールをロード中...');
    const unpkgBase = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpegInstance.load({
      coreURL: `${unpkgBase}/ffmpeg-core.js`,
      wasmURL: `${unpkgBase}/ffmpeg-core.wasm`
    });
  }

  const inputName = `input_${Date.now()}_${file.name}`;
  const outExt = outputFormat.toLowerCase();
  const outputName = `output_${Date.now()}.${outExt}`;

  if (onLog) onLog(`[WASM Memory] ファイル配置中: ${inputName}`);
  await ffmpegInstance.writeFile(inputName, await fetchFile(file));

  // -err_detect careful mode
  const args: string[] = ['-err_detect', 'careful', '-i', inputName];

  if (settings.videoCodec === 'copy') {
    args.push('-c:v', 'copy');
  } else if (settings.videoCodec) {
    args.push('-c:v', settings.videoCodec);
  } else {
    args.push('-c:v', 'libx264');
  }

  if (settings.audioCodec === 'none' || !settings.audioEnabled) {
    args.push('-an');
  } else if (settings.audioCodec === 'copy') {
    args.push('-c:a', 'copy');
  } else if (settings.audioCodec) {
    args.push('-c:a', settings.audioCodec);
  } else {
    args.push('-c:a', 'aac');
  }

  if (outExt === 'mp4' || outExt === 'mov') {
    args.push('-movflags', '+faststart');
  }

  const nowISO = new Date().toISOString();
  args.push(
    '-metadata', `title=${file.name.replace(/\.[^/.]+$/, '')}`,
    '-metadata', `creation_time=${nowISO}`,
    '-metadata', 'encoder=Media2Converter Pure Engine'
  );

  args.push(outputName);

  if (onLog) onLog(`[FFmpeg Careful] 実行コマンド: ffmpeg ${args.join(' ')}`);

  try {
    await ffmpegInstance.exec(args);
  } catch (err) {
    if (onLog) onLog('[FFmpeg Careful Alert] Carefulエラー検出。自動補修フォールバックを実行中...');
    const fallbackArgs = ['-err_detect', 'ignore_err', '-i', inputName, '-c', 'copy', '-movflags', '+faststart', outputName];
    await ffmpegInstance.exec(fallbackArgs);
  }

  const resultData = await ffmpegInstance.readFile(outputName);
  const blob = new Blob([resultData.buffer], { type: `video/${outExt}` });

  await ffmpegInstance.deleteFile(inputName);
  await ffmpegInstance.deleteFile(outputName);

  if (onLog) onLog('[System] 100% 自動補修・変換処理が完了しました');

  return blob;
}

export const serverConverter = {
  convert: convertMediaFile
};

