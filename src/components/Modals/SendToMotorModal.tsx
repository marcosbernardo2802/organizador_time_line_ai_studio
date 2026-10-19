import React from 'react';
import { AiFiles, AiStatus } from '../../types';
import { ACCEPT_AUDIO, ACCEPT_VISUAL, isVideoFile } from '../../utils/media';

interface SendToMotorModalProps {
  isOpen: boolean;
  onClose: () => void;
  driveReady: boolean;
  aiFiles: AiFiles;
  aiStatus: AiStatus;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'roteiro' | 'images' | 'bgm') => void;
  onSubmitJob: () => void;
  isInIframe?: boolean;
  onOpenFloatingWindow?: () => void;
  onOpenOAuthHelp?: () => void;
}

export const SendToMotorModal: React.FC<SendToMotorModalProps> = ({
  isOpen,
  onClose,
  driveReady,
  aiFiles,
  aiStatus,
  onFileChange,
  onSubmitJob,
  isInIframe = false,
  onOpenFloatingWindow,
  onOpenOAuthHelp,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => !aiStatus.running && onClose()}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title">✦ Enviar ao Motor de Dobra</span>
          {!aiStatus.running && (
            <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">
          {!driveReady && (
            <div
              style={{
                color: 'var(--text)',
                fontSize: 12,
                marginBottom: 14,
                padding: '10px 14px',
                background: 'rgba(255, 170, 0, 0.08)',
                borderRadius: 6,
                border: '1px solid rgba(255, 170, 0, 0.3)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--accent2)', marginBottom: 4 }}>
                <span>⚠️</span>
                <span>{isInIframe ? 'Restrição de OAuth 2.0 em Iframe' : 'Google Drive Desconectado'}</span>
              </div>
              <div>
                {isInIframe
                  ? 'O Google bloqueia o login OAuth dentro de iframes (ambiente AI Studio ou portal). Abra o aplicativo em Janela Flutuante para conectar sua conta e enviar jobs ao Drive normalmente.'
                  : 'O Google Drive ainda não está conectado. Conecte pelo botão "Drive" no topo para enviar jobs.'}
              </div>
              {isInIframe && onOpenFloatingWindow && (
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{
                    marginTop: 8,
                    width: '100%',
                    fontSize: 12,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  onClick={onOpenFloatingWindow}
                >
                  <span>⧉</span> Abrir em Janela Flutuante para Conectar ao Drive
                </button>
              )}
              {onOpenOAuthHelp && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    fontSize: 11,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: 'var(--accent2)',
                    textDecoration: 'underline',
                  }}
                  onClick={onOpenOAuthHelp}
                >
                  <span>🛠️</span> Resolver Erro 400 (origin_mismatch) / Configurar Origens
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* áudio */}
            <label className={`upload-slot ${aiFiles.audio ? 'done' : ''}`}>
              <div className="upload-slot-icon" style={{ color: aiFiles.audio ? 'var(--success)' : 'var(--muted)' }}>
                🎙
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label">NARRAÇÃO *</div>
                <div className="upload-slot-name">{aiFiles.audio?.name || 'audio.mp3 / .wav / .m4a / .ogg'}</div>
              </div>
              <input type="file" accept={ACCEPT_AUDIO} style={{ display: 'none' }} onChange={(e) => onFileChange(e, 'audio')} />
            </label>

            {/* roteiro */}
            <label className={`upload-slot ${aiFiles.roteiro ? 'done' : ''}`}>
              <div className="upload-slot-icon" style={{ color: aiFiles.roteiro ? 'var(--success)' : 'var(--muted)' }}>
                📄
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label">ROTEIRO *</div>
                <div className="upload-slot-name">{aiFiles.roteiro?.name || 'roteiro.txt / .md'}</div>
              </div>
              <input type="file" accept=".txt,.TXT,.md,.MD,.text,.TEXT" style={{ display: 'none' }} onChange={(e) => onFileChange(e, 'roteiro')} />
            </label>

            {/* imagens e vídeos */}
            {(() => {
              const videoCount = aiFiles.images.filter((f) => isVideoFile(f.name, f.type)).length;
              const imgCount = aiFiles.images.length - videoCount;
              const labelText =
                aiFiles.images.length > 0
                  ? `${aiFiles.images.length} arquivo(s) (${imgCount} img, ${videoCount} víd)`
                  : 'Selecionar (.mp4, .png, .jpg...)';

              return (
                <label className={`upload-slot ${aiFiles.images.length > 0 ? 'done' : ''}`}>
                  <div className="upload-slot-icon" style={{ color: aiFiles.images.length > 0 ? 'var(--success)' : 'var(--muted)' }}>
                    🎬
                  </div>
                  <div className="upload-slot-info">
                    <div className="upload-slot-label">IMAGENS / VÍDEOS *</div>
                    <div className="upload-slot-name">{labelText}</div>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPT_VISUAL}
                    style={{ display: 'none' }}
                    onChange={(e) => onFileChange(e, 'images')}
                  />
                </label>
              );
            })()}

            {/* bgm */}
            <label className={`upload-slot ${aiFiles.bgm ? 'done' : ''}`}>
              <div className="upload-slot-icon" style={{ color: aiFiles.bgm ? 'var(--success)' : 'var(--muted)' }}>
                🎵
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label">MÚSICA DE FUNDO</div>
                <div className="upload-slot-name">{aiFiles.bgm?.name || 'Opcional (.mp3, .wav...)'}</div>
              </div>
              <input type="file" accept={ACCEPT_AUDIO} style={{ display: 'none' }} onChange={(e) => onFileChange(e, 'bgm')} />
            </label>
          </div>

          {/* aviso sobre o Motor */}
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(45,107,228,0.08)',
              border: '1px solid rgba(45,107,228,0.2)',
              borderRadius: 3,
              fontSize: 12,
              color: 'var(--muted)',
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: 'var(--accent2)' }}>Como funciona:</strong> Os arquivos de mídia (imagens e vídeos) serão enviados ao Google Drive na pasta{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              MotorDobra/fila/
            </span>
            . O Motor de Dobra 4.0 rodando no Colab reconhecerá tanto imagens quanto vídeos e devolverá a timeline sincronizada.
          </div>

          {aiStatus.running && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--text)' }}>{aiStatus.msg}</span>
                <span className="mono" style={{ color: 'var(--accent2)' }}>
                  {Math.round(aiStatus.pct)}%
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${aiStatus.pct}%` }} />
              </div>
            </div>
          )}

          {aiStatus.error && (
            <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{aiStatus.error}</div>
          )}

          {aiStatus.step === 'aguardando' && (
            <div style={{ color: 'var(--success)', fontSize: 12, marginBottom: 10 }}>
              ✅ Job enviado com sucesso! Acompanhe o progresso em "📡 Jobs".
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={aiStatus.running}>
              Cancelar
            </button>
            <button
              className="btn btn-gold"
              disabled={
                !driveReady ||
                !aiFiles.audio ||
                !aiFiles.roteiro ||
                aiFiles.images.length === 0 ||
                aiStatus.running
              }
              onClick={onSubmitJob}
            >
              {aiStatus.running ? '⟳ Enviando...' : '✦ Enviar ao Motor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
