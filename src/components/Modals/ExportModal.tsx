import React, { useState } from 'react';
import { RenderState, FormatoRender, QualidadeRender, FpsOpcao } from '../../types';
import { EtapasProgresso } from '../EtapasProgresso';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  renderState: RenderState;
  onExportJson: () => void;
  onRenderColab: (opcoes: { formato: FormatoRender; qualidade: QualidadeRender; fps?: FpsOpcao }) => void;
  onRenderBrowser: () => void;
  motorOnline?: boolean;
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
  onOpenMotorModal,
  initialFormato = '16:9',
  initialQualidade = '1080p',
  initialFps = 24,
  theme = 'dark',
}) => {
  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  // Estado local para formato, qualidade e FPS de renderização no Colab
  const [formato, setFormato] = useState<FormatoRender>(initialFormato);
  const [qualidade, setQualidade] = useState<QualidadeRender>(initialQualidade);
  const [fps, setFps] = useState<FpsOpcao>(initialFps);

  React.useEffect(() => {
    if (isOpen) {
      if (initialFormato) setFormato(initialFormato);
      if (initialQualidade) setQualidade(initialQualidade);
      if (initialFps) setFps(initialFps);
    }
  }, [isOpen, initialFormato, initialQualidade, initialFps]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
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
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <strong style={{ color: isLight ? '#0284c7' : '#00f0ff', fontSize: 13 }}>
                    Processando na GPU do Colab
                  </strong>
                </div>
                <span
                  style={{
                    background: isLight ? '#0284c7' : '#00f0ff',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 12,
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
                    {motorOnline ? 'Motor Colab (GPU): Conectado' : 'Motor Colab (GPU): Desconectado'}
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
                  background: isLight ? '#f1f5f9' : 'rgba(15, 23, 42, 0.6)',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid #1e293b',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: isLight ? '#0284c7' : '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚙️ Opções de render (Colab)
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
                    ? (isLight ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)')
                    : undefined,
                  color: motorOnline && isLight ? '#ffffff' : undefined,
                }}
                disabled={renderState.isRendering}
                onClick={() => onRenderColab({ formato, qualidade, fps })}
              >
                🚀 Renderizar no Colab (GPU Direto)
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

          {/* Feedback se terminou com sucesso e não está mais renderizando */}
          {!renderState.isRendering && renderState.status.includes('sucesso') && (
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
