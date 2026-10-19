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
      console.warn('Erro ao executar callback antes de abrir janela flutuante:', e);
    }
  }

  // Dimensões ideais para o editor de vídeo (proporcional à tela do usuário)
  const screenW = window.screen.availWidth || window.innerWidth;
  const screenH = window.screen.availHeight || window.innerHeight;
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

  const popupName = 'CronicasEstelaresFloatingWin';
  
  // Tenta abrir como janela popup flutuante
  const win = window.open(window.location.href, popupName, features);

  if (win) {
    try {
      win.focus();
    } catch {}
  } else {
    // Se o navegador bloquear popups com dimensões personalizadas, abre em nova aba
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  }
};

export const AUTH_CHANNEL_KEY = 'cronicas_drive_auth_sync';
