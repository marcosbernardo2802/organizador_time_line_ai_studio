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

MARGEM_EXTRA = 15

# Pastas locais temporárias no SSD rápido do Colab (não usam Google Drive)
PASTA_JOBS = "/content/motor_jobs"
os.makedirs(PASTA_JOBS, exist_ok=True)


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
# 3. NÚCLEO DE IA — WHISPER E MATCHING
# ==============================================================================
_whisper_cache = None

def get_whisper():
    global _whisper_cache
    if _whisper_cache is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🧠 Carregando Whisper ({WHISPER_MODEL}) no dispositivo [{device.upper()}]...")
        _whisper_cache = whisper.load_model(WHISPER_MODEL, device=device)
    return _whisper_cache

def transcreve_audio(audio_path: str, cb_status=None):
    if cb_status: cb_status("whisper", "Transcrevendo áudio com Whisper na GPU...", 15)
    model = get_whisper()
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
    return palavras, duracao

def normaliza_texto(texto: str):
    texto = texto.lower()
    texto = unicodedata.normalize('NFKD', texto)
    texto = texto.encode('ascii', 'ignore').decode('ascii')
    texto = re.sub(r'[^a-z0-9\s]', '', texto)
    return texto.split()

def le_roteiro_conteudo(conteudo: str, total_midias: int = 0):
    partes = re.split(r'\[(?:cena|bloco)\s*(\d+)\]', conteudo, flags=re.IGNORECASE)
    blocos = []
    for i in range(1, len(partes), 2):
        txt = partes[i+1].strip() if i+1 < len(partes) else ''
        if txt:
            blocos.append({"num": int(partes[i]), "texto": txt})

    if not blocos and conteudo.strip():
        linhas = [p.strip() for p in conteudo.split('\n') if p.strip()]
        if total_midias > 0:
            chunk = max(1, len(linhas) // total_midias)
            for idx in range(total_midias):
                sub_txt = " ".join(linhas[idx*chunk : (idx+1)*chunk]) if idx < total_midias - 1 else " ".join(linhas[idx*chunk:])
                blocos.append({"num": idx + 1, "texto": sub_txt or f"Cena {idx+1}"})
        else:
            for idx, lin in enumerate(linhas):
                blocos.append({"num": idx + 1, "texto": lin})
    return blocos

def mapeia_timeline(palavras, duracao_audio, blocos, cb_status=None):
    if cb_status: cb_status("matching", "Mapeando sincronia das cenas...", 35)

    whisper_norm = []
    for w in palavras:
        tok = normaliza_texto(w['word'])
        whisper_norm.append(tok[0] if tok else '')

    total_rot = sum(len(normaliza_texto(b['texto'])) for b in blocos)
    escala = len(palavras) / max(total_rot, 1)

    def acha_fim(bloco_norm, ponteiro, janela_max, n_ancora=5):
        ancora = bloco_norm[-n_ancora:] if len(bloco_norm) >= n_ancora else bloco_norm
        n = len(ancora)
        limite = min(ponteiro + janela_max, len(whisper_norm) - n)
        melhor_score, melhor_idx = -1, ponteiro
        for j in range(ponteiro, max(ponteiro, limite + 1)):
            score = SequenceMatcher(None, ancora, whisper_norm[j:j+n]).ratio()
            if score > melhor_score:
                melhor_score, melhor_idx = score, j + n - 1
        return melhor_idx, melhor_score

    instrucoes = []
    ponteiro = 0

    for i, bloco in enumerate(blocos):
        bloco_norm = normaliza_texto(bloco['texto'])
        if not bloco_norm:
            continue
        janela_max = int(len(bloco_norm) * escala) + MARGEM_EXTRA
        idx_fim, score = acha_fim(bloco_norm, ponteiro, janela_max)

        if score < 0.35:
            idx_fim = min(ponteiro + int(len(bloco_norm) * escala), len(palavras) - 1)

        t_start = palavras[ponteiro]['start'] if ponteiro < len(palavras) else duracao_audio
        if i == 0:
            t_start = 0.0

        t_end = palavras[idx_fim]['end'] if idx_fim < len(palavras) else duracao_audio
        if i > 0 and instrucoes:
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
        instrucoes[-1]['end'] = duracao_audio
        instrucoes[-1]['duration'] = round(duracao_audio - instrucoes[-1]['start'], 3)

    return instrucoes


# ==============================================================================
# 4. RENDERIZADOR FFMPEG
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
    """
    Renderiza um trecho visual individual (vídeo ou imagem) com FFmpeg padronizado na resolução final.
    Suporta escala, slow motion suave via setpts, efeitos de câmera e filtros.
    """
    is_vid = eh_video(src)
    vf_parts = []

    # 1. Ajuste de escala e proporção (contain / cover)
    if fit == 'cover':
        vf_parts.append(f"scale={RESOLUCAO[0]}:{RESOLUCAO[1]}:force_original_aspect_ratio=increase,crop={RESOLUCAO[0]}:{RESOLUCAO[1]}")
    else:
        vf_parts.append(f"scale={RESOLUCAO[0]}:{RESOLUCAO[1]}:force_original_aspect_ratio=decrease,pad={RESOLUCAO[0]}:{RESOLUCAO[1]}:(ow-iw)/2:(oh-ih)/2:black")

    # 2. Desaceleração de velocidade (slow-motion) se especificado
    if is_vid and slow_factor > 1.001:
        vf_parts.append(f"setpts={slow_factor:.5f}*PTS")

    # 3. Efeitos de movimento de câmera em imagens
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

    cmd = ['ffmpeg', '-y']
    if is_vid:
        cmd.extend(['-stream_loop', '-1'])
    else:
        cmd.extend(['-loop', '1'])

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
        # Fallback simples em caso de erro nos filtros complexos
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

def renderiza_video(instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, cb_status=None):
    if cb_status: cb_status("render", "Gerando cortes e analisando vídeos/imagens na GPU...", 60)
    tmp_dir = tempfile.mkdtemp(prefix='motor_render_')
    
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
            for u in unidades_visuais:
                b = u['base']
                b_clean = b.lstrip('0') or '0'
                if (arquivo and (arquivo.lower() == (u['video'] or '').lower() or arquivo.lower() == (u['imagem'] or '').lower())) \
                   or b == base_decl or b_clean == base_decl_clean:
                    unidade_escolhida = u
                    break

            # 2. Se não achou, correspondência por ID da cena
            if not unidade_escolhida:
                for u in unidades_visuais:
                    b = u['base']
                    b_clean = b.lstrip('0') or '0'
                    if b == id_str or b_clean == id_clean or id_str in b or (id_clean and id_clean in b):
                        unidade_escolhida = u
                        break

            # 3. Fallback sequencial por índice sobre UNIDADES (nunca pega imagens complementares avulsas!)
            if not unidade_escolhida:
                if i < len(unidades_visuais):
                    unidade_escolhida = unidades_visuais[i]
                elif unidades_visuais:
                    unidade_escolhida = unidades_visuais[i % len(unidades_visuais)]

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
                    print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) CORTADO para encaixar na cena ({dur_real:.2f}s)")
                    renderiza_trecho_visual(
                        src=video_src, dur=dur_real, dst_path=dst,
                        fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                        transicao=transicao, trans_dur=trans_dur, slow_factor=1.0
                    )

                # --------------------------------------------------------------
                # Caso B: A cena é MAIOR que o vídeo ATÉ 40% (dur_vid < dur <= 1.40 * dur_vid)
                # -> O script REDUZ A VELOCIDADE do vídeo (slow-motion) para preencher a cena
                # --------------------------------------------------------------
                elif dur_real <= (dur_vid * 1.40):
                    fator_slow = dur_real / dur_vid
                    print(f"      🎬 Cena {i+1} ({id_cena}): Vídeo ({dur_vid:.2f}s) DESACELERADO ({fator_slow:.2f}x) para preencher a cena ({dur_real:.2f}s)")
                    renderiza_trecho_visual(
                        src=video_src, dur=dur_real, dst_path=dst,
                        fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                        transicao=transicao, trans_dur=trans_dur, slow_factor=fator_slow
                    )

                # --------------------------------------------------------------
                # Caso C: A cena é MAIOR que 40% do tamanho do vídeo (> 1.40 * dur_vid)
                # -> Começa com o VÍDEO em velocidade normal e COMPLETA com a IMAGEM de mesmo nome
                # --------------------------------------------------------------
                else:
                    dur_parte_video = dur_vid
                    dur_parte_imagem = max(0.1, round(dur_real - dur_vid, 3))
                    print(f"      🎬 Cena {i+1} ({id_cena}): Cena ({dur_real:.2f}s) > 140% do vídeo ({dur_vid:.2f}s) -> Vídeo ({dur_parte_video:.2f}s) + Imagem ({dur_parte_imagem:.2f}s)")

                    p1 = os.path.join(tmp_dir, f"cena_{i:04d}_p1.mp4")
                    p2 = os.path.join(tmp_dir, f"cena_{i:04d}_p2.mp4")

                    # 1. Vídeo inicial na sua velocidade natural
                    renderiza_trecho_visual(
                        src=video_src, dur=dur_parte_video, dst_path=p1,
                        fit=fit, efeito='none', filtro=filtro, filtro_int=filtro_int,
                        transicao=transicao, trans_dur=trans_dur, slow_factor=1.0
                    )

                    # 2. Imagem de mesmo nome completando o restante do tempo
                    src_segunda_parte = image_src if image_src else video_src
                    renderiza_trecho_visual(
                        src=src_segunda_parte, dur=dur_parte_imagem, dst_path=p2,
                        fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                        transicao='none', trans_dur=trans_dur, slow_factor=1.0
                    )

                    # 3. Concatenação perfeita dos dois trechos
                    sub_concat = os.path.join(tmp_dir, f"sub_concat_{i:04d}.txt")
                    with open(sub_concat, 'w', encoding='utf-8') as f:
                        f.write(f"file '{p1}'\n")
                        f.write(f"file '{p2}'\n")

                    subprocess.run([
                        'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                        '-i', sub_concat, '-c', 'copy', '-fflags', '+genpts', dst
                    ], capture_output=True)

            elif image_src:
                # Caso sem vídeo: renderiza imagem normalmente com a duração da cena
                print(f"      🖼️ Cena {i+1} ({id_cena}): Imagem ({os.path.basename(image_src)}) com duração {dur_real:.2f}s")
                renderiza_trecho_visual(
                    src=image_src, dur=dur_real, dst_path=dst,
                    fit=fit, efeito=efeito, filtro=filtro, filtro_int=filtro_int,
                    transicao=transicao, trans_dur=trans_dur, slow_factor=1.0
                )

            else:
                # Nenhuma mídia encontrada -> fundo preto com a duração da cena
                print(f"      ⚠️ Nenhuma mídia encontrada para cena {i+1} ({id_cena}) -> gerando fundo preto")
                subprocess.run([
                    'ffmpeg', '-y', '-f', 'lavfi',
                    '-i', f'color=black:size={RESOLUCAO[0]}x{RESOLUCAO[1]}:duration={dur_real}',
                    '-r', str(FPS), '-pix_fmt', 'yuv420p', dst
                ], capture_output=True)

            clips_processados.append({'path': dst, 'duration': dur_real})

        if cb_status: cb_status("render", "Concatenando timeline de vídeo...", 80)
        concat_txt = os.path.join(tmp_dir, 'concat.txt')
        with open(concat_txt, 'w', encoding='utf-8') as f:
            for clip in clips_processados:
                f.write(f"file '{clip['path']}'\n")

        v_temp = os.path.join(tmp_dir, 'video_sem_audio.mp4')
        subprocess.run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', concat_txt, '-c', 'copy', '-fflags', '+genpts', v_temp
        ], capture_output=True)

        if cb_status: cb_status("render", "Mixando áudio e gerando MP4 final...", 90)
        
        # BGM opcional
        bgm_path = None
        for f in os.listdir(pasta_job):
            if nome_base_sem_ext(f) == 'bgm' and eh_audio(f):
                bgm_path = os.path.join(pasta_job, f)
                break

        if bgm_path and os.path.exists(bgm_path):
            subprocess.run([
                'ffmpeg', '-y', '-i', v_temp, '-i', audio_path, '-i', bgm_path,
                '-filter_complex', '[1:a]volume=1.0[a1];[2:a]volume=0.2[a2];[a1][a2]amix=inputs=2:duration=first[aout]',
                '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-map', '0:v:0', '-map', '[aout]', saida_mp4
            ], capture_output=True)
        else:
            subprocess.run([
                'ffmpeg', '-y', '-i', v_temp, '-i', audio_path,
                '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-map', '0:v:0', '-map', '1:a:0', saida_mp4
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

def set_job_status(job_id: str, etapa: str, mensagem: str, progresso: int, erro: str = None):
    JOBS_STATUS[job_id] = {
        "job_id": job_id,
        "etapa": etapa,
        "mensagem": mensagem,
        "progresso": progresso,
        "timestamp": datetime.now().isoformat(),
        "erro": erro
    }

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

def processa_job_background(job_id: str, tipo: str):
    pasta_job = os.path.join(PASTA_JOBS, job_id)
    cb = lambda etapa, msg, prog, err=None: set_job_status(job_id, etapa, msg, prog, err)
    cb("inicio", "Iniciando processamento na GPU...", 5)

    try:
        # Acha áudio
        audio_path = None
        for f in os.listdir(pasta_job):
            if eh_audio(f) and not f.lower().startswith('bgm.'):
                audio_path = os.path.join(pasta_job, f)
                break
        if not audio_path:
            raise FileNotFoundError("Nenhum arquivo de áudio principal (.mp3/.wav/etc) foi enviado no job")

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

            # Transcrição Whisper
            palavras, duracao_audio = transcreve_audio(audio_path, cb)

            # Mapeamento
            instrucoes = mapeia_timeline(palavras, duracao_audio, blocos, cb)

            def acha_midia_job(id_cena, idx):
                id_str = str(id_cena).strip().lower()
                id_clean = id_str.lstrip('0') or '0'

                # 1. Correspondência exata de ID ou nome base na lista de unidades agrupadas
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

                # 3. Fallback sequencial por índice de unidades (nunca pega imagens complementares avulsas!)
                if idx < len(unidades_visuais):
                    u = unidades_visuais[idx]
                    return u['arquivo_principal'], u['tipo']
                elif unidades_visuais:
                    u = unidades_visuais[idx % len(unidades_visuais)]
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

            saida_json = os.path.join(pasta_job, "timeline.json")
            with open(saida_json, 'w', encoding='utf-8') as f:
                json.dump(timeline_data, f, ensure_ascii=False, indent=2)

        # Renderização em MP4 se solicitada
        if tipo in ['timeline_e_render', 'render']:
            saida_mp4 = os.path.join(pasta_job, "video_final.mp4")
            renderiza_video(instrucoes, pasta_job, audio_path, duracao_audio, saida_mp4, cb)

        cb("concluido", "Job finalizado com sucesso!", 100)
    except Exception as e:
        print(f"❌ Erro no job {job_id}: {e}")
        cb("erro", f"Erro: {str(e)}", 0, str(e))

@app.post("/api/enviar_job")
async def enviar_job(
    background_tasks: BackgroundTasks,
    tipo: str = Form("timeline"),
    arquivos: List[UploadFile] = File(...)
):
    """
    Recebe os arquivos enviados diretamente pelo frontend do PC (via formulário multipart)
    sem precisar salvar nem sincronizar nada no Google Drive!
    """
    job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    pasta_job = os.path.join(PASTA_JOBS, job_id)
    os.makedirs(pasta_job, exist_ok=True)

    # Salva arquivos recebidos no SSD local do Colab
    for arq in arquivos:
        nome_seguro = os.path.basename(arq.filename)
        destino = os.path.join(pasta_job, nome_seguro)
        with open(destino, "wb") as buffer:
            shutil.copyfileobj(arq.file, buffer)

    set_job_status(job_id, "recebido", f"{len(arquivos)} arquivos recebidos no Colab", 10)
    background_tasks.add_task(processa_job_background, job_id, tipo)

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

    ngrok.set_auth_token(token)

    # Mata processos antigos e fecha túneis
    try:
        ngrok.kill()
    except Exception:
        pass

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
        ngrok.disconnect(public_url)

# Executa
inicia_servidor()
