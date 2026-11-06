import { describe, expect, it, vi, afterEach } from 'vitest';
import { FFmpegInactivityClock, runFFmpegOperation } from './ffmpegOperation';

afterEach(() => vi.useRealTimers());
describe('foreground inactivity recovery', () => {
  it('does not interrupt a slow encode at 60 seconds; bounds silence at 10 minutes', () => {
    const clock = new FFmpegInactivityClock(0);
    for (let t = 1000; t < 600_000; t += 1000) expect(clock.tick(t, true)).toBe(false);
    expect(clock.tick(600_000, true)).toBe(true);
  });
  it('excludes background time and suspended native-dialog time', () => {
    const clock = new FFmpegInactivityClock(0, 2000);
    expect(clock.tick(1000, true)).toBe(false);
    expect(clock.tick(2000, false)).toBe(false);
    expect(clock.tick(602000, true)).toBe(false);
    expect(clock.tick(603000, true)).toBe(true);
  });
  it('resets the recovery deadline when the worker responds', () => {
    const clock = new FFmpegInactivityClock(0, 2000);
    clock.tick(1000, true);
    clock.activity(1000);
    expect(clock.tick(2000, true)).toBe(false);
    expect(clock.tick(3000, true)).toBe(true);
  });
});
describe('FFmpeg worker operation recovery', () => {
  it('returns a completed operation without terminating its engine', async () => {
    const terminate = vi.fn();
    await expect(runFFmpegOperation(async () => 0, { label: '入力', timeoutMs: 1000, isCancelled: () => false, terminate })).resolves.toBe(0);
    expect(terminate).not.toHaveBeenCalled();
  });
  it('does not leave a silent worker pending forever or invent an exit code', async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    const result = runFFmpegOperation(() => new Promise(() => {}), { label: '入力', timeoutMs: 1000, isCancelled: () => false, terminate });
    const assertion = expect(result).rejects.toThrow('ERR_WORKER_TIMEOUT');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels preparation without waiting for an unresponsive worker', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const terminate = vi.fn();
    const result = runFFmpegOperation(() => new Promise(() => {}), { label: '修復', timeoutMs: 1000, isCancelled: () => cancelled, terminate });
    const assertion = expect(result).rejects.toThrow('キャンセル');
    cancelled = true;
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});