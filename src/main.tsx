import { createRoot } from 'react-dom/client';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import App from './App.tsx';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 28, background: '#04060f', color: '#c8d8f0', minHeight: '100vh', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#00d4ff', marginBottom: 12 }}>🚀 Crônicas Estelares — Editor</h2>
          <div style={{ padding: '16px 20px', background: '#080d1a', border: '1px solid #1a2a45', borderRadius: 8, maxWidth: 480, textAlign: 'center', marginBottom: 16 }}>
            <p style={{ color: '#e04040', fontWeight: 600, marginBottom: 8 }}>Ocorreu uma instabilidade ao carregar a interface</p>
            <p style={{ color: '#8aa8c8', fontSize: 13, wordBreak: 'break-word' }}>{this.state.error?.message || 'Erro inesperado'}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 20px', background: '#2d6be4', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
          >
            ⟳ Recarregar Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
