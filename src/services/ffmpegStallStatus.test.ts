import { describe, expect, it } from 'vitest';
import { FFmpegStallTracker } from './ffmpegStallStatus';

describe('conversion stall tracking', () => {
  it('counts stalled time in whole seconds, updated every second', () => {
    const tracker = new FFmpegStallTracker(0);
    expect(tracker.getState(4999, true)).toBeNull();
    expect(tracker.getState(5000, true)?.seconds).toBe(5);
    expect(tracker.getState(6000, true)?.seconds).toBe(6);
    expect(tracker.getState(7999, true)?.seconds).toBe(7);
  });

  it('does not treat repeated warnings or unchanged progress as advancement', () => {
    const tracker = new FFmpegStallTracker(0);
    tracker.recordProgress(0.2, 1000);
    tracker.recordLog('deprecated pixel format', 5500);
    expect(tracker.recordProgress(0.2, 6000)).toBe(false);
    expect(tracker.getState(6000, true)?.seconds).toBe(5);
  });

  it('clears stalled state when real progress resumes', () => {
    const tracker = new FFmpegStallTracker(0);
    expect(tracker.getState(6000, true)?.seconds).toBe(6);
    expect(tracker.recordProgress(0.3, 6500)).toBe(true);
    expect(tracker.getState(6500, true)).toBeNull();
    expect(tracker.getState(11500, true)?.seconds).toBe(5);
  });

  it('uses log frame advances even when the progress callback is silent', () => {
    const tracker = new FFmpegStallTracker(0);
    tracker.recordProgress(1, 5500, 'frame');
    expect(tracker.getState(6000, true)).toBeNull();
  });

  it('distinguishes observed memory errors from unknown silence and clears evidence on recovery', () => {
    const tracker = new FFmpegStallTracker(0);
    const unknown = tracker.getState(5000, true)?.cause;
    tracker.recordLog('Cannot enlarge memory', 5500);
    const confirmed = tracker.getState(6000, true)?.cause;
    expect(confirmed).not.toBe(unknown);
    tracker.recordProgress(0.1, 6500);
    expect(tracker.getState(11500, true)?.cause).toBe(unknown);
  });

  it('shows 原因不明 when no cause is observed', () => {
    expect(new FFmpegStallTracker(0).getState(33000, true)?.cause).toBe('原因不明');
  });

  it('alerts once after 20 seconds of stall, and again after a new stall', () => {
    const tracker = new FFmpegStallTracker(0);
    expect(tracker.takeAlert(19999)).toBe(false);
    expect(tracker.takeAlert(20000)).toBe(true);
    expect(tracker.takeAlert(25000)).toBe(false);
    tracker.recordProgress(0.5, 26000);
    expect(tracker.takeAlert(45999)).toBe(false);
    expect(tracker.takeAlert(46000)).toBe(true);
  });
});