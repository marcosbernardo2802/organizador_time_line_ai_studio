/**
 * @file notify.ts
 * Utilitários de notificações sonoras e do navegador para o editor.
 */

/**
 * Toca o som de conclusão (sequência de 3 bipes com AudioContext)
 * sem dependência de APIs externas ou de notificações de sistema.
 */
export const tocaSomConclusao = (): void => {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 150, 300].forEach((delay, i) => {
      setTimeout(() => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = [880, 1100, 1320][i];
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch {}
      }, delay);
    });
  } catch {}
};

/**
 * Solicita permissão para notificações do navegador se a permissão atual for 'default'.
 * Deve ser disparada em resposta a uma ação direta do usuário. Nunca lança erro.
 */
export const pedePermissaoNotificacao = (): void => {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch {}
};

/**
 * Envia uma notificação do sistema caso a aba esteja em segundo plano (document.hidden).
 * Ao clicar na notificação, foca a janela e a fecha.
 */
export const notificaConclusao = (titulo: string, corpo: string): void => {
  try {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.hidden
    ) {
      const notif = new Notification(titulo, {
        body: corpo,
      });
      notif.onclick = () => {
        try {
          window.focus();
        } catch {}
        try {
          notif.close();
        } catch {}
      };
    }
  } catch {}
};
