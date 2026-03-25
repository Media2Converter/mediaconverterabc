import React, { useState, useRef, useCallback } from 'react';
import { ProgressCircle, IOSActionSheet, IOSConfirmDialog, IOSAlertDialog } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS, IPHONE_BAD_FORMATS,
  FORMAT_EXT, FORMAT_MIME, CODEC_MAP, isVideoFormat,
  isCodecCompatible,
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
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; index: number }>({ open: false, index: -1 });
  const [alertState, setAlertState] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' });

  const videoFileRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);
  const audioCaptureRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const showAlert = (title: string, message: string) => {
    setAlertState({ open: true, title, message });
  };

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
    setDeleteConfirm({ open: true, index: i });
  };

  const removeFile = () => {
    const i = deleteConfirm.index;
    if (i < 0 || !files[i]) return;
    URL.revokeObjectURL(fileUrls[i]);
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setFileUrls(prev => prev.filter((_, idx) => idx !== i));
  };

  const isVideo = files.some(f => f.type.startsWith('video/'));

  const handleFormatSelect = (value: string) => {
    setSelectedFormat(value);
    if (IPHONE_BAD_FORMATS.includes(value)) {
      showAlert('⚠️ 互換性の警告', `${value}形式はiPhoneで再生できない可能性があります。`);
    }
    // Auto-fix codec compatibility
    if (!isCodecCompatible(value, settings.audioCodec, 'audio')) {
      const compatMap: Record<string, string[]> = {
        'MP4': ['AAC'], 'M4V': ['AAC'], 'MOV': ['AAC'], 'AVI': ['MP3'],
        '3G2': ['AAC'], '3GP': ['AAC'], 'OPUS': ['OPUS'], 'OGG': ['OGG'],
        'WAV': ['PCM_S16LE'], 'AIFF': ['PCM_S16LE'], 'MP3': ['MP3'],
        'AAC': ['AAC'], 'AC3': ['AC3'], 'EAC3': ['EAC3'],
        'AMR_NB': ['AMR_NB'], 'AMR_WB': ['AMR_WB'], 'RAW': ['PCM_S16LE'],
      };
      const defaultCodec = compatMap[value]?.[0] || 'AAC';
      setSettings(prev => ({ ...prev, audioCodec: defaultCodec }));
    }
    if (isVideoFormat(value) && !isCodecCompatible(value, settings.videoCodec, 'video')) {
      setSettings(prev => ({ ...prev, videoCodec: 'H.264' }));
    }
  };

  const handleConvert = async () => {
    // Check codec/format compatibility warnings
    const warnings: string[] = [];
    if (!isCodecCompatible(selectedFormat!, settings.audioCodec, 'audio')) {
      warnings.push(`オーディオコーデック「${settings.audioCodec}」は「${selectedFormat}」形式と互換性がありません。`);
    }
    if (isVideoFormat(selectedFormat!) && !isCodecCompatible(selectedFormat!, settings.videoCodec, 'video')) {
      warnings.push(`ビデオコーデック「${settings.videoCodec}」は「${selectedFormat}」形式と互換性がありません。`);
    }
    if (warnings.length > 0) {
      showAlert('⚠️ 危ない！', warnings.join('\n'));
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

        const videoFilters: string[] = [];
        if (settings.speed !== '1') {
          const spd = parseFloat(settings.speed);
          videoFilters.push(`setpts=PTS/${spd}`);
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

      // Handle AMR-specific bitrate
      const aBr = settings.audioBitrate.replace('KBPS', 'k');
      args.push('-b:a', aBr);
      args.push('-ac', settings.channels === 'モノラル' ? '1' : '2');
      const freq = settings.frequency.replace('Hz', '');
      args.push('-ar', freq);

      // Volume
      if (settings.volume !== 'none') {
        args.push('-filter:a', `volume=${settings.volume}dB`);
      } else if (settings.speed !== '1' && parseFloat(settings.speed) !== 1) {
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

      // Strict mode off for compatibility
      args.push('-strict', 'experimental');
      args.push('-y', outputName);

      await ffmpeg.exec(args);

      // Try to read output, if fails attempt repair
      let data: any;
      try {
        data = await ffmpeg.readFile(outputName);
      } catch {
        // Attempt repair by re-muxing
        const repairName = `repaired.${ext}`;
        await ffmpeg.exec(['-i', outputName, '-c', 'copy', '-movflags', '+faststart', '-y', repairName]);
        data = await ffmpeg.readFile(repairName);
      }

      const uint8 = new Uint8Array(data as Uint8Array);
      if (uint8.length === 0) {
        throw new Error('変換結果が空です');
      }
      const mimeType = FORMAT_MIME[selectedFormat!] || (outputIsVideo ? 'video/mp4' : 'audio/mpeg');
      const blob = new Blob([uint8], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setConvertedUrl(url);
      setConvertedFilename(`converted.${ext}`);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      showAlert('エラー', `変換に失敗しました: ${err?.message || '不明なエラー'}`);
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

  const uploadMenuOptions = [
    { label: '写真ライブラリから選択', action: () => videoFileRef.current?.click() },
    { label: 'ビデオを録画', action: () => videoCaptureRef.current?.click() },
    { label: 'オーディオを録音', action: () => audioCaptureRef.current?.click() },
    { label: 'ファイルから選択', action: () => fileRef.current?.click() },
  ];

  const formatSections = [
    { title: '動画形式', options: VIDEO_FORMATS.map(f => ({
      label: f, value: f,
      warning: IPHONE_BAD_FORMATS.includes(f),
      dangerLabel: IPHONE_BAD_FORMATS.includes(f) ? '危ない！' : undefined,
    })) },
    { title: '音声形式', options: AUDIO_FORMATS.map(f => ({
      label: f, value: f,
      warning: IPHONE_BAD_FORMATS.includes(f),
      dangerLabel: IPHONE_BAD_FORMATS.includes(f) ? '危ない！' : undefined,
    })) },
  ];

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
              <button onClick={() => confirmRemoveFile(i)} className="text-muted-foreground text-xl leading-none active:text-foreground">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Single upload button */}
      <button
        onClick={() => setShowUploadMenu(true)}
        className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold active:scale-[0.97] transition-transform"
      >
        {files.length > 0 ? 'ファイルを追加' : 'ファイルを選択'}
      </button>

      {/* Hidden file inputs */}
      <input ref={videoFileRef} type="file" accept="video/*,audio/*" hidden onChange={handleFileSelected} multiple />
      <input ref={videoCaptureRef} type="file" accept="video/*" capture="environment" hidden onChange={handleFileSelected} />
      <input ref={audioCaptureRef} type="file" accept="audio/*" capture="user" hidden onChange={handleFileSelected} />
      <input ref={fileRef} type="file" accept="video/*,audio/*" hidden onChange={handleFileSelected} multiple />

      {/* Format selector */}
      {files.length > 0 && (
        <div className="w-full flex gap-3 mt-4">
          <button
            onClick={() => setShowFormatPicker(true)}
            className="flex-1 py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold active:scale-[0.97] transition-transform"
          >
            {selectedFormat ? selectedFormat : '形式'}
          </button>
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

      {/* Upload action sheet */}
      <IOSActionSheet
        open={showUploadMenu}
        onClose={() => setShowUploadMenu(false)}
        options={uploadMenuOptions}
      />

      {/* Format picker - using IOSPickerModal */}
      {showFormatPicker && (
        <FormatPickerOverlay
          sections={formatSections}
          selected={selectedFormat}
          onSelect={(v) => { handleFormatSelect(v); setShowFormatPicker(false); }}
          onClose={() => setShowFormatPicker(false)}
        />
      )}

      {/* Delete confirm */}
      <IOSConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, index: -1 })}
        onConfirm={removeFile}
        title="ファイルを削除"
        message={files[deleteConfirm.index] ? `「${files[deleteConfirm.index].name}」を削除しますか？` : ''}
        confirmLabel="削除"
        destructive
      />

      {/* Alert */}
      <IOSAlertDialog
        open={alertState.open}
        onClose={() => setAlertState({ open: false, title: '', message: '' })}
        title={alertState.title}
        message={alertState.message}
      />

      {/* Detail settings */}
      <DetailSettingsModal
        open={showDetailSettings}
        onClose={() => setShowDetailSettings(false)}
        settings={settings}
        onChange={setSettings}
        videoDuration={videoDuration}
        videoPreviewUrl={isVideo ? fileUrls[0] : undefined}
        isVideo={isVideo}
        selectedFormat={selectedFormat}
      />
    </div>
  );
};

// Format picker as context menu style overlay
const FormatPickerOverlay: React.FC<{
  sections: { title: string; options: { label: string; value: string; warning?: boolean; dangerLabel?: string }[] }[];
  selected: string | null;
  onSelect: (v: string) => void;
  onClose: () => void;
}> = ({ sections, selected, onSelect, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center ios-fade-in" onClick={onClose}>
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
    <div className="relative w-full max-w-sm mx-2 mb-2 sm:mb-0 ios-slide-up sm:ios-scale-in" onClick={e => e.stopPropagation()}>
      <div className="bg-popover/95 backdrop-blur-xl rounded-[14px] overflow-hidden max-h-[70vh] flex flex-col">
        <div className="overflow-y-auto overscroll-contain">
          {sections.map((sec, si) => (
            <div key={si}>
              {sec.title && (
                <div className="px-4 pt-3 pb-1.5 text-muted-foreground text-[13px] font-medium uppercase tracking-wide">
                  {sec.title}
                </div>
              )}
              {sec.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => onSelect(opt.value)}
                  className={`w-full px-4 py-[11px] text-left text-[20px] border-b border-border/30 last:border-b-0 active:bg-accent/60 transition-colors flex items-center justify-between ${
                    opt.warning ? 'text-ios-warning' : 'text-primary'
                  }`}
                >
                  <span>
                    {opt.label}
                    {opt.dangerLabel && <span className="text-destructive text-[14px] ml-2">⚠️ {opt.dangerLabel}</span>}
                  </span>
                  {selected === opt.value && <span className="text-primary text-lg">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <button onClick={onClose} className="w-full bg-popover/95 backdrop-blur-xl rounded-[14px] px-4 py-[11px] mt-2 text-primary text-center text-[20px] font-semibold active:bg-accent/60 transition-colors">
        キャンセル
      </button>
    </div>
  </div>
);

export default Index;
