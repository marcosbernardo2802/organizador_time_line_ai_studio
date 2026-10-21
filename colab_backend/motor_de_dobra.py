# @title motor de dobra 4.1 AI Studio
# ==============================================================================
# --- MOTOR DE DOBRA 4.1 AI STUDIO: MODO PONTE ---
# Sessão 1 da integração com o App Web (Crônicas Estelares)
#
# Atualizações aplicadas (4.1):
#   - SUPORTE UNIVERSAL E CASE-INSENSITIVE A MÍDIAS:
#     Reconhece áudio, vídeo e imagem independente de maiúsculas/minúsculas
#     (ex: .mp3, .MP3, .Mp3, .mP3, .wav, .WAV, .mp4, .MP4, .png, .PNG, .JPG).
#   - CONCATENAÇÃO SEGURA: Suporte nativo a mix de fotos e vídeos na mesma timeline.
#   - MATCHING ROBUSTO: Correspondência exata e por prefixo para arquivos de cenas.
#   - AUTO-RECUPERAÇÃO DE ÁUDIO E ROTEIRO: Localiza áudio e roteiro mesmo se o nome
#     tiver capitalização diferente da declarada no job.json.
# ==============================================================================

import sys, subprocess
subprocess.run([sys.executable, "-m", "pip", "install", "openai-whisper", "moviepy", "tqdm", "-q"], check=False)

import os, re, unicodedata, whisper, threading, time, json, shutil, subprocess, tempfile
from datetime import datetime
from difflib import SequenceMatcher
from google.colab import drive
from moviepy.editor import (VideoFileClip, ImageClip, AudioFileClip,
                            CompositeVideoClip, ColorClip,
                            concatenate_videoclips, vfx)
from tqdm.notebook import tqdm
from IPython.display import Javascript, display

drive.mount('/content/drive', force_remount=True)


# ==============================================================================
# EXTENSÕES SUPORTADAS (100% CASE-INSENSITIVE)
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
EXTENSOES_TODAS   = EXTENSOES_AUDIO | EXTENSOES_VIDEO | EXTENSOES_IMAGEM

def get_ext(filename):
    """
    Retorna a extensão com ponto em minúsculas (ex: '.mp3', '.mp4', '.jpg').
    Agnóstico a maiúsculas/minúsculas (.mp3, .MP3, .Mp3, .mP3 -> '.mp3').
    """
    if not filename:
        return ''
    limpo = str(filename).split('?')[0].split('#')[0].strip()
    _, ext = os.path.splitext(limpo)
    return ext.lower().strip()

def nome_base_sem_ext(filename):
    """
    Retorna o nome base sem extensão em minúsculas (ex: '0001.MP3' -> '0001').
    """
    if not filename:
        return ''
    limpo = str(filename).split('?')[0].split('#')[0].strip()
    base, _ = os.path.splitext(limpo)
    return base.lower().strip()

def eh_audio(filename):
    """Verifica se o arquivo é de áudio (ignora maiúsculas/minúsculas)."""
    return get_ext(filename) in EXTENSOES_AUDIO

def eh_video(filename):
    """Verifica se o arquivo é de vídeo (ignora maiúsculas/minúsculas)."""
    return get_ext(filename) in EXTENSOES_VIDEO

def eh_imagem(filename):
    """Verifica se o arquivo é de imagem (ignora maiúsculas/minúsculas)."""
    return get_ext(filename) in EXTENSOES_IMAGEM

def eh_visual(filename):
    """Verifica se o arquivo é visual (vídeo OU imagem)."""
    return get_ext(filename) in EXTENSOES_VISUAIS

def obtem_unidades_visuais(pasta):
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
        # Ignora arquivos ocultos ou arquivos de áudio/música
        if f.startswith('.') or nome_base_sem_ext(f).lower() in ['audio', 'bgm', 'narration']:
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
# KEEP-ALIVE
# ==============================================================================
_keep_alive_ativo = True

def _keep_alive_loop():
    while _keep_alive_ativo:
        time.sleep(4 * 60)
        if not _keep_alive_ativo:
            break
        try:
            display(Javascript('''
                var btn = document.querySelector("#top-toolbar > colab-connect-button");
                if (btn) btn.click();
                console.log("[keep-alive] pulso: " + new Date().toLocaleTimeString());
            '''))
        except Exception:
            pass

_thread_keep_alive = threading.Thread(target=_keep_alive_loop, daemon=True)
_thread_keep_alive.start()
print("🟢 Keep-alive ativado")


# ==============================================================================
# CONFIGURAÇÕES GLOBAIS
# ==============================================================================

