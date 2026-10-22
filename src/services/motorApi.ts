// Serviço de integração direta com o Motor de Dobra 4.2 AI Studio (via túnel ngrok)

// Tipos de formato de aspecto e qualidade para renderização no Colab
export type FormatoRender = '16:9' | '9:16' | '1:1';
export type QualidadeRender = '480p' | '720p' | '1080p';

export interface MotorStatusInfo {
  online: boolean;
  motor?: string;
  versao?: string;
  gpu?: string;
  whisper_model?: string;
  error?: string;
}

import { EtapaJob } from '../types';

export interface JobStatusResponse {
  job_id: string;
  etapa: string;
  mensagem: string;
  progresso: number;
  timestamp: string;
  erro?: string | null;
  // Campos aditivos de progresso detalhado por etapa
  etapa_id?: string;
  etapas?: EtapaJob[];
  etapa_indice?: number;
  etapa_total?: number;
  etapa_pct?: number;
  detalhe?: string | null;
  eta_s?: number | null;
}

// Configurações de resiliência e timeouts do polling do motor
const POLLING_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutos de timeout total
const STALL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos sem alteração de progresso/mensagem
const STATUS_FETCH_TIMEOUT_MS = 15000; // 15 segundos de timeout por requisição individual
const INTERVALO_BASE_MS = 1200; // 1.2s de intervalo base normal
const MAX_FALHAS_CONSECUTIVAS = 8; // Máximo de falhas de rede seguidas antes de abortar

// Classe de erro específica para distinguir falhas reais do motor de problemas de rede
export class MotorJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotorJobError';
  }
}

const STORAGE_KEY = 'cronicas_motor_ngrok_url';

