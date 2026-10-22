# @title 🚀 Motor de Dobra 4.2 AI Studio — Modo Direto (ngrok API)
# ==============================================================================
# --- MOTOR DE DOBRA 4.2 AI STUDIO: MODO DIRETO (SEM GOOGLE DRIVE) ---
# Conexão direta entre o App Web e o Google Colab via túnel ngrok.
# 
# Vantagens deste modo:
#   1. Zero dependência de Google Drive e OAuth do Google.
#   2. Funciona perfeitamente dentro de iframes e portais web.
#   3. Comunicação direta: arquivos saem do PC -> Colab GPU -> voltam pro PC.
#   4. Card interativo gerado na tela com cópia de URL em 1 clique.
# ==============================================================================

# @markdown ### 🔑 Configuração do ngrok:
# @markdown Cole seu **Authtoken do ngrok** abaixo (pegue grátis em https://dashboard.ngrok.com/get-started/your-authtoken):
NGROK_AUTHTOKEN = ""  # @param {type:"string"}

# @markdown ---
# @markdown ### ⚙️ Parâmetros do Motor & GPU:
PORTA_LOCAL = 8000  # @param {type:"integer"}
WHISPER_MODEL = "medium"  # @param ["tiny", "base", "small", "medium", "large-v3"]
RESOLUCAO_ESCOLHIDA = "1080p (1920x1080)"  # @param ["1080p (1920x1080)", "720p (1280x720)", "4K (3840x2160)"]
FPS = 24  # @param {type:"integer"}

# ==============================================================================
# 1. INSTALAÇÃO DAS DEPENDÊNCIAS
# ==============================================================================
import sys, subprocess

print("📦 Instalando dependências (FastAPI, Uvicorn, pyngrok, Whisper, MoviePy)...")
subprocess.run([
    sys.executable, "-m", "pip", "install",
    "fastapi", "uvicorn", "pyngrok", "python-multipart",
    "openai-whisper", "moviepy", "tqdm", "-q"
], check=True)

import os, re, unicodedata, whisper, threading, time, json, shutil, tempfile, uuid
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Optional
import torch

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
import uvicorn
from pyngrok import ngrok, conf
from IPython.display import HTML, display, Javascript

# Resolução
if "4K" in RESOLUCAO_ESCOLHIDA:
    RESOLUCAO = (3840, 2160)
elif "720p" in RESOLUCAO_ESCOLHIDA:
    RESOLUCAO = (1280, 720)
else:
    RESOLUCAO = (1920, 1080)

# Tabela fixa de perfis de renderização com dimensões pares para compatibilidade yuv420p
PERFIS_RESOLUCAO = {
    "16:9": {
        "480p": (854, 480),
        "720p": (1280, 720),
        "1080p": (1920, 1080),
    },
    "9:16": {
        "480p": (480, 854),
        "720p": (720, 1280),
        "1080p": (1080, 1920),
    },
    "1:1": {
        "480p": (480, 480),
        "720p": (720, 720),
        "1080p": (1080, 1080),
    },
}

def resolve_perfil(formato: str = "", qualidade: str = "") -> dict:
    """
    Resolve perfil de resolução e preset de codificação com base em whitelist estrita.
    Preserva a constante global RESOLUCAO e preset fast caso nenhum perfil seja informado.
    """
    f = (formato or "").strip()
    q = (qualidade or "").strip()
    if not f and not q:
        return {"resolucao": RESOLUCAO, "preset": "fast", "crf": None}

    if not f:
        f = "16:9"
    if not q:
        q = "1080p"

    if f not in PERFIS_RESOLUCAO or q not in PERFIS_RESOLUCAO[f]:
        raise ValueError(f"Perfil de render inválido: formato '{formato}', qualidade '{qualidade}'")

    res = PERFIS_RESOLUCAO[f][q]
    if q == "480p":
        preset = "veryfast"
        crf = "28"
    else:
        preset = "fast"
        crf = None

    return {"resolucao": res, "preset": preset, "crf": crf}

MARGEM_EXTRA = 15

# ==============================================================================
# PLANOS DE ETAPAS E PESOS DE PROGRESSO
# ==============================================================================
# Pesos calibráveis com base no tempo real de execução:
# 1. tipo 'timeline': preparo 3, transcricao 72, sincronizacao 20, finalizacao 5
# 2. render COM timeline pronta: preparo 3, cortes 82, concatenacao 5, mixagem 10
# 3. timeline_e_render (ou render sem timeline utilizável): preparo 2, transcricao 25, sincronizacao 5, cortes 55, concatenacao 3, mixagem 8, finalizacao 2
PLANOS_ETAPAS = {
    "timeline": [
        {"id": "preparo", "nome": "Preparando arquivos", "peso": 3, "etapa_legada": "inicio"},
        {"id": "transcricao", "nome": "Transcrevendo áudio (Whisper)", "peso": 72, "etapa_legada": "whisper"},
        {"id": "sincronizacao", "nome": "Sincronizando roteiro e cenas", "peso": 20, "etapa_legada": "matching"},
        {"id": "finalizacao", "nome": "Gerando timeline", "peso": 5, "etapa_legada": "matching"},
    ],
    "render_com_timeline": [
        {"id": "preparo", "nome": "Preparando arquivos", "peso": 3, "etapa_legada": "inicio"},
        {"id": "cortes", "nome": "Renderizando cenas", "peso": 82, "etapa_legada": "render"},
        {"id": "concatenacao", "nome": "Unindo cenas", "peso": 5, "etapa_legada": "render"},
        {"id": "mixagem", "nome": "Mixando áudio e gerando MP4", "peso": 10, "etapa_legada": "render"},
    ],
    "timeline_e_render": [
        {"id": "preparo", "nome": "Preparando arquivos", "peso": 2, "etapa_legada": "inicio"},
        {"id": "transcricao", "nome": "Transcrevendo áudio (Whisper)", "peso": 25, "etapa_legada": "whisper"},
        {"id": "sincronizacao", "nome": "Sincronizando roteiro e cenas", "peso": 5, "etapa_legada": "matching"},
        {"id": "cortes", "nome": "Renderizando cenas", "peso": 55, "etapa_legada": "render"},
        {"id": "concatenacao", "nome": "Unindo cenas", "peso": 3, "etapa_legada": "render"},
        {"id": "mixagem", "nome": "Mixando áudio e gerando MP4", "peso": 8, "etapa_legada": "render"},
        {"id": "finalizacao", "nome": "Gerando timeline", "peso": 2, "etapa_legada": "render"},
    ],
}

# Pastas locais temporárias no SSD rápido do Colab (não usam Google Drive)
PASTA_JOBS = "/content/motor_jobs"
os.makedirs(PASTA_JOBS, exist_ok=True)

# ==============================================================================
# KEEP-ALIVE ANTI-DESCONEXÃO DO GOOGLE COLAB
# ==============================================================================
_keep_alive_ativo = True

def _keep_alive_loop():
    """Simula periodicamente interação/clique no Colab para evitar desconexão por inatividade."""
    while _keep_alive_ativo:
        time.sleep(4 * 60)
        if not _keep_alive_ativo:
            break
        try:
            display(Javascript('''
                (function() {
                    var btn = document.querySelector("#top-toolbar > colab-connect-button") ||
                              document.querySelector("colab-connect-button") ||
                              document.querySelector("#connect");
                    if (btn) {
                        btn.click();
                        console.log("[keep-alive] clique anti-inatividade executado: " + new Date().toLocaleTimeString());
                    }
                })();
            '''))
        except Exception:
            pass

_thread_keep_alive = threading.Thread(target=_keep_alive_loop, daemon=True)
_thread_keep_alive.start()
print("🟢 Keep-alive anti-desconexão ativado (pulsos a cada 4 min)")


# ==============================================================================
# 2. EXTENSÕES SUPORTADAS (CASE-INSENSITIVE)
# ==============================================================================
EXTENSOES_AUDIO = {
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.aiff', '.aif',
    '.alac', '.opus', '.mid', '.midi', '.amr', '.ac3', '.eac3', '.m4b', '.mp2', '.mpa'
}
EXTENSOES_VIDEO = {
    '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp', '.3g2', '.wmv',
    '.flv', '.f4v', '.ts', '.mts', '.m2ts', '.ogv', '.vob', '.mpeg', '.mpg',
    '.m2v', '.divx', '.asf', '.rm', '.rmvb'
}
EXTENSOES_IMAGEM = {
    '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif',
    '.svg', '.avif', '.ico', '.heic', '.heif', '.jfif', '.pjpeg', '.pjp',
    '.raw', '.cr2', '.nef', '.psd'
}
EXTENSOES_VISUAIS = EXTENSOES_VIDEO | EXTENSOES_IMAGEM

def get_ext(filename: str) -> str:
    if not filename: return ''
    limpo = str(filename).split('?')[0].split('#')[0].strip()
    _, ext = os.path.splitext(limpo)
    return ext.lower().strip()

