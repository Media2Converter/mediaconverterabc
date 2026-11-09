import { describe, expect, it } from 'vitest';
import { buildSampleRepairArgs, selectSampleMedia, sampleSpecsMatch, sampleReferenceCompatible } from './sampleRepair';

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
  it('preserves timestamps and packets instead of dropping or regenerating them', () => {
    const args = buildSampleRepairArgs('input.mp4', 'output.mp4');
    expect(args).toContain('-copyts');
    expect(args.slice(args.indexOf('-avoid_negative_ts'), args.indexOf('-avoid_negative_ts') + 2)).toEqual(['-avoid_negative_ts', 'disabled']);
    expect(args.join(' ')).not.toMatch(/discardcorrupt|genpts|igndts|make_zero/);
  });
  it('rebuilds MP4 headers and preserves metadata', () => {
    const args = buildSampleRepairArgs('input.mp4', 'output.mp4');
    expect(args.slice(args.indexOf('-movflags'), args.indexOf('-movflags') + 2)).toEqual(['-movflags', '+faststart']);
    expect(args.slice(args.indexOf('-map_metadata'), args.indexOf('-map_metadata') + 2)).toEqual(['-map_metadata', '0']);
    expect(buildSampleRepairArgs('input.wav', 'output.wav')).not.toContain('-movflags');
  });
  it('rejects a changed resolution rather than downloading it as preserved', () => {
    const input = JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 }] });
    expect(sampleSpecsMatch(input, input)).toBe(true);
    expect(sampleSpecsMatch(input, JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }] }))).toBe(false);
  });
  it('rejects changed audio codecs, sample rates or channel counts', () => {
    const stream = { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 };
    const input = JSON.stringify({ streams: [stream] });
    expect(sampleSpecsMatch(input, input)).toBe(true);
    for (const change of [{ codec_name: 'mp3' }, { sample_rate: '44100' }, { channels: 1 }]) {
      expect(sampleSpecsMatch(input, JSON.stringify({ streams: [{ ...stream, ...change }] }))).toBe(false);
    }
    expect(sampleSpecsMatch(input, JSON.stringify({ streams: [] }))).toBe(false);
  });
  it('allows a separate matching sample without copying its duration or metadata', () => {
    const stream = { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p' };
    const input = JSON.stringify({ streams: [{ ...stream, duration: '30' }], format: { tags: { title: 'input' } } });
    const sample = JSON.stringify({ streams: [{ ...stream, duration: '5' }], format: { tags: { title: 'sample' } } });
    expect(sampleReferenceCompatible(input, sample)).toBe(true);
  });
  it('rejects a sample with different video specifications', () => {
    const stream = { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, profile: 'High', pix_fmt: 'yuv420p' };
    const input = JSON.stringify({ streams: [stream] });
    for (const change of [{ width: 1280 }, { height: 720 }, { codec_name: 'hevc' }, { profile: 'Main' }, { pix_fmt: 'yuv422p' }]) {
      expect(sampleReferenceCompatible(input, JSON.stringify({ streams: [{ ...stream, ...change }] }))).toBe(false);
    }
  });
  it('rejects a sample with different audio specifications or missing tracks', () => {
    const stream = { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 };
    const input = JSON.stringify({ streams: [stream] });
    expect(sampleReferenceCompatible(input, input)).toBe(true);
    for (const change of [{ codec_name: 'mp3' }, { sample_rate: '44100' }, { channels: 1 }]) {
      expect(sampleReferenceCompatible(input, JSON.stringify({ streams: [{ ...stream, ...change }] }))).toBe(false);
    }
    expect(sampleReferenceCompatible(input, '{"streams":[]}')).toBe(false);
  });
  it('refuses unreadable or incomplete reference headers', () => {
    expect(sampleReferenceCompatible('invalid', '{}')).toBe(false);
    expect(sampleReferenceCompatible('{"streams":[]}', '{"streams":[]}')).toBe(false);
    const incomplete = JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'h264' }] });
    expect(sampleReferenceCompatible(incomplete, incomplete)).toBe(false);
  });
});