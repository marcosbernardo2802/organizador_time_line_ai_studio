import { useEffect, useCallback, useSyncExternalStore } from 'react';

// Constantes ajustáveis para resolução da onda e limites de decodificação segura
export const PICOS_POR_SEGUNDO = 100;
export const TAXA_DECODIFICACAO = 8000;
export const AUTO_MAX_BYTES = 150 * 1024 * 1024; // 150 MB: acima disso requer confirmação do usuário
export const AUTO_MAX_SEGUNDOS = 20 * 60; // 20 minutos: áudios muito longos não geram automaticamente

export type WaveformEstado = 'verificando' | 'manual' | 'gerando' | 'pronta' | 'falha';

export interface WaveformItem {
  estado: WaveformEstado;
  picos?: Uint8Array;
  picosPorSegundo?: number;
  bytes?: number;
}

interface TarefaWaveform {
  url: string;
  duracaoConhecida?: number;
  forcada?: boolean;
}

// ── ESTADO EM NÍVEL DE MÓDULO ────────────────────────────────────────────────
// Cache indexado pela URL original da mídia (media.url)
const cache = new Map<string, WaveformItem>();
const ESTADO_INICIAL: WaveformItem = { estado: 'verificando' };

// Fila de tarefas com concorrência 1
let fila: TarefaWaveform[] = [];
let processando = false;
let estaPausado = false;
let urlEmExecucao: string | null = null;

// Ouvintes para useSyncExternalStore
const listeners = new Set<() => void>();

function notificar(): void {
  listeners.forEach((fn) => fn());
}

// Pausa para liberar a thread principal entre tarefas de decodificação
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