def nome_base_sem_ext(filename: str) -> str:
    if not filename: return ''
    limpo = str(filename).split('?')[0].split('#')[0].strip()
    base, _ = os.path.splitext(limpo)
    return base.lower().strip()

def eh_audio(filename: str) -> bool:
    return get_ext(filename) in EXTENSOES_AUDIO

def eh_video(filename: str) -> bool:
    return get_ext(filename) in EXTENSOES_VIDEO

def eh_imagem(filename: str) -> bool:
    return get_ext(filename) in EXTENSOES_IMAGEM

def eh_visual(filename: str) -> bool:
    return get_ext(filename) in EXTENSOES_VISUAIS

ARQUIVOS_IGNORADOS = {
    'audio', 'bgm', 'narration', 'narracao', 'voz', 'trilha', 'music', 'musica',
    'video_final', 'video_sem_audio', 'saida', 'output', 'export', 'temp', 'preview',
    'status', 'timeline', 'roteiro', 'sub_concat', 'concat'
}

def obtem_unidades_visuais(pasta: str):
    """
    Agrupa os arquivos visuais da pasta por nome base (sem extensão).
    Se existirem um vídeo e uma imagem com o mesmo nome base (ex: '0001.mp4' e '0001.jpg' ou 'cena1.mov' e 'cena1.png'),
    eles formam UMA ÚNICA unidade visual de cena:
      - 'base': nome base padronizado (ex: '0001')
      - 'video': nome do arquivo de vídeo (ou None)
      - 'video_path': caminho absoluto do vídeo (ou None)
      - 'imagem': nome do arquivo de imagem (ou None)
      - 'image_path': caminho absoluto da imagem (ou None)
      - 'arquivo_principal': nome do vídeo (se existir) ou da imagem
      - 'tipo': 'video' (se tiver vídeo) senão 'imagem'
    
    Isso impede categoricamente que imagens complementares de vídeos sejam contadas ou processadas
    como cenas avulsas extras jogadas no final do vídeo!
    """
    if not pasta or not os.path.exists(pasta):
        return []

    grupos = {}
    arquivos = sorted(os.listdir(pasta))

    for f in arquivos:
        if not eh_visual(f) or eh_audio(f):
            continue
        # Ignora arquivos ocultos, arquivos de áudio ou arquivos gerados/auxiliares
        base_limpa = nome_base_sem_ext(f).lower()
        if f.startswith('.') or f.startswith('_') or base_limpa in ARQUIVOS_IGNORADOS:
            continue
        if any(ign in base_limpa for ign in ['video_final', 'video_sem_audio', 'output_final', 'sub_concat', 'concat']):
            continue

        base = nome_base_sem_ext(f).lower()
        if base not in grupos:
            grupos[base] = {
                'base': base,
                'video': None,
                'video_path': None,
                'imagem': None,
                'image_path': None,
                'arquivo_principal': None,
                'tipo': 'imagem'
            }

        caminho = os.path.join(pasta, f)
        if eh_video(f) and not grupos[base]['video']:
            grupos[base]['video'] = f
            grupos[base]['video_path'] = caminho
        elif eh_imagem(f) and not grupos[base]['imagem']:
            grupos[base]['imagem'] = f
            grupos[base]['image_path'] = caminho

    unidades = []
    for base, info in grupos.items():
        if info['video']:
            info['arquivo_principal'] = info['video']
            info['tipo'] = 'video'
        else:
            info['arquivo_principal'] = info['imagem']
            info['tipo'] = 'imagem'
        unidades.append(info)

    def chave_ordenacao_natural(u):
        partes = re.split(r'(\d+)', u['base'])
        return [int(p) if p.isdigit() else p.lower() for p in partes]

    unidades.sort(key=chave_ordenacao_natural)
    return unidades


# ==============================================================================
# 3. NÚCLEO DE IA — WHISPER E MATCHING
# ==============================================================================
_whisper_lock = threading.Lock()
_whisper_cache = None

def get_whisper():
    global _whisper_cache
    with _whisper_lock:
        if _whisper_cache is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"🧠 Carregando Whisper ({WHISPER_MODEL}) no dispositivo [{device.upper()}]...")
            _whisper_cache = whisper.load_model(WHISPER_MODEL, device=device)
    return _whisper_cache

