import React from 'react';

interface TimelineControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  snapOn: boolean;
  zoom: number;
  hasSelectedClip: boolean;
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
  hasSelectedClip,
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
      {/* Esquerda: Ferramentas de Histórico */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 14 }}
          disabled={!canUndo}
          onClick={onUndo}
          title="Desfazer (Ctrl+Z)"
        >
          ⟲
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 14 }}
          disabled={!canRedo}
          onClick={onRedo}
          title="Refazer (Ctrl+Y)"
        >
          ⟳
        </button>
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
