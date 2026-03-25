import React, { useState, useRef, useCallback } from 'react';
import { ProgressCircle } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS, IPHONE_BAD_FORMATS,
  IPHONE_BAD_VIDEO_CODECS, IPHONE_BAD_AUDIO_CODECS,
  FORMAT_EXT, FORMAT_MIME, CODEC_MAP, isVideoFormat,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const Index: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);

  const videoFileRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);
  const audioCaptureRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter(
        f => f.type.startsWith('video/') || f.type.startsWith('audio/')
      );
      if (newFiles.length === 0) return;
      setFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => {
        const url = URL.createObjectURL(f);
        setFileUrls(prev => [...prev, url]);
        if (f.type.startsWith('video/')) {
          const vid = document.createElement('video');
          vid.src = url;
          vid.onloadedmetadata = () => setVideoDuration(vid.duration);
        }
      });
    }
    e.target.value = '';
  }, []);

  const removeFile = (i: number) => {
    const file = files[i];
    if (!file) return;
    const ok = window.confirm(`「${file.name}」を削除しますか？`);
    if (!ok) return;
    URL.revokeObjectURL(fileUrls[i]);
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setFileUrls(prev => prev.filter((_, idx) => idx !== i));
  };

  const isVideo = files.some(f => f.type.startsWith('video/'));

  const allFormats = [
    { group: '動画形式', items: VIDEO_FORMATS },
    { group: '音声形式', items: AUDIO_FORMATS },
  ];

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) return;
    setSelectedFormat(value);
    if (IPHONE_BAD_FORMATS.includes(value)) {
      window.alert(`⚠️ 互換性の警告\n\n${value}形式はiPhoneで再生できない可能性があります。`);
    }
  };

  const checkSettingsWarnings = (): string | null => {
    const warnings: string[] = [];
    if (IPHONE_BAD_VIDEO_CODECS.includes(settings.videoCodec)) warnings.push(`ビデオコーデック: ${settings.videoCodec}`);
    if (IPHONE_BAD_AUDIO_CODECS.includes(settings.audioCodec)) warnings.push(`オーディオコーデック: ${settings.audioCodec}`);
    if (selectedFormat && IPHONE_BAD_FORMATS.includes(selectedFormat)) warnings.push(`形式: ${selectedFormat}`);
    if (warnings.length > 0) return `以下の設定はiPhoneで再生エラーが出る可能性があります:\n${warnings.join('\n')}`;
    return null;
  };

  const handleConvert = async () => {
    const warning = checkSettingsWarnings();
    if (warning) {
      window.alert(`⚠️ iPhoneの互換性警告\n\n${warning}`);
    }

    setConverting(true);
    setProgress(0);

    try {
      if (!ffmpegRef.current) {
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.min(p * 100, 99)));
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        ffmpegRef.current = ffmpeg;
      }

      const ffmpeg = ffmpegRef.current;
      const inputFile = files[0];
      const inputName = 'input' + inputFile.name.substring(inputFile.name.lastIndexOf('.'));
      const ext = FORMAT_EXT[selectedFormat!] || 'mp4';
      const outputName = `output.${ext}`;

      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      const args: string[] = ['-i', inputName];

      if (settings.startTime > 0) args.push('-ss', String(settings.startTime));
      if (settings.endTime > 0) args.push('-to', String(settings.endTime));

      const outputIsVideo = isVideoFormat(selectedFormat!);

      if (isVideo && outputIsVideo) {
        const vCodec = CODEC_MAP[settings.videoCodec] || 'libx264';
        args.push('-c:v', vCodec);
        const vBr = settings.videoBitrate.replace('KBPS', 'k');
        args.push('-b:v', vBr);
        const fps = settings.framerate.replace('FPS', '');
        args.push('-r', fps);
        args.push('-s', `${settings.resolutionW}x${settings.resolutionH}`);

        if (settings.speed !== '1') {
          const spd = parseFloat(settings.speed);
          args.push('-filter:v', `setpts=PTS/${spd}`);
        }
        if (settings.scanType === 'インターレース方式') {
          args.push('-flags', '+ilme+ildct');
        }
      } else if (!outputIsVideo) {
        args.push('-vn');
      }

      const aCodec = CODEC_MAP[settings.audioCodec] || 'aac';
      args.push('-c:a', aCodec);
      const aBr = settings.audioBitrate.replace('KBPS', 'k');
      args.push('-b:a', aBr);
      args.push('-ac', settings.channels === 'モノラル' ? '1' : '2');
      const freq = settings.frequency.replace('Hz', '');
      args.push('-ar', freq);

      if (settings.speed !== '1' && parseFloat(settings.speed) !== 1) {
        const spd = parseFloat(settings.speed);
        if (spd <= 2 && spd >= 0.5) {
          args.push('-filter:a', `atempo=${spd}`);
        } else if (spd > 2) {
          const chain: string[] = [];
          let remaining = spd;
          while (remaining > 2) { chain.push('atempo=2.0'); remaining /= 2; }
          chain.push(`atempo=${remaining}`);
          args.push('-filter:a', chain.join(','));
        } else {
          const chain: string[] = [];
          let remaining = spd;
          while (remaining < 0.5) { chain.push('atempo=0.5'); remaining /= 0.5; }
          chain.push(`atempo=${remaining}`);
          args.push('-filter:a', chain.join(','));
        }
      }

      args.push('-y', outputName);

      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile(outputName);
      const uint8 = new Uint8Array(data as Uint8Array);
      const mimeType = FORMAT_MIME[selectedFormat!] || (outputIsVideo ? 'video/mp4' : 'audio/mpeg');
      const blob = new Blob([uint8], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setConvertedUrl(url);
      setConvertedFilename(`converted.${ext}`);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      window.alert(`エラー\n\n変換に失敗しました: ${err?.message || '不明なエラー'}`);
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!convertedUrl) return;
    const a = document.createElement('a');
    a.href = convertedUrl;
    a.download = convertedFilename;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-5 py-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-8 tracking-tight">メディアコンバータ</h1>

      {/* File list */}
      {files.length > 0 && (
        <div className="w-full mb-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3">
              {f.type.startsWith('video/') && fileUrls[i] ? (
                <video src={fileUrls[i]} className="w-14 h-14 rounded-lg object-cover bg-secondary" muted />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-xs">♪</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-[15px] truncate">{f.name}</p>
                <p className="text-muted-foreground text-[13px]">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button onClick={() => removeFile(i)} className="text-muted-foreground text-xl leading-none active:text-foreground">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload source buttons - each directly triggers native picker */}
      <div className="w-full grid grid-cols-2 gap-3">
        <button
          onClick={() => videoFileRef.current?.click()}
          className="py-3.5 bg-primary text-primary-foreground rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-transform"
        >
          写真ライブラリ
        </button>
        <button
          onClick={() => videoCaptureRef.current?.click()}
          className="py-3.5 bg-primary text-primary-foreground rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-transform"
        >
          ビデオを録画
        </button>
        <button
          onClick={() => audioCaptureRef.current?.click()}
          className="py-3.5 bg-primary text-primary-foreground rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-transform"
        >
          オーディオを録音
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="py-3.5 bg-primary text-primary-foreground rounded-2xl text-[14px] font-semibold active:scale-[0.97] transition-transform"
        >
          ファイルから選択
        </button>
      </div>

      {/* Hidden file inputs */}
      <input ref={videoFileRef} type="file" accept="video/*,audio/*" hidden onChange={handleFileSelected} multiple />
      <input ref={videoCaptureRef} type="file" accept="video/*" capture="environment" hidden onChange={handleFileSelected} />
      <input ref={audioCaptureRef} type="file" accept="audio/*" capture="user" hidden onChange={handleFileSelected} />
      <input ref={fileRef} type="file" accept="video/*,audio/*" hidden onChange={handleFileSelected} multiple />

      {/* Format selector - native <select> */}
      {files.length > 0 && (
        <div className="w-full flex gap-3 mt-4">
          <select
            value={selectedFormat || ''}
            onChange={handleFormatChange}
            className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold text-center appearance-none cursor-pointer"
          >
            <option value="" disabled>形式を選択</option>
            {allFormats.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedFormat && (
            <button
              onClick={() => setShowDetailSettings(true)}
              className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold active:scale-[0.97] transition-transform"
            >
              詳細設定
            </button>
          )}
        </div>
      )}

      {/* Convert button */}
      {selectedFormat && !converting && !convertedUrl && (
        <button
          onClick={handleConvert}
          className="w-full mt-4 py-4 bg-primary text-primary-foreground rounded-2xl text-[17px] font-semibold active:scale-[0.97] transition-transform"
        >
          変換
        </button>
      )}

      {/* Progress */}
      {converting && (
        <div className="mt-8">
          <ProgressCircle progress={progress} />
        </div>
      )}

      {/* Download */}
      {convertedUrl && !converting && (
        <button
          onClick={handleDownload}
          className="w-full mt-4 py-4 bg-primary text-primary-foreground rounded-2xl text-[17px] font-semibold active:scale-[0.97] transition-transform"
        >
          ダウンロード
        </button>
      )}

      {/* Detail settings */}
      <DetailSettingsModal
        open={showDetailSettings}
        onClose={() => setShowDetailSettings(false)}
        settings={settings}
        onChange={setSettings}
        videoDuration={videoDuration}
        videoPreviewUrl={isVideo ? fileUrls[0] : undefined}
        isVideo={isVideo}
      />
    </div>
  );
};

export default Index;
