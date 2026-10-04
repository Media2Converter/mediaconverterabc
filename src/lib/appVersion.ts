export const APP_VERSION = "1.13";
const VERSION_KEY = "video-audio-converter-version";
const PENDING_KEY = "video-audio-converter-update-pending";
export const UPDATE_PENDING_EVENT = "app-update-pending-changed";

export function isUpdatePending(): boolean {
  try {
    return window.localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Shows the native Safari confirm dialog.
 * OK: saves the new version and clears the pending flag (returns true).
 * Cancel: keeps the old version and marks the update as pending (returns false).
 */
export function confirmAppUpdate(): boolean {
  const accepted = window.confirm(
    `このサイトのバージョンをアップデートしてよろしいですか？\n\n${APP_VERSION}`,
  );
  try {
    if (accepted) {
      window.localStorage.setItem(VERSION_KEY, APP_VERSION);
      window.localStorage.removeItem(PENDING_KEY);
    } else {
      window.localStorage.setItem(PENDING_KEY, "1");
    }
  } catch {
    // Storage unavailable; still treat the choice as made for this visit.
  }
  window.dispatchEvent(new Event(UPDATE_PENDING_EVENT));
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
  // Cancelled before: stay on the previous state; update only via the menu button.
  if (isUpdatePending()) return;
  confirmAppUpdate();
}
