import React from 'react';
import { ClipItem } from '../../types';
import { TRANSITION_OPTIONS } from '../../constants';

interface TransitionsTabProps {
  selectedClip: ClipItem;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos: (updates: Partial<ClipItem>) => void;
  onApplyTransitionCycle: () => void;
}

export const TransitionsTab: React.FC<TransitionsTabProps> = ({
  selectedClip,
  onUpdateClip,
  onApplyToAllVideos,
  onApplyTransitionCycle,
}) => {
  if (selectedClip.trackId !== 'video-1') {
    return <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>Transições apenas aplicáveis em vídeo.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>TRANSIÇÃO DE ENTRADA</label>
      <select
        className="editor-select"
        value={selectedClip.transition || 'none'}
        onChange={(e) => onUpdateClip({ transition: e.target.value })}
      >
        {TRANSITION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {selectedClip.transition && selectedClip.transition !== 'none' && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>DURAÇÃO DA TRANSIÇÃO</span>
            <span className="mono">{selectedClip.transitionDuration ?? 0.8}s</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent2)' }}
            value={selectedClip.transitionDuration ?? 0.8}
            onChange={(e) => onUpdateClip({ transitionDuration: parseFloat(e.target.value) })}
          />
        </div>
      )}

      <button
        className="btn btn-ghost"
        style={{ fontSize: 11, marginTop: 8, justifyContent: 'center' }}
        onClick={() =>
          onApplyToAllVideos({
            transition: selectedClip.transition,
            transitionDuration: selectedClip.transitionDuration ?? 0.8,
          })
        }
      >
        ✦ Aplicar a todos
      </button>
      <button
        className="btn btn-gold"
        style={{ fontSize: 11, justifyContent: 'center' }}
        onClick={onApplyTransitionCycle}
      >
        Sequência automática
      </button>
    </div>
  );
};
