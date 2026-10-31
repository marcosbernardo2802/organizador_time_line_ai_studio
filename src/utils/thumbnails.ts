import { useEffect, useCallback, useSyncExternalStore } from 'react';

// Tipos do estado de miniatura
export type ThumbnailEstado = 'ociosa' | 'carregando' | 'pronta' | 'falha';

export interface ThumbnailItem {
  estado: ThumbnailEstado;
  thumbUrl?: string;
}

interface TarefaFila {
  url: string;
  tipo: 'video' | 'imagem';
}

// ── ESTADO EM NÍVEL DE MÓDULO ────────────────────────────────────────────────
// Cache indexado pela URL original da mídia (media.url)
const cache = new Map<string, ThumbnailItem>();
const IDLE_ITEM: ThumbnailItem = { estado: 'ociosa' };

// Fila de geração com concorrência 1
let fila: TarefaFila[] = [];
let processando = false;
let estaPausado = false;
let urlEmExecucao: string | null = null;

// Ouvintes para o useSyncExternalStore do React
const listeners = new Set<() => void>();

function notificar(): void {
  listeners.forEach((fn) => fn());
}

// Elementos únicos reutilizados fora do DOM para evitar criar múltiplos decodificadores
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedVideo: HTMLVideoElement | null = null;

function getCanvas(): HTMLCanvasElement {
  if (!sharedCanvas && typeof document !== 'undefined') {
    sharedCanvas = document.createElement('canvas');
  }
  return sharedCanvas!;
}

function getVideo(): HTMLVideoElement {
  if (!sharedVideo && typeof document !== 'undefined') {
    sharedVideo = document.createElement('video');
    sharedVideo.muted = true;
    sharedVideo.playsInline = true;
    sharedVideo.preload = 'auto';
  }
  return sharedVideo!;
}

// Pausa para liberar a thread principal entre tarefas
function aguardarOciosidade(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(
        () => resolve(),
        { timeout: 500 }
      );
    } else {
      setTimeout(resolve, 30);
    }
  });
}

// Execução com timeout estrito de 8 segundos
function comTimeout<T>(promise: Promise<T>, ms: number = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout de 8s na captura de miniatura')), ms)
    ),
  ]);
}

