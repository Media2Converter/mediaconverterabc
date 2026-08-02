import React, { useState, useEffect, useRef } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { useIsMobile } from '@/hooks/use-mobile';
import { ContextMenuChevron, useIOSSheetA11y, VOOverlayCloseButton } from './iosSheetUtils';
import { IOSConfirmDialog } from './IOSComponents';
import sheetSound from '@/assets/shinki-rokuon.m4a.asset.json';
import {
  ASPECT_RATIOS, SCAN_TYPES, RESOLUTIONS,
  VIDEO_BITRATES, AUDIO_BITRATES, FRAMERATES, SPEEDS, CHANNELS, FREQUENCIES,
  VOLUME_OPTIONS, AMR_NB_BITRATES, AMR_WB_BITRATES, AMR_NB_FREQUENCIES, AMR_WB_FREQUENCIES,
  ADPCM_BITRATES,
  getCompatibleVideoCodecs, getCompatibleAudioCodecs, getCompatiblePixelFormats,
  isAdpcmCodec,
  type ConvertSettings, checkAspectResolutionMatch, isVideoFormat,
} from '@/constants/converterOptions';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ConvertSettings;
  onChange: (s: ConvertSettings) => void;
  videoDuration: number;
  videoPreviewUrl?: string;
  isVideo: boolean;
  selectedFormat: string | null;
}


/** A settings row showing label + sub-text of current value, with native picker */
const NativePickerRow: React.FC<{
  label: string;
  displayValue: string;
  options: { label: string; value: string; disabled?: boolean; separator?: boolean }[];
  groups?: { label: string; options: { label: string; value: string; disabled?: boolean }[] }[];
  selected: string;
  onSelect: (v: string) => void;
  warning?: boolean;
  destructiveValue?: boolean;
  onLongPress?: () => void;
  pickerHeader?: string;
}> = ({ label, displayValue, options, groups, selected, onSelect, warning, destructiveValue, onLongPress, pickerHeader }) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPicker = () => {
    delayRef.current = setTimeout(() => {
      selectRef.current?.focus();
      selectRef.current?.click();
    }, 1000);
  };

  const handleTouchStart = () => {
    if (onLongPress) {
      timerRef.current = setTimeout(() => { onLongPress(); timerRef.current = null; }, 600);
    }
  };
  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      openPicker();
    } else if (!onLongPress) {
      openPicker();
    }
  };

  const handleClick = () => {
    if (!onLongPress) {
      openPicker();
    }
  };

  useEffect(() => {
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const renderOptions = options.map(o => {
    if ((o as any).separator) {
      return <option key={o.value} value={o.value} disabled style={{ fontSize: '13px' }}>{o.label}</option>;
    }
    return <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>;
  });

  return (
    <div className="relative w-full">
      <button
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        aria-hidden="true"
        tabIndex={-1}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border active:bg-accent transition-colors"
      >
        <div className="flex flex-col items-start">
          <span className="text-foreground text-[31px]">{label}</span>
          <span className={`text-[29px] ${destructiveValue ? 'text-destructive' : warning ? 'text-destructive' : 'text-muted-foreground'}`}>{displayValue}</span>
        </div>
        <ContextMenuChevron size={26} />
      </button>
      <select
        ref={selectRef}
        value={selected}
        aria-label={label}
        onChange={e => {
          const val = e.target.value;
          if (val.startsWith('__separator_')) return;
          onSelect(val);
        }}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: '20px' }}
      >
        {pickerHeader && <option disabled value="">{pickerHeader}</option>}
        {groups ? (
          groups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(o => (
                <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
              ))}
            </optgroup>
          ))
        ) : renderOptions}
      </select>
    </div>
  );
};


/** Boxed (non-clickable) section heading — matches iOS rounded outline label */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 pt-5 pb-2" role="heading" aria-level={3}>
    <div
      className="inline-block px-3 py-1 text-foreground text-[15px] font-semibold"
      style={{
        border: '1.5px solid rgba(255,255,255,0.35)',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </div>
  </div>
);

/** Accordion section for "Other Actions" like copy/mute */
const AccordionSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 active:bg-accent transition-colors"
      >
        <span className="text-foreground text-[31px]">{title}</span>
        <span className="text-muted-foreground text-[29px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
};