def transcreve_audio(audio_path: str, cb_status=None):
    with _whisper_lock:
        is_progresso = hasattr(cb_status, "inicia_etapa")
        global _whisper_cache

        # Se o modelo ainda não estiver carregado na VRAM, sinaliza no detalhe
        if _whisper_cache is None:
            if is_progresso:
                cb_status.inicia_etapa("transcricao", detalhe="Carregando modelo Whisper...")
            elif cb_status:
                cb_status("whisper", "Carregando modelo Whisper...", 15)
            model = get_whisper()
        else:
            model = _whisper_cache
            if is_progresso:
                cb_status.inicia_etapa("transcricao", detalhe="Iniciando transcrição na GPU...")
            elif cb_status:
                cb_status("whisper", "Transcrevendo áudio com Whisper na GPU...", 15)

        # Gancho dinâmico no tqdm para capturar progresso real de frames do Whisper
        hook_instalado = False
        orig_tqdm = None
        tqdm_module = None
        tqdm_attr_name = 'tqdm'

        try:
            # Tenta interceptar o tqdm usado internamente pelo openai-whisper
            import whisper.transcribe as wt_mod
            if hasattr(wt_mod, 'tqdm'):
                attr = getattr(wt_mod, 'tqdm')
                if isinstance(attr, type):
                    orig_tqdm = attr
                    tqdm_module = wt_mod
                elif hasattr(attr, 'tqdm'):
                    orig_tqdm = attr.tqdm
                    tqdm_module = attr
        except Exception:
            pass

        if orig_tqdm is None:
            try:
                import tqdm
                orig_tqdm = tqdm.tqdm
                tqdm_module = tqdm
            except Exception:
                pass

        if orig_tqdm is not None and tqdm_module is not None:
            try:
                class WhisperHookedTqdm(orig_tqdm):
                    def __init__(self, *args, **kwargs):
                        super().__init__(*args, **kwargs)
                        self._w_total = kwargs.get('total')
                        self._w_unit = kwargs.get('unit')

                    def update(self, n=1):
                        res = super().update(n)
                        try:
                            if getattr(self, '_w_unit', None) == 'frames' and getattr(self, '_w_total', None):
                                if self._w_total > 0 and is_progresso:
                                    frac = min(1.0, max(0.0, float(self.n) / float(self._w_total)))
                                    cb_status.fracao(frac, f"Transcrevendo... {int(round(frac * 100))}%")
                        except Exception:
                            pass
                        return res

                setattr(tqdm_module, tqdm_attr_name, WhisperHookedTqdm)
                hook_instalado = True
            except Exception as e:
                print(f"⚠️ Aviso ao instalar gancho tqdm no Whisper: {e}")

        # Plano B: Thread temporizadora que atualiza apenas o detalhe a cada 20s (sem inventar percentual)
        stop_timer = threading.Event()
        def timer_plano_b():
            t0 = time.time()
            while not stop_timer.wait(20):
                elapsed = time.time() - t0
                mins = int(elapsed // 60)
                txt = f"Transcrevendo... {mins} min decorridos" if mins > 0 else f"Transcrevendo... {int(elapsed)}s decorridos"
                if is_progresso and not getattr(cb_status, "teve_fracao_recente", lambda: False)():
                    cb_status.atualiza_detalhe(txt)

        t_timer = threading.Thread(target=timer_plano_b, daemon=True)
        t_timer.start()

        try:
            # verbose=False no Whisper ativa o tqdm interno com unit='frames'
            result = model.transcribe(audio_path, word_timestamps=True, language="pt", verbose=False)
        finally:
            stop_timer.set()
            if hook_instalado and orig_tqdm is not None and tqdm_module is not None:
                try:
                    setattr(tqdm_module, tqdm_attr_name, orig_tqdm)
                except Exception:
                    pass

        palavras = []
        for seg in result['segments']:
            for w in seg.get('words', []):
                palavras.append({
                    "word":  w['word'].strip(),
                    "start": w['start'],
                    "end":   w['end'],
                })
        duracao = result['segments'][-1]['end'] if result['segments'] else 0
        return palavras, duracao

def normaliza_texto(texto: str):
    texto = texto.lower()
    texto = unicodedata.normalize('NFKD', texto)
    texto = texto.encode('ascii', 'ignore').decode('ascii')
    texto = re.sub(r'[^a-z0-9\s]', '', texto)
    return texto.split()

def le_roteiro_conteudo(conteudo: str, total_midias: int = 0):
    # Regex robusto para capturar [CENA0001], [CENA 1], [CENA_0001], [BLOCO 1], [0001], CENA 0001:, etc.
    padrao = r'(?:^|\n)\s*\[?\s*(?:cena|bloco)?\s*[_:\-]?\s*(\d+)\s*\]?\s*[:\-]?\s*(?:\n|$)'
    partes = re.split(padrao, '\n' + conteudo, flags=re.IGNORECASE)
    blocos = []
    for i in range(1, len(partes), 2):
        txt = partes[i+1].strip() if i+1 < len(partes) else ''
        if txt:
            # Remove anotações residuais visuais/técnicas que não fazem parte da locução
            txt_limpo = re.sub(r'\[(?:visual|efeito|audio|camera|b-roll)[^\]]*\]', '', txt, flags=re.IGNORECASE).strip()
            num_val = int(partes[i])
            blocos.append({"num": num_val, "id_cena": f"{num_val:04d}", "texto": txt_limpo or txt})

    if not blocos and conteudo.strip():
        linhas = [p.strip() for p in conteudo.split('\n') if p.strip()]
        if total_midias > 0:
            chunk = max(1, len(linhas) // total_midias)
            for idx in range(total_midias):
                sub_txt = " ".join(linhas[idx*chunk : (idx+1)*chunk]) if idx < total_midias - 1 else " ".join(linhas[idx*chunk:])
                num_val = idx + 1
                blocos.append({"num": num_val, "id_cena": f"{num_val:04d}", "texto": sub_txt or f"Cena {num_val}"})
        else:
            for idx, lin in enumerate(linhas):
                num_val = idx + 1
                blocos.append({"num": num_val, "id_cena": f"{num_val:04d}", "texto": lin})
    return blocos

def mapeia_timeline(palavras, duracao_audio, blocos, cb_status=None):
    is_progresso = hasattr(cb_status, "inicia_etapa")
    total_blocos = len(blocos) if blocos else 1

    if is_progresso:
        cb_status.inicia_etapa("sincronizacao", detalhe=f"Bloco 1 de {total_blocos}")
    elif cb_status:
        cb_status("matching", "Mapeando sincronia exata das cenas com Whisper...", 35)

    if not blocos:
        return []

    if not palavras or duracao_audio <= 0:
        dur_por_cena = duracao_audio / max(len(blocos), 1)
        instrucoes = []
        for i, b in enumerate(blocos):
            t_ini = round(i * dur_por_cena, 3)
            t_fim = round((i + 1) * dur_por_cena, 3) if i < len(blocos) - 1 else round(duracao_audio, 3)
            instrucoes.append({
                "id_cena":    b.get("id_cena", f"{b['num']:04d}"),
                "start":      t_ini,
                "end":        t_fim,
                "duration":   round(max(0.1, t_fim - t_ini), 3),
                "score":      0.5,
                "effect":     "none",
                "transition": "none",
            })
        return instrucoes

    whisper_norm = []
    for w in palavras:
        tok = normaliza_texto(w['word'])
        whisper_norm.append(tok[0] if tok else '')

    n_palavras = len(whisper_norm)
    total_rot = sum(len(normaliza_texto(b['texto'])) for b in blocos)
    escala = n_palavras / max(total_rot, 1)

    # Função que encontra a transição contígua exata entre Cena i e Cena i+1
    # Prioriza o início da fala da próxima cena com confirmação do fim da cena atual
    def encontra_corte_entre_cenas(bloco_atual, bloco_prox, ptr_min, ptr_max):
        prox_words = normaliza_texto(bloco_prox['texto'])
        ancora_ini = prox_words[:min(5, len(prox_words))]
        n_ini = len(ancora_ini)

        atual_words = normaliza_texto(bloco_atual['texto'])
        ancora_fim = atual_words[-min(4, len(atual_words)):] if len(atual_words) >= 4 else atual_words
        n_fim = len(ancora_fim)

        melhor_idx_corte = -1
        melhor_score = -1.0

        limite = min(ptr_max, n_palavras - max(n_ini, 1))
        for j in range(ptr_min, max(ptr_min + 1, limite + 1)):
            sub_ini = whisper_norm[j : j + n_ini]
            score_ini = SequenceMatcher(None, ancora_ini, sub_ini).ratio() if n_ini > 0 else 0.0

            score_fim = 0.0
            if j >= n_fim and n_fim > 0:
                sub_fim = whisper_norm[j - n_fim : j]
                score_fim = SequenceMatcher(None, ancora_fim, sub_fim).ratio()

            score_total = (score_ini * 0.75) + (score_fim * 0.25) if score_fim > 0 else score_ini
            if score_total > melhor_score:
                melhor_score = score_total
                melhor_idx_corte = j

        if melhor_score < 0.35:
            len_atual = len(normaliza_texto(bloco_atual['texto']))
            melhor_idx_corte = min(ptr_min + max(1, int(len_atual * escala)), n_palavras - 1)
            melhor_score = 0.35

        return melhor_idx_corte, melhor_score

    # Calcula os pontos de corte contíguos sem nenhum gap ou tela preta entre cenas
    pontos_corte = [0.0]
    scores = []
    ptr = 0

    for i in range(len(blocos) - 1):
        bloco_atual = blocos[i]
        bloco_prox = blocos[i+1]

        len_atual = len(normaliza_texto(bloco_atual['texto']))
        ptr_min = max(0, ptr + max(1, int(len_atual * escala * 0.4)))
        ptr_max = min(n_palavras, ptr + int(len_atual * escala * 1.6) + MARGEM_EXTRA + 10)

        idx_corte, score = encontra_corte_entre_cenas(bloco_atual, bloco_prox, ptr_min, ptr_max)
        t_corte = palavras[idx_corte]['start'] if idx_corte < len(palavras) else duracao_audio
        t_corte = max(t_corte, pontos_corte[-1] + 0.3)
        pontos_corte.append(round(t_corte, 3))
        scores.append(round(score, 2))
        ptr = max(ptr + 1, idx_corte)

        if is_progresso:
            cb_status.fracao((i + 1) / float(total_blocos), f"Bloco {i + 1} de {total_blocos}")

    pontos_corte.append(round(duracao_audio, 3))
    scores.append(1.0)
    if is_progresso:
        cb_status.fracao(1.0, f"Bloco {total_blocos} de {total_blocos}")

    instrucoes = []
    for i in range(len(blocos)):
        t_ini = pontos_corte[i]
        t_fim = pontos_corte[i+1]
        dur = round(max(0.1, t_fim - t_ini), 3)

        instrucoes.append({
            "id_cena":    blocos[i].get("id_cena", f"{blocos[i]['num']:04d}"),
            "start":      round(t_ini, 3),
            "end":        round(t_fim, 3),
            "duration":   dur,
            "score":      scores[i] if i < len(scores) else 0.9,
            "effect":     "none",
            "transition": "none",
        })

    return instrucoes


# ==============================================================================
# 4. RENDERIZADOR FFMPEG
# ==============================================================================
def obtem_duracao_midia(path: str) -> float:
    """Obtém a duração exata do stream de vídeo/áudio via ffprobe."""
    if not path or not os.path.exists(path):
        return 0.0
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path
        ]
        out = subprocess.check_output(cmd, text=True).strip()
        if out and out != 'N/A':
            val = float(out)
            if val > 0.05: return val
    except Exception:
        pass
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path
        ]
        out = subprocess.check_output(cmd, text=True).strip()
        val = float(out)
        return max(val, 0.05)
    except Exception:
        try:
            from moviepy.editor import VideoFileClip
            with VideoFileClip(path) as clip:
                return float(clip.duration)
        except Exception:
            return 0.0

def video_tem_audio(path: str) -> bool:
    """Verifica se o arquivo de vídeo possui uma faixa de áudio válida."""
    if not path or not os.path.exists(path):
        return False
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=codec_type',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path
        ]
        out = subprocess.check_output(cmd, text=True).strip()
        return bool(out and 'audio' in out.lower())
    except Exception:
        return False

