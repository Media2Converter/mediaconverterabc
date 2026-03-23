import React from 'react';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  options: { label: string; action: () => void }[];
}

export const IOSActionSheet: React.FC<ActionSheetProps> = ({ open, onClose, options }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm mx-4 mb-4 ios-slide-up" onClick={e => e.stopPropagation()}>
        <div className="bg-card rounded-2xl overflow-hidden mb-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => { opt.action(); onClose(); }}
              className="w-full px-6 py-4 text-foreground text-center text-[17px] font-normal border-b border-border last:border-b-0 active:bg-accent transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full bg-card rounded-2xl px-6 py-4 text-primary text-center text-[17px] font-semibold active:bg-accent transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  );
};

export interface PickerSection {
  title?: string;
  options: { label: string; value: string; warning?: boolean }[];
}

interface PickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  sections: PickerSection[];
  selected?: string;
  header?: React.ReactNode;
}

export const IOSPickerModal: React.FC<PickerModalProps> = ({ open, onClose, onSelect, sections, selected, header }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 ios-slide-up sm:ios-scale-in" onClick={e => e.stopPropagation()}>
        <div className="bg-card rounded-2xl overflow-hidden max-h-[70vh] flex flex-col">
          {header && <div className="p-4 border-b border-border">{header}</div>}
          <div className="overflow-y-auto overscroll-contain">
            {sections.map((sec, si) => (
              <div key={si}>
                {sec.title && (
                  <div className="px-5 pt-4 pb-2 text-muted-foreground text-[13px] font-semibold uppercase tracking-wide">
                    {sec.title}
                  </div>
                )}
                {sec.options.map((opt, oi) => (
                  <button
                    key={oi}
                    onClick={() => { onSelect(opt.value); onClose(); }}
                    className={`w-full px-5 py-3.5 text-left text-[17px] border-b border-border last:border-b-0 active:bg-accent transition-colors flex items-center justify-between ${
                      opt.warning ? 'text-ios-warning' : 'text-foreground'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {selected === opt.value && <span className="text-primary text-xl">✓</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="w-full bg-card rounded-2xl px-6 py-4 mt-2 text-primary text-center text-[17px] font-semibold active:bg-accent transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  );
};

interface AlertProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export const IOSAlertDialog: React.FC<AlertProps> = ({ open, onClose, title, message }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-[280px] bg-card rounded-2xl overflow-hidden ios-scale-in" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <h3 className="text-foreground text-[17px] font-semibold mb-2">{title}</h3>
          <p className="text-muted-foreground text-[13px] leading-relaxed">{message}</p>
        </div>
        <button onClick={onClose} className="w-full py-3.5 text-primary text-[17px] font-semibold border-t border-border active:bg-accent transition-colors">
          OK
        </button>
      </div>
    </div>
  );
};

interface ProgressCircleProps {
  progress: number;
}

export const ProgressCircle: React.FC<ProgressCircleProps> = ({ progress }) => {
  const r = 50;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="8"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          className="transition-all duration-300"
        />
        <text x="60" y="60" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="22" fontWeight="600">
          {Math.round(progress)}%
        </text>
      </svg>
      <p className="text-muted-foreground text-sm">変換中...</p>
    </div>
  );
};
