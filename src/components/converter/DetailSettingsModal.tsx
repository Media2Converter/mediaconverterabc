import React, { useState, useEffect, useRef } from 'react';
import {
  VIDEO_CODECS, AUDIO_CODECS, ASPECT_RATIOS, SCAN_TYPES, RESOLUTIONS,
  VIDEO_BITRATES, AUDIO_BITRATES, FRAMERATES, SPEEDS, CHANNELS, FREQUENCIES,
  VOLUME_OPTIONS, AMR_NB_BITRATES, AMR_WB_BITRATES, AMR_NB_FREQUENCIES, AMR_WB_FREQUENCIES,
  FORMAT_AUDIO_CODEC_COMPAT, FORMAT_VIDEO_CODEC_COMPAT,
  isCodecCompatible,
  type ConvertSettings, checkAspectResolutionMatch,
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

/** A setting row that, when clicked, opens a native <select> picker */
const NativePickerRow: React.FC<{
  label: string;
  displayValue: string;
  options: { label: string; value: string; color?: string }[];
  groups?: { label: string; options: { label: string; value: string; color?: string }[] }[];
  selected: string;
  onSelect: (v: string) => void;
  warning?: boolean;
  onLongPress?: () => void;
  header?: React.ReactNode;
}> = ({ label, displayValue, options, groups, selected, onSelect, warning, onLongPress, header }) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    if (onLongPress) {
      timerRef.current = setTimeout(() => { onLongPress(); timerRef.current = null; }, 600);
    }
  };
  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      selectRef.current?.focus();
      selectRef.current?.click();
    } else if (!onLongPress) {
      selectRef.current?.focus();
      selectRef.current?.click();
    }
  };

  const handleClick = () => {
    if (!onLongPress) {
      selectRef.current?.focus();
      selectRef.current?.click();
    }
  };

  return (
    <div className="relative w-full">
      <button
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border active:bg-accent transition-colors"
      >
        <span className="text-foreground text-[15px]">{label}</span>
        <span className={`text-[15px] ${warning ? 'text-destructive' : 'text-muted-foreground'}`}>{displayValue} ›</span>
      </button>
      <select
        ref={selectRef}
        value={selected}
        onChange={e => onSelect(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: '16px' }}
      >
        {header && <option disabled value="">---</option>}
        {groups ? (
          groups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))
        ) : (
          options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))
        )}
      </select>
    </div>
  );
};

