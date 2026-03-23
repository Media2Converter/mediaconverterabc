import React, { useState, useEffect, useMemo } from 'react';
import { IOSPickerModal, IOSAlertDialog, type PickerSection } from './IOSComponents';
import {
  VIDEO_CODECS, AUDIO_CODECS, ASPECT_RATIOS, SCAN_TYPES, RESOLUTIONS,
  VIDEO_BITRATES, AUDIO_BITRATES, FRAMERATES, SPEEDS, CHANNELS, FREQUENCIES,
  IPHONE_BAD_VIDEO_CODECS, IPHONE_BAD_AUDIO_CODECS,
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
}

type PickerType = 'videoCodec' | 'aspectRatio' | 'scanType' | 'resolution' | 'videoBitrate' | 'framerate' | 'startTime' | 'endTime' | 'speed' | 'audioCodec' | 'audioBitrate' | 'channels' | 'frequency' | null;

const SettingRow: React.FC<{ label: string; value: string; onClick: () => void; warning?: boolean }> = ({ label, value, onClick, warning }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border active:bg-accent transition-colors">
    <span className="text-foreground text-[15px]">{label}</span>
    <span className={`text-[15px] ${warning ? 'text-ios-warning' : 'text-muted-foreground'}`}>{value} ›</span>
  </button>
);