// ── CAPTURA DE IMAGEM ────────────────────────────────────────────────────────
async function capturarMiniaturaImagem(url: string): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha HTTP ${resp.status}`);
  const blob = await resp.blob();

  // Dimensões originais obtidas sem opções de redimensionamento
  let origW = 0;
  let origH = 0;
  try {
    const tempBitmap = await createImageBitmap(blob);
    origW = tempBitmap.width;
    origH = tempBitmap.height;
    tempBitmap.close();
  } catch {
    // Se falhar a leitura via createImageBitmap, prossegue para o fallback
  }

  const canvas = getCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D do Canvas indisponível');

  let desenhado = false;

  if (origW > 0 && origH > 0) {
    const scale = Math.min(1, 160 / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    // Tentativa 1: createImageBitmap com opções de redimensionamento
    try {
      const bitmapResized = await createImageBitmap(blob, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: 'medium',
      });
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.drawImage(bitmapResized, 0, 0, targetW, targetH);
      bitmapResized.close();
      desenhado = true;
    } catch {
      // Plano B acionado abaixo se o suporte a resizeWidth falhar
      desenhado = false;
    }
  }

  // Plano B: decodificação via HTMLImageElement
  if (!desenhado) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 160;
        const h = img.naturalHeight || 90;
        const scale = Math.min(1, 160 / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve();
      };
      img.onerror = () => reject(new Error('Erro ao decodificar imagem via HTMLImageElement'));
      img.src = url;
    });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        // Zera dimensões para liberar imediatamente o buffer de memória
        canvas.width = 0;
        canvas.height = 0;
        if (b) resolve(b);
        else reject(new Error('Erro ao gerar Blob JPEG'));
      },
      'image/jpeg',
      0.7
    );
  });
}

// ── CAPTURA DE VÍDEO ─────────────────────────────────────────────────────────
async function capturarMiniaturaVideo(url: string): Promise<Blob> {
  const video = getVideo();
  const canvas = getCanvas();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D do Canvas indisponível');

  try {
    // 1. Carrega metadados do vídeo
    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        remover();
        resolve();
      };
      const onError = () => {
        remover();
        reject(new Error('Erro ao carregar metadados do vídeo'));
      };
      const remover = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
      video.src = url;
      video.load();
    });

    // 2. Posiciona na metade da duração (máximo 0.5s)
    const duracao = video.duration || 0;
    const seekTime = Math.min(0.5, duracao > 0 ? duracao / 2 : 0);

    if (Math.abs(video.currentTime - seekTime) > 0.01) {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          remover();
          resolve();
        };
        const onSeekError = () => {
          remover();
          reject(new Error('Erro no seek do vídeo'));
        };
        const remover = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onSeekError);
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onSeekError);
        video.currentTime = seekTime;
      });
    }

    // 3. Desenha no canvas respeitando proporção e limite de 160px
    const origW = video.videoWidth || 160;
    const origH = video.videoHeight || 90;
    const scale = Math.min(1, 160 / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(video, 0, 0, targetW, targetH);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          // Zera canvas para liberar buffer
          canvas.width = 0;
          canvas.height = 0;
          if (b) resolve(b);
          else reject(new Error('Erro ao gerar Blob JPEG do vídeo'));
        },
        'image/jpeg',
        0.7
      );
    });
  } finally {
    // Libera recursos e decodificador de vídeo
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ── PROCESSADOR DA FILA (CONCORRÊNCIA 1) ─────────────────────────────────────
async function processarFila(): Promise<void> {
  if (processando || estaPausado) return;
  if (fila.length === 0) return;

  processando = true;

  while (fila.length > 0 && !estaPausado) {
    const tarefa = fila.shift()!;
    urlEmExecucao = tarefa.url;

    const itemAtual = cache.get(tarefa.url);
    if (!itemAtual || itemAtual.estado !== 'carregando') {
      urlEmExecucao = null;
      continue;
    }

    try {
      const capturar = tarefa.tipo === 'video' ? capturarMiniaturaVideo : capturarMiniaturaImagem;
      const blob = await comTimeout(capturar(tarefa.url), 8000);
      const thumbUrl = URL.createObjectURL(blob);
      cache.set(tarefa.url, { estado: 'pronta', thumbUrl });
    } catch {
      // Em erro, marca como falha sem tentar novamente
      cache.set(tarefa.url, { estado: 'falha' });
    } finally {
      urlEmExecucao = null;
      notificar();
    }

    // Intervalo de descompressão da thread principal
    await aguardarOciosidade();
  }

  processando = false;
}

// ── API EXPORTADA ───────────────────────────────────────────────────────────

/**
 * Hook para obter a miniatura de um arquivo de imagem ou vídeo na timeline.
 * Retorna estado ('ociosa' | 'carregando' | 'pronta' | 'falha') e thumbUrl quando pronta.
 */
export function useThumbnail(
  url: string | null | undefined,
  tipo: 'video' | 'imagem',
  ativo: boolean
): ThumbnailItem {
  useEffect(() => {
    if (!url) return;

    if (ativo) {
      const existente = cache.get(url);
      if (!existente) {
        // Enfileira miniatura nova
        cache.set(url, { estado: 'carregando' });
        fila.push({ url, tipo });
        notificar();
        void processarFila();
      }
    } else {
      // Se saiu de visibilidade/ativo antes de iniciar captura, tira da fila
      if (urlEmExecucao !== url) {
        const index = fila.findIndex((t) => t.url === url);
        if (index !== -1) {
          fila.splice(index, 1);
          const cached = cache.get(url);
          if (cached && cached.estado === 'carregando') {
            cache.delete(url);
            notificar();
          }
        }
      }
    }
  }, [url, tipo, ativo]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback((): ThumbnailItem => {
    if (!url) return IDLE_ITEM;
    return cache.get(url) || IDLE_ITEM;
  }, [url]);

  return useSyncExternalStore(subscribe, getSnapshot, () => IDLE_ITEM);
}

/**
 * Remove do cache miniaturas cujas URLs não estão mais na lista de URLs ativas,
 * revogando os ObjectURLs para liberar memória, e cancela pendências da fila.
 */
export function limpaThumbnailsExceto(urlsAtivas: Set<string>): void {
  let alterou = false;
  for (const [url, item] of cache.entries()) {
    if (!urlsAtivas.has(url)) {
      if (item.thumbUrl) {
        URL.revokeObjectURL(item.thumbUrl);
      }
      cache.delete(url);
      alterou = true;
    }
  }

  // Remove da fila pendências que não estão mais ativas
  const tamanhoAntes = fila.length;
  fila = fila.filter((t) => urlsAtivas.has(t.url));
  if (fila.length !== tamanhoAntes) alterou = true;

  if (alterou) {
    notificar();
  }
}

/**
 * Pausa ou retoma o processamento da fila de miniaturas.
 * A captura em andamento termina normalmente; novas capturas não iniciam enquanto pausado.
 */
export function pausaThumbnails(pausado: boolean): void {
  estaPausado = pausado;
  if (!pausado) {
    void processarFila();
  }
}
