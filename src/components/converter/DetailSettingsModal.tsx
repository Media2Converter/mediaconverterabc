import React, { useState, useEffect, useRef } from 'react';
import { IOSPickerModal, IOSAlertDialog, type PickerSection } from '@/components/converter/IOSComponents';
import {
  VIDEO_CODECS, AUDIO_CODECS, ASPECT_RATIOS, SCAN_TYPES, RESOLUTIONS,
  VIDEO_BITRATES, AUDIO_BITRATES, FRAMERATES, SPEEDS, CHANNELS, FREQUENCIES,
  VOLUME_OPTIONS, AMR_NB_BITRATES, AMR_WB_BITRATES, AMR_NB_FREQUENCIES, AMR_WB_FREQUENCIES,
  IPHONE_BAD_VIDEO_CODECS, IPHONE_BAD_AUDIO_CODECS,
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

const SettingRow: React.FC<{ label: string; value: string; onClick: () => void; onLongPress?: () => void; warning?: boolean }> = ({ label, value, onClick, onLongPress, warning }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = () => {
    if (onLongPress) {
      timerRef.current = setTimeout(() => { onLongPress(); timerRef.current = null; }, 600);
    }
  };
  const handleTouchEnd = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; onClick(); }
    else if (!onLongPress) onClick();
  };

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onClick={!onLongPress ? onClick : undefined}
      className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border active:bg-accent transition-colors"
    >
      <span className="text-foreground text-[15px]">{label}</span>
      <span className={`text-[15px] ${warning ? 'text-destructive' : 'text-muted-foreground'}`}>{value} ›</span>
    </button>
  );
};

