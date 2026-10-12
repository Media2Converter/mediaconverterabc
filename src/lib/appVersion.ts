export const APP_VERSION = "1.4";
const VERSION_KEY = "video-audio-converter-version";

/**
 * Shows the native Safari confirm dialog.
 * OK: saves the new version (returns true).
 * Cancel: does nothing — no state is stored, the version stays unchanged (returns false).
 */
export function confirmAppUpdate(): boolean {
  const accepted = window.confirm(
    `このサイトのバージョンをアップデートしてよろしいですか？\n\n${APP_VERSION}`,
  );
  try {
    if (accepted) {
      window.localStorage.setItem(VERSION_KEY, APP_VERSION);
    }
  } catch {
    // Storage unavailable; the dialog choice still applies for this visit.
  }
  return accepted;
}

/** On load: prompt only when the saved version differs from the current one. */
export function checkAppVersionOnLoad(): void {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(VERSION_KEY);
  } catch {
    return;
  }
  if (saved === APP_VERSION) return;
  confirmAppUpdate();
}
