import React, { useState, useEffect } from 'react';
import { motorApi, MotorStatusInfo } from '../../services/motorApi';

interface MotorNgrokModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (info: MotorStatusInfo) => void;
  theme?: string;
}

export const MotorNgrokModal: React.FC<MotorNgrokModalProps> = ({
  isOpen,
  onClose,
  onConnected,
  theme = 'dark',
}) => {
  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [statusInfo, setStatusInfo] = useState<MotorStatusInfo | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const saved = motorApi.getUrl();
      setUrl(saved);
      if (saved) {
        testUrl(saved);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const normalize = (u: string) => {
    let clean = u.trim().replace(/\/+$/, '');
    if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && clean.startsWith('http://') && !clean.includes('localhost')) {
      clean = clean.replace(/^http:\/\//i, 'https://');
    }
    return clean;
  };

  const testUrl = async (urlToTest: string) => {
    const clean = normalize(urlToTest);
    setUrl(clean);
    setTesting(true);
    setStatusInfo(null);
    try {
      const res = await motorApi.testConnection(clean);
      setStatusInfo(res);
      if (res.online && onConnected) {
        onConnected(res);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const clean = normalize(url);
    setUrl(clean);
    motorApi.setUrl(clean);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 700);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: isLight ? 'rgba(15, 23, 42, 0.5)' : 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: isLight ? '#ffffff' : '#0d131f',
          border: isLight ? '1px solid #cbd5e1' : '1px solid #1f293d',
          boxShadow: isLight ? '0 10px 25px rgba(0, 0, 0, 0.15)' : '0 0 35px rgba(0, 240, 255, 0.15)',
          borderRadius: 14,
          width: '100%',
          maxWidth: 580,
          padding: 24,
          color: isLight ? '#0f172a' : '#e2e8f0',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: isLight ? '#0284c7' : '#00f0ff', letterSpacing: '0.5px' }}>
                Conectar Motor de Dobra 4.2 (Colab GPU)
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: isLight ? '#475569' : '#8899aa', fontWeight: isLight ? 500 : 400 }}>
                Conexão direta via túnel ngrok • Processamento em tempo real na GPU
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLight ? '#64748b' : '#8899aa',
              fontSize: 20,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Input da URL */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: isLight ? '#334155' : '#94a3b8', marginBottom: 6 }}>
            URL Pública gerada no Google Colab (ngrok):
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="https://xxxx-xx-xx-xx.ngrok-free.app"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{
                flex: 1,
                background: isLight ? '#f8fafc' : '#070a10',
                border: isLight ? '1px solid #94a3b8' : '1px solid #334155',
                borderRadius: 8,
                padding: '10px 12px',
                color: isLight ? '#0369a1' : '#38bdf8',
                fontWeight: isLight ? 600 : 400,
                fontSize: 13,
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <button
              onClick={() => testUrl(url)}
              disabled={testing || !url.trim()}
              style={{
                background: isLight ? '#ffffff' : '#1e293b',
                color: isLight ? '#0284c7' : '#38bdf8',
                border: isLight ? '1px solid #0284c7' : '1px solid #38bdf8',
                borderRadius: 8,
                padding: '0 16px',
                fontSize: 13,
                fontWeight: 700,
                cursor: testing || !url.trim() ? 'not-allowed' : 'pointer',
                opacity: testing || !url.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.05)' : undefined,
              }}
            >
              {testing ? 'Testando...' : '🔍 Testar'}
            </button>
          </div>
        </div>

        {/* Status da Conexão */}
        {statusInfo && (
          <div
            style={{
              background: statusInfo.online
                ? (isLight ? '#f0fdf4' : 'rgba(34, 197, 94, 0.1)')
                : (isLight ? '#fef2f2' : 'rgba(239, 68, 68, 0.1)'),
              border: `1px solid ${statusInfo.online ? (isLight ? '#86efac' : '#22c55e') : (isLight ? '#fca5a5' : '#ef4444')}`,
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 18,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: statusInfo.online
                    ? (isLight ? '#16a34a' : '#22c55e')
                    : (isLight ? '#dc2626' : '#ef4444'),
                  boxShadow: statusInfo.online ? (isLight ? '0 0 4px #16a34a' : '0 0 8px #22c55e') : 'none',
                }}
              />
              <strong style={{ color: statusInfo.online ? (isLight ? '#166534' : '#22c55e') : (isLight ? '#991b1b' : '#ef4444') }}>
                {statusInfo.online ? 'Motor Online e Pronto!' : 'Falha ao Conectar'}
              </strong>
            </div>

            {statusInfo.online ? (
              <div style={{ fontSize: 12, color: isLight ? '#1e293b' : '#cbd5e1', marginTop: 4, display: 'flex', gap: 16, fontWeight: isLight ? 500 : 400 }}>
                <div>🚀 <strong>GPU:</strong> {statusInfo.gpu}</div>
                <div>🧠 <strong>Whisper:</strong> {statusInfo.whisper_model}</div>
                <div>⚡ <strong>Modo:</strong> Direto (sem Drive)</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: isLight ? '#7f1d1d' : '#fca5a5', marginTop: 4, fontWeight: isLight ? 500 : 400, lineHeight: 1.4 }}>
                {statusInfo.error}
              </div>
            )}
          </div>
        )}

        {/* Instruções Rápidas */}
        <div
          style={{
            background: isLight ? '#f8fafc' : '#090e18',
            border: isLight ? '1px dashed #cbd5e1' : '1px dashed #223049',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: isLight ? '#334155' : '#829ab1',
            lineHeight: 1.5,
            marginBottom: 20,
          }}
        >
          <strong style={{ color: isLight ? '#0284c7' : '#00f0ff' }}>💡 Como obter o link:</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>No seu Google Colab, execute a célula do <code>motor_de_dobra_ngrok.py</code>.</li>
            <li>Clique no botão <strong>"Copiar URL"</strong> que aparece no card do Colab.</li>
            <li>Cole a URL no campo acima e clique em <strong>Salvar Conexão</strong>.</li>
          </ol>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              background: isLight ? '#ffffff' : '#1a2233',
              border: isLight ? '1px solid #cbd5e1' : '1px solid #334155',
              color: isLight ? '#334155' : '#94a3b8',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: isLight ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!url.trim()}
            style={{
              background: saveSuccess
                ? (isLight ? '#16a34a' : '#22c55e')
                : (isLight ? '#0284c7' : '#00f0ff'),
              border: 'none',
              color: '#ffffff',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 700,
              cursor: !url.trim() ? 'not-allowed' : 'pointer',
              opacity: !url.trim() ? 0.5 : 1,
              transition: 'all 0.2s ease',
              boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
            }}
          >
            {saveSuccess ? '✅ Salvo!' : 'Salvar Conexão'}
          </button>
        </div>
      </div>
    </div>
  );
};
