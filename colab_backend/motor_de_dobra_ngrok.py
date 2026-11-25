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
USAR_CACHE_TRANSCRICAO = True  # @param {type:"boolean"}

# ==============================================================================
# 1. INSTALAÇÃO DAS DEPENDÊNCIAS
# ==============================================================================
import sys, subprocess

print("📦 Instalando dependências (FastAPI, Uvicorn, pyngrok, Whisper, MoviePy, ModernGL, Pillow)...")
subprocess.run([
    sys.executable, "-m", "pip", "install",
    "fastapi", "uvicorn", "pyngrok", "python-multipart",
    "openai-whisper", "moviepy", "tqdm", "moderngl", "Pillow", "numpy", "-q"
], check=True)

import os, re, unicodedata, whisper, threading, time, json, shutil, tempfile, uuid, hashlib, struct, math
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Optional
import torch
import numpy as np
from PIL import Image, ImageOps
try:
    import moderngl
except Exception:
    moderngl = None

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
        "1440p": (2560, 1440),
        "2160p": (3840, 2160),
    },
    "9:16": {
        "480p": (480, 854),
        "720p": (720, 1280),
        "1080p": (1080, 1920),
        "1440p": (1440, 2560),
        "2160p": (2160, 3840),
    },
    "1:1": {
        "480p": (480, 480),
        "720p": (720, 720),
        "1080p": (1080, 1080),
        "1440p": (1440, 1440),
        "2160p": (2160, 2160),
    },
}

def resolve_perfil(formato: str = "", qualidade: str = "") -> dict:
    """
    Resolve perfil de resolução e preset de codificação com base em whitelist estrita.
    Preserva a constante global RESOLUCAO e preset fast caso nenhum perfil seja informado.
    """
    f = (formato or "").strip()
    q = (qualidade or "").strip().lower()
    if not f and not q:
        return {"resolucao": RESOLUCAO, "preset": "fast", "crf": None}

    if not f:
        f = "16:9"
    if not q:
        q = "1080p"

    # Mapeamento de aliases amigáveis para 2k e 4k
    if q in ("2k", "1440", "1440p"):
        q = "1440p"
    elif q in ("4k", "2160", "2160p"):
        q = "2160p"

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
    "render_opengl_com_timeline": [
        {"id": "preparo", "nome": "Validando GPU OpenGL e arquivos", "peso": 4, "etapa_legada": "inicio"},
        {"id": "audio_ambiente", "nome": "Preparando áudio dos clipes MP4", "peso": 6, "etapa_legada": "render"},
        {"id": "render_gpu", "nome": "Renderizando na GPU (OpenGL + GLSL)", "peso": 80, "etapa_legada": "render"},
        {"id": "mixagem", "nome": "Mixando áudio e validando MP4", "peso": 10, "etapa_legada": "render"},
    ],
    "timeline_e_render_opengl": [
        {"id": "preparo", "nome": "Validando GPU OpenGL e arquivos", "peso": 2, "etapa_legada": "inicio"},
        {"id": "transcricao", "nome": "Transcrevendo áudio (Whisper)", "peso": 25, "etapa_legada": "whisper"},
        {"id": "sincronizacao", "nome": "Sincronizando roteiro e cenas", "peso": 5, "etapa_legada": "matching"},
        {"id": "audio_ambiente", "nome": "Preparando áudio dos clipes MP4", "peso": 5, "etapa_legada": "render"},
        {"id": "render_gpu", "nome": "Renderizando na GPU (OpenGL + GLSL)", "peso": 53, "etapa_legada": "render"},
        {"id": "mixagem", "nome": "Mixando áudio e validando MP4", "peso": 8, "etapa_legada": "render"},
        {"id": "finalizacao", "nome": "Gerando timeline", "peso": 2, "etapa_legada": "render"},
    ],
}

# Pastas locais temporárias no SSD rápido do Colab (não usam Google Drive)
PASTA_JOBS = "/content/motor_jobs"
os.makedirs(PASTA_JOBS, exist_ok=True)

# Configurações do cache de transcrição do Whisper por hash de áudio
PASTA_CACHE = "/content/motor_cache"
os.makedirs(PASTA_CACHE, exist_ok=True)
CACHE_VERSAO = 1
CACHE_MAX_ENTRADAS = 100

def hash_arquivo(caminho: str) -> str:
    """Calcula hash SHA-256 de um arquivo lendo em blocos de 1 MiB."""
    h = hashlib.sha256()
    with open(caminho, 'rb') as f:
        while True:
            bloco = f.read(1024 * 1024)
            if not bloco:
                break
            h.update(bloco)
    return h.hexdigest()

def chave_cache(hash_audio: str) -> str:
    """Gera chave hex única de cache combinando hash do áudio, modelo, idioma e versão."""
    versao_whisper = getattr(whisper, '__version__', '?')
    raw = f"{hash_audio}|{WHISPER_MODEL}|pt|{versao_whisper}|v{CACHE_VERSAO}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()

