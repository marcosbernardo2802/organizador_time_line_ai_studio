import React from 'react';
import { AiFiles, AiStatus } from '../../types';
import { ACCEPT_AUDIO, ACCEPT_VISUAL, isVideoFile } from '../../utils/media';
import { EtapasProgresso } from '../EtapasProgresso';

interface SendToMotorModalProps {
  isOpen: boolean;
  onClose: () => void;
  motorOnline?: boolean;
  motorGpu?: string;
  onOpenMotorConfig?: () => void;
  activeWorkspaceName?: string | null;
  onPickWorkspace?: () => void;
  aiFiles: AiFiles;
  aiStatus: AiStatus;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'roteiro' | 'images' | 'bgm') => void;
  onSubmitDirectJob: () => void;
  ignorarCache?: boolean;
  onToggleIgnorarCache?: (val: boolean) => void;
  theme?: string;
}

export const SendToMotorModal: React.FC<SendToMotorModalProps> = ({
  isOpen,
  onClose,
  motorOnline = false,
  motorGpu,
  onOpenMotorConfig,
  activeWorkspaceName,
  onPickWorkspace,
  aiFiles,
  aiStatus,
  onFileChange,
  onSubmitDirectJob,
  ignorarCache = false,
  onToggleIgnorarCache,
  theme = 'dark',
}) => {
  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => !aiStatus.running && onClose()}>
      <div className="modal animate-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header" style={isLight ? { background: '#f8fafc', borderBottom: '1px solid #e2e8f0' } : undefined}>
          <span className="modal-title" style={isLight ? { color: '#0284c7' } : undefined}>✦ Enviar ao Motor de Dobra 4.2</span>
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
                background: isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.1)',
                border: isLight ? '1px solid #86efac' : '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 6,
                marginBottom: 14,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isLight ? '#16a34a' : '#22c55e',
                    boxShadow: isLight ? '0 0 4px #16a34a' : '0 0 8px #22c55e',
                  }}
                />
                <div>
                  <strong style={{ color: isLight ? '#166534' : '#22c55e' }}>Motor Direto Online (Colab GPU)</strong>
                  <div style={{ color: isLight ? '#334155' : 'var(--muted)', fontSize: 11, marginTop: 1, fontWeight: isLight ? 500 : 400 }}>
                    {motorGpu ? `GPU: ${motorGpu}` : 'GPU Pronta'} • Conexão direta via túnel ngrok
                  </div>
                </div>
              </div>
              {onOpenMotorConfig && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    background: isLight ? '#ffffff' : undefined,
                    color: isLight ? '#166534' : undefined,
                    borderColor: isLight ? '#86efac' : undefined,
                    fontWeight: isLight ? 600 : 400,
                  }}
                  onClick={onOpenMotorConfig}
                >
                  ⚙️ Configurar
                </button>
              )}
            </div>
          ) : (
            <div
              style={{
                color: isLight ? '#0f172a' : 'var(--text)',
                fontSize: 12,
                marginBottom: 14,
                padding: '12px 14px',
                background: isLight ? '#f0f9ff' : 'rgba(56, 189, 248, 0.08)',
                borderRadius: 6,
                border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.3)',
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 700,
                  color: isLight ? '#0284c7' : '#38bdf8',
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                <span>⚡</span>
                <span>Conecte o Motor de Dobra (Colab GPU)</span>
              </div>
              <div style={{ color: isLight ? '#334155' : 'var(--muted)', marginBottom: 10, fontSize: 12, fontWeight: isLight ? 500 : 400 }}>
                Cole a URL do túnel ngrok gerada no Colab para processar os arquivos do seu PC direto na GPU.
              </div>
              {onOpenMotorConfig && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    fontSize: 12,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontWeight: 700,
                    background: isLight ? '#0284c7' : undefined,
                  }}
                  onClick={onOpenMotorConfig}
                >
                  <span>⚡</span> Conectar Motor via ngrok
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
              background: isLight ? '#f8fafc' : 'var(--surface-hover, rgba(255,255,255,0.03))',
              border: isLight ? '1px solid #cbd5e1' : '1px solid var(--border)',
              borderRadius: 6,
              marginBottom: 14,
              fontSize: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📁</span>
              <span style={{ color: isLight ? '#0f172a' : 'var(--text)', fontWeight: isLight ? 500 : 400 }}>
                {activeWorkspaceName ? (
                  <>Pasta Local: <strong style={{ color: isLight ? '#0284c7' : 'var(--accent)' }}>{activeWorkspaceName}</strong></>
                ) : (
                  'Carregar todos os arquivos de uma pasta do PC'
                )}
              </span>
            </div>
            {onPickWorkspace && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  border: isLight ? '1px solid #cbd5e1' : '1px solid var(--border)',
                  background: isLight ? '#ffffff' : undefined,
                  color: isLight ? '#0f172a' : undefined,
                  fontWeight: isLight ? 600 : 400,
                }}
                onClick={onPickWorkspace}
              >
                {activeWorkspaceName ? 'Trocar Pasta' : 'Escolher Pasta'}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* áudio */}
            <label
              className={`upload-slot ${aiFiles.audio ? 'done' : ''}`}
              style={isLight ? { background: '#ffffff', borderColor: aiFiles.audio ? '#16a34a' : '#cbd5e1' } : undefined}
            >
              <div
                className="upload-slot-icon"
                style={{
                  color: aiFiles.audio ? (isLight ? '#16a34a' : 'var(--success)') : (isLight ? '#64748b' : 'var(--muted)'),
                  background: isLight ? '#f1f5f9' : undefined,
                }}
              >
                🎙
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label" style={isLight ? { color: '#334155', fontWeight: 700 } : undefined}>NARRAÇÃO *</div>
                <div className="upload-slot-name" style={isLight ? { color: '#0f172a', fontWeight: 500 } : undefined}>{aiFiles.audio?.name || 'audio.mp3 / .wav / .m4a / .ogg'}</div>
              </div>
              <input type="file" accept={ACCEPT_AUDIO} style={{ display: 'none' }} onChange={(e) => onFileChange(e, 'audio')} />
            </label>

            {/* roteiro */}
            <label
              className={`upload-slot ${aiFiles.roteiro ? 'done' : ''}`}
              style={isLight ? { background: '#ffffff', borderColor: aiFiles.roteiro ? '#16a34a' : '#cbd5e1' } : undefined}
            >
              <div
                className="upload-slot-icon"
                style={{
                  color: aiFiles.roteiro ? (isLight ? '#16a34a' : 'var(--success)') : (isLight ? '#64748b' : 'var(--muted)'),
                  background: isLight ? '#f1f5f9' : undefined,
                }}
              >
                📄
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label" style={isLight ? { color: '#334155', fontWeight: 700 } : undefined}>ROTEIRO *</div>
                <div className="upload-slot-name" style={isLight ? { color: '#0f172a', fontWeight: 500 } : undefined}>{aiFiles.roteiro?.name || 'roteiro.txt / .md'}</div>
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
                <label
                  className={`upload-slot ${aiFiles.images.length > 0 ? 'done' : ''}`}
                  style={isLight ? { background: '#ffffff', borderColor: aiFiles.images.length > 0 ? '#16a34a' : '#cbd5e1' } : undefined}
                >
                  <div
                    className="upload-slot-icon"
                    style={{
                      color: aiFiles.images.length > 0 ? (isLight ? '#16a34a' : 'var(--success)') : (isLight ? '#64748b' : 'var(--muted)'),
                      background: isLight ? '#f1f5f9' : undefined,
                    }}
                  >
                    🎬
                  </div>
                  <div className="upload-slot-info">
                    <div className="upload-slot-label" style={isLight ? { color: '#334155', fontWeight: 700 } : undefined}>IMAGENS / VÍDEOS *</div>
                    <div className="upload-slot-name" style={isLight ? { color: '#0f172a', fontWeight: 500 } : undefined}>{labelText}</div>
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
            <label
              className={`upload-slot ${aiFiles.bgm ? 'done' : ''}`}
              style={isLight ? { background: '#ffffff', borderColor: aiFiles.bgm ? '#16a34a' : '#cbd5e1' } : undefined}
            >
              <div
                className="upload-slot-icon"
                style={{
                  color: aiFiles.bgm ? (isLight ? '#16a34a' : 'var(--success)') : (isLight ? '#64748b' : 'var(--muted)'),
                  background: isLight ? '#f1f5f9' : undefined,
                }}
              >
                🎵
              </div>
              <div className="upload-slot-info">
                <div className="upload-slot-label" style={isLight ? { color: '#334155', fontWeight: 700 } : undefined}>MÚSICA DE FUNDO</div>
                <div className="upload-slot-name" style={isLight ? { color: '#0f172a', fontWeight: 500 } : undefined}>{aiFiles.bgm?.name || 'Opcional (.mp3, .wav...)'}</div>
              </div>
              <input type="file" accept={ACCEPT_AUDIO} style={{ display: 'none' }} onChange={(e) => onFileChange(e, 'bgm')} />
            </label>
          </div>

          {/* aviso sobre o Motor */}
          <div
            style={{
              padding: '10px 12px',
              background: isLight ? '#f0f9ff' : 'rgba(45,107,228,0.08)',
              border: isLight ? '1px solid #bae6fd' : '1px solid rgba(45,107,228,0.2)',
              borderRadius: 6,
              fontSize: 12,
              color: isLight ? '#1e293b' : 'var(--muted)',
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: motorOnline ? (isLight ? '#166534' : '#22c55e') : (isLight ? '#0284c7' : 'var(--accent2)') }}>
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
              <EtapasProgresso
                etapas={aiStatus.etapas}
                etapaIndice={aiStatus.etapaIndice}
                etapaTotal={aiStatus.etapaTotal}
                detalhe={aiStatus.detalhe}
                etaSegundos={aiStatus.etaSegundos}
              />
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

          {/* Opção de refazer transcrição ignorando o cache */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              marginBottom: 14,
              padding: '8px 10px',
              background: isLight ? '#f8fafc' : 'var(--surface-hover, rgba(255, 255, 255, 0.03))',
              border: isLight ? '1px solid #cbd5e1' : '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              borderRadius: 6,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                cursor: aiStatus.running ? 'not-allowed' : 'pointer',
                userSelect: 'none',
                color: isLight ? '#0f172a' : 'var(--text)',
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={ignorarCache}
                disabled={aiStatus.running}
                onChange={(e) => onToggleIgnorarCache?.(e.target.checked)}
                style={{ cursor: aiStatus.running ? 'not-allowed' : 'pointer' }}
              />
              <span>Refazer transcrição (ignorar cache)</span>
            </label>
            <div style={{ fontSize: 11, color: isLight ? '#475569' : 'var(--muted)', marginLeft: 21, lineHeight: 1.4, fontWeight: isLight ? 500 : 400 }}>
              Use se a transcrição anterior ficou ruim. Por padrão, o motor reaproveita a transcrição de áudios já processados nesta sessão do Colab.
            </div>
          </div>

          {/* Alerta inferior de pendências para disparo na GPU (alto contraste) */}
          {(!motorOnline || !aiFiles.audio || !aiFiles.roteiro || aiFiles.images.length === 0) && !aiStatus.running && (
            <div
              style={{
                fontSize: 12,
                color: isLight ? '#991b1b' : '#fca5a5',
                background: isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${isLight ? '#fca5a5' : '#ef4444'}`,
                borderRadius: 6,
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: isLight ? '#991b1b' : '#f87171' }}>
                  {!motorOnline ? 'Falta conectar o Motor Colab:' : 'Atenção:'}
                </strong>{' '}
                <span style={{ color: isLight ? '#7f1d1d' : '#fca5a5', fontWeight: isLight ? 500 : 400 }}>
                  {[
                    !motorOnline && 'Conecte o motor GPU via túnel ngrok no botão acima',
                    !aiFiles.audio && 'Selecione a narração (.mp3/.wav)',
                    !aiFiles.roteiro && 'Selecione o roteiro (.txt)',
                    aiFiles.images.length === 0 && 'Selecione as imagens ou vídeos',
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </span>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={aiStatus.running}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !motorOnline ||
                !aiFiles.audio ||
                !aiFiles.roteiro ||
                aiFiles.images.length === 0 ||
                aiStatus.running
              }
              style={
                isLight && (!motorOnline || !aiFiles.audio || !aiFiles.roteiro || aiFiles.images.length === 0)
                  ? {
                      background: '#e2e8f0',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      opacity: 1,
                      cursor: 'not-allowed',
                      fontWeight: 600,
                    }
                  : undefined
              }
              onClick={onSubmitDirectJob}
              title={
                !motorOnline
                  ? 'Motor GPU desconectado. Configure o ngrok no topo.'
                  : !aiFiles.audio
                  ? 'Selecione a narração (áudio).'
                  : !aiFiles.roteiro
                  ? 'Selecione o arquivo de roteiro (.txt).'
                  : aiFiles.images.length === 0
                  ? 'Selecione ao menos uma imagem ou vídeo.'
                  : 'Enviar arquivos para processamento na GPU do Colab'
              }
            >
              {aiStatus.running
                ? '⟳ Processando...'
                : '⚡ Disparar na GPU (ngrok)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