def renderiza_trecho_visual(src, dur, dst_path, fit='contain', efeito='none', filtro='none', filtro_int=100, transicao='none', trans_dur=0.8, slow_factor=1.0, volume=0.0, resolucao=RESOLUCAO, preset="fast", crf=None):
    """
    Renderiza um trecho visual individual (vídeo ou imagem) com FFmpeg padronizado na resolução final.
    Suporta escala, slow motion suave via setpts, efeitos de câmera, filtros e áudio sincronizado com volume individual.
    """
    is_vid = eh_video(src)
    vf_parts = []

    # 1. Normalização de PTS (evita offsets de tempo herdados do container/codec do vídeo original)
    if is_vid:
        if slow_factor > 1.001:
            vf_parts.append(f"setpts=(PTS-STARTPTS)*{slow_factor:.5f}")
        else:
            vf_parts.append("setpts=PTS-STARTPTS")

    # 2. Ajuste de escala e proporção (contain / cover) conforme resolução configurada
    if fit == 'cover':
        vf_parts.append(f"scale={resolucao[0]}:{resolucao[1]}:force_original_aspect_ratio=increase,crop={resolucao[0]}:{resolucao[1]}")
    else:
        vf_parts.append(f"scale={resolucao[0]}:{resolucao[1]}:force_original_aspect_ratio=decrease,pad={resolucao[0]}:{resolucao[1]}:(ow-iw)/2:(oh-ih)/2:black")

    # 3. Efeitos de movimento de câmera em imagens
    if not is_vid:
        nb_frames = max(1, int(dur * FPS))
        if efeito in ('kenburns', 'zoom_in'):
            vf_parts.append(f"zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={FPS}")
        elif efeito == 'zoom_out':
            vf_parts.append(f"zoompan=z='if(eq(on\\,1)\\,1.1\\,max(zoom-0.0008\\,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={FPS}")
        elif efeito == 'pan_right':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,0\\,x+0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={FPS}")
        elif efeito == 'pan_left':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,iw*0.1-iw/zoom/2\\,x-0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={FPS}")

    # 4. Filtros de cor
    intensidade = filtro_int / 100.0
    if filtro == 'grayscale': vf_parts.append("hue=s=0")
    elif filtro == 'sepia': vf_parts.append("colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131")
    elif filtro == 'blur': vf_parts.append(f"gblur=sigma={max(1, int(filtro_int / 10))}")
    elif filtro == 'contrast': vf_parts.append(f"eq=contrast={1.0 + intensidade:.2f}")
    elif filtro == 'saturate': vf_parts.append(f"hue=s={1.0 + intensidade * 2:.2f}")

    # 5. Transições de fade (in/out)
    fade_dur = min(trans_dur, dur * 0.4, 1.5)
    if transicao in ('dissolve', 'crossfade', 'fade', 'fadeblack', 'slideleft', 'slideright', 'slideup', 'slidedown', 'wipeleft', 'wiperight'):
        vf_parts.append(f"fade=t=in:st=0:d={fade_dur:.2f}")
        if dur > fade_dur * 2:
            vf_parts.append(f"fade=t=out:st={dur - fade_dur:.2f}:d={fade_dur:.2f}")
    elif transicao == 'fadewhite':
        vf_parts.append(f"fade=t=in:st=0:d={fade_dur:.2f}:color=white")
        if dur > fade_dur * 2:
            vf_parts.append(f"fade=t=out:st={dur - fade_dur:.2f}:d={fade_dur:.2f}:color=white")

    vf_parts.append(f"fps={FPS}")
    vf_chain = ",".join(vf_parts)

    tem_som_valido = is_vid and (float(volume) > 0.001) and video_tem_audio(src)

    # Argumentos de codificação libx264 com preset e crf configurados
    args_video = ['-c:v', 'libx264', '-preset', preset]
    if crf:
        args_video.extend(['-crf', str(crf)])

    if tem_som_valido:
        af_parts = []
        if slow_factor > 1.001:
            af_parts.append(f"atempo={max(0.5, 1.0/slow_factor):.5f}")
        af_parts.append(f"volume={float(volume):.2f}")
        af_chain = ",".join(af_parts)

        cmd = [
            'ffmpeg', '-y', '-i', src, '-t', str(dur),
            '-vf', vf_chain, '-af', af_chain,
            *args_video, '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '48000', '-ac', '2',
            '-video_track_timescale', '90000',
            dst_path
        ]
    else:
        cmd = [
            'ffmpeg', '-y',
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-i', src, '-t', str(dur),
            '-vf', vf_chain,
            *args_video, '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '48000', '-ac', '2',
            '-map', '1:v:0', '-map', '0:a:0',
            '-video_track_timescale', '90000',
            dst_path
        ]
    subprocess.run(cmd, capture_output=True)

