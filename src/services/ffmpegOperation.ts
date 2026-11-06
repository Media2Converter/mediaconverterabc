/** Count only observed foreground time; a suspended tab or native dialog is not worker failure. */
export class FFmpegInactivityClock {
  private elapsed = 0;
  constructor(private previous: number, private readonly timeoutMs = 600_000) {}
  activity(now: number): void { this.elapsed = 0; this.previous = now; }
  tick(now: number, visible: boolean): boolean {
    const delta = now - this.previous;
    this.previous = now;
    if (visible && delta >= 0 && delta <= 1500) this.elapsed += delta;
    return this.elapsed >= this.timeoutMs;
  }
}

/** Bound worker requests which otherwise never settle after a worker crash. */
export async function runFFmpegOperation<T>(
  operation: () => Promise<T>,
  options: { label: string; timeoutMs: number; isCancelled: () => boolean; terminate: () => void },
): Promise<T> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const started = Date.now();
  const interrupted = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      const cancelled = options.isCancelled();
      if (!cancelled && Date.now() - started < options.timeoutMs) return;
      clearInterval(timer);
      options.terminate();
      reject(new Error(cancelled
        ? 'ユーザーによりキャンセルされました'
        : `${options.label}が応答しません。\nエラーコード: ERR_WORKER_TIMEOUT（応答期限超過。FFmpegの終了コードは返されていません）`));
    }, 250);
  });
  try {
    if (options.isCancelled()) throw new Error('ユーザーによりキャンセルされました');
    return await Promise.race([operation(), interrupted]);
  } finally {
    clearInterval(timer);
  }
}