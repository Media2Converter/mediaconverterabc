export const APP_VERSION = "1.41";
const VERSION_KEY = "video-audio-converter-version";
const PENDING_KEY = "video-audio-converter-update-pending";
/** Fired whenever the pending-update state changes (cancel / OK). */
export const UPDATE_PENDING_EVENT = "app-update-pending-change";

/**
 * Shows the native Safari confirm dialog.
 * OK: saves the new version and clears the pending flag (returns true).
 * Cancel: keeps the old version and marks the update as pending,
 *         so その他のオプション can offer an アップデート item (returns false).
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
      // Not updated: remember it so the update button appears in その他のオプション.
      window.localStorage.setItem(PENDING_KEY, "1");
    }
  } catch {
    // Storage unavailable; the dialog choice still applies for this visit.
  }
  return accepted;
}

/** True when the user declined the latest version update. */
export function isUpdatePending(): boolean {
  try {
    return window.localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
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
