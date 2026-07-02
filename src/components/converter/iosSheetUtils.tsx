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
    stroke="#ffffff"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', background: 'transparent', opacity: 1 }}
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

    // Stage the ARIA attribute injection so Safari/VoiceOver perceives a brand-new
    // system dialog "appearing" — this transition is what triggers the iOS notification
    // ("pop") sound. We deliberately DO NOT set role/aria-modal on initial mount; we
    // inject them on the next frame so the AT sees: (no dialog) -> (dialog appeared).
    sheet.setAttribute('tabindex', '-1');

    const t1 = window.setTimeout(() => {
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
    }, 16);

    const t2 = window.setTimeout(() => {
      // Escalate to assertive live region so VO forcefully announces window contents
      sheet.setAttribute('aria-live', 'assertive');
      try {
        const focusable = sheet.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
        focusable?.focus();
      } catch {}
    }, 80);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
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