export const DetailSettingsModal: React.FC<Props> = ({ open, onClose, settings, onChange, videoDuration, videoPreviewUrl, isVideo, selectedFormat }) => {
  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [showCustomRes, setShowCustomRes] = useState(false);
  const [customResW, setCustomResW] = useState('');
  const [customResH, setCustomResH] = useState('');
  const [showCustomBitrate, setShowCustomBitrate] = useState<'video' | 'audio' | null>(null);
  const [customBitrate, setCustomBitrate] = useState('');
  const [showCustomFramerate, setShowCustomFramerate] = useState(false);
  const [customFramerate, setCustomFramerate] = useState('');
  const [alertState, setAlertState] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' });
  const [showAudioDeleteWarn, setShowAudioDeleteWarn] = useState(false);

  const isInterlace = settings.scanType === 'インターレース方式';
  const [arL, arR] = settings.aspectRatio.split(':').map(Number);
  const isPortrait = arL < arR;

  useEffect(() => {
    if (!open) { setActivePicker(null); setShowCustomRes(false); setShowCustomBitrate(null); }
  }, [open]);

  const showAlert = (title: string, message: string) => setAlertState({ open: true, title, message });

  const resolutionLabel = (tag?: string) => {
    if (!tag) return '';
    return isInterlace ? tag.replace(/(\d+)p/g, '$1I') : tag;
  };

  // Build codec options with compatibility warnings
  const buildVideoCodecOptions = (): PickerSection[] => {
    const compatible = selectedFormat ? FORMAT_VIDEO_CODEC_COMPAT[selectedFormat] : null;
    return [{
      title: 'ビデオコーデック',
      options: VIDEO_CODECS.map(c => {
        const incompatible = compatible && !compatible.includes(c);
        return {
          label: c,
          value: c,
          dangerLabel: incompatible ? '危ない！互換性なし' : undefined,
          colorClass: incompatible ? 'text-destructive' : undefined,
        };
      }),
    }];
  };

  const buildAudioCodecOptions = (): PickerSection[] => {
    const compatible = selectedFormat ? FORMAT_AUDIO_CODEC_COMPAT[selectedFormat] : null;
    return [{
      title: 'オーディオコーデック',
      options: AUDIO_CODECS.map(c => {
        const incompatible = compatible && !compatible.includes(c);
        return {
          label: c,
          value: c,
          dangerLabel: incompatible ? '危ない！互換性なし' : undefined,
          colorClass: incompatible ? 'text-destructive' : undefined,
        };
      }),
    }];
  };

  const buildAspectRatioSections = (): PickerSection[] => [{
    options: ASPECT_RATIOS.map(a => ({ label: a, value: a })),
  }];

  const aspectRatioHeader = () => {
    const pw = 120;
    const ph = Math.round((pw / arL) * arR);
    const maxH = 80;
    const scale = ph > maxH ? maxH / ph : 1;
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="border-2 border-primary rounded-sm bg-primary/10"
          style={{ width: pw * scale, height: ph * scale }}
        />
        <span className="text-muted-foreground text-[13px]">{settings.aspectRatio}</span>
      </div>
    );
  };

  const buildResolutionSections = (): PickerSection[] => [{
    options: [
      ...RESOLUTIONS.map(r => {
        const w = isPortrait ? r.h : r.w;
        const h = isPortrait ? r.w : r.h;
        const tagDisplay = resolutionLabel(r.tag);
        return {
          label: `${w}×${h}${tagDisplay ? ` (${tagDisplay})` : ''}${r.desc ? ` ${r.desc}` : ''}`,
          value: `${r.w}x${r.h}`,
        };
      }),
      { label: '打ち込む', value: 'custom' },
    ],
  }];

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

  const buildVolumeSections = (): PickerSection[] => [{
    title: '音量',
    options: VOLUME_OPTIONS.map(v => ({
      label: v.label,
      value: v.value,
      colorClass: v.color === 'red' ? 'text-destructive' : v.color === 'orange' ? 'text-orange-500' : undefined,
    })),
  }];

  const handlePickerSelect = (picker: string, value: string) => {
    switch (picker) {
      case 'videoCodec':
        onChange({ ...settings, videoCodec: value });
        if (selectedFormat && !isCodecCompatible(selectedFormat, value, 'video')) {
          showAlert('⚠️ 危ない！', `ビデオコーデック「${value}」は「${selectedFormat}」形式と互換性がありません。エラーが発生する可能性があります。`);
        }
        break;
      case 'audioCodec':
        onChange({ ...settings, audioCodec: value });
        if (selectedFormat && !isCodecCompatible(selectedFormat, value, 'audio')) {
          showAlert('⚠️ 危ない！', `オーディオコーデック「${value}」は「${selectedFormat}」形式と互換性がありません。エラーが発生する可能性があります。`);
        }
        break;
      case 'aspectRatio':
        onChange({ ...settings, aspectRatio: value });
        if (!checkAspectResolutionMatch(value, settings.resolutionW, settings.resolutionH)) {
          showAlert('⚠️ 警告', 'アスペクト比と解像度が一致しません（5px以上のずれ）。');
        }
        break;
      case 'resolution':
        if (value === 'custom') { setShowCustomRes(true); return; }
        const [rw, rh] = value.split('x').map(Number);
        onChange({ ...settings, resolutionW: rw, resolutionH: rh });
        if (!checkAspectResolutionMatch(settings.aspectRatio, rw, rh)) {
          showAlert('⚠️ 警告', 'アスペクト比と解像度が一致しません（5px以上のずれ）。');
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
      case 'framerate': onChange({ ...settings, framerate: value }); break;
      case 'startTime': onChange({ ...settings, startTime: parseFloat(value) }); break;
      case 'endTime': onChange({ ...settings, endTime: parseFloat(value) }); break;
      case 'speed': onChange({ ...settings, speed: value }); break;
      case 'channels': onChange({ ...settings, channels: value }); break;
      case 'frequency': onChange({ ...settings, frequency: value }); break;
      case 'volume': onChange({ ...settings, volume: value }); break;
    }
  };

  const timeOptions = (max: number): PickerSection[] => {
    const opts: { label: string; value: string }[] = [];
    const step = max > 120 ? 5 : max > 30 ? 1 : 0.5;
    for (let t = 0; t <= max; t += step) {
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(step < 1 ? 1 : 0);
      opts.push({ label: `${m}:${s.padStart(step < 1 ? 4 : 2, '0')}`, value: String(t) });
    }
    return [{ options: opts }];
  };

  const getPickerSections = (): PickerSection[] => {
    switch (activePicker) {
      case 'videoCodec': return buildVideoCodecOptions();
      case 'audioCodec': return buildAudioCodecOptions();
      case 'aspectRatio': return buildAspectRatioSections();
      case 'resolution': return buildResolutionSections();
      case 'videoBitrate': return [{ options: [...VIDEO_BITRATES.map(b => ({ label: b, value: b })), { label: '打ち込む', value: 'custom' }] }];
      case 'audioBitrate': return [{ options: [...getAudioBitrates().map(b => ({ label: b, value: b })), { label: '打ち込む', value: 'custom' }] }];
      case 'scanType': return [{ options: SCAN_TYPES.map(s => ({ label: s, value: s })) }];
      case 'framerate': return [{ options: [...FRAMERATES.map(f => ({ label: f, value: f })), { label: '打ち込む', value: 'custom' }] }];
      case 'startTime': return timeOptions(videoDuration);
      case 'endTime': return [{ options: [{ label: '最後まで', value: '0' }, ...timeOptions(videoDuration)[0].options.slice(1)] }];
      case 'speed': return [{ options: SPEEDS.map(s => ({ label: `${s}×`, value: s })) }];
      case 'channels': return [{ options: CHANNELS.map(c => ({ label: c, value: c })) }];
      case 'frequency': return [{ options: getFrequencies().map(f => ({ label: f, value: f })) }];
      case 'volume': return buildVolumeSections();
      default: return [];
    }
  };

  const getPickerSelected = (): string => {
    switch (activePicker) {
      case 'videoCodec': return settings.videoCodec;
      case 'audioCodec': return settings.audioCodec;
      case 'aspectRatio': return settings.aspectRatio;
      case 'resolution': return `${settings.resolutionW}x${settings.resolutionH}`;
      case 'videoBitrate': return settings.videoBitrate;
      case 'audioBitrate': return settings.audioBitrate;
      case 'scanType': return settings.scanType;
      case 'framerate': return settings.framerate;
      case 'startTime': return String(settings.startTime);
      case 'endTime': return String(settings.endTime);
      case 'speed': return settings.speed;
      case 'channels': return settings.channels;
      case 'frequency': return settings.frequency;
      case 'volume': return settings.volume;
      default: return '';
    }
  };

  const volumeDisplay = () => {
    if (settings.volume === 'none') return '変えない';
    return `${settings.volume}dB`;
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
                <SettingRow label="ビデオコーデック" value={settings.videoCodec} onClick={() => setActivePicker('videoCodec')}
                  warning={selectedFormat ? !isCodecCompatible(selectedFormat, settings.videoCodec, 'video') : false} />
                <SettingRow label="縦横比" value={settings.aspectRatio} onClick={() => setActivePicker('aspectRatio')} />
                <SettingRow label="フレーム書き出し方式" value={settings.scanType} onClick={() => setActivePicker('scanType')} />
                <SettingRow label="解像度" value={`${settings.resolutionW}×${settings.resolutionH}`} onClick={() => setActivePicker('resolution')} />
                <SettingRow label="動画ビットレート" value={settings.videoBitrate} onClick={() => setActivePicker('videoBitrate')} />
                <SettingRow label="フレームレート" value={settings.framerate} onClick={() => setActivePicker('framerate')} />
                <SettingRow label="開始時間" value={settings.startTime > 0 ? `${settings.startTime}s` : '0:00'} onClick={() => setActivePicker('startTime')} />
                <SettingRow label="終了時間" value={settings.endTime > 0 ? `${settings.endTime}s` : '最後まで'} onClick={() => setActivePicker('endTime')} />
                <SettingRow label="再生速度" value={`${settings.speed}×`} onClick={() => setActivePicker('speed')} />
              </>
            )}

            <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">オーディオ</div>
            <SettingRow label="オーディオコーデック" value={settings.audioCodec} onClick={() => setActivePicker('audioCodec')}
              warning={selectedFormat ? !isCodecCompatible(selectedFormat, settings.audioCodec, 'audio') : false} />
            <SettingRow label="音声ビットレート" value={settings.audioBitrate} onClick={() => setActivePicker('audioBitrate')} />
            <SettingRow label="チャンネル数" value={settings.channels} onClick={() => setActivePicker('channels')} />
            <SettingRow label="周波数" value={settings.frequency} onClick={() => setActivePicker('frequency')} />
            <SettingRow
              label="音量"
              value={volumeDisplay()}
              onClick={() => setActivePicker('volume')}
              onLongPress={() => setShowAudioDeleteWarn(true)}
            />
          </div>

          <button onClick={onClose} className="w-full py-4 bg-primary text-primary-foreground text-[17px] font-semibold active:opacity-80 transition-opacity">
            OK
          </button>
        </div>
      </div>

      {/* Picker modal */}
      <IOSPickerModal
        open={!!activePicker}
        onClose={() => setActivePicker(null)}
        sections={getPickerSections()}
        selected={getPickerSelected()}
        onSelect={(v) => handlePickerSelect(activePicker!, v)}
        header={activePicker === 'aspectRatio' ? aspectRatioHeader() : undefined}
      />

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
                showAlert('⚠️ 警告', 'アスペクト比と解像度が一致しません（5px以上のずれ）。');
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

      {/* Audio track delete warning */}
      <IOSAlertDialog
        open={showAudioDeleteWarn}
        onClose={() => setShowAudioDeleteWarn(false)}
        title="⚠️ 音声トラックの削除"
        message="音量を変更すると、元の音声トラックが上書きされます。この操作は元に戻せません。"
      />

      {/* Alert */}
      <IOSAlertDialog
        open={alertState.open}
        onClose={() => setAlertState({ open: false, title: '', message: '' })}
        title={alertState.title}
        message={alertState.message}
      />
    </>
  );
};