def le_cache(chave: str):
    """Lê entrada do cache; valida palavras e duração, removendo arquivos corrompidos."""
    p = os.path.join(PASTA_CACHE, f"{chave}.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, 'r', encoding='utf-8') as f:
            dados = json.load(f)
        palavras = dados.get("palavras")
        duracao = dados.get("duracao")
        if not isinstance(palavras, list) or len(palavras) == 0:
            os.remove(p)
            return None
        if not isinstance(duracao, (int, float)):
            os.remove(p)
            return None
        for item in palavras:
            if not isinstance(item, dict) or 'word' not in item or 'start' not in item or 'end' not in item:
                os.remove(p)
                return None
        return dados
    except Exception:
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass
        return None

def poda_cache():
    """Remove os arquivos de cache mais antigos caso exceda CACHE_MAX_ENTRADAS."""
    try:
        arquivos = [
            os.path.join(PASTA_CACHE, f)
            for f in os.listdir(PASTA_CACHE)
            if f.endswith('.json')
        ]
        if len(arquivos) > CACHE_MAX_ENTRADAS:
            arquivos.sort(key=lambda x: os.path.getmtime(x))
            remover = len(arquivos) - CACHE_MAX_ENTRADAS
            for arq in arquivos[:remover]:
                try:
                    os.remove(arq)
                except Exception:
                    pass
    except Exception as e:
        print(f"⚠️ Aviso ao podar cache do Whisper: {e}")

def grava_cache(chave: str, palavras: list, duracao: float, audio_nome: str, audio_hash: str):
    """Grava resultado da transcrição atomicamente usando arquivo temporário e os.replace."""
    if not palavras:
        return
    try:
        palavras_convertidas = []
        for p in palavras:
            palavras_convertidas.append({
                "word": str(p.get("word", "")),
                "start": float(p.get("start", 0.0)),
                "end": float(p.get("end", 0.0)),
            })
        conteudo = {
            "versao": CACHE_VERSAO,
            "criado_em": datetime.now().isoformat(),
            "modelo": WHISPER_MODEL,
            "idioma": "pt",
            "audio_nome": audio_nome,
            "audio_hash": audio_hash,
            "duracao": float(duracao),
            "palavras": palavras_convertidas,
        }
        destino = os.path.join(PASTA_CACHE, f"{chave}.json")
        fd, tmp_path = tempfile.mkstemp(prefix="cache_", suffix=".tmp", dir=PASTA_CACHE)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(conteudo, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, destino)
        poda_cache()
    except Exception as e:
        print(f"⚠️ Aviso ao gravar cache de transcrição: {e}")

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

def transcreve_audio(audio_path: str, cb_status=None, ignorar_cache: bool = False):
    is_progresso = hasattr(cb_status, "inicia_etapa")
    audio_hash = None
    chave = None

    # 1. Consulta inicial ao cache ANTES de carregar modelo e antes do lock (economiza GPU e tempo)
    if USAR_CACHE_TRANSCRICAO:
        audio_hash = hash_arquivo(audio_path)
        chave = chave_cache(audio_hash)

        if not ignorar_cache:
            hit = le_cache(chave)
            if hit:
                print(f"💾 Cache de transcrição: HIT ({chave[:8]})")
                if is_progresso:
                    cb_status.inicia_etapa("transcricao", detalhe="Transcrição reaproveitada do cache")
                    cb_status.fracao(1.0, "Transcrição reaproveitada do cache")
                elif cb_status:
                    cb_status("whisper", "Transcrição reaproveitada do cache", 100)
                return hit["palavras"], hit["duracao"]
            else:
                print(f"💾 Cache de transcrição: MISS ({chave[:8]})")

    with _whisper_lock:
        # 2. Segunda consulta ao cache pós-lock (caso outro job tenha processado o mesmo áudio enquanto esperava)
        if USAR_CACHE_TRANSCRICAO and not ignorar_cache and chave:
            hit2 = le_cache(chave)
            if hit2:
                print(f"💾 Cache de transcrição: HIT ({chave[:8]})")
                if is_progresso:
                    cb_status.inicia_etapa("transcricao", detalhe="Transcrição reaproveitada do cache")
                    cb_status.fracao(1.0, "Transcrição reaproveitada do cache")
                elif cb_status:
                    cb_status("whisper", "Transcrição reaproveitada do cache", 100)
                return hit2["palavras"], hit2["duracao"]

        # Se o modelo ainda não estiver carregado na VRAM, sinaliza no detalhe
        global _whisper_cache
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

        # Grava no cache se o cache estiver ativo (inclusive quando ignorar_cache=True para sobrescrever)
        if USAR_CACHE_TRANSCRICAO and chave:
            grava_cache(chave, palavras, duracao, os.path.basename(audio_path), audio_hash)

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

def roda_ffmpeg(cmd, descricao: str):
    """
    Executa comando FFmpeg verificando returncode e integridade do arquivo gerado.
    Lança RuntimeError com os últimos 800 caracteres do stderr se houver falha.
    """
    res = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    if res.returncode != 0:
        stderr_tail = (res.stderr or "").strip()[-800:]
        raise RuntimeError(f"ffmpeg falhou em {descricao}: {stderr_tail}")

    # Se o comando tiver um arquivo de saída conhecido (último argumento), confere existência e tamanho
    saida = cmd[-1] if isinstance(cmd, (list, tuple)) and cmd and isinstance(cmd[-1], str) and not cmd[-1].startswith('-') else None
    if saida:
        if not os.path.exists(saida) or os.path.getsize(saida) == 0:
            stderr_tail = (res.stderr or "").strip()[-800:]
            msg_extra = f": {stderr_tail}" if stderr_tail else ""
            raise RuntimeError(f"ffmpeg falhou em {descricao}: arquivo de saída não foi gerado ou está vazio ({saida}){msg_extra}")

def renderiza_trecho_visual(src, dur, dst_path, fit='contain', efeito='none', filtro='none', filtro_int=100, transicao='none', trans_dur=0.8, slow_factor=1.0, volume=0.0, resolucao=RESOLUCAO, preset="fast", crf=None, fps=FPS):
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
        nb_frames = max(1, int(dur * fps))
        if efeito in ('kenburns', 'zoom_in'):
            vf_parts.append(f"zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={fps}")
        elif efeito == 'zoom_out':
            vf_parts.append(f"zoompan=z='if(eq(on\\,1)\\,1.1\\,max(zoom-0.0008\\,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={fps}")
        elif efeito == 'pan_right':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,0\\,x+0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={fps}")
        elif efeito == 'pan_left':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,iw*0.1-iw/zoom/2\\,x-0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={resolucao[0]}x{resolucao[1]}:fps={fps}")

    # 4. Filtros de cor
    intensidade = filtro_int / 100.0
    if filtro == 'grayscale': vf_parts.append("hue=s=0")
    elif filtro == 'sepia': vf_parts.append("colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131")
    elif filtro == 'blur': vf_parts.append(f"gblur=sigma={max(1, int(filtro_int / 10))}")
    elif filtro == 'contrast': vf_parts.append(f"eq=contrast={1.0 + intensidade:.2f}")
    elif filtro == 'saturate': vf_parts.append(f"hue=s={1.0 + intensidade * 2:.2f}")

    # Clona o quadro em imagens sem zoompan para preencher toda a duração da cena
    if not is_vid and efeito not in ('kenburns', 'zoom_in', 'zoom_out', 'pan_right', 'pan_left'):
        vf_parts.append(f"tpad=stop_mode=clone:stop_duration={dur:.3f}")

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

    vf_parts.append(f"fps={fps}")
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
    roda_ffmpeg(cmd, os.path.basename(dst_path))

def renderiza_video(instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, cb_status=None, resolucao=RESOLUCAO, preset="fast", crf=None, formato="", qualidade="", fps=FPS):
    is_progresso = hasattr(cb_status, "inicia_etapa")
    total_cenas = len(instrucoes) if instrucoes else 1

    if is_progresso:
        cb_status.inicia_etapa("cortes", detalhe=f"Cena 1 de {total_cenas}")
    elif cb_status:
        msg_status = f"Renderizando {formato} em {qualidade} ({fps}fps) (gerando cortes na GPU)..." if (formato and qualidade) else "Gerando cortes e analisando vídeos/imagens na GPU..."
        cb_status("render", msg_status, 60)

    tmp_dir = tempfile.mkdtemp(prefix='motor_render_')
    t_inicio_etapa_cortes = time.time()
    
    try:
        avisos = []
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
                        volume=volume, resolucao=resolucao, preset=preset, crf=crf, fps=fps
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
                        volume=volume, resolucao=resolucao, preset=preset, crf=crf, fps=fps
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
                            volume=volume, resolucao=resolucao, preset=preset, crf=crf, fps=fps
                        )

                        # 2. Imagem companheira completando o restante do tempo (com faixa de áudio silenciosa padronizada)
                        renderiza_trecho_visual(
                            src=image_src, dur=dur_parte_imagem, dst_path=p2,
                            fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                            transicao='none', trans_dur=trans_dur, slow_factor=1.0,
                            volume=0.0, resolucao=resolucao, preset=preset, crf=crf, fps=fps
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
                            '-pix_fmt', 'yuv420p', '-r', str(fps),
                            '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                            dst
                        ])
                        roda_ffmpeg(cmd_concat, f"concatenação vídeo + imagem da cena {i+1} ({id_cena})")
                    else:
                        # Sem imagem companheira: reproduz o vídeo e congela no último frame para preencher o tempo da fala
                        print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) estendido com freeze do último frame para preencher ({dur_real:.2f}s) | Vol: {int(volume*100)}%")
                        dur_freeze = max(0.1, round(dur_real - dur_vid, 3))
                        vf_freeze = f"setpts=PTS-STARTPTS,scale={resolucao[0]}:{resolucao[1]}:force_original_aspect_ratio=decrease,pad={resolucao[0]}:{resolucao[1]}:(ow-iw)/2:(oh-ih)/2:black,tpad=stop_mode=clone:stop_duration={dur_freeze:.3f},fps={fps}"
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
                        roda_ffmpeg(cmd_freeze, f"congelamento do último frame da cena {i+1} ({id_cena})")

            elif image_src:
                # Caso sem vídeo: renderiza imagem normalmente com áudio mudo padronizado
                print(f"      🖼️ Cena {i+1} ({id_cena}): Imagem ({os.path.basename(image_src)}) com duração {dur_real:.2f}s")
                renderiza_trecho_visual(
                    src=image_src, dur=dur_real, dst_path=dst,
                    fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                    transicao=transicao, trans_dur=trans_dur, slow_factor=1.0,
                    volume=0.0, resolucao=resolucao, preset=preset, crf=crf, fps=fps
                )

            else:
                # Nenhuma mídia encontrada -> fundo preto com áudio silencioso padronizado
                print(f"      ⚠️ Nenhuma mídia encontrada para cena {i+1} ({id_cena}) -> gerando fundo preto")
                cmd_black = [
                    'ffmpeg', '-y',
                    '-f', 'lavfi', '-i', f'color=black:size={resolucao[0]}x{resolucao[1]}:duration={dur_real}',
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
                    '-t', str(dur_real),
                    '-r', str(fps), '-pix_fmt', 'yuv420p',
                    '-c:v', 'libx264', '-preset', preset,
                ]
                if crf:
                    cmd_black.extend(['-crf', str(crf)])
                cmd_black.extend([
                    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
                    '-map', '0:v:0', '-map', '1:a:0',
                    dst
                ])
                roda_ffmpeg(cmd_black, f"fundo preto da cena {i+1} ({id_cena})")

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
        cmd_concat_demuxer = [
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', concat_txt, '-c', 'copy', '-fflags', '+genpts', v_temp
        ]
        roda_ffmpeg(cmd_concat_demuxer, "concatenação de cenas (demuxer)")

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
            cmd_mix_bgm = [
                'ffmpeg', '-y',
                '-i', v_temp,
                '-i', audio_path,
                '-i', bgm_path,
                '-filter_complex', '[0:a]volume=1.0[amb];[1:a]volume=1.0[voz];[2:a]volume=0.2[bgm];[voz][amb][bgm]amix=inputs=3:duration=first:dropout_transition=2[aout]',
                '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
                '-shortest', '-map', '0:v:0', '-map', '[aout]', saida_mp4
            ]
            roda_ffmpeg(cmd_mix_bgm, "mixagem final com BGM")
        else:
            cmd_mix = [
                'ffmpeg', '-y',
                '-i', v_temp,
                '-i', audio_path,
                '-filter_complex', '[0:a]volume=1.0[amb];[1:a]volume=1.0[voz];[voz][amb]amix=inputs=2:duration=first:dropout_transition=2[aout]',
                '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k',
                '-shortest', '-map', '0:v:0', '-map', '[aout]', saida_mp4
            ]
            roda_ffmpeg(cmd_mix, "mixagem final")

        # Validação do MP4 final via ffprobe e detecção de anomalias de duração/fps
        try:
            cmd_probe = [
                'ffprobe', '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=duration,nb_frames,avg_frame_rate',
                '-of', 'json',
                saida_mp4
            ]
            out_probe = subprocess.check_output(cmd_probe, text=True).strip()
            data_probe = json.loads(out_probe)
            streams = data_probe.get('streams', [])
            if streams:
                st = streams[0]
                dur_str = st.get('duration')
                frames_str = st.get('nb_frames')
                avg_fps_str = st.get('avg_frame_rate', '')

                dur_video = 0.0
                if dur_str and dur_str != 'N/A':
                    try:
                        dur_video = float(dur_str)
                    except Exception:
                        pass

                if dur_video <= 0.05:
                    cmd_fmt = [
                        'ffprobe', '-v', 'error',
                        '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1',
                        saida_mp4
                    ]
                    out_fmt = subprocess.check_output(cmd_fmt, text=True).strip()
                    if out_fmt and out_fmt != 'N/A':
                        try:
                            dur_video = float(out_fmt)
                        except Exception:
                            pass

                fps_nominal = 0.0
                if avg_fps_str and avg_fps_str != '0/0':
                    if '/' in avg_fps_str:
                        num, den = avg_fps_str.split('/', 1)
                        if float(den) > 0:
                            fps_nominal = float(num) / float(den)
                    else:
                        fps_nominal = float(avg_fps_str)

                nb_frames_val = 0
                if frames_str and frames_str != 'N/A' and str(frames_str).isdigit():
                    nb_frames_val = int(frames_str)
                elif fps_nominal > 0 and dur_video > 0:
                    nb_frames_val = int(round(fps_nominal * dur_video))

                fps_medio = (nb_frames_val / dur_video) if (dur_video > 0 and nb_frames_val > 0) else fps_nominal

                print(f"📊 Vídeo final: {dur_video:.2f} s, {nb_frames_val} quadros, fps médio {fps_medio:.2f}")

                # (a) Duração do vídeo menor que a narração em mais de 2s
                if duracao_audio and (duracao_audio - dur_video > 2.0):
                    diff_s = round(duracao_audio - dur_video, 1)
                    avisos.append(f"O vídeo final tem {diff_s} s a menos que a narração.")

                # (b) FPS médio menor que 90% do esperado
                if fps and fps_medio < (0.90 * fps):
                    fps_fmt = round(fps_medio, 1)
                    avisos.append(f"O vídeo tem taxa de quadros variável (média de {fps_fmt} fps, esperado {fps}).")
        except Exception as e:
            print(f"⚠️ Aviso ao validar MP4 final: {e}")

        return avisos
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ==============================================================================
# 4B. MOTOR GPU STUDIO (MODERNGL + 33 TRANSIÇÕES GLSL + 10 FILTROS + NVENC)
# ==============================================================================
# Pipeline alternativo 100% isolado do motor FFmpeg 4.2 acima.
# Só é acionado quando motor_render == "opengl" (selecionado explicitamente na UI).
# Se a GPU estiver desligada no Colab ou o OpenGL/EGL falhar, interrompe com
# diagnóstico claro em português (sem fallback silencioso para FFmpeg).

_CACHE_DIAG_GPU_OPENGL = None
_LOCK_DIAG_GPU_OPENGL = threading.Lock()

OPENGL_FIT_MAP = {
    "contain": 0,
    "cover": 1,
    "blur": 2,
}

OPENGL_EFFECT_MAP = {
    "none": 0,
    "kenburns": 1,
    "zoom_in": 2,
    "zoom_out": 3,
    "pan_right": 4,
    "pan_left": 5,
}

OPENGL_FILTER_MAP = {
    "none": 0,
    "grayscale": 1,
    "sepia": 2,
    "blur": 3,
    "contrast": 4,
    "saturate": 5,
    "vignette": 6,
    "invert": 7,
    "huerotate": 8,
    "grain": 9,
}

