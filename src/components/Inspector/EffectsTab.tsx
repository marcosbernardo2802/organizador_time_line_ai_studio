import React from 'react';
import { ClipItem } from '../../types';
import { EFFECT_OPTIONS } from '../../constants';

interface EffectsTabProps {
  selectedClip: ClipItem;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos: (updates: Partial<ClipItem>) => void;
}

export const EffectsTab: React.FC<EffectsTabProps> = ({
  selectedClip,
  onUpdateClip,
  onApplyToAllVideos,
}) => {
  if (selectedClip.trackId !== 'video-1') {
    return <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center' }}>Opção não disponível para áudio.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>EFEITO DE CÂMARA</label>
      <select
        className="editor-select"
        value={selectedClip.effect || 'none'}
        onChange={(e) => onUpdateClip({ effect: e.target.value })}
      >
        {EFFECT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 11, marginTop: 8, justifyContent: 'center' }}
        onClick={() => onApplyToAllVideos({ effect: selectedClip.effect })}
      >
        ✦ Aplicar a todos
      </button>
    </div>
  );
};
