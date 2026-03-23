import React, { useState, useEffect } from 'react';
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

const NativeSelect: React.FC<{
  label: string;
  value: string;
  options: { label: string; value: string; warning?: boolean }[];
  onChange: (value: string) => void;
  groups?: { title: string; options: { label: string; value: string; warning?: boolean }[] }[];
  warning?: boolean;
}> = ({ label, value, options, onChange, groups, warning }) => {
  const displayValue = options.find(o => o.value === value)?.label
    || (groups ? groups.flatMap(g => g.options).find(o => o.value === value)?.label : undefined)
    || value;

  return (
    <div className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border">
      <span className="text-foreground text-[15px]">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`bg-transparent text-right text-[15px] appearance-none cursor-pointer pr-1 ${warning ? 'text-ios-warning' : 'text-muted-foreground'}`}
      >
        {groups ? (
          groups.map(g => (
            <optgroup key={g.title} label={g.title}>
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

const SettingRow: React.FC<{ label: string; value: string; onClick: () => void; warning?: boolean }> = ({ label, value, onClick, warning }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between px-5 py-3.5 border-b border-border active:bg-accent transition-colors">
    <span className="text-foreground text-[15px]">{label}</span>
    <span className={`text-[15px] ${warning ? 'text-ios-warning' : 'text-muted-foreground'}`}>{value} ›</span>
  </button>
);

export const DetailSettingsModal: React.FC<Props> = ({ open, onClose, settings, onChange, videoDuration, videoPreviewUrl, isVideo }) => {
  const [customResW, setCustomResW] = useState('');
  const [customResH, setCustomResH] = useState('');
  const [showCustomRes, setShowCustomRes] = useState(false);
  const [customBitrate, setCustomBitrate] = useState('');
  const [showCustomVBitrate, setShowCustomVBitrate] = useState(false);
  const [showCustomABitrate, setShowCustomABitrate] = useState(false);
  const [showSpeedPitch, setShowSpeedPitch] = useState(false);
  const [speedLongPress, setSpeedLongPress] = useState<ReturnType<typeof setTimeout> | null>(null);

  const isInterlace = settings.scanType === 'インターレース方式';
  const [arL, arR] = settings.aspectRatio.split(':').map(Number);
  const isPortrait = arL < arR;

  useEffect(() => {
    if (!open) { setShowCustomRes(false); setShowCustomVBitrate(false); setShowCustomABitrate(false); }
  }, [open]);

  const resolutionLabel = (tag?: string) => {
    if (!tag) return '';
    if (!isInterlace) return tag;
    return tag.replace(/(\d+)p/g, '$1I');
  };

  const resolutionOptions = [
    ...RESOLUTIONS.map(r => {
      const w = isPortrait ? r.h : r.w;
      const h = isPortrait ? r.w : r.h;
      const tagDisplay = resolutionLabel(r.tag);
      const label = `${w}×${h}${tagDisplay ? ` (${tagDisplay})` : ''}${r.desc ? ` ${r.desc}` : ''}`;
      return { label, value: `${r.w}x${r.h}` };
    }),
    { label: '打ち込む', value: 'custom' },
  ];

  const handleResolutionChange = (value: string) => {
    if (value === 'custom') {
      setShowCustomRes(true);
      return;
    }
    const [rw, rh] = value.split('x').map(Number);
    const s = { ...settings, resolutionW: rw, resolutionH: rh };
    onChange(s);
    if (!checkAspectResolutionMatch(settings.aspectRatio, rw, rh)) {
      window.alert('⚠️ 警告\n\nアスペクト比と解像度が一致しません（5px以上のずれ）。');
    }
  };

  const videoBitrateOptions = [
    ...VIDEO_BITRATES.map(b => ({ label: b, value: b })),
    { label: '打ち込む', value: 'custom' },
  ];

  const audioBitrateOptions = [
    ...AUDIO_BITRATES.map(b => ({ label: b, value: b })),
    { label: '打ち込む', value: 'custom' },
  ];

  const handleVideoBitrateChange = (value: string) => {
    if (value === 'custom') { setShowCustomVBitrate(true); return; }
    onChange({ ...settings, videoBitrate: value });
  };

  const handleAudioBitrateChange = (value: string) => {
    if (value === 'custom') { setShowCustomABitrate(true); return; }
    onChange({ ...settings, audioBitrate: value });
  };

  const handleVideoCodecChange = (value: string) => {
    onChange({ ...settings, videoCodec: value });
    if (IPHONE_BAD_VIDEO_CODECS.includes(value)) {
      window.alert(`⚠️ 互換性の警告\n\n${value}はiPhoneで再生エラーが発生する可能性があります。`);
    }
  };

  const handleAudioCodecChange = (value: string) => {
    onChange({ ...settings, audioCodec: value });
    if (IPHONE_BAD_AUDIO_CODECS.includes(value)) {
      window.alert(`⚠️ 互換性の警告\n\n${value}はiPhoneで再生エラーが発生する可能性があります。`);
    }
  };

  const timeOptions = (max: number) => {
    const opts = [];
    const step = max > 120 ? 5 : max > 30 ? 1 : 0.5;
    for (let t = 0; t <= max; t += step) {
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(step < 1 ? 1 : 0);
      opts.push({ label: `${m}:${s.padStart(step < 1 ? 4 : 2, '0')}`, value: String(t) });
    }
    return opts;
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
                <NativeSelect
                  label="ビデオコーデック"
                  value={settings.videoCodec}
                  options={VIDEO_CODECS.map(c => ({ label: c, value: c, warning: IPHONE_BAD_VIDEO_CODECS.includes(c) }))}
                  onChange={handleVideoCodecChange}
                  warning={IPHONE_BAD_VIDEO_CODECS.includes(settings.videoCodec)}
                />
                <NativeSelect
                  label="縦横比"
                  value={settings.aspectRatio}
                  options={ASPECT_RATIOS.map(a => ({ label: a, value: a }))}
                  onChange={v => onChange({ ...settings, aspectRatio: v })}
                />
                <NativeSelect
                  label="フレーム書き出し方式"
                  value={settings.scanType}
                  options={SCAN_TYPES.map(s => ({ label: s, value: s }))}
                  onChange={v => onChange({ ...settings, scanType: v })}
                />
                <NativeSelect
                  label="解像度"
                  value={`${settings.resolutionW}x${settings.resolutionH}`}
                  options={resolutionOptions}
                  onChange={handleResolutionChange}
                />
                <NativeSelect
                  label="動画ビットレート"
                  value={settings.videoBitrate}
                  options={videoBitrateOptions}
                  onChange={handleVideoBitrateChange}
                />
                <NativeSelect
                  label="フレームレート"
                  value={settings.framerate}
                  options={FRAMERATES.map(f => ({ label: f, value: f }))}
                  onChange={v => onChange({ ...settings, framerate: v })}
                />
                <NativeSelect
                  label="開始時間"
                  value={String(settings.startTime)}
                  options={timeOptions(videoDuration)}
                  onChange={v => onChange({ ...settings, startTime: parseFloat(v) })}
                />
                <NativeSelect
                  label="終了時間"
                  value={String(settings.endTime)}
                  options={[{ label: '最後まで', value: '0' }, ...timeOptions(videoDuration).slice(1)]}
                  onChange={v => onChange({ ...settings, endTime: parseFloat(v) })}
                />
                <div
                  onTouchStart={handleSpeedTouchStart}
                  onTouchEnd={handleSpeedTouchEnd}
                  onMouseDown={handleSpeedTouchStart}
                  onMouseUp={handleSpeedTouchEnd}
                >
                  <NativeSelect
                    label="再生速度"
                    value={settings.speed}
                    options={SPEEDS.map(s => ({ label: `${s}×`, value: s }))}
                    onChange={v => onChange({ ...settings, speed: v })}
                  />
                </div>
              </>
            )}

            <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">オーディオ</div>
            <NativeSelect
              label="オーディオコーデック"
              value={settings.audioCodec}
              options={AUDIO_CODECS.map(c => ({ label: c, value: c, warning: IPHONE_BAD_AUDIO_CODECS.includes(c) }))}
              onChange={handleAudioCodecChange}
              warning={IPHONE_BAD_AUDIO_CODECS.includes(settings.audioCodec)}
            />
            <NativeSelect
              label="音声ビットレート"
              value={settings.audioBitrate}
              options={audioBitrateOptions}
              onChange={handleAudioBitrateChange}
            />
            <NativeSelect
              label="チャンネル数"
              value={settings.channels}
              options={CHANNELS.map(c => ({ label: c, value: c }))}
              onChange={v => onChange({ ...settings, channels: v })}
            />
            <NativeSelect
              label="周波数"
              value={settings.frequency}
              options={FREQUENCIES.map(f => ({ label: f, value: f }))}
              onChange={v => onChange({ ...settings, frequency: v })}
            />
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
                  window.alert('⚠️ 警告\n\nアスペクト比と解像度が一致しません（5px以上のずれ）。');
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
    </>
  );
};
