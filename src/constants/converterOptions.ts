export const VIDEO_FORMATS = ['MP4', 'M4V', 'MOV', '3G2', '3GP', 'AVI'];
export const AUDIO_FORMATS = ['OPUS', 'EAC3', 'AC3', 'AAC', 'MP3', 'WAV', 'OGG', 'AIFF', 'RAW', 'AMR_NB', 'AMR_WB', 'FLAC'];

export const VIDEO_CODECS = ['AV1', 'H.265', 'H.264', 'H.263', 'H.261', 'H.320', 'MPEG-4', 'DIVX', 'MJPEG'];
export const AUDIO_CODECS = [
  'OPUS', 'EAC3', 'AC3', 'AAC', 'AAC_HE_V1', 'AAC_HE_V2',
  'MP3', 'WAV', 'OGG', 'AIFF', 'RAW',
  'AMR_NB', 'AMR_WB',
  'PCM_U8', 'PCM_S16LE', 'PCM_S32LE', 'PCM_G.711', 'LPCM',
  'ALAC', 'FLAC',
  'ADPCM_G721', 'ADPCM_G723', 'ADPCM_G726', 'ADPCM_G727', 'ADPCM_G728', 'ADPCM_OKI', 'ADPCM_IMA', 'ADPCM_MS',
];

export const ASPECT_RATIOS = ['自由', '16:9', '22:9', '11:9', '11:8', '9:7', '4:3', '1:1', '3:4', '7:9', '8:11', '9:11', '9:22', '9:16'];

export const SCAN_TYPES = ['プログレッシブ方式', 'インターレース方式'];

export interface ResolutionOption {
  label: string;
  w: number;
  h: number;
  desc?: string;
  tag?: string;
}

export const RESOLUTIONS: ResolutionOption[] = [
  { label: '36×28', w: 36, h: 28, desc: '圧縮用・非常に最低解像度' },
  { label: '72×56', w: 72, h: 56, desc: '超最低解像度' },
  { label: '112×64', w: 112, h: 64, desc: '最低解像度' },
  { label: '128×96', w: 128, h: 96, tag: 'SQCIF', desc: '低解像度' },
  { label: '176×144', w: 176, h: 144, tag: 'QCIF' },
  { label: '192×108', w: 192, h: 108 },
  { label: '256×144', w: 256, h: 144, tag: '144p' },
  { label: '320×240', w: 320, h: 240, tag: '240p' },
  { label: '352×288', w: 352, h: 288, tag: 'CIF' },
  { label: '384×384', w: 384, h: 384 },
  { label: '448×336', w: 448, h: 336 },
  { label: '456×344', w: 456, h: 344 },
  { label: '528×384', w: 528, h: 384, tag: 'DCIF' },
  { label: '608×456', w: 608, h: 456 },
  { label: '640×360', w: 640, h: 360, tag: '360p' },
  { label: '640×480', w: 640, h: 480, tag: '480p VGA' },
  { label: '704×288', w: 704, h: 288, tag: '2CIF' },
  { label: '704×576', w: 704, h: 576, tag: '4CIF' },
  { label: '832×624', w: 832, h: 624 },
  { label: '960×720', w: 960, h: 720 },
  { label: '1008×752', w: 1008, h: 752 },
  { label: '1280×720', w: 1280, h: 720, tag: '720p HD' },
  { label: '1408×1152', w: 1408, h: 1152, tag: '16CIF' },
  { label: '1536×1152', w: 1536, h: 1152 },
  { label: '1920×1080', w: 1920, h: 1080, tag: '1080p フルHD' },
  { label: '2048×1536', w: 2048, h: 1536 },
  { label: '2432×1824', w: 2432, h: 1824 },
  { label: '2560×1440', w: 2560, h: 1440, tag: '1440p 2K QHD' },
  { label: '2688×1520', w: 2688, h: 1520, tag: '1520p 2.7K QHD' },
  { label: '2816×2304', w: 2816, h: 2304, tag: '64CIF' },
  { label: '3648×2736', w: 3648, h: 2736 },
  { label: '3840×2160', w: 3840, h: 2160, tag: '2160p 4K WQHD' },
  { label: '5120×2880', w: 5120, h: 2880, tag: '2880p 5K UHD' },
  { label: '5632×4608', w: 5632, h: 4608, tag: '256CIF' },
  { label: '5760×3240', w: 5760, h: 3240, tag: '3240p 6K UHD' },
  { label: '6144×3456', w: 6144, h: 3456, tag: '3456p 6K UHD' },
  { label: '4608×4608', w: 4608, h: 4608 },
  { label: '7680×4320', w: 7680, h: 4320, tag: '4320p 8K UHD' },
];

