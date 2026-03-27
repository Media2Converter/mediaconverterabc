import React, { useState, useRef, useCallback } from 'react';
import { ProgressCircle } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS,
  FORMAT_EXT, FORMAT_MIME, CODEC_MAP, isVideoFormat,
  isCodecCompatible, FORMAT_AUDIO_CODEC_COMPAT, FORMAT_VIDEO_CODEC_COMPAT,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const Index: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formatSelectRef = useRef<HTMLSelectElement>(null);
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

  const confirmRemoveFile = (i: number) => {
    if (window.confirm(`「${files[i].name}」を削除しますか？`)) {
      URL.revokeObjectURL(fileUrls[i]);
      setFiles(prev => prev.filter((_, idx) => idx !== i));
      setFileUrls(prev => prev.filter((_, idx) => idx !== i));
    }
  };

  const isVideo = files.some(f => f.type.startsWith('video/'));

  const handleFormatSelect = (value: string) => {
    if (!value) return;
    setSelectedFormat(value);
    // Auto-fix codec compatibility
    if (!isCodecCompatible(value, settings.audioCodec, 'audio')) {
      const defaultCodec = FORMAT_AUDIO_CODEC_COMPAT[value]?.[0] || 'AAC';
      setSettings(prev => ({ ...prev, audioCodec: defaultCodec }));
    }
    if (isVideoFormat(value) && !isCodecCompatible(value, settings.videoCodec, 'video')) {
      const defaultCodec = FORMAT_VIDEO_CODEC_COMPAT[value]?.[0] || 'H.264';
      setSettings(prev => ({ ...prev, videoCodec: defaultCodec }));
    }
  };

  const handleConvert = async () => {
    if (!selectedFormat || files.length === 0) return;

    const warnings: string[] = [];
    if (!isCodecCompatible(selectedFormat, settings.audioCodec, 'audio')) {
      warnings.push(`オーディオコーデック「${settings.audioCodec}」は「${selectedFormat}」形式と互換性がありません。`);
    }
    if (isVideoFormat(selectedFormat) && !isCodecCompatible(selectedFormat, settings.videoCodec, 'video')) {
      warnings.push(`ビデオコーデック「${settings.videoCodec}」は「${selectedFormat}」形式と互換性がありません。`);
    }
    if (warnings.length > 0) {
      window.alert(warnings.join('\n'));
      return;
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
      const ext = FORMAT_EXT[selectedFormat] || 'mp4';
      const outputName = `output.${ext}`;

      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      const args: string[] = ['-i', inputName];

      if (settings.startTime > 0) args.push('-ss', String(settings.startTime));
      if (settings.endTime > 0) args.push('-to', String(settings.endTime));

      const outputIsVideo = isVideoFormat(selectedFormat);

      if (isVideo && outputIsVideo) {
        const vCodec = CODEC_MAP[settings.videoCodec] || 'libx264';
        args.push('-c:v', vCodec);
        args.push('-b:v', settings.videoBitrate.replace('KBPS', 'k'));
        args.push('-r', settings.framerate.replace('FPS', ''));
        args.push('-s', `${settings.resolutionW}x${settings.resolutionH}`);

        const videoFilters: string[] = [];
        if (settings.speed !== '1') {
          videoFilters.push(`setpts=PTS/${parseFloat(settings.speed)}`);
        }
        if (settings.scanType === 'インターレース方式') {
          args.push('-flags', '+ilme+ildct');
        }
        if (videoFilters.length > 0) {
          args.push('-filter:v', videoFilters.join(','));
        }
      } else if (!outputIsVideo) {
        args.push('-vn');
      }

      const aCodec = CODEC_MAP[settings.audioCodec] || 'aac';
      args.push('-c:a', aCodec);
      args.push('-b:a', settings.audioBitrate.replace('KBPS', 'k'));
      args.push('-ac', settings.channels === 'モノラル' ? '1' : '2');
      args.push('-ar', settings.frequency.replace('Hz', ''));

      const audioFilters: string[] = [];
      if (settings.volume !== 'none') {
        audioFilters.push(`volume=${settings.volume}dB`);
      }
      if (settings.speed !== '1') {
        const spd = parseFloat(settings.speed);
        if (spd >= 0.5 && spd <= 2) {
          audioFilters.push(`atempo=${spd}`);
        } else if (spd > 2) {
          let remaining = spd;
          while (remaining > 2) { audioFilters.push('atempo=2.0'); remaining /= 2; }
          audioFilters.push(`atempo=${remaining}`);
        } else {
          let remaining = spd;
          while (remaining < 0.5) { audioFilters.push('atempo=0.5'); remaining /= 0.5; }
          audioFilters.push(`atempo=${remaining}`);
        }
      }
      if (audioFilters.length > 0) {
        args.push('-filter:a', audioFilters.join(','));
      }

      args.push('-strict', 'experimental', '-y', outputName);

      await ffmpeg.exec(args);

      let data: any;
      try {
        data = await ffmpeg.readFile(outputName);
      } catch {
        const repairName = `repaired.${ext}`;
        await ffmpeg.exec(['-i', outputName, '-c', 'copy', '-movflags', '+faststart', '-y', repairName]);
        data = await ffmpeg.readFile(repairName);
      }

      const uint8 = new Uint8Array(data as Uint8Array);
      if (uint8.length === 0) throw new Error('変換結果が空です');

      const mimeType = FORMAT_MIME[selectedFormat] || (outputIsVideo ? 'video/mp4' : 'audio/mpeg');
      const blob = new Blob([uint8], { type: mimeType });
      setConvertedUrl(URL.createObjectURL(blob));
      setConvertedFilename(`converted.${ext}`);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      window.alert(`変換に失敗しました: ${err?.message || '不明なエラー'}`);
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

  const allFormats = [
    { group: '動画形式', formats: VIDEO_FORMATS },
    { group: '音声形式', formats: AUDIO_FORMATS },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-5 py-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-8 tracking-tight">メディアコンバータ</h1>

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
              <button onClick={() => confirmRemoveFile(i)} className="text-muted-foreground text-xl leading-none active:text-foreground">×</button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold active:scale-[0.97] transition-transform"
      >
        {files.length > 0 ? 'ファイルを追加' : 'ファイルを選択'}
      </button>

      <input ref={fileInputRef} type="file" accept="video/*,audio/*" hidden onChange={handleFileSelected} multiple />

      {files.length > 0 && (
        <div className="w-full flex gap-3 mt-4">
          <div className="flex-1 relative">
            <select
              ref={formatSelectRef}
              value={selectedFormat}
              onChange={e => handleFormatSelect(e.target.value)}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold text-center appearance-none cursor-pointer"
            >
              <option value="" disabled>形式を選択</option>
              {allFormats.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.formats.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
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

      {selectedFormat && !converting && !convertedUrl && (
        <button onClick={handleConvert}
          className="w-full mt-4 py-4 bg-primary text-primary-foreground rounded-2xl text-[17px] font-semibold active:scale-[0.97] transition-transform">
          変換
        </button>
      )}

      {converting && <div className="mt-8"><ProgressCircle progress={progress} /></div>}

      {convertedUrl && !converting && (
        <button onClick={handleDownload}
          className="w-full mt-4 py-4 bg-primary text-primary-foreground rounded-2xl text-[17px] font-semibold active:scale-[0.97] transition-transform">
          ダウンロード
        </button>
      )}

      <DetailSettingsModal
        open={showDetailSettings}
        onClose={() => setShowDetailSettings(false)}
        settings={settings}
        onChange={setSettings}
        videoDuration={videoDuration}
        videoPreviewUrl={isVideo ? fileUrls[0] : undefined}
        isVideo={isVideo}
        selectedFormat={selectedFormat || null}
      />
    </div>
  );
};

export default Index;