// Pipeline de decodificação e cálculo de picos da forma de onda
async function extrairPicosAudio(
  url: string,
  duracaoConhecida?: number,
  forcada: boolean = false
): Promise<void> {
  // Passo a: obtenção leve do Blob para inspecionar tamanho em bytes
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha HTTP ${resp.status}`);
  const blob = await resp.blob();
  const bytes = blob.size;

  // Passo b: checagem de limites automáticos se não for geração forçada
  if (!forcada && (bytes > AUTO_MAX_BYTES || (duracaoConhecida && duracaoConhecida > AUTO_MAX_SEGUNDOS))) {
    cache.set(url, { estado: 'manual', bytes });
    notificar();
    return;
  }

  // Passo c: leitura do buffer e decodificação reamostrada
  cache.set(url, { estado: 'gerando', bytes });
  notificar();

  const arrayBuffer = await blob.arrayBuffer();

  const AudioCtxClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  if (!AudioCtxClass) {
    throw new Error('OfflineAudioContext indisponível no navegador');
  }

  let ctx: OfflineAudioContext;
  try {
    ctx = new AudioCtxClass(1, 1, TAXA_DECODIFICACAO);
  } catch {
    // Fallback caso a taxa de 8000 Hz seja rejeitada pelo hardware/navegador
    ctx = new AudioCtxClass(1, 1, 22050);
  }

  const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
    const promise = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (promise && typeof (promise as Promise<AudioBuffer>).then === 'function') {
      (promise as Promise<AudioBuffer>).then(resolve).catch(reject);
    }
  });

  // Passo d: cálculo dos picos em janelas sem travar a interface
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = audioBuffer.length;
  const numChannels = audioBuffer.numberOfChannels;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  const windowSize = Math.max(1, Math.floor(sampleRate / PICOS_POR_SEGUNDO));
  const totalPicos = Math.ceil(totalSamples / windowSize);
  const tempFloat = new Float32Array(totalPicos);
  let maxGlobal = 0;

  let ultimoYield = performance.now();
  for (let p = 0; p < totalPicos; p++) {
    // Cede a thread a cada ~16 ms para manter 60 fps na interface
    if (performance.now() - ultimoYield > 16) {
      await new Promise((r) => setTimeout(r, 0));
      ultimoYield = performance.now();
    }

    const start = p * windowSize;
    const end = Math.min(start + windowSize, totalSamples);
    let maxJanela = 0;

    for (let c = 0; c < numChannels; c++) {
      const ch = channelData[c];
      for (let i = start; i < end; i++) {
        const val = Math.abs(ch[i]);
        if (val > maxJanela) {
          maxJanela = val;
        }
      }
    }

    tempFloat[p] = maxJanela;
    if (maxJanela > maxGlobal) {
      maxGlobal = maxJanela;
    }
  }

  // Normalização para Uint8Array (0 a 255) com curva perceptual Math.pow(v, 0.6)
  const picosUint8 = new Uint8Array(totalPicos);
  if (maxGlobal >= 1e-4) {
    for (let p = 0; p < totalPicos; p++) {
      const norm = tempFloat[p] / maxGlobal;
      picosUint8[p] = Math.min(255, Math.round(Math.pow(norm, 0.6) * 255));
    }
  }

  // Passo e: liberação imediata das referências pesadas da memória
  channelData.length = 0;

  cache.set(url, {
    estado: 'pronta',
    picos: picosUint8,
    picosPorSegundo: PICOS_POR_SEGUNDO,
    bytes,
  });
}

// Processador da fila com concorrência 1
async function processarFila(): Promise<void> {
  if (processando || estaPausado) return;
  if (fila.length === 0) return;

  processando = true;

  while (fila.length > 0 && !estaPausado) {
    const tarefa = fila.shift()!;
    urlEmExecucao = tarefa.url;

    const itemAtual = cache.get(tarefa.url);
    if (!itemAtual || (itemAtual.estado !== 'verificando' && !tarefa.forcada)) {
      urlEmExecucao = null;
      continue;
    }

    try {
      await extrairPicosAudio(tarefa.url, tarefa.duracaoConhecida, Boolean(tarefa.forcada));
    } catch {
      // Passo f: em caso de exceção, marca falha sem tentar novamente
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
 * Hook para obter a forma de onda de áudio na timeline.
 * Retorna estado ('verificando' | 'manual' | 'gerando' | 'pronta' | 'falha') e picos compactados.
 */
export function useWaveform(
  url: string | null | undefined,
  duracaoConhecida: number | undefined,
  ativo: boolean
): WaveformItem {
  useEffect(() => {
    if (!url) return;

    if (ativo) {
      const existente = cache.get(url);
      if (!existente) {
        // Enfileira nova verificação/geração de forma de onda
        cache.set(url, { estado: 'verificando' });
        fila.push({ url, duracaoConhecida });
        notificar();
        void processarFila();
      }
    } else {
      // Se saiu de visibilidade antes de iniciar, remove da fila
      if (urlEmExecucao !== url) {
        const index = fila.findIndex((t) => t.url === url);
        if (index !== -1) {
          fila.splice(index, 1);
          const cached = cache.get(url);
          if (cached && cached.estado === 'verificando') {
            cache.delete(url);
            notificar();
          }
        }
      }
    }
  }, [url, duracaoConhecida, ativo]);

  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback((): WaveformItem => {
    if (!url) return ESTADO_INICIAL;
    return cache.get(url) || ESTADO_INICIAL;
  }, [url]);

  return useSyncExternalStore(subscribe, getSnapshot, () => ESTADO_INICIAL);
}

/**
 * Enfileira a geração forçada da forma de onda para itens que excederam o limite automático.
 */
export function geraWaveformManual(url: string, duracaoConhecida?: number): void {
  const itemAtual = cache.get(url);
  cache.set(url, { estado: 'verificando', bytes: itemAtual?.bytes });
  fila.push({ url, duracaoConhecida, forcada: true });
  notificar();
  void processarFila();
}

/**
 * Remove do cache formas de onda cujas URLs não estão mais na lista de URLs ativas.
 */
export function limpaWaveformsExceto(urlsAtivas: Set<string>): void {
  let alterou = false;
  for (const [url] of cache.entries()) {
    if (!urlsAtivas.has(url)) {
      cache.delete(url);
      alterou = true;
    }
  }

  // Remove pendências canceladas da fila
  const tamanhoAntes = fila.length;
  fila = fila.filter((t) => urlsAtivas.has(t.url));
  if (fila.length !== tamanhoAntes) alterou = true;

  if (alterou) {
    notificar();
  }
}

/**
 * Pausa ou retoma o processamento da fila de formas de onda.
 */
export function pausaWaveform(pausado: boolean): void {
  estaPausado = pausado;
  if (!pausado) {
    void processarFila();
  }
}
