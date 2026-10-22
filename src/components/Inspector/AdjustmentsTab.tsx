import React from 'react';
import { ClipItem } from '../../types';

interface AdjustmentsTabProps {
  selectedClip: ClipItem;
  onUpdateDuration: (newDur: number) => void;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos: (updates: Partial<ClipItem>) => void;
}

export const AdjustmentsTab: React.FC<AdjustmentsTabProps> = ({
  selectedClip,
  onUpdateDuration,
  onUpdateClip,
  onApplyToAllVideos,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {typeof selectedClip.score === 'number' && !isNaN(selectedClip.score) && (() => {
        const scoreVal = selectedClip.score > 1 ? selectedClip.score / 100 : selectedClip.score;
        const scorePct = Math.round(scoreVal * 100);
        const scoreColor = scoreVal >= 0.8 ? '#10b981' : scoreVal >= 0.6 ? '#f59e0b' : '#ef4444';
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 3,
              background: 'var(--bg)',
              border: `1px solid ${scoreColor}40`,
              color: scoreColor,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'Rajdhani, sans-serif',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: scoreColor,
                display: 'inline-block',
                flexShrink: 0,
                boxShadow: `0 0 6px ${scoreColor}`,
              }}
            />
            <span>Confiança do alinhamento: {scorePct}%</span>
          </div>
        );
      })()}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>DURAÇÃO DO CLIP (Segundos)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={Number(selectedClip.duration).toFixed(1)}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val > 0) onUpdateDuration(val);
            }}
            style={{
              width: '60px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              padding: '6px 8px',
              borderRadius: 3,
              fontFamily: 'Share Tech Mono',
              fontSize: 13,
            }}
          />
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', flex: 1, fontSize: 11 }}
            onClick={() => onUpdateDuration(Math.max(0.1, selectedClip.duration - 0.5))}
            title="Diminuir"
          >
            - 0.5s
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', flex: 1, fontSize: 11 }}
            onClick={() => onUpdateDuration(selectedClip.duration + 0.5)}
            title="Aumentar"
          >
            + 0.5s
          </button>
        </div>
      </div>

      {selectedClip.trackId === 'video-1' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>ENQUADRAMENTO DA IMAGEM</label>
          <select
            className="editor-select"
            value={selectedClip.fit || 'contain'}
            onChange={(e) => onUpdateClip({ fit: e.target.value })}
          >
            <option value="contain">Ajustar (Mostra a imagem inteira)</option>
            <option value="cover">Preencher (Corta para cobrir a tela)</option>
          </select>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 11, marginTop: 2, justifyContent: 'center' }}
            onClick={() => onApplyToAllVideos({ fit: selectedClip.fit || 'contain' })}
          >
            ✦ Aplicar a todos
          </button>
        </div>
      )}
    </div>
  );
};
