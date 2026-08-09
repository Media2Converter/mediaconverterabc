import React, { useState, useRef } from 'react';
import { convertMediaFile } from '@/services/serverConverter';
import { DetailSettingsModal } from '@/components/converter/DetailSettingsModal';
import { DEFAULT_CONVERT_SETTINGS, type ConvertSettings } from '@/constants/converterOptions';

export default function Index() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<string>('mp4');
  const [settings, setSettings] = useState<ConvertSettings>(DEFAULT_CONVERT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedFileName, setConvertedFileName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setConvertedUrl(null);
      setLogs([]);
      setProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setConvertedUrl(null);
      setLogs([]);
      setProgress(0);
    }
  };

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleStartConversion = async () => {
    if (!selectedFile) return;

    setIsConverting(true);
    setProgress(0);
    setLogs([]);
    setConvertedUrl(null);

    appendLog('変換プロセスを開始します...');

    try {
      const resultBlob = await convertMediaFile(
        selectedFile,
        settings,
        outputFormat,
        (pct) => setProgress(pct),
        (msg) => appendLog(msg)
      );

      const url = URL.createObjectURL(resultBlob);
      const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
      const outName = `repaired_${baseName}.${outputFormat.toLowerCase()}`;

      setConvertedUrl(url);
      setConvertedFileName(outName);
      appendLog('処理が成功しました。ファイルをダウンロードできます。');
    } catch (err: any) {
      console.error(err);
      appendLog(`エラーが発生しました: ${err?.message || err}`);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Media2Converter
              </h1>
              <p className="text-xs text-indigo-400 font-medium">100% ブラウザ完結 WASM & Exif 修復</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Upload Dropzone */}
        {!selectedFile && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-indigo-500/80 bg-slate-900/40 hover:bg-slate-900/70 rounded-3xl p-8 md:p-12 transition-all text-center cursor-pointer shadow-xl relative group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*,audio/*"
              className="hidden"
            />
            <div className="space-y-4 pointer-events-none">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-slate-200">動画・音声ファイルをドロップ</p>
                <p className="text-xs text-slate-400 mt-1">またはタップして選択</p>
              </div>
              <div className="inline-flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3.5 py-1.5 rounded-full">
                <span>サーバー送信ゼロ・端末内処理</span>
              </div>
            </div>
          </div>
        )}

        {/* Selected File Area */}
        {selectedFile && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 text-sm truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedFile(null);
                  setConvertedUrl(null);
                }}
                className="text-xs text-slate-400 hover:text-rose-400 px-3 py-2 rounded-xl hover:bg-slate-800 transition shrink-0"
              >
                ファイル変更
              </button>
            </div>

            {/* Quick Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-300">出力フォーマット</label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="mp4">MP4 (H.264 / AAC)</option>
                  <option value="mov">MOV (QuickTime)</option>
                  <option value="webm">WebM (VP9 / Opus)</option>
                  <option value="mp3">MP3 (Audio Only)</option>
                </select>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-300">詳細設定</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">コーデック、ビットレート、解像度等</p>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-2 rounded-xl transition"
                >
                  設定を開く
                </button>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleStartConversion}
              disabled={isConverting}
              className={`w-full bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-indigo-500/20 transition flex items-center justify-center space-x-2 ${
                isConverting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>変換・構造修復を実行</span>
            </button>

            {/* Progress & Console Log */}
            {(isConverting || logs.length > 0) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">進捗ステータス</span>
                  <span className="text-indigo-400 font-mono font-bold">{progress}%</span>
                </div>

                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-400 h-36 overflow-y-auto space-y-1">
                  {logs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Result / Download Card */}
            {convertedUrl && (
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">変換完了</h3>
                  <p className="text-xs text-slate-400 mt-1">動画構造の補修およびメタデータ処理が完了しました。</p>
                </div>
                <a
                  href={convertedUrl}
                  download={convertedFileName}
                  className="inline-flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer text-sm"
                >
                  <span>ファイルを保存</span>
                </a>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Detail Settings Sheet/Modal */}
      <DetailSettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        videoDuration={0}
        isVideo={true}
        selectedFormat={outputFormat}
      />
    </div>
  );
}

