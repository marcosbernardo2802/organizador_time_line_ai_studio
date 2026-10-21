/**
 * @file window.ts
 * Utilitários para detecção de execução em iframe e abertura em janela flutuante/popout,
 * contornando restrições de segurança do Google OAuth 2.0.
 */

export const isInsideIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // Se o acesso a window.top lançar erro de segurança cross-origin, certamente está dentro de iframe
    return true;
  }
};

export const openInFloatingWindow = (onBeforeOpen?: () => void) => {
  if (onBeforeOpen) {
    try {
      onBeforeOpen();
    } catch (e) {
      console.warn('Erro ao executar callback antes de abrir janela:', e);
    }
  }

  // Dimensões ideais para o editor de vídeo em janela popup flutuante
  const screenW = window.screen.availWidth || window.innerWidth || 1280;
  const screenH = window.screen.availHeight || window.innerHeight || 800;
  const targetW = Math.min(1440, Math.max(1024, Math.floor(screenW * 0.95)));
  const targetH = Math.min(920, Math.max(700, Math.floor(screenH * 0.92)));
  const left = Math.max(0, Math.floor((screenW - targetW) / 2));
  const top = Math.max(0, Math.floor((screenH - targetH) / 2));

  const features = [
    `width=${targetW}`,
    `height=${targetH}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  // Garante que o navegador crie uma janela nova e limpe o cache de scripts bloqueados
  const popupName = `CronicasEditor_${Date.now()}`;
  const baseOrigin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
  const targetUrl = `${baseOrigin || window.location.href.split('?')[0]}/?v=${Date.now()}`;

  try {
    const win = window.open(targetUrl, popupName, features);
    if (win) {
      try {
        win.focus();
      } catch {}
      return;
    }
  } catch (e) {
    console.warn('Erro ao abrir popup flutuante com nome único:', e);
  }

  // Fallback caso popups nomeados sejam bloqueados
  try {
    const win = window.open(targetUrl, '_blank', features);
    if (win) {
      try {
        win.focus();
      } catch {}
    }
  } catch (err) {
    console.error('Falha ao abrir janela flutuante:', err);
  }
};

export const AUTH_CHANNEL_KEY = 'cronicas_drive_auth_sync';
