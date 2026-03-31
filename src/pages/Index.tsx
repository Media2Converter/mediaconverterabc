import React, { useState, useRef, useCallback } from 'react';
import { ProgressCircle } from '@/components/converter/IOSComponents';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import {
  VIDEO_FORMATS, AUDIO_FORMATS,
  FORMAT_EXT, FORMAT_MIME, isVideoFormat,
  isCodecCompatible, FORMAT_AUDIO_CODEC_COMPAT, FORMAT_VIDEO_CODEC_COMPAT,
  type ConvertSettings, defaultSettings,
} from '@/constants/converterOptions';
import { convertWithShotstack } from '@/services/shotstackApi';

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
  const [statusMessage, setStatusMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        } else if (f.type.startsWith('audio/')) {
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
    }
  };

  const isVideo = files.some(f => f.type.startsWith('video/'));

  const handleFormatSelect = (value: string) => {
    if (!value) return;
    setSelectedFormat(value);
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

    // Pre-conversion compatibility checks
    const errors: string[] = [];
    if (settings.audioCodec !== 'copy' && settings.audioCodec !== 'none' &&
        !isCodecCompatible(selectedFormat, settings.audioCodec, 'audio')) {
      const validCodecs = FORMAT_AUDIO_CODEC_COMPAT[selectedFormat]?.join(', ') || '不明';
      errors.push(`⚠️ オーディオコーデックの互換性エラー\n\n現在の状態：オーディオコーデック「${settings.audioCodec}」は「${selectedFormat}」形式に対応していません。\n\n解決方法：詳細設定でオーディオコーデックを以下のいずれかに変更してください：${validCodecs}`);
    }
    if (isVideoFormat(selectedFormat) && settings.videoCodec !== 'copy' &&
        !isCodecCompatible(selectedFormat, settings.videoCodec, 'video')) {
      const validCodecs = FORMAT_VIDEO_CODEC_COMPAT[selectedFormat]?.join(', ') || '不明';
      errors.push(`⚠️ ビデオコーデックの互換性エラー\n\n現在の状態：ビデオコーデック「${settings.videoCodec}」は「${selectedFormat}」形式に対応していません。\n\n解決方法：詳細設定でビデオコーデックを以下のいずれかに変更してください：${validCodecs}`);
    }
    if (errors.length > 0) {
      window.alert(errors.join('\n\n─────────────\n\n'));
      return;
    }

    setConverting(true);
    setProgress(0);
    setConvertedUrl(null);
    setStatusMessage('アップロード準備中...');

    try {
      const inputFile = files[0];
      const ext = FORMAT_EXT[selectedFormat] || 'mp4';

      const downloadUrl = await convertWithShotstack(inputFile, (pct) => {
        setProgress(pct);
        if (pct < 30) setStatusMessage('ファイルをアップロード中...');
        else if (pct < 35) setStatusMessage('ソースファイルを処理中...');
        else if (pct < 50) setStatusMessage('レンダリングを開始中...');
        else if (pct < 85) setStatusMessage('変換中...');
        else if (pct < 100) setStatusMessage('ファイルを保存中...');
        else setStatusMessage('完了！');
      });

      setConvertedUrl(downloadUrl);
      setConvertedFilename(`converted.${ext}`);
      setProgress(100);
      setStatusMessage('変換完了！ダウンロードできます');
    } catch (err: any) {
      console.error('Shotstack conversion error:', err);
      const msg = err?.message || '不明なエラー';
      window.alert(`⚠️ 変換エラー\n\n現在の状態：${msg}\n\n解決方法：\n1. ファイルが破損していないか確認してください\n2. 別の出力形式を選択してみてください\n3. インターネット接続を確認してください`);
    } finally {
      setConverting(false);
    }
  };

  const handleDownload = () => {
    if (!convertedUrl) return;
    const a = document.createElement('a');
    a.href = convertedUrl;
    a.download = convertedFilename;
    a.target = '_blank';
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
              value={selectedFormat}
              onChange={e => handleFormatSelect(e.target.value)}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-2xl text-[15px] font-semibold text-center appearance-none cursor-pointer"
            >
              <option value="" disabled>出力形式</option>
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

      {converting && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <ProgressCircle progress={progress} />
          <p className="text-muted-foreground text-sm">{statusMessage}</p>
        </div>
      )}

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
