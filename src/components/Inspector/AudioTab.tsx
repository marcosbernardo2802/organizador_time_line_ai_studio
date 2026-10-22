import React from 'react';
import { ClipItem } from '../../types';

interface AudioTabProps {
  selectedClip: ClipItem;
  clipVolume: number;
  duckingEnabled: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleDucking: () => void;
  onUpdateClip: (updates: Partial<ClipItem>) => void;
  onApplyToAllVideos?: (updates: Partial<ClipItem>) => void;
}

export const AudioTab: React.FC<AudioTabProps> = ({
  selectedClip,
  clipVolume,
  duckingEnabled,
  onVolumeChange,
  onToggleDucking,
  onUpdateClip,
  onApplyToAllVideos,
}) => {
  const currentVol = typeof selectedClip.volume === 'number' ? selectedClip.volume : 0;
  const isMuted = currentVol <= 0.001;

  const setPresetVolume = (v: number) => {
    onUpdateClip({ volume: v });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── CONTROLE INDIVIDUAL DE VOLUME DO CLIPE ── */}
      <div style={{ background: 'var(--bg)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: 11, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 4 }}>
          <span>🔊 SOM DESTE VÍDEO</span>
          <span className="mono" style={{ color: isMuted ? 'var(--muted)' : 'var(--accent2)' }}>
            {isMuted ? 'MUDO (0%)' : `${Math.round(currentVol * 100)}%`}
          </span>
        </label>
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 10px 0' }}>
          Define o volume do som original gravado neste clipe de vídeo sob a voz da narração.
        </p>

        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          style={{ width: '100%', accentColor: 'var(--accent2)' }}
          value={currentVol}
          onChange={(e) => onUpdateClip({ volume: parseFloat(e.target.value) })}
        />

        {/* Presets rápidos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 10 }}>
          <button
            type="button"
            className={`btn ${isMuted ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 9, padding: '4px 2px' }}
            onClick={() => setPresetVolume(0)}
            title="Desativa completamente o som deste vídeo"
          >
            Mudo
          </button>
          <button
            type="button"
            className={`btn ${Math.abs(currentVol - 0.15) < 0.03 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 9, padding: '4px 2px' }}
            onClick={() => setPresetVolume(0.15)}
            title="15% - Som ambiente muito suave"
          >
            15% Suave
          </button>
          <button
            type="button"
            className={`btn ${Math.abs(currentVol - 0.35) < 0.03 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 9, padding: '4px 2px' }}
            onClick={() => setPresetVolume(0.35)}
            title="35% - Som ambiente médio"
          >
            35% Médio
          </button>
          <button
            type="button"
            className={`btn ${Math.abs(currentVol - 0.8) < 0.03 ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 9, padding: '4px 2px' }}
            onClick={() => setPresetVolume(0.8)}
            title="80% - Volume alto destacado"
          >
            80% Alto
          </button>
        </div>

        {onApplyToAllVideos && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 10, fontSize: 10, padding: '6px 8px' }}
            onClick={() => onApplyToAllVideos({ volume: currentVol })}
          >
            🔗 Aplicar este volume a todos os vídeos
          </button>
        )}
      </div>

      {/* ── VOLUME GLOBAL DA FAIXA ── */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>VOLUME GERAL DA FAIXA</span>
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
