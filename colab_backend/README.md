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

## 📋 Como Atualizar no Google Colab

⚠️ **ATENÇÃO: Sempre que este arquivo backend for alterado, você deve atualizar a célula no seu Colab:**

1. Abra seu notebook no [Google Colab](https://colab.research.google.com).
2. Se a célula antiga estiver rodando, pare a execução (botão de stop ⏹️).
3. Abra o arquivo `colab_backend/motor_de_dobra.py` aqui no editor.
4. Copie todo o código (`Ctrl + A` e `Ctrl + C`).
5. Substitua todo o conteúdo da célula no Colab (`Ctrl + V`).
6. Execute a célula novamente com **`Shift + Enter`**.
