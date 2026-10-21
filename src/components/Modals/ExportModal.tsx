import React from 'react';
import { RenderState } from '../../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  renderState: RenderState;
  onExportJson: () => void;
  onRenderColab: () => void;
  onRenderBrowser: () => void;
  motorOnline?: boolean;
  onOpenMotorModal?: () => void;
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
}) => {
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
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1px solid #00f0ff',
                borderRadius: 10,
                padding: 16,
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <strong style={{ color: '#00f0ff', fontSize: 13 }}>
                    Processando na GPU do Colab
                  </strong>
                </div>
                <span
                  style={{
                    background: '#00f0ff',
                    color: '#070a10',
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
                  background: '#0f172a',
                  borderRadius: 5,
                  overflow: 'hidden',
                  border: '1px solid #1e293b',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${Math.max(5, renderState.progress)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00f0ff 0%, #38bdf8 100%)',
                    transition: 'width 0.4s ease',
                    boxShadow: '0 0 10px #00f0ff',
                  }}
                />
              </div>

              <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.4, marginBottom: 8 }}>
                {renderState.status || 'Enviando arquivos e iniciando GPU...'}
              </div>

              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                💡 Você pode fechar este modal; o progresso continuará visível no canto inferior direito da tela e o arquivo <code>video_final.mp4</code> será baixado automaticamente ao concluir.
              </div>
            </div>
          ) : (
            <>
              {/* Status do Motor de Dobra Colab */}
              <div
                style={{
                  background: motorOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${motorOnline ? '#22c55e' : '#ef4444'}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: motorOnline ? '#22c55e' : '#ef4444',
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
                      background: '#1e293b',
                      border: '1px solid #38bdf8',
                      color: '#38bdf8',
                      borderRadius: 4,
                      fontSize: 11,
                      padding: '2px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    Conectar ngrok
                  </button>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 2px' }}>
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
                  background: motorOnline ? 'linear-gradient(135deg, #00f0ff 0%, #0284c7 100%)' : undefined,
                }}
                disabled={renderState.isRendering}
                onClick={onRenderColab}
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
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid #22c55e',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                color: '#86efac',
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