def renderiza_video(instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, cb_status=None, resolucao=RESOLUCAO, preset="fast", crf=None, formato="", qualidade=""):
    is_progresso = hasattr(cb_status, "inicia_etapa")
    total_cenas = len(instrucoes) if instrucoes else 1

    if is_progresso:
        cb_status.inicia_etapa("cortes", detalhe=f"Cena 1 de {total_cenas}")
    elif cb_status:
        msg_status = f"Renderizando {formato} em {qualidade} (gerando cortes na GPU)..." if (formato and qualidade) else "Gerando cortes e analisando vídeos/imagens na GPU..."
        cb_status("render", msg_status, 60)

    tmp_dir = tempfile.mkdtemp(prefix='motor_render_')
    t_inicio_etapa_cortes = time.time()
    
    try:
        clips_processados = []
        unidades_visuais = obtem_unidades_visuais(pasta_job)

        for i, cena in enumerate(instrucoes):
            # Duração exata do corte
            if 'duration' in cena and float(cena['duration']) > 0:
                dur_real = float(cena['duration'])
            elif 'end' in cena and 'start' in cena and float(cena['end']) > float(cena['start']):
                dur_real = float(cena['end']) - float(cena['start'])
            elif i < len(instrucoes) - 1:
                dur_real = instrucoes[i + 1]['start'] - cena['start']
            else:
                dur_real = duracao_audio - cena['start']
            dur_real = max(dur_real, 0.1)

            id_cena = cena.get('id_cena', f"{i+1:04d}")
            arquivo = cena.get('arquivo', None)

            # Busca se existe VÍDEO e IMAGEM para esta cena (Preferência para o vídeo)
            id_str = str(id_cena).strip().lower()
            id_clean = id_str.lstrip('0') or '0'
            base_decl = nome_base_sem_ext(arquivo).lower() if arquivo else id_str
            base_decl_clean = base_decl.lstrip('0') or '0'

            unidade_escolhida = None

            # 1. Correspondência com arquivo declarado ou base_decl
            id_digits = re.sub(r'\D', '', id_str).lstrip('0') or '0'
            for u in unidades_visuais:
                b = u['base']
                b_clean = b.lstrip('0') or '0'
                b_digits = re.sub(r'\D', '', b).lstrip('0') or '0'
                if (arquivo and (arquivo.lower() == (u['video'] or '').lower() or arquivo.lower() == (u['imagem'] or '').lower())) \
                   or b == base_decl or b_clean == base_decl_clean or (b_digits and b_digits == id_digits):
                    unidade_escolhida = u
                    break

            # 2. Se não achou, correspondência por ID da cena ou dígitos
            if not unidade_escolhida:
                for u in unidades_visuais:
                    b = u['base']
                    b_clean = b.lstrip('0') or '0'
                    b_digits = re.sub(r'\D', '', b).lstrip('0') or '0'
                    if b == id_str or b_clean == id_clean or (b_digits and b_digits == id_digits) or id_str in b or b in id_str:
                        unidade_escolhida = u
                        break

            # 3. Fallback sequencial por índice sobre UNIDADES (sem ciclar com % para nunca duplicar 0001.mp4!)
            if not unidade_escolhida and i < len(unidades_visuais):
                unidade_escolhida = unidades_visuais[i]

            video_src = unidade_escolhida['video_path'] if unidade_escolhida else None
            image_src = unidade_escolhida['image_path'] if unidade_escolhida else None

            # Fallback direto se o arquivo foi informado especificamente e existe no disco
            if not video_src and not image_src and arquivo:
                caminho_dir = os.path.join(pasta_job, arquivo)
                if os.path.exists(caminho_dir):
                    if eh_video(arquivo): video_src = caminho_dir
                    elif eh_imagem(arquivo): image_src = caminho_dir

            dst = os.path.join(tmp_dir, f"cena_{i:04d}.mp4")

            # Efeitos e parâmetros da cena
            fit        = cena.get('fit', 'contain')
            efeito     = cena.get('effect', 'none')
            filtro     = cena.get('filter', 'none')
            filtro_int = int(cena.get('filter_intensity', 100))
            transicao  = cena.get('transition', 'none')
            trans_dur  = float(cena.get('transition_duration', 0.8))
            volume     = float(cena.get('volume', 0.0))

            # ==================================================================
            # REGRAS DE DECISÃO VÍDEO vs IMAGEM (PREFERÊNCIA PARA O VÍDEO):
            # ==================================================================
            dur_vid = obtem_duracao_midia(video_src) if video_src else 0.0

            if video_src and dur_vid > 0.05:
                # --------------------------------------------------------------
                # Caso A: A cena é MENOR ou igual ao vídeo
                # -> O vídeo deve ser CORTADO para encaixar na cena
                # --------------------------------------------------------------
                if dur_real <= dur_vid:
                    print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) CORTADO para encaixar na cena ({dur_real:.2f}s) | Vol: {int(volume*100)}%")
                    renderiza_trecho_visual(
                        src=video_src, dur=dur_real, dst_path=dst,
                        fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                        transicao=transicao, trans_dur=trans_dur, slow_factor=1.0,
                        volume=volume, resolucao=resolucao, preset=preset, crf=crf
                    )

                # --------------------------------------------------------------
                # Caso B: A cena é MAIOR que o vídeo ATÉ 40% (dur_vid < dur <= 1.40 * dur_vid)
                # -> O script REDUZ A VELOCIDADE do vídeo (slow-motion) para preencher a cena
                # --------------------------------------------------------------
                elif dur_real <= (dur_vid * 1.40):
                    fator_slow = dur_real / dur_vid
                    print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) DESACELERADO ({fator_slow:.2f}x) para preencher a cena ({dur_real:.2f}s) | Vol: {int(volume*100)}%")
                    renderiza_trecho_visual(
                        src=video_src, dur=dur_real, dst_path=dst,
                        fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                        transicao=transicao, trans_dur=trans_dur, slow_factor=fator_slow,
                        volume=volume, resolucao=resolucao, preset=preset, crf=crf
                    )

                # --------------------------------------------------------------
                # Caso C: A cena é MAIOR que 40% do tamanho do vídeo (> 1.40 * dur_vid)
                # -> Começa com o VÍDEO em velocidade normal e COMPLETA com a IMAGEM de mesmo nome
                # --------------------------------------------------------------
                else:
                    if image_src:
                        dur_parte_video = dur_vid
                        dur_parte_imagem = max(0.1, round(dur_real - dur_vid, 3))
                        print(f"      🎬 Cena {i+1} ({id_cena}): Cena ({dur_real:.2f}s) > 140% do vídeo ({dur_vid:.2f}s) -> Vídeo ({dur_parte_video:.2f}s) + Imagem ({dur_parte_imagem:.2f}s) | Vol: {int(volume*100)}%")

                        p1 = os.path.join(tmp_dir, f"cena_{i:04d}_p1.mp4")
                        p2 = os.path.join(tmp_dir, f"cena_{i:04d}_p2.mp4")

                        # 1. Vídeo inicial na sua velocidade natural com volume configurado
                        renderiza_trecho_visual(
                            src=video_src, dur=dur_parte_video, dst_path=p1,
                            fit=fit, efeito='none', filtro=filtro, filtro_int=filtro_int,
                            transicao=transicao, trans_dur=trans_dur, slow_factor=1.0,
                            volume=volume, resolucao=resolucao, preset=preset, crf=crf
                        )

                        # 2. Imagem companheira completando o restante do tempo (com faixa de áudio silenciosa padronizada)
                        renderiza_trecho_visual(
                            src=image_src, dur=dur_parte_imagem, dst_path=p2,
                            fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                            transicao='none', trans_dur=trans_dur, slow_factor=1.0,
                            volume=0.0, resolucao=resolucao, preset=preset, crf=crf
                        )

                        # 3. Concatenação perfeita com filter_complex (áudio e vídeo em sincronia precisa)
                        cmd_concat = [
                            'ffmpeg', '-y',
                            '-i', p1, '-i', p2,
                            '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]concat=n=2:v=0:a=1[a]',
                            '-map', '[v]', '-map', '[a]',
                            '-c:v', 'libx264', '-preset', preset,
                        ]
                        if crf:
                            cmd_concat.extend(['-crf', str(crf)])
                        cmd_concat.extend([
                            '-pix_fmt', 'yuv420p', '-r', str(FPS),
                            '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                            dst
                        ])
                        subprocess.run(cmd_concat, capture_output=True)
                    else:
                        # Sem imagem companheira: reproduz o vídeo e congela no último frame para preencher o tempo da fala
                        print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) estendido com freeze do último frame para preencher ({dur_real:.2f}s) | Vol: {int(volume*100)}%")
                        dur_freeze = max(0.1, round(dur_real - dur_vid, 3))
                        vf_freeze = f"setpts=PTS-STARTPTS,scale={resolucao[0]}:{resolucao[1]}:force_original_aspect_ratio=decrease,pad={resolucao[0]}:{resolucao[1]}:(ow-iw)/2:(oh-ih)/2:black,tpad=stop_mode=clone:stop_duration={dur_freeze:.3f},fps={FPS}"
                        tem_som_valido = (volume > 0.001) and video_tem_audio(video_src)
                        args_freeze = ['-c:v', 'libx264', '-preset', preset]
                        if crf:
                            args_freeze.extend(['-crf', str(crf)])

                        if tem_som_valido:
                            cmd_freeze = [
                                'ffmpeg', '-y', '-i', video_src, '-t', str(dur_real),
                                '-vf', vf_freeze,
                                '-af', f"volume={volume:.2f},apad=pad_dur={dur_freeze:.3f}",
                                *args_freeze,
                                '-pix_fmt', 'yuv420p',
                                '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                                dst
                            ]
                        else:
                            cmd_freeze = [
                                'ffmpeg', '-y',
                                '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
                                '-i', video_src, '-t', str(dur_real),
                                '-vf', vf_freeze,
                                *args_freeze,
                                '-pix_fmt', 'yuv420p',
                                '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                                '-map', '1:v:0', '-map', '0:a:0',
                                dst
                            ]
                        subprocess.run(cmd_freeze, capture_output=True)

            elif image_src:
                # Caso sem vídeo: renderiza imagem normalmente com áudio mudo padronizado
                print(f"      🖼️ Cena {i+1} ({id_cena}): Imagem ({os.path.basename(image_src)}) com duração {dur_real:.2f}s")
                renderiza_trecho_visual(
                    src=image_src, dur=dur_real, dst_path=dst,
                    fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                    transicao=transicao, trans_dur=trans_dur, slow_factor=1.0,
                    volume=0.0, resolucao=resolucao, preset=preset, crf=crf
                )

            else:
                # Nenhuma mídia encontrada -> fundo preto com áudio silencioso padronizado
                print(f"      ⚠️ Nenhuma mídia encontrada para cena {i+1} ({id_cena}) -> gerando fundo preto")
                cmd_black = [
                    'ffmpeg', '-y',
                    '-f', 'lavfi', '-i', f'color=black:size={resolucao[0]}x{resolucao[1]}:duration={dur_real}',
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
                    '-t', str(dur_real),
                    '-r', str(FPS), '-pix_fmt', 'yuv420p',
                    '-c:v', 'libx264', '-preset', preset,
                ]
                if crf:
                    cmd_black.extend(['-crf', str(crf)])
                cmd_black.extend([
                    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                    '-map', '0:v:0', '-map', '1:a:0',
                    dst
                ])
                subprocess.run(cmd_black, capture_output=True)

            clips_processados.append({'path': dst, 'duration': dur_real})

            # Progresso real por cena e cálculo de ETA na GPU a partir da 2ª cena concluída
            idx_cena = i + 1
            if is_progresso:
                eta_s = None
                if idx_cena >= 2 and idx_cena < total_cenas:
                    tempo_decorrido = time.time() - t_inicio_etapa_cortes
                    tempo_medio = tempo_decorrido / float(idx_cena)
                    cenas_restantes = total_cenas - idx_cena
                    eta_s = int(round(tempo_medio * cenas_restantes))
                cb_status.fracao(idx_cena / float(total_cenas), f"Cena {idx_cena} de {total_cenas}", eta_s=eta_s)

        if is_progresso:
            cb_status.inicia_etapa("concatenacao", detalhe="Unindo cenas com FFmpeg...")
        elif cb_status:
            cb_status("render", "Concatenando timeline de vídeo...", 80)
        concat_txt = os.path.join(tmp_dir, 'concat.txt')
        with open(concat_txt, 'w', encoding='utf-8') as f:
            for clip in clips_processados:
                f.write(f"file '{clip['path']}'\n")

        v_temp = os.path.join(tmp_dir, 'video_com_som_ambiente.mp4')
        subprocess.run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', concat_txt, '-c', 'copy', '-fflags', '+genpts', v_temp
        ], capture_output=True)

        if is_progresso:
            cb_status.inicia_etapa("mixagem", detalhe="Mixando áudio e gerando MP4 final...")
        elif cb_status:
            cb_status("render", "Mixando áudio e gerando MP4 final...", 90)
        
        # BGM opcional
        bgm_path = None
        for f in os.listdir(pasta_job):
            if nome_base_sem_ext(f) == 'bgm' and eh_audio(f):
                bgm_path = os.path.join(pasta_job, f)
                break

        # Mixagem do áudio ambiente dos clipes (0:a), voz/narração master (1:a) e BGM opcional (2:a)
        if bgm_path and os.path.exists(bgm_path):
            subprocess.run([
                'ffmpeg', '-y',
                '-i', v_temp,
                '-i', audio_path,
                '-i', bgm_path,
                '-filter_complex', '[0:a]volume=1.0[amb];[1:a]volume=1.0[voz];[2:a]volume=0.2[bgm];[voz][amb][bgm]amix=inputs=3:duration=first:dropout_transition=2[aout]',
                '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
                '-shortest', '-map', '0:v:0', '-map', '[aout]', saida_mp4
            ], capture_output=True)
        else:
            subprocess.run([
                'ffmpeg', '-y',
                '-i', v_temp,
                '-i', audio_path,
                '-filter_complex', '[0:a]volume=1.0[amb];[1:a]volume=1.0[voz];[voz][amb]amix=inputs=2:duration=first:dropout_transition=2[aout]',
                '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
                '-shortest', '-map', '0:v:0', '-map', '[aout]', saida_mp4
            ], capture_output=True)

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ==============================================================================
# 5. FASTAPI APP COM CORS & BYPASS DO NGROK
# ==============================================================================
app = FastAPI(title="Motor de Dobra 4.2 AI Studio", version="4.2")

