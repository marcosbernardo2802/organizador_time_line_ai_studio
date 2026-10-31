import React, { useRef, useEffect, useCallback } from 'react';
import { WaveformEstado } from '../../utils/waveform';

interface WaveformProps {
  picos?: Uint8Array;
  picosPorSegundo?: number;
  estado: WaveformEstado;
  bytes?: number;
  clipLeftPx: number;
  clipWidthPx: number;
  offsetSeg: number;
  pxPorSeg: number;
  selecionado: boolean;
  onGerarManual: () => void;
}

export const Waveform: React.FC<WaveformProps> = ({
  picos,
  picosPorSegundo,
  estado,
  bytes,
  clipLeftPx,
  clipWidthPx,
  offsetSeg,
  pxPorSeg,
  selecionado,
  onGerarManual,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Desenha a forma de onda posicionando o Canvas diretamente no DOM (zero setState / sem re-renders do React)
  const desenhar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!containerRef.current) {
      containerRef.current = canvas.closest('[data-timeline-scroll]') as HTMLElement | null;
    }
    const container = containerRef.current;

    const scrollLeft = container ? container.scrollLeft : 0;
    const clientWidth = container ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 800);

    // Margem de antecipação de 200px para suavizar a rolagem horizontal
    const visIni = Math.max(0, scrollLeft - clipLeftPx - 200);
    const visFim = Math.min(clipWidthPx, scrollLeft + clientWidth - clipLeftPx + 200);
    const larguraCSS = Math.max(0, visFim - visIni);
    const alturaCSS = canvas.clientHeight || 28;

    // Atualiza posição e largura CSS do Canvas diretamente para evitar loops de render do React
    canvas.style.left = `${visIni}px`;
    canvas.style.width = `${larguraCSS}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (larguraCSS <= 0 || visIni >= clipWidthPx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    // Limite rígido de 4096 px para evitar sobrecarga de memória na GPU/buffer do Canvas
    const canvasW = Math.min(4096, Math.max(1, Math.round(larguraCSS * dpr)));
    const canvasH = Math.max(1, Math.round(alturaCSS * dpr));

    if (canvas.width !== canvasW) canvas.width = canvasW;
    if (canvas.height !== canvasH) canvas.height = canvasH;

    ctx.clearRect(0, 0, canvasW, canvasH);

    // Linha sutil para estados não finalizados (verificando, gerando ou falha)
    if (estado !== 'pronta' || !picos || !picosPorSegundo || picos.length === 0) {
      ctx.fillStyle = selecionado ? 'rgba(0, 200, 117, 0.4)' : 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(0, Math.floor(canvasH / 2), canvasW, 1);
      return;
    }

    // Desenho determinístico coluna por coluna da forma de onda
    ctx.fillStyle = selecionado ? '#00c875' : 'rgba(0, 200, 117, 0.85)';
    ctx.globalAlpha = 0.55;

    const pxSeg = Math.max(1, pxPorSeg);

    for (let x = 0; x < canvasW; x++) {
      // Tempo de áudio correspondente a esta coluna
      const clipX1 = visIni + (x / canvasW) * larguraCSS;
      const clipX2 = visIni + ((x + 1) / canvasW) * larguraCSS;

      const tIni = offsetSeg + clipX1 / pxSeg;
      const tFim = offsetSeg + clipX2 / pxSeg;

      const idxIni = Math.max(0, Math.floor(tIni * picosPorSegundo));
      const idxFim = Math.min(picos.length, Math.ceil(tFim * picosPorSegundo));

      let maxPico = 0;
      if (idxFim > idxIni) {
        for (let i = idxIni; i < idxFim; i++) {
          if (picos[i] > maxPico) maxPico = picos[i];
        }
      } else if (idxIni < picos.length) {
        maxPico = picos[idxIni];
      }

      if (maxPico > 0) {
        const hBar = Math.max(1, (maxPico / 255) * canvasH * 0.9);
        const yBar = (canvasH - hBar) / 2;
        ctx.fillRect(x, yBar, 1, hBar);
      }
    }
  }, [clipLeftPx, clipWidthPx, offsetSeg, pxPorSeg, estado, picos, picosPorSegundo, selecionado]);

  // Efeito de escuta de rolagem da timeline agrupado por requestAnimationFrame
  useEffect(() => {
    desenhar();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.closest('[data-timeline-scroll]') as HTMLElement | null;
    containerRef.current = container;
    if (!container) return;

    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(desenhar);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [desenhar]);

  const tamanhoMb = bytes ? (bytes / (1024 * 1024)).toFixed(1) : '?';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Canvas virtualizado ocupando apenas o trecho visível do clip */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: Math.min(clipWidthPx, 400),
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Botão para arquivos grandes fixado no início visível com CSS sticky (zero custo de render) */}
      {estado === 'manual' && (
        <div
          style={{
            position: 'sticky',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
            zIndex: 10,
            width: 'fit-content',
          }}
        >
          <button
            type="button"
            title={`Arquivo de áudio grande (${tamanhoMb} MB). Pode exigir memória para decodificar.`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const confirma = window.confirm(
                `Este arquivo de áudio possui ${tamanhoMb} MB. Deseja decodificar a forma de onda mesmo assim?`
              );
              if (confirma) {
                onGerarManual();
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 3,
              background: 'rgba(0, 0, 0, 0.75)',
              border: '1px solid rgba(0, 200, 117, 0.6)',
              color: '#00c875',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span>〰 Gerar onda</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>({tamanhoMb}MB)</span>
          </button>
        </div>
      )}
    </div>
  );
};
