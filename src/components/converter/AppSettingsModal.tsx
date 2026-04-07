import React, { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface Props {
  open: boolean;
  onClose: () => void;
}

const LANGUAGES = [
  { label: '日本語(標準)', value: 'ja' },
  { label: '英語(アメリカ)', value: 'en-US' },
  { label: '英語(イギリス)', value: 'en-GB' },
  { label: '中国語', value: 'zh' },
];

const FONT_SIZES = Array.from({ length: 14 }, (_, i) => {
  const pt = 12 + i * 2;
  return { label: `${pt}ポイント`, value: String(pt) };
});

const BG_COLORS = [
  { label: '黒', value: 'black' },
  { label: '白', value: 'white' },
];

const BTN_COLORS = [
  { label: '黒', value: 'black' },
  { label: '赤', value: 'red' },
  { label: 'オレンジ', value: 'orange' },
  { label: 'ピンク', value: 'pink' },
  { label: '黄', value: 'yellow' },
  { label: '緑', value: 'green' },
  { label: '青', value: 'blue' },
  { label: '白', value: 'white' },
];

const TEXT_COLORS = [
  { label: '黒', value: 'black' },
  { label: '白', value: 'white' },
  { label: '自動', value: 'auto' },
];

const ContextMenuChevron: React.FC = () => (
  <span className="flex flex-col items-center justify-center leading-none text-muted-foreground" style={{ fontSize: '10px', lineHeight: '8px', gap: '1px' }}>
    <span>▲</span>
    <span>▼</span>
  </span>
);

const SettingsRow: React.FC<{
  label: string;
  displayValue: string;
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (v: string) => void;
}> = ({ label, displayValue, options, selected, onSelect }) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPicker = () => {
    delayRef.current = setTimeout(() => {
      selectRef.current?.focus();
      selectRef.current?.click();
    }, 1000);
  };

  useEffect(() => {
    return () => { if (delayRef.current) clearTimeout(delayRef.current); };
  }, []);

  return (
    <div className="relative w-full">
      <button
        onClick={openPicker}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border active:bg-accent transition-colors"
      >
        <div className="flex flex-col items-start">
          <span className="text-foreground text-[20px]">{label}</span>
          <span className="text-muted-foreground text-[14px]">{displayValue}</span>
        </div>
        <ContextMenuChevron />
      </button>
      <select
        ref={selectRef}
        value={selected}
        onChange={e => onSelect(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ fontSize: '20px' }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
};

function colorToCss(color: string): string {
  const map: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: 'hsl(0, 80%, 50%)',
    orange: 'hsl(30, 90%, 50%)', pink: 'hsl(330, 80%, 60%)',
    yellow: 'hsl(50, 90%, 50%)', green: 'hsl(130, 60%, 45%)',
    blue: 'hsl(210, 80%, 55%)',
  };
  return map[color] || color;
}

function getAutoTextColor(bgColor: string): string {
  if (bgColor === 'white' || bgColor === 'yellow') return '#000000';
  return '#ffffff';
}

export const AppSettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const isMobile = useIsMobile();
  const [language, setLanguage] = useState('ja');
  const [fontSize, setFontSize] = useState('20');
  const [bgColor, setBgColor] = useState('black');
  const [btnColor, setBtnColor] = useState('red');
  const [textColor, setTextColor] = useState('auto');

  const [pending, setPending] = useState({ language: 'ja', fontSize: '20', bgColor: 'black', btnColor: 'red', textColor: 'auto' });

  useEffect(() => {
    if (open) {
      setPending({ language, fontSize, bgColor, btnColor, textColor });
    }
  }, [open]);

  const handleComplete = () => {
    setLanguage(pending.language);
    setFontSize(pending.fontSize);
    setBgColor(pending.bgColor);
    setBtnColor(pending.btnColor);
    setTextColor(pending.textColor);

    const root = document.documentElement;
    const bgCss = colorToCss(pending.bgColor);
    const btnCss = colorToCss(pending.btnColor);
    const txtColor = pending.textColor === 'auto' ? getAutoTextColor(pending.bgColor) : colorToCss(pending.textColor);

    root.style.setProperty('--app-font-size', `${pending.fontSize}px`);
    root.style.setProperty('--app-bg-color', bgCss);
    root.style.setProperty('--app-btn-color', btnCss);
    root.style.setProperty('--app-text-color', txtColor);

    onClose();
  };

  const langDisplay = LANGUAGES.find(l => l.value === pending.language)?.label || '日本語(標準)';
  const bgDisplay = BG_COLORS.find(c => c.value === pending.bgColor)?.label || '黒';
  const btnDisplay = BTN_COLORS.find(c => c.value === pending.btnColor)?.label || '赤';
  const txtDisplay = TEXT_COLORS.find(c => c.value === pending.textColor)?.label || '自動';

  const [voAnnouncement, setVoAnnouncement] = useState('');
  useEffect(() => {
    if (open) {
      setVoAnnouncement('');
      setTimeout(() => setVoAnnouncement('設定'), 50);
    } else {
      setVoAnnouncement('');
    }
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const content = (
    <>
      <div aria-live="assertive" className="sr-only" role="status">{voAnnouncement}</div>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0" style={{ minHeight: '52px' }}>
        <button onClick={onClose} className="text-white text-[20px] font-normal active:opacity-60" aria-label="キャンセル">
          キャンセル
        </button>
        <h2 className="text-foreground text-[20px] font-semibold">設定</h2>
        <button onClick={handleComplete} className="text-white text-[20px] font-semibold active:opacity-60" aria-label="完了">
          完了
        </button>
      </div>

      <div className="overflow-y-auto overscroll-contain flex-1">
        <SettingsRow label="言語" displayValue={langDisplay} options={LANGUAGES} selected={pending.language} onSelect={v => setPending(p => ({ ...p, language: v }))} />
        <SettingsRow label="文字ポイント数" displayValue={`${pending.fontSize}pt`} options={FONT_SIZES} selected={pending.fontSize} onSelect={v => setPending(p => ({ ...p, fontSize: v }))} />
        <SettingsRow label="背景色" displayValue={bgDisplay} options={BG_COLORS} selected={pending.bgColor} onSelect={v => setPending(p => ({ ...p, bgColor: v }))} />
        <SettingsRow label="ボタンの背景色" displayValue={btnDisplay} options={BTN_COLORS} selected={pending.btnColor} onSelect={v => setPending(p => ({ ...p, btnColor: v }))} />
        <SettingsRow label="テキスト色" displayValue={txtDisplay} options={TEXT_COLORS} selected={pending.textColor} onSelect={v => setPending(p => ({ ...p, textColor: v }))} />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="設定">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          role="button"
          aria-label="ポップアップウインドウを閉じる。ポップアップウインドウを閉じるにはアクティベートします。"
          tabIndex={0}
          onClick={onClose}
          onKeyDown={e => e.key === 'Enter' && onClose()}
        />
        <div className="relative mt-auto flex flex-col ios-slide-up" style={{
          height: '75vh',
          background: 'rgba(28, 28, 30, 0.92)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px',
        }}>
          <div className="flex justify-center pt-2 pb-0">
            <div className="w-9 h-1 rounded-full bg-muted-foreground/40" />
          </div>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="設定">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        role="button"
        aria-label="ポップアップウインドウを閉じる。ポップアップウインドウを閉じるにはアクティベートします。"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={e => e.key === 'Enter' && onClose()}
      />
      <div className="relative flex flex-col ios-scale-in" style={{
        width: 'min(520px, 92vw)',
        maxHeight: '75vh',
        background: 'rgba(28, 28, 30, 0.92)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        borderRadius: '14px',
        overflow: 'hidden',
      }}>
        {content}
      </div>
    </div>
  );
};
