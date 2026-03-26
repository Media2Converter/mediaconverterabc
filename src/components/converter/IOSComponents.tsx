import React from 'react';

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  options: { label: string; action: () => void; destructive?: boolean }[];
}

export const IOSActionSheet: React.FC<ActionSheetProps> = ({ open, onClose, options }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-sm mx-2 mb-2 ios-slide-up" onClick={e => e.stopPropagation()}>
        <div className="bg-popover/95 backdrop-blur-xl rounded-[14px] overflow-hidden mb-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => { opt.action(); onClose(); }}
              className={`w-full px-4 py-[11px] text-center text-[20px] font-normal border-b border-border/50 last:border-b-0 active:bg-accent/60 transition-colors ${
                opt.destructive ? 'text-destructive' : 'text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full bg-popover/95 backdrop-blur-xl rounded-[14px] px-4 py-[11px] text-primary text-center text-[20px] font-semibold active:bg-accent/60 transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  );
};

export interface PickerSection {
  title?: string;
  options: { label: string; value: string; warning?: boolean; dangerLabel?: string; colorClass?: string }[];
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
      <div
        className="relative ios-scale-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(340px, 88vw)',
          background: 'rgba(50, 50, 52, 0.9)',
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
          borderRadius: '14px',
          overflow: 'hidden',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {header && (
          <div className="px-4 py-3" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.15)' }}>
            {header}
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain">
          {sections.map((sec, si) => (
            <div key={si}>
              {sec.title && (
                <div
                  className="px-4 pt-3 pb-1.5 text-[13px] font-medium uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  {sec.title}
                </div>
              )}
              {sec.options.map((opt, oi) => {
                const isLast = oi === sec.options.length - 1 && si === sections.length - 1;
                return (
                  <button
                    key={oi}
                    onClick={() => { onSelect(opt.value); onClose(); }}
                    className={`w-full px-4 py-[13px] text-left text-[17px] flex items-center justify-between transition-colors ${opt.colorClass || ''}`}
                    style={{
                      borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.12)',
                      color: opt.colorClass ? undefined : '#fff',
                      background: 'transparent',
                    }}
                    onMouseDown={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseUp={e => (e.currentTarget.style.background = 'transparent')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onTouchStart={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onTouchEnd={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>
                      {opt.label}
                      {opt.dangerLabel && (
                        <span className="text-destructive text-[13px] ml-2">⚠️ {opt.dangerLabel}</span>
                      )}
                    </span>
                    {selected === opt.value && (
                      <span style={{ color: '#fff', fontSize: '15px' }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative w-[270px] bg-popover/95 backdrop-blur-xl rounded-[14px] overflow-hidden ios-scale-in" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-5 pb-4 text-center">
          <h3 className="text-foreground text-[17px] font-semibold mb-1">{title}</h3>
          <p className="text-muted-foreground text-[13px] leading-[18px] whitespace-pre-line">{message}</p>
        </div>
        <div className="border-t border-border/50">
          <button onClick={onClose} className="w-full py-[11px] text-primary text-[17px] font-semibold active:bg-accent/60 transition-colors">
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export const IOSConfirmDialog: React.FC<ConfirmProps> = ({ open, onClose, onConfirm, title, message, confirmLabel = '削除', cancelLabel = 'キャンセル', destructive = true }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center ios-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative w-[270px] bg-popover/95 backdrop-blur-xl rounded-[14px] overflow-hidden ios-scale-in" onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-5 pb-4 text-center">
          <h3 className="text-foreground text-[17px] font-semibold mb-1">{title}</h3>
          <p className="text-muted-foreground text-[13px] leading-[18px] whitespace-pre-line">{message}</p>
        </div>
        <div className="border-t border-border/50 flex">
          <button onClick={onClose} className="flex-1 py-[11px] text-primary text-[17px] font-normal border-r border-border/50 active:bg-accent/60 transition-colors">
            {cancelLabel}
          </button>
          <button onClick={() => { onConfirm(); onClose(); }} className={`flex-1 py-[11px] text-[17px] font-semibold active:bg-accent/60 transition-colors ${destructive ? 'text-destructive' : 'text-primary'}`}>
            {confirmLabel}
          </button>
        </div>
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
