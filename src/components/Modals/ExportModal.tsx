import React from 'react';
import { RenderState } from '../../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  renderState: RenderState;
  onExportJson: () => void;
  onRenderColab: () => void;
  onRenderBrowser: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  renderState,
  onExportJson,
  onRenderColab,
  onRenderBrowser,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">⬇ Exportar</span>
          <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
            Escolha como exportar o projeto atual.
          </p>

          {/* Salvar JSON */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center', padding: '10px' }}
            onClick={onExportJson}
          >
            💾 Salvar Projeto (.JSON)
          </button>

          {/* Renderizar no Colab */}
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center', padding: '10px' }}
            onClick={onRenderColab}
          >
            🚀 Renderizar no Colab (Motor de Dobra)
          </button>

          {/* Renderizar no Navegador FFmpeg */}
          <button
            className="btn btn-ghost"
            style={{ justifyContent: 'center', padding: '10px' }}
            disabled={renderState.isRendering}
            onClick={onRenderBrowser}
          >
            {renderState.isRendering ? `⏳ ${renderState.status}` : '💻 Renderizar no Navegador (FFmpeg)'}
          </button>

          {renderState.isRendering && (
            <div>
              <div className="progress-bar" style={{ marginTop: 4 }}>
                <div className="progress-fill" style={{ width: `${renderState.progress}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'center' }}>
                {renderState.progress}% — {renderState.status}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
