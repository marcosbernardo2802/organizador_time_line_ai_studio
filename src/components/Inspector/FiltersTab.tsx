import React from 'react';
import { ClipItem } from '../../types';
import { FILTER_OPTIONS } from '../../constants';

interface FiltersTabProps {
  selectedClip: ClipItem;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos: (updates: Partial<ClipItem>) => void;
}

export const FiltersTab: React.FC<FiltersTabProps> = ({
  selectedClip,
  onUpdateClip,
  onApplyToAllVideos,
}) => {
  if (selectedClip.trackId !== 'video-1') {
    return <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>Opção não disponível para áudio.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>FILTRO DE COR</label>
      <select
        className="editor-select"
        value={selectedClip.filter || 'none'}
        onChange={(e) => onUpdateClip({ filter: e.target.value })}
      >
        {FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {selectedClip.filter && selectedClip.filter !== 'none' && (
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>INTENSIDADE</span>
            <span className="mono">{selectedClip.filterIntensity ?? 100}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent2)' }}
            value={selectedClip.filterIntensity ?? 100}
            onChange={(e) => onUpdateClip({ filterIntensity: parseInt(e.target.value, 10) })}
          />
        </div>
      )}

      <button
        className="btn btn-ghost"
        style={{ fontSize: 11, marginTop: 8, justifyContent: 'center' }}
        onClick={() =>
          onApplyToAllVideos({
            filter: selectedClip.filter,
            filterIntensity: selectedClip.filterIntensity ?? 100,
          })
        }
      >
        ✦ Aplicar a todos
      </button>
    </div>
  );
};
