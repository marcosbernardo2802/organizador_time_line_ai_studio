import React from 'react';
import { AiFiles, AiStatus } from '../../types';
import { ACCEPT_AUDIO, ACCEPT_VISUAL, isVideoFile } from '../../utils/media';

interface SendToMotorModalProps {
  isOpen: boolean;
  onClose: () => void;
  driveReady: boolean;
  motorOnline?: boolean;
  motorGpu?: string;
  onOpenMotorConfig?: () => void;
  activeWorkspaceName?: string | null;
  onPickWorkspace?: () => void;
  aiFiles: AiFiles;
  aiStatus: AiStatus;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'roteiro' | 'images' | 'bgm') => void;
  onSubmitJob: () => void;
  onSubmitDirectJob?: () => void;
  isInIframe?: boolean;
  onOpenFloatingWindow?: () => void;
  onOpenOAuthHelp?: () => void;
}

export const SendToMotorModal: React.FC<SendToMotorModalProps> = ({
  isOpen,
  onClose,
  driveReady,
  motorOnline = false,
  motorGpu,
  onOpenMotorConfig,
  activeWorkspaceName,
  onPickWorkspace,
  aiFiles,
  aiStatus,
  onFileChange,
  onSubmitJob,
  onSubmitDirectJob,
  isInIframe = false,
  onOpenFloatingWindow,
  onOpenOAuthHelp,
}) => {
  if (!isOpen) return null;

  const isReady = motorOnline || driveReady;

  return (
    <div className="modal-overlay" onClick={() => !aiStatus.running && onClose()}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <span className="modal-title">✦ Enviar ao Motor de Dobra 4.2</span>
          {!aiStatus.running && (
            <button className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">
          {/* Status da Conexão com o Motor */}
          {motorOnline ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 6,
                marginBottom: 14,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                <div>
                  <strong style={{ color: '#22c55e' }}>Motor Direto Online (Colab GPU)</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 1 }}>
                    {motorGpu ? `GPU: ${motorGpu}` : 'GPU Pronta'} • Sem necessidade de Google Drive
                  </div>
                </div>
              </div>
              {onOpenMotorConfig && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={onOpenMotorConfig}
                >
                  ⚙️ Configurar
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                color: 'var(--text)',
                fontSize: 12,
                marginBottom: 14,
                padding: '12px 14px',
                background: 'rgba(56, 189, 248, 0.08)',
                borderRadius: 6,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                <span>⚡</span>
                <span>Conecte o Motor de Dobra (Colab GPU)</span>
              </div>
              <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
                Cole a URL do túnel ngrok gerada no Colab para processar os arquivos do seu PC direto na GPU.
              </div>
              {onOpenMotorConfig && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    fontSize: 12,
                    padding: '7px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontWeight: 600,
                  }}
                  onClick={onOpenMotorConfig}
                >
                  <span>⚡</span> Conectar Motor via ngrok (Recomendado)
                </button>
              )}
            </div>
          )}

          {/* Atalho de Pasta de Trabalho do PC */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--surface-hover, rgba(255,255,255,0.03))',
              border: '1px solid var(--border)',
              borderRadius: 6,
              marginBottom: 14,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📁</span>
              <span style={{ color: 'var(--text)' }}>
                {activeWorkspaceName ? (
                  <>Pasta Local: <strong style={{ color: 'var(--accent)' }}>{activeWorkspaceName}</strong></>
                ) : (
                  'Carregar todos os arquivos de uma pasta do PC'
                )}
              </span>
            </div>
            {onPickWorkspace && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--border)' }}
                onClick={onPickWorkspace}
              >
                {activeWorkspaceName ? 'Trocar Pasta' : 'Escolher Pasta'}
              </button>
            )}
          </div>

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
            <strong style={{ color: motorOnline ? '#22c55e' : 'var(--accent2)' }}>
              ⚡ Processamento na GPU (Colab):
            </strong>{' '}
            Os arquivos selecionados (ou da sua pasta de trabalho) são enviados diretamente para a GPU do Colab via túnel ngrok. O resultado é calculado em tempo real e salvo automaticamente de volta no seu PC!
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
              ✅ Processamento iniciado com sucesso na GPU!
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={aiStatus.running}>
              Cancelar
            </button>
            <button
              className={motorOnline ? 'btn btn-primary' : 'btn btn-gold'}
              disabled={
                !isReady ||
                !aiFiles.audio ||
                !aiFiles.roteiro ||
                aiFiles.images.length === 0 ||
                aiStatus.running
              }
              onClick={motorOnline && onSubmitDirectJob ? onSubmitDirectJob : onSubmitJob}
            >
              {aiStatus.running
                ? '⟳ Processando...'
                : motorOnline
                ? '⚡ Disparar na GPU (ngrok)'
                : '✦ Enviar ao Motor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
