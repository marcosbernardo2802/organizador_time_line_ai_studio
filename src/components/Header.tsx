import React from 'react';
import { UserInfo } from '../types';

interface HeaderProps {
  theme: string;
  onToggleTheme: () => void;
  userInfo: UserInfo | null;
  authState: 'idle' | 'loading' | 'ok' | 'error';
  onAuth: () => void;
  onLogout: () => void;
  onNewProject: () => void;
  onLoadProject: () => void;
  onSaveProject: () => void;
  hasSavedProject: boolean;
  jobsCount: number;
  onOpenJobs: () => void;
  onOpenAi: () => void;
  onOpenExport: () => void;
  motorStatus: { dot: string; label: string };
  isInIframe?: boolean;
  onOpenFloatingWindow?: () => void;
  onOpenOAuthHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  userInfo,
  authState,
  onAuth,
  onLogout,
  onNewProject,
  onLoadProject,
  onSaveProject,
  hasSavedProject,
  jobsCount,
  onOpenJobs,
  onOpenAi,
  onOpenExport,
  motorStatus,
  isInIframe = false,
  onOpenFloatingWindow,
  onOpenOAuthHelp,
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
        {/* Botão Janela Flutuante para contornar restrição de OAuth em iframe */}
        {onOpenFloatingWindow && (
          <button
            className="btn"
            style={{
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 9px',
              background: isInIframe ? 'rgba(74, 158, 255, 0.15)' : 'var(--surface-hover, rgba(255,255,255,0.05))',
              border: isInIframe ? '1px solid var(--accent)' : '1px solid var(--border)',
              color: isInIframe ? 'var(--accent)' : 'var(--text)',
              cursor: 'pointer',
              fontWeight: isInIframe ? 600 : 500,
            }}
            onClick={onOpenFloatingWindow}
            title={
              isInIframe
                ? 'Abrir em Janela Flutuante — O Google bloqueia o login OAuth 2.0 dentro de iframes. Abra aqui para autenticar e usar o app sem restrições.'
                : 'Abrir app em Janela Flutuante separada'
            }
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>⧉</span>
            <span>Janela Flutuante</span>
            {isInIframe && (
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
                title="Executando dentro de iframe (AI Studio / Portal)"
              >
                IFRAME
              </span>
            )}
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

        {userInfo ? (
          <>
            <span
              style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Share Tech Mono' }}
              title="Atalhos: Espaço=Play/Pause | Delete=Remover | F=Tela Cheia | Home=Início | ←→=Navegar | Ctrl+/- =Zoom"
            >
              {userInfo.email} · ⌨️
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onLogout} title="Desconectar do Google Drive">
              🚪 Sair
            </button>
            {onOpenOAuthHelp && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '3px 5px', color: 'var(--muted)' }}
                onClick={onOpenOAuthHelp}
                title="Configurações do Google Drive / OAuth"
              >
                ⚙️
              </button>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className={`btn ${authState === 'error' ? 'btn-danger' : 'btn-ghost'}`}
              style={{
                fontSize: 11,
                border: authState === 'error' ? '1px solid #ef4444' : undefined,
                color: authState === 'error' ? '#ef4444' : undefined,
              }}
              onClick={onAuth}
              title={
                authState === 'error'
                  ? 'Erro na autorização do Google. Clique para tentar novamente ou clique na ⚙️ ao lado para resolver o Erro 400 (origin_mismatch).'
                  : 'Conectar ao Google Drive'
              }
            >
              {authState === 'loading' ? '⟳' : authState === 'error' ? '⚠️' : '🔑'}{' '}
              {authState === 'loading' ? 'Conectando...' : authState === 'error' ? 'Erro Drive' : 'Drive'}
            </button>
            {onOpenOAuthHelp && (
              <button
                className="btn btn-ghost"
                style={{
                  fontSize: 11,
                  padding: '3px 6px',
                  color: authState === 'error' ? '#ef4444' : 'var(--muted)',
                  border: authState === 'error' ? '1px dashed #ef4444' : undefined,
                  borderRadius: 4,
                }}
                onClick={onOpenOAuthHelp}
                title="Configurar Google Drive / Resolver Erro 400 (origin_mismatch)"
              >
                ⚙️
              </button>
            )}
          </div>
        )}

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
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onOpenJobs}>
          📡 Jobs ({jobsCount})
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
