import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ProgressCircle, IOSPickerModal } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS,
  FORMAT_EXT, isVideoFormat,
  getCompatibleAudioCodecs, getCompatibleVideoCodecs,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { convertWithFFmpeg, requestAbort, resetFFmpeg } from '@/services/ffmpegConverter';
import { AppSettingsModal } from '@/components/converter/AppSettingsModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File format popup
  const [showFileFormatPopup, setShowFileFormatPopup] = useState(false);
  const [fileFormatPickerIndex, setFileFormatPickerIndex] = useState<number | null>(null);

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

      const result = await convertWithFFmpeg(
        inputFile,
        selectedFormat,
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
        { label: 'Gemini3Flashを初期化', value: 'reset_gemini' },
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
      case 'reset_gemini':
        window.alert('Gemini3Flashの指示書・コマンドが初期化されました。');
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

  const allFormats = [
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
      {/* Header with settings and more menu */}
      <div className="w-full flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <button
            onClick={handleMoreMenuClick}
            className="text-foreground p-2 active:opacity-60"
            aria-label="その他のオプション"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">メディアコンバータ</h1>
        <button
          onClick={() => setShowAppSettings(true)}
          className="text-foreground p-2 active:opacity-60"
          aria-label="設定"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {files.length > 0 && (
        <div className="w-full mb-4 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-card rounded-xl p-3">
              {f.type.startsWith('video/') && fileUrls[i] ? (
                <video src={fileUrls[i]} className="w-14 h-14 rounded-lg object-cover bg-secondary" muted />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-[20px]">♪</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-foreground text-[20px] truncate">{f.name}</p>
                <p className="text-muted-foreground text-[20px]">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
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
          className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
          style={{ borderRadius: 0 }}
        >
          {files.length > 0 ? 'ファイルを追加' : 'ファイルを選択'}
        </button>

        {files.length > 0 && (
          <>
            <div className="relative">
              <select
                value={selectedFormat}
                onChange={e => handleFormatSelect(e.target.value)}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold appearance-none cursor-pointer border-b border-primary-foreground/20"
                style={{ borderRadius: 0, textAlign: 'center', textAlignLast: 'center' }}
              >
                <option value="" disabled>{isMultiFile ? '全ての形式' : '出力形式'}</option>
                {allFormats.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.formats.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Per-file format button (multi-file only) */}
            {isMultiFile && (
              <button
                onClick={() => setShowFileFormatPopup(true)}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0 }}
              >
                ファイル形式
              </button>
            )}

            {selectedFormat && (
              <button
                onClick={() => setShowDetailSettings(true)}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0 }}
              >
                詳細設定
              </button>
            )}
            {selectedFormat && !converting && !convertedUrl && (
              <button onClick={handleConvert}
                className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold active:opacity-80 transition-opacity"
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
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md px-6 py-8" role="dialog" aria-modal="true" aria-label="変換中">
          {/* Command preview above the percentage */}
          <div className="w-full max-w-md mb-4 max-h-[20vh] overflow-y-auto bg-card/80 rounded-lg p-3 border border-border">
            <p className="text-muted-foreground text-[13px] font-mono whitespace-pre-wrap break-all leading-snug">
              {ffmpegCommand || 'コマンドを準備中...'}
            </p>
          </div>
          {/* Big fullscreen percentage */}
          <div className="flex flex-col items-center justify-center flex-1 w-full">
            <svg width="min(70vw, 280px)" height="min(70vw, 280px)" viewBox="0 0 120 120" style={{ maxWidth: '70vw', maxHeight: '40vh' }}>
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
            <p className="text-foreground text-[20px] text-center whitespace-pre-line mt-6 max-w-md">{statusMessage}</p>
          </div>
          <button
            onClick={handleCancel}
            className="px-10 py-3 bg-destructive text-destructive-foreground text-[20px] font-semibold active:opacity-80 transition-opacity"
            style={{ borderRadius: 0 }}
          >
            キャンセル
          </button>
        </div>
      )}

      {convertedUrl && !converting && (
        <div className="w-full mt-4 flex flex-col">
          <button onClick={handleDownload}
            className="w-full py-3.5 bg-primary text-primary-foreground text-[20px] font-semibold active:opacity-80 transition-opacity"
            style={{ borderRadius: 0 }}>
            ダウンロード
          </button>
        </div>
      )}

      {/* More menu (•••) picker */}
      <IOSPickerModal
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        onSelect={handleMoreMenuSelect}
        sections={moreMenuSections}
        header={<span className="text-foreground text-[20px] font-semibold">その他のオプション</span>}
      />

      {/* File format popup (multi-file) */}
      {showFileFormatPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center ios-fade-in">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            role="button"
            aria-label="ポップアップウインドウを閉じる。ポップアップウインドウを閉じるにはアクティベートします。"
            tabIndex={0}
            onClick={() => { setShowFileFormatPopup(false); setFileFormatPickerIndex(null); }}
            onKeyDown={e => e.key === 'Enter' && setShowFileFormatPopup(false)}
          />
          <div aria-live="assertive" className="sr-only" role="status">{fileFormatVo}</div>
          <div
            className="relative ios-scale-in"
            style={{
              width: 'min(360px, 90vw)',
              maxHeight: '70vh',
              background: 'hsl(0, 70%, 45%)',
              borderRadius: '14px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 text-white text-[20px] font-semibold text-center" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.2)' }}>
              ファイル形式
            </div>
            <div className="overflow-y-auto flex-1">
              {files.map((f, i) => (
                <div key={i}>
                  <button
                    onClick={() => setFileFormatPickerIndex(fileFormatPickerIndex === i ? null : i)}
                    className="w-full px-4 py-3 text-left active:opacity-70 transition-opacity"
                    style={{ borderBottom: '0.5px solid rgba(255,255,255,0.15)' }}
                  >
                    <p className="text-white text-[20px] truncate">{f.name}</p>
                    <p className="text-white/70 text-[16px]">
                      形式: {perFileFormats[i] || selectedFormat || '未選択'} · {(f.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </button>
                  {fileFormatPickerIndex === i && (
                    <div className="bg-black/20">
                      {allFormats.map(g => (
                        <div key={g.group}>
                          <div className="px-4 py-1 text-white/50 text-[13px] font-medium">{g.group}</div>
                          {g.formats.map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => {
                                setPerFileFormats(prev => ({ ...prev, [i]: fmt }));
                                setFileFormatPickerIndex(null);
                              }}
                              className="w-full px-6 py-2.5 text-left text-white text-[20px] active:bg-white/10 flex items-center justify-between"
                            >
                              <span>{fmt}</span>
                              {(perFileFormats[i] || selectedFormat) === fmt && <span className="text-white text-[15px]">✓</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
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

      <AppSettingsModal
        open={showAppSettings}
        onClose={() => setShowAppSettings(false)}
      />
    </div>
  );
};

export default Index;
