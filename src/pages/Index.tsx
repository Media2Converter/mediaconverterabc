import React, { useState, useRef, useCallback, useEffect } from 'react';
import { IOSPickerModal } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS,
  FORMAT_EXT, isVideoFormat,
  getCompatibleAudioCodecs, getCompatibleVideoCodecs,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { convertWithFFmpeg, requestAbort, resetFFmpeg } from '@/services/ffmpegConverter';


/** Gather device info for analysis AI */
async function getDeviceInfo() {
  const info: Record<string, any> = {};
  try {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      info.battery = { level: Math.round(battery.level * 100), charging: battery.charging };
    }
    if ((performance as any).memory) {
      const mem = (performance as any).memory;
      info.memory = {
        usedJSHeapSize: Math.round(mem.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round(mem.totalJSHeapSize / 1024 / 1024),
        jsHeapSizeLimit: Math.round(mem.jsHeapSizeLimit / 1024 / 1024),
      };
    }
    info.cpuCores = navigator.hardwareConcurrency || 'unknown';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          info.gpu = {
            renderer: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
            vendor: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          };
        }
      }
    } catch {}
  } catch {}
  return info;
}

// Download counter for CDF naming
let cdfCounter = 1;

/** A button that triggers the native iOS select picker (context-menu picker). */
const NativeSelectButton: React.FC<{
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  children: React.ReactNode;
  value?: string;
  onSelect: (v: string) => void;
  groups: { label: string; options: { label: string; value: string; disabled?: boolean }[] }[];
  pickerHeader?: string;
  delay?: number;
}> = ({ className, style, ariaLabel, children, value, onSelect, groups, pickerHeader, delay = 0 }) => {
  const ref = useRef<HTMLSelectElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { ref.current?.focus(); ref.current?.click(); }, delay);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className={`relative ${className || ''}`} style={style}>
      <button
        type="button"
        onPointerDown={open}
        onPointerUp={() => { if (timer.current && delay === 0) { /* already opened */ } }}
        onPointerLeave={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }}
        className="w-full h-full"
        aria-label={ariaLabel}
        aria-haspopup="menu"
      >
        {children}
      </button>
      <select
        ref={ref}
        value={value || ''}
        onChange={e => onSelect(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: '20px' }}
        aria-label={ariaLabel}
      >
        {pickerHeader && <option disabled value="">{pickerHeader}</option>}
        {groups.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map(o => (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

/** Hidden native select that auto-opens when `open` becomes true (used for per-file format picker stage 2). */
const PerFileNativeFormatPicker: React.FC<{
  open: boolean;
  value: string;
  groups: { label: string; options: { label: string; value: string }[] }[];
  onSelect: (v: string) => void;
}> = ({ open, value, groups, onSelect }) => {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => { ref.current?.focus(); ref.current?.click(); }, 50);
      return () => clearTimeout(t);
    }
  }, [open]);
  if (!open) return null;
  return (
    <select
      ref={ref}
      value={value}
      onChange={e => onSelect(e.target.value)}
      onBlur={() => onSelect('')}
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-auto"
      style={{ width: 200, height: 40, zIndex: 100 }}
    >
      <option disabled value="">出力形式</option>
      {groups.map(g => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
};

/** Fullscreen preview for JSON/FFmpeg with ••• button → native picker → Web Share. */
const PreviewOverlay: React.FC<{
  kind: 'jsom' | 'ffmpeg';
  content: string;
  onClose: () => void;
}> = ({ kind, content, onClose }) => {
  const title = kind === 'jsom' ? 'JSON 指示書' : 'FFmpeg.wasm コマンド';


  const shareAsCode = async () => {
    const ext = kind === 'jsom' ? 'json' : 'sh';
    const mime = kind === 'jsom' ? 'application/json' : 'text/plain';
    const baseName = kind === 'jsom' ? 'コード' : 'コマンド';
    const filename = `${baseName}.${ext}`;
    try {
      const blob = new Blob([content], { type: mime });
      const file = new File([blob], filename, { type: mime });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: filename });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-background text-foreground flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <NativeSelectButton
          ariaLabel="その他のオプション"
          className="flex items-center justify-center text-foreground active:opacity-60"
          style={{ width: 40, height: 40 }}
          onSelect={v => { if (v === 'download') shareAsCode(); }}
          pickerHeader="オプション"
          groups={[{ label: 'オプション', options: [{ label: 'ダウンロード', value: 'download' }] }]}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </NativeSelectButton>
        <h2 className="text-[31px] font-semibold flex-1 text-center px-2 truncate">{title}</h2>
        <button
          onClick={onClose}
          className="text-foreground text-[31px] px-4 py-2 active:opacity-60"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <pre
          className="absolute inset-0 overflow-auto p-4 text-[22px] font-mono whitespace-pre-wrap break-all leading-snug select-text"
          aria-label={title}
        >
          {content}
        </pre>
      </div>
    </div>
  );
};


/** Main title with long-press → native picker → Web Share code as "コード" file. */
const TitleWithCodeDownload: React.FC<{ jsonContent: string; ffmpegContent: string }> = ({ jsonContent, ffmpegContent }) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareAsCode = async (kind: 'json' | 'ffmpeg') => {
    const ext = kind === 'json' ? 'json' : 'sh';
    const mime = kind === 'json' ? 'application/json' : 'text/plain';
    const filename = `コード.${ext}`;
    const content = kind === 'json' ? jsonContent : ffmpegContent;
    try {
      const blob = new Blob([content], { type: mime });
      const file = new File([blob], filename, { type: mime });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: filename });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* cancelled */ }
  };

  const openPicker = () => {
    setTimeout(() => { selectRef.current?.focus(); selectRef.current?.click(); }, 16);
  };
  const handleStart = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => { openPicker(); longPressTimer.current = null; }, 1000);
  };
  const handleEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return (
    <div className="relative">
      <h1
        className="font-bold tracking-tight select-none leading-[1.05]"
        style={{ fontSize: '35px' }}
        onTouchStart={handleStart}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        onMouseDown={handleStart}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="メディアコンバータ。長押しでコードをダウンロード"
      >
        メディア<br />コンバータ
      </h1>
      <select
        ref={selectRef}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'json' || v === 'ffmpeg') shareAsCode(v);
          e.target.value = '';
        }}
        className="absolute opacity-0 pointer-events-none"
        style={{ left: 0, top: 0, width: 1, height: 1 }}
        aria-label="コードをダウンロード"
      >
        <option value="" disabled>コードをダウンロード</option>
        <option value="json">JSON</option>
        <option value="ffmpeg">FFmpeg.wasm</option>
      </select>
    </div>
  );
};

