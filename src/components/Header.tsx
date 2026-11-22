import React, { useState, useRef, useEffect } from 'react';

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

const SHORTCUTS_LIST = [
  { keys: 'Espaço', desc: 'Play / Pause na timeline' },
  { keys: '← / →', desc: 'Avançar / Voltar 1s (Shift: 5s)' },
  { keys: 'Home', desc: 'Voltar para o início (00:00)' },
  { keys: 'Delete', desc: 'Remover clip selecionado' },
  { keys: 'F', desc: 'Alternar Tela Cheia no player' },
  { keys: 'Ctrl + Z / Y', desc: 'Desfazer / Refazer alteração' },
  { keys: 'Ctrl + / -', desc: 'Aumentar / Diminuir zoom' },
];

const LOGO_CANDIDATES = ['/images/logo.png', '/images/logo.svg', '/images/logo.webp'];

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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [logoIdx, setLogoIdx] = useState(0);
  const shortcutsRef = useRef<HTMLDivElement | null>(null);
  const isLight = theme === 'light';

  useEffect(() => {
    if (!showShortcuts) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showShortcuts]);

  const savedTimestamp = typeof window !== 'undefined' ? localStorage.getItem('cronicas_salvo_em') : null;
  const logoSrc = logoIdx < LOGO_CANDIDATES.length ? LOGO_CANDIDATES[logoIdx] : null;

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 46,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* ── IDENTIDADE DO APP ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {logoSrc && (
          <img
            src={logoSrc}
            alt="SyncForge"
            onError={() => setLogoIdx((i) => i + 1)}
            style={{
              height: 36,
              width: 'auto',
              maxWidth: 140,
              objectFit: 'contain',
              display: 'block',
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 1.8,
            color: 'var(--accent2)',
            whiteSpace: 'nowrap',
          }}
        >
          SYNCFORGE
        </span>
        <span
          style={{
            fontFamily: 'Share Tech Mono, monospace',
            fontSize: 10,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
          }}
        >
          v3.0
        </span>
      </div>

      {/* ── BARRA DE FERRAMENTAS PADRONIZADA ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* GRUPO 1: PROJETO & ARQUIVOS LOCAIS */}
        <div className="topbar-group" role="group" aria-label="Projeto e arquivos">
          {onPickWorkspace && (
            <button
              type="button"
              className={`topbar-btn ${workspaceName ? 'topbar-btn-active' : ''}`}
              onClick={onPickWorkspace}
              title={
                workspaceName
                  ? `Pasta do PC conectada: ${workspaceName} (clique para trocar)`
                  : 'Selecionar pasta de trabalho do seu PC'
              }
            >
              <span style={{ fontSize: 12 }}>📁</span>
              <span
                style={{
                  maxWidth: 130,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {workspaceName ? workspaceName : 'Pasta do PC'}
              </span>
            </button>
          )}

          <button
            type="button"
            className="topbar-btn"
            onClick={onNewProject}
            title="Criar novo projeto (limpar timeline atual)"
          >
            <span style={{ fontSize: 12 }}>✨</span>
            <span>Novo</span>
          </button>

          <button
            type="button"
            className="topbar-btn"
            onClick={onLoadProject}
            title={
              hasSavedProject
                ? `Restaurar projeto salvo em: ${savedTimestamp || 'sessão anterior'}`
                : 'Nenhum projeto salvo manualmente no navegador'
            }
          >
            <span style={{ fontSize: 12 }}>📂</span>
            <span>Carregar</span>
            {hasSavedProject && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isLight ? '#0284c7' : 'var(--accent2)',
                  display: 'inline-block',
                }}
              />
            )}
          </button>

          <button
            type="button"
            className="topbar-btn"
            onClick={onSaveProject}
            title="Salvar estado atual do projeto no navegador"
          >
            <span style={{ fontSize: 12 }}>💾</span>
            <span>Salvar</span>
          </button>
        </div>

        <div className="topbar-divider" aria-hidden="true" />

        {/* GRUPO 2: MOTOR GPU & PRODUÇÃO */}
        <div className="topbar-group" role="group" aria-label="Motor GPU e exportação">
          {onOpenMotorConfig && (
            <button
              type="button"
              className={`topbar-btn ${motorOnline ? 'topbar-btn-motor-online' : 'topbar-btn-motor-offline'}`}
              onClick={onOpenMotorConfig}
              title={
                motorOnline
                  ? `${motorStatus.label}. Clique para configurar o túnel ngrok.`
                  : 'Motor Colab desconectado. Clique para conectar a URL do ngrok.'
              }
            >
              <span
                className={`status-dot ${motorOnline ? 'online' : 'offline'}`}
                style={{
                  width: 7,
                  height: 7,
                  background: motorOnline
                    ? isLight
                      ? '#16a34a'
                      : '#22c55e'
                    : isLight
                    ? '#dc2626'
                    : '#ef4444',
                }}
              />
              <span>{motorOnline ? `GPU ${motorGpu ? `(${motorGpu})` : 'Online'}` : 'Conectar Motor'}</span>
            </button>
          )}

          <button
            type="button"
            className="topbar-btn topbar-btn-gold"
            onClick={onOpenAi}
            title="Enviar áudio, roteiro e mídias para sincronização automática no Motor de Dobra"
          >
            <span>✦</span>
            <span>Enviar ao Motor</span>
          </button>

          <button
            type="button"
            className="topbar-btn topbar-btn-primary"
            onClick={onOpenExport}
            title="Exportar vídeo MP4 (Colab GPU ou navegador) ou arquivo JSON"
          >
            <span>⬇</span>
            <span>Exportar</span>
          </button>
        </div>

        <div className="topbar-divider" aria-hidden="true" />

        {/* GRUPO 3: UTILITÁRIOS & PREFERÊNCIAS */}
        <div className="topbar-group" role="group" aria-label="Utilitários e tema" style={{ position: 'relative' }} ref={shortcutsRef}>
          <button
            type="button"
            className={`topbar-btn ${showShortcuts ? 'topbar-btn-active' : ''}`}
            onClick={() => setShowShortcuts((prev) => !prev)}
            title="Ver atalhos de teclado do editor"
          >
            <span style={{ fontSize: 12 }}>⌨️</span>
            <span>Atalhos</span>
          </button>

          <button
            type="button"
            className="topbar-btn topbar-btn-icon"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
            aria-label="Alternar tema Claro/Escuro"
          >
            <span style={{ fontSize: 13 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>

          {/* Popover de Atalhos de Teclado */}
          {showShortcuts && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 290,
                background: isLight ? '#ffffff' : '#0b1324',
                border: `1px solid ${isLight ? '#cbd5e1' : 'var(--border)'}`,
                borderRadius: 6,
                padding: '10px 12px',
                boxShadow: isLight
                  ? '0 10px 25px rgba(15, 23, 42, 0.14)'
                  : '0 10px 28px rgba(0, 0, 0, 0.65)',
                zIndex: 250,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${isLight ? '#e2e8f0' : 'var(--border)'}`,
                }}
              >
                <span
                  style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: isLight ? '#0284c7' : 'var(--accent2)',
                  }}
                >
                  ⌨️ Atalhos de Teclado
                </span>
                <button
                  type="button"
                  onClick={() => setShowShortcuts(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isLight ? '#64748b' : 'var(--muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SHORTCUTS_LIST.map((item) => (
                  <div
                    key={item.keys}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      gap: 8,
                    }}
                  >
                    <span style={{ color: isLight ? '#334155' : 'var(--text)' }}>{item.desc}</span>
                    <kbd
                      style={{
                        fontFamily: 'Share Tech Mono, monospace',
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 3,
                        background: isLight ? '#f1f5f9' : '#131f38',
                        border: `1px solid ${isLight ? '#cbd5e1' : '#25395c'}`,
                        color: isLight ? '#0f172a' : 'var(--accent2)',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

