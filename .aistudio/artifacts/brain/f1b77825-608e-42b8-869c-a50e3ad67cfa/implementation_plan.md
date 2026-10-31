# Plano de Implementação: Formato de Vídeo, FPS, Resolução e Adaptação do Player

Este plano descreve as alterações necessárias para adicionar o controle direto de formato de vídeo (16:9, 9:16, 1:1), taxa de quadros (24, 30, 60 fps) e resolução (480p, 720p, 1080p, 2K, 4K) na barra principal do editor, adaptando a proporção da moldura do player de vídeo em tempo real e integrando com o motor Colab.

---

## 1. Escopo e Requisitos Confirmados

1. **Botões de Formato de Tela**:
   - Três botões com ícones visuais posicionados ao lado de **Desfazer** e **Refazer** na barra de ferramentas:
     - `16:9` (Paisagem / Widescreen / YouTube)
     - `9:16` (Retrato / Shorts / Reels / TikTok)
     - `1:1` (Quadrado / Feed Instagram)
   - Destaque visual no botão ativo com tooltip explicativo.

2. **Menus Dropdown de FPS e Resolução**:
   - Menu **FPS**: `24 fps` (Cinema), `30 fps` (Padrão), `60 fps` (Fluido).
   - Menu **Resolução**:
     - `480p SD` (Rascunho Rápido)
     - `720p HD`
     - `1080p Full HD` (Padrão)
     - `1440p 2K` (Alta Definição)
     - `2160p 4K` (Ultra HD)

3. **Adaptação Dinâmica do Player de Vídeo**:
   - O contêiner de monitoramento do `PreviewArea.tsx` se adaptará dinamicamente à proporção selecionada (`16 / 9`, `9 / 16` ou `1 / 1`), recalculando `aspectRatio` e `maxWidth` com `container queries` (`cqh` e `cqw`) para manter centralização e ajuste harmônico em qualquer tela.

4. **Persistência de Projeto**:
   - O formato, FPS e resolução escolhidos serão salvos e restaurados junto com o projeto (`localStorage` e autosave).

5. **Suporte no Motor Colab (`motor_de_dobra_ngrok.py`)**:
   - Expansão de `PERFIS_RESOLUCAO` para incluir `1440p` (2K) e `2160p` (4K) nos 3 formatos com dimensões pares compatíveis com `yuv420p`:
     - 16:9: `2560x1440` e `3840x2160`
     - 9:16: `1440x2560` e `2160x3840`
     - 1:1: `1440x1440` e `2160x2160`
   - Suporte ao recebimento de `fps` no endpoint `/api/enviar_job`, repassando para o pipeline de renderização ffmpeg.

6. **Sincronização nos Modais**:
   - `ExportModal.tsx`: sincronizado com as preferências ativas da tela inicial, exibindo as novas opções 2K e 4K.

---

## 2. Arquivos Envolvidos

1. `src/types/index.ts`: Definição dos tipos `FormatoRender`, `QualidadeRender` e `FpsOpcao`.
2. `src/services/motorApi.ts`: Atualização de tipos e envio de `fps` no `FormData` para o backend.
3. `src/components/Timeline/TimelineControls.tsx`: Inclusão dos 3 botões de formato com ícones SVG/visuais e dos dois dropdowns (FPS e Resolução) ao lado de Desfazer/Refazer.
4. `src/components/Timeline/Timeline.tsx`: Repasse das props de formato, FPS e resolução para `TimelineControls`.
5. `src/components/PreviewArea.tsx`: Adaptação do `aspectRatio` e estilos do monitor conforme o `formato` ativo.
6. `src/components/Modals/ExportModal.tsx`: Inclusão das opções 2K/4K e sincronização com as opções globais.
7. `src/App.tsx`: Gerenciamento do estado global (`formato`, `fps`, `qualidade`), passagem para `Timeline` e `PreviewArea`, salvamento no projeto e repasse para o motor no render.
8. `colab_backend/motor_de_dobra_ngrok.py`: Adição de 2K e 4K em `PERFIS_RESOLUCAO`, tratamento de `fps` dinâmico em `/api/enviar_job` e comandos ffmpeg.

---

## 3. Plano Passo a Passo

### Passo 1 — Tipos e Serviço de API
- Definir em `src/types/index.ts`:
  ```ts
  export type FormatoRender = '16:9' | '9:16' | '1:1';
  export type QualidadeRender = '480p' | '720p' | '1080p' | '1440p' | '2160p';
  export type FpsOpcao = 24 | 30 | 60;
  ```
- Em `src/services/motorApi.ts`, importar esses tipos, aceitar `fps?: FpsOpcao` em `opcoes` de `enviarJob` e adicionar `formData.append('fps', String(opcoes.fps))` caso presente.

### Passo 2 — Backend Colab (`colab_backend/motor_de_dobra_ngrok.py`)
- Adicionar resoluções 2K (`1440p`) e 4K (`2160p`) em `PERFIS_RESOLUCAO` para 16:9, 9:16 e 1:1.
- Em `resolve_perfil`, aceitar aliases `'2k'` e `'4k'`, normalizando para `'1440p'` e `'2160p'`.
- No endpoint `enviar_job`, receber `fps: Optional[int] = Form(None)` e validar contra `(24, 30, 60)`, repassando para o background task.
- Em `renderiza_video`, utilizar o `fps` configurado no job (ou o fallback global `FPS`).

### Passo 3 — Barra de Controles (`TimelineControls.tsx` e `Timeline.tsx`)
- Adicionar ao lado dos botões Desfazer (⟲) e Refazer (⟳):
  - Divisor sutil (`border`).
  - Grupo de botões de formato com ícones ilustrativos:
    - `16:9`: ícone paisagem com proporção horizontal.
    - `9:16`: ícone vertical com proporção de stories/reels.
    - `1:1`: ícone quadrado.
  - Dropdown compacto de FPS: `24 fps`, `30 fps`, `60 fps`.
  - Dropdown compacto de Resolução: `480p SD`, `720p HD`, `1080p Full HD`, `1440p 2K`, `2160p 4K`.

### Passo 4 — Adaptação Dinâmica do Player (`PreviewArea.tsx`)
- Receber `formato: FormatoRender` via props.
- Calcular dinamicamente o `aspectRatio` do contêiner:
  - `16:9` -> `'16 / 9'` e `maxWidth: 'calc(100cqh * 16 / 9)'`
  - `9:16` -> `'9 / 16'` e `maxWidth: 'calc(100cqh * 9 / 16)'`
  - `1:1` -> `'1 / 1'` e `maxWidth: 'calc(100cqh * 1 / 1)'`
- O player e os elementos internos redimensionam suavemente sem overflow nem distorção visual.

### Passo 5 — Integração no `App.tsx` e `ExportModal.tsx`
- Criar estados no `App.tsx`: `formato` (padrão `'16:9'`), `fps` (padrão `24`), `qualidade` (padrão `'1080p'`).
- Incluir `formato`, `fps` e `qualidade` no objeto salvo/carregado do projeto (`montaObjetoProjeto` e `carregaProjetoLocal`).
- Repassar `formato`, `qualidade` e `fps` ao chamar `motorApi.enviarJob` nas opções de exportação do Colab.
- Sincronizar o `ExportModal.tsx` com as opções do editor e incluir 2K e 4K na lista.

### Passo 6 — Verificação e Testes
- Compilar o applet (`compile_applet`).
- Validar sintaxe do script Python no backend (`py_compile`).
- Testar a alternância dos formatos na interface para garantir que a moldura do player se ajusta imediatamente para 16:9, 9:16 e 1:1.