OPENGL_TRANSITION_MAP = {
    "none": 0,
    "dissolve": 1,
    "fadeblack": 2,
    "fadewhite": 3,
    "crossfade": 4,
    "pixelize": 5,
    "radial": 6,
    "slideleft": 7,
    "slideright": 8,
    "slideup": 9,
    "slidedown": 10,
    "smoothleft": 11,
    "smoothright": 12,
    "smoothup": 13,
    "smoothdown": 14,
    "wipeleft": 15,
    "wiperight": 16,
    "wipeup": 17,
    "wipedown": 18,
    "diagtl": 19,
    "diagtr": 20,
    "diagbl": 21,
    "diagbr": 22,
    "circleopen": 23,
    "circleclose": 24,
    "horzopen": 25,
    "horzclose": 26,
    "vertopen": 27,
    "vertclose": 28,
    "hlslice": 29,
    "hrslice": 30,
    "vuslice": 31,
    "vdslice": 32,
}

_QUAD_VERTEX_SHADER = """
#version 330 core
in vec2 in_pos;
in vec2 in_uv;
out vec2 v_uv;
void main() {
    gl_Position = vec4(in_pos, 0.0, 1.0);
    v_uv = in_uv;
}
"""

_SCENE_FRAGMENT_SHADER = """
#version 330 core
uniform sampler2D u_tex;
uniform vec2 u_src_size;
uniform vec2 u_dst_size;
uniform int u_fit_mode;
uniform int u_effect_mode;
uniform float u_progress;
uniform int u_filter_mode;
uniform float u_filter_intensity;
uniform float u_time;

in vec2 v_uv;
out vec4 fragColor;

vec2 apply_camera_uv(vec2 uv, int mode, float p) {
    float s = p * p * (3.0 - 2.0 * p);
    float t = mix(p, s, 0.35);
    vec2 centered = uv - vec2(0.5, 0.5);
    if (mode == 1) {
        // kenburns: zoom suave + pan diagonal sutil
        float scale = mix(1.0, 1.13, t);
        vec2 pan = mix(vec2(-0.022, -0.012), vec2(0.022, 0.012), t);
        return clamp((centered / scale) + vec2(0.5, 0.5) + pan, vec2(0.0), vec2(1.0));
    } else if (mode == 2) {
        // zoom_in
        float scale = mix(1.0, 1.18, t);
        return clamp((centered / scale) + vec2(0.5, 0.5), vec2(0.0), vec2(1.0));
    } else if (mode == 3) {
        // zoom_out
        float scale = mix(1.18, 1.0, t);
        return clamp((centered / scale) + vec2(0.5, 0.5), vec2(0.0), vec2(1.0));
    } else if (mode == 4) {
        // pan_right (enquadramento com zoom leve para nunca expor bordas)
        float scale = 1.14;
        float offset_x = mix(-0.055, 0.055, t);
        return clamp((centered / scale) + vec2(0.5 + offset_x, 0.5), vec2(0.0), vec2(1.0));
    } else if (mode == 5) {
        // pan_left
        float scale = 1.14;
        float offset_x = mix(0.055, -0.055, t);
        return clamp((centered / scale) + vec2(0.5 + offset_x, 0.5), vec2(0.0), vec2(1.0));
    }
    return uv;
}

vec2 cover_uv(vec2 uv, float src_aspect, float dst_aspect) {
    vec2 out_uv = uv;
    if (src_aspect > dst_aspect) {
        float scale = dst_aspect / src_aspect;
        out_uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
        float scale = src_aspect / dst_aspect;
        out_uv.y = (uv.y - 0.5) * scale + 0.5;
    }
    return out_uv;
}

vec2 contain_uv(vec2 uv, float src_aspect, float dst_aspect) {
    vec2 out_uv = uv;
    if (src_aspect > dst_aspect) {
        float scale = src_aspect / dst_aspect;
        out_uv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
        float scale = dst_aspect / src_aspect;
        out_uv.x = (uv.x - 0.5) * scale + 0.5;
    }
    return out_uv;
}

vec3 sample_blur_bg(vec2 uv, vec2 texel) {
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int dx = -2; dx <= 2; dx++) {
        for (int dy = -2; dy <= 2; dy++) {
            float d2 = float(dx * dx + dy * dy);
            float w = exp(-d2 * 0.28);
            vec2 off = vec2(float(dx), float(dy)) * texel * 6.0;
            acc += texture(u_tex, clamp(uv + off, vec2(0.001), vec2(0.999))).rgb * w;
            wsum += w;
        }
    }
    return (acc / max(wsum, 0.0001)) * 0.62;
}

vec3 sample_scene_raw(vec2 uv) {
    float src_aspect = u_src_size.x / max(u_src_size.y, 1.0);
    float dst_aspect = u_dst_size.x / max(u_dst_size.y, 1.0);

    if (u_fit_mode == 1) {
        // cover
        vec2 cam_uv = apply_camera_uv(uv, u_effect_mode, u_progress);
        vec2 c_uv = cover_uv(cam_uv, src_aspect, dst_aspect);
        return texture(u_tex, clamp(c_uv, vec2(0.0), vec2(1.0))).rgb;
    } else if (u_fit_mode == 2) {
        // blur: fundo cover desfocado + primeiro plano contain nítido
        vec2 ct_uv = contain_uv(uv, src_aspect, dst_aspect);
        if (ct_uv.x >= 0.0 && ct_uv.x <= 1.0 && ct_uv.y >= 0.0 && ct_uv.y <= 1.0) {
            vec2 cam_ct = apply_camera_uv(ct_uv, u_effect_mode, u_progress);
            return texture(u_tex, clamp(cam_ct, vec2(0.0), vec2(1.0))).rgb;
        } else {
            vec2 bg_uv = cover_uv(uv, src_aspect, dst_aspect);
            vec2 texel = vec2(1.0) / max(u_src_size, vec2(1.0));
            return sample_blur_bg(bg_uv, texel);
        }
    } else {
        // contain (padrão)
        vec2 ct_uv = contain_uv(uv, src_aspect, dst_aspect);
        if (ct_uv.x < 0.0 || ct_uv.x > 1.0 || ct_uv.y < 0.0 || ct_uv.y > 1.0) {
            return vec3(0.0);
        }
        vec2 cam_ct = apply_camera_uv(ct_uv, u_effect_mode, u_progress);
        return texture(u_tex, clamp(cam_ct, vec2(0.0), vec2(1.0))).rgb;
    }
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hue_rotate_rgb(vec3 col, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    vec3 k = vec3(0.577350269);
    return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

void main() {
    float inten = clamp(u_filter_intensity, 0.0, 1.0);
    vec3 col;

    if (u_filter_mode == 3 && inten > 0.001) {
        // blur filter (multi-tap em espaço de tela)
        vec2 px = vec2(1.0) / max(u_dst_size, vec2(1.0));
        float rad = mix(0.0, 4.5, inten);
        vec3 acc = vec3(0.0);
        float wsum = 0.0;
        for (int dx = -2; dx <= 2; dx++) {
            for (int dy = -2; dy <= 2; dy++) {
                float d2 = float(dx * dx + dy * dy);
                float w = exp(-d2 * 0.32);
                vec2 off = vec2(float(dx), float(dy)) * px * rad;
                acc += sample_scene_raw(clamp(v_uv + off, vec2(0.0), vec2(1.0))) * w;
                wsum += w;
            }
        }
        col = acc / max(wsum, 0.0001);
    } else {
        col = sample_scene_raw(v_uv);
    }

    if (inten > 0.001) {
        if (u_filter_mode == 1) {
            // grayscale
            float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(col, vec3(l), inten);
        } else if (u_filter_mode == 2) {
            // sepia
            vec3 sep = vec3(
                dot(col, vec3(0.393, 0.769, 0.189)),
                dot(col, vec3(0.349, 0.686, 0.168)),
                dot(col, vec3(0.272, 0.534, 0.131))
            );
            col = mix(col, clamp(sep, 0.0, 1.0), inten);
        } else if (u_filter_mode == 4) {
            // contrast
            float factor = 1.0 + 0.75 * inten;
            col = clamp((col - 0.5) * factor + 0.5, 0.0, 1.0);
        } else if (u_filter_mode == 5) {
            // saturate
            float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = clamp(mix(vec3(l), col, 1.0 + 1.25 * inten), 0.0, 1.0);
        } else if (u_filter_mode == 6) {
            // vignette
            vec2 d = v_uv - vec2(0.5, 0.5);
            float dist = length(d * vec2(1.15, 1.15));
            float vig = smoothstep(0.32, 0.92, dist);
            col *= (1.0 - vig * 0.78 * inten);
        } else if (u_filter_mode == 7) {
            // invert
            col = mix(col, vec3(1.0) - col, inten);
        } else if (u_filter_mode == 8) {
            // huerotate
            col = clamp(hue_rotate_rgb(col, inten * 3.14159265), 0.0, 1.0);
        } else if (u_filter_mode == 9) {
            // grain (animado por frame)
            float n = hash12(v_uv * u_dst_size + vec2(floor(u_time * 30.0) * 17.3, floor(u_time * 30.0) * 43.7));
            float g = (n - 0.5) * 0.24 * inten;
            col = clamp(col + vec3(g), 0.0, 1.0);
        }
    }

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
"""