export const DetailSettingsModal: React.FC<Props> = ({ open, onClose, settings, onChange, videoDuration, videoPreviewUrl, isVideo }) => {
  const [picker, setPicker] = useState<PickerType>(null);
  const [customResW, setCustomResW] = useState('');
  const [customResH, setCustomResH] = useState('');
  const [showCustomRes, setShowCustomRes] = useState(false);
  const [customBitrate, setCustomBitrate] = useState('');
  const [showCustomVBitrate, setShowCustomVBitrate] = useState(false);
  const [showCustomABitrate, setShowCustomABitrate] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [showSpeedPitch, setShowSpeedPitch] = useState(false);
  const [speedLongPress, setSpeedLongPress] = useState<ReturnType<typeof setTimeout> | null>(null);

  const isInterlace = settings.scanType === 'インターレース方式';
  const [arL, arR] = settings.aspectRatio.split(':').map(Number);
  const isPortrait = arL < arR;

  useEffect(() => {
    if (!open) { setPicker(null); setShowCustomRes(false); setShowCustomVBitrate(false); setShowCustomABitrate(false); }
  }, [open]);

  const makeCodecSections = (codecs: string[], badList: string[]): PickerSection[] => [{
    options: codecs.map(c => ({ label: c, value: c, warning: badList.includes(c) }))
  }];

  const resolutionLabel = (tag?: string) => {
    if (!tag) return '';
    if (!isInterlace) return tag;
    return tag.replace(/(\d+)p/g, '$1I');
  };

  const getResolutionSections = (): PickerSection[] => {
    const opts = RESOLUTIONS.map(r => {
      const w = isPortrait ? r.h : r.w;
      const h = isPortrait ? r.w : r.h;
      const tagDisplay = resolutionLabel(r.tag);
      const label = `${w}×${h}${tagDisplay ? ` (${tagDisplay})` : ''}${r.desc ? ` ${r.desc}` : ''}`;
      return { label, value: `${r.w}x${r.h}` };
    });
    opts.push({ label: '打ち込む', value: 'custom' });
    return [{ options: opts }];
  };

  const getTimeSections = (max: number): PickerSection[] => {
    const opts = [];
    const step = max > 120 ? 5 : max > 30 ? 1 : 0.5;
    for (let t = 0; t <= max; t += step) {
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(step < 1 ? 1 : 0);
      opts.push({ label: `${m}:${s.padStart(step < 1 ? 4 : 2, '0')}`, value: String(t) });
    }
    return [{ options: opts }];
  };

  const handlePickerSelect = (value: string) => {
    const s = { ...settings };
    switch (picker) {
      case 'videoCodec':
        s.videoCodec = value;
        if (IPHONE_BAD_VIDEO_CODECS.includes(value))
          setAlert({ title: '⚠️ 互換性の警告', message: `${value}はiPhoneで再生エラーが発生する可能性があります。` });
        break;
      case 'aspectRatio': s.aspectRatio = value; break;
      case 'scanType': s.scanType = value; break;
      case 'resolution':
        if (value === 'custom') { setShowCustomRes(true); setPicker(null); onChange(s); return; }
        const [rw, rh] = value.split('x').map(Number);
        s.resolutionW = rw; s.resolutionH = rh;
        if (!checkAspectResolutionMatch(s.aspectRatio, rw, rh))
          setAlert({ title: '⚠️ 警告', message: 'アスペクト比と解像度が一致しません（5px以上のずれ）。' });
        break;
      case 'videoBitrate': s.videoBitrate = value; break;
      case 'framerate': s.framerate = value; break;
      case 'startTime': s.startTime = parseFloat(value); break;
      case 'endTime': s.endTime = parseFloat(value); break;
      case 'speed': s.speed = value; break;
      case 'audioCodec':
        s.audioCodec = value;
        if (IPHONE_BAD_AUDIO_CODECS.includes(value))
          setAlert({ title: '⚠️ 互換性の警告', message: `${value}はiPhoneで再生エラーが発生する可能性があります。` });
        break;
      case 'audioBitrate': s.audioBitrate = value; break;
      case 'channels': s.channels = value; break;
      case 'frequency': s.frequency = value; break;
    }
    onChange(s);
    setPicker(null);
  };

  const getSections = (): PickerSection[] => {
    switch (picker) {
      case 'videoCodec': return makeCodecSections(VIDEO_CODECS, IPHONE_BAD_VIDEO_CODECS);
      case 'aspectRatio': return [{ options: ASPECT_RATIOS.map(a => ({ label: a, value: a })) }];
      case 'scanType': return [{ options: SCAN_TYPES.map(s => ({ label: s, value: s })) }];
      case 'resolution': return getResolutionSections();
      case 'videoBitrate': {
        const opts = VIDEO_BITRATES.map(b => ({ label: b, value: b }));
        opts.push({ label: '打ち込む', value: 'custom' });
        return [{ options: opts }];
      }
      case 'framerate': return [{ options: FRAMERATES.map(f => ({ label: f, value: f })) }];
      case 'startTime': return getTimeSections(videoDuration);
      case 'endTime': return getTimeSections(videoDuration);
      case 'speed': return [{ options: SPEEDS.map(s => ({ label: `${s}×`, value: s })) }];
      case 'audioCodec': return makeCodecSections(AUDIO_CODECS, IPHONE_BAD_AUDIO_CODECS);
      case 'audioBitrate': {
        const opts = AUDIO_BITRATES.map(b => ({ label: b, value: b }));
        opts.push({ label: '打ち込む', value: 'custom' });
        return [{ options: opts }];
      }
      case 'channels': return [{ options: CHANNELS.map(c => ({ label: c, value: c })) }];
      case 'frequency': return [{ options: FREQUENCIES.map(f => ({ label: f, value: f })) }];
      default: return [];
    }
  };

  const getPickerSelected = (): string => {
    switch (picker) {
      case 'videoCodec': return settings.videoCodec;
      case 'aspectRatio': return settings.aspectRatio;
      case 'scanType': return settings.scanType;
      case 'resolution': return `${settings.resolutionW}x${settings.resolutionH}`;
      case 'videoBitrate': return settings.videoBitrate;
      case 'framerate': return settings.framerate;
      case 'startTime': return String(settings.startTime);
      case 'endTime': return String(settings.endTime);
      case 'speed': return settings.speed;
      case 'audioCodec': return settings.audioCodec;
      case 'audioBitrate': return settings.audioBitrate;
      case 'channels': return settings.channels;
      case 'frequency': return settings.frequency;
      default: return '';
    }
  };

  const getPickerHeader = () => {
    if (picker === 'aspectRatio' && videoPreviewUrl) {
      return (
        <div className="flex justify-center">
          <video src={videoPreviewUrl} className="max-h-24 rounded-lg" muted />
        </div>
      );
    }
    if (picker === 'resolution') {
      const [al, ar] = settings.aspectRatio.split(':').map(Number);
      const ratio = al / ar;
      const boxW = ratio >= 1 ? 80 : 80 * ratio;
      const boxH = ratio >= 1 ? 80 / ratio : 80;
      return (
        <div className="flex justify-center">
          <div className="border-2 border-primary rounded" style={{ width: boxW, height: boxH }} />
        </div>
      );
    }
    return undefined;
  };

  const handleSpeedTouchStart = () => {
    if (settings.speed !== '1') {
      const timer = setTimeout(() => setShowSpeedPitch(true), 500);
      setSpeedLongPress(timer);
    }
  };

  const handleSpeedTouchEnd = () => {
    if (speedLongPress) clearTimeout(speedLongPress);
    setSpeedLongPress(null);
  };

  if (!open) return null;

  return (
    <>
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
                <SettingRow label="ビデオコーデック" value={settings.videoCodec} onClick={() => setPicker('videoCodec')} warning={IPHONE_BAD_VIDEO_CODECS.includes(settings.videoCodec)} />
                <SettingRow label="縦横比" value={settings.aspectRatio} onClick={() => setPicker('aspectRatio')} />
                <SettingRow label="フレーム書き出し方式" value={settings.scanType} onClick={() => setPicker('scanType')} />
                <SettingRow label="解像度" value={`${isPortrait ? settings.resolutionH : settings.resolutionW}×${isPortrait ? settings.resolutionW : settings.resolutionH}`} onClick={() => setPicker('resolution')} />
                <SettingRow label="動画ビットレート" value={settings.videoBitrate} onClick={() => setPicker('videoBitrate')} />
                <SettingRow label="フレームレート" value={settings.framerate} onClick={() => setPicker('framerate')} />
                <SettingRow label="開始時間" value={`${Math.floor(settings.startTime / 60)}:${(settings.startTime % 60).toFixed(0).padStart(2, '0')}`} onClick={() => setPicker('startTime')} />
                <SettingRow label="終了時間" value={settings.endTime === 0 ? '最後まで' : `${Math.floor(settings.endTime / 60)}:${(settings.endTime % 60).toFixed(0).padStart(2, '0')}`} onClick={() => setPicker('endTime')} />
                <div
                  onTouchStart={handleSpeedTouchStart}
                  onTouchEnd={handleSpeedTouchEnd}
                  onMouseDown={handleSpeedTouchStart}
                  onMouseUp={handleSpeedTouchEnd}
                >
                  <SettingRow label="再生速度" value={`${settings.speed}×`} onClick={() => setPicker('speed')} />
                </div>
              </>
            )}

            <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">オーディオ</div>
            <SettingRow label="オーディオコーデック" value={settings.audioCodec} onClick={() => setPicker('audioCodec')} warning={IPHONE_BAD_AUDIO_CODECS.includes(settings.audioCodec)} />
            <SettingRow label="音声ビットレート" value={settings.audioBitrate} onClick={() => setPicker('audioBitrate')} />
            <SettingRow label="チャンネル数" value={settings.channels} onClick={() => setPicker('channels')} />
            <SettingRow label="周波数" value={settings.frequency} onClick={() => setPicker('frequency')} />
          </div>

          <button onClick={onClose} className="w-full py-4 bg-primary text-primary-foreground text-[17px] font-semibold active:opacity-80 transition-opacity">
            OK
          </button>
        </div>
      </div>

      <IOSPickerModal
        open={picker !== null && !showCustomRes}
        onClose={() => setPicker(null)}
        onSelect={(v) => {
          if (v === 'custom') {
            if (picker === 'videoBitrate') { setShowCustomVBitrate(true); setPicker(null); return; }
            if (picker === 'audioBitrate') { setShowCustomABitrate(true); setPicker(null); return; }
          }
          handlePickerSelect(v);
        }}
        sections={getSections()}
        selected={getPickerSelected()}
        header={getPickerHeader()}
      />

      {/* Custom resolution input */}
      {showCustomRes && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomRes(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">解像度を入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input
                type="number" inputMode="numeric" placeholder={String(settings.resolutionW)}
                value={customResW} onChange={e => setCustomResW(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-foreground text-[17px]">×</span>
              <input
                type="number" inputMode="numeric" placeholder={String(settings.resolutionH)}
                value={customResH} onChange={e => setCustomResH(e.target.value)}
                className="w-20 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              onClick={() => {
                const w = parseInt(customResW) || settings.resolutionW;
                const h = parseInt(customResH) || settings.resolutionH;
                onChange({ ...settings, resolutionW: w, resolutionH: h });
                if (!checkAspectResolutionMatch(settings.aspectRatio, w, h))
                  setAlert({ title: '⚠️ 警告', message: 'アスペクト比と解像度が一致しません（5px以上のずれ）。' });
                setShowCustomRes(false);
              }}
              className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Custom video bitrate input */}
      {showCustomVBitrate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomVBitrate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">動画ビットレートを入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input
                type="number" inputMode="numeric" placeholder="5120"
                value={customBitrate} onChange={e => setCustomBitrate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-foreground text-[15px]">KBPS</span>
            </div>
            <button
              onClick={() => {
                onChange({ ...settings, videoBitrate: `${customBitrate || '5120'}KBPS` });
                setShowCustomVBitrate(false);
              }}
              className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Custom audio bitrate input */}
      {showCustomABitrate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowCustomABitrate(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl p-6 ios-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-foreground text-[17px] font-semibold text-center mb-4">音声ビットレートを入力</h3>
            <div className="flex items-center gap-2 justify-center">
              <input
                type="number" inputMode="numeric" placeholder="128"
                value={customBitrate} onChange={e => setCustomBitrate(e.target.value)}
                className="w-28 bg-secondary text-foreground text-center rounded-lg py-2 text-[17px] placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-foreground text-[15px]">KBPS</span>
            </div>
            <button
              onClick={() => {
                onChange({ ...settings, audioBitrate: `${customBitrate || '128'}KBPS` });
                setShowCustomABitrate(false);
              }}
              className="w-full mt-4 py-3 bg-primary text-primary-foreground rounded-xl text-[17px] font-semibold active:opacity-80"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Speed pitch option */}
      {showSpeedPitch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={() => setShowSpeedPitch(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-[280px] bg-card rounded-2xl overflow-hidden ios-scale-in" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold">
              ピッチを再生速度に合わせる
            </div>
            <button
              onClick={() => { onChange({ ...settings, pitchSync: true }); setShowSpeedPitch(false); }}
              className={`w-full px-5 py-3.5 text-left text-[17px] border-b border-border flex justify-between ${settings.pitchSync ? 'text-primary' : 'text-foreground'}`}
            >
              ON {settings.pitchSync && '✓'}
            </button>
            <button
              onClick={() => { onChange({ ...settings, pitchSync: false }); setShowSpeedPitch(false); }}
              className={`w-full px-5 py-3.5 text-left text-[17px] flex justify-between ${!settings.pitchSync ? 'text-primary' : 'text-foreground'}`}
            >
              OFF {!settings.pitchSync && '✓'}
            </button>
          </div>
        </div>
      )}

      <IOSAlertDialog open={!!alert} onClose={() => setAlert(null)} title={alert?.title || ''} message={alert?.message || ''} />
    </>
  );
};