# CORS liberado para qualquer origem (Vercel, AI Studio, localhost) sem conflito de credenciais
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Middleware para injetar bypass do ngrok e cabeçalhos CORS limpos
@app.middleware("http")
async def add_ngrok_bypass_headers(request, call_next):
    if request.method == "OPTIONS":
        response = JSONResponse(content={"ok": True})
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, HEAD"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["ngrok-skip-browser-warning"] = "1"
        return response

    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "1"
    if "Access-Control-Allow-Origin" not in response.headers:
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# Gerenciamento de status em memória
JOBS_STATUS = {}

def set_job_status(job_id: str, etapa: str, mensagem: str, progresso: int, erro: str = None, **extras):
    status_dict = {
        "job_id": job_id,
        "etapa": etapa,
        "mensagem": mensagem,
        "progresso": progresso,
        "timestamp": datetime.now().isoformat(),
        "erro": erro,
        "etapa_id": extras.get("etapa_id"),
        "etapas": extras.get("etapas"),
        "etapa_indice": extras.get("etapa_indice"),
        "etapa_total": extras.get("etapa_total"),
        "etapa_pct": extras.get("etapa_pct", 0),
        "detalhe": extras.get("detalhe"),
        "eta_s": extras.get("eta_s"),
    }
    for k, v in extras.items():
        status_dict[k] = v
    JOBS_STATUS[job_id] = status_dict

    try:
        p_job = os.path.join(PASTA_JOBS, job_id)
        if os.path.exists(p_job):
            with open(os.path.join(p_job, "status.json"), "w", encoding="utf-8") as f:
                json.dump(status_dict, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


class ProgressoJob:
    """
    Controlador de progresso real por etapa com pesos calibráveis,
    cálculo acumulativo que nunca regride, medição de tempo por etapa e ETA.
    """
    def __init__(self, job_id: str, plano_chave: str):
        self.job_id = job_id
        self.plano_chave = plano_chave
        self.definicoes = PLANOS_ETAPAS.get(plano_chave, PLANOS_ETAPAS["timeline"])
        self.etapa_atual_id = None
        self.etapa_atual_idx = 0
        self.progresso_global = 0
        self.etapa_pct = 0
        self.detalhe = None
        self.eta_s = None
        self.t_inicio_etapa = None
        self.t_fracao_recente = 0.0

        self.etapas = [
            {"id": e["id"], "nome": e["nome"], "estado": "pendente"}
            for e in self.definicoes
        ]

    def _pesos_acumulados_anteriores(self, idx: int) -> float:
        return sum(self.definicoes[i]["peso"] for i in range(idx))

    def inicia_etapa(self, etapa_id: str, detalhe: str = None):
        agora = time.time()
        # Ao fim de cada etapa, imprime no console o tempo gasto para calibração de pesos
        if self.etapa_atual_id and self.t_inicio_etapa:
            tempo_gasto = agora - self.t_inicio_etapa
            print(f"⏱️ {self.etapa_atual_id}: {int(round(tempo_gasto))}s")

        idx = 0
        for i, e in enumerate(self.definicoes):
            if e["id"] == etapa_id:
                idx = i
                break

        self.etapa_atual_id = etapa_id
        self.etapa_atual_idx = idx
        self.t_inicio_etapa = agora
        self.etapa_pct = 0
        self.detalhe = detalhe
        self.eta_s = None

        for i in range(len(self.etapas)):
            if i < idx:
                self.etapas[i]["estado"] = "concluida"
            elif i == idx:
                self.etapas[i]["estado"] = "em_andamento"
            else:
                if self.etapas[i]["estado"] != "erro":
                    self.etapas[i]["estado"] = "pendente"

        peso_acum = self._pesos_acumulados_anteriores(idx)
        self.progresso_global = max(self.progresso_global, min(99, int(round(peso_acum))))

        msg = self.definicoes[idx]["nome"] if idx < len(self.definicoes) else "Processando..."
        etapa_legada = self.definicoes[idx].get("etapa_legada", "render") if idx < len(self.definicoes) else "render"
        self._publica(etapa_legada, msg)

    def fracao(self, f: float, detalhe: str = None, eta_s: float = None):
        self.t_fracao_recente = time.time()
        f_clamped = max(0.0, min(1.0, float(f)))
        self.etapa_pct = int(round(f_clamped * 100))

        if detalhe is not None:
            self.detalhe = detalhe
        if eta_s is not None:
            self.eta_s = int(round(eta_s))

        idx = self.etapa_atual_idx
        peso_acum = self._pesos_acumulados_anteriores(idx)
        peso_etapa = self.definicoes[idx]["peso"] if idx < len(self.definicoes) else 0

        novo_prog = peso_acum + (peso_etapa * f_clamped)
        # O progresso global nunca diminui e fica limitado a 99 até o concluído final
        self.progresso_global = max(self.progresso_global, min(99, int(round(novo_prog))))

        msg = self.definicoes[idx]["nome"] if idx < len(self.definicoes) else "Processando..."
        etapa_legada = self.definicoes[idx].get("etapa_legada", "render") if idx < len(self.definicoes) else "render"
        self._publica(etapa_legada, msg)

    def atualiza_detalhe(self, detalhe: str):
        self.detalhe = detalhe
        idx = self.etapa_atual_idx
        msg = self.definicoes[idx]["nome"] if idx < len(self.definicoes) else "Processando..."
        etapa_legada = self.definicoes[idx].get("etapa_legada", "render") if idx < len(self.definicoes) else "render"
        self._publica(etapa_legada, msg)

    def teve_fracao_recente(self, janela_s: float = 25.0) -> bool:
        return (time.time() - self.t_fracao_recente) < janela_s

    def conclui(self, msg: str = "Job finalizado com sucesso!"):
        agora = time.time()
        if self.etapa_atual_id and self.t_inicio_etapa:
            tempo_gasto = agora - self.t_inicio_etapa
            print(f"⏱️ {self.etapa_atual_id}: {int(round(tempo_gasto))}s")

        for e in self.etapas:
            e["estado"] = "concluida"

        self.progresso_global = 100
        self.etapa_pct = 100
        self.detalhe = None
        self.eta_s = None
        self._publica("concluido", msg)

    def __call__(self, etapa: str, msg: str, prog: int = None, err: str = None, **extras):
        if etapa == "concluido":
            self.conclui(msg)
        elif etapa == "erro":
            if 0 <= self.etapa_atual_idx < len(self.etapas):
                self.etapas[self.etapa_atual_idx]["estado"] = "erro"
            set_job_status(
                self.job_id,
                "erro",
                msg,
                self.progresso_global,
                err or msg,
                etapa_id=self.etapa_atual_id,
                etapas=self.etapas,
                etapa_indice=self.etapa_atual_idx + 1,
                etapa_total=len(self.etapas),
                etapa_pct=self.etapa_pct,
                detalhe=self.detalhe,
                eta_s=None,
            )
        elif etapa == "inicio":
            if not self.etapa_atual_id and self.definicoes:
                self.inicia_etapa(self.definicoes[0]["id"], detalhe=msg)
            else:
                self._publica("inicio", msg)
        else:
            if prog is not None:
                self.progresso_global = max(self.progresso_global, min(99, prog))
            self._publica(etapa, msg)

    def _publica(self, etapa_legada: str, msg: str):
        set_job_status(
            self.job_id,
            etapa_legada,
            msg,
            self.progresso_global,
            None,
            etapa_id=self.etapa_atual_id,
            etapas=self.etapas,
            etapa_indice=self.etapa_atual_idx + 1,
            etapa_total=len(self.etapas),
            etapa_pct=self.etapa_pct,
            detalhe=self.detalhe,
            eta_s=self.eta_s,
        )

@app.get("/")
@app.get("/status")
def get_engine_status():
    gpu_nome = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    return {
        "status": "online",
        "motor": "Motor de Dobra 4.2 AI Studio",
        "versao": "4.2-ngrok-direct",
        "gpu": gpu_nome,
        "whisper_model": WHISPER_MODEL,
        "sem_drive": True,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/job_status/{job_id}")
def get_status(job_id: str):
    if job_id not in JOBS_STATUS:
        # Tenta ler do disco
        p = os.path.join(PASTA_JOBS, job_id, "status.json")
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return JOBS_STATUS[job_id]

def processa_job_background(job_id: str, tipo: str, formato: str = "", qualidade: str = ""):
    pasta_job = os.path.join(PASTA_JOBS, job_id)

    # Resolução do perfil de vídeo configurado
    perfil = resolve_perfil(formato, qualidade)
    resolucao_job = perfil["resolucao"]
    preset_job = perfil["preset"]
    crf_job = perfil["crf"]

    # Verifica se já temos timeline.json pronta (enviada diretamente pelo App na renderização)
    timeline_enviada = os.path.join(pasta_job, "timeline.json")
    usando_timeline_pronta = False
    instrucoes = []
    duracao_audio = 0.0

    if tipo == 'render' and os.path.exists(timeline_enviada):
        try:
            with open(timeline_enviada, 'r', encoding='utf-8') as f:
                tl_pronta = json.load(f)
            if 'cenas' in tl_pronta and len(tl_pronta['cenas']) > 0:
                instrucoes = tl_pronta['cenas']
                duracao_audio = float(tl_pronta.get('duracao_total', 0.0))
                usando_timeline_pronta = True
                print(f"🎬 Usando timeline enviada pelo App: {len(instrucoes)} cenas")
        except Exception as e:
            print(f"⚠️ Erro ao ler timeline.json enviada: {e}")

    # Escolhe o plano de etapas e instancia ProgressoJob
    if tipo == 'timeline':
        plano_chave = 'timeline'
    elif usando_timeline_pronta:
        plano_chave = 'render_com_timeline'
    else:
        plano_chave = 'timeline_e_render'

    progresso = ProgressoJob(job_id, plano_chave)
    progresso.inicia_etapa("preparo", detalhe="Verificando arquivos recebidos...")

    try:
        # Acha áudio principal
        audio_path = None
        for f in os.listdir(pasta_job):
            if eh_audio(f) and not f.lower().startswith('bgm.'):
                audio_path = os.path.join(pasta_job, f)
                break
        if not audio_path:
            raise FileNotFoundError("Nenhum arquivo de áudio principal (.mp3/.wav/etc) foi enviado no job")

        if not usando_timeline_pronta:
            # Acha roteiro
            roteiro_path = None
            for f in os.listdir(pasta_job):
                if get_ext(f) in ['.txt', '.md'] or 'roteiro' in f.lower():
                    roteiro_path = os.path.join(pasta_job, f)
                    break
            if not roteiro_path:
                raise FileNotFoundError("Arquivo de roteiro (.txt/.md) não encontrado")

            with open(roteiro_path, 'r', encoding='utf-8') as f:
                conteudo_roteiro = f.read()

            unidades_visuais = obtem_unidades_visuais(pasta_job)
            total_visuais = len(unidades_visuais)
            blocos = le_roteiro_conteudo(conteudo_roteiro, total_visuais)

            # Se o roteiro tiver mais blocos que o total de mídias visuais enviadas,
            # limita o número de blocos para coincidir exatamente com as mídias, consolidando o texto excedente.
            # Isso impede categoricamente que cenas extras no final repitam 0001.mp4!
            if total_visuais > 0 and len(blocos) > total_visuais:
                texto_extra = " ".join([b['texto'] for b in blocos[total_visuais:] if b.get('texto')])
                blocos = blocos[:total_visuais]
                if texto_extra and blocos:
                    blocos[-1]['texto'] = f"{blocos[-1]['texto']} {texto_extra}".strip()
                print(f"✂️ Limitando para {total_visuais} cenas para coincidir com as mídias enviadas.")

            # Transcrição Whisper com progresso real de frames
            palavras, duracao_audio = transcreve_audio(audio_path, progresso)

            # Mapeamento e sincronia de roteiro bloco a bloco
            instrucoes = mapeia_timeline(palavras, duracao_audio, blocos, progresso)

            def acha_midia_job(id_cena, idx):
                id_str = str(id_cena).strip().lower()
                id_clean = id_str.lstrip('0') or '0'
                id_digits = re.sub(r'\D', '', id_str).lstrip('0') or '0'

                # 1. Correspondência exata de ID ou nome base na lista de unidades agrupadas
                for u in unidades_visuais:
                    b = u['base']
                    b_clean = b.lstrip('0') or '0'
                    b_digits = re.sub(r'\D', '', b).lstrip('0') or '0'
                    if b == id_str or b_clean == id_clean or (b_digits and b_digits == id_digits):
                        return u['arquivo_principal'], u['tipo']

                # 2. Correspondência parcial ou contenção
                for u in unidades_visuais:
                    b = u['base']
                    b_clean = b.lstrip('0') or '0'
                    if id_str in b or b in id_str or (id_clean and (id_clean in b or b in id_clean)):
                        return u['arquivo_principal'], u['tipo']

                # 3. Fallback sequencial por índice de unidades (sem nunca ciclar com % para não repetir 0001.mp4)
                if idx < len(unidades_visuais):
                    u = unidades_visuais[idx]
                    return u['arquivo_principal'], u['tipo']

                return f"{id_cena}.jpg", 'imagem'

            cenas_json = []
            for i, c in enumerate(instrucoes):
                dur_real = instrucoes[i+1]['start'] - c['start'] if i < len(instrucoes)-1 else duracao_audio - c['start']
                nome_arquivo, tipo_m = acha_midia_job(c['id_cena'], i)
                cenas_json.append({
                    "id_cena": c['id_cena'],
                    "arquivo": nome_arquivo,
                    "tipo": tipo_m,
                    "start": c['start'],
                    "end": c['end'],
                    "duration": c['duration'],
                    "duration_real": round(max(dur_real, 0.1), 3),
                    "score": c['score'],
                    "startTime": c['start'],
                    "trackId": "video-1"
                })

            timeline_data = {
                "versao": "4.2",
                "gerado_por": f"Motor de Dobra 4.2 (ngrok API) / Whisper {WHISPER_MODEL}",
                "timestamp": datetime.now().isoformat(),
                "audio": os.path.basename(audio_path),
                "duracao_total": round(duracao_audio, 3),
                "total_cenas": len(instrucoes),
                "cenas": cenas_json
            }

            # Etapa de gravação da timeline.json
            progresso.inicia_etapa("finalizacao", detalhe="Salvando timeline.json...")
            saida_json = os.path.join(pasta_job, "timeline.json")
            with open(saida_json, 'w', encoding='utf-8') as f:
                json.dump(timeline_data, f, ensure_ascii=False, indent=2)

        # Renderização em MP4 se solicitada
        if tipo in ['timeline_e_render', 'render']:
            saida_mp4 = os.path.join(pasta_job, "video_final.mp4")
            renderiza_video(
                instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, progresso,
                resolucao=resolucao_job, preset=preset_job, crf=crf_job,
                formato=formato, qualidade=qualidade
            )

        progresso.conclui("Job finalizado com sucesso!")
    except Exception as e:
        print(f"❌ Erro no job {job_id}: {e}")
        progresso("erro", f"Erro: {str(e)}", err=str(e))

@app.post("/api/enviar_job")
async def enviar_job(
    background_tasks: BackgroundTasks,
    tipo: str = Form("timeline"),
    formato: str = Form(""),
    qualidade: str = Form(""),
    arquivos: List[UploadFile] = File(...)
):
    """
    Recebe os arquivos enviados diretamente pelo frontend do PC (via formulário multipart)
    sem precisar salvar nem sincronizar nada no Google Drive!
    """
    f_clean = (formato or "").strip()
    q_clean = (qualidade or "").strip()

    # Validação de formato e qualidade contra whitelist
    formatos_validos = ["16:9", "9:16", "1:1"]
    qualidades_validas = ["480p", "720p", "1080p"]

    if f_clean and f_clean not in formatos_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Formato de renderização inválido: '{f_clean}'. Formatos suportados: 16:9, 9:16, 1:1."
        )
    if q_clean and q_clean not in qualidades_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Qualidade de renderização inválida: '{q_clean}'. Qualidades suportadas: 480p, 720p, 1080p."
        )

    job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    pasta_job = os.path.join(PASTA_JOBS, job_id)
    os.makedirs(pasta_job, exist_ok=True)

    # Salva arquivos recebidos no SSD local do Colab
    for arq in arquivos:
        nome_seguro = os.path.basename(arq.filename)
        destino = os.path.join(pasta_job, nome_seguro)
        with open(destino, "wb") as buffer:
            shutil.copyfileobj(arq.file, buffer)

    info_perfil = f" [{f_clean} {q_clean}]" if (f_clean and q_clean) else ""
    set_job_status(job_id, "recebido", f"{len(arquivos)} arquivos recebidos no Colab{info_perfil}", 10)
    background_tasks.add_task(processa_job_background, job_id, tipo, f_clean, q_clean)

    return {
        "status": "sucesso",
        "job_id": job_id,
        "mensagem": "Arquivos recebidos com sucesso na GPU do Colab! Processamento iniciado.",
        "total_arquivos": len(arquivos)
    }

