/**
 * @file media.ts
 * Utilitários abrangentes para detecção e manipulação de arquivos de mídia
 * (áudio, vídeo e imagem), com total suporte case-insensitive (.mp3, .MP3, .Mp3, .mP3, etc.).
 */

// ─── LISTAS DE EXTENSÕES SUPORTADAS (MINÚSCULAS) ─────────────────────────────

export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'wma',
  'aiff',
  'aif',
  'alac',
  'opus',
  'mid',
  'midi',
  'amr',
  'ac3',
  'eac3',
  'm4b',
  'mp2',
  'mpa',
] as const;

export const VIDEO_EXTENSIONS = [
  'mp4',
  'mov',
  'webm',
  'avi',
  'mkv',
  'm4v',
  '3gp',
  '3g2',
  'wmv',
  'flv',
  'f4v',
  'ts',
  'mts',
  'm2ts',
  'ogv',
  'vob',
  'mpeg',
  'mpg',
  'm2v',
  'divx',
  'asf',
  'rm',
  'rmvb',
] as const;

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'bmp',
  'gif',
  'tiff',
  'tif',
  'svg',
  'avif',
  'ico',
  'heic',
  'heif',
  'jfif',
  'pjpeg',
  'pjp',
  'raw',
  'cr2',
  'nef',
  'psd',
] as const;

// Sets para verificação O(1)
const AUDIO_SET = new Set<string>(AUDIO_EXTENSIONS);
const VIDEO_SET = new Set<string>(VIDEO_EXTENSIONS);
const IMAGE_SET = new Set<string>(IMAGE_EXTENSIONS);

/**
 * Extrai a extensão do arquivo em minúsculas (sem o ponto).
 * Trata URLs, parâmetros de consulta (#, ?), múltiplos pontos e variações de maiúsculas/minúsculas.
 * Exemplos:
 *   "audio.MP3" -> "mp3"
 *   "cena.001.Mp3" -> "mp3"
 *   "video.mP4" -> "mp4"
 *   "FOTO.JPEG" -> "jpeg"
 */
export const getFileExtension = (filename?: string | null): string => {
  if (!filename) return '';
  const clean = filename.split('?')[0].split('#')[0].trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1 || lastDot === clean.length - 1) return '';
  return clean.substring(lastDot + 1).toLowerCase().trim();
};

/**
 * Extrai o nome base sem a extensão (sempre em minúsculas para comparações seguras).
 * Exemplo: "0001.MP3" -> "0001", "Cena_01.MP4" -> "cena_01"
 */
export const getBaseName = (filename?: string | null): string => {
  if (!filename) return '';
  const clean = filename.split('?')[0].split('#')[0].trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) return clean.toLowerCase().trim();
  return clean.substring(0, lastDot).toLowerCase().trim();
};

/**
 * Verifica se o arquivo é de áudio (ignora maiúsculas/minúsculas).
 * Funciona para .mp3, .MP3, .Mp3, .mP3, .wav, .WAV, etc.
 */
export const isAudioFile = (filename?: string | null, mimeType?: string | null): boolean => {
  const normMime = (mimeType || '').toLowerCase().trim();
  if (normMime.startsWith('audio/')) return true;
  const ext = getFileExtension(filename);
  return AUDIO_SET.has(ext);
};

/**
 * Verifica se o arquivo é de vídeo (ignora maiúsculas/minúsculas).
 * Funciona para .mp4, .MP4, .Mp4, .mP4, .mov, .MOV, .webm, etc.
 */
export const isVideoFile = (filename?: string | null, mimeType?: string | null): boolean => {
  const normMime = (mimeType || '').toLowerCase().trim();
  if (normMime.startsWith('video/')) return true;
  const ext = getFileExtension(filename);
  return VIDEO_SET.has(ext);
};

/**
 * Verifica se o arquivo é de imagem (ignora maiúsculas/minúsculas).
 * Funciona para .jpg, .JPG, .jpeg, .JPEG, .png, .PNG, .webp, etc.
 */
export const isImageFile = (filename?: string | null, mimeType?: string | null): boolean => {
  const normMime = (mimeType || '').toLowerCase().trim();
  if (normMime.startsWith('image/')) return true;
  const ext = getFileExtension(filename);
  return IMAGE_SET.has(ext);
};

/**
 * Verifica se o arquivo é visual (vídeo OU imagem).
 */
export const isVisualFile = (filename?: string | null, mimeType?: string | null): boolean => {
  return isVideoFile(filename, mimeType) || isImageFile(filename, mimeType);
};

/**
 * Retorna o tipo de mídia ('video' | 'audio' | 'image' | 'unknown') de forma 100% agnóstica a maiúsculas/minúsculas.
 */
export const detectMediaType = (
  filename?: string | null,
  mimeType?: string | null
): 'video' | 'audio' | 'image' | 'unknown' => {
  if (isVideoFile(filename, mimeType)) return 'video';
  if (isAudioFile(filename, mimeType)) return 'audio';
  if (isImageFile(filename, mimeType)) return 'image';
  return 'unknown';
};

/**
 * Retorna um rótulo e ícone amigável para o arquivo
 */
export const getMediaInfoLabel = (filename?: string | null, mimeType?: string | null): { icon: string; label: string; kind: string } => {
  const kind = detectMediaType(filename, mimeType);
  const ext = getFileExtension(filename).toUpperCase();
  if (kind === 'video') return { icon: '🎬', label: ext ? `VÍDEO (.${ext})` : 'VÍDEO', kind: 'video' };
  if (kind === 'audio') return { icon: '🎵', label: ext ? `ÁUDIO (.${ext})` : 'ÁUDIO', kind: 'audio' };
  if (kind === 'image') return { icon: '🖼️', label: ext ? `IMAGEM (.${ext})` : 'IMAGEM', kind: 'image' };
  return { icon: '📄', label: ext ? `ARQUIVO (.${ext})` : 'ARQUIVO', kind: 'unknown' };
};

// ─── GERAÇÃO DE STRINGS ACCEPT ABRANGENTES PARA INPUTS DE ARQUIVO ─────────────

const buildAcceptList = (exts: readonly string[], mimeType: string) => {
  const items: string[] = [mimeType];
  exts.forEach((e) => {
    items.push(`.${e}`);
    items.push(`.${e.toUpperCase()}`);
  });
  return items.join(',');
};

export const ACCEPT_AUDIO = buildAcceptList(AUDIO_EXTENSIONS, 'audio/*');

export const ACCEPT_VISUAL = [
  'image/*',
  'video/*',
  ...IMAGE_EXTENSIONS.map((e) => `.${e}`),
  ...IMAGE_EXTENSIONS.map((e) => `.${e.toUpperCase()}`),
  ...VIDEO_EXTENSIONS.map((e) => `.${e}`),
  ...VIDEO_EXTENSIONS.map((e) => `.${e.toUpperCase()}`),
].join(',');

export const ACCEPT_ALL_MEDIA = [
  'image/*',
  'video/*',
  'audio/*',
  ...IMAGE_EXTENSIONS.map((e) => `.${e}`),
  ...IMAGE_EXTENSIONS.map((e) => `.${e.toUpperCase()}`),
  ...VIDEO_EXTENSIONS.map((e) => `.${e}`),
  ...VIDEO_EXTENSIONS.map((e) => `.${e.toUpperCase()}`),
  ...AUDIO_EXTENSIONS.map((e) => `.${e}`),
  ...AUDIO_EXTENSIONS.map((e) => `.${e.toUpperCase()}`),
].join(',');
