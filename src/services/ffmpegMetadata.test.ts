import { expect, it } from 'vitest';
import { parseFFmpegMetadata } from './ffmpegMetadata';
it('does not schedule audio conversion for a silent video', () => {
  expect(parseFFmpegMetadata('{"streams":[{"codec_type":"video"}],"format":{"duration":"3.000000"}}')).toEqual({ duration: 3, hasAudio: false });
});
it('preserves audio for a video containing an audio stream', () => {
  expect(parseFFmpegMetadata('{"streams":[{"codec_type":"video"},{"codec_type":"audio"}],"format":{"duration":"3"}}')).toEqual({ duration: 3, hasAudio: true });
});