import React, { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS,
  FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  getCompatibleAudioCodecs, getCompatibleVideoCodecs,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { convertOnServer, requestAbort, initializeServer } from '@/services/serverConverter';
import { buildInstructionScript } from '@/services/instructionScript';
import detailTapSound from '@/assets/shinki-rokuon-4.m4a.asset.json';

/** 詳細設定ボタンを押した瞬間に必ず音声を再生する */
const playDetailTapSound = () => {
  try {
    const el = new Audio(detailTapSound.url);
    el.preload = 'auto';
    el.volume = 1;
    el.play().catch(() => {
      const retry = new Audio(detailTapSound.url);
      retry.play().catch(() => {});
    });
  } catch {}
};


/** Plain-Japanese sentence describing what failed */
const describeFailure = (errorMsg: string, errorLines: string[]): string => {
  const all = `${errorMsg}\n${errorLines.join('\n')}`;
  if (/out of memory|memory access out of bounds|abort/i.test(all)) return 'ファイルの処理に必要なメモリが足りず、変換処理を完了できませんでした。';
  if (/unknown encoder|unknown decoder|not supported|Unsupported codec/i.test(all)) return '選択したコーデックまたは形式がこの変換エンジンで扱えず、出力ファイルを作成できませんでした。';
  if (/Invalid data|moov atom not found|could not find codec parameters/i.test(all)) return '入力ファイルのデータが壊れているか一部が欠けているため、読み込みに失敗しました。';
  if (/No such file/i.test(all)) return '出力ファイルが作成されず、書き出しに失敗しました。';
  if (/Invalid argument|Error while filtering|option not found/i.test(all)) return '設定した値の組み合わせがこの形式では使えず、変換の準備に失敗しました。';
  return '変換処理の途中で問題が発生し、出力ファイルを作成できませんでした。';
};

/** Rough Japanese translation of the raw FFmpeg error text */
const translateFfmpegError = (raw: string): string => {
  const map: [RegExp, string][] = [
    [/out of memory|memory access out of bounds/i, 'メモリが不足しています。'],
    [/unknown encoder/i, '指定されたエンコーダーが見つかりません。'],
    [/unknown decoder/i, '指定されたデコーダーが見つかりません。'],
    [/Invalid data found when processing input/i, '入力データが不正です。'],
    [/moov atom not found/i, '動画のヘッダー情報（moov）が見つかりません。'],
    [/could not find codec parameters/i, 'コーデック情報を判別できません。'],
    [/No such file or directory/i, 'ファイルが見つかりません。'],
    [/Invalid argument/i, '指定された引数が不正です。'],
    [/not supported|Unsupported/i, 'この形式または設定はサポートされていません。'],
    [/Conversion failed/i, '変換に失敗しました。'],
    [/Error while filtering/i, 'フィルター処理中にエラーが発生しました。'],
    [/Permission denied/i, 'アクセスが拒否されました。'],
  ];
  const hits = map.filter(([re]) => re.test(raw)).map(([, ja]) => ja);
  return hits.length > 0 ? hits.join('\n') : 'エラー内容を日本語に変換できませんでした。原文を確認してください。';
};

/** Explain the likely cause of the error in Japanese */
const inferErrorCause = (raw: string): string => {
  const map: [RegExp, string][] = [
    [/out of memory|memory access out of bounds/i, '端末の使用可能メモリを超えました。ファイルサイズ・解像度・ビットレートが大きすぎることが原因です。'],
    [/unknown encoder|unknown decoder/i, '選択したコーデックがこの変換エンジンに含まれていないことが原因です。'],
    [/Invalid data found|moov atom not found|could not find codec parameters/i, '入力ファイルのデータが壊れている、または途中で切れていることが原因です。'],
    [/No such file or directory/i, '入力ファイルの読み込みに失敗したことが原因です。'],
    [/not supported|Unsupported|Invalid argument/i, '出力形式とコーデック・解像度・サンプルレートなどの設定の組み合わせが対応していないことが原因です。'],
    [/Error while filtering|filter/i, '縦横比・速度・音量などのフィルター設定が入力と合っていないことが原因です。'],
    [/bitrate|sample rate|channel/i, 'ビットレート・サンプルレート・チャンネル数の指定が対応範囲外であることが原因です。'],
  ];
  const hits = map.filter(([re]) => re.test(raw)).map(([, ja]) => ja);
  return hits.length > 0 ? hits.join('\n') : '入力ファイルと選択した出力設定の組み合わせが原因と考えられます。設定を変えて再試行してください。';
};




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
      const t = setTimeout(() => { ref.current?.focus(); ref.current?.click(); }, 300);
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



const Index: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  // Per-file format overrides (for multi-file)
  const [perFileFormats, setPerFileFormats] = useState<Record<number, string>>({});
  const [showDetailSettings, setShowDetailSettings] = useState(false);
  const [detailContext, setDetailContext] = useState<'all' | 'video' | 'audio' | `file:${number}`>('all');
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFilename, setConvertedFilename] = useState('');
  const [convertedResults, setConvertedResults] = useState<{ url: string; filename: string }[]>([]);
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

  // Multi-file format flow: filename picker → format picker (repeat until all assigned)
  const [pendingFileSelect, setPendingFileSelect] = useState(false);
  const [pendingFormatForIdx, setPendingFormatForIdx] = useState<number | null>(null);
  const fileSelectRef = useRef<HTMLSelectElement>(null);
  const formatSelectRef = useRef<HTMLSelectElement>(null);




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

  const handleInitializeServer = async () => {
    setConverting(true);
    setProgress(0);
    setStatusMessage('FFmpeg.WASM APIサーバを初期化中...');
    try {
      await initializeServer(setStatusMessage, setProgress);
      setProgress(100);
      setStatusMessage('FFmpeg.WASM APIサーバの初期化が完了しました');
      setTimeout(() => setConverting(false), 800);
    } catch (err: any) {
      setConverting(false);
      setProgress(0);
      setStatusMessage('');
      window.alert(['エラーが発生しました。', '', err?.message || '不明なエラー'].join('\n'));
    }
  };

  const handleConvert = async () => {
    const everyFileHasFormat = files.length > 0 && files.every((_, i) => perFileFormats[i]);
    if (files.length === 0) return;
    if (!selectedFormat && !everyFileHasFormat) return;

    if (batteryWarning) {
      window.alert('🔋 充電警告\n\nバッテリーが20%以下です。\n変換処理は電力を大量に消費します。\n充電器に接続してから変換することをお勧めします。');
    }

    setConverting(true);
    setProgress(0);
    setConvertedUrl(null);
    setConvertedResults([]);
    setStatusMessage('サーバーで変換中...');

    const results: { url: string; filename: string }[] = [];
    let mismatchedFormat = '';

    try {
      for (let i = 0; i < files.length; i++) {
        const inputFile = files[i];
        const formatForFile = perFileFormats[i] || selectedFormat;
        const ext = FORMAT_EXT[formatForFile] || 'mp4';
        const mime = FORMAT_MIME[formatForFile] || '';

        if (files.length > 1) {
          setStatusMessage(`(${i + 1}/${files.length}) ${inputFile.name} をサーバーで変換中...`);
        }
        setProgress((i / files.length) * 100);

        const instructions = buildInstructionScript(inputFile, formatForFile, settings);
        setFfmpegCommand(instructions.js);
        const result = await convertOnServer(inputFile, formatForFile, ext, mime, (status) => {
          if (files.length === 1) setStatusMessage(status);
        }, instructions, (pct) => {
          setProgress(((i + pct / 100) / files.length) * 100);
        });


        if (result.formatMismatch) mismatchedFormat = result.actualExt;
        results.push({ url: result.url, filename: result.filename });
      }


      setConvertedResults(results);
      setConvertedUrl(results[0].url);
      setConvertedFilename(results[0].filename);

      setProgress(100);
      setStatusMessage('変換完了！ダウンロードできます');

      if (mismatchedFormat) {
        window.alert(
          [
            '選択した形式で変換されませんでした。',
            '',
            `変換サーバーは ${mismatchedFormat.toUpperCase()} 形式のファイルを返しました。`,
            'サーバー側が出力形式の指定（format）に対応していないため、',
            'サーバーの実装で受け取った format を FFmpeg の出力に反映させる必要があります。',
          ].join('\n')
        );
      }
    } catch (err: any) {
      console.error('Server conversion error:', err);
      const errorMsg = err?.message || '不明なエラー';

      if (errorMsg.includes('キャンセル')) {
        setStatusMessage('キャンセルしました');
        setConverting(false);
        return;
      }

      setStatusMessage('エラーが発生しました');
      window.alert(
        [
          'エラーが発生しました。',
          '',
          'エラー内容',
          describeFailure(errorMsg, []),
          '',
          'エラーコード',
          errorMsg,
          '',
          '原因',
          inferErrorCause(errorMsg),
        ].join('\n')
      );



    } finally {
      setConverting(false);
    }
  };

  const handleDownload = async () => {
    const list = convertedResults.length > 0 ? convertedResults : (convertedUrl ? [{ url: convertedUrl, filename: convertedFilename }] : []);
    if (list.length === 0) return;

    // Multiple files → zip as メディアコンバータ.zip
    if (list.length >= 2) {
      try {
        setStatusMessage('ZIPファイルを作成中...');
        const zip = new JSZip();
        const folder = zip.folder('メディアコンバータ')!;
        for (const item of list) {
          const res = await fetch(item.url);
          const blob = await res.blob();
          folder.file(item.filename, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipName = 'メディアコンバータ.zip';
        const file = new File([zipBlob], zipName, { type: 'application/zip' });
        const navAny = navigator as any;
        if (navAny.canShare && navAny.canShare({ files: [file] })) {
          await navAny.share({ files: [file], title: zipName });
          setStatusMessage('変換完了！ダウンロードできます');
          return;
        }
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url; a.download = zipName; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatusMessage('変換完了！ダウンロードできます');
        return;
      } catch (err) {
        console.error('ZIP creation failed:', err);
      }
    }

    // Single file
    const only = list[0];
    try {
      const res = await fetch(only.url);
      const blob = await res.blob();
      const file = new File([blob], only.filename, { type: blob.type });
      const navAny = navigator as any;
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navAny.share({ files: [file], title: only.filename });
        return;
      }
    } catch (err) {
      // fall through
    }
    const a = document.createElement('a');
    a.href = only.url;
    a.download = only.filename;
    a.click();
  };



  // More menu (•••) options
  const moreMenuSections = [
    {
      options: [
        { label: '再読み込み', value: 'reload' },
        { label: '再試行', value: 'retry' },
        { label: 'FFmpeg.WASM APIサーバを初期化', value: 'init-server' },
        
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
      case 'init-server':
        handleInitializeServer();
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

  // Every uploaded file has an output format assigned (multi-file flow)
  const allFormatsAssigned = files.length > 0 && files.every((_, i) => !!perFileFormats[i]);
  // Detail settings / convert become available only once formats are chosen
  const formatsReady = files.length === 1 ? !!selectedFormat : allFormatsAssigned;




  // Multi-file: open a native picker showing filenames (with current format annotation)
  const openFilenamePicker = () => {
    setPendingFileSelect(true);
    setTimeout(() => { fileSelectRef.current?.focus(); fileSelectRef.current?.click(); }, 50);
  };

  const onFilenamePicked = (v: string) => {
    setPendingFileSelect(false);
    const idx = parseInt(v, 10);
    if (isNaN(idx)) return;
    setPendingFormatForIdx(idx);
    setTimeout(() => { formatSelectRef.current?.focus(); formatSelectRef.current?.click(); }, 100);
  };

  const onFormatPicked = (fmt: string) => {
    const idx = pendingFormatForIdx;
    setPendingFormatForIdx(null);
    if (!fmt || idx === null) return;
    setPerFileFormats(prev => {
      const next = { ...prev, [idx]: fmt };
      // Update global selectedFormat so 変換 button appears
      handleFormatSelect(fmt);
      // If any file still lacks a format, re-open the filename picker
      const allAssigned = files.every((_, i) => next[i]);
      if (!allAssigned) {
        setTimeout(() => openFilenamePicker(), 250);
      }
      return next;
    });
  };



  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-5 py-8 max-w-lg mx-auto">
      {/* Edge-pinned more options button (always at viewport corner) */}
      <div className="fixed top-2 right-2 z-[40]">
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
        <h1 className="font-bold tracking-tight leading-[1.1]" style={{ fontSize: '35px' }}>
          メディアコンバータ
        </h1>
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

        {files.length > 0 && (() => {

          // Determine picker groups for the single-file case
          const singleFile = files[0];
          const singleIsAudio = files.length === 1 && singleFile?.type.startsWith('audio/');
          const singleGroups = singleIsAudio
            ? [{ label: '音声形式', options: AUDIO_FORMATS.map(f => ({ label: f, value: f })) }]
            : [
                { label: '動画形式', options: VIDEO_FORMATS.map(f => ({ label: f, value: f })) },
                { label: '音声形式', options: AUDIO_FORMATS.map(f => ({ label: f, value: f })) },
              ];

          if (files.length === 1) {
            return (
              <NativeSelectButton
                className="w-full active:opacity-80 transition-opacity border-b border-primary-foreground/20"
                style={{ borderRadius: 0, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', minHeight: 52 }}
                ariaLabel="形式"
                value={selectedFormat}
                onSelect={(v) => {
                  if (!v) return;
                  handleFormatSelect(v);
                  setPerFileFormats({ 0: v });
                  setDetailContext('all');
                }}
                pickerHeader="形式"
                groups={singleGroups}
              >
                <span className="block w-full py-3.5 text-[31px] font-semibold">
                  {selectedFormat ? `形式: ${selectedFormat}` : '形式'}
                </span>
              </NativeSelectButton>
            );
          }

          // Multi-file: native picker of filenames → then per-file format picker (loops)
          return (
            <NativeSelectButton
              className="w-full active:opacity-80 transition-opacity border-b border-primary-foreground/20"
              style={{ borderRadius: 0, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', minHeight: 52 }}
              ariaLabel="形式"
              value=""
              onSelect={(v) => onFilenamePicked(v)}
              pickerHeader="ファイルを選択"
              groups={[{
                label: 'ファイル',
                options: files.map((f, i) => ({
                  label: `${f.name}${perFileFormats[i] ? ` (${perFileFormats[i]})` : ''}`,
                  value: String(i),
                })),
              }]}
            >
              <span className="block w-full py-3.5 text-[31px] font-semibold">形式</span>
            </NativeSelectButton>
          );
        })()}

        {files.length > 0 && formatsReady && (
          files.length === 1 ? (
            <button
              type="button"
              onClick={() => { setDetailContext('all'); setTimeout(() => setShowDetailSettings(true), 500); }}
              aria-label="詳細設定"
              className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity border-b border-primary-foreground/20"
              style={{ borderRadius: 0, minHeight: 52 }}
            >
              詳細設定
            </button>
          ) : (
            <NativeSelectButton
              className="w-full active:opacity-80 transition-opacity border-b border-primary-foreground/20"
              style={{ borderRadius: 0, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', minHeight: 52 }}
              ariaLabel="詳細設定"
              value=""
              onSelect={(v) => {
                const idx = parseInt(v, 10);
                if (isNaN(idx)) return;
                setDetailContext(`file:${idx}` as const);
                setTimeout(() => setShowDetailSettings(true), 500);
              }}
              pickerHeader="詳細設定するファイル"
              groups={[{
                label: 'ファイル',
                options: files.map((f, i) => ({ label: f.name, value: String(i) })),
              }]}
            >
              <span className="block w-full py-3.5 text-[31px] font-semibold">詳細設定</span>
            </NativeSelectButton>
          )
        )}

        {files.length > 0 && formatsReady && !converting && !convertedUrl && (
          <button onClick={handleConvert}
            className="w-full py-3.5 bg-primary text-primary-foreground text-[31px] font-semibold active:opacity-80 transition-opacity"
            style={{ borderRadius: 0 }}>
            変換
          </button>
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

      {/* Multi-file format chain: hidden native selects (filename → format), loops until every file has a format */}
      {files.length >= 2 && (
        <>
          <select
            ref={fileSelectRef}
            value=""
            onChange={(e) => onFilenamePicked(e.target.value)}
            className="absolute opacity-0 pointer-events-none"
            style={{ left: 0, top: 0, width: 1, height: 1 }}
            aria-label="ファイルを選択"
          >
            <option value="" disabled>ファイルを選択</option>
            <optgroup label="ファイル">
              {files.map((f, i) => (
                <option key={i} value={String(i)}>
                  {f.name}{perFileFormats[i] ? ` (${perFileFormats[i]})` : ''}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            ref={formatSelectRef}
            value=""
            onChange={(e) => onFormatPicked(e.target.value)}
            className="fixed opacity-0"
            style={{ left: '50%', top: '50%', width: 1, height: 1, pointerEvents: pendingFormatForIdx !== null ? 'auto' : 'none' }}
            aria-label="形式を選択"
          >
            <option value="" disabled>形式を選択</option>
            {pendingFormatForIdx !== null && files[pendingFormatForIdx]?.type.startsWith('audio/') ? (
              <optgroup label="音声形式">
                {AUDIO_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            ) : (
              <>
                <optgroup label="動画形式">
                  {VIDEO_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </optgroup>
                <optgroup label="音声形式">
                  {AUDIO_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              </>
            )}
          </select>
        </>
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