_TRANSITION_FRAGMENT_SHADER = """
#version 330 core
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_progress;
uniform int u_trans_mode;
uniform vec2 u_resolution;

in vec2 v_uv;
out vec4 fragColor;

const float PI = 3.14159265359;

vec4 getFrom(vec2 uv) {
    return texture(u_from, clamp(uv, vec2(0.0), vec2(1.0)));
}

vec4 getTo(vec2 uv) {
    return texture(u_to, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
    float p = clamp(u_progress, 0.0, 1.0);
    float sp = p * p * (3.0 - 2.0 * p);
    vec2 uv = v_uv;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec4 col = getTo(uv);

    if (u_trans_mode == 0) {
        // none (corte seco)
        col = getTo(uv);
    } else if (u_trans_mode == 1) {
        // dissolve
        col = mix(getFrom(uv), getTo(uv), p);
    } else if (u_trans_mode == 2) {
        // fadeblack
        if (p < 0.5) {
            col = mix(getFrom(uv), vec4(0.0, 0.0, 0.0, 1.0), smoothstep(0.0, 0.5, p));
        } else {
            col = mix(vec4(0.0, 0.0, 0.0, 1.0), getTo(uv), smoothstep(0.5, 1.0, p));
        }
    } else if (u_trans_mode == 3) {
        // fadewhite
        if (p < 0.5) {
            col = mix(getFrom(uv), vec4(1.0, 1.0, 1.0, 1.0), smoothstep(0.0, 0.5, p));
        } else {
            col = mix(vec4(1.0, 1.0, 1.0, 1.0), getTo(uv), smoothstep(0.5, 1.0, p));
        }
    } else if (u_trans_mode == 4) {
        // crossfade suave
        col = mix(getFrom(uv), getTo(uv), sp);
    } else if (u_trans_mode == 5) {
        // pixelize
        float intensity = sin(p * PI);
        float squares = mix(240.0, 14.0, intensity);
        vec2 grid = vec2(max(squares * aspect, 4.0), max(squares, 4.0));
        vec2 puv = (floor(uv * grid) + vec2(0.5)) / grid;
        col = mix(getFrom(puv), getTo(puv), sp);
    } else if (u_trans_mode == 6) {
        // radial (varredura relógio a partir do topo)
        vec2 rp = uv - vec2(0.5, 0.5);
        float a = atan(rp.x, -rp.y); // -PI..PI, 0 no topo
        float norm_a = fract(a / (2.0 * PI));
        float m = smoothstep(p - 0.015, p + 0.015, norm_a);
        col = mix(getTo(uv), getFrom(uv), m);
    } else if (u_trans_mode == 7) {
        // slideleft (entra da direita empurrando para esquerda)
        float b = 1.0 - sp;
        if (uv.x < b) {
            col = getFrom(vec2(uv.x + sp, uv.y));
        } else {
            col = getTo(vec2(uv.x - b, uv.y));
        }
    } else if (u_trans_mode == 8) {
        // slideright (entra da esquerda empurrando para direita)
        float b = sp;
        if (uv.x < b) {
            col = getTo(vec2(uv.x + 1.0 - sp, uv.y));
        } else {
            col = getFrom(vec2(uv.x - sp, uv.y));
        }
    } else if (u_trans_mode == 9) {
        // slideup (entra de baixo empurrando para cima)
        float b = 1.0 - sp;
        if (uv.y < b) {
            col = getFrom(vec2(uv.x, uv.y + sp));
        } else {
            col = getTo(vec2(uv.x, uv.y - b));
        }
    } else if (u_trans_mode == 10) {
        // slidedown (entra de cima empurrando para baixo)
        float b = sp;
        if (uv.y < b) {
            col = getTo(vec2(uv.x, uv.y + 1.0 - sp));
        } else {
            col = getFrom(vec2(uv.x, uv.y - sp));
        }
    } else if (u_trans_mode == 11) {
        // smoothleft
        float edge = 1.0 - sp;
        float m = smoothstep(edge - 0.14, edge + 0.14, uv.x);
        col = mix(getFrom(vec2(uv.x + sp * 0.25, uv.y)), getTo(vec2(uv.x - (1.0 - sp) * 0.25, uv.y)), m);
    } else if (u_trans_mode == 12) {
        // smoothright
        float edge = sp;
        float m = 1.0 - smoothstep(edge - 0.14, edge + 0.14, uv.x);
        col = mix(getFrom(vec2(uv.x - sp * 0.25, uv.y)), getTo(vec2(uv.x + (1.0 - sp) * 0.25, uv.y)), m);
    } else if (u_trans_mode == 13) {
        // smoothup
        float edge = 1.0 - sp;
        float m = smoothstep(edge - 0.14, edge + 0.14, uv.y);
        col = mix(getFrom(vec2(uv.x, uv.y + sp * 0.25)), getTo(vec2(uv.x, uv.y - (1.0 - sp) * 0.25)), m);
    } else if (u_trans_mode == 14) {
        // smoothdown
        float edge = sp;
        float m = 1.0 - smoothstep(edge - 0.14, edge + 0.14, uv.y);
        col = mix(getFrom(vec2(uv.x, uv.y - sp * 0.25)), getTo(vec2(uv.x, uv.y + (1.0 - sp) * 0.25)), m);
    } else if (u_trans_mode == 15) {
        // wipeleft
        float m = smoothstep(1.0 - p - 0.008, 1.0 - p + 0.008, uv.x);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 16) {
        // wiperight
        float m = 1.0 - smoothstep(p - 0.008, p + 0.008, uv.x);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 17) {
        // wipeup
        float m = smoothstep(1.0 - p - 0.008, 1.0 - p + 0.008, uv.y);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 18) {
        // wipedown
        float m = 1.0 - smoothstep(p - 0.008, p + 0.008, uv.y);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 19) {
        // diagtl (topo esquerdo -> baixo direito)
        float d = (uv.x + uv.y) * 0.5;
        float m = 1.0 - smoothstep(p - 0.015, p + 0.015, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 20) {
        // diagtr (topo direito -> baixo esquerdo)
        float d = ((1.0 - uv.x) + uv.y) * 0.5;
        float m = 1.0 - smoothstep(p - 0.015, p + 0.015, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 21) {
        // diagbl (baixo esquerdo -> topo direito)
        float d = (uv.x + (1.0 - uv.y)) * 0.5;
        float m = 1.0 - smoothstep(p - 0.015, p + 0.015, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 22) {
        // diagbr (baixo direito -> topo esquerdo)
        float d = ((1.0 - uv.x) + (1.0 - uv.y)) * 0.5;
        float m = 1.0 - smoothstep(p - 0.015, p + 0.015, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 23) {
        // circleopen (íris abrir do centro)
        vec2 c = (uv - vec2(0.5, 0.5)) * vec2(aspect, 1.0);
        float max_r = length(vec2(0.5 * aspect, 0.5)) + 0.02;
        float r = sp * max_r;
        float m = 1.0 - smoothstep(r - 0.015, r + 0.015, length(c));
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 24) {
        // circleclose (íris fechar para o centro)
        vec2 c = (uv - vec2(0.5, 0.5)) * vec2(aspect, 1.0);
        float max_r = length(vec2(0.5 * aspect, 0.5)) + 0.02;
        float r = (1.0 - sp) * max_r;
        float m = smoothstep(r - 0.015, r + 0.015, length(c));
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 25) {
        // horzopen (cortinas horizontais abrindo do centro)
        float d = abs(uv.x - 0.5);
        float m = 1.0 - smoothstep(sp * 0.5 - 0.008, sp * 0.5 + 0.008, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 26) {
        // horzclose (cortinas horizontais fechando para o centro)
        float d = abs(uv.x - 0.5);
        float edge = (1.0 - sp) * 0.5;
        float m = smoothstep(edge - 0.008, edge + 0.008, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 27) {
        // vertopen (cortinas verticais abrindo do centro)
        float d = abs(uv.y - 0.5);
        float m = 1.0 - smoothstep(sp * 0.5 - 0.008, sp * 0.5 + 0.008, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 28) {
        // vertclose (cortinas verticais fechando para o centro)
        float d = abs(uv.y - 0.5);
        float edge = (1.0 - sp) * 0.5;
        float m = smoothstep(edge - 0.008, edge + 0.008, d);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 29) {
        // hlslice (fatias horizontais varrendo para a esquerda)
        float count = 8.0;
        float idx = floor(uv.y * count);
        float delay = (idx / count) * 0.45;
        float local_p = clamp((p - delay) / 0.55, 0.0, 1.0);
        float m = smoothstep(1.0 - local_p - 0.01, 1.0 - local_p + 0.01, uv.x);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 30) {
        // hrslice (fatias horizontais varrendo para a direita)
        float count = 8.0;
        float idx = floor(uv.y * count);
        float delay = (idx / count) * 0.45;
        float local_p = clamp((p - delay) / 0.55, 0.0, 1.0);
        float m = 1.0 - smoothstep(local_p - 0.01, local_p + 0.01, uv.x);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 31) {
        // vuslice (fatias verticais varrendo para cima)
        float count = 10.0;
        float idx = floor(uv.x * count);
        float delay = (idx / count) * 0.45;
        float local_p = clamp((p - delay) / 0.55, 0.0, 1.0);
        float m = smoothstep(1.0 - local_p - 0.01, 1.0 - local_p + 0.01, uv.y);
        col = mix(getFrom(uv), getTo(uv), m);
    } else if (u_trans_mode == 32) {
        // vdslice (fatias verticais varrendo para baixo)
        float count = 10.0;
        float idx = floor(uv.x * count);
        float delay = (idx / count) * 0.45;
        float local_p = clamp((p - delay) / 0.55, 0.0, 1.0);
        float m = 1.0 - smoothstep(local_p - 0.01, local_p + 0.01, uv.y);
        col = mix(getFrom(uv), getTo(uv), m);
    } else {
        col = mix(getFrom(uv), getTo(uv), sp);
    }

    fragColor = vec4(clamp(col.rgb, 0.0, 1.0), 1.0);
}
"""


def _set_uniform(prog, name: str, value):
    if name in prog:
        prog[name].value = value


def _detecta_nvenc() -> bool:
    """Testa rapidamente se o FFmpeg desta máquina Colab consegue codificar com h264_nvenc."""
    try:
        res = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "lavfi", "-i", "color=black:s=64x64:d=0.1",
                "-c:v", "h264_nvenc", "-f", "null", "-"
            ],
            capture_output=True,
            text=True,
            timeout=12,
        )
        return res.returncode == 0
    except Exception:
        return False


def _cria_contexto_opengl_headless():
    """Cria contexto ModernGL headless via EGL (obrigatório em GPU Linux/Colab)."""
    if moderngl is None:
        raise RuntimeError("Biblioteca 'moderngl' não está instalada neste ambiente Python.")
    try:
        ctx = moderngl.create_standalone_context(backend="egl")
    except Exception as e_egl:
        # Tenta backend padrão apenas se uma GPU NVIDIA estiver ativa (algumas imagens expõem GLX/EGL implícito)
        try:
            ctx = moderngl.create_standalone_context()
        except Exception as e_def:
            raise RuntimeError(f"EGL: {e_egl} | Padrão: {e_def}") from e_def
    ctx.pack_alignment = 1
    ctx.unpack_alignment = 1
    return ctx


def diagnostico_gpu_opengl(force_refresh: bool = False) -> dict:
    """
    Diagnostica GPU CUDA, contexto ModernGL (OpenGL/EGL) e codificador FFmpeg NVENC.
    Usado pelo endpoint /status e na validação estrita antes de rodar jobs 'opengl'.
    """
    global _CACHE_DIAG_GPU_OPENGL
    with _LOCK_DIAG_GPU_OPENGL:
        if _CACHE_DIAG_GPU_OPENGL is not None and not force_refresh:
            return dict(_CACHE_DIAG_GPU_OPENGL)

        gpu_ativa = False
        gpu_nome = "CPU"
        try:
            if torch.cuda.is_available():
                gpu_ativa = True
                gpu_nome = torch.cuda.get_device_name(0)
        except Exception:
            pass

        if not gpu_ativa:
            try:
                out_smi = subprocess.check_output(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    text=True,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                ).strip()
                if out_smi:
                    gpu_ativa = True
                    gpu_nome = out_smi.splitlines()[0].strip()
            except Exception:
                pass

        opengl_ok = False
        opengl_motivo = None
        nvenc_ok = False

        if not gpu_ativa:
            opengl_motivo = (
                "GPU não detectada no Google Colab (sessão atual rodando em CPU). "
                "Ative em: Ambiente de execução → Alterar tipo de ambiente de execução → GPU T4/L4."
            )
        elif moderngl is None:
            opengl_motivo = "Pacote 'moderngl' não encontrado no ambiente Python do Colab."
        else:
            try:
                ctx_teste = _cria_contexto_opengl_headless()
                ctx_teste.release()
                opengl_ok = True
            except Exception as e:
                opengl_motivo = f"Falha ao inicializar OpenGL/EGL na GPU ({gpu_nome}): {e}"

        if gpu_ativa:
            nvenc_ok = _detecta_nvenc()

        info = {
            "gpu_ativa": gpu_ativa,
            "gpu_nome": gpu_nome,
            "opengl_disponivel": opengl_ok,
            "opengl_motivo": opengl_motivo,
            "nvenc_disponivel": nvenc_ok,
        }
        _CACHE_DIAG_GPU_OPENGL = info
        return dict(info)


