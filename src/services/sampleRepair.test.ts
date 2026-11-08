import { describe, expect, it } from 'vitest';
import { buildSampleRepairArgs, selectSampleMedia } from './sampleRepair';

describe('sample repair rules', () => {
  it('accepts exactly one media file, not multiple files', () => {
    const file = new File(['media'], 'sample.mp4', { type: 'video/mp4' });
    expect(selectSampleMedia([file])).toBe(file);
    expect(selectSampleMedia([file, file])).toBeNull();
  });
  it('accepts audio as well as video', () => {
    const file = new File(['audio'], 'sample.wav', { type: 'audio/wav' });
    expect(selectSampleMedia([file])).toBe(file);
  });
  it('rejects non-media even when it has a misleading extension', () => {
    expect(selectSampleMedia([new File(['text'], 'sample.mp4', { type: 'text/plain' })])).toBeNull();
    expect(selectSampleMedia([new File(['text'], 'sample.txt')])).toBeNull();
  });
  it('accepts recognized media when Safari does not provide its MIME type', () => {
    const file = new File(['media'], 'sample.MOV');
    expect(selectSampleMedia([file])).toBe(file);
  });
  it('repairs using -c copy without encoding or filters', () => {
    const args = buildSampleRepairArgs('/sample/input.mp4', 'repaired.mp4');
    expect(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2)).toEqual(['-c', 'copy']);
    expect(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2)).toEqual(['-i', '/sample/input.mp4']);
    expect(args.at(-1)).toBe('repaired.mp4');
    expect(args.some(arg => ['-vf', '-af', '-c:v', '-c:a'].includes(arg))).toBe(false);
  });
});