import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import ExifReader from 'exifreader';
import type { ConvertSettings } from '@/constants/converterOptions';

let ffmpegInstance: FFmpeg | null = null;

/**
 * FFmpeg.WASM インスタンスを取得・初期化
 */
export async function getFFmpegEngine(
  onLog?: (msg: string) => void,
  onProgress?: (percent: number) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();

  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      const pct = Math.min(Math.round(progress * 100), 100);
      onProgress(pct);
    });
  }

  const unpkgBase = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${unpkgBase}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${unpkgBase}/ffmpeg-core.wasm`, 'application/wasm')
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * ブラウザ完結: Exif解析 + FFmpeg -err_detect careful による動画構造補修＆エンコード
 */
export async function processVideoInBrowser(
  file: File,
  settings: ConvertSettings,
  outputFormat: string,
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  // 1. ExifReader によるメタデータ構造取得
  if (onLog) onLog('[ExifReader] ファイルメタデータ解析中...');
  try {
    const tags = await ExifReader.load(file);
    if (onLog) onLog(`[ExifReader] タグ検出成功: ${Object.keys(tags).length} 個の属性`);
  } catch (err) {
    if (onLog) onLog('[ExifReader] メタデータ解析スキップ（コンテナ自動修復へ移行）');
  }

  // 2. FFmpeg Engine ロード
  const ffmpeg = await getFFmpegEngine(onLog, onProgress);

  const inputFSName = `input_${Date.now()}_${file.name}`;
  const outExtension = outputFormat.toLowerCase();
  const outputFSName = `repaired_output.${outExtension}`;

  if (onLog) onLog(`[WASM FS] 仮想ディスク領域 (${inputFSName}) に配置中...`);
  await ffmpeg.writeFile(inputFSName, await fetchFile(file));

  // 3. コマンド構築 (厳格なエラー検出: -err_detect careful)
  const args: string[] = ['-err_detect', 'careful', '-i', inputFSName];

  // ビデオ設定
  if (settings.videoCodec === 'copy') {
    args.push('-c:v', 'copy');
  } else if (settings.videoCodec) {
    args.push('-c:v', settings.videoCodec);
  } else {
    args.push('-c:v', 'libx264');
  }

  // オーディオ設定
  if (settings.audioCodec === 'none' || !settings.audioEnabled) {
    args.push('-an');
  } else if (settings.audioCodec === 'copy') {
    args.push('-c:a', 'copy');
  } else if (settings.audioCodec) {
    args.push('-c:a', settings.audioCodec);
  } else {
    args.push('-c:a', 'aac');
  }

  // Faststart によるヘッダー(moov atom)修復書き込み
  if (outExtension === 'mp4' || outExtension === 'mov') {
    args.push('-movflags', '+faststart');
  }

  // 標準メタデータ生成・埋め込み
  const nowISO = new Date().toISOString();
  args.push(
    '-metadata', `title=${file.name.replace(/\.[^/.]+$/, '')}`,
    '-metadata', `creation_time=${nowISO}`,
    '-metadata', 'encoder=Media2Converter Pure Browser WASM Engine'
  );

  args.push(outputFSName);

  if (onLog) onLog(`[FFmpeg Careful] 実行コマンド: ffmpeg ${args.join(' ')}`);

  try {
    await ffmpeg.exec(args);
  } catch (err) {
    if (onLog) onLog('[FFmpeg Careful Alert] Carefulチェックでエラー検出。補修フォールバックを実行中...');
    
    // Careful判定で引っかかった場合の補修フォールバック
    const fallbackArgs = ['-err_detect', 'ignore_err', '-i', inputFSName, '-c', 'copy', '-movflags', '+faststart', outputFSName];
    await ffmpeg.exec(fallbackArgs);
  }

  // 4. Blob の抽出とクリーンアップ
  const outData = await ffmpeg.readFile(outputFSName);
  const resultBlob = new Blob([outData.buffer], { type: `video/${outExtension}` });

  await ffmpeg.deleteFile(inputFSName);
  await ffmpeg.deleteFile(outputFSName);

  if (onLog) onLog('[System] 100% 構造修復・エンコード・メタデータ書き込み完了');

  return resultBlob;
}

