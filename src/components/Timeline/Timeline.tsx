import React from 'react';
import { ClipItem, MediaItem, Track, FormatoRender, QualidadeRender, FpsOpcao } from '../../types';
import { PPS } from '../../constants';
import { TimelineControls } from './TimelineControls';
import { TimelineClip } from './TimelineClip';

interface TimelineProps {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  tracks: Track[];
  clips: ClipItem[];
  library: MediaItem[];
  selectedId: string | null;
  duration: number;
  currentTime: number;
  zoom: number;
  theme: string;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
  snapOn: boolean;
  showWaveform: boolean;
  onToggleWaveform: () => void;
  formato: FormatoRender;
  onChangeFormato: (f: FormatoRender) => void;
  fps: FpsOpcao;
  onChangeFps: (fps: FpsOpcao) => void;
  qualidade: QualidadeRender;
  onChangeQualidade: (q: QualidadeRender) => void;
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
  onTimelineClick: (e: React.MouseEvent) => void;
  onTimelineDrop: (e: React.DragEvent) => void;
  onClipMouseDown: (e: React.MouseEvent, clipId: string, type: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  timelineRef,
  tracks,
  clips,
  library,
  selectedId,
  duration,
  currentTime,
  zoom,
  theme,
  canUndo,
  canRedo,
  isPlaying,
  snapOn,
  showWaveform,
  onToggleWaveform,
  formato,
  onChangeFormato,
  fps,
  onChangeFps,
  qualidade,
  onChangeQualidade,
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
  onTimelineClick,
  onTimelineDrop,
  onClipMouseDown,
}) => {
  // Mapa de mídias para busca O(1) sem percorrer a biblioteca inteira para cada clip
  const libraryMap = React.useMemo(() => new Map(library.map((m) => [m.id, m])), [library]);

  return (
    <div
      style={{
        height: 220,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Controles de navegação, histórico, formato/fps/resolução e zoom */}
      <TimelineControls
        canUndo={canUndo}
        canRedo={canRedo}
        isPlaying={isPlaying}
        snapOn={snapOn}
        zoom={zoom}
        theme={theme}
        showWaveform={showWaveform}
        onToggleWaveform={onToggleWaveform}
        hasSelectedClip={Boolean(selectedId)}
        formato={formato}
        onChangeFormato={onChangeFormato}
        fps={fps}
        onChangeFps={onChangeFps}
        qualidade={qualidade}
        onChangeQualidade={onChangeQualidade}
        onUndo={onUndo}
        onRedo={onRedo}
        onStop={onStop}
        onTogglePlay={onTogglePlay}
        onJoinClips={onJoinClips}
        onToggleSnap={onToggleSnap}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
        onToggleFullscreen={onToggleFullscreen}
        onDeleteSelected={onDeleteSelected}
      />

      {/* Trilhas e Área de Edição */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Nomes das Trilhas */}
        <div style={{ width: 150, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
          <div style={{ height: 22, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }} />
          {tracks.map((t) => (
            <div
              key={t.id}
              className="track-row"
              style={{ display: 'flex', alignItems: 'center', paddingLeft: 10, background: t.color }}
            >
              <span style={{ fontFamily: 'Rajdhani', fontSize: 12, letterSpacing: 0.5, color: 'var(--text)', fontWeight: 600 }}>
                {t.name}
              </span>
            </div>
          ))}
        </div>

        {/* Área de Clips da Timeline */}
        <div
          data-timeline-scroll
          style={{ flex: 1, overflowX: 'auto', position: 'relative', userSelect: 'none' }}
          ref={timelineRef}
          onClick={onTimelineClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onTimelineDrop}
        >
          <div style={{ position: 'relative', width: Math.max(duration * PPS * zoom, 1200), height: '100%' }}>
            {/* Régua de tempo */}
            <div
              style={{
                height: 22,
                background: 'var(--bg)',
                borderBottom: '1px solid var(--border)',
                position: 'relative',
              }}
            >
              {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: i * PPS * zoom,
                    height: '100%',
                    borderLeft: '1px solid var(--border)',
                    paddingLeft: 3,
                  }}
                >
                  {i % Math.max(1, Math.round(5 / zoom)) === 0 && (
                    <span className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>
                      {i}s
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Trilhas e Clips */}
            {tracks.map((track) => (
              <div key={track.id} className="track-row" style={{ background: track.color }}>
                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const isSelected = clip.id === selectedId;
                    const isAudio = track.type === 'audio';
                    const clipMedia = libraryMap.get(clip.mediaId);

                    return (
                      <TimelineClip
                        key={clip.id}
                        clip={clip}
                        media={clipMedia}
                        isSelected={isSelected}
                        isAudio={isAudio}
                        zoom={zoom}
                        theme={theme}
                        showWaveform={showWaveform}
                        onClipMouseDown={onClipMouseDown}
                      />
                    );
                  })}
              </div>
            ))}

            {/* Playhead (Agulha de reprodução) */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: currentTime * PPS * zoom,
                width: 1,
                background: 'var(--danger)',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  background: 'var(--danger)',
                  transform: 'translateX(-3.5px) rotate(45deg)',
                  marginTop: 16,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
