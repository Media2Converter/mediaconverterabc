interface ScreenLock {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void, options?: { once: boolean }): void;
}

interface WakeLockEnvironment {
  request?: () => Promise<ScreenLock>;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

/** Screen Wake Lock is best-effort: iOS can still suspend a background tab. */
export function keepConversionAwake(environment: WakeLockEnvironment = {
  request: navigator.wakeLock ? () => navigator.wakeLock.request('screen') : undefined,
  document,
}): () => void {
  let active = true;
  let pending = false;
  let lock: ScreenLock | undefined;
  const release = (value: ScreenLock) => { void value.release().catch(() => {}); };
  const acquire = async () => {
    if (!active || pending || !environment.request || environment.document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    pending = true;
    try {
      const acquired = await environment.request();
      if (!active || environment.document.visibilityState !== 'visible') {
        release(acquired);
        return;
      }
      lock = acquired;
      acquired.addEventListener('release', () => {
        if (lock === acquired) lock = undefined;
      }, { once: true });
    } catch {
      // Unsupported / low battery / permission denied must never block conversion.
    } finally {
      pending = false;
    }
  };
  const onVisibility = () => { void acquire(); };
  environment.document.addEventListener('visibilitychange', onVisibility);
  // Retry OS-released locks while visible without audio, video, or worker pings.
  const timer = setInterval(onVisibility, 15_000);
  onVisibility();
  return () => {
    active = false;
    clearInterval(timer);
    environment.document.removeEventListener('visibilitychange', onVisibility);
    if (lock) release(lock);
    lock = undefined;
  };
}