export const VIDEO_BITRATES = [
  '8KBPS', '16KBPS', '24KBPS', '32KBPS', '48KBPS', '56KBPS', '64KBPS', '96KBPS',
  '128KBPS', '192KBPS', '256KBPS', '288KBPS', '304KBPS', '320KBPS', '384KBPS',
  '416KBPS', '432KBPS', '480KBPS', '512KBPS', '576KBPS', '608KBPS', '640KBPS',
  '768KBPS', '896KBPS', '1008KBPS', '1024KBPS', '1216KBPS', '1536KBPS', '1824KBPS',
  '2304KBPS', '2432KBPS', '2560KBPS', '3072KBPS', '3648KBPS', '4032KBPS', '4480KBPS',
  '4864KBPS', '5120KBPS', '6144KBPS', '7168KBPS', '8064KBPS', '8192KBPS', '9216KBPS',
  '9728KBPS', '10240KBPS', '11008KBPS', '14592KBPS', '15360KBPS', '18240KBPS', '20000KBPS',
];

export const AUDIO_BITRATES = [
  '8KBPS', '16KBPS', '24KBPS', '32KBPS', '48KBPS', '56KBPS', '64KBPS', '96KBPS',
  '128KBPS', '192KBPS', '256KBPS', '288KBPS', '304KBPS', '320KBPS',
];

// AMR NB: fixed bitrates (kbps)
export const AMR_NB_BITRATES = [
  '4.75KBPS', '5.15KBPS', '5.90KBPS', '6.70KBPS',
  '7.40KBPS', '7.95KBPS', '10.2KBPS', '12.2KBPS',
];
// AMR WB: fixed bitrates (kbps)
export const AMR_WB_BITRATES = [
  '6.60KBPS', '8.85KBPS', '12.65KBPS', '14.25KBPS', '15.85KBPS',
  '18.25KBPS', '19.85KBPS', '23.05KBPS', '23.85KBPS',
];
// AMR NB: only 8000Hz
export const AMR_NB_FREQUENCIES = ['8000Hz'];
// AMR WB: only 16000Hz
export const AMR_WB_FREQUENCIES = ['16000Hz'];

// ADPCM fixed bitrates per codec
export const ADPCM_BITRATES: Record<string, string[]> = {
  'ADPCM_G721': ['32KBPS'],
  'ADPCM_G723': ['24KBPS', '40KBPS'],
  'ADPCM_G726': ['16KBPS', '24KBPS', '32KBPS', '40KBPS'],
  'ADPCM_G727': ['16KBPS', '24KBPS', '32KBPS', '40KBPS'],
  'ADPCM_G728': ['9.6KBPS', '16KBPS'],
  'ADPCM_OKI': ['32KBPS'],
  'ADPCM_IMA': ['32KBPS'],
  'ADPCM_MS': ['32KBPS'],
};

export const FRAMERATES = [
  '1FPS', '2FPS', '4FPS', '5FPS', '8FPS', '12.5FPS', '16FPS', '20FPS',
  '23.976FPS', '24FPS', '25FPS', '29.97FPS', '30FPS', '32FPS', '40FPS',
  '47.952FPS', '50FPS', '59.94FPS', '60FPS', '120FPS', '300FPS',
];

export const SPEEDS = [
  '0.125', '0.25', '0.375', '0.5', '0.625', '0.75', '0.875', '1',
  '1.125', '1.25', '1.5', '1.625', '1.75', '1.875', '2', '2.375',
  '3', '4', '6', '8', '12', '16', '18', '19', '20', '32', '40', '50',
];

export const CHANNELS = ['ステレオ', 'モノラル'];

export const FREQUENCIES = [
  '2000Hz', '2048Hz', '2500Hz', '2736Hz', '3008Hz', '3125Hz', '4000Hz', '4096Hz',
  '4864Hz', '4928Hz', '5632Hz', '6016Hz', '6336Hz', '6400Hz', '7296Hz', '8000Hz',
  '8192Hz', '10000Hz', '11008Hz', '11025Hz', '14592Hz', '16000Hz', '16384Hz',
  '18240Hz', '20000Hz', '22050Hz', '32000Hz', '44100Hz', '48000Hz', '64000Hz',
  '66150Hz', '88200Hz', '96000Hz', '106496Hz', '116736Hz', '176400Hz', '192000Hz',
];

// Volume options (dB)
export const VOLUME_OPTIONS: { label: string; value: string; color?: 'orange' | 'red' }[] = [
  { label: '変えない', value: 'none' },
  ...Array.from({ length: 130 }, (_, i) => {
    const db = i + 10;
    return {
      label: `${db}dB`,
      value: `${db}`,
      color: db >= 126 ? 'red' as const : db >= 100 ? 'orange' as const : undefined,
    };
  }),
];