# ── Modo de operação ──────────────────────────────────────────────────────────
#   "manual"  → comportamento clássico, processa a pasta fixa abaixo
#   "escuta"  → monitora a pasta FILA no Drive e processa jobs do app
MODO = "escuta"

# ── Configurações do modo MANUAL (ignoradas no modo escuta) ───────────────────
PASTA_MANUAL     = '/content/drive/MyDrive/historia1'
AUDIO_MANUAL     = os.path.join(PASTA_MANUAL, 'audio.mp3')
ROTEIRO_MANUAL   = os.path.join(PASTA_MANUAL, 'roteiro.txt')
SAIDA_MANUAL     = os.path.join(PASTA_MANUAL, 'Episodio_Final_V5.mp4')

# ── Configurações do modo ESCUTA ──────────────────────────────────────────────
RAIZ_MOTOR       = '/content/drive/MyDrive/MotorDobra'
PASTA_FILA       = os.path.join(RAIZ_MOTOR, 'fila')
PASTA_PROC       = os.path.join(RAIZ_MOTOR, 'processando')
PASTA_CONCLUIDO  = os.path.join(RAIZ_MOTOR, 'concluido')
PASTA_ERRO       = os.path.join(RAIZ_MOTOR, 'erro')
INTERVALO_ESCUTA = 10  # segundos entre cada verificação da fila

# ── Parâmetros de processamento ───────────────────────────────────────────────
RESOLUCAO        = (1920, 1080)
FPS              = 24
WHISPER_MODEL    = "medium"
MARGEM_EXTRA     = 15
LIMIAR_LOOP      = 0.40
CROSSFADE_LOOP   = 0.2


