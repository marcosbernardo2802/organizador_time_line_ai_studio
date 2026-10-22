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

// ─── LEITURA ASSÍNCRONA DE DURAÇÃO REAL DE MÍDIAS ────────────────────────────

/**
 * Obtém a duração real de um arquivo de áudio ou vídeo via elemento HTML5 de mídia.
 * Resolve com o fallback em caso de erro, duração inválida ou timeout de 8 segundos.
 * Revoga a URL temporária e limpa o elemento em todos os caminhos. Nunca rejeita.
 */
export const getMediaDuration = (
  file: File,
  kind: 'audio' | 'video',
  fallback: number
): Promise<number> => {
  return new Promise<number>((resolve) => {
    let url = '';
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(fallback);
      return;
    }

    const el = document.createElement(kind);
    el.preload = 'metadata';

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      try {
        el.src = '';
      } catch {}
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(fallback);
    }, 8000);

    el.onloadedmetadata = () => {
      const dur = el.duration;
      cleanup();
      if (typeof dur === 'number' && Number.isFinite(dur) && dur > 0) {
        resolve(dur);
      } else {
        resolve(fallback);
      }
    };

    el.onerror = () => {
      cleanup();
      resolve(fallback);
    };

    el.src = url;
  });
};

/**
 * Executa mapeamento assíncrono sobre um array em lotes de tamanho máximo especificado (ex: 6).
 */
export const mapInBatches = async <T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map((item, idx) => fn(item, i + idx)));
    results.push(...chunkResults);
  }
  return results;
};

// ─── VALIDAÇÃO DE ROTEIRO E UNIDADES VISUAIS ──────────────────────────────────

const ARQUIVOS_IGNORADOS = new Set([
  'audio', 'bgm', 'narration', 'narracao', 'voz', 'trilha', 'music', 'musica',
  'video_final', 'video_sem_audio', 'saida', 'output', 'export', 'temp', 'preview',
  'status', 'timeline', 'roteiro', 'sub_concat', 'concat'
]);

/**
 * Agrupa mídias visuais por nome base (sem extensão), replicando obtem_unidades_visuais do motor.
 * Um vídeo e uma imagem de mesmo nome base contam como UMA única unidade. Ignora arquivos de áudio.
 */
export const contaUnidadesVisuais = (midias: File[]): number => {
  const grupos = new Set<string>();
  for (const f of midias) {
    if (!isVisualFile(f.name, f.type) || isAudioFile(f.name, f.type)) continue;
    const name = f.name;
    const base = getBaseName(name);
    if (!base || name.startsWith('.') || name.startsWith('_') || ARQUIVOS_IGNORADOS.has(base)) continue;
    if (['video_final', 'video_sem_audio', 'output_final', 'sub_concat', 'concat'].some((ign) => base.includes(ign))) {
      continue;
    }
    grupos.add(base);
  }
  return grupos.size;
};

/**
 * Conta os blocos do roteiro replicando le_roteiro_conteudo do motor.
 */
export const contaBlocosRoteiro = (
  conteudo: string,
  totalMidias: number = 0
): { blocos: number; linhasApenasDigitos: string[] } => {
  if (!conteudo || !conteudo.trim()) {
    return { blocos: 0, linhasApenasDigitos: [] };
  }

  // Identifica linhas compostas apenas por números isolados (que o motor trata como marcador de cena)
  const linhas = conteudo.split(/\r?\n/);
  const linhasApenasDigitos: string[] = [];
  for (const l of linhas) {
    const limpa = l.trim();
    if (/^\d+$/.test(limpa)) {
      linhasApenasDigitos.push(limpa);
    }
  }

  const padrao = /(?:^|\n)\s*\[?\s*(?:cena|bloco)?\s*[_:\-]?\s*(\d+)\s*\]?\s*[:\-]?\s*(?:\n|$)/i;
  const partes = ('\n' + conteudo).split(padrao);
  let blocosCount = 0;

  for (let i = 1; i < partes.length; i += 2) {
    const txt = i + 1 < partes.length ? partes[i + 1].trim() : '';
    if (txt) {
      const txtLimpo = txt.replace(/\[(?:visual|efeito|audio|camera|b-roll)[^\]]*\]/gi, '').trim();
      if (txtLimpo || txt) {
        blocosCount++;
      }
    }
  }

  if (blocosCount === 0 && conteudo.trim()) {
    const linhasNaoVazias = linhas.map((p) => p.trim()).filter(Boolean);
    if (totalMidias > 0) {
      blocosCount = totalMidias;
    } else {
      blocosCount = linhasNaoVazias.length;
    }
  }

  return { blocos: blocosCount, linhasApenasDigitos };
};

/**
 * Valida o roteiro contra as mídias visuais antes do envio ao motor.
 */
export const validaRoteiroContraMidias = async (
  roteiro: File | null | undefined,
  midias: File[]
): Promise<{ blocos: number; unidades: number; avisos: string[] }> => {
  const avisos: string[] = [];
  const unidades = contaUnidadesVisuais(midias || []);

  if (!roteiro) {
    avisos.push('Nenhum arquivo de roteiro selecionado.');
    return { blocos: 0, unidades, avisos };
  }

  let conteudo = '';
  try {
    conteudo = await roteiro.text();
  } catch {
    avisos.push('Não foi possível ler o roteiro para validar.');
    return { blocos: 0, unidades, avisos };
  }

  const { blocos, linhasApenasDigitos } = contaBlocosRoteiro(conteudo, unidades);

  if (blocos === 0) {
    avisos.push('Roteiro vazio ou sem blocos reconhecidos.');
  }

  if (unidades === 0) {
    avisos.push('Nenhuma mídia visual encontrada.');
  }

  if (blocos > 0 && unidades > 0 && blocos !== unidades) {
    avisos.push(
      `O roteiro tem ${blocos} blocos, mas há ${unidades} mídias visuais. O motor vai ajustar a diferença automaticamente, e isso pode desalinhar cenas.`
    );
  }

  if (linhasApenasDigitos.length > 0) {
    const exemplos = Array.from(new Set(linhasApenasDigitos)).slice(0, 3).join(', ');
    avisos.push(
      `O roteiro contém linha(s) isolada(s) apenas com números (ex: "${exemplos}"). O motor trata essas linhas como marcador de cena.`
    );
  }

  return { blocos, unidades, avisos };
};
