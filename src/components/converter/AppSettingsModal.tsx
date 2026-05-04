import React, { useState, useEffect, useRef } from 'react';
import { Drawer as VaulDrawer } from 'vaul';
import { useIsMobile } from '@/hooks/use-mobile';
import { ContextMenuChevron, useIOSSheetA11y, VOOverlayCloseButton } from './iosSheetUtils';

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

const STORAGE_KEY = 'app-settings-v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { language: 'ja', fontSize: '20', bgColor: 'black', btnColor: 'red', textColor: 'auto' };
}

function applySettings(s: { language: string; fontSize: string; bgColor: string; btnColor: string; textColor: string }) {
  const root = document.documentElement;
  const bgCss = colorToCss(s.bgColor);
  const btnCss = colorToCss(s.btnColor);
  const txtColor = s.textColor === 'auto' ? getAutoTextColor(s.bgColor) : colorToCss(s.textColor);
  root.style.setProperty('--app-font-size', `${s.fontSize}px`);
  root.style.setProperty('--app-bg-color', bgCss);
  root.style.setProperty('--app-btn-color', btnCss);
  root.style.setProperty('--app-text-color', txtColor);
  root.lang = s.language;
  // Map global tokens so existing classes pick them up
  // Background
  if (s.bgColor === 'white') {
    root.style.setProperty('--background', '0 0% 100%');
    root.style.setProperty('--foreground', '0 0% 0%');
    root.style.setProperty('--card', '0 0% 96%');
    root.style.setProperty('--border', '0 0% 80%');
    root.style.setProperty('--muted-foreground', '0 0% 35%');
  } else {
    root.style.removeProperty('--background');
    root.style.removeProperty('--foreground');
    root.style.removeProperty('--card');
    root.style.removeProperty('--border');
    root.style.removeProperty('--muted-foreground');
  }
  // Primary (button) color hue
  const btnHsl: Record<string, string> = {
    black: '0 0% 12%', red: '0 80% 50%', orange: '30 90% 50%',
    pink: '330 80% 60%', yellow: '50 90% 50%', green: '130 60% 45%',
    blue: '210 80% 55%', white: '0 0% 100%',
  };
  if (btnHsl[s.btnColor]) {
    root.style.setProperty('--primary', btnHsl[s.btnColor]);
    root.style.setProperty('--primary-foreground', (s.btnColor === 'white' || s.btnColor === 'yellow') ? '0 0% 0%' : '0 0% 100%');
  }
  document.body.style.fontSize = `${s.fontSize}px`;
}

// Apply on module load (page reload)
if (typeof window !== 'undefined') {
  try { applySettings(loadSettings()); } catch {}
}

export const AppSettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const isMobile = useIsMobile();
  const initial = loadSettings();
  const [language, setLanguage] = useState(initial.language);
  const [fontSize, setFontSize] = useState(initial.fontSize);
  const [bgColor, setBgColor] = useState(initial.bgColor);
  const [btnColor, setBtnColor] = useState(initial.btnColor);
  const [textColor, setTextColor] = useState(initial.textColor);

  const [pending, setPending] = useState({ language, fontSize, bgColor, btnColor, textColor });

  useEffect(() => {
    if (open) {
      setPending({ language, fontSize, bgColor, btnColor, textColor });
    }
  }, [open]);

  const handleComplete = () => {
    const next = { ...pending };
    setLanguage(next.language);
    setFontSize(next.fontSize);
    setBgColor(next.bgColor);
    setBtnColor(next.btnColor);
    setTextColor(next.textColor);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    applySettings(next);
    onClose();
    // Reload to ensure all components pick up new settings cleanly
    setTimeout(() => window.location.reload(), 100);
  };

  const langDisplay = LANGUAGES.find(l => l.value === pending.language)?.label || '日本語(標準)';
  const bgDisplay = BG_COLORS.find(c => c.value === pending.bgColor)?.label || '黒';
  const btnDisplay = BTN_COLORS.find(c => c.value === pending.btnColor)?.label || '赤';
  const txtDisplay = TEXT_COLORS.find(c => c.value === pending.textColor)?.label || '自動';

  const [voAnnouncement, setVoAnnouncement] = useState('');
  useEffect(() => {
    if (open) {
      setVoAnnouncement('');
      setTimeout(() => setVoAnnouncement('設定 ダイアログ'), 50);
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

  const sheetRef = useRef<HTMLDivElement>(null);
  useIOSSheetA11y(open, sheetRef);

  if (!open) return null;

  const content = (
    <>
      <div aria-live="assertive" className="sr-only" role="status">{voAnnouncement}</div>
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 relative" style={{ minHeight: '60px' }}>
        <button
          onClick={onClose}
          aria-label="キャンセル"
          className="flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
          style={{ width: 36, height: 36, background: 'rgba(80,80,84,0.9)', color: '#fff', fontSize: 18, fontWeight: 600 }}
        >
          ✕
        </button>
        <h2 className="absolute left-1/2 -translate-x-1/2 text-foreground text-[20px] font-semibold pointer-events-none">設定</h2>
        <button
          onClick={handleComplete}
          aria-label="完了"
          className="flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
          style={{ width: 36, height: 36, background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontSize: 18, fontWeight: 700 }}
        >
          ✓
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


  return (
    <VaulDrawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <VOOverlayCloseButton onClose={onClose} />
        <VaulDrawer.Content
          ref={sheetRef}
          aria-label="設定 ダイアログ"
          // @ts-ignore
          popover="auto"
          className="fixed bottom-0 left-0 right-0 z-50 flex flex-col outline-none w-full"
          style={{
            height: '80vh',
            background: '#1C1C1E',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
          }}
        >
          <VaulDrawer.Title className="sr-only">設定</VaulDrawer.Title>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
};