# ==============================================================================
# UTILITÁRIOS DE STATUS
# ==============================================================================
def grava_status(pasta_job, etapa, mensagem, progresso=0, erro=None):
    status = {
        "etapa":      etapa,
        "mensagem":   mensagem,
        "progresso":  progresso,
        "timestamp":  datetime.now().isoformat(),
        "erro":       erro
    }
    try:
        with open(os.path.join(pasta_job, 'status.json'), 'w', encoding='utf-8') as f:
            json.dump(status, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ==============================================================================
# NÚCLEO — WHISPER
# ==============================================================================
_whisper_model_cache = None

def carrega_whisper():
    global _whisper_model_cache
    if _whisper_model_cache is None:
        print(f"🧠 Carregando Whisper ({WHISPER_MODEL})...")
        _whisper_model_cache = whisper.load_model(WHISPER_MODEL)
    return _whisper_model_cache

def transcreve(audio_path, pasta_job=None):
    if pasta_job:
        grava_status(pasta_job, "whisper", "Transcrevendo áudio...", 10)
    model  = carrega_whisper()
    result = model.transcribe(audio_path, word_timestamps=True, language="pt")
    palavras = []
    for seg in result['segments']:
        for w in seg.get('words', []):
            palavras.append({
                "word":  w['word'].strip(),
                "start": w['start'],
                "end":   w['end'],
            })
    duracao = result['segments'][-1]['end'] if result['segments'] else 0
    print(f"✅ {len(palavras)} palavras | duração: {duracao:.1f}s")
    return palavras, duracao


# ==============================================================================
# NÚCLEO — MATCHING
# ==============================================================================
def normaliza(texto):
    texto = texto.lower()
    texto = unicodedata.normalize('NFKD', texto)
    texto = texto.encode('ascii', 'ignore').decode('ascii')
    texto = re.sub(r'[^a-z0-9\s]', '', texto)
    return texto.split()

def le_roteiro(roteiro_path, pasta_projeto=None):
    with open(roteiro_path, 'r', encoding='utf-8') as f:
        conteudo = f.read()
    partes = re.split(r'\[(?:cena|bloco)\s*(\d+)\]', conteudo, flags=re.IGNORECASE)
    blocos = []
    for i in range(1, len(partes), 2):
        txt = partes[i+1].strip() if i+1 < len(partes) else ''
        if txt:
            blocos.append({"num": int(partes[i]), "texto": txt})

    # Fallback: se não houver tags [cena X], divide por parágrafos ou número de mídias visuais
    if not blocos and conteudo.strip():
        linhas = [p.strip() for p in conteudo.split('\n') if p.strip()]
        n_midias = 0
        if pasta_projeto and os.path.exists(pasta_projeto):
            unidades = obtem_unidades_visuais(pasta_projeto)
            n_midias = len(unidades)

        if n_midias > 0:
            chunk = max(1, len(linhas) // n_midias)
            for idx in range(n_midias):
                sub_txt = " ".join(linhas[idx*chunk : (idx+1)*chunk]) if idx < n_midias - 1 else " ".join(linhas[idx*chunk:])
                blocos.append({"num": idx + 1, "texto": sub_txt or f"Cena {idx+1}"})
        else:
            for idx, lin in enumerate(linhas):
                blocos.append({"num": idx + 1, "texto": lin})

    return blocos

def mapeia_cenas(palavras, duracao_audio, blocos, pasta_job=None):
    if pasta_job:
        grava_status(pasta_job, "matching", "Mapeando cenas...", 30)

    whisper_norm = []
    for w in palavras:
        tok = normaliza(w['word'])
        whisper_norm.append(tok[0] if tok else '')

    total_rot = sum(len(normaliza(b['texto'])) for b in blocos)
    escala    = len(palavras) / max(total_rot, 1)

    def acha_fim(bloco_norm, ponteiro, janela_max, n_ancora=5):
        ancora = bloco_norm[-n_ancora:] if len(bloco_norm) >= n_ancora else bloco_norm
        n      = len(ancora)
        limite = min(ponteiro + janela_max, len(whisper_norm) - n)
        melhor_score, melhor_idx = -1, ponteiro
        for j in range(ponteiro, limite + 1):
            score = SequenceMatcher(None, ancora, whisper_norm[j:j+n]).ratio()
            if score > melhor_score:
                melhor_score, melhor_idx = score, j + n - 1
        return melhor_idx, melhor_score

    instrucoes = []
    ponteiro   = 0

    for i, bloco in enumerate(tqdm(blocos, desc="🗺️ Mapeando")):
        bloco_norm = normaliza(bloco['texto'])
        if not bloco_norm:
            continue
        janela_max     = int(len(bloco_norm) * escala) + MARGEM_EXTRA
        idx_fim, score = acha_fim(bloco_norm, ponteiro, janela_max)

        if score < 0.35:
            idx_fim = min(ponteiro + int(len(bloco_norm) * escala), len(palavras) - 1)

        t_start = palavras[ponteiro]['start'] if ponteiro < len(palavras) else duracao_audio

        # Sincronia perfeita: primeira cena sempre inicia em 0.0
        if i == 0:
            t_start = 0.0

        t_end   = palavras[idx_fim]['end'] if idx_fim < len(palavras) else duracao_audio

        if i > 0:
            t_start = max(t_start, instrucoes[-1]['end'])
        t_end = max(t_end, t_start + 0.3)

        instrucoes.append({
            "id_cena":    f"{bloco['num']:04d}",
            "start":      round(t_start, 3),
            "end":        round(t_end, 3),
            "duration":   round(t_end - t_start, 3),
            "score":      round(score, 2),
            "effect":     "none",
            "transition": "none",
        })
        ponteiro = idx_fim + 1

    if instrucoes:
        instrucoes[-1]['end']      = duracao_audio
        instrucoes[-1]['duration'] = round(duracao_audio - instrucoes[-1]['start'], 3)

    scores = [c['score'] for c in instrucoes]
    print(f"✅ {len(instrucoes)} cenas | score médio: {sum(scores)/len(scores):.2f}")
    return instrucoes


# ==============================================================================
# NÚCLEO — EXPORTAÇÃO JSON
# ==============================================================================
def exporta_timeline_json(instrucoes, pasta_projeto, audio_path,
                           duracao_audio, saida_path):
    unidades_visuais = obtem_unidades_visuais(pasta_projeto)

    def acha_midia(pasta, id_cena, idx):
        id_str = str(id_cena).strip().lower()
        id_clean = id_str.lstrip('0') or '0'
        # 1. Correspondência exata por base ou ID
        for u in unidades_visuais:
            b = u['base']
            b_clean = b.lstrip('0') or '0'
            if b == id_str or b_clean == id_clean:
                return u['arquivo_principal'], u['tipo']
        # 2. Correspondência parcial
        for u in unidades_visuais:
            b = u['base']
            b_clean = b.lstrip('0') or '0'
            if id_str in b or (id_clean and id_clean in b):
                return u['arquivo_principal'], u['tipo']
        # 3. Fallback sequencial por índice de unidades visuais
        if idx < len(unidades_visuais):
            u = unidades_visuais[idx]
            return u['arquivo_principal'], u['tipo']
        elif unidades_visuais:
            u = unidades_visuais[idx % len(unidades_visuais)]
            return u['arquivo_principal'], u['tipo']
        return f"{id_cena}.jpg", 'imagem'

    cenas_json = []
    for i, cena in enumerate(instrucoes):
        if i < len(instrucoes) - 1:
            dur_real = instrucoes[i + 1]['start'] - cena['start']
        else:
            dur_real = duracao_audio - cena['start']
        dur_real = max(dur_real, 0.1)

        nome_arquivo, tipo = acha_midia(pasta_projeto, cena['id_cena'], i)
        is_vid = (tipo == 'video') or eh_video(nome_arquivo)

        cenas_json.append({
            "id_cena":       cena['id_cena'],
            "arquivo":       nome_arquivo,
            "tipo":          "video" if is_vid else "imagem",
            "start":         cena['start'],
            "end":           cena['end'],
            "duration":      cena['duration'],
            "duration_real": round(dur_real, 3),
            "score":         cena['score'],
            "startTime":     cena['start'],
            "trackId":       "video-1",
            "transition":    "none",
            "effect":        "none",
            "offset":        0,
        })

    payload = {
        "versao":       "4.1",
        "gerado_por":   f"Motor de Dobra 4.1 / Whisper {WHISPER_MODEL}",
        "timestamp":    datetime.now().isoformat(),
        "audio":        os.path.basename(audio_path),
        "duracao_total": round(duracao_audio, 3),
        "total_cenas":  len(instrucoes),
        "score_medio":  round(sum(c['score'] for c in instrucoes) / len(instrucoes), 2),
        "cenas":        cenas_json,
    }

    with open(saida_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"📋 timeline.json exportado → {saida_path}")
    return payload


# ==============================================================================
# NÚCLEO — RENDER
# ==============================================================================
def obtem_duracao_midia(path: str) -> float:
    """Obtém a duração exata de um arquivo de vídeo ou áudio em segundos via ffprobe."""
    if not path or not os.path.exists(path):
        return 0.0
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

def renderiza_trecho_visual(src, dur, dst_path, fit='contain', efeito='none', filtro='none', filtro_int=100, transicao='none', trans_dur=0.8, slow_factor=1.0):
    is_vid = eh_video(src)
    vf_parts = []

    if fit == 'cover':
        vf_parts.append(f"scale={RESOLUCAO[0]}:{RESOLUCAO[1]}:force_original_aspect_ratio=increase,crop={RESOLUCAO[0]}:{RESOLUCAO[1]}")
    else:
        vf_parts.append(f"scale={RESOLUCAO[0]}:{RESOLUCAO[1]}:force_original_aspect_ratio=decrease,pad={RESOLUCAO[0]}:{RESOLUCAO[1]}:(ow-iw)/2:(oh-ih)/2:black")

    if is_vid and slow_factor > 1.001:
        vf_parts.append(f"setpts={slow_factor:.5f}*PTS")

    if not is_vid:
        nb_frames = max(1, int(dur * FPS))
        if efeito in ('kenburns', 'zoom_in'):
            vf_parts.append(f"zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={RESOLUCAO[0]}x{RESOLUCAO[1]}:fps={FPS}")
        elif efeito == 'zoom_out':
            vf_parts.append(f"zoompan=z='if(eq(on\\,1)\\,1.1\\,max(zoom-0.0008\\,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={RESOLUCAO[0]}x{RESOLUCAO[1]}:fps={FPS}")
        elif efeito == 'pan_right':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,0\\,x+0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={RESOLUCAO[0]}x{RESOLUCAO[1]}:fps={FPS}")
        elif efeito == 'pan_left':
            vf_parts.append(f"zoompan=z=1.1:x='if(eq(on\\,1)\\,iw*0.1-iw/zoom/2\\,x-0.5)':y='ih/2-(ih/zoom/2)':d={nb_frames}:s={RESOLUCAO[0]}x{RESOLUCAO[1]}:fps={FPS}")

    intensidade = filtro_int / 100.0
    if filtro == 'grayscale': vf_parts.append("hue=s=0")
    elif filtro == 'sepia': vf_parts.append("colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131")
    elif filtro == 'blur': vf_parts.append(f"gblur=sigma={max(1, int(filtro_int / 10))}")
    elif filtro == 'contrast': vf_parts.append(f"eq=contrast={1.0 + intensidade:.2f}")
    elif filtro == 'saturate': vf_parts.append(f"hue=s={1.0 + intensidade * 2:.2f}")

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

    cmd = ['ffmpeg', '-y']
    if is_vid: cmd.extend(['-stream_loop', '-1'])
    else: cmd.extend(['-loop', '1'])

    cmd.extend([
        '-i', src, '-t', str(dur),
        '-vf', vf_chain,
        '-c:v', 'libx264', '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-video_track_timescale', '90000',
        '-an', dst_path
    ])
    res = subprocess.run(cmd, capture_output=True)

    if res.returncode != 0:
        cmd_fallback = ['ffmpeg', '-y']
        if is_vid: cmd_fallback.extend(['-stream_loop', '-1'])
        else: cmd_fallback.extend(['-loop', '1'])
        vf_simple = f"scale={RESOLUCAO[0]}:{RESOLUCAO[1]}:force_original_aspect_ratio=decrease,pad={RESOLUCAO[0]}:{RESOLUCAO[1]}:(ow-iw)/2:(oh-ih)/2:black,fps={FPS}"
        cmd_fallback.extend([
            '-i', src, '-t', str(dur),
            '-vf', vf_simple,
            '-c:v', 'libx264', '-preset', 'fast',
            '-pix_fmt', 'yuv420p', '-video_track_timescale', '90000', '-an', dst_path
        ])
        subprocess.run(cmd_fallback, capture_output=True)

def renderiza(instrucoes, pasta_projeto, audio_path,
              duracao_audio, saida_path, pasta_job=None):
    if pasta_job:
        grava_status(pasta_job, "render", "Preparando renderização FFmpeg...", 60)

    tmp_dir = tempfile.mkdtemp(prefix='motor_render_')
    print(f"📁 Temp dir: {tmp_dir}")

    try:
        clips_processados = []
        unidades_visuais = obtem_unidades_visuais(pasta_projeto) if pasta_projeto else []

        for i, cena in enumerate(tqdm(instrucoes, desc="🎬 Processando cenas")):
            if i < len(instrucoes) - 1:
                dur_real = instrucoes[i + 1]['start'] - cena['start']
            else:
                dur_real = duracao_audio - cena['start']
            dur_real = max(dur_real, 0.1)

            id_cena    = cena.get('id_cena', f"{i+1:04d}")
            arquivo    = cena.get('arquivo', None)
            efeito     = cena.get('effect', 'none')
            transicao  = cena.get('transition', 'none')
            trans_dur  = float(cena.get('transition_duration', 0.8))
            filtro     = cena.get('filter', 'none')
            filtro_int = int(cena.get('filter_intensity', 100))
            fit        = cena.get('fit', 'contain')

            id_str = str(id_cena).strip().lower()
            id_clean = id_str.lstrip('0') or '0'
            base_decl = nome_base_sem_ext(arquivo).lower() if arquivo else id_str
            base_decl_clean = base_decl.lstrip('0') or '0'

            unidade = None
            for u in unidades_visuais:
                b = u['base']
                b_clean = b.lstrip('0') or '0'
                if (arquivo and (arquivo.lower() == (u['video'] or '').lower() or arquivo.lower() == (u['imagem'] or '').lower())) \
                   or b == base_decl or b_clean == base_decl_clean:
                    unidade = u
                    break

            if not unidade:
                for u in unidades_visuais:
                    b = u['base']
                    b_clean = b.lstrip('0') or '0'
                    if b == id_str or b_clean == id_clean or id_str in b or (id_clean and id_clean in b):
                        unidade = u
                        break

            if not unidade:
                if i < len(unidades_visuais):
                    unidade = unidades_visuais[i]
                elif unidades_visuais:
                    unidade = unidades_visuais[i % len(unidades_visuais)]

            video_src = unidade['video_path'] if unidade else None
            image_src = unidade['image_path'] if unidade else None

            # Fallback direto se o arquivo foi informado e existe no disco
            if not video_src and not image_src and arquivo and pasta_projeto:
                caminho_dir = os.path.join(pasta_projeto, arquivo)
                if os.path.exists(caminho_dir):
                    if eh_video(arquivo): video_src = caminho_dir
                    elif eh_imagem(arquivo): image_src = caminho_dir

            dst = os.path.join(tmp_dir, f"cena_{i:04d}.mp4")

            # Regras Vídeo vs Imagem
            dur_vid = obtem_duracao_midia(video_src) if video_src else 0.0

            if video_src and dur_vid > 0.05:
                # Caso A: corte se cena <= vídeo
                if dur_real <= dur_vid:
                    renderiza_trecho_visual(video_src, dur_real, dst, fit, efeito, filtro, filtro_int, transicao, trans_dur, slow_factor=1.0)
                # Caso B: slow motion se até 40% maior
                elif dur_real <= (dur_vid * 1.40):
                    fator_slow = dur_real / dur_vid
                    renderiza_trecho_visual(video_src, dur_real, dst, fit, efeito, filtro, filtro_int, transicao, trans_dur, slow_factor=fator_slow)
                # Caso C: vídeo normal + completa com imagem
                else:
                    dur_p_vid = dur_vid
                    dur_p_img = max(0.1, round(dur_real - dur_vid, 3))
                    p1 = os.path.join(tmp_dir, f"c_{i:04d}_p1.mp4")
                    p2 = os.path.join(tmp_dir, f"c_{i:04d}_p2.mp4")
                    renderiza_trecho_visual(video_src, dur_p_vid, p1, fit, 'none', filtro, filtro_int, transicao, trans_dur, slow_factor=1.0)
                    src_img = image_src if image_src else video_src
                    renderiza_trecho_visual(src_img, dur_p_img, p2, fit, efeito, filtro, filtro_int, 'none', trans_dur, slow_factor=1.0)
                    sub_txt = os.path.join(tmp_dir, f"sub_{i:04d}.txt")
                    with open(sub_txt, 'w', encoding='utf-8') as f:
                        f.write(f"file '{p1}'\nfile '{p2}'\n")
                    subprocess.run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', sub_txt, '-c', 'copy', '-fflags', '+genpts', dst], capture_output=True)
            elif image_src:
                renderiza_trecho_visual(image_src, dur_real, dst, fit, efeito, filtro, filtro_int, transicao, trans_dur, slow_factor=1.0)
            else:
                subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', f'color=black:size={RESOLUCAO[0]}x{RESOLUCAO[1]}:duration={dur_real}', '-r', str(FPS), dst], capture_output=True)

            clips_processados.append({'path': dst, 'duration': dur_real})

        if pasta_job:
            grava_status(pasta_job, "render", "Concatenando cenas...", 80)

        concat_list = os.path.join(tmp_dir, 'concat.txt')
        with open(concat_list, 'w') as f:
            for clip in clips_processados:
                f.write(f"file '{clip['path']}'\n")

        video_sem_audio = os.path.join(tmp_dir, 'video_sem_audio.mp4')
        subprocess.run([
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_list,
            '-c', 'copy',
            '-fflags', '+genpts',
            video_sem_audio
        ], capture_output=True)

        if pasta_job:
            grava_status(pasta_job, "render", "Adicionando áudio e música...", 90)

        # Procura música de fundo (BGM) opcional (.mp3, .wav, .m4a, etc.)
        bgm_path = None
        for f in os.listdir(pasta_projeto):
            if nome_base_sem_ext(f) == 'bgm' and eh_audio(f):
                bgm_path = os.path.join(pasta_projeto, f)
                break

        saida_tmp = os.path.join(tmp_dir, 'output_final.mp4')
        if bgm_path and os.path.exists(bgm_path):
            cmd_audio = [
                'ffmpeg', '-y',
                '-i', video_sem_audio,
                '-i', audio_path,
                '-i', bgm_path,
                '-filter_complex', '[1:a]volume=1.0[a1];[2:a]volume=0.2[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=0[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                '-map', '0:v:0',
                '-map', '[aout]',
                saida_tmp
            ]
        else:
            cmd_audio = [
                'ffmpeg', '-y',
                '-i', video_sem_audio,
                '-i', audio_path,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-shortest',
                '-map', '0:v:0',
                '-map', '1:a:0',
                saida_tmp
            ]

        subprocess.run(cmd_audio, capture_output=True)
        shutil.copy2(saida_tmp, saida_path)
        print(f"✅ MP4 salvo → {saida_path}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def processa_job(pasta_job):
    nome_job = os.path.basename(pasta_job)
    print(f"\n{'='*60}")
    print(f"📦 Processando job: {nome_job}")
    print(f"{'='*60}")

    job_file = os.path.join(pasta_job, 'job.json')
    if not os.path.exists(job_file):
        raise FileNotFoundError("job.json não encontrado")

    with open(job_file, 'r', encoding='utf-8') as f:
        job = json.load(f)

    tipo             = job.get('tipo', 'timeline')
    audio_rel        = job.get('audio')
    rot_rel          = job.get('roteiro')
    timeline_pronta  = job.get('timeline_pronta')

    mp4_saida  = os.path.join(pasta_job, 'video_final.mp4')
    json_saida = os.path.join(pasta_job, 'timeline.json')

    grava_status(pasta_job, "inicio", "Job recebido. Iniciando...", 5)

    if tipo == 'render' and timeline_pronta:
        print("🎬 Modo render direto — usando timeline do app")
        tl_path = os.path.join(pasta_job, timeline_pronta)

        if not os.path.exists(tl_path):
            for f in os.listdir(pasta_job):
                if f.lower() == str(timeline_pronta).lower():
                    tl_path = os.path.join(pasta_job, f)
                    break

        if not os.path.exists(tl_path):
            raise FileNotFoundError(f"{timeline_pronta} não encontrado")

        with open(tl_path, 'r', encoding='utf-8') as f:
            tl = json.load(f)

        duracao_audio = tl.get('duracao_total', 60)
        audio_rel     = tl.get('audio') or audio_rel

        instrucoes = []
        cenas = tl.get('cenas', [])
        for i, cena in enumerate(cenas):
            if i < len(cenas) - 1:
                dur_real = cenas[i+1]['start'] - cena['start']
            else:
                dur_real = duracao_audio - cena['start']
            dur_real = max(dur_real, 0.1)

            instrucoes.append({
                "id_cena":     cena.get('id_cena', f"{i+1:04d}"),
                "arquivo":     cena.get('arquivo', f"{i+1:04d}.jpg"),
                "start":       cena['start'],
                "end":         cena['end'],
                "duration":    dur_real,
                "duration_real": dur_real,
                "score":       1.0,
                "effect":      cena.get('effect', 'none'),
                "transition":  cena.get('transition', 'none'),
                "transition_duration": cena.get('transition_duration', 0.8),
                "filter":      cena.get('filter', 'none'),
                "filter_intensity": cena.get('filter_intensity', 100),
                "fit":         cena.get('fit', 'contain'),
            })

        grava_status(pasta_job, "render", "Renderizando a partir da timeline do app...", 50)

        # Localiza áudio insensível a maiúsculas/minúsculas
        audio_path = None
        if audio_rel:
            audio_path = os.path.join(pasta_job, audio_rel)
            if not os.path.exists(audio_path):
                for f in os.listdir(pasta_job):
                    if f.lower() == str(audio_rel).lower() or (eh_audio(f) and nome_base_sem_ext(f) == nome_base_sem_ext(audio_rel)):
                        audio_path = os.path.join(pasta_job, f)
                        break

        if not audio_path or not os.path.exists(audio_path):
            for f in os.listdir(pasta_job):
                if eh_audio(f) and not f.lower().startswith('bgm.'):
                    audio_path = os.path.join(pasta_job, f)
                    break

        if not audio_path or not os.path.exists(audio_path):
            raise FileNotFoundError("Arquivo de áudio não encontrado na pasta do job")

        audio_clip_check = AudioFileClip(audio_path)
        duracao_real = audio_clip_check.duration
        audio_clip_check.close()
        if duracao_real < duracao_audio:
            duracao_audio = duracao_real
            for cena in instrucoes:
                if cena['start'] >= duracao_real:
                    cena['duration'] = 0
                elif cena['start'] + cena['duration'] > duracao_real:
                    cena['duration'] = duracao_real - cena['start']

        mp4_local = f'/content/video_temp_{nome_job}.mp4'
        renderiza(instrucoes, pasta_job, audio_path, duracao_audio, mp4_local, pasta_job)

        grava_status(pasta_job, "copiando", "Copiando MP4 para o Drive...", 90)
        shutil.copy2(mp4_local, mp4_saida)
        os.remove(mp4_local)

        grava_status(pasta_job, "concluido", "Render concluído!", 100)
        return

    # ── MODO TIMELINE (CRIAÇÃO DE CENA E TIMELINE.JSON) ─────────────────────────
    # Localiza arquivo de áudio de forma insensível a maiúsculas/minúsculas
    audio_path = None
    if audio_rel:
        audio_path = os.path.join(pasta_job, audio_rel)
        if not os.path.exists(audio_path):
            for f in os.listdir(pasta_job):
                if f.lower() == str(audio_rel).lower() or (eh_audio(f) and nome_base_sem_ext(f) == nome_base_sem_ext(audio_rel)):
                    audio_path = os.path.join(pasta_job, f)
                    break
    if not audio_path or not os.path.exists(audio_path):
        for f in os.listdir(pasta_job):
            if eh_audio(f) and not f.lower().startswith('bgm.'):
                audio_path = os.path.join(pasta_job, f)
                break
    if not audio_path or not os.path.exists(audio_path):
        raise FileNotFoundError(f"Arquivo de áudio ({audio_rel}) não encontrado no job")

    # Localiza arquivo de roteiro de forma insensível a maiúsculas/minúsculas
    roteiro_path = None
    if rot_rel:
        roteiro_path = os.path.join(pasta_job, rot_rel)
        if not os.path.exists(roteiro_path):
            for f in os.listdir(pasta_job):
                if f.lower() == str(rot_rel).lower() or nome_base_sem_ext(f) == nome_base_sem_ext(rot_rel):
                    roteiro_path = os.path.join(pasta_job, f)
                    break
    if not roteiro_path or not os.path.exists(roteiro_path):
        for f in os.listdir(pasta_job):
            if get_ext(f) in ['.txt', '.md', '.text'] or 'roteiro' in f.lower():
                roteiro_path = os.path.join(pasta_job, f)
                break
    if not roteiro_path or not os.path.exists(roteiro_path):
        raise FileNotFoundError(f"Arquivo de roteiro ({rot_rel}) não encontrado no job")

    palavras, duracao_audio = transcreve(audio_path, pasta_job)
    blocos = le_roteiro(roteiro_path, pasta_job)
    instrucoes = mapeia_cenas(palavras, duracao_audio, blocos, pasta_job)

    grava_status(pasta_job, "json", "Exportando timeline.json...", 50)
    exporta_timeline_json(instrucoes, pasta_job, audio_path, duracao_audio, json_saida)

    if tipo == 'timeline_e_render':
        renderiza(instrucoes, pasta_job, audio_path, duracao_audio, mp4_saida, pasta_job)

    grava_status(pasta_job, "concluido", "Job finalizado com sucesso!", 100)
    print(f"✅ Job {nome_job} concluído!")


def roda_manual():
    print("\n🔧 MODO MANUAL")
    pasta = PASTA_MANUAL
    audio_path = AUDIO_MANUAL
    if not os.path.exists(audio_path):
        for f in os.listdir(pasta):
            if eh_audio(f):
                audio_path = os.path.join(pasta, f)
                break

    roteiro_path = ROTEIRO_MANUAL
    if not os.path.exists(roteiro_path):
        for f in os.listdir(pasta):
            if get_ext(f) in ['.txt', '.md'] or 'roteiro' in f.lower():
                roteiro_path = os.path.join(pasta, f)
                break

    palavras, duracao = transcreve(audio_path)
    blocos            = le_roteiro(roteiro_path, pasta)
    instrucoes        = mapeia_cenas(palavras, duracao, blocos)
    json_path = os.path.join(pasta, 'timeline.json')
    exporta_timeline_json(instrucoes, pasta, audio_path, duracao, json_path)
    renderiza(instrucoes, pasta, audio_path, duracao, SAIDA_MANUAL)


def garante_pastas():
    for p in [PASTA_FILA, PASTA_PROC, PASTA_CONCLUIDO, PASTA_ERRO]:
        os.makedirs(p, exist_ok=True)

def checa_fila():
    if not os.path.exists(PASTA_FILA): return None
    for nome in sorted(os.listdir(PASTA_FILA)):
        pasta = os.path.join(PASTA_FILA, nome)
        if os.path.isdir(pasta) and os.path.exists(os.path.join(pasta, 'job.json')):
            return pasta
    return None

def roda_escuta():
    garante_pastas()
    print(f"\n👂 MODO ESCUTA ativado")
    while True:
        pasta_job = checa_fila()
        if pasta_job:
            nome_job  = os.path.basename(pasta_job)
            pasta_proc = os.path.join(PASTA_PROC, nome_job)
            shutil.move(pasta_job, pasta_proc)
            try:
                processa_job(pasta_proc)
                shutil.move(pasta_proc, os.path.join(PASTA_CONCLUIDO, nome_job))
            except Exception as e:
                print(f"❌ Erro no job {nome_job}: {e}")
                try:
                    grava_status(pasta_proc, "erro", str(e), 0, erro=str(e))
                    shutil.move(pasta_proc, os.path.join(PASTA_ERRO, nome_job))
                except Exception: pass
        else:
            print(f"⏳ Fila vazia — aguardando... ({datetime.now().strftime('%H:%M:%S')})", end='\r')
            time.sleep(INTERVALO_ESCUTA)

try:
    if MODO == "escuta": roda_escuta()
    else: roda_manual()
finally:
    _keep_alive_ativo = False
    print("\n🔴 Encerrando keep-alive e liberando GPU...")
    try:
        from google.colab import runtime
        runtime.unassign()
    except Exception:
        display(Javascript('''
            var btn = document.querySelector("colab-toolbar-button#runtime-disconnect");
            if (btn) btn.click();
            else google.colab.kernel.invokeFunction("notebook.Disconnect", [], {});
        '''))
    print("✅ GPU liberada!")