def _verifica_gpu_opengl_obrigatorio() -> dict:
    """
    Validação estrita para o motor GPU Studio (OpenGL).
    NUNCA faz fallback silencioso para FFmpeg: interrompe com mensagem clara explicando
    se faltou ativar a GPU no Colab ou qual foi o erro do OpenGL/EGL.
    """
    diag = diagnostico_gpu_opengl(force_refresh=True)
    if not diag["gpu_ativa"]:
        raise RuntimeError(
            "GPU não detectada no Google Colab (a sessão atual está rodando em CPU).\n\n"
            "O motor GPU Studio (OpenGL) exige aceleração de GPU. Para ativar:\n"
            "1. No Google Colab, abra o menu 'Ambiente de execução' → 'Alterar tipo de ambiente de execução'.\n"
            "2. Escolha uma GPU (ex.: T4 GPU ou L4 GPU) e clique em Salvar.\n"
            "3. Rode novamente a célula do servidor e atualize a URL do ngrok no SyncForge.\n\n"
            "Dica: se quiser renderizar agora mesmo sem GPU, selecione o motor 'Padrão FFmpeg' no modal de exportação."
        )
    if not diag["opengl_disponivel"]:
        detalhe = diag.get("opengl_motivo") or "Erro desconhecido ao criar contexto headless EGL."
        raise RuntimeError(
            f"Falha ao inicializar o motor GPU Studio (OpenGL) na GPU '{diag['gpu_nome']}'.\n\n"
            f"Motivo técnico: {detalhe}\n\n"
            "Sugestões:\n"
            "• Reinicie o ambiente de execução do Colab e execute a célula novamente.\n"
            "• Se o erro persistir nesta máquina Colab, selecione o motor 'Padrão FFmpeg' no modal de exportação."
        )
    return diag


def _obtem_dimensoes_video(path: str):
    """Retorna (width, height) do vídeo via ffprobe."""
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0:s=x",
                path,
            ],
            text=True,
            timeout=10,
        ).strip()
        if "x" in out:
            w_s, h_s = out.splitlines()[0].split("x", 1)
            w, h = int(w_s), int(h_s)
            if w > 0 and h > 0:
                return w, h
    except Exception:
        pass
    return 1920, 1080


class _VideoPipeReader:
    """Decodifica um clipe MP4 frame-a-frame via FFmpeg em streaming RGB24 sem encher RAM."""
    def __init__(self, video_path: str, fps: int, slow_factor: float, max_dim: int):
        src_w, src_h = _obtem_dimensoes_video(video_path)
        scale = min(1.0, float(max_dim) / float(max(src_w, src_h, 1)))
        w = max(2, int(round(src_w * scale)) & ~1)
        h = max(2, int(round(src_h * scale)) & ~1)

        self.width = w
        self.height = h
        self.frame_bytes = w * h * 3
        self.last_frame = None
        self.eof = False

        vf_parts = []
        if slow_factor > 1.001:
            vf_parts.append(f"setpts=(PTS-STARTPTS)*{slow_factor:.5f}")
        else:
            vf_parts.append("setpts=PTS-STARTPTS")
        vf_parts.append(f"fps={fps}")
        if w != src_w or h != src_h:
            vf_parts.append(f"scale={w}:{h}:flags=bilinear")

        cmd = [
            "ffmpeg", "-v", "error",
            "-i", video_path,
            "-vf", ",".join(vf_parts),
            "-an", "-sn", "-dn",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "pipe:1",
        ]
        self.proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=self.frame_bytes * 2,
        )

    def read_next_frame(self) -> bytes:
        if not self.eof and self.proc and self.proc.stdout:
            data = self.proc.stdout.read(self.frame_bytes)
            if data and len(data) == self.frame_bytes:
                self.last_frame = data
                return data
            self.eof = True
        if self.last_frame is not None:
            return self.last_frame
        return bytes(self.frame_bytes)

    def close(self):
        if self.proc is not None:
            try:
                if self.proc.stdout:
                    self.proc.stdout.close()
            except Exception:
                pass
            try:
                self.proc.terminate()
                self.proc.wait(timeout=2)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None


class _SceneTextureSource:
    """
    Gerencia a textura OpenGL em streaming de uma única cena (imagem, vídeo MP4,
    vídeo + imagem complementar, vídeo com freeze do último frame ou fundo preto).
    """
    def __init__(self, ctx, scene_plan: dict, fps: int, dst_size: tuple):
        self.ctx = ctx
        self.plan = scene_plan
        self.fps = fps
        self.dst_size = dst_size
        self.max_tex_dim = min(3840, max(dst_size[0], dst_size[1], 1080) * 2)

        self.video_reader = None
        self.video_tex = None
        self.video_size = (2, 2)
        self.image_tex = None
        self.image_size = (2, 2)
        self.black_tex = None
        self.frames_decoded = 0

        mode = scene_plan["mode"]
        if mode in ("video", "video_freeze", "video_plus_image") and scene_plan.get("video_src"):
            max_vid_dim = max(dst_size[0], dst_size[1])
            self.video_reader = _VideoPipeReader(
                scene_plan["video_src"],
                fps=fps,
                slow_factor=scene_plan.get("slow_factor", 1.0),
                max_dim=max_vid_dim,
            )
            self.video_size = (self.video_reader.width, self.video_reader.height)
            self.video_tex = ctx.texture(self.video_size, 3)
            self.video_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)
            self.video_tex.repeat_x = False
            self.video_tex.repeat_y = False

        if mode in ("image", "video_plus_image") and scene_plan.get("image_src"):
            self.image_tex, self.image_size = self._load_image_texture(scene_plan["image_src"])

        if mode == "black" or (self.video_tex is None and self.image_tex is None):
            self.black_tex = ctx.texture((4, 4), 3, bytes(4 * 4 * 3))
            self.black_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)

    def _load_image_texture(self, image_path: str):
        with Image.open(image_path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            w, h = im.size
            if max(w, h) > self.max_tex_dim:
                scale = float(self.max_tex_dim) / float(max(w, h))
                nw = max(2, int(round(w * scale)))
                nh = max(2, int(round(h * scale)))
                im = im.resize((nw, nh), Image.Resampling.LANCZOS)
                w, h = im.size
            raw = im.tobytes()
        tex = self.ctx.texture((w, h), 3, raw, alignment=1)
        tex.build_mipmaps()
        tex.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)
        tex.repeat_x = False
        tex.repeat_y = False
        return tex, (w, h)

    def get_frame_state(self, local_frame: int):
        """
        Retorna (texture, src_size, effect_mode_int, progress_float) para o frame local da cena.
        Suporta frames além de end_frame durante a janela de transição (continuação suave / freeze).
        """
        mode = self.plan["mode"]
        total_scene_frames = max(1, self.plan["num_frames"])
        base_effect = OPENGL_EFFECT_MAP.get(self.plan.get("effect", "none"), 0)

        if mode == "video_plus_image" and self.video_reader is not None and self.image_tex is not None:
            vid_frames = max(1, int(round(self.plan["dur_vid"] * self.fps)))
            if local_frame < vid_frames:
                while self.frames_decoded <= local_frame:
                    frame_data = self.video_reader.read_next_frame()
                    self.video_tex.write(frame_data, alignment=1)
                    self.frames_decoded += 1
                # Mantém paridade com Caso C do motor 4.2: vídeo inicial sem zoom artificial, imagem complementar com efeito
                prog = min(1.0, max(0.0, float(local_frame) / float(max(1, vid_frames - 1))))
                return self.video_tex, self.video_size, 0, prog
            else:
                img_frames = max(1, total_scene_frames - vid_frames)
                img_local = max(0, local_frame - vid_frames)
                prog = min(1.0, max(0.0, float(img_local) / float(max(1, img_frames - 1))))
                return self.image_tex, self.image_size, base_effect, prog

        if mode in ("video", "video_freeze") and self.video_reader is not None:
            while self.frames_decoded <= local_frame:
                frame_data = self.video_reader.read_next_frame()
                self.video_tex.write(frame_data, alignment=1)
                self.frames_decoded += 1
            prog = min(1.0, max(0.0, float(local_frame) / float(max(1, total_scene_frames - 1))))
            return self.video_tex, self.video_size, base_effect, prog

        if self.image_tex is not None:
            prog = min(1.0, max(0.0, float(local_frame) / float(max(1, total_scene_frames - 1))))
            return self.image_tex, self.image_size, base_effect, prog

        return self.black_tex, (4, 4), 0, 0.0

    def release(self):
        if self.video_reader is not None:
            self.video_reader.close()
            self.video_reader = None
        for tex_attr in ("video_tex", "image_tex", "black_tex"):
            tex = getattr(self, tex_attr, None)
            if tex is not None:
                try:
                    tex.release()
                except Exception:
                    pass
                setattr(self, tex_attr, None)


def _monta_filtro_atempo(vel: float) -> str:
    """Gera cadeia válida de filtros atempo (FFmpeg aceita 0.5..2.0 por estágio)."""
    if abs(vel - 1.0) < 0.002:
        return ""
    partes = []
    v = max(0.25, min(4.0, float(vel)))
    while v < 0.5:
        partes.append("atempo=0.5")
        v /= 0.5
    while v > 2.0:
        partes.append("atempo=2.0")
        v /= 2.0
    partes.append(f"atempo={v:.5f}")
    return ",".join(partes)


