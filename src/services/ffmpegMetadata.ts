export function parseFFmpegMetadata(data: string | Uint8Array) {
  const metadata = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
  if (!Array.isArray(metadata.streams) || metadata.streams.length === 0) return null;
  return {
    duration: Number(metadata.format?.duration) || 0,
    hasAudio: metadata.streams.some((s: { codec_type?: string }) => s.codec_type === 'audio'),
  };
}