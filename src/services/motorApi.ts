// Serviço de integração direta com o Motor de Dobra 4.2 AI Studio (via túnel ngrok)
// Elimina necessidade de Google Drive e OAuth.

export interface MotorStatusInfo {
  online: boolean;
  motor?: string;
  versao?: string;
  gpu?: string;
  whisper_model?: string;
  error?: string;
}

export interface JobStatusResponse {
  job_id: string;
  etapa: string;
  mensagem: string;
  progresso: number;
  timestamp: string;
  erro?: string | null;
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
    onProgress?: (mensagem: string, progresso: number) => void
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
    let tentativasErro = 0;

    while (!concluido) {
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const sResp = await fetch(`${base}/api/job_status/${job_id}?ngrok-skip-browser-warning=1`, {
          headers: { 'ngrok-skip-browser-warning': '1' },
        });

        if (sResp.ok) {
          const status: JobStatusResponse = await sResp.json();
          onProgress?.(status.mensagem || 'Processando...', status.progresso || 20);

          if (status.etapa === 'concluido' || status.progresso >= 100) {
            concluido = true;
            break;
          }

          if (status.etapa === 'erro' || status.erro) {
            throw new Error(status.erro || status.mensagem || 'Falha no processamento do motor');
          }
        }
      } catch (e: any) {
        tentativasErro++;
        if (tentativasErro > 8) {
          throw new Error(`Perda de comunicação com o Colab: ${e.message}`);
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