def _constroi_audio_ambiente_opengl(planos_cenas: list, duracao_total: float, tmp_dir: str) -> Optional[str]:
    """
    Extrai e posiciona no tempo exato o áudio dos clipes de vídeo com volume > 0,
    respeitando slow-motion (atempo) e duração da parte de vídeo.
    Retorna caminho do WAV sincronizado ou None se nenhum clipe possuir áudio ativo.
    """
    faixas = []
    for idx, p in enumerate(planos_cenas):
        v_src = p.get("video_src")
        vol = float(p.get("volume", 0.0))
        if not v_src or vol <= 0.001:
            continue
        if not video_tem_audio(v_src):
            continue

        slow = float(p.get("slow_factor", 1.0))
        if p["mode"] in ("video_plus_image", "video_freeze"):
            dur_clip_audio = min(float(p["dur_real"]), float(p["dur_vid"]))
        else:
            dur_clip_audio = float(p["dur_real"])

        if dur_clip_audio <= 0.05:
            continue

        seg_wav = os.path.join(tmp_dir, f"amb_seg_{idx:04d}.wav")
        af_parts = []
        if slow > 1.001:
            atempo_str = _monta_filtro_atempo(1.0 / slow)
            if atempo_str:
                af_parts.append(atempo_str)
        af_parts.append(f"atrim=0:{dur_clip_audio:.4f}")
        af_parts.append("asetpts=PTS-STARTPTS")
        af_parts.append(f"volume={vol:.3f}")
        af_parts.append("aresample=48000")

        cmd_seg = [
            "ffmpeg", "-y", "-v", "error",
            "-i", v_src,
            "-vn",
            "-af", ",".join(af_parts),
            "-ac", "2", "-ar", "48000",
            seg_wav,
        ]
        roda_ffmpeg(cmd_seg, f"extração de áudio ambiente da cena {idx + 1}")
        faixas.append({
            "path": seg_wav,
            "delay_ms": max(0, int(round(float(p["start_t"]) * 1000.0))),
        })

    if not faixas:
        return None

    # Mistura em lotes de até 24 entradas para suportar projetos longos sem estourar o filter_complex
    base_wav = os.path.join(tmp_dir, "ambient_base.wav")
    roda_ffmpeg(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-t", f"{max(0.1, duracao_total):.4f}",
            "-ac", "2", "-ar", "48000",
            base_wav,
        ],
        "base silenciosa de áudio ambiente",
    )

    atual = base_wav
    batch_size = 24
    for b_idx in range(0, len(faixas), batch_size):
        lote = faixas[b_idx:b_idx + batch_size]
        prox = os.path.join(tmp_dir, f"ambient_mix_{b_idx // batch_size}.wav")
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", atual]
        filter_parts = []
        mix_inputs = ["[0:a]"]
        for k, item in enumerate(lote, start=1):
            cmd.extend(["-i", item["path"]])
            d_ms = item["delay_ms"]
            filter_parts.append(f"[{k}:a]adelay={d_ms}|{d_ms},apad[a{k}]")
            mix_inputs.append(f"[a{k}]")

        n_in = len(mix_inputs)
        # normalize=0 preserva exatamente o volume configurado de cada clipe sem atenuar pelo número de entradas
        filter_parts.append(
            f"{''.join(mix_inputs)}amix=inputs={n_in}:duration=first:dropout_transition=0:normalize=0[aout]"
        )
        cmd.extend([
            "-filter_complex", ";".join(filter_parts),
            "-map", "[aout]",
            "-t", f"{max(0.1, duracao_total):.4f}",
            "-ac", "2", "-ar", "48000",
            prox,
        ])
        roda_ffmpeg(cmd, f"mixagem de áudio ambiente (lote {b_idx // batch_size + 1})")
        atual = prox

    return atual


def _valida_mp4_final_ffprobe(saida_mp4: str, duracao_audio: float, fps: int) -> list:
    """Executa auditoria ffprobe de duração e FPS médio no MP4 final."""
    avisos = []
    try:
        cmd_probe = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=duration,nb_frames,avg_frame_rate",
            "-of", "json",
            saida_mp4,
        ]
        out_probe = subprocess.check_output(cmd_probe, text=True).strip()
        data_probe = json.loads(out_probe)
        streams = data_probe.get("streams", [])
        if streams:
            st = streams[0]
            dur_str = st.get("duration")
            frames_str = st.get("nb_frames")
            avg_fps_str = st.get("avg_frame_rate", "")

            dur_video = 0.0
            if dur_str and dur_str != "N/A":
                try:
                    dur_video = float(dur_str)
                except Exception:
                    pass

            if dur_video <= 0.05:
                cmd_fmt = [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    saida_mp4,
                ]
                out_fmt = subprocess.check_output(cmd_fmt, text=True).strip()
                if out_fmt and out_fmt != "N/A":
                    try:
                        dur_video = float(out_fmt)
                    except Exception:
                        pass

            fps_nominal = 0.0
            if avg_fps_str and avg_fps_str != "0/0":
                if "/" in avg_fps_str:
                    num, den = avg_fps_str.split("/", 1)
                    if float(den) > 0:
                        fps_nominal = float(num) / float(den)
                else:
                    fps_nominal = float(avg_fps_str)

            nb_frames_val = 0
            if frames_str and frames_str != "N/A" and str(frames_str).isdigit():
                nb_frames_val = int(frames_str)
            elif fps_nominal > 0 and dur_video > 0:
                nb_frames_val = int(round(fps_nominal * dur_video))

            fps_medio = (nb_frames_val / dur_video) if (dur_video > 0 and nb_frames_val > 0) else fps_nominal
            print(f"📊 Vídeo final (GPU Studio): {dur_video:.2f} s, {nb_frames_val} quadros, fps médio {fps_medio:.2f}")

            if duracao_audio and (duracao_audio - dur_video > 2.0):
                diff_s = round(duracao_audio - dur_video, 1)
                avisos.append(f"O vídeo final tem {diff_s} s a menos que a narração.")

            if fps and fps_medio < (0.90 * fps):
                fps_fmt = round(fps_medio, 1)
                avisos.append(f"O vídeo tem taxa de quadros variável (média de {fps_fmt} fps, esperado {fps}).")
    except Exception as e:
        print(f"⚠️ Aviso ao validar MP4 final (GPU Studio): {e}")
    return avisos


