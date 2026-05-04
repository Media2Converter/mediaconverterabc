import React, { useEffect, useRef } from 'react';

/**
 * Transparent up/down chevron (no background).
 */
export const ContextMenuChevron: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size * 1.25}
    viewBox="0 0 20 26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', background: 'transparent', opacity: 0.85 }}
  >
    <path d="M5 9 L10 4 L15 9" />
    <path d="M5 17 L10 22 L15 17" />
  </svg>
);

/**
 * When open:
 *  - Hide background siblings of <body> from AT (aria-hidden) so VO treats sheet as the only window.
 *  - After mount, dynamically inject aria-modal="true" / role="dialog" on the sheet element so
 *    Safari recognises the "system dialog" transition and plays the OS notification sound.
 */
export function useIOSSheetA11y(open: boolean, sheetRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    // Hide background landmarks from AT
    const hidden: { el: Element; prev: string | null }[] = [];
    const candidates = document.querySelectorAll('main, nav, header, footer, #root > *');
    candidates.forEach(el => {
      if (sheet.contains(el) || el.contains(sheet)) return;
      const prev = el.getAttribute('aria-hidden');
      el.setAttribute('aria-hidden', 'true');
      hidden.push({ el, prev });
    });

    // Defer injection of role/aria-modal so Safari treats it as a *new* dialog appearing
    // (this is the trigger for the iOS system "pop" notification sound).
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
    const t = window.setTimeout(() => {
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      // Force focus into the sheet so VoiceOver moves cursor here
      try {
        const focusable = sheet.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
        focusable?.focus();
      } catch {}
    }, 30);

    return () => {
      clearTimeout(t);
      hidden.forEach(({ el, prev }) => {
        if (prev === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', prev);
      });
    };
  }, [open, sheetRef]);
}

/**
 * Invisible (visually hidden) full-screen button placed behind the sheet.
 * VoiceOver users hear: "ポップアップを閉じる。ポップアップウインドウを閉じるには、アクティベートします。"
 * Sighted users still see / can tap the overlay normally — it sits on top visually
 * but accepts touch through pointer-events handling.
 */
export const VOOverlayCloseButton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="ポップアップを閉じる。ポップアップウインドウを閉じるには、アクティベートします。"
    className="fixed inset-0 z-[49] w-full h-full bg-transparent border-0 p-0 m-0 cursor-default"
    style={{ outline: 'none' }}
  />
);