export const motorApi = {
  getUrl(): string {
    let raw = (localStorage.getItem(STORAGE_KEY) || '').trim().replace(/\/+$/, '');
    if (!raw) return '';
    // Se o app estiver rodando em HTTPS (ex: Vercel) e a URL foi colada como http://, converte automaticamente para https://
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && raw.startsWith('http://') && !raw.includes('localhost')) {
      raw = raw.replace(/^http:\/\//i, 'https://');
    }
    return raw;
  },

  setUrl(url: string): void {
    let clean = url.trim().replace(/\/+$/, '');
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    if (clean) {
      localStorage.setItem(STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  async testConnection(customUrl?: string): Promise<MotorStatusInfo> {
    let base = (customUrl !== undefined ? customUrl : this.getUrl()).trim().replace(/\/+$/, '');
    if (!base) {
      return { online: false, error: 'URL do motor não informada' };
    }

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://') && !base.includes('localhost')) {
      base = base.replace(/^http:\/\//i, 'https://');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const resp = await fetch(`${base}/status?ngrok-skip-browser-warning=1`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        return { online: false, error: `Servidor respondeu com código HTTP ${resp.status}` };
      }

      const data = await resp.json();
      return {
        online: true,
        motor: data.motor || 'Motor de Dobra 4.2',
        versao: data.versao || '4.2',
        gpu: data.gpu || 'GPU Ativa',
        whisper_model: data.whisper_model || 'medium',
      };
    } catch (err: any) {
      return {
        online: false,
        error:
          err?.name === 'AbortError'
            ? 'Tempo de resposta esgotado (timeout de 9s)'
            : err.message === 'Failed to fetch' || err.name === 'TypeError'
            ? 'Falha ao alcançar a URL do ngrok. Verifique se o Colab está ligado e se a URL começa com https://'
            : err.message || 'Falha ao conectar no túnel ngrok',
      };
    }
  },

  async enviarJob(
    files: File[],
    tipo: 'timeline' | 'render' | 'timeline_e_render' = 'timeline',
    onProgress?: (mensagem: string, progresso: number, status?: JobStatusResponse) => void,
    opcoes?: { formato?: FormatoRender; qualidade?: QualidadeRender }
  ): Promise<{ job_id: string; timeline?: any; videoBlob?: Blob | null }> {
    let base = this.getUrl();
    if (!base) {
      throw new Error('Configure a URL do Motor de Dobra nas opções do topo antes de enviar.');
    }

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://') && !base.includes('localhost')) {
      base = base.replace(/^http:\/\//i, 'https://');
    }

    onProgress?.('Verificando conexão com a GPU do Colab...', 3);
    const ping = await this.testConnection(base);
    if (!ping.online) {
      throw new Error(
        `O Motor de Dobra no Colab não respondeu (${base}).\n\nMotivo: ${ping.error}\n\nPor favor, confirme se a célula no Google Colab está em execução e se a URL do túnel ngrok está atualizada.`
      );
    }

    onProgress?.('Enviando arquivos para o Colab via túnel...', 6);

    const formData = new FormData();
    formData.append('tipo', tipo);
    // Anexa formato e qualidade de renderização para o Colab se definidos
    if (opcoes?.formato) {
      formData.append('formato', opcoes.formato);
    }
    if (opcoes?.qualidade) {
      formData.append('qualidade', opcoes.qualidade);
    }
    files.forEach((file) => {
      formData.append('arquivos', file, file.name);
    });

    let resp: Response;
    try {
      resp = await fetch(`${base}/api/enviar_job?ngrok-skip-browser-warning=1`, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': '1',
        },
        body: formData,
      });
    } catch (fetchErr: any) {
      if (fetchErr.message === 'Failed to fetch' || fetchErr.name === 'TypeError') {
        throw new Error(
          `Falha de conexão com o túnel ngrok (${base}).\n\nPossíveis motivos:\n1. A sessão do Google Colab desconectou ou foi reiniciada.\n2. O ngrok gerou uma nova URL pública.\n3. Bloqueio de rede ou arquivos grandes no envio.\n\nVerifique o card do Colab e atualize a URL no topo.`
        );
      }
      throw fetchErr;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Erro retornado pelo Colab (${resp.status}): ${errText}`);
    }

    const { job_id } = await resp.json();
    onProgress?.('Job aceito pelo Colab. Aguardando processamento na GPU...', 10);

    // Polling do status do job no Colab
    let concluido = false;
    let tentativasErro = 0; // Conta somente falhas consecutivas de comunicação de rede
    const inicioPolling = Date.now();
    let ultimoProgressoTimestamp = Date.now();
    let ultimaChaveProgresso = '';

    while (!concluido) {
      // Defeito 3: Tempo limite total de 60 minutos
      if (Date.now() - inicioPolling > POLLING_TIMEOUT_MS) {
        throw new MotorJobError('Tempo limite excedido aguardando o motor (60 min). Verifique o Colab.');
      }

      // Defeito 1: Intervalo progressivo após falhas consecutivas (base + 1s por falha, máximo 10s)
      const esperaMs =
        tentativasErro > 0
          ? Math.min(INTERVALO_BASE_MS + tentativasErro * 1000, 10000)
          : INTERVALO_BASE_MS;

      await new Promise((r) => setTimeout(r, esperaMs));

      let status: JobStatusResponse | null = null;

      try {
        // Defeito 3: Timeout curto de 15s por requisição de status via AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);

        let sResp: Response;
        try {
          sResp = await fetch(`${base}/api/job_status/${job_id}?ngrok-skip-browser-warning=1`, {
            headers: {
              'ngrok-skip-browser-warning': '1',
              'Accept': 'application/json',
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Defeito 3: Se o servidor responder 404, o Colab foi reiniciado e perdeu o job da memória
        if (sResp.status === 404) {
          throw new MotorJobError(
            'O motor não reconhece mais este job. O Colab provavelmente foi reiniciado. Reconecte o motor e envie o job novamente.'
          );
        }

        // Outros status HTTP não-ok (500, 502, 503, 504 etc.) são tratados como falha de comunicação
        if (!sResp.ok) {
          throw new Error(`Servidor respondeu com código HTTP ${sResp.status}`);
        }

        // Parse do JSON (protege contra páginas HTML de erro retornadas pelo ngrok)
        status = await sResp.json();

        // Defeito 1: Sucesso HTTP e JSON válido zeram o contador de falhas consecutivas
        tentativasErro = 0;
      } catch (netErr: any) {
        // Se for erro intencional do motor (ex: 404), relança imediatamente sem contar como falha de rede
        if (netErr instanceof MotorJobError) {
          throw netErr;
        }

        // Falha de comunicação (timeout de 15s, fetch rejeitado, HTML em vez de JSON, HTTP 50x)
        tentativasErro++;
        const motivo =
          netErr?.name === 'AbortError'
            ? 'tempo de resposta esgotado (timeout 15s)'
            : netErr?.message || 'falha de rede';

        if (tentativasErro > MAX_FALHAS_CONSECUTIVAS) {
          throw new Error(
            `Perda de comunicação com o Colab após ${MAX_FALHAS_CONSECUTIVAS} falhas consecutivas: ${motivo}`
          );
        }

        // Continua o loop para tentar novamente após a espera com backoff
        continue;
      }

      // Defeito 2: Tratamento do status retornado pelo motor FORA do bloco de falhas de rede
      if (status) {
        onProgress?.(status.mensagem || 'Processando...', status.progresso || 20, status);

        // Defeito 3: Monitora se o motor travou sem progresso por 10 minutos consecutivos
        // Considera alterações em progresso, mensagem, etapa_id, etapa_pct e detalhe como progresso real
        const chaveProgresso = `${status.etapa}:${status.progresso}:${status.mensagem}:${status.etapa_id || ''}:${status.etapa_pct ?? ''}:${status.detalhe || ''}`;
        if (chaveProgresso !== ultimaChaveProgresso) {
          ultimaChaveProgresso = chaveProgresso;
          ultimoProgressoTimestamp = Date.now();
        } else if (Date.now() - ultimoProgressoTimestamp > STALL_TIMEOUT_MS) {
          throw new MotorJobError('O motor parou de responder ao progresso do job. Verifique o Colab.');
        }

        // Concluído com sucesso
        if (status.etapa === 'concluido' || status.progresso >= 100) {
          concluido = true;
          break;
        }

        // Defeito 2: Se o motor reportar erro, lança imediatamente a mensagem real do motor sem passar por catch de rede
        if (status.etapa === 'erro' || status.erro) {
          const msgReal = status.erro || status.mensagem || 'O motor reportou erro sem detalhes.';
          throw new MotorJobError(msgReal);
        }
      }
    }

    let timeline: any = null;
    let videoBlob: Blob | null = null;

    if (tipo !== 'render') {
      onProgress?.('Baixando timeline.json calculada...', 95);
      const tlResp = await fetch(`${base}/api/download/${job_id}/timeline.json?ngrok-skip-browser-warning=1`, {
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      if (tlResp.ok) {
        timeline = await tlResp.json();
      }
    }

    if (tipo === 'render' || tipo === 'timeline_e_render') {
      onProgress?.('Baixando vídeo renderizado pela GPU...', 96);
      const vidResp = await fetch(`${base}/api/download/${job_id}/video_final.mp4?ngrok-skip-browser-warning=1`, {
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      if (vidResp.ok) {
        videoBlob = await vidResp.blob();
      }
    }

    onProgress?.('Processamento concluído com sucesso!', 100);
    return { job_id, timeline, videoBlob };
  },

  getVideoDownloadUrl(job_id: string): string {
    return `${this.getUrl()}/api/download/${job_id}/video_final.mp4?ngrok-skip-browser-warning=1`;
  },
};
