# 🛰️ motor de dobra 4.1 AI Studio (Google Colab)

Este diretório contém o código oficial do **motor de dobra 4.1 AI Studio**, sincronizado diretamente com o editor web **Crônicas Estelares**.

---

## ⚡ Novidades da Versão 4.1 (Suporte Universal Case-Insensitive)

1. **Reconhecimento Agnóstico de Maiúsculas/Minúsculas**:
   - Identifica qualquer formato independente de casing: `.mp3`, `.MP3`, `.Mp3`, `.mP3`, `.wav`, `.WAV`, `.mp4`, `.MP4`, `.Mp4`, `.jpg`, `.JPG`, `.jpeg`, `.png`, `.PNG`, etc.
   - Trata tanto a extensão quanto o nome base sem risco de perda ou erro de arquivo não encontrado.

2. **Detecção Abrangente de Áudio, Vídeo e Imagem**:
   - **Áudio**: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.wma`, `.aiff`, `.opus`, etc.
   - **Vídeo**: `.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`, `.m4v`, `.3gp`, `.wmv`, `.flv`, `.ts`, etc.
   - **Imagem**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.gif`, `.tiff`, `.svg`, `.avif`, etc.

3. **Auto-Recuperação de Áudio e Roteiro**:
   - Localiza o arquivo de áudio principal e o roteiro na pasta do job mesmo se a extensão ou maiúsculas/minúsculas divergirem ligeiramente do nome especificado no `job.json`.

4. **Loop Automático de Vídeos e Mix com Imagens**:
   - O FFmpeg renderiza clipes de vídeo curtos em loop contínuo (`-stream_loop -1`) para cobrir todo o bloco da cena, sem encurtar a timeline.
   - O áudio de narração e a trilha de música de fundo (BGM) são mantidos em perfeita sincronia com mixagem automática de volume.

5. **Eliminação da Renderização Dupla (herdado da 4.0)**:
   - O tipo padrão é `"timeline"`, gerando o `timeline.json` rapidamente para você editar no app web. O vídeo final é gerado sob demanda no botão "Renderizar no Colab".

---

## 📂 Arquivos Disponíveis

1. **`motor_de_dobra_ngrok.py` (Versão 4.2 — NOVO)**:
   - **Modo Direto via túnel ngrok** (Sem dependência de Google Drive e sem OAuth).
   - Card interativo com botão **"Copiar URL" -> "Copiado!"**.
   - Campo para colar a chave/authtoken do ngrok no cabeçalho do Colab (`# @param {type:"string"}`).
   - Bypass automático de confirmação do navegador via cabeçalho `ngrok-skip-browser-warning`.

2. **`motor_de_dobra.py` (Versão 4.1 — BACKUP)**:
   - Modo clássico baseado em monitoramento de pastas no Google Drive (`drive.mount`).
   - Mantido 100% preservado como backup de segurança.

---

## 📋 Como Testar a Nova Versão no Google Colab

1. Abra seu notebook no [Google Colab](https://colab.research.google.com).
2. Se estiver com a célula antiga rodando, pare a execução (⏹️).
3. Abra o arquivo `colab_backend/motor_de_dobra_ngrok.py`.
4. Copie todo o código (`Ctrl + A` e `Ctrl + C`).
5. Cole na célula do Colab (`Ctrl + V`).
6. Cole o seu token do ngrok no campo `NGROK_AUTHTOKEN` que aparecerá no topo.
7. Execute a célula (**`Shift + Enter`**).
8. O Colab exibirá o card do motor com a URL e o botão interativo para copiar!