export const DetailSettingsModal: React.FC<Props> = ({ open, onClose, settings, onChange, videoDuration, videoPreviewUrl, isVideo, selectedFormat }) => {
  const isMobile = useIsMobile();
  const [showCustomRes, setShowCustomRes] = useState(false);
  const [customResW, setCustomResW] = useState('');
  const [customResH, setCustomResH] = useState('');
  const [showCustomBitrate, setShowCustomBitrate] = useState<'video' | 'audio' | null>(null);
  const [customBitrate, setCustomBitrate] = useState('');
  const [showCustomFramerate, setShowCustomFramerate] = useState(false);
  const [customFramerate, setCustomFramerate] = useState('');
  const [savedSettings, setSavedSettings] = useState<ConvertSettings>(settings);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isInterlace = settings.scanType === 'インターレース方式';
  const arParts = settings.aspectRatio.split(':').map(Number);
  const isPortrait = arParts.length === 2 && arParts[0] < arParts[1];

  const outputIsAudioOnly = selectedFormat ? !isVideoFormat(selectedFormat) : false;
  const isAmr = settings.audioCodec === 'AMR_NB' || settings.audioCodec === 'AMR_WB';
  const isAdpcm = isAdpcmCodec(settings.audioCodec);
  const audioIsNone = settings.audioCodec === 'none';

  useEffect(() => {
    if (open) {
      setSavedSettings(settings);
      setShowCustomRes(false);
      setShowCustomBitrate(null);
      setShowCustomFramerate(false);
      setTimeout(() => closeButtonRef.current?.focus(), 100);
    }
  }, [open]);

  const handleCancel = () => {
    if (window.confirm('設定内容を破棄しますか？\nこの操作は取り消せません。')) {
      onChange(savedSettings);
      requestClose();
    }
  };
  const confirmDiscard = () => {
    onChange(savedSettings);
    setShowDiscardConfirm(false);
    requestClose();
  };



  const resolutionLabel = (tag?: string) => {
    if (!tag) return '';
    return isInterlace ? tag.replace(/(\d+)p/g, '$1I') : tag;
  };

  const compatVideoCodecs = getCompatibleVideoCodecs(selectedFormat);
  const videoCodecGroups = [
    { label: 'その他のアクション', options: [{ label: 'コピー', value: 'copy' }] },
    { label: 'コーデック', options: compatVideoCodecs.map(c => ({ label: c, value: c })) },
  ];

  const audioCodecDisplayName = (c: string) => {
    if (c === 'LPCM') return 'PCM_L';
    return c;
  };

  const compatAudioCodecs = getCompatibleAudioCodecs(selectedFormat);
  const audioCodecGroups = [
    { label: 'その他のアクション', options: [
      { label: 'コピー', value: 'copy' },
      { label: '音声を消します', value: 'none' },
    ] },
    { label: 'コーデック', options: compatAudioCodecs.map(c => ({
      label: audioCodecDisplayName(c),
      value: c,
    })) },
  ];

  const aspectRatioOptions = ASPECT_RATIOS.map(a => ({ label: a, value: a }));

  const resolutionOptions = [
    { label: '打ち込む（カスタム）', value: 'custom' },
    ...RESOLUTIONS.map(r => {
      const w = isPortrait ? r.h : r.w;
      const h = isPortrait ? r.w : r.h;
      const tagDisplay = resolutionLabel(r.tag);
      return {
        label: `${w}×${h}${tagDisplay ? ` (${tagDisplay})` : ''}${r.desc ? ` ${r.desc}` : ''}`,
        value: `${r.w}x${r.h}`,
      };
    }),
  ];

  const getAudioBitrates = () => {
    if (settings.audioCodec === 'AMR_NB') return AMR_NB_BITRATES;
    if (settings.audioCodec === 'AMR_WB') return AMR_WB_BITRATES;
    if (isAdpcm && ADPCM_BITRATES[settings.audioCodec]) return ADPCM_BITRATES[settings.audioCodec];
    return AUDIO_BITRATES;
  };

  const getFrequencies = () => {
    if (settings.audioCodec === 'AMR_NB') return AMR_NB_FREQUENCIES;
    if (settings.audioCodec === 'AMR_WB') return AMR_WB_FREQUENCIES;
    return FREQUENCIES;
  };

  const canCustomBitrate = !isAmr && !isAdpcm;
  const audioBitrateOptions = [
    ...(canCustomBitrate ? [{ label: '打ち込む（カスタム）', value: 'custom' }] : []),
    ...getAudioBitrates().map(b => ({ label: b, value: b })),
  ];

  const getChannelOptions = () => {
    if (isAmr) return [{ label: 'モノラル', value: 'モノラル' }];
    return CHANNELS.map(c => ({ label: c, value: c }));
  };

  const videoBitrateOptions = [{ label: '打ち込む（カスタム）', value: 'custom' }, ...VIDEO_BITRATES.map(b => ({ label: b, value: b }))];
  const scanTypeOptions = SCAN_TYPES.map(s => ({ label: s, value: s }));
  const pixelFormatOptions = [
    { label: '自動', value: 'auto' },
    ...getCompatiblePixelFormats(settings.videoCodec).map(p => ({ label: p.toUpperCase(), value: p })),
  ];
  const framerateOptions = [{ label: '打ち込む（カスタム）', value: 'custom' }, ...FRAMERATES.map(f => ({ label: f, value: f }))];
  const speedOptions = SPEEDS.map(s => ({ label: `${s}×`, value: s }));
  const frequencyOptions = getFrequencies().map(f => ({ label: f, value: f }));
  const volumeOptions = VOLUME_OPTIONS.map(v => ({
    label: v.label,
    value: v.value,
    separator: (v as any).separator,
  }));

  const timeOptions = (max: number) => {
    const opts: { label: string; value: string }[] = [];
    const step = max > 120 ? 5 : max > 30 ? 1 : 0.5;
    for (let t = 0; t <= max; t += step) {
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(step < 1 ? 1 : 0);
      opts.push({ label: `${m}:${s.padStart(step < 1 ? 4 : 2, '0')}`, value: String(t) });
    }
    return opts;
  };

  const startTimeOptions = timeOptions(videoDuration);
  const endTimeOptions = [{ label: '最後まで', value: '0' }, ...timeOptions(videoDuration).slice(1)];

  const volumeDisplay = settings.volume === 'none' ? '変えない' : `${settings.volume}dB`;
  const volumeIsDestructive = settings.volume !== 'none' && parseInt(settings.volume) >= 120;

  // Auto-fix AMR settings
  useEffect(() => {
    if (isAmr) {
      const freq = settings.audioCodec === 'AMR_NB' ? '8000Hz' : '16000Hz';
      const bitrates = settings.audioCodec === 'AMR_NB' ? AMR_NB_BITRATES : AMR_WB_BITRATES;
      const updates: Partial<ConvertSettings> = {};
      if (settings.channels !== 'モノラル') updates.channels = 'モノラル';
      if (settings.frequency !== freq) updates.frequency = freq;
      if (!bitrates.includes(settings.audioBitrate)) updates.audioBitrate = bitrates[0];
      if (Object.keys(updates).length > 0) {
        onChange({ ...settings, ...updates });
      }
    }
    if (isAdpcm && ADPCM_BITRATES[settings.audioCodec]) {
      const validBitrates = ADPCM_BITRATES[settings.audioCodec];
      if (!validBitrates.includes(settings.audioBitrate)) {
        onChange({ ...settings, audioBitrate: validBitrates[0] });
      }
    }
  }, [settings.audioCodec]);

  useEffect(() => {
    if (audioIsNone && settings.audioEnabled) {
      onChange({ ...settings, audioEnabled: false });
    } else if (!audioIsNone && !settings.audioEnabled) {
      onChange({ ...settings, audioEnabled: true });
    }
  }, [settings.audioCodec]);

  const handleSelect = (picker: string, value: string) => {
    switch (picker) {
      case 'videoCodec': onChange({ ...settings, videoCodec: value }); break;
      case 'audioCodec': onChange({ ...settings, audioCodec: value, audioEnabled: value !== 'none' }); break;
      case 'aspectRatio':
        onChange({ ...settings, aspectRatio: value });
        if (value !== '自由' && !checkAspectResolutionMatch(value, settings.resolutionW, settings.resolutionH)) {
          window.alert('現在の解像度が選択中のアスペクト比と一致していません。縦横の比率が5ピクセル以上ずれているため、このままでは映像が意図した比率になりません。');
        }
        break;
      case 'resolution':
        if (value === 'custom') { setShowCustomRes(true); return; }
        { const [rw, rh] = value.split('x').map(Number);
          onChange({ ...settings, resolutionW: rw, resolutionH: rh });
          if (settings.aspectRatio !== '自由' && !checkAspectResolutionMatch(settings.aspectRatio, rw, rh)) {
            window.alert('選択した解像度が選択中のアスペクト比と一致していません。縦横の比率が5ピクセル以上ずれています。');
          }
        }
        break;
      case 'videoBitrate':
        if (value === 'custom') { setShowCustomBitrate('video'); return; }
        onChange({ ...settings, videoBitrate: value }); break;
      case 'audioBitrate':
        if (value === 'custom') { setShowCustomBitrate('audio'); return; }
        onChange({ ...settings, audioBitrate: value }); break;
      case 'scanType': onChange({ ...settings, scanType: value }); break;
      case 'pixelFormat': onChange({ ...settings, pixelFormat: value }); break;
      case 'framerate':
        if (value === 'custom') { setShowCustomFramerate(true); return; }
        onChange({ ...settings, framerate: value }); break;
      case 'startTime': onChange({ ...settings, startTime: parseFloat(value) }); break;
      case 'endTime': onChange({ ...settings, endTime: parseFloat(value) }); break;
      case 'speed': onChange({ ...settings, speed: value }); break;
      case 'pitchSync': onChange({ ...settings, pitchSync: value === 'on' }); break;
      case 'channels': onChange({ ...settings, channels: value }); break;
      case 'frequency': onChange({ ...settings, frequency: value }); break;
      case 'volume': onChange({ ...settings, volume: value }); break;
    }
  };

  const showVideoSection = isVideo && !outputIsAudioOnly;
  const audioCodecDisplay = settings.audioCodec === 'none' ? '音声を消します'
    : settings.audioCodec === 'copy' ? 'コピー'
    : audioCodecDisplayName(settings.audioCodec);

  const formatTitle = selectedFormat ? `${selectedFormat} の詳細設定` : '詳細設定';

  // VoiceOver aria-live announcement
  const [voAnnouncement, setVoAnnouncement] = useState('');
  useEffect(() => {
    if (open) {
      setVoAnnouncement('');
      setTimeout(() => setVoAnnouncement('詳細設定 ダイアログ'), 50);
    } else {
      setVoAnnouncement('');
    }
  }, [open]);

  // Handle Escape / 2-finger scrub
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const settingsContent = (
    <>
      {/* VoiceOver announcement */}
      <div aria-live="assertive" className="sr-only" role="status">{voAnnouncement}</div>

      {/* iOS popup header: キャンセル (left) + 完了 (right) — flex layout so title never overlaps */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-shrink-0" style={{ minHeight: '56px' }}>
        <button
          onClick={handleCancel}
          aria-label="キャンセル"
          className="text-[17px] font-normal active:opacity-60 transition-opacity px-1 flex-shrink-0"
          style={{ color: '#fff' }}
        >
          キャンセル
        </button>
        <h2 className="text-[17px] font-semibold text-center truncate flex-1 min-w-0" style={{ color: '#fff' }}>{formatTitle}</h2>
        <button
          ref={closeButtonRef}
          onClick={() => requestClose()}
          aria-label="完了"
          className="text-[17px] font-semibold active:opacity-60 transition-opacity px-1 flex-shrink-0"
          style={{ color: '#fff' }}
        >
          完了
        </button>
      </div>


      <div className="overflow-y-auto overscroll-contain flex-1 -webkit-overflow-scrolling-touch">
        {showVideoSection && (
          <>
            {/* Section heading (not a disabled button) */}
            <SectionHeading>ビデオ</SectionHeading>

            <NativePickerRow label="ビデオコーデック" displayValue={settings.videoCodec === 'copy' ? 'コピー' : settings.videoCodec}
              options={[]} groups={videoCodecGroups} selected={settings.videoCodec}
              onSelect={v => handleSelect('videoCodec', v)} pickerHeader="ビデオコーデック" />


            <NativePickerRow label="ピクセル形式" displayValue={settings.pixelFormat === 'auto' ? '自動' : settings.pixelFormat.toUpperCase()}
              options={pixelFormatOptions} selected={settings.pixelFormat}
              onSelect={v => handleSelect('pixelFormat', v)} pickerHeader="ピクセル形式" />

            <NativePickerRow label="縦横比" displayValue={settings.aspectRatio}
              options={aspectRatioOptions} selected={settings.aspectRatio}
              onSelect={v => handleSelect('aspectRatio', v)} pickerHeader="縦横比" />
            <NativePickerRow label="フレーム書き出し方式" displayValue={settings.scanType}
              options={scanTypeOptions} selected={settings.scanType}
              onSelect={v => handleSelect('scanType', v)} pickerHeader="フレーム書き出し方式" />
            <NativePickerRow label="解像度" displayValue={`${settings.resolutionW}×${settings.resolutionH}`}
              options={resolutionOptions} selected={`${settings.resolutionW}x${settings.resolutionH}`}
              onSelect={v => handleSelect('resolution', v)} pickerHeader="解像度" />
            <NativePickerRow label="動画ビットレート" displayValue={settings.videoBitrate}
              options={videoBitrateOptions} selected={settings.videoBitrate}
              onSelect={v => handleSelect('videoBitrate', v)} pickerHeader="動画ビットレート" />
            <NativePickerRow label="フレームレート" displayValue={settings.framerate}
              options={framerateOptions} selected={settings.framerate}
              onSelect={v => handleSelect('framerate', v)} pickerHeader="フレームレート" />
            <NativePickerRow label="開始時間" displayValue={settings.startTime > 0 ? `${settings.startTime}s` : '0:00'}
              options={startTimeOptions} selected={String(settings.startTime)}
              onSelect={v => handleSelect('startTime', v)} pickerHeader="開始時間" />
            <NativePickerRow label="終了時間" displayValue={settings.endTime > 0 ? `${settings.endTime}s` : '最後まで'}
              options={endTimeOptions} selected={String(settings.endTime)}
              onSelect={v => handleSelect('endTime', v)} pickerHeader="終了時間" />
            <NativePickerRow label="再生速度" displayValue={`${settings.speed}×`}
              options={speedOptions} selected={settings.speed}
              onSelect={v => handleSelect('speed', v)} pickerHeader="再生速度" />
            {settings.speed !== '1' && (
              <NativePickerRow label="ピッチを再生速度に合わせる" displayValue={settings.pitchSync ? 'オン' : 'オフ'}
                options={[{ label: 'オン', value: 'on' }, { label: 'オフ', value: 'off' }]}
                selected={settings.pitchSync ? 'on' : 'off'}
                onSelect={v => handleSelect('pitchSync', v)} pickerHeader="ピッチを再生速度に合わせる" />
            )}
          </>
        )}

        <SectionHeading>オーディオ</SectionHeading>

        <NativePickerRow label="オーディオコーデック" displayValue={audioCodecDisplay}
          options={[]} groups={audioCodecGroups} selected={settings.audioCodec}
          onSelect={v => handleSelect('audioCodec', v)} pickerHeader="オーディオコーデック" />


        {!audioIsNone && settings.audioCodec !== 'copy' && (
          <>
            {outputIsAudioOnly && (
              <>
                <NativePickerRow label="開始時間" displayValue={settings.startTime > 0 ? `${settings.startTime}s` : '0:00'}
                  options={startTimeOptions} selected={String(settings.startTime)}
                  onSelect={v => handleSelect('startTime', v)} pickerHeader="開始時間" />
                <NativePickerRow label="終了時間" displayValue={settings.endTime > 0 ? `${settings.endTime}s` : '最後まで'}
                  options={endTimeOptions} selected={String(settings.endTime)}
                  onSelect={v => handleSelect('endTime', v)} pickerHeader="終了時間" />
                <NativePickerRow label="再生速度" displayValue={`${settings.speed}×`}
                  options={speedOptions} selected={settings.speed}
                  onSelect={v => handleSelect('speed', v)} pickerHeader="再生速度" />
                {settings.speed !== '1' && (
                  <NativePickerRow label="ピッチを再生速度に合わせる" displayValue={settings.pitchSync ? 'オン' : 'オフ'}
                    options={[{ label: 'オン', value: 'on' }, { label: 'オフ', value: 'off' }]}
                    selected={settings.pitchSync ? 'on' : 'off'}
                    onSelect={v => handleSelect('pitchSync', v)} pickerHeader="ピッチを再生速度に合わせる" />
                )}
              </>
            )}

            <NativePickerRow label="音声ビットレート" displayValue={settings.audioBitrate}
              options={audioBitrateOptions} selected={settings.audioBitrate}
              onSelect={v => handleSelect('audioBitrate', v)} pickerHeader="音声ビットレート" />
            <NativePickerRow label="チャンネル数" displayValue={settings.channels}
              options={getChannelOptions()} selected={settings.channels}
              onSelect={v => handleSelect('channels', v)} pickerHeader="チャンネル数" />
            <NativePickerRow label="周波数" displayValue={settings.frequency}
              options={frequencyOptions} selected={settings.frequency}
              onSelect={v => handleSelect('frequency', v)} pickerHeader="周波数" />
            <NativePickerRow label="音量" displayValue={volumeDisplay}
              options={volumeOptions} selected={settings.volume}
              onSelect={v => handleSelect('volume', v)}
              destructiveValue={volumeIsDestructive}
              onLongPress={() => window.alert('音量を変更すると、元の音声トラックが上書きされます。この操作は元に戻せません。')}
              pickerHeader="音量" />
          </>
        )}
      </div>
    </>
  );

  // Custom input dialogs
  const customDialogs = (
    <>
      {showCustomRes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomRes(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[31px] font-semibold text-center mb-4">解像度を入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="numeric" placeholder={String(settings.resolutionW)}
                value={customResW} onChange={e => setCustomResW(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[31px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[31px]">×</span>
              <input type="number" inputMode="numeric" placeholder={String(settings.resolutionH)}
                value={customResH} onChange={e => setCustomResH(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[31px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            </div>
            <button onClick={() => {
              const w = parseInt(customResW) || settings.resolutionW;
              const h = parseInt(customResH) || settings.resolutionH;
              onChange({ ...settings, resolutionW: w, resolutionH: h });
              if (settings.aspectRatio !== '自由' && !checkAspectResolutionMatch(settings.aspectRatio, w, h))
                window.alert('入力した解像度が選択中のアスペクト比と一致していません。縦横の比率が5ピクセル以上ずれています。');
              setShowCustomRes(false);
              setCustomResW('');
              setCustomResH('');
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[31px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}

      {showCustomBitrate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomBitrate(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[31px] font-semibold text-center mb-4">
              {showCustomBitrate === 'video' ? '動画' : '音声'}ビットレートを入力
            </h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="numeric" placeholder={showCustomBitrate === 'video' ? '5120' : '128'}
                value={customBitrate} onChange={e => setCustomBitrate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[31px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[31px]">KBPS</span>
            </div>
            <button onClick={() => {
              const key = showCustomBitrate === 'video' ? 'videoBitrate' : 'audioBitrate';
              const def = showCustomBitrate === 'video' ? '5120' : '128';
              onChange({ ...settings, [key]: `${customBitrate || def}KBPS` });
              setShowCustomBitrate(null);
              setCustomBitrate('');
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[31px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}

      {showCustomFramerate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomFramerate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[31px] font-semibold text-center mb-4">フレームレートを入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="decimal" placeholder="30"
                value={customFramerate} onChange={e => setCustomFramerate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[31px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[31px]">FPS</span>
            </div>
            <button onClick={() => {
              const val = parseFloat(customFramerate) || 30;
              onChange({ ...settings, framerate: `${val}FPS` });
              setShowCustomFramerate(false);
              setCustomFramerate('');
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[31px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}
    </>
  );

  const sheetRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [rendered, setRendered] = useState(open);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSheetSound = () => {
    // Always play: use a fresh element each time so overlapping/interrupted
    // playback never blocks a later trigger, and retry once muted-unlock fails.
    try {
      const el = new Audio(sheetSound.url);
      el.preload = 'auto';
      el.volume = 1;
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try {
            if (!audioRef.current) {
              audioRef.current = new Audio(sheetSound.url);
              audioRef.current.preload = 'auto';
            }
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } catch {}
        });
      }
    } catch {}
  };


  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      playSheetSound();
    }
  }, [open]);

  const requestClose = (after?: () => void) => {
    if (closing) return;
    playSheetSound();
    setClosing(true);
    window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
      after ? after() : onClose();
    }, 300);
  };

  useIOSSheetA11y(open && !closing, sheetRef);

  if (!rendered) return null;

  // iOS-style half-modal bottom sheet
  return (
    <>
      <VOOverlayCloseButton onClose={() => requestClose()} />
      <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
        <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto ${closing ? 'opacity-0 transition-opacity duration-300' : 'ios-fade-in'}`} onClick={() => requestClose()} />
        <div
          ref={sheetRef}
          aria-label="詳細設定 ダイアログ"
          // @ts-ignore - popover is a valid HTML attribute
          popover="auto"
          className={`relative z-10 flex flex-col outline-none pointer-events-auto ${closing ? 'ios-slide-down' : 'ios-slide-up'}`}
          style={{
            width: '100%',
            maxWidth: 640,
            height: '92vh',
            background: '#B91C1C',
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {settingsContent}
        </div>
      </div>
      {customDialogs}
      <IOSConfirmDialog
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={confirmDiscard}
        title="設定内容を破棄しますか？"
        message="この操作は取り消せません。"
        confirmLabel="破棄"
        cancelLabel="キャンセル"
        destructive
      />
    </>
  );
};