def renderiza_video_opengl(instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, cb_status=None, resolucao=RESOLUCAO, preset="fast", crf=None, formato="", qualidade="", fps=FPS):
    """
    Motor GPU Studio: renderiza todas as cenas em streaming na GPU via ModernGL (OpenGL 3.3 Core)
    com suporte completo a:
      - 33 transições GLSL reais na fronteira entre cenas (sem reduzir duração total)
      - 10 filtros de cor/textura com intensidade configurável
      - 6 movimentos de câmera suaves em sub-pixel (float32)
      - Enquadramentos contain, cover e blur (fundo desfocado em GPU)
      - Mídia mista (imagens + clipes MP4 com corte, slow-motion até 1.40x, imagem complementar ou freeze)
      - Áudio ambiente sincronizado dos clipes MP4 + narração + BGM opcional
      - Codificação direta via pipe para FFmpeg h264_nvenc (ou libx264 se NVENC indisponível na GPU)
    """
    is_progresso = isinstance(cb_status, ProgressoJob)

    # 1. Validação estrita de GPU + OpenGL/EGL (interrompe com aviso claro se faltar GPU)
    diag = _verifica_gpu_opengl_obrigatorio()
    usa_nvenc = bool(diag.get("nvenc_disponivel", False))
    encoder_label = "h264_nvenc" if usa_nvenc else "libx264"

    dst_w, dst_h = int(resolucao[0]), int(resolucao[1])
    fps = int(fps)
    perfil_label = f"{formato} {qualidade}".strip() if (formato or qualidade) else f"{dst_w}x{dst_h}"
    print(
        f"✨ Iniciando GPU Studio (OpenGL + GLSL + {encoder_label}) | "
        f"GPU: {diag['gpu_nome']} | Perfil: {perfil_label} ({dst_w}x{dst_h}) @ {fps}fps | {len(instrucoes)} cenas"
    )

    if is_progresso:
        cb_status.atualiza_detalhe(f"GPU pronta: {diag['gpu_nome']} ({encoder_label})")

    unidades_visuais = obtem_unidades_visuais(pasta_job)
    tmp_dir = tempfile.mkdtemp(prefix="motor_opengl_")
    ctx = None
    fbo_a = fbo_b = fbo_out = None
    tex_a = tex_b = tex_out = None
    vbo = vao_scene = vao_trans = None
    prog_scene = prog_trans = None
    enc_proc = None
    enc_log_fh = None
    sources_abertas = {}

    try:
        # 2. Planejamento de todas as cenas (paridade total com as regras de vídeo/imagem do motor 4.2)
        planos = []
        total_cenas = len(instrucoes)
        t_acumulado = 0.0

        for i, cena in enumerate(instrucoes):
            dur_real = instrucoes[i + 1]["start"] - cena["start"] if i < total_cenas - 1 else duracao_audio - cena["start"]
            dur_real = max(float(dur_real), 0.1)
            id_cena = cena["id_cena"]
            arquivo = cena.get("arquivo", None)

            id_str = str(id_cena).strip().lower()
            id_clean = id_str.lstrip("0") or "0"
            base_decl = nome_base_sem_ext(arquivo).lower() if arquivo else id_str
            base_decl_clean = base_decl.lstrip("0") or "0"
            id_digits = re.sub(r"\D", "", id_str).lstrip("0") or "0"

            unidade_escolhida = None
            for u in unidades_visuais:
                b = u["base"]
                b_clean = b.lstrip("0") or "0"
                b_digits = re.sub(r"\D", "", b).lstrip("0") or "0"
                if (arquivo and (arquivo.lower() == (u["video"] or "").lower() or arquivo.lower() == (u["imagem"] or "").lower())) \
                   or b == base_decl or b_clean == base_decl_clean or (b_digits and b_digits == id_digits):
                    unidade_escolhida = u
                    break

            if not unidade_escolhida:
                for u in unidades_visuais:
                    b = u["base"]
                    b_clean = b.lstrip("0") or "0"
                    b_digits = re.sub(r"\D", "", b).lstrip("0") or "0"
                    if b == id_str or b_clean == id_clean or (b_digits and b_digits == id_digits) or id_str in b or b in id_str:
                        unidade_escolhida = u
                        break

            if not unidade_escolhida and i < len(unidades_visuais):
                unidade_escolhida = unidades_visuais[i]

            video_src = unidade_escolhida["video_path"] if unidade_escolhida else None
            image_src = unidade_escolhida["image_path"] if unidade_escolhida else None

            if not video_src and not image_src and arquivo:
                caminho_dir = os.path.join(pasta_job, arquivo)
                if os.path.exists(caminho_dir):
                    if eh_video(arquivo):
                        video_src = caminho_dir
                    elif eh_imagem(arquivo):
                        image_src = caminho_dir

            dur_vid = obtem_duracao_midia(video_src) if video_src else 0.0
            slow_factor = 1.0
            if video_src and dur_vid > 0.05:
                if dur_real <= dur_vid:
                    mode = "video"
                elif dur_real <= (dur_vid * 1.40):
                    mode = "video"
                    slow_factor = dur_real / dur_vid
                elif image_src:
                    mode = "video_plus_image"
                else:
                    mode = "video_freeze"
            elif image_src:
                mode = "image"
            else:
                mode = "black"

            start_t = t_acumulado
            end_t = t_acumulado + dur_real
            t_acumulado = end_t

            planos.append({
                "index": i,
                "id_cena": id_cena,
                "mode": mode,
                "video_src": video_src,
                "image_src": image_src,
                "dur_vid": dur_vid,
                "dur_real": dur_real,
                "slow_factor": slow_factor,
                "start_t": start_t,
                "end_t": end_t,
                "fit": (cena.get("fit") or "contain").lower(),
                "effect": (cena.get("effect") or "none").lower(),
                "filter": (cena.get("filter") or "none").lower(),
                "filter_intensity": max(0.0, min(1.0, float(cena.get("filter_intensity", 100)) / 100.0)),
                "transition": (cena.get("transition") or "none").lower(),
                "transition_duration": max(0.0, float(cena.get("transition_duration", 0.8))),
                "volume": float(cena.get("volume", 0.0)),
            })

        if not planos:
            raise ValueError("Nenhuma cena válida encontrada na timeline para renderização OpenGL.")

        # Converte timestamps acumulados para intervalos inteiros contíguos sem drift
        duracao_total_render = t_acumulado
        prev_end_frame = 0
        for idx, p in enumerate(planos):
            sf = prev_end_frame
            ef = int(round(p["end_t"] * fps))
            if ef <= sf:
                ef = sf + 1
            p["start_frame"] = sf
            p["end_frame"] = ef
            p["num_frames"] = ef - sf
            prev_end_frame = ef

        total_frames = prev_end_frame

        # Calcula janelas de transição (sem reduzir duração total: sobreposição suave na abertura da cena B)
        for idx, p in enumerate(planos):
            if idx == 0:
                p["trans_frames"] = 0
                continue
            t_name = p["transition"]
            t_dur = p["transition_duration"]
            if t_name != "none" and t_dur > 0.01:
                prev_len = planos[idx - 1]["num_frames"]
                curr_len = p["num_frames"]
                tf = int(round(t_dur * fps))
                tf = min(tf, max(1, prev_len // 2), max(1, curr_len // 2))
                p["trans_frames"] = max(0, tf)
            else:
                p["trans_frames"] = 0

        # 3. Áudio ambiente sincronizado dos clipes MP4 (quando houver clipes com volume > 0)
        if is_progresso:
            cb_status.inicia_etapa("audio_ambiente", detalhe="Verificando áudio dos clipes de vídeo...")
        ambient_wav = _constroi_audio_ambiente_opengl(planos, duracao_total_render, tmp_dir)

        # 4. Inicialização do contexto ModernGL (OpenGL 3.3 Core headless) + Shaders + FBOs
        if is_progresso:
            cb_status.inicia_etapa("render_gpu", detalhe=f"Compilando shaders GLSL na GPU ({diag['gpu_nome']})...")
        elif cb_status:
            cb_status("render", "Inicializando shaders OpenGL na GPU...", 15)

        ctx = _cria_contexto_opengl_headless()
        prog_scene = ctx.program(vertex_shader=_QUAD_VERTEX_SHADER, fragment_shader=_SCENE_FRAGMENT_SHADER)
        prog_trans = ctx.program(vertex_shader=_QUAD_VERTEX_SHADER, fragment_shader=_TRANSITION_FRAGMENT_SHADER)

        # Quad cobrindo [-1, 1] com UV (0,0) em (-1,-1) e (1,1) em (1,1):
        # mantém layout top-to-bottom idêntico ao PIL e ao FFmpeg rawvideo RGB24 sem flip em CPU!
        quad_data = np.array([
            -1.0, -1.0, 0.0, 0.0,
             1.0, -1.0, 1.0, 0.0,
            -1.0,  1.0, 0.0, 1.0,
             1.0,  1.0, 1.0, 1.0,
        ], dtype="f4")
        vbo = ctx.buffer(quad_data.tobytes())
        vao_scene = ctx.simple_vertex_array(prog_scene, vbo, "in_pos", "in_uv")
        vao_trans = ctx.simple_vertex_array(prog_trans, vbo, "in_pos", "in_uv")

        tex_a = ctx.texture((dst_w, dst_h), 3)
        tex_b = ctx.texture((dst_w, dst_h), 3)
        tex_out = ctx.texture((dst_w, dst_h), 3)
        for tx in (tex_a, tex_b, tex_out):
            tx.filter = (moderngl.LINEAR, moderngl.LINEAR)
            tx.repeat_x = False
            tx.repeat_y = False

        fbo_a = ctx.framebuffer(color_attachments=[tex_a])
        fbo_b = ctx.framebuffer(color_attachments=[tex_b])
        fbo_out = ctx.framebuffer(color_attachments=[tex_out])

        # 5. Abre pipe único para o codificador FFmpeg (NVENC por hardware se disponível)
        video_sem_audio = os.path.join(tmp_dir, "video_opengl_raw.mp4")
        enc_log_path = os.path.join(tmp_dir, "ffmpeg_encoder.log")
        enc_log_fh = open(enc_log_path, "wb")

        cmd_enc = [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", f"{dst_w}x{dst_h}",
            "-r", str(fps),
            "-i", "pipe:0",
            "-an",
        ]
        if usa_nvenc:
            cq_val = "26" if (crf and str(crf) == "28") else "19"
            cmd_enc.extend([
                "-c:v", "h264_nvenc",
                "-preset", "p4",
                "-rc", "vbr",
                "-cq", cq_val,
                "-b:v", "0",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                video_sem_audio,
            ])
        else:
            cmd_enc.extend([
                "-c:v", "libx264",
                "-preset", preset,
                "-crf", str(crf or "20"),
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                video_sem_audio,
            ])

        enc_proc = subprocess.Popen(
            cmd_enc,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=enc_log_fh,
            bufsize=dst_w * dst_h * 3 * 2,
        )

        def _obtem_source(idx_cena: int) -> _SceneTextureSource:
            if idx_cena not in sources_abertas:
                sources_abertas[idx_cena] = _SceneTextureSource(ctx, planos[idx_cena], fps, (dst_w, dst_h))
            return sources_abertas[idx_cena]

        def _renderiza_cena_para_fbo(target_fbo, idx_cena: int, local_frame: int, t_global: float):
            p_cena = planos[idx_cena]
            src = _obtem_source(idx_cena)
            tex, src_sz, eff_mode, prog_val = src.get_frame_state(local_frame)
            target_fbo.use()
            ctx.viewport = (0, 0, dst_w, dst_h)
            ctx.clear(0.0, 0.0, 0.0, 1.0)
            tex.use(location=0)
            _set_uniform(prog_scene, "u_tex", 0)
            _set_uniform(prog_scene, "u_src_size", (float(src_sz[0]), float(src_sz[1])))
            _set_uniform(prog_scene, "u_dst_size", (float(dst_w), float(dst_h)))
            _set_uniform(prog_scene, "u_fit_mode", OPENGL_FIT_MAP.get(p_cena["fit"], 0))
            _set_uniform(prog_scene, "u_effect_mode", eff_mode)
            _set_uniform(prog_scene, "u_progress", float(prog_val))
            _set_uniform(prog_scene, "u_filter_mode", OPENGL_FILTER_MAP.get(p_cena["filter"], 0))
            _set_uniform(prog_scene, "u_filter_intensity", float(p_cena["filter_intensity"]))
            _set_uniform(prog_scene, "u_time", float(t_global))
            vao_scene.render(moderngl.TRIANGLE_STRIP)

        # 6. Loop principal de streaming frame-a-frame (mantém no máximo 2 cenas em VRAM)
        t_inicio_render = time.time()
        ultimo_report = 0.0
        curr_idx = 0

        for f_idx in range(total_frames):
            while curr_idx < total_cenas - 1 and f_idx >= planos[curr_idx]["end_frame"]:
                curr_idx += 1

            p_curr = planos[curr_idx]
            local_curr = f_idx - p_curr["start_frame"]
            t_global = float(f_idx) / float(fps)
            tf = p_curr["trans_frames"]
            em_transicao = (curr_idx > 0 and tf > 0 and local_curr < tf)

            # Libera imediatamente qualquer cena que não seja necessária neste frame (VRAM constante)
            manter = {curr_idx}
            if em_transicao:
                manter.add(curr_idx - 1)
            for aberto_idx in list(sources_abertas.keys()):
                if aberto_idx not in manter:
                    sources_abertas.pop(aberto_idx).release()

            if em_transicao:
                prev_idx = curr_idx - 1
                p_prev = planos[prev_idx]
                local_prev = f_idx - p_prev["start_frame"]
                _renderiza_cena_para_fbo(fbo_a, prev_idx, local_prev, t_global)
                _renderiza_cena_para_fbo(fbo_b, curr_idx, local_curr, t_global)

                fbo_out.use()
                ctx.viewport = (0, 0, dst_w, dst_h)
                tex_a.use(location=0)
                tex_b.use(location=1)
                _set_uniform(prog_trans, "u_from", 0)
                _set_uniform(prog_trans, "u_to", 1)
                _set_uniform(prog_trans, "u_progress", float(local_curr + 0.5) / float(tf))
                _set_uniform(prog_trans, "u_trans_mode", OPENGL_TRANSITION_MAP.get(p_curr["transition"], 4))
                _set_uniform(prog_trans, "u_resolution", (float(dst_w), float(dst_h)))
                vao_trans.render(moderngl.TRIANGLE_STRIP)
                frame_raw = fbo_out.read(components=3, alignment=1)
            else:
                _renderiza_cena_para_fbo(fbo_out, curr_idx, local_curr, t_global)
                frame_raw = fbo_out.read(components=3, alignment=1)

            try:
                enc_proc.stdin.write(frame_raw)
            except BrokenPipeError:
                break

            agora = time.time()
            if (agora - ultimo_report >= 0.8) or (f_idx == total_frames - 1):
                ultimo_report = agora
                frac = float(f_idx + 1) / float(total_frames)
                eta_s = None
                if f_idx >= fps and f_idx < total_frames - 1:
                    decorrido = agora - t_inicio_render
                    fps_real = float(f_idx + 1) / max(decorrido, 0.001)
                    restantes = total_frames - (f_idx + 1)
                    eta_s = int(round(restantes / max(fps_real, 0.1)))
                detalhe_txt = f"Cena {curr_idx + 1}/{total_cenas} · Frame {f_idx + 1}/{total_frames} ({encoder_label})"
                if is_progresso:
                    cb_status.fracao(frac, detalhe_txt, eta_s=eta_s)
                elif cb_status:
                    cb_status("render", detalhe_txt, int(15 + frac * 70))

        # Fecha pipe de vídeo e valida término do encoder
        if enc_proc.stdin:
            try:
                enc_proc.stdin.close()
            except Exception:
                pass
        ret_enc = enc_proc.wait()
        enc_proc = None
        if enc_log_fh:
            enc_log_fh.close()
            enc_log_fh = None

        if ret_enc != 0 or not os.path.exists(video_sem_audio) or os.path.getsize(video_sem_audio) == 0:
            err_tail = ""
            try:
                with open(enc_log_path, "r", encoding="utf-8", errors="replace") as f_log:
                    err_tail = f_log.read().strip()[-800:]
            except Exception:
                pass
            raise RuntimeError(f"Encoder FFmpeg ({encoder_label}) falhou no motor GPU Studio: {err_tail}")

        # Libera VRAM antes da mixagem final
        for s in list(sources_abertas.values()):
            s.release()
        sources_abertas.clear()

        # 7. Mixagem final de áudio (Narração + Áudio Ambiente dos Clipes MP4 + BGM opcional)
        if is_progresso:
            cb_status.inicia_etapa("mixagem", detalhe="Mixando narração, áudio ambiente e gerando MP4 final...")
        elif cb_status:
            cb_status("render", "Mixando áudio e gerando MP4 final...", 90)

        bgm_path = None
        for f in os.listdir(pasta_job):
            if nome_base_sem_ext(f) == "bgm" and eh_audio(f):
                bgm_path = os.path.join(pasta_job, f)
                break

        tem_bgm = bool(bgm_path and os.path.exists(bgm_path))
        tem_amb = bool(ambient_wav and os.path.exists(ambient_wav))

        if tem_amb and tem_bgm:
            cmd_mix = [
                "ffmpeg", "-y",
                "-i", video_sem_audio,
                "-i", audio_path,
                "-i", ambient_wav,
                "-i", bgm_path,
                "-filter_complex", "[1:a]volume=1.0[voz];[2:a]volume=1.0[amb];[3:a]volume=0.2[bgm];[voz][amb][bgm]amix=inputs=3:duration=first:dropout_transition=2[aout]",
                "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                "-map", "0:v:0", "-map", "[aout]", saida_mp4,
            ]
            roda_ffmpeg(cmd_mix, "mixagem final GPU Studio (voz + ambiente + BGM)")
        elif tem_amb:
            cmd_mix = [
                "ffmpeg", "-y",
                "-i", video_sem_audio,
                "-i", audio_path,
                "-i", ambient_wav,
                "-filter_complex", "[1:a]volume=1.0[voz];[2:a]volume=1.0[amb];[voz][amb]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                "-map", "0:v:0", "-map", "[aout]", saida_mp4,
            ]
            roda_ffmpeg(cmd_mix, "mixagem final GPU Studio (voz + ambiente)")
        elif tem_bgm:
            cmd_mix = [
                "ffmpeg", "-y",
                "-i", video_sem_audio,
                "-i", audio_path,
                "-i", bgm_path,
                "-filter_complex", "[1:a]volume=1.0[voz];[2:a]volume=0.2[bgm];[voz][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                "-map", "0:v:0", "-map", "[aout]", saida_mp4,
            ]
            roda_ffmpeg(cmd_mix, "mixagem final GPU Studio (voz + BGM)")
        else:
            cmd_mix = [
                "ffmpeg", "-y",
                "-i", video_sem_audio,
                "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                "-map", "0:v:0", "-map", "1:a:0", saida_mp4,
            ]
            roda_ffmpeg(cmd_mix, "mixagem final GPU Studio (voz)")

        # 8. Validação ffprobe idêntica ao motor 4.2
        return _valida_mp4_final_ffprobe(saida_mp4, duracao_audio, fps)
    finally:
        for s in list(sources_abertas.values()):
            try:
                s.release()
            except Exception:
                pass
        sources_abertas.clear()

        if enc_proc is not None:
            try:
                if enc_proc.stdin:
                    enc_proc.stdin.close()
            except Exception:
                pass
            try:
                enc_proc.terminate()
                enc_proc.wait(timeout=3)
            except Exception:
                try:
                    enc_proc.kill()
                except Exception:
                    pass
        if enc_log_fh is not None:
            try:
                enc_log_fh.close()
            except Exception:
                pass

        for obj in (vao_scene, vao_trans, vbo, prog_scene, prog_trans, fbo_a, fbo_b, fbo_out, tex_a, tex_b, tex_out, ctx):
            if obj is not None:
                try:
                    obj.release()
                except Exception:
                    pass
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
    diag = diagnostico_gpu_opengl()
    try:
        total_cache = len([f for f in os.listdir(PASTA_CACHE) if f.endswith('.json')]) if os.path.exists(PASTA_CACHE) else 0
    except Exception:
        total_cache = 0

    motores = ["ffmpeg"]
    if diag["opengl_disponivel"]:
        motores.append("opengl")

    return {
        "status": "online",
        "motor": "Motor de Dobra 4.2 AI Studio",
        "versao": "4.2-ngrok-direct",
        "gpu": diag["gpu_nome"],
        "gpu_ativa": diag["gpu_ativa"],
        "opengl_disponivel": diag["opengl_disponivel"],
        "opengl_motivo": diag["opengl_motivo"],
        "nvenc_disponivel": diag["nvenc_disponivel"],
        "motores_disponiveis": motores,
        "whisper_model": WHISPER_MODEL,
        "sem_drive": True,
        "timestamp": datetime.now().isoformat(),
        "cache_transcricao_ativo": USAR_CACHE_TRANSCRICAO,
        "cache_transcricoes": total_cache,
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

def processa_job_background(job_id: str, tipo: str, formato: str = "", qualidade: str = "", ignorar_cache: bool = False, fps: Optional[int] = None, motor_render: str = "ffmpeg"):
    pasta_job = os.path.join(PASTA_JOBS, job_id)
    fps_job = fps if (fps and 10 <= fps <= 120) else FPS
    motor_clean = (motor_render or "ffmpeg").strip().lower()
    if motor_clean not in ("ffmpeg", "opengl"):
        motor_clean = "ffmpeg"

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
                print(f"🎬 Usando timeline enviada pelo App: {len(instrucoes)} cenas (motor: {motor_clean})")
        except Exception as e:
            print(f"⚠️ Erro ao ler timeline.json enviada: {e}")

    # Escolhe o plano de etapas e instancia ProgressoJob
    if tipo == 'timeline':
        plano_chave = 'timeline'
    elif usando_timeline_pronta:
        plano_chave = 'render_opengl_com_timeline' if motor_clean == 'opengl' else 'render_com_timeline'
    else:
        plano_chave = 'timeline_e_render_opengl' if motor_clean == 'opengl' else 'timeline_e_render'

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

            # Transcrição Whisper com progresso real e suporte a cache por hash de áudio
            palavras, duracao_audio = transcreve_audio(audio_path, progresso, ignorar_cache=ignorar_cache)

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

        # Renderização em MP4 se solicitada (roteamento isolado: ffmpeg 4.2 padrão vs opengl GPU Studio)
        avisos_render = []
        if tipo in ['timeline_e_render', 'render']:
            saida_mp4 = os.path.join(pasta_job, "video_final.mp4")
            if motor_clean == "opengl":
                avisos_render = renderiza_video_opengl(
                    instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, progresso,
                    resolucao=resolucao_job, preset=preset_job, crf=crf_job,
                    formato=formato, qualidade=qualidade, fps=fps_job
                ) or []
            else:
                avisos_render = renderiza_video(
                    instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, progresso,
                    resolucao=resolucao_job, preset=preset_job, crf=crf_job,
                    formato=formato, qualidade=qualidade, fps=fps_job
                ) or []

        # Mensagem de conclusão: incorpora avisos da validação caso existam
        if avisos_render:
            msg_final = f"Render concluído com avisos: {' '.join(avisos_render)}"
            progresso.conclui(msg_final)
        else:
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
    fps: str = Form(""),
    motor_render: str = Form("ffmpeg"),
    ignorar_cache: str = Form(""),
    arquivos: List[UploadFile] = File(...)
):
    """
    Recebe os arquivos enviados diretamente pelo frontend do PC (via formulário multipart)
    sem precisar salvar nem sincronizar nada no Google Drive!
    """
    f_clean = (formato or "").strip()
    q_clean = (qualidade or "").strip().lower()
    motor_clean = (motor_render or "ffmpeg").strip().lower()
    ignorar_cache_bool = str(ignorar_cache).strip().lower() in ["1", "true", "on"]

    # Mapeamento de aliases
    if q_clean in ("2k", "1440"):
        q_clean = "1440p"
    elif q_clean in ("4k", "2160"):
        q_clean = "2160p"

    fps_int = None
    if fps and str(fps).strip().isdigit():
        val = int(str(fps).strip())
        if 10 <= val <= 120:
            fps_int = val

    # Validação de formato, qualidade e motor de renderização contra whitelist
    formatos_validos = ["16:9", "9:16", "1:1"]
    qualidades_validas = ["480p", "720p", "1080p", "1440p", "2160p", "2k", "4k"]
    motores_validos = ["ffmpeg", "opengl"]

    if motor_clean not in motores_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Motor de renderização inválido: '{motor_clean}'. Motores suportados: ffmpeg, opengl."
        )

    if f_clean and f_clean not in formatos_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Formato de renderização inválido: '{f_clean}'. Formatos suportados: 16:9, 9:16, 1:1."
        )
    if q_clean and q_clean not in qualidades_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Qualidade de renderização inválida: '{q_clean}'. Qualidades suportadas: 480p, 720p, 1080p, 1440p, 2160p."
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

    fps_tag = f" {fps_int}fps" if fps_int else ""
    motor_tag = " · GPU Studio OpenGL" if motor_clean == "opengl" else ""
    info_perfil = f" [{f_clean} {q_clean}{fps_tag}{motor_tag}]" if (f_clean and q_clean) else (f" [{motor_tag.strip(' ·')}]" if motor_tag else "")
    set_job_status(job_id, "recebido", f"{len(arquivos)} arquivos recebidos no Colab{info_perfil}", 10)
    background_tasks.add_task(processa_job_background, job_id, tipo, f_clean, q_clean, ignorar_cache_bool, fps_int, motor_clean)

    return {
        "status": "sucesso",
        "job_id": job_id,
        "motor_render": motor_clean,
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

    # Informações de GPU + Diagnóstico GPU Studio (OpenGL + NVENC)
    diag_gpu = diagnostico_gpu_opengl(force_refresh=True)
    gpu_info = diag_gpu["gpu_nome"] if diag_gpu["gpu_ativa"] else "⚠️ CPU (Sem GPU ativa)"
    if diag_gpu["opengl_disponivel"]:
        enc_badge = "NVENC" if diag_gpu["nvenc_disponivel"] else "libx264"
        opengl_badge_html = f'<b style="color:#3fb950; display:block; margin-top:2px;">OpenGL Ativo ({enc_badge})</b>'
    else:
        opengl_badge_html = '<b style="color:#f85149; display:block; margin-top:2px;">Indisponível (Ative GPU T4/L4)</b>'

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
                    Modo Direto • FFmpeg 4.2 + GPU Studio (OpenGL/GLSL) • Sem Google Drive
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
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:18px; font-size:12px;">
            <div style="background:#21262d; padding:10px 14px; border-radius:8px; border:1px solid #30363d;">
                <span style="color:#8b949e;">Acelerador:</span>
                <b style="color:#f0883e; display:block; margin-top:2px;">{gpu_info}</b>
            </div>
            <div style="background:#21262d; padding:10px 14px; border-radius:8px; border:1px solid #30363d;">
                <span style="color:#8b949e;">GPU Studio:</span>
                {opengl_badge_html}
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