// iPhone incompatible items
export const IPHONE_BAD_VIDEO_CODECS = ['AV1', 'H.263', 'H.261', 'H.320', 'DIVX', 'MJPEG'];
export const IPHONE_BAD_AUDIO_CODECS = ['OPUS', 'OGG', 'RAW', 'AMR_NB', 'AMR_WB', 'PCM_U8', 'PCM_S16LE', 'PCM_S32LE', 'PCM_G.711', 'LPCM', 'ADPCM_G721', 'ADPCM_G723', 'ADPCM_G726', 'ADPCM_G727', 'ADPCM_G728', 'ADPCM_OKI', 'ADPCM_IMA', 'ADPCM_MS'];
export const IPHONE_BAD_FORMATS = ['AVI', '3G2', '3GP', 'OGG', 'RAW', 'AMR_NB', 'AMR_WB', 'OPUS'];

// Container/Codec compatibility map
export const FORMAT_AUDIO_CODEC_COMPAT: Record<string, string[]> = {
  'MP4': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2', 'AC3', 'EAC3', 'MP3', 'ALAC', 'FLAC'],
  'M4V': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2', 'AC3', 'EAC3', 'ALAC'],
  'MOV': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2', 'AC3', 'EAC3', 'MP3', 'PCM_S16LE', 'PCM_S32LE', 'LPCM', 'ALAC', 'FLAC'],
  '3G2': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2', 'AMR_NB', 'AMR_WB'],
  '3GP': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2', 'AMR_NB', 'AMR_WB'],
  'AVI': ['MP3', 'PCM_S16LE', 'PCM_U8', 'PCM_S32LE', 'AC3', 'LPCM', 'ADPCM_IMA', 'ADPCM_MS'],
  'OPUS': ['OPUS'],
  'EAC3': ['EAC3'],
  'AC3': ['AC3'],
  'AAC': ['AAC', 'AAC_HE_V1', 'AAC_HE_V2'],
  'MP3': ['MP3'],
  'WAV': ['PCM_S16LE', 'PCM_U8', 'PCM_S32LE', 'PCM_G.711', 'LPCM', 'ADPCM_IMA', 'ADPCM_MS', 'ADPCM_G726'],
  'OGG': ['OGG', 'OPUS', 'FLAC'],
  'AIFF': ['PCM_S16LE', 'PCM_S32LE', 'LPCM'],
  'RAW': ['PCM_S16LE', 'PCM_U8', 'PCM_S32LE', 'PCM_G.711', 'RAW', 'LPCM', 'ADPCM_G721', 'ADPCM_G723', 'ADPCM_G726', 'ADPCM_G727', 'ADPCM_G728', 'ADPCM_OKI'],
  'AMR_NB': ['AMR_NB'],
  'AMR_WB': ['AMR_WB'],
  'FLAC': ['FLAC'],
};

export const FORMAT_VIDEO_CODEC_COMPAT: Record<string, string[]> = {
  'MP4': ['H.264', 'H.265', 'AV1', 'MPEG-4'],
  'M4V': ['H.264', 'H.265', 'MPEG-4'],
  'MOV': ['H.264', 'H.265', 'MPEG-4', 'MJPEG'],
  '3G2': ['H.263', 'H.264', 'MPEG-4'],
  '3GP': ['H.263', 'H.264', 'MPEG-4'],
  'AVI': ['H.264', 'MPEG-4', 'DIVX', 'MJPEG', 'H.263'],
};

export function isCodecCompatible(format: string, codec: string, type: 'video' | 'audio'): boolean {
  if (codec === 'copy' || codec === 'none') return true;
  const map = type === 'video' ? FORMAT_VIDEO_CODEC_COMPAT : FORMAT_AUDIO_CODEC_COMPAT;
  const compat = map[format];
  if (!compat) return true;
  return compat.includes(codec);
}

export function getCompatibleVideoCodecs(format: string | null): string[] {
  if (!format) return VIDEO_CODECS;
  return FORMAT_VIDEO_CODEC_COMPAT[format] || VIDEO_CODECS;
}

export function getCompatibleAudioCodecs(format: string | null): string[] {
  if (!format) return AUDIO_CODECS;
  return FORMAT_AUDIO_CODEC_COMPAT[format] || AUDIO_CODECS;
}

