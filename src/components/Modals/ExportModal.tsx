import React, { useState } from 'react';
import { RenderState, FormatoRender, QualidadeRender, FpsOpcao, MotorRender } from '../../types';
import { MotorStatusInfo } from '../../services/motorApi';
import { EtapasProgresso } from '../EtapasProgresso';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  renderState: RenderState;
  onExportJson: () => void;
  onRenderColab: (opcoes: {
    formato: FormatoRender;
    qualidade: QualidadeRender;
    fps?: FpsOpcao;
    motorRender: MotorRender;
  }) => void;
  onRenderBrowser: () => void;
  motorOnline?: boolean;
  motorInfo?: MotorStatusInfo | null;
  onOpenMotorModal?: () => void;
  initialFormato?: FormatoRender;
  initialQualidade?: QualidadeRender;
  initialFps?: FpsOpcao;
  theme?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  renderState,
  onExportJson,
  onRenderColab,
  onRenderBrowser,
  motorOnline = false,
  motorInfo = null,
  onOpenMotorModal,
  initialFormato = '16:9',
  initialQualidade = '1080p',
  initialFps = 24,
  theme = 'dark',
}) => {
  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  // Estado local para formato, qualidade, FPS e motor de renderização no Colab
  // Padrão sempre 'ffmpeg' (fluxo estável 4.2) — GPU Studio (OpenGL) é estritamente opt-in
  const [formato, setFormato] = useState<FormatoRender>(initialFormato);
  const [qualidade, setQualidade] = useState<QualidadeRender>(initialQualidade);
  const [fps, setFps] = useState<FpsOpcao>(initialFps);
  const [motorRender, setMotorRender] = useState<MotorRender>('ffmpeg');

  React.useEffect(() => {
    if (isOpen) {
      if (initialFormato) setFormato(initialFormato);
      if (initialQualidade) setQualidade(initialQualidade);
      if (initialFps) setFps(initialFps);
    }
  }, [isOpen, initialFormato, initialQualidade, initialFps]);

  if (!isOpen) return null;

  const isOpengl = motorRender === 'opengl';
  const openglStatusKnown = motorOnline && typeof motorInfo?.opengl_disponivel === 'boolean';
  const openglReady = motorOnline && motorInfo?.opengl_disponivel === true;
  const openglUnavailable = motorOnline && motorInfo?.opengl_disponivel === false;
  const legacyBackend = motorOnline && !openglStatusKnown;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">⬇ Exportar Vídeo / Projeto</span>
          <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Card de Progresso em Tempo Real se estiver renderizando */}
          {renderState.isRendering ? (
            <div
              style={{
                background: isLight ? '#f0f9ff' : 'rgba(0, 240, 255, 0.08)',
                border: `1px solid ${isLight ? '#38bdf8' : '#00f0ff'}`,
                borderRadius: 10,
                padding: 16,
                boxShadow: isLight ? '0 2px 10px rgba(56, 189, 248, 0.2)' : '0 0 20px rgba(0, 240, 255, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{isOpengl ? '✨' : '⚡'}</span>
                  <strong style={{ color: isLight ? '#0284c7' : '#00f0ff', fontSize: 13 }}>
                    {isOpengl ? 'Renderizando no GPU Studio (OpenGL)' : 'Processando na GPU do Colab'}
                  </strong>
                </div>
                <span
                  style={{
                    background: isLight ? '#0284c7' : '#00f0ff',
                    color: isLight ? '#ffffff' : '#0f172a',
                    fontWeight: 700,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {renderState.progress}%
                </span>
              </div>

              {/* Barra de progresso */}
              <div
                style={{
                  height: 10,
                  background: isLight ? '#e2e8f0' : '#0f172a',
                  borderRadius: 5,
                  overflow: 'hidden',
                  border: `1px solid ${isLight ? '#cbd5e1' : '#1e293b'}`,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${Math.max(5, renderState.progress)}%`,
                    height: '100%',
                    background: isLight
                      ? 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)'
                      : 'linear-gradient(90deg, #00f0ff 0%, #38bdf8 100%)',
                    transition: 'width 0.4s ease',
                    boxShadow: isLight ? 'none' : '0 0 10px #00f0ff',
                  }}
                />
              </div>

              <div style={{ fontSize: 12, color: isLight ? '#1e293b' : '#e2e8f0', lineHeight: 1.4, marginBottom: 8, fontWeight: isLight ? 500 : 400 }}>
                {renderState.status || 'Enviando arquivos e iniciando GPU...'}
              </div>

              <EtapasProgresso
                etapas={renderState.etapas}
                etapaIndice={renderState.etapaIndice}
                etapaTotal={renderState.etapaTotal}
                detalhe={renderState.detalhe}
                etaSegundos={renderState.etaSegundos}
              />

              <div style={{ fontSize: 11, color: isLight ? '#64748b' : '#94a3b8' }}>
                💡 Você pode fechar este modal; o progresso continuará visível no canto inferior direito da tela e o arquivo <code>video_final.mp4</code> será baixado automaticamente ao concluir.
              </div>
            </div>
          ) : (
            <>
              {/* Status do Motor de Dobra Colab */}
              <div
                style={{
                  background: motorOnline
                    ? (isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.1)')
                    : (isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)'),
                  border: `1px solid ${motorOnline ? (isLight ? '#86efac' : '#22c55e') : (isLight ? '#fca5a5' : '#ef4444')}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: motorOnline ? (isLight ? '#166534' : '#22c55e') : (isLight ? '#991b1b' : '#ef4444'),
                  fontWeight: isLight ? 600 : 500,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: motorOnline ? (isLight ? '#16a34a' : '#22c55e') : (isLight ? '#dc2626' : '#ef4444'),
                    }}
                  />
                  <span>
                    {motorOnline
                      ? `Motor Colab: Conectado${motorInfo?.gpu ? ` (${motorInfo.gpu})` : ''}`
                      : 'Motor Colab (GPU): Desconectado'}
                  </span>
                </div>
                {!motorOnline && onOpenMotorModal && (
                  <button
                    onClick={onOpenMotorModal}
                    style={{
                      background: isLight ? '#ffffff' : '#1e293b',
                      border: `1px solid ${isLight ? '#dc2626' : '#38bdf8'}`,
                      color: isLight ? '#dc2626' : '#38bdf8',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      cursor: 'pointer',
                      boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.05)' : undefined,
                    }}
                  >
                    Conectar ngrok
                  </button>
                )}
              </div>

              {/* Opções de render (Colab) */}
              <div
                style={{
                  background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.65)',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid #1e293b',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: isLight ? '#0284c7' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚙️ Opções de render (Colab)
                </div>

                {/* Seletor de Motor de Renderização */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: isLight ? 600 : 500, color: isLight ? '#334155' : '#94a3b8', marginBottom: 5 }}>
                    Motor de Renderização
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Motor de Renderização"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={motorRender === 'ffmpeg'}
                      disabled={renderState.isRendering}
                      onClick={() => setMotorRender('ffmpeg')}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: renderState.isRendering ? 'not-allowed' : 'pointer',
                        border: motorRender === 'ffmpeg'
                          ? `1.5px solid ${isLight ? '#0284c7' : '#38bdf8'}`
                          : `1px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                        background: motorRender === 'ffmpeg'
                          ? (isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.14)')
                          : (isLight ? '#ffffff' : '#0b1120'),
                        color: isLight ? '#0f172a' : '#f8fafc',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: motorRender === 'ffmpeg' ? (isLight ? '#0369a1' : '#38bdf8') : (isLight ? '#0f172a' : '#e2e8f0') }}>
                          Padrão FFmpeg
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isLight ? '#475569' : '#94a3b8' }}>
                          Padrão
                        </span>
                      </div>
                      <div style={{ fontSize: 10.5, color: isLight ? '#475569' : '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
                        Fluxo 4.2 estável p/ cortes rápidos
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={motorRender === 'opengl'}
                      disabled={renderState.isRendering}
                      onClick={() => setMotorRender('opengl')}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: renderState.isRendering ? 'not-allowed' : 'pointer',
                        border: motorRender === 'opengl'
                          ? `1.5px solid ${isLight ? '#7c3aed' : '#a78bfa'}`
                          : `1px solid ${isLight ? '#cbd5e1' : '#334155'}`,
                        background: motorRender === 'opengl'
                          ? (isLight ? '#f5f3ff' : 'rgba(139, 92, 246, 0.16)')
                          : (isLight ? '#ffffff' : '#0b1120'),
                        color: isLight ? '#0f172a' : '#f8fafc',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: motorRender === 'opengl' ? (isLight ? '#6d28d9' : '#c4b5fd') : (isLight ? '#0f172a' : '#e2e8f0') }}>
                          GPU Studio
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isLight ? '#6d28d9' : '#a78bfa' }}>
                          OpenGL
                        </span>
                      </div>
                      <div style={{ fontSize: 10.5, color: isLight ? '#475569' : '#94a3b8', marginTop: 2, lineHeight: 1.3 }}>
                        33 transições · 10 filtros · NVENC
                      </div>
                    </button>
                  </div>

                  {/* Diagnóstico contextual do motor GPU Studio */}
                  {isOpengl && (
                    <div
                      style={{
                        marginTop: 7,
                        padding: '7px 9px',
                        borderRadius: 6,
                        fontSize: 11,
                        lineHeight: 1.4,
                        background: openglReady
                          ? (isLight ? '#f0fdf4' : 'rgba(22, 163, 74, 0.12)')
                          : (openglUnavailable || legacyBackend)
                          ? (isLight ? '#fffbeb' : 'rgba(217, 119, 6, 0.14)')
                          : (isLight ? '#f1f5f9' : 'rgba(148, 163, 184, 0.1)'),
                        border: `1px solid ${
                          openglReady
                            ? (isLight ? '#86efac' : 'rgba(34, 197, 94, 0.4)')
                            : (openglUnavailable || legacyBackend)
                            ? (isLight ? '#fcd34d' : 'rgba(245, 158, 11, 0.45)')
                            : (isLight ? '#cbd5e1' : '#334155')
                        }`,
                        color: openglReady
                          ? (isLight ? '#166534' : '#86efac')
                          : (openglUnavailable || legacyBackend)
                          ? (isLight ? '#92400e' : '#fcd34d')
                          : (isLight ? '#334155' : '#cbd5e1'),
                      }}
                    >
                      {openglReady ? (
                        <span>
                          <strong>Pronto na GPU:</strong> OpenGL ativo em {motorInfo?.gpu}
                          {motorInfo?.nvenc_disponivel ? ' + NVENC hardware.' : ' (encoder libx264).'} Suporta imagens + MP4 misturados com câmera suave em sub-pixel.
                        </span>
                      ) : openglUnavailable ? (
                        <span>
                          <strong>Atenção — GPU Studio indisponível nesta sessão:</strong>{' '}
                          {motorInfo?.opengl_motivo || 'Ative uma GPU no Google Colab (Ambiente de execução → Alterar tipo de ambiente de execução → GPU T4/L4).'}
                        </span>
                      ) : legacyBackend ? (
                        <span>
                          <strong>Script Colab desatualizado:</strong> o servidor conectado ainda não reporta suporte a OpenGL. Atualize a célula do Colab com a versão mais recente para usar o GPU Studio.
                        </span>
                      ) : (
                        <span>
                          Exige Google Colab conectado com <strong>GPU ativa (T4/L4)</strong>. Se a GPU estiver desligada ou o OpenGL falhar, o render será interrompido com aviso detalhado.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: isLight ? 600 : 400, color: isLight ? '#334155' : 'var(--muted, #94a3b8)', marginBottom: 4 }}>
                      Formato
                    </label>
                    <select
                      value={formato}
                      disabled={renderState.isRendering}
                      onChange={(e) => setFormato(e.target.value as FormatoRender)}
                      className="input"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: 12,
                        fontWeight: isLight ? 600 : 400,
                        background: isLight ? '#ffffff' : '#0b1120',
                        border: isLight ? '1px solid #94a3b8' : '1px solid #334155',
                        borderRadius: 6,
                        color: isLight ? '#0f172a' : '#f8fafc',
                        cursor: renderState.isRendering ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="16:9">16:9 (Horizontal)</option>
                      <option value="9:16">9:16 (Vertical)</option>
                      <option value="1:1">1:1 (Quadrado)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: isLight ? 600 : 400, color: isLight ? '#334155' : 'var(--muted, #94a3b8)', marginBottom: 4 }}>
                      FPS
                    </label>
                    <select
                      value={fps}
                      disabled={renderState.isRendering}
                      onChange={(e) => setFps(Number(e.target.value) as FpsOpcao)}
                      className="input"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: 12,
                        fontWeight: isLight ? 600 : 400,
                        background: isLight ? '#ffffff' : '#0b1120',
                        border: isLight ? '1px solid #94a3b8' : '1px solid #334155',
                        borderRadius: 6,
                        color: isLight ? '#0f172a' : '#f8fafc',
                        cursor: renderState.isRendering ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="24">24 fps</option>
                      <option value="30">30 fps</option>
                      <option value="60">60 fps</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: isLight ? 600 : 400, color: isLight ? '#334155' : 'var(--muted, #94a3b8)', marginBottom: 4 }}>
                      Qualidade
                    </label>
                    <select
                      value={qualidade}
                      disabled={renderState.isRendering}
                      onChange={(e) => setQualidade(e.target.value as QualidadeRender)}
                      className="input"
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: 12,
                        fontWeight: isLight ? 600 : 400,
                        background: isLight ? '#ffffff' : '#0b1120',
                        border: isLight ? '1px solid #94a3b8' : '1px solid #334155',
                        borderRadius: 6,
                        color: isLight ? '#0f172a' : '#f8fafc',
                        cursor: renderState.isRendering ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="480p">480p SD</option>
                      <option value="720p">720p HD</option>
                      <option value="1080p">1080p FullHD</option>
                      <option value="1440p">1440p 2K</option>
                      <option value="2160p">2160p 4K</option>
                    </select>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: isLight ? '#475569' : '#94a3b8', lineHeight: 1.3 }}>
                  Use 480p/720p para conferir cortes e sincronia antes do render final em FullHD/2K/4K.
                </p>
              </div>

              <p style={{ fontSize: 12, fontWeight: isLight ? 600 : 400, color: isLight ? '#334155' : 'var(--muted)', margin: '0 0 2px' }}>
                Escolha o método de exportação:
              </p>

              {/* Renderizar no Colab */}
              <button
                className="btn btn-primary"
                style={{
                  justifyContent: 'center',
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: motorOnline
                    ? isOpengl
                      ? (isLight ? 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)')
                      : (isLight ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)')
                    : undefined,
                  color: motorOnline && (isLight || isOpengl) ? '#ffffff' : undefined,
                }}
                disabled={renderState.isRendering}
                onClick={() => onRenderColab({ formato, qualidade, fps, motorRender })}
              >
                {isOpengl
                  ? '✨ Renderizar no Colab (GPU Studio OpenGL)'
                  : '🚀 Renderizar no Colab (Padrão FFmpeg)'}
              </button>

              {/* Salvar JSON */}
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'center', padding: '10px' }}
                disabled={renderState.isRendering}
                onClick={onExportJson}
              >
                💾 Salvar Projeto (.JSON)
              </button>

              {/* Renderizar no Navegador FFmpeg */}
              <button
                className="btn btn-ghost"
                style={{ justifyContent: 'center', padding: '10px' }}
                disabled={renderState.isRendering}
                onClick={onRenderBrowser}
              >
                💻 Renderizar no Navegador (FFmpeg WASM)
              </button>
            </>
          )}

          {/* Feedback de erro acionável (ex.: GPU desativada no Colab ou falha OpenGL) */}
          {!renderState.isRendering && renderState.error && (
            <div
              role="alert"
              style={{
                background: isLight ? '#fef2f2' : 'rgba(220, 38, 38, 0.14)',
                border: `1px solid ${isLight ? '#f87171' : '#ef4444'}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: isLight ? '#991b1b' : '#fecaca',
                lineHeight: 1.45,
                whiteSpace: 'pre-line',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: isLight ? '#b91c1c' : '#fca5a5' }}>
                ⚠️ Renderização interrompida
              </div>
              {renderState.error}
            </div>
          )}

          {/* Feedback se terminou com sucesso e não está mais renderizando */}
          {!renderState.isRendering && !renderState.error && renderState.status.includes('sucesso') && (
            <div
              style={{
                background: isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.15)',
                border: `1px solid ${isLight ? '#86efac' : '#22c55e'}`,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: isLight ? '#166534' : '#86efac',
                fontWeight: isLight ? 600 : 400,
                textAlign: 'center',
              }}
            >
              {renderState.status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
