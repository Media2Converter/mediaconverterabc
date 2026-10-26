import { describe, expect, it, vi, afterEach } from 'vitest';
import { runFFmpegOperation } from './ffmpegOperation';

afterEach(() => vi.useRealTimers());
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