// FFmpeg codec mapping
export const CODEC_MAP: Record<string, string> = {
  'AV1': 'libaom-av1', 'H.265': 'libx265', 'H.264': 'libx264', 'H.263': 'h263',
  'H.261': 'h261', 'H.320': 'h263', 'MPEG-4': 'mpeg4', 'DIVX': 'mpeg4', 'MJPEG': 'mjpeg',
  'OPUS': 'libopus', 'EAC3': 'eac3', 'AC3': 'ac3', 'AAC': 'aac',
  'AAC_HE_V1': 'aac', 'AAC_HE_V2': 'aac',
  'MP3': 'libmp3lame', 'WAV': 'pcm_s16le', 'OGG': 'libvorbis', 'AIFF': 'pcm_s16be',
  'RAW': 'pcm_s16le', 'AMR_NB': 'libopencore_amrnb', 'AMR_WB': 'libopencore_amrwb',
  'PCM_U8': 'pcm_u8', 'PCM_S16LE': 'pcm_s16le', 'PCM_S32LE': 'pcm_s32le', 'PCM_G.711': 'pcm_alaw',
  'LPCM': 'pcm_s16le',
  'ALAC': 'alac', 'FLAC': 'flac',
  'ADPCM_G721': 'adpcm_g726', 'ADPCM_G723': 'adpcm_g723_1', 'ADPCM_G726': 'adpcm_g726',
  'ADPCM_G727': 'adpcm_g726le', 'ADPCM_G728': 'adpcm_g726', 'ADPCM_OKI': 'adpcm_ima_wav',
  'ADPCM_IMA': 'adpcm_ima_wav', 'ADPCM_MS': 'adpcm_ms',
};

// AAC HE profiles need extra FFmpeg flags
export const AAC_HE_PROFILE: Record<string, string> = {
  'AAC_HE_V1': 'aac_he',
  'AAC_HE_V2': 'aac_he_v2',
};

export const FORMAT_EXT: Record<string, string> = {
  'MP4': 'mp4', 'M4V': 'm4v', 'MOV': 'mov', '3G2': '3g2', '3GP': '3gp', 'AVI': 'avi',
  'OPUS': 'opus', 'EAC3': 'eac3', 'AC3': 'ac3', 'AAC': 'aac', 'MP3': 'mp3',
  'WAV': 'wav', 'OGG': 'ogg', 'AIFF': 'aiff', 'RAW': 'raw', 'AMR_NB': 'amr', 'AMR_WB': 'amr',
  'FLAC': 'flac',
};

export const FORMAT_MIME: Record<string, string> = {
  'MP4': 'video/mp4', 'M4V': 'video/x-m4v', 'MOV': 'video/quicktime',
  '3G2': 'video/3gpp2', '3GP': 'video/3gpp', 'AVI': 'video/x-msvideo',
  'OPUS': 'audio/opus', 'EAC3': 'audio/eac3', 'AC3': 'audio/ac3', 'AAC': 'audio/aac',
  'MP3': 'audio/mpeg', 'WAV': 'audio/wav', 'OGG': 'audio/ogg',
  'AIFF': 'audio/aiff', 'RAW': 'application/octet-stream',
  'AMR_NB': 'audio/amr', 'AMR_WB': 'audio/amr-wb',
  'FLAC': 'audio/flac',
};

export interface ConvertSettings {
  videoCodec: string;
  aspectRatio: string;
  scanType: string;
  resolutionW: number;
  resolutionH: number;
  videoBitrate: string;
  framerate: string;
  startTime: number;
  endTime: number;
  speed: string;
  pitchSync: boolean;
  audioCodec: string;
  audioBitrate: string;
  channels: string;
  frequency: string;
  volume: string;
  audioEnabled: boolean;
  thumbnailTime: number;
}

export const defaultSettings: ConvertSettings = {
  videoCodec: 'H.264',
  aspectRatio: '16:9',
  scanType: 'プログレッシブ方式',
  resolutionW: 1920,
  resolutionH: 1080,
  videoBitrate: '5120KBPS',
  framerate: '30FPS',
  startTime: 0,
  endTime: 0,
  speed: '1',
  pitchSync: false,
  audioCodec: 'AAC',
  audioBitrate: '128KBPS',
  channels: 'ステレオ',
  frequency: '48000Hz',
  volume: 'none',
  audioEnabled: true,
  thumbnailTime: 0,
};

export function isVideoFormat(fmt: string): boolean {
  return VIDEO_FORMATS.includes(fmt);
}

export function isAdpcmCodec(codec: string): boolean {
  return codec.startsWith('ADPCM_');
}

export function getResolutionForAspect(ratio: string, w: number, h: number): { w: number; h: number } {
  const [rw, rh] = ratio.split(':').map(Number);
  if (rw > rh) return { w, h };
  return { w: h, h: w };
}

export function checkAspectResolutionMatch(ratio: string, w: number, h: number): boolean {
  if (ratio === '自由') return true;
  const [rw, rh] = ratio.split(':').map(Number);
  const expectedH = Math.round((w / rw) * rh);
  return Math.abs(expectedH - h) <= 5;
}
