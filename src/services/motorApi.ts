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
    return (localStorage.getItem(STORAGE_KEY) || '').trim().replace(/\/+$/, '');
  },

  setUrl(url: string): void {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem(STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  async testConnection(customUrl?: string): Promise<MotorStatusInfo> {
    const base = (customUrl !== undefined ? customUrl : this.getUrl()).trim().replace(/\/+$/, '');
    if (!base) {
      return { online: false, error: 'URL do motor não informada' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(`${base}/status`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': '1',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        return { online: false, error: `Servidor respondeu com código ${resp.status}` };
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
        error: err?.name === 'AbortError' ? 'Tempo de resposta esgotado (timeout)' : (err.message || 'Falha ao conectar no túnel ngrok'),
      };
    }
  },

  async enviarJob(
    files: File[],
    tipo: 'timeline' | 'render' | 'timeline_e_render' = 'timeline',
    onProgress?: (mensagem: string, progresso: number) => void
  ): Promise<{ job_id: string; timeline?: any; videoBlob?: Blob | null }> {
    const base = this.getUrl();
    if (!base) {
      throw new Error('Configure a URL do Motor de Dobra nas opções antes de enviar.');
    }

    onProgress?.('Enviando arquivos para o Colab via túnel...', 5);

    const formData = new FormData();
    formData.append('tipo', tipo);
    files.forEach((file) => {
      formData.append('arquivos', file, file.name);
    });

    const resp = await fetch(`${base}/api/enviar_job`, {
      method: 'POST',
      headers: {
        'ngrok-skip-browser-warning': '1',
      },
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Erro ao enviar job para o Colab (${resp.status}): ${errText}`);
    }

    const { job_id } = await resp.json();
    onProgress?.('Job aceito pelo Colab. Aguardando processamento na GPU...', 10);

    // Polling do status do job no Colab
    let concluido = false;
    let tentativasErro = 0;

    while (!concluido) {
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const sResp = await fetch(`${base}/api/job_status/${job_id}`, {
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
        if (tentativasErro > 5) {
          throw new Error(`Perda de comunicação com o Colab: ${e.message}`);
        }
      }
    }

    let timeline: any = null;
    let videoBlob: Blob | null = null;

    if (tipo !== 'render') {
      onProgress?.('Baixando timeline.json calculada...', 95);
      const tlResp = await fetch(`${base}/api/download/${job_id}/timeline.json`, {
        headers: { 'ngrok-skip-browser-warning': '1' },
      });
      if (tlResp.ok) {
        timeline = await tlResp.json();
      }
    }

    if (tipo === 'render' || tipo === 'timeline_e_render') {
      onProgress?.('Baixando vídeo renderizado pela GPU...', 96);
      const vidResp = await fetch(`${base}/api/download/${job_id}/video_final.mp4`, {
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
    return `${this.getUrl()}/api/download/${job_id}/video_final.mp4`;
  },
};
