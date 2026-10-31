import React from 'react';
import { FormatoRender, QualidadeRender, FpsOpcao } from '../../types';

interface TimelineControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  snapOn: boolean;
  zoom: number;
  showWaveform: boolean;
  onToggleWaveform: () => void;
  hasSelectedClip: boolean;
  formato: FormatoRender;
  onChangeFormato: (f: FormatoRender) => void;
  fps: FpsOpcao;
  onChangeFps: (fps: FpsOpcao) => void;
  qualidade: QualidadeRender;
  onChangeQualidade: (q: QualidadeRender) => void;
  theme?: string;
  onUndo: () => void;
  onRedo: () => void;
  onStop: () => void;
  onTogglePlay: () => void;
  onJoinClips: () => void;
  onToggleSnap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleFullscreen: () => void;
  onDeleteSelected: () => void;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  canUndo,
  canRedo,
  isPlaying,
  snapOn,
  zoom,
  showWaveform,
  onToggleWaveform,
  hasSelectedClip,
  formato,
  onChangeFormato,
  fps,
  onChangeFps,
  qualidade,
  onChangeQualidade,
  theme = 'dark',
  onUndo,
  onRedo,
  onStop,
  onTogglePlay,
  onJoinClips,
  onToggleSnap,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleFullscreen,
  onDeleteSelected,
}) => {
  const isLight = theme === 'light';

  // Estilo com alto contraste para os botões de formato no modo claro
  const getFormatBtnStyle = (fmt: FormatoRender): React.CSSProperties => {
    const isSelected = formato === fmt;
    if (isLight) {
      return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: isSelected ? 700 : 600,
        background: isSelected ? '#ffffff' : 'transparent',
        color: isSelected ? '#0284c7' : '#334155',
        border: isSelected ? '1px solid #0284c7' : '1px solid transparent',
        boxShadow: isSelected ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      };
    }
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 6px',
      fontSize: 11,
      fontFamily: 'monospace',
      fontWeight: isSelected ? 700 : 500,
      background: isSelected ? 'rgba(0, 240, 255, 0.18)' : 'transparent',
      color: isSelected ? '#00f0ff' : 'var(--muted)',
      border: isSelected ? '1px solid #00f0ff' : '1px solid transparent',
      borderRadius: 4,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    };
  };

  // Estilo dos dropdowns com alto contraste no modo claro
  const selectStyle: React.CSSProperties = isLight
    ? {
        height: 25,
        padding: '2px 6px',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 600,
        background: '#ffffff',
        color: '#0f172a',
        border: '1px solid #94a3b8',
        borderRadius: 4,
        cursor: 'pointer',
        outline: 'none',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }
    : {
        height: 25,
        padding: '2px 6px',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 600,
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        cursor: 'pointer',
        outline: 'none',
      };

  return (
    <div
      style={{
        height: 38,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 10px',
        background: 'var(--bg)',
      }}
    >
      {/* Esquerda: Ferramentas de Histórico + Formato, FPS e Resolução */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <button
          className="btn btn-ghost"
          style={{
            padding: '4px 8px',
            fontSize: 14,
            ...(isLight && {
              color: canUndo ? '#0f172a' : '#94a3b8',
              borderColor: canUndo ? '#94a3b8' : '#e2e8f0',
              background: canUndo ? '#ffffff' : '#f8fafc',
            }),
          }}
          disabled={!canUndo}
          onClick={onUndo}
          title="Desfazer (Ctrl+Z)"
        >
          ⟲
        </button>
        <button
          className="btn btn-ghost"
          style={{
            padding: '4px 8px',
            fontSize: 14,
            ...(isLight && {
              color: canRedo ? '#0f172a' : '#94a3b8',
              borderColor: canRedo ? '#94a3b8' : '#e2e8f0',
              background: canRedo ? '#ffffff' : '#f8fafc',
            }),
          }}
          disabled={!canRedo}
          onClick={onRedo}
          title="Refazer (Ctrl+Y)"
        >
          ⟳
        </button>

        {/* Divisor vertical */}
        <div style={{ width: 1, height: 18, background: isLight ? '#cbd5e1' : 'var(--border)', margin: '0 4px' }} />

        {/* 3 Botões de formato de tela (16:9, 9:16, 1:1) com ícones visuais */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: isLight ? '#e2e8f0' : 'rgba(0, 0, 0, 0.25)',
            borderRadius: 5,
            padding: 2,
            border: isLight ? '1px solid #cbd5e1' : '1px solid var(--border)',
            gap: 2,
          }}
          title="Formato de Proporção do Vídeo"
        >
          {/* Botão 16:9 */}
          <button
            type="button"
            onClick={() => onChangeFormato('16:9')}
            title="16:9 Widescreen (Horizontal / YouTube)"
            style={getFormatBtnStyle('16:9')}
          >
            <svg width="14" height="10" viewBox="0 0 16 10" fill="none" style={{ display: 'block' }}>
              <rect
                x="0.75"
                y="0.75"
                width="14.5"
                height="8.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill={formato === '16:9' ? 'currentColor' : 'none'}
                fillOpacity={formato === '16:9' ? (isLight ? 0.2 : 0.35) : 0}
              />
            </svg>
            <span>16:9</span>
          </button>

          {/* Botão 9:16 */}
          <button
            type="button"
            onClick={() => onChangeFormato('9:16')}
            title="9:16 Vertical (Shorts / Reels / TikTok)"
            style={getFormatBtnStyle('9:16')}
          >
            <svg width="10" height="14" viewBox="0 0 10 16" fill="none" style={{ display: 'block' }}>
              <rect
                x="0.75"
                y="0.75"
                width="8.5"
                height="14.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill={formato === '9:16' ? 'currentColor' : 'none'}
                fillOpacity={formato === '9:16' ? (isLight ? 0.2 : 0.35) : 0}
              />
            </svg>
            <span>9:16</span>
          </button>

          {/* Botão 1:1 */}
          <button
            type="button"
            onClick={() => onChangeFormato('1:1')}
            title="1:1 Quadrado (Feed Instagram / Square)"
            style={getFormatBtnStyle('1:1')}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ display: 'block' }}>
              <rect
                x="0.75"
                y="0.75"
                width="10.5"
                height="10.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
                fill={formato === '1:1' ? 'currentColor' : 'none'}
                fillOpacity={formato === '1:1' ? (isLight ? 0.2 : 0.35) : 0}
              />
            </svg>
            <span>1:1</span>
          </button>
        </div>

        {/* Menu Dropdown de FPS */}
        <select
          value={fps}
          onChange={(e) => onChangeFps(Number(e.target.value) as FpsOpcao)}
          title="Taxa de Quadros por Segundo (FPS)"
          style={selectStyle}
        >
          <option value="24" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>24 fps</option>
          <option value="30" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>30 fps</option>
          <option value="60" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>60 fps</option>
        </select>

        {/* Menu Dropdown de Resolução */}
        <select
          value={qualidade}
          onChange={(e) => onChangeQualidade(e.target.value as QualidadeRender)}
          title="Resolução de Saída do Vídeo"
          style={selectStyle}
        >
          <option value="480p" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>480p SD</option>
          <option value="720p" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>720p HD</option>
          <option value="1080p" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>1080p FullHD</option>
          <option value="1440p" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>1440p 2K</option>
          <option value="2160p" style={{ background: isLight ? '#ffffff' : 'var(--surface)', color: isLight ? '#0f172a' : 'var(--text)' }}>2160p 4K</option>
        </select>
      </div>

      {/* Centro: Playback (Play, Pause, Stop) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 8px' }} title="Stop / Início" onClick={onStop}>
          ⏮
        </button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px' }} title="Play / Pause" onClick={onTogglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Direita: Ferramentas de Timeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onJoinClips}
          title="Juntar todas as cenas (Remover espaços vazios na linha de vídeo)"
        >
          &gt;&lt; Juntar
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button
          className={`btn ${snapOn ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onToggleSnap}
          title="Ímã Automático (S)"
        >
          🧲 {snapOn ? 'ON' : 'OFF'}
        </button>
        <button
          className={`btn ${showWaveform ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onToggleWaveform}
          title={
            showWaveform
              ? 'Forma de onda real ativa (clique para alternar para onda leve e acelerar o player)'
              : 'Forma de onda leve ativa (clique para ativar a decodificação da forma de onda real)'
          }
        >
          〰️ {showWaveform ? 'Onda Real' : 'Onda Leve'}
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onZoomOut}
          title="Zoom out (Ctrl+-)"
        >
          −
        </button>
        <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', minWidth: 32, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onZoomIn}
          title="Zoom in (Ctrl++)"
        >
          +
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 6px', fontSize: 10 }}
          onClick={onZoomReset}
          title="Reset zoom"
        >
          ↺
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onToggleFullscreen}
          title="Tela cheia (F)"
        >
          ⛶
        </button>
        <button
          className="btn btn-danger"
          style={{ padding: '4px 8px' }}
          disabled={!hasSelectedClip}
          onClick={onDeleteSelected}
        >
          🗑
        </button>
      </div>
    </div>
  );
};