const Index: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  // Per-file format overrides (for multi-file)
  const [perFileFormats, setPerFileFormats] = useState<Record<number, string>>({});
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [ffmpegCommand, setFfmpegCommand] = useState('');
  const [batteryWarning, setBatteryWarning] = useState(false);
  
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preview fullscreen overlays
  const [previewView, setPreviewView] = useState<null | 'jsom' | 'ffmpeg'>(null);

  // Build a JSOM (JSON) instruction document from current state
  const jsomInstructions = JSON.stringify({
    task: 'media-conversion',
    inputs: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
    outputFormat: selectedFormat,
    perFileFormats,
    settings,
    videoDuration,
    isVideo: files.some(f => f.type.startsWith('video/')),
  }, null, 2);

  // File format popup
  const [showFileFormatPopup, setShowFileFormatPopup] = useState(false);
  const [fileFormatPickerIndex, setFileFormatPickerIndex] = useState<number | null>(null);
  const [showMainFormatPicker, setShowMainFormatPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Battery monitoring
  useEffect(() => {
    const checkBattery = async () => {
      if ('getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        const update = () => {
          if (battery.level <= 0.2 && !battery.charging) {
            setBatteryWarning(true);
          } else {
            setBatteryWarning(false);
          }
        };
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
        update();
      }
    };
    checkBattery();
  }, []);

  // Clear selected format when file composition makes it incompatible
  useEffect(() => {
    if (files.length === 0) return;
    const hasAudio = files.some(f => f.type.startsWith('audio/'));
    const hasVideo = files.some(f => f.type.startsWith('video/'));
    if (hasAudio && hasVideo && selectedFormat) {
      setSelectedFormat('');
    }
    if (!hasVideo && hasAudio && selectedFormat && isVideoFormat(selectedFormat)) {
      setSelectedFormat('');
    }
  }, [files, selectedFormat]);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (newFiles.length === 0) return;
      setFiles(prev => [...prev, ...newFiles]);
      newFiles.forEach(f => {
        const url = URL.createObjectURL(f);
        setFileUrls(prev => [...prev, url]);
        if (f.type.startsWith('video/')) {
          const vid = document.createElement('video');
          vid.src = url;
          vid.onloadedmetadata = () => setVideoDuration(vid.duration);
        } else {
          const aud = document.createElement('audio');
          aud.src = url;
          aud.onloadedmetadata = () => setVideoDuration(aud.duration);
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
      setPerFileFormats(prev => {
        const next = { ...prev };
        delete next[i];
        return next;
      });
    }
  };

  const isVideo = files.some(f => f.type.startsWith('video/'));
  const hasAudioFile = files.some(f => f.type.startsWith('audio/'));
  const isMixedMedia = isVideo && hasAudioFile;
  const isMultiFile = files.length >= 2;

  const handleFormatSelect = (value: string) => {
    if (!value) return;
    setSelectedFormat(value);
    const compatAudio = getCompatibleAudioCodecs(value);
    if (settings.audioCodec !== 'copy' && settings.audioCodec !== 'none' && !compatAudio.includes(settings.audioCodec)) {
      setSettings(prev => ({ ...prev, audioCodec: compatAudio[0] || 'AAC' }));
    }
    if (isVideoFormat(value)) {
      const compatVideo = getCompatibleVideoCodecs(value);
      if (settings.videoCodec !== 'copy' && !compatVideo.includes(settings.videoCodec)) {
        setSettings(prev => ({ ...prev, videoCodec: compatVideo[0] || 'H.264' }));
      }
    }
  };

  const analyzeError = async (errorMessage: string, logs: string[]) => {
    try {
      const deviceInfo = await getDeviceInfo();
      const lastLogs = logs.slice(-5).join('\n');
      const batteryInfo = deviceInfo.battery ? `バッテリー: ${deviceInfo.battery.level}%${deviceInfo.battery.charging ? ' (充電中)' : ''}` : '';
      const memInfo = deviceInfo.memory ? `メモリ: ${deviceInfo.memory.usedJSHeapSize}MB / ${deviceInfo.memory.jsHeapSizeLimit}MB` : '';
      const cpuInfo = `CPU コア数: ${deviceInfo.cpuCores}`;
      const gpuInfo = deviceInfo.gpu ? `GPU: ${deviceInfo.gpu.renderer}` : '';

      return {
        status: 'エラー発生',
        cause: errorMessage,
        deviceStatus: [batteryInfo, memInfo, cpuInfo, gpuInfo].filter(Boolean).join('\n'),
        solutions: [
          'ファイルが破損していないか確認してください',
          '別の出力形式を選択してください',
          'コーデック設定を変更してください',
          'ブラウザを再読み込みしてください',
        ],
        ffmpegLogs: lastLogs,
      };
    } catch {
      return null;
    }
  };

  const handleCancel = () => {
    requestAbort();
    setConverting(false);
    setProgress(0);
    setStatusMessage('キャンセルしました');
  };

  const handleConvert = async () => {
    if (!selectedFormat || files.length === 0) return;

    if (batteryWarning) {
      window.alert('🔋 充電警告\n\nバッテリーが20%以下です。\n変換処理は電力を大量に消費します。\n充電器に接続してから変換することをお勧めします。');
    }

    setConverting(true);
    setProgress(0);
    setConvertedUrl(null);
    setStatusMessage('FFmpeg WASM エンジンを初期化中...');

    const ffmpegLogs: string[] = [];

    try {
      const inputFile = files[0];
      const formatForFile = perFileFormats[0] || selectedFormat;

      const result = await convertWithFFmpeg(
        inputFile,
        formatForFile,
        settings,
        isVideo,
        (pct) => setProgress(pct),
        (msg) => ffmpegLogs.push(msg),
        (status) => setStatusMessage(status),
        (cmd) => setFfmpegCommand(cmd),
      );

      setConvertedUrl(result.url);
      // CDF naming
      const cdfNum = String(cdfCounter).padStart(4, '0');
      const ext = result.filename.split('.').pop() || 'mp4';
      setConvertedFilename(`CDF_${cdfNum}.${ext}`);
      cdfCounter++;

      setProgress(100);
      setStatusMessage('変換完了！ダウンロードできます');
    } catch (err: any) {
      console.error('FFmpeg conversion error:', err);
      const errorMsg = err?.message || '不明なエラー';

      if (errorMsg.includes('キャンセル')) {
        setStatusMessage('キャンセルしました');
        setConverting(false);
        return;
      }

      setStatusMessage('エラーを解析中...');
      const analysis = await analyzeError(errorMsg, ffmpegLogs);

      if (analysis) {
        const solutions = (analysis.solutions || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
        const deviceStatus = analysis.deviceStatus ? `\n\nデバイス状態：\n${analysis.deviceStatus}` : '';
        const ffLogs = analysis.ffmpegLogs ? `\n\nFFmpegログ:\n${analysis.ffmpegLogs}` : '';
        window.alert(`⚠️ 変換エラー\n\n現在の状態：${analysis.status}\n\n原因：${analysis.cause}${deviceStatus}${ffLogs}\n\n解決方法：\n${solutions}`);
      } else {
        const lastLogs = ffmpegLogs.slice(-3).join('\n');
        window.alert(`⚠️ 変換エラー\n\n${errorMsg}${lastLogs ? `\n\nFFmpegログ:\n${lastLogs}` : ''}\n\n解決方法：\n1. ファイルが破損していないか確認\n2. 別の出力形式を選択\n3. コーデック設定を変更`);
      }
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = async () => {
    if (!convertedUrl) return;
    // Try Web Share API for native share sheet
    try {
      const res = await fetch(convertedUrl);
      const blob = await res.blob();
      const file = new File([blob], convertedFilename, { type: blob.type });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: convertedFilename });
        return;
      }
    } catch (err) {
      // fall through to download
    }
    const a = document.createElement('a');
    a.href = convertedUrl;
    a.download = convertedFilename;
    a.click();
  };

  // More menu (•••) options
  const moreMenuSections = [
    {
      options: [
        { label: '再読み込み', value: 'reload' },
        { label: '再試行', value: 'retry' },
        { label: '初期化', value: 'reset', colorClass: 'text-destructive' },
        { label: 'FFmpegを初期化', value: 'reset_ffmpeg' },
      ],
    },
  ];

  const handleMoreMenuSelect = (value: string) => {
    switch (value) {
      case 'reload':
        window.location.reload();
        break;
      case 'retry':
        setConvertedUrl(null);
        setConvertedFilename('');
        setProgress(0);
        setStatusMessage('');
        setTimeout(() => handleConvert(), 100);
        break;
      case 'reset':
        if (window.confirm('⚠️ 初期化\n\nサイトのデザインや言語を初期化しますか？この操作は元に戻せません。')) {
          document.documentElement.style.removeProperty('--app-font-size');
          document.documentElement.style.removeProperty('--app-bg-color');
          document.documentElement.style.removeProperty('--app-btn-color');
          document.documentElement.style.removeProperty('--app-text-color');
          window.location.reload();
        }
        break;
      case 'reset_ffmpeg':
        resetFFmpeg();
        window.alert('FFmpegが初期化されました。');
        break;
    }
  };

  const handleMoreMenuClick = () => {
    if (moreMenuTimer.current) clearTimeout(moreMenuTimer.current);
    moreMenuTimer.current = setTimeout(() => setShowMoreMenu(true), 1000);
  };

  useEffect(() => {
    return () => { if (moreMenuTimer.current) clearTimeout(moreMenuTimer.current); };
  }, []);

  const allFormats = (() => {
    if (isMixedMedia) return [];
    if (!isVideo && hasAudioFile) return [{ group: '音声形式', formats: AUDIO_FORMATS }];
    return [
      { group: '動画形式', formats: VIDEO_FORMATS },
      { group: '音声形式', formats: AUDIO_FORMATS },
    ];
  })();

  // For the per-file format picker we always allow every format (needed for mixed media).
  const perFileAllFormats = [
    { group: '動画形式', formats: VIDEO_FORMATS },
    { group: '音声形式', formats: AUDIO_FORMATS },
  ];


  // VoiceOver announcement for file format popup
  const [fileFormatVo, setFileFormatVo] = useState('');
  useEffect(() => {
    if (showFileFormatPopup) {
      setFileFormatVo('');
      setTimeout(() => setFileFormatVo('ファイル形式'), 50);
    } else {
      setFileFormatVo('');
    }
  }, [showFileFormatPopup]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-5 py-8 max-w-lg mx-auto">
      {/* Edge-pinned more options button (always at viewport corner) */}
      <div className="fixed top-2 right-2 z-[60]">
        <NativeSelectButton
          ariaLabel="その他のオプション"
          className="text-foreground p-2 active:opacity-60 bg-background/80 backdrop-blur rounded-full"
          style={{ width: 44, height: 44 }}
          delay={1000}
          onSelect={handleMoreMenuSelect}
          pickerHeader="メディアコンバータ"
          groups={[{
            label: 'メディアコンバータ',
            options: moreMenuSections[0].options.map(o => ({
              label: o.label,
              value: o.value,
              disabled: o.value === 'retry' && (converting || !selectedFormat || files.length === 0),
            })),
          }]}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </NativeSelectButton>
      </div>

      {/* Header: title (long-press → code download) */}
      <div className="w-full flex items-center justify-start mb-8">
        <TitleWithCodeDownload
          jsonContent={jsomInstructions}
          ffmpegContent={ffmpegCommand || 'コマンドはまだ生成されていません。'}
        />
      </div>

      {files.length > 0 && (
        <div className="w-full mb-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3">
              {f.type.startsWith('video/') && fileUrls[i] ? (
                <video src={fileUrls[i]} className="w-14 h-14 rounded-lg object-cover bg-secondary" muted />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-[31px]">♪</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-[31px] truncate">{f.name}</p>
                <p className="text-muted-foreground text-[29px]">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button onClick={() => confirmRemoveFile(i)} className="text-muted-foreground text-xl leading-none active:text-foreground">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Buttons: no rounded corners, touching each other */}
      <div className="w-full flex flex-col">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
          style={{ borderRadius: 0 }}
        >
          {files.length > 0 ? 'ファイルを追加' : 'ファイルを選択'}
        </button>

        {files.length > 0 && (
          <>
            {allFormats.length > 0 && (
              <NativeSelectButton
                className="w-full active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', minHeight: 52 }}
                ariaLabel="出力形式"
                value={selectedFormat}
                onSelect={handleFormatSelect}
                pickerHeader="出力形式"
                groups={allFormats.map(g => ({ label: g.group, options: g.formats.map(f => ({ label: f, value: f })) }))}
              >
                <span className="block w-full py-3.5 text-[31px] font-semibold">
                  {selectedFormat ? (isMultiFile ? `全ての形式: ${selectedFormat}` : `出力形式: ${selectedFormat}`) : (isMultiFile ? '全ての形式' : '出力形式')}
                </span>
              </NativeSelectButton>
            )}

            {/* Per-file format button: only for multi-file or mixed audio+video */}
            {(isMultiFile || isMixedMedia) && (

              <button
                onClick={() => setShowFileFormatPopup(true)}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0 }}
              >
                ファイル形式
              </button>
            )}

            {selectedFormat && (
              <button
                onClick={() => setShowDetailSettings(true)}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0 }}
              >
                詳細設定
              </button>
            )}
            {selectedFormat && !converting && !convertedUrl && (
              <button onClick={handleConvert}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity"
                style={{ borderRadius: 0 }}>
                変換
              </button>
            )}
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.wmv,.flv,.webm,.m4v,.3gp,.3g2,.mp3,.wav,.aac,.ogg,.flac,.m4a,.wma,.aiff,.opus,.amr"
        hidden
        onChange={handleFileSelected}
        multiple
      />

      {converting && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="変換中">
          <div
            className="relative flex flex-col items-center px-6 py-6"
            style={{
              width: 'min(92vw, 480px)',
              maxHeight: '90vh',
              background: '#1C1C1E',
              borderRadius: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            <svg width="200" height="200" viewBox="0 0 120 120" style={{ maxWidth: '60vw' }}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke="#ffffff" strokeWidth="6"
                strokeDasharray={2 * Math.PI * 50}
                strokeDashoffset={2 * Math.PI * 50 - (progress / 100) * 2 * Math.PI * 50}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                className="transition-all duration-300"
              />
              <text x="60" y="60" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="20" fontWeight="700">
                {Math.round(progress)}%
              </text>
            </svg>
            <p className="text-foreground text-[31px] text-center whitespace-pre-line mt-4 max-w-md">{statusMessage}</p>
            <div className="w-full mt-4 flex flex-col gap-2">
              <button
                onClick={() => setPreviewView('ffmpeg')}
                aria-label="プレビューを表示"
                className="active:opacity-80 transition-opacity w-full text-[31px] font-semibold"
                style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', borderRadius: 0, height: 56 }}
              >
                プレビューを表示
              </button>
              <button
                onClick={handleCancel}
                className="w-full bg-destructive text-destructive-foreground text-[31px] font-semibold active:opacity-80 transition-opacity"
                style={{ borderRadius: 0, height: 56 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen preview overlays */}
      {previewView && (
        <PreviewOverlay
          kind={previewView}
          content={previewView === 'jsom' ? jsomInstructions : (ffmpegCommand || 'コマンドはまだ生成されていません。')}
          onClose={() => setPreviewView(null)}
        />
      )}

      {convertedUrl && !converting && (
        <div className="w-full mt-4 flex flex-col">
          <button onClick={handleDownload}
            className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity"
            style={{ borderRadius: 0 }}>
            ダウンロード
          </button>
        </div>
      )}

      {/* Per-file format picker (multi-file): list of files → tap one → native format picker */}
      <IOSPickerModal
        open={showFileFormatPopup && fileFormatPickerIndex === null}
        onClose={() => { setShowFileFormatPopup(false); setFileFormatPickerIndex(null); }}
        onSelect={(v) => {
          const idx = parseInt(v, 10);
          if (!isNaN(idx)) setFileFormatPickerIndex(idx);
        }}
        sections={[{
          title: 'ファイル形式',
          options: files.map((f, i) => ({
            label: `${f.name} (${perFileFormats[i] || selectedFormat || '未選択'})`,
            value: String(i),
          })),
        }]}
      />

      {/* Per-file format selector — uses native iOS picker */}
      <PerFileNativeFormatPicker
        open={showFileFormatPopup && fileFormatPickerIndex !== null}
        value={fileFormatPickerIndex !== null ? (perFileFormats[fileFormatPickerIndex] || selectedFormat || '') : ''}
        groups={perFileAllFormats.map(g => ({ label: g.group, options: g.formats.map(f => ({ label: f, value: f })) }))}

        onSelect={(fmt) => {
          if (fileFormatPickerIndex !== null && fmt) {
            setPerFileFormats(prev => ({ ...prev, [fileFormatPickerIndex!]: fmt }));
          }
          setFileFormatPickerIndex(null);
        }}
      />

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
