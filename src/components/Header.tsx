import React from 'react';

interface HeaderProps {
  theme: string;
  onToggleTheme: () => void;
  onNewProject: () => void;
  onLoadProject: () => void;
  onSaveProject: () => void;
  hasSavedProject: boolean;
  onOpenAi: () => void;
  onOpenExport: () => void;
  motorStatus: { dot: string; label: string };
  // Motor GPU & Local Workspace
  motorOnline?: boolean;
  motorGpu?: string;
  onOpenMotorConfig?: () => void;
  workspaceName?: string | null;
  onPickWorkspace?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onNewProject,
  onLoadProject,
  onSaveProject,
  hasSavedProject,
  onOpenAi,
  onOpenExport,
  motorStatus,
  motorOnline = false,
  motorGpu,
  onOpenMotorConfig,
  workspaceName,
  onPickWorkspace,
}) => {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 44,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: 15, letterSpacing: 2, color: 'var(--accent2)' }}>
          CRÔNICAS ESTELARES
        </span>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--muted)' }}>v3.0</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <span className={`status-dot ${motorStatus.dot}`}></span>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'var(--muted)' }}>{motorStatus.label}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Conexão com o Motor de Dobra (Colab GPU via ngrok) */}
        {onOpenMotorConfig && (
          <button
            className="btn"
            style={{
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              background: motorOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${motorOnline ? '#22c55e' : '#64748b'}`,
              color: motorOnline ? '#22c55e' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={onOpenMotorConfig}
            title={motorOnline ? `Motor Conectado: ${motorGpu || 'GPU Pronta'}. Clique para configurações.` : 'Motor desconectado. Clique para colar a URL do ngrok gerada no Colab.'}
          >
            <span style={{ fontSize: 10 }}>{motorOnline ? '🟢' : '⚡'}</span>
            <span>{motorOnline ? `GPU ${motorGpu ? `(${motorGpu})` : 'Pronta'}` : 'Conectar Motor'}</span>
          </button>
        )}

        {/* Workspace / Pasta Local do PC */}
        {onPickWorkspace && (
          <button
            className="btn btn-ghost"
            style={{
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              border: workspaceName ? '1px solid var(--accent)' : '1px dashed var(--border)',
              color: workspaceName ? 'var(--accent)' : 'var(--text)',
            }}
            onClick={onPickWorkspace}
            title={workspaceName ? `Pasta do PC selecionada: ${workspaceName}` : 'Selecionar pasta do seu PC (Workspace)'}
          >
            <span>📁</span>
            <span>{workspaceName ? workspaceName : 'Pasta do PC'}</span>
          </button>
        )}

        <button
          className="btn btn-ghost"
          style={{ fontSize: 14, padding: '4px 8px' }}
          onClick={onToggleTheme}
          title="Alternar Tema Claro/Escuro"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <span
          style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Share Tech Mono', cursor: 'help' }}
          title="Atalhos: Espaço=Play/Pause | Delete=Remover | F=Tela Cheia | Home=Início | ←→=Navegar | Ctrl+/-=Zoom"
        >
          ⌨️ Atalhos
        </span>

        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onNewProject} title="Criar novo projeto">
          ✨ Novo
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: 11 }}
          onClick={onLoadProject}
          title={hasSavedProject ? `Projeto salvo: ${localStorage.getItem('cronicas_salvo_em') || ''}` : 'Nenhum projeto salvo'}
        >
          {hasSavedProject ? '📂 Carregar' : '📂'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onSaveProject}>
          💾 Salvar
        </button>
        <button className="btn btn-gold" onClick={onOpenAi}>
          ✦ Enviar ao Motor
        </button>
        <button className="btn btn-primary" onClick={onOpenExport}>
          ⬇ Exportar
        </button>
      </div>
    </header>
  );
};
