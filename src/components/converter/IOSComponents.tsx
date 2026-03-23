import React from 'react';

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
