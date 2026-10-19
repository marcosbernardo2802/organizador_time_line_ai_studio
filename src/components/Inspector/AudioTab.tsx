import React from 'react';
import { ClipItem } from '../../types';

interface AudioTabProps {
  selectedClip: ClipItem;
  clipVolume: number;
  duckingEnabled: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleDucking: () => void;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
}

export const AudioTab: React.FC<AudioTabProps> = ({
  selectedClip,
  clipVolume,
  duckingEnabled,
  onVolumeChange,
  onToggleDucking,
  onUpdateClip,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>VOLUME GLOBAL</span>
          <span className="mono">{Math.round(clipVolume * 100)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent2)' }}
          value={clipVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>DUCKING DE BGM</span>
          <span className="mono">{duckingEnabled ? 'ON' : 'OFF'}</span>
        </label>
        <button
          className={`btn ${duckingEnabled ? 'btn-primary' : 'btn-ghost'}`}
          style={{ width: '100%', padding: '8px 8px', fontSize: 11 }}
          onClick={onToggleDucking}
        >
          {duckingEnabled ? 'Desativar Ducking' : 'Ativar Ducking'}
        </button>
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>FADE IN (Início)</span>
          <span className="mono">{selectedClip.fadeIn || 0}s</span>
        </label>
        <input
          type="range"
          min="0"
          max="5"
          step="0.5"
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent2)' }}
          value={selectedClip.fadeIn || 0}
          onChange={(e) => onUpdateClip({ fadeIn: parseFloat(e.target.value) })}
        />
      </div>

      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>FADE OUT (Fim)</span>
          <span className="mono">{selectedClip.fadeOut || 0}s</span>
        </label>
        <input
          type="range"
          min="0"
          max="5"
          step="0.5"
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent2)' }}
          value={selectedClip.fadeOut || 0}
          onChange={(e) => onUpdateClip({ fadeOut: parseFloat(e.target.value) })}
        />
      </div>
    </div>
  );
};
