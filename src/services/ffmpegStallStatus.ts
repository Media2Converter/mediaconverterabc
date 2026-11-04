/** A quiet worker is not proof of a crash: report only observed evidence. */
export class FFmpegStallTracker {
  private lastAdvance: number;
  private lastResponse: number;
  private evidence: string | undefined;
  private alerted = false;
  private values = new Map<string, number>();

  constructor(started: number, private readonly thresholdMs = 5_000) {
    this.lastAdvance = started;
    this.lastResponse = started;
  }

  recordProgress(value: number, now: number, metric = 'progress'): boolean {
    this.lastResponse = now;
    if (!Number.isFinite(value) || value < 0) return false;
    const previous = this.values.get(metric) ?? 0;
    if (value <= previous) return false;
    this.values.set(metric, value);
    this.lastAdvance = now;
    this.evidence = undefined;
    this.alerted = false;
    return true;
  }

  recordLog(message: string, now: number): void {
    this.lastResponse = now;
    if (/out of memory|Cannot enlarge memory|failed to allocate memory/i.test(message)) {
      this.evidence = 'メモリの確保に失敗しました。';
    } else if (/memory access out of bounds|RuntimeError.*unreachable/i.test(message)) {
      this.evidence = 'FFmpegの実行中に内部エラーが発生しました。';
    }
  }

  getState(now: number, loaded: boolean): { seconds: number; cause: string } | null {
    const elapsed = now - this.lastAdvance;
    if (elapsed < this.thresholdMs) return null;
    const cause = this.evidence ?? (!loaded ? 'FFmpegが終了しています。' : '原因不明');
    return { seconds: Math.floor(elapsed / 1000), cause };
  }

  /** True once per stall, when it has lasted at least alertMs. */
  takeAlert(now: number, alertMs = 20_000): boolean {
    if (this.alerted || now - this.lastAdvance < alertMs) return false;
    this.alerted = true;
    return true;
  }
}