@app.get("/api/download/{job_id}/{nome_arquivo}")
def download_arquivo(job_id: str, nome_arquivo: str):
    caminho = os.path.join(PASTA_JOBS, job_id, os.path.basename(nome_arquivo))
    if not os.path.exists(caminho):
        raise HTTPException(status_code=404, detail="Arquivo de resultado não encontrado")
    return FileResponse(caminho, filename=nome_arquivo)


# ==============================================================================
# 6. INICIALIZAÇÃO DO NGROK E DO SERVIDOR UVICORN
# ==============================================================================
def inicia_servidor():
    # Configura token ngrok
    token = NGROK_AUTHTOKEN.strip()
    if not token:
        display(HTML('''
        <div style="background:#2b1b1b;border:2px solid #e74c3c;border-radius:10px;padding:16px;color:#fff;font-family:sans-serif;margin:15px 0;">
            <h3 style="margin-top:0;color:#e74c3c;">⚠️ Authtoken do ngrok não informado!</h3>
            <p>Por favor, cole seu Authtoken no campo <b>NGROK_AUTHTOKEN</b> acima e rode a célula novamente.</p>
            <p>Você pode pegá-lo gratuitamente em: <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" style="color:#3498db;font-weight:bold;">dashboard.ngrok.com/get-started/your-authtoken</a></p>
        </div>
        '''))
        return

    try:
        ngrok.set_auth_token(token)
    except Exception as e:
        # pyngrok acusa erro caso o token já esteja salvo no arquivo ngrok.yml
        if "already set" not in str(e).lower():
            raise e

    # Mata processos antigos e fecha túneis
    try:
        ngrok.kill()
    except Exception:
        pass

    # Pré-carrega o modelo Whisper na GPU/VRAM antes de abrir o túnel
    print("⏳ Pré-carregando Whisper na GPU/VRAM para resposta imediata no primeiro job...")
    try:
        get_whisper()
        print(f"✅ Whisper ({WHISPER_MODEL}) carregado e pronto na memória!")
    except Exception as e:
        print(f"⚠️ Aviso ao pré-carregar Whisper: {e} (será tentado novamente sob demanda se necessário)")

    # Inicia Uvicorn em uma thread separada para não travar o notebook
    def roda_uvicorn():
        uvicorn.run(app, host="127.0.0.1", port=PORTA_LOCAL, log_level="warning")

    t_server = threading.Thread(target=roda_uvicorn, daemon=True)
    t_server.start()
    time.sleep(2)

    # Abre túnel HTTP (no ngrok v3 não se passa bind_tls=True pois causa erro de yaml schemes)
    print(f"🌐 Abrindo túnel ngrok na porta {PORTA_LOCAL}...")
    try:
        tunnel = ngrok.connect(PORTA_LOCAL)
    except Exception as e:
        # Fallback caso haja opções pendentes
        tunnel = ngrok.connect(str(PORTA_LOCAL))
    
    public_url = tunnel.public_url
    if public_url.startswith("http://"):
        public_url = public_url.replace("http://", "https://")

    # Informações de GPU
    gpu_info = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "⚠️ CPU (Sem GPU ativa)"

    # CARD VISUAL INTERATIVO COM BOTÃO COPIAR -> COPIADO E SUPORTE A SEM CONFIRMAÇÃO
    card_html = f'''
    <div style="
        background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
        border: 2px solid #00f0ff;
        box-shadow: 0 0 25px rgba(0, 240, 255, 0.25);
        border-radius: 14px;
        padding: 24px;
        max-width: 680px;
        color: #e6edf3;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        margin: 20px 0;
    ">
        <!-- CABEÇALHO -->
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #30363d; padding-bottom:14px; margin-bottom:16px;">
            <div>
                <h2 style="margin:0; font-size:20px; font-weight:800; color:#00f0ff; letter-spacing:0.5px;">
                    ⚡ MOTOR DE DOBRA 4.2 AI STUDIO
                </h2>
                <div style="font-size:12px; color:#8b949e; margin-top:3px;">
                    Modo Direto • Sem dependência do Google Drive • GPU Pronta
                </div>
            </div>
            <span style="
                background: rgba(46, 160, 67, 0.15);
                color: #3fb950;
                border: 1px solid rgba(46, 160, 67, 0.4);
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 700;
                display:flex;
                align-items:center;
                gap:6px;
            ">
                <span style="width:8px; height:8px; background:#3fb950; border-radius:50%; box-shadow:0 0 8px #3fb950;"></span>
                ONLINE
            </span>
        </div>

        <!-- DETALHES DE GPU E MOTOR -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:18px; font-size:12px;">
            <div style="background:#21262d; padding:10px 14px; border-radius:8px; border:1px solid #30363d;">
                <span style="color:#8b949e;">Acelerador:</span>
                <b style="color:#f0883e; display:block; margin-top:2px;">{gpu_info}</b>
            </div>
            <div style="background:#21262d; padding:10px 14px; border-radius:8px; border:1px solid #30363d;">
                <span style="color:#8b949e;">Modelo Whisper:</span>
                <b style="color:#58a6ff; display:block; margin-top:2px;">{WHISPER_MODEL}</b>
            </div>
        </div>

        <!-- URL DO TÚNEL E BOTÃO COPIAR -->
        <div style="margin-bottom:14px;">
            <label style="font-size:12px; font-weight:600; color:#c9d1d9; display:block; margin-bottom:6px;">
                URL PÚBLICA DO MOTOR (Cole no App Web):
            </label>
            <div style="display:flex; gap:8px;">
                <input id="motor_tunnel_url" type="text" readonly value="{public_url}" style="
                    flex: 1;
                    background: #090d13;
                    border: 1px solid #00f0ff;
                    color: #58a6ff;
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                    font-size: 14px;
                    font-weight: 600;
                    outline: none;
                "/>
                <button id="btn_copiar_url" onclick="copiarUrlMotor()" style="
                    background: #00f0ff;
                    color: #040d1a;
                    border: none;
                    border-radius: 8px;
                    padding: 10px 20px;
                    font-weight: 800;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                ">
                    <span id="btn_icon">📋</span> <span id="btn_text">Copiar URL</span>
                </button>
            </div>
        </div>

        <!-- AVISO DE CONFIRMAÇÃO DO NAVEGADOR (INTERSTITIAL NGROK BYPASS) -->
        <div style="
            background: rgba(56, 139, 253, 0.1);
            border-left: 3px solid #58a6ff;
            padding: 10px 14px;
            border-radius: 4px;
            font-size: 12px;
            color: #8b949e;
            line-height: 1.5;
        ">
            <b style="color:#58a6ff;">🚀 Sem bloqueios de navegador:</b> As requisições diretas do App Web já incluem automaticamente o cabeçalho <code>ngrok-skip-browser-warning: 1</code> e CORS completo, portanto <b>não exigem tela de confirmação</b> nem login!
        </div>
    </div>

    <script>
    function copiarUrlMotor() {{
        var input = document.getElementById("motor_tunnel_url");
        var btn = document.getElementById("btn_copiar_url");
        var btnText = document.getElementById("btn_text");
        var btnIcon = document.getElementById("btn_icon");

        // Seleciona e copia
        input.select();
        input.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input.value).then(function() {{
            // Transição visual para "Copiado!"
            btn.style.background = "#2ea043";
            btn.style.color = "#ffffff";
            btnText.innerText = "Copiado!";
            btnIcon.innerText = "✅";

            setTimeout(function() {{
                btn.style.background = "#00f0ff";
                btn.style.color = "#040d1a";
                btnText.innerText = "Copiar URL";
                btnIcon.innerText = "📋";
            }}, 2500);
        }}).catch(function(err) {{
            document.execCommand("copy");
            btnText.innerText = "Copiado!";
            setTimeout(function() {{ btnText.innerText = "Copiar URL"; }}, 2500);
        }});
    }}

    // Anti-desconexão contínuo no navegador (executa a cada 60s)
    setInterval(function() {{
        try {{
            var btn = document.querySelector("#top-toolbar > colab-connect-button") ||
                      document.querySelector("colab-connect-button") ||
                      document.querySelector("#connect");
            if (btn) {{
                btn.click();
                console.log("[keep-alive] clique automático executado: " + new Date().toLocaleTimeString());
            }}
        }} catch(e) {{}}
    }}, 60000);
    </script>
    '''
    display(HTML(card_html))

    # Keep-Alive leve em loop
    print("🟢 Motor em execução e pronto para receber jobs!")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("🔴 Parando motor...")
        global _keep_alive_ativo
        _keep_alive_ativo = False
        ngrok.disconnect(public_url)

# Executa
inicia_servidor()
