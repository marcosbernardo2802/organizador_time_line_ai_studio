import React, { useState } from 'react';
import { CLIENT_ID } from '../../constants';

interface GoogleOAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClientId: string;
  onSaveClientId: (newId: string) => void;
  onManualToken: (token: string) => Promise<void>;
  onRetryAuth: () => void;
}

export const GoogleOAuthModal: React.FC<GoogleOAuthModalProps> = ({
  isOpen,
  onClose,
  currentClientId,
  onSaveClientId,
  onManualToken,
  onRetryAuth,
}) => {
  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [tempClientId, setTempClientId] = useState(currentClientId);
  const [manualToken, setManualToken] = useState('');
  const [isApplyingToken, setIsApplyingToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const handleCopyOrigin = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  const handleSaveId = () => {
    onSaveClientId(tempClientId.trim());
    alert('ID do Cliente atualizado com sucesso!');
  };

  const handleResetId = () => {
    setTempClientId(CLIENT_ID);
    onSaveClientId(CLIENT_ID);
  };

  const handleApplyManualToken = async () => {
    if (!manualToken.trim()) return;
    setIsApplyingToken(true);
    setTokenMsg(null);
    try {
      await onManualToken(manualToken.trim());
      setTokenMsg({ text: '✅ Token aplicado com sucesso! Google Drive conectado.' });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (e: any) {
      setTokenMsg({ text: `❌ Token inválido ou sem permissão: ${e.message}`, error: true });
    } finally {
      setIsApplyingToken(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface, #1e1e24)',
          color: 'var(--text, #eee)',
          border: '1px solid var(--border, #333)',
          borderRadius: 10,
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛠️</span> Resolução: Erro 400 (origin_mismatch) & Configuração Google OAuth
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ fontSize: 18, lineHeight: 1, padding: '4px 8px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* EXPLICAÇÃO DO ERRO */}
        <div
          style={{
            background: 'rgba(234, 67, 53, 0.12)',
            border: '1px solid rgba(234, 67, 53, 0.4)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: '#ff6b6b' }}>Por que o erro aconteceu?</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary, #ccc)' }}>
            O Google OAuth 2.0 exige, por motivos de segurança, que <strong>todas as URLs de onde o app é executado</strong> sejam
            previamente cadastradas em <strong>"Origens JavaScript autorizadas"</strong> no Google Cloud Console.
            Como esta URL de visualização (ou do seu portal) ainda não consta na lista do Client ID, o Google recusa a autorização com o código <code>origin_mismatch</code>.
          </p>
        </div>

        {/* PASSO 1: COPIAR ORIGEM */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--accent, #4dabf7)' }}>
            1. Sua Origem JavaScript Atual (Copie abaixo):
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={currentOrigin}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-card, #141418)',
                border: '1px solid var(--border, #444)',
                borderRadius: 6,
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            />
            <button
              onClick={handleCopyOrigin}
              className="btn"
              style={{
                padding: '8px 16px',
                background: copiedOrigin ? '#2b8a3e' : 'var(--accent, #3b82f6)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {copiedOrigin ? '✓ Copiado!' : '📋 Copiar Origem'}
            </button>
          </div>
          <small style={{ display: 'block', marginTop: 6, color: 'var(--muted, #888)' }}>
            Importante: Cole a URL exatamente assim (com <code>https://</code> e sem barra <code>/</code> no final).
          </small>
        </div>

        {/* PASSO 2: GUIA PASSO A PASSO NO GOOGLE CLOUD */}
        <div
          style={{
            background: 'var(--bg-card, #141418)',
            border: '1px solid var(--border, #333)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 0, marginBottom: 10, color: '#f59f00' }}>
            2. Como cadastrar no Google Cloud Console (Passo a Passo):
          </h3>
          <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-secondary, #ddd)' }}>
            <li style={{ marginBottom: 6 }}>
              Acesse o{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 600 }}
              >
                Google Cloud Console &rarr; Credenciais
              </a>
              .
            </li>
            <li style={{ marginBottom: 6 }}>
              Localize o seu <strong>ID do cliente OAuth 2.0</strong> (tipo <em>Aplicativo da Web</em>) correspondente ao projeto.
            </li>
            <li style={{ marginBottom: 6 }}>
              Na seção <strong>"Origens JavaScript autorizadas"</strong> (Authorized JavaScript origins), clique em <strong>+ ADICIONAR URI</strong>.
            </li>
            <li style={{ marginBottom: 6 }}>
              Cole a origem que você copiou acima: <code style={{ color: '#4dabf7' }}>{currentOrigin}</code>
            </li>
            <li style={{ marginBottom: 6 }}>
              <em>(Recomendado)</em> Se você for incorporar o app no seu portal futuramente, adicione também o domínio do portal (ex: <code>https://seusite.com</code>).
            </li>
            <li>
              Clique no botão azul <strong>SALVAR</strong>.
              <div style={{ marginTop: 4, color: '#e0a96d', fontSize: 12 }}>
                ⏳ <strong>Atenção:</strong> Os servidores do Google costumam demorar entre <strong>2 a 5 minutos</strong> para propagar a nova origem autorizada.
              </div>
            </li>
          </ol>
        </div>

        {/* PASSO 3: PERSONALIZAR OU TROCAR CLIENT ID */}
        <div
          style={{
            background: 'var(--bg-card, #141418)',
            border: '1px solid var(--border, #333)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              3. ID do Cliente OAuth 2.0 (Google Client ID):
            </h3>
            {tempClientId !== CLIENT_ID && (
              <button
                onClick={handleResetId}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted, #888)',
                  cursor: 'pointer',
                  fontSize: 12,
                  textDecoration: 'underline',
                }}
              >
                Restaurar Padrão
              </button>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted, #888)', margin: '0 0 8px' }}>
            Caso tenha criado um Client ID novo no seu próprio Google Cloud, insira-o aqui:
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={tempClientId}
              onChange={(e) => setTempClientId(e.target.value)}
              placeholder="ex: 825962387496-...apps.googleusercontent.com"
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-surface, #1e1e24)',
                border: '1px solid var(--border, #444)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={handleSaveId}
              className="btn btn-primary"
              style={{
                padding: '8px 16px',
                background: 'var(--accent, #3b82f6)',
                color: '#fff',
                borderRadius: 6,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Salvar ID
            </button>
          </div>
        </div>

        {/* OPÇÃO ALTERNATIVA: TOKEN MANUAL */}
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px dashed var(--border, #444)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px', color: 'var(--accent, #4dabf7)' }}>
            ⚡ Alternativa Instantânea: Inserir Token de Acesso Manual
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary, #bbb)', margin: '0 0 10px' }}>
            Não quer esperar a propagação do Google Cloud ou quer testar agora? Você pode gerar um Access Token no{' '}
            <a
              href="https://developers.google.com/oauthplayground/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#60a5fa', textDecoration: 'underline' }}
            >
              Google OAuth 2.0 Playground
            </a>{' '}
            (selecionando escopo <code>https://www.googleapis.com/auth/drive</code>) e colá-lo aqui:
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="Cole seu Bearer Access Token aqui (ya29....)"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-surface, #1e1e24)',
                border: '1px solid var(--border, #444)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            />
            <button
              onClick={handleApplyManualToken}
              disabled={isApplyingToken || !manualToken.trim()}
              className="btn"
              style={{
                padding: '8px 16px',
                background: isApplyingToken ? '#555' : '#22c55e',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 6,
                border: 'none',
                cursor: manualToken.trim() ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              {isApplyingToken ? 'Conectando...' : 'Conectar via Token'}
            </button>
          </div>
          {tokenMsg && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: tokenMsg.error ? '#ff6b6b' : '#51cf66',
                fontWeight: 600,
              }}
            >
              {tokenMsg.text}
            </div>
          )}
        </div>

        {/* BOTÕES INFERIORES */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              border: '1px solid var(--border, #444)',
            }}
          >
            Fechar
          </button>
          <button
            onClick={() => {
              onClose();
              onRetryAuth();
            }}
            className="btn btn-primary"
            style={{
              padding: '8px 18px',
              background: 'var(--accent, #3b82f6)',
              color: '#fff',
              borderRadius: 6,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔄 Tentar Fazer Login Novamente
          </button>
        </div>
      </div>
    </div>
  );
};
