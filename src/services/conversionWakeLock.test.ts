import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepConversionAwake } from './conversionWakeLock';

afterEach(() => vi.useRealTimers());
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  doc.visibilityState = 'visible';
  const lock = Object.assign(new EventTarget(), { released: false, release: vi.fn(async () => {}) });
  const request = vi.fn(async () => lock);
  return { doc, lock, request };
}
describe('conversion sleep prevention', () => {
  it('requests screen protection and releases it at conversion end', async () => {
    const { doc, lock, request } = setup();
    const stop = keepConversionAwake({ document: doc, request });
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
    stop();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
  it('reacquires when returning from a hidden page', async () => {
    const { doc, lock, request } = setup();
    const stop = keepConversionAwake({ document: doc, request });
    await settle();
    doc.visibilityState = 'hidden';
    lock.released = true;
    lock.dispatchEvent(new Event('release'));
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });
  it('retries an OS-released lock while visible without duplicating a held lock', async () => {
    vi.useFakeTimers();
    const { doc, lock, request } = setup();
    const stop = keepConversionAwake({ document: doc, request });
    await settle();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(request).toHaveBeenCalledTimes(1);
    lock.released = true;
    lock.dispatchEvent(new Event('release'));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases a request that resolves after cancellation', async () => {
    const { doc, lock } = setup();
    let resolve: ((value: typeof lock) => void) | undefined;
    const stop = keepConversionAwake({ document: doc, request: () => new Promise(r => { resolve = r; }) });
    stop();
    resolve?.(lock);
    await settle();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
  it('does not block conversion if screen protection is denied or unsupported', async () => {
    const { doc } = setup();
    const stop = keepConversionAwake({ document: doc, request: vi.fn().mockRejectedValue(new Error('denied')) });
    await settle();
    stop();
    expect(() => keepConversionAwake({ document: doc })()).not.toThrow();
  });
});