export const DetailSettingsModal: React.FC<Props> = ({ open, onClose, settings, onChange, videoDuration, videoPreviewUrl, isVideo, selectedFormat }) => {
  const [showCustomRes, setShowCustomRes] = useState(false);
  const [customResW, setCustomResW] = useState('');
  const [customResH, setCustomResH] = useState('');
  const [showCustomBitrate, setShowCustomBitrate] = useState<'video' | 'audio' | null>(null);
  const [customBitrate, setCustomBitrate] = useState('');
  const [showCustomFramerate, setShowCustomFramerate] = useState(false);
  const [customFramerate, setCustomFramerate] = useState('');

  const isInterlace = settings.scanType === 'インターレース方式';
  const [arL, arR] = settings.aspectRatio.split(':').map(Number);
  const isPortrait = arL < arR;

  useEffect(() => {
    if (!open) { setShowCustomRes(false); setShowCustomBitrate(null); setShowCustomFramerate(false); }
  }, [open]);

  const resolutionLabel = (tag?: string) => {
    if (!tag) return '';
    return isInterlace ? tag.replace(/(\d+)p/g, '$1I') : tag;
  };

  // Build video codec options with red for incompatible
  const videoCodecOptions = VIDEO_CODECS.map(c => {
    const compatible = selectedFormat ? FORMAT_VIDEO_CODEC_COMPAT[selectedFormat] : null;
    const incompatible = compatible && !compatible.includes(c);
    return { label: incompatible ? `⚠ ${c}（互換性なし）` : c, value: c };
  });

  const audioCodecOptions = AUDIO_CODECS.map(c => {
    const compatible = selectedFormat ? FORMAT_AUDIO_CODEC_COMPAT[selectedFormat] : null;
    const incompatible = compatible && !compatible.includes(c);
    return { label: incompatible ? `⚠ ${c}（互換性なし）` : c, value: c };
  });

  const aspectRatioOptions = ASPECT_RATIOS.map(a => ({ label: a, value: a }));

  const resolutionOptions = [
    ...RESOLUTIONS.map(r => {
      const w = isPortrait ? r.h : r.w;
      const h = isPortrait ? r.w : r.h;
      const tagDisplay = resolutionLabel(r.tag);
      return {
        label: `${w}×${h}${tagDisplay ? ` (${tagDisplay})` : ''}${r.desc ? ` ${r.desc}` : ''}`,
        value: `${r.w}x${r.h}`,
      };
    }),
    { label: '打ち込む（カスタム）', value: 'custom' },
  ];

  const getAudioBitrates = () => {
    if (settings.audioCodec === 'AMR_NB') return AMR_NB_BITRATES;
    if (settings.audioCodec === 'AMR_WB') return AMR_WB_BITRATES;
    return AUDIO_BITRATES;
  };

  const getFrequencies = () => {
    if (settings.audioCodec === 'AMR_NB') return AMR_NB_FREQUENCIES;
    if (settings.audioCodec === 'AMR_WB') return AMR_WB_FREQUENCIES;
    return FREQUENCIES;
  };

  const videoBitrateOptions = [...VIDEO_BITRATES.map(b => ({ label: b, value: b })), { label: '打ち込む（カスタム）', value: 'custom' }];
  const audioBitrateOptions = [...getAudioBitrates().map(b => ({ label: b, value: b })), { label: '打ち込む（カスタム）', value: 'custom' }];
  const scanTypeOptions = SCAN_TYPES.map(s => ({ label: s, value: s }));
  const framerateOptions = [...FRAMERATES.map(f => ({ label: f, value: f })), { label: '打ち込む（カスタム）', value: 'custom' }];
  const speedOptions = SPEEDS.map(s => ({ label: `${s}×`, value: s }));
  const channelOptions = CHANNELS.map(c => ({ label: c, value: c }));
  const frequencyOptions = getFrequencies().map(f => ({ label: f, value: f }));
  const volumeOptions = VOLUME_OPTIONS.map(v => ({ label: v.label, value: v.value }));

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

  const handleSelect = (picker: string, value: string) => {
    switch (picker) {
      case 'videoCodec':
        onChange({ ...settings, videoCodec: value });
        if (selectedFormat && !isCodecCompatible(selectedFormat, value, 'video')) {
          window.alert(`ビデオコーデック「${value}」は「${selectedFormat}」形式と互換性がありません。エラーが発生する可能性があります。`);
        }
        break;
      case 'audioCodec':
        onChange({ ...settings, audioCodec: value });
        if (selectedFormat && !isCodecCompatible(selectedFormat, value, 'audio')) {
          window.alert(`オーディオコーデック「${value}」は「${selectedFormat}」形式と互換性がありません。エラーが発生する可能性があります。`);
        }
        break;
      case 'aspectRatio':
        onChange({ ...settings, aspectRatio: value });
        if (!checkAspectResolutionMatch(value, settings.resolutionW, settings.resolutionH)) {
          window.alert('アスペクト比と解像度が一致しません（5px以上のずれ）。');
        }
        break;
      case 'resolution':
        if (value === 'custom') { setShowCustomRes(true); return; }
        { const [rw, rh] = value.split('x').map(Number);
          onChange({ ...settings, resolutionW: rw, resolutionH: rh });
          if (!checkAspectResolutionMatch(settings.aspectRatio, rw, rh)) {
            window.alert('アスペクト比と解像度が一致しません（5px以上のずれ）。');
          }
        }
        break;
      case 'videoBitrate':
        if (value === 'custom') { setShowCustomBitrate('video'); return; }
        onChange({ ...settings, videoBitrate: value });
        break;
      case 'audioBitrate':
        if (value === 'custom') { setShowCustomBitrate('audio'); return; }
        onChange({ ...settings, audioBitrate: value });
        break;
      case 'scanType': onChange({ ...settings, scanType: value }); break;
      case 'framerate':
        if (value === 'custom') { setShowCustomFramerate(true); return; }
        onChange({ ...settings, framerate: value });
        break;
      case 'startTime': onChange({ ...settings, startTime: parseFloat(value) }); break;
      case 'endTime': onChange({ ...settings, endTime: parseFloat(value) }); break;
      case 'speed': onChange({ ...settings, speed: value }); break;
      case 'channels': onChange({ ...settings, channels: value }); break;
      case 'frequency': onChange({ ...settings, frequency: value }); break;
      case 'volume': onChange({ ...settings, volume: value }); break;
    }
  };

  if (!open) return null;

  return (
    <>
      {/* iPad-style popup modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center ios-fade-in" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-md mx-4 bg-card rounded-2xl overflow-hidden ios-scale-in max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-border text-center">
            <h2 className="text-foreground text-[17px] font-semibold">詳細設定</h2>
          </div>
          <div className="overflow-y-auto overscroll-contain flex-1">
            {isVideo && (
              <>
                <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">ビデオ</div>
                <NativePickerRow label="ビデオコーデック" displayValue={settings.videoCodec}
                  options={videoCodecOptions} selected={settings.videoCodec}
                  onSelect={v => handleSelect('videoCodec', v)}
                  warning={selectedFormat ? !isCodecCompatible(selectedFormat, settings.videoCodec, 'video') : false} />
                <NativePickerRow label="縦横比" displayValue={settings.aspectRatio}
                  options={aspectRatioOptions} selected={settings.aspectRatio}
                  onSelect={v => handleSelect('aspectRatio', v)} />
                <NativePickerRow label="フレーム書き出し方式" displayValue={settings.scanType}
                  options={scanTypeOptions} selected={settings.scanType}
                  onSelect={v => handleSelect('scanType', v)} />
                <NativePickerRow label="解像度" displayValue={`${settings.resolutionW}×${settings.resolutionH}`}
                  options={resolutionOptions} selected={`${settings.resolutionW}x${settings.resolutionH}`}
                  onSelect={v => handleSelect('resolution', v)} />
                <NativePickerRow label="動画ビットレート" displayValue={settings.videoBitrate}
                  options={videoBitrateOptions} selected={settings.videoBitrate}
                  onSelect={v => handleSelect('videoBitrate', v)} />
                <NativePickerRow label="フレームレート" displayValue={settings.framerate}
                  options={framerateOptions} selected={settings.framerate}
                  onSelect={v => handleSelect('framerate', v)} />
                <NativePickerRow label="開始時間" displayValue={settings.startTime > 0 ? `${settings.startTime}s` : '0:00'}
                  options={startTimeOptions} selected={String(settings.startTime)}
                  onSelect={v => handleSelect('startTime', v)} />
                <NativePickerRow label="終了時間" displayValue={settings.endTime > 0 ? `${settings.endTime}s` : '最後まで'}
                  options={endTimeOptions} selected={String(settings.endTime)}
                  onSelect={v => handleSelect('endTime', v)} />
                <NativePickerRow label="再生速度" displayValue={`${settings.speed}×`}
                  options={speedOptions} selected={settings.speed}
                  onSelect={v => handleSelect('speed', v)} />
              </>
            )}

            <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">オーディオ</div>
            <NativePickerRow label="オーディオコーデック" displayValue={settings.audioCodec}
              options={audioCodecOptions} selected={settings.audioCodec}
              onSelect={v => handleSelect('audioCodec', v)}
              warning={selectedFormat ? !isCodecCompatible(selectedFormat, settings.audioCodec, 'audio') : false} />
            <NativePickerRow label="音声ビットレート" displayValue={settings.audioBitrate}
              options={audioBitrateOptions} selected={settings.audioBitrate}
              onSelect={v => handleSelect('audioBitrate', v)} />
            <NativePickerRow label="チャンネル数" displayValue={settings.channels}
              options={channelOptions} selected={settings.channels}
              onSelect={v => handleSelect('channels', v)} />
            <NativePickerRow label="周波数" displayValue={settings.frequency}
              options={frequencyOptions} selected={settings.frequency}
              onSelect={v => handleSelect('frequency', v)} />
            <NativePickerRow label="音量" displayValue={volumeDisplay}
              options={volumeOptions} selected={settings.volume}
              onSelect={v => handleSelect('volume', v)}
              onLongPress={() => window.alert('⚠️ 音声トラックの削除\n\n音量を変更すると、元の音声トラックが上書きされます。この操作は元に戻せません。')} />
          </div>

          <button onClick={onClose} className="w-full py-4 bg-primary text-primary-foreground text-[17px] font-semibold active:opacity-80 transition-opacity">
            OK
          </button>
        </div>
      </div>

      {/* Custom resolution input */}
      {showCustomRes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomRes(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">解像度を入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="numeric" placeholder={String(settings.resolutionW)}
                value={customResW} onChange={e => setCustomResW(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[17px]">×</span>
              <input type="number" inputMode="numeric" placeholder={String(settings.resolutionH)}
                value={customResH} onChange={e => setCustomResH(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
            </div>
            <button onClick={() => {
              const w = parseInt(customResW) || settings.resolutionW;
              const h = parseInt(customResH) || settings.resolutionH;
              onChange({ ...settings, resolutionW: w, resolutionH: h });
              if (!checkAspectResolutionMatch(settings.aspectRatio, w, h))
                window.alert('アスペクト比と解像度が一致しません（5px以上のずれ）。');
              setShowCustomRes(false);
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}

      {/* Custom bitrate input */}
      {showCustomBitrate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomBitrate(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">
              {showCustomBitrate === 'video' ? '動画' : '音声'}ビットレートを入力
            </h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="numeric" placeholder={showCustomBitrate === 'video' ? '5120' : '128'}
                value={customBitrate} onChange={e => setCustomBitrate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[15px]">KBPS</span>
            </div>
            <button onClick={() => {
              const key = showCustomBitrate === 'video' ? 'videoBitrate' : 'audioBitrate';
              const def = showCustomBitrate === 'video' ? '5120' : '128';
              onChange({ ...settings, [key]: `${customBitrate || def}KBPS` });
              setShowCustomBitrate(null);
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}

      {/* Custom framerate input */}
      {showCustomFramerate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomFramerate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">フレームレートを入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input type="number" inputMode="decimal" placeholder="30"
                value={customFramerate} onChange={e => setCustomFramerate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-foreground text-[15px]">FPS</span>
            </div>
            <button onClick={() => {
              const val = parseFloat(customFramerate) || 30;
              onChange({ ...settings, framerate: `${val}FPS` });
              setShowCustomFramerate(false);
            }} className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80">OK</button>
          </div>
        </div>
      )}
    </>
  